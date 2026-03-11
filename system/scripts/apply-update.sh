#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  nasOS OTA Apply Script
#  Runs independently (spawned with nohup by the backend) so it
#  survives the backend being restarted mid-update.
#
#  Usage: apply-update.sh <package_path>
#
#  Progress is written to $PROGRESS_FILE as JSON so the backend
#  can serve it while this script (and the backend) restarts.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

PACKAGE="${1:-}"
if [[ -z "$PACKAGE" || ! -f "$PACKAGE" ]]; then
  echo "Usage: apply-update.sh <package.nasos>" >&2
  exit 1
fi

NASOS_DIR="/opt/nasos"
STAGING_DIR="$NASOS_DIR/data/update-staging"
PROGRESS_FILE="$STAGING_DIR/progress.json"
ROLLBACK_DIR="$STAGING_DIR/rollback"
EXTRACT_DIR="$STAGING_DIR/extract"
LOG_FILE="$STAGING_DIR/apply.log"

mkdir -p "$STAGING_DIR"
exec >> "$LOG_FILE" 2>&1
echo "=== OTA Apply started at $(date -Iseconds) ==="

# ── Helpers ───────────────────────────────────────────────────────
progress() {
  local phase="$1" pct="$2" msg="$3" status="${4:-running}"
  printf '{"phase":"%s","percent":%d,"message":"%s","status":"%s","timestamp":"%s"}\n' \
    "$phase" "$pct" "$msg" "$status" "$(date -Iseconds)" \
    > "$PROGRESS_FILE"
  echo "[$phase $pct%] $msg"
}

fail() {
  progress "error" 0 "$1" "error"
  echo "FATAL: $1" >&2
  exit 1
}

# ── Phase 1: Validate ─────────────────────────────────────────────
progress "validating" 2 "Validating package..."

rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$PACKAGE" -C "$EXTRACT_DIR" 2>/dev/null \
  || fail "Failed to extract package"

MANIFEST="$EXTRACT_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || fail "Invalid package: missing manifest.json"

# Parse manifest fields using python3 (available on Pi)
VERSION=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['version'])" "$MANIFEST") \
  || fail "Could not read version from manifest"
COMPONENTS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(' '.join(d['components']))" "$MANIFEST") \
  || fail "Could not read components from manifest"
RESTART_ELECTRON=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(str(d.get('restart_electron',False)).lower())" "$MANIFEST")

progress "validating" 10 "Package v$VERSION validated (components: $COMPONENTS)"
echo "Components: $COMPONENTS"
echo "Restart electron: $RESTART_ELECTRON"

# ── Phase 2: Backup current install ──────────────────────────────
progress "backing_up" 15 "Backing up current installation..."

rm -rf "$ROLLBACK_DIR"
mkdir -p "$ROLLBACK_DIR"

for component in $COMPONENTS; do
  src=""
  case "$component" in
    frontend) src="$NASOS_DIR/frontend/dist" ;;
    backend)  src="$NASOS_DIR/backend" ;;
    electron) src="$NASOS_DIR/electron" ;;
    scripts)  src="$NASOS_DIR/scripts" ;;
  esac
  if [[ -n "$src" && -e "$src" ]]; then
    cp -r "$src" "$ROLLBACK_DIR/$component" 2>/dev/null || true
    echo "  Backed up: $component"
  fi
done

# Record what was backed up and its version
CURRENT_VERSION=$("$NASOS_DIR/venv/bin/python3" -c \
  "from app.core.config import settings; print(settings.version)" \
  2>/dev/null || echo "unknown")
echo "{\"version\":\"$CURRENT_VERSION\",\"backed_up_at\":\"$(date -Iseconds)\"}" \
  > "$ROLLBACK_DIR/rollback-manifest.json"

progress "backing_up" 30 "Backup complete (previous v$CURRENT_VERSION saved)"

# ── Phase 3: Install components ───────────────────────────────────
TOTAL_COMPONENTS=$(echo "$COMPONENTS" | wc -w)
DONE=0

for component in $COMPONENTS; do
  PCT=$(( 30 + (DONE * 40 / TOTAL_COMPONENTS) ))
  progress "installing" "$PCT" "Installing: $component..."

  case "$component" in
    frontend)
      rm -rf "$NASOS_DIR/frontend/dist"
      mkdir -p "$NASOS_DIR/frontend/dist"
      cp -r "$EXTRACT_DIR/frontend/." "$NASOS_DIR/frontend/dist/"
      echo "  frontend: $(find "$NASOS_DIR/frontend/dist" -type f | wc -l) files"
      ;;

    backend)
      # Swap source files (keep venv intact)
      rm -rf "$NASOS_DIR/backend"
      cp -r "$EXTRACT_DIR/backend" "$NASOS_DIR/backend"
      echo "  backend: source replaced"

      # Reinstall python deps if requirements changed
      progress "installing" "$PCT" "Installing Python dependencies..."
      if [[ -f "$NASOS_DIR/backend/requirements.txt" ]]; then
        "$NASOS_DIR/venv/bin/pip" install \
          -r "$NASOS_DIR/backend/requirements.txt" \
          --quiet --upgrade 2>&1 | tail -3
      fi
      echo "  backend: venv updated"
      ;;

    electron)
      rm -rf "$NASOS_DIR/electron"
      cp -r "$EXTRACT_DIR/electron" "$NASOS_DIR/electron"
      # Reinstall node modules
      progress "installing" "$PCT" "Installing Node.js dependencies..."
      cd "$NASOS_DIR/electron"
      npm install --omit=dev --prefer-offline --silent 2>&1 | tail -3
      echo "  electron: node_modules reinstalled"
      ;;

    scripts)
      cp "$EXTRACT_DIR/scripts/"*.sh "$NASOS_DIR/scripts/"
      chmod +x "$NASOS_DIR/scripts/"*.sh
      echo "  scripts: updated"
      ;;
  esac

  DONE=$((DONE + 1))
done

# Fix ownership — use the actual UID-1000 user (Pi Imager may have renamed 'nasos')
OWNER=$(id -nu 1000 2>/dev/null || echo "nasos")
chown -R "$OWNER:$OWNER" "$NASOS_DIR/frontend" "$NASOS_DIR/backend" 2>/dev/null || true
[[ -d "$NASOS_DIR/electron" ]] && chown -R "$OWNER:$OWNER" "$NASOS_DIR/electron" 2>/dev/null || true

progress "installing" 75 "All components installed"

# ── Phase 4: Restart services ─────────────────────────────────────
progress "restarting" 80 "Restarting nasos-backend..."
sleep 1

# Restart backend — systemd's Restart=always will bring it back up.
# This script survives because it is NOT the backend process.
systemctl restart nasos-backend 2>/dev/null || true

progress "restarting" 90 "Backend restarting..."
sleep 3

if [[ "$RESTART_ELECTRON" == "true" ]]; then
  progress "restarting" 95 "Restarting Electron desktop..."
  systemctl restart nasos-electron 2>/dev/null || true
  sleep 2
fi

# ── Phase 5: Done ─────────────────────────────────────────────────
progress "complete" 100 "Update to v$VERSION complete" "complete"
echo "=== OTA Apply complete v$VERSION at $(date -Iseconds) ==="

# Clean up extract dir but leave rollback and progress.json for the UI to read
rm -rf "$EXTRACT_DIR"
