#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  nasOS OTA Update Builder
#  Usage:
#    ./scripts/build-ota.sh               # auto-version (date)
#    ./scripts/build-ota.sh 1.2.3         # explicit version
#    ./scripts/build-ota.sh 1.2.3 --no-electron  # skip Electron
#
#  Output: dist/nasos-update-VERSION.nasos
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Parse args ──────────────────────────────────────────────────
VERSION="${1:-}"
INCLUDE_ELECTRON=true
for arg in "$@"; do
  [[ "$arg" == "--no-electron" ]] && INCLUDE_ELECTRON=false
done
# If first arg is a flag not a version, fall back to date
if [[ -z "$VERSION" || "$VERSION" == --* ]]; then
  VERSION="$(date +%m%d%Y-%H%M%S)"
fi

DIST_DIR="$PROJECT_ROOT/dist"
PACKAGE_NAME="nasos-update-${VERSION}.nasos"
PACKAGE_PATH="$DIST_DIR/$PACKAGE_NAME"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

# ── Colours ─────────────────────────────────────────────────────
info()    { echo "  [·] $*"; }
success() { echo "  [✓] $*"; }
warn()    { echo "  [!] $*"; }
error()   { echo "  [✗] $*" >&2; exit 1; }
header()  { echo; echo "━━━  $*  ━━━"; }

header "nasOS OTA Update Builder  •  v$VERSION"

# ── 1. Build frontend ────────────────────────────────────────────
header "Building frontend"
cd "$PROJECT_ROOT/frontend"
if ! command -v node &>/dev/null; then
  error "node not found — install Node.js"
fi
npm install --silent
npm run build
success "Frontend built → frontend/dist/"

# ── 2. Stage files ───────────────────────────────────────────────
header "Staging update package"

mkdir -p "$STAGE_DIR/frontend"
cp -r "$PROJECT_ROOT/frontend/dist/." "$STAGE_DIR/frontend/"
success "Staged: frontend/dist ($(find "$STAGE_DIR/frontend" -type f | wc -l | tr -d ' ') files)"

mkdir -p "$STAGE_DIR/backend"
rsync -a \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '*.egg-info' \
  --exclude '.data' \
  "$PROJECT_ROOT/backend/." "$STAGE_DIR/backend/"
success "Staged: backend/"

mkdir -p "$STAGE_DIR/scripts"
cp "$PROJECT_ROOT/system/scripts/"*.sh "$STAGE_DIR/scripts/"
success "Staged: system/scripts/"

mkdir -p "$STAGE_DIR/systemd"
cp "$PROJECT_ROOT/system/systemd/"*.service "$STAGE_DIR/systemd/"
success "Staged: system/systemd/ ($(ls "$STAGE_DIR/systemd/" | wc -l | tr -d ' ') service files)"

# systemd drop-ins — deployed into /etc/systemd/system/<unit>.d/ on device
# Currently: docker.service.d/nasos-data-partition.conf (moves Docker to data partition)
mkdir -p "$STAGE_DIR/systemd-dropin/docker.service.d"
cat > "$STAGE_DIR/systemd-dropin/docker.service.d/nasos-data-partition.conf" <<'DOCKERDROP'
[Unit]
After=nasos-firstboot.service
DOCKERDROP
success "Staged: systemd-dropin/ (docker data-partition ordering)"

# System config files — deployed to /etc/ on device
# Docker daemon.json: moves data-root to the data partition (/srv/nasos/.docker).
# This frees /var/lib/docker off the root filesystem, which was the largest
# variable-size space consumer causing the root partition to fill up over time.
mkdir -p "$STAGE_DIR/sysconfig/docker"
cat > "$STAGE_DIR/sysconfig/docker/daemon.json" <<'DOCKERCFG'
{
  "data-root": "/srv/nasos/.docker",
  "log-driver": "local",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKERCFG

# journald size cap — prevents logs from eating into OTA/service headroom
mkdir -p "$STAGE_DIR/sysconfig/journald"
cat > "$STAGE_DIR/sysconfig/journald/nasos-size.conf" <<'JOURNALD'
[Journal]
SystemMaxUse=200M
SystemKeepFree=500M
RuntimeMaxUse=50M
JOURNALD
success "Staged: sysconfig/ (docker daemon.json + journald cap)"

if [[ "$INCLUDE_ELECTRON" == true ]]; then
  mkdir -p "$STAGE_DIR/electron"
  rsync -a \
    --exclude 'node_modules' \
    "$PROJECT_ROOT/electron/." "$STAGE_DIR/electron/"
  success "Staged: electron/ (node_modules excluded — reinstalled on device)"
fi

# ── 3. Write manifest ────────────────────────────────────────────
COMPONENTS='["frontend","backend","scripts"'
[[ "$INCLUDE_ELECTRON" == true ]] && COMPONENTS="$COMPONENTS,\"electron\""
COMPONENTS="$COMPONENTS]"

cat > "$STAGE_DIR/manifest.json" <<JSON
{
  "version": "$VERSION",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "components": $COMPONENTS,
  "min_required_version": "0.1.0",
  "requires_restart": true,
  "restart_services": ["nasos-backend"]$(if [[ "$INCLUDE_ELECTRON" == true ]]; then echo ',
  "restart_electron": true'; fi)
}
JSON
success "manifest.json written"

# ── 4. Pack ──────────────────────────────────────────────────────
header "Packing"
mkdir -p "$DIST_DIR"
tar -czf "$PACKAGE_PATH" -C "$STAGE_DIR" .
SIZE="$(du -sh "$PACKAGE_PATH" | cut -f1)"
success "Package: dist/$PACKAGE_NAME  ($SIZE)"

# ── 5. Done ──────────────────────────────────────────────────────
header "Done"
echo
echo "  Upload this file via Settings → Updates in the nasOS desktop."
echo "  Or copy it to the Pi manually:"
echo
echo "    scp dist/$PACKAGE_NAME nasos@nasos.local:/tmp/"
echo "    (then apply via the web UI)"
echo
