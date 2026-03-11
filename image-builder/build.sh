#!/bin/bash
# nasOS Image Builder
# Produces a flashable nasOS.img.xz for Raspberry Pi 5
#
# Prerequisites:
#   - Docker Desktop running on macOS (or Docker Engine on Linux)
#   - internet connection (pi-gen downloads ARM packages during first build)
#
# Usage:
#   ./image-builder/build.sh [--skip-frontend] [--clean]
#
#   --skip-frontend  Skip npm run build (use if already built)
#   --clean          Remove the pi-gen cache and start a clean build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PIGEN_DIR="$SCRIPT_DIR/.pi-gen"
DEPLOY_DIR="$SCRIPT_DIR/deploy"
SKIP_FRONTEND=false
CLEAN_BUILD=false

# --- Parse args ---
for arg in "$@"; do
  case "$arg" in
    --skip-frontend) SKIP_FRONTEND=true ;;
    --clean)         CLEAN_BUILD=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# --- Colour helpers ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[nasOS]${NC} $*"; }
success() { echo -e "${GREEN}[nasOS]${NC} $*"; }
warn()    { echo -e "${YELLOW}[nasOS]${NC} $*"; }
error()   { echo -e "${RED}[nasOS] ERROR:${NC} $*" >&2; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       nasOS Image Builder            ║"
echo "║  Raspberry Pi 5 · Bookworm · 64-bit  ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────
# STEP 1: Preflight checks
# ─────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  error "Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
  exit 1
fi

if ! docker info &>/dev/null; then
  error "Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

if ! command -v node &>/dev/null; then
  error "Node.js not found. Install from https://nodejs.org"
  exit 1
fi

if ! command -v git &>/dev/null; then
  error "git not found."
  exit 1
fi

success "Prerequisites OK (Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1), Node $(node --version))"

# ─────────────────────────────────────────
# STEP 2: Build frontend
# ─────────────────────────────────────────
if [ "$SKIP_FRONTEND" = false ]; then
  info "Building frontend (React/TypeScript)..."
  cd "$PROJECT_ROOT/frontend"
  npm install --silent
  npm run build
  success "Frontend built → frontend/dist/ ($(find dist -type f | wc -l | tr -d ' ') files)"
  cd "$PROJECT_ROOT"
else
  if [ ! -d "$PROJECT_ROOT/frontend/dist" ]; then
    error "--skip-frontend was set but frontend/dist/ does not exist. Run without --skip-frontend."
    exit 1
  fi
  warn "Skipping frontend build (--skip-frontend)"
fi

# ─────────────────────────────────────────
# STEP 3: Clone or update pi-gen
# ─────────────────────────────────────────
if [ "$CLEAN_BUILD" = true ] && [ -d "$PIGEN_DIR" ]; then
  warn "Clean build requested — removing $PIGEN_DIR ..."
  rm -rf "$PIGEN_DIR"
fi

if [ ! -d "$PIGEN_DIR" ]; then
  info "Cloning pi-gen (Raspberry Pi official image builder, master branch)..."
  git clone --depth=1 https://github.com/RPi-Distro/pi-gen.git "$PIGEN_DIR"
  success "pi-gen cloned."
else
  info "Updating pi-gen..."
  git -C "$PIGEN_DIR" pull --ff-only || warn "Could not update pi-gen (continuing with existing copy)"
fi

# ─────────────────────────────────────────
# Patch 1: Use debian:bookworm as the Docker base image
# pi-gen's Dockerfile defaults to debian:bullseye — override it to bookworm
# so the build container has current Bookworm signing keys installed
# ─────────────────────────────────────────
info "Patching pi-gen Dockerfile: setting base image to debian:bookworm..."
PIGEN_DOCKERFILE="$PIGEN_DIR/Dockerfile"
if [ -f "$PIGEN_DOCKERFILE" ]; then
  # Override BASE_IMAGE default from bullseye to bookworm
  # Use python3 for in-place edits — macOS BSD sed requires -i '' which differs
  # from GNU sed, and multiline replacements are tricky cross-platform
  python3 - "$PIGEN_DOCKERFILE" << 'PYEOF'
import sys, re
path = sys.argv[1]
content = open(path).read()

# 1. Override base image: bullseye → bookworm
content = re.sub(
    r'ARG BASE_IMAGE=debian:[a-z]+',
    'ARG BASE_IMAGE=debian:bookworm',
    content
)

# 2. Add debian-archive-keyring to the apt-get install list (if not already there)
if 'debian-archive-keyring' not in content:
    content = re.sub(
        r'(apt-get -y install --no-install-recommends\s)',
        r'\1debian-archive-keyring \\\n        ',
        content,
        count=1
    )

# 3. Add a RUN step to download the current Raspberry Pi Bookworm archive key.
#    pi-gen's bundled raspberrypi.gpg is outdated and missing key 9165938D90FDDD2E
#    which is needed to verify packages from raspbian.raspberrypi.com/raspbian.
#    We fetch the key from the official RPi archive and install it to the system keyring
#    so that debootstrap and apt-get update inside the chroot can verify RPi packages.
rpi_key_step = '''
# nasOS: install current Raspberry Pi and Raspbian archive signing keys
RUN curl -fsSL https://archive.raspberrypi.com/debian/raspberrypi.gpg.key | gpg --dearmor -o /usr/share/keyrings/raspberrypi-archive-keyring.pgp 2>/dev/null || \\
    curl -fsSL https://archive.raspberrypi.org/debian/raspberrypi.gpg.key | gpg --dearmor -o /usr/share/keyrings/raspberrypi-archive-keyring.pgp 2>/dev/null || true
RUN curl -fsSL http://raspbian.raspberrypi.com/raspbian/public.key | gpg --dearmor -o /usr/share/keyrings/raspbian-archive-keyring.gpg 2>/dev/null || true
'''
if 'raspberrypi-archive-keyring.pgp' not in content:
    # Insert before COPY line
    content = content.replace('COPY . /pi-gen/', rpi_key_step + '\nCOPY . /pi-gen/')

open(path, 'w').write(content)
print('    Dockerfile patched (base: debian:bookworm + Debian keyring + RPi archive key).')
PYEOF
  success "Dockerfile patched."
fi

# Patch 2: Copy host Debian keyrings into the debootstrapped rootfs
# Debootstrap creates a minimal system with a potentially outdated
# debian-archive-keyring. Copying the Docker container's current keyrings
# into the rootfs makes apt-get update work correctly in stage0.
# ─────────────────────────────────────────
PRERUN="$PIGEN_DIR/stage0/prerun.sh"
if [ -f "$PRERUN" ] && ! grep -q 'nasOS-keyfix' "$PRERUN"; then
  info "Patching pi-gen stage0/prerun.sh: switching to arm64-compatible mirror + keyring copy..."
  python3 - "$PRERUN" << 'PYEOF'
import sys
path = sys.argv[1]
content = open(path).read()

# 1. Switch bootstrap mirror from Raspbian (armhf only) to standard Debian
#    raspbian.raspberrypi.com/raspbian has NO arm64 packages.
#    deb.debian.org/debian has both armhf and arm64.
content = content.replace(
    'bootstrap ${RELEASE} "${ROOTFS_DIR}" http://raspbian.raspberrypi.com/raspbian/',
    'bootstrap ${RELEASE} "${ROOTFS_DIR}" http://deb.debian.org/debian/'
)

# 2. Append keyring copy after debootstrap so apt-get update works in the chroot
keyfix = '''
# nasOS-keyfix: copy host keyrings into rootfs after debootstrap
if [ -d "${ROOTFS_DIR}/usr/share/keyrings" ]; then
  for kf in /usr/share/keyrings/debian-archive-*.gpg /usr/share/keyrings/debian-archive-*.asc; do
    [ -f "$kf" ] || continue
    cp "$kf" "${ROOTFS_DIR}/usr/share/keyrings/"
  done
  # Raspberry Pi archive keyring (downloaded fresh in Docker image build)
  if [ -f /usr/share/keyrings/raspberrypi-archive-keyring.pgp ]; then
    cp /usr/share/keyrings/raspberrypi-archive-keyring.pgp "${ROOTFS_DIR}/usr/share/keyrings/"
  fi
  # Raspbian archive keyring (downloaded fresh in Docker image build)
  if [ -f /usr/share/keyrings/raspbian-archive-keyring.gpg ]; then
    cp /usr/share/keyrings/raspbian-archive-keyring.gpg "${ROOTFS_DIR}/usr/share/keyrings/"
  fi
  echo "nasOS-keyfix: keyrings copied into rootfs."
fi
'''
content = content + keyfix

open(path, 'w').write(content)
print('    prerun.sh: mirror → deb.debian.org/debian, keyring copy added.')
PYEOF
  success "stage0/prerun.sh patched."
fi


# ─────────────────────────────────────────
# Patch 3: Fix scripts/common for arm64 + macOS Docker
#
# pi-gen master's scripts/common has two fundamental problems for our build:
#   1. bootstrap() calls: setarch linux32 capsh ... debootstrap --arch armhf
#      → setarch linux32 fails on macOS/ARM64 kernels (Invalid argument)
#      → --arch armhf bootstraps 32-bit ARM instead of 64-bit
#   2. on_chroot() calls: setarch linux32 capsh ... chroot
#      → same setarch failure, breaking every chroot operation
#
# Fix: remove setarch linux32, change --arch armhf to --arch arm64
# ─────────────────────────────────────────
COMMON="$PIGEN_DIR/scripts/common"
if [ -f "$COMMON" ] && ! grep -q 'nasOS-arm64fix' "$COMMON"; then
  info "Patching pi-gen scripts/common: arm64 + removing setarch linux32..."
  python3 - "$COMMON" << 'PYEOF'
import sys
path = sys.argv[1]
content = open(path).read()

# Remove 'setarch linux32 ' prefix from both bootstrap() and on_chroot()
# capsh can be called directly without setarch on arm64
content = content.replace('setarch linux32 capsh', 'capsh')

# Change debootstrap target arch from armhf to arm64
# (Pi 5 requires 64-bit aarch64 OS)
content = content.replace("BOOTSTRAP_ARGS+=(--arch armhf)", "BOOTSTRAP_ARGS+=(--arch arm64)")

# debootstrap is configured with --keyring pointing to raspberrypi.gpg,
# but pi-gen downloads from raspbian.raspberrypi.com and the key in this file
# may not match the current signing key. The cleanest fix is to skip GPG
# verification at the debootstrap phase (--no-check-gpg) and let APT handle
# verification using its own keyring once the rootfs is set up.
content = content.replace(
    'BOOTSTRAP_ARGS+=(--keyring "${STAGE_DIR}/files/raspberrypi.gpg")',
    'BOOTSTRAP_ARGS+=(--no-check-gpg)'
)

# Add a marker so we don't double-patch
content = "# nasOS-arm64fix applied\n" + content

open(path, 'w').write(content)
print('    scripts/common patched: removed setarch linux32, set --arch arm64.')
PYEOF
  success "scripts/common patched."
fi

# ─────────────────────────────────────────
# Patch 4: Fix APT sources for arm64
#
# pi-gen master's stage0 configs configure raspbian.raspberrypi.com/raspbian
# which is strictly 32-bit (armhf) only. We must replace raspbian.sources
# with debian.sources pointing to deb.debian.org for arm64 packages.
# ─────────────────────────────────────────
APT_RUN="$PIGEN_DIR/stage0/00-configure-apt/00-run.sh"
if [ -f "$APT_RUN" ] && ! grep -q 'nasOS-aptfix' "$APT_RUN"; then
  info "Patching stage0 APT sources: replacing raspbian mirror with debian arm64 mirror..."
  
  # Create the new debian.sources file
  cat > "$PIGEN_DIR/stage0/00-configure-apt/files/debian.sources" << 'EOF'
Types: deb
URIs: http://deb.debian.org/debian/
Architectures: arm64
Suites: RELEASE RELEASE-updates
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: http://deb.debian.org/debian-security/
Architectures: arm64
Suites: RELEASE-security
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
EOF

  # Update 00-run.sh to use debian.sources instead of raspbian.sources, and remove hardcoded --add-architecture
  python3 - "$APT_RUN" << 'PYEOF'
import sys, re
path = sys.argv[1]
content = open(path).read()
content = content.replace('files/raspbian.sources', 'files/debian.sources')
content = content.replace('sources.list.d/raspbian.sources', 'sources.list.d/debian.sources')

# Remove the block that adds armhf to dpkg architectures
content = re.sub(
    r'if \[ "\$ARCH" = "armhf" \]; then.*?fi\n',
    '',
    content,
    flags=re.DOTALL
)

content = "# nasOS-aptfix applied\n" + content
open(path, 'w').write(content)
PYEOF
  success "APT sources patched for arm64."
fi

# ─────────────────────────────────────────
# Patch 5: Fix firmware packages for arm64
#
# pi-gen master's stage0/02-firmware/01-packages hardcodes the 32-bit only
# kernels (linux-image-rpi-v6, v7) and headers. This breaks on arm64.
# We replace it with the 64-bit kernels: v8 and 2712 (Pi 5).
# ─────────────────────────────────────────
FIRMWARE_PKGS="$PIGEN_DIR/stage0/02-firmware/01-packages"
if [ -f "$FIRMWARE_PKGS" ] && ! grep -q 'linux-image-rpi-2712' "$FIRMWARE_PKGS"; then
  info "Patching stage0 firmware packages: replacing 32-bit (v6/v7) kernels with 64-bit (v8/2712)..."
  cat > "$FIRMWARE_PKGS" << 'EOF'
initramfs-tools
raspi-firmware
linux-image-rpi-v8
linux-image-rpi-2712
linux-headers-rpi-v8
linux-headers-rpi-2712
EOF
  success "Firmware packages patched for arm64."
fi

# ─────────────────────────────────────────
# Patch 6: Remove 32-bit Pi optimisations & missing arm64 packages
#
# raspi-copies-and-fills: 32-bit (armhf) specific optimization
# rpi-swap, rpi-loop-utils, rpi-usb-gadget: don't exist in Bookworm arm64
# ─────────────────────────────────────────
COPIES_PKGS="$PIGEN_DIR/stage2/00-copies-and-fills/01-packages"
if [ -f "$COPIES_PKGS" ]; then
  info "Patching stage2: removing 32-bit specific raspi-copies-and-fills package..."
  python3 - "$COPIES_PKGS" << 'PYEOF'
import sys
path = sys.argv[1]
lines = open(path).readlines()
open(path, 'w').writelines([l for l in lines if 'raspi-copies-and-fills' not in l])
PYEOF
  success "raspi-copies-and-fills removed."
fi

SYS_TWEAKS_PKGS="$PIGEN_DIR/stage2/01-sys-tweaks/00-packages"
if [ -f "$SYS_TWEAKS_PKGS" ] && ! grep -q 'nasOS-pkgfix' "$SYS_TWEAKS_PKGS"; then
  info "Patching stage2: removing rpi-swap, rpi-loop-utils, rpi-usb-gadget (not in Bookworm arm64)..."
  python3 - "$SYS_TWEAKS_PKGS" << 'PYEOF'
import sys
path = sys.argv[1]
lines = open(path).readlines()
new_lines = []
for line in lines:
    line = line.replace('rpi-swap', '').replace('rpi-loop-utils', '').replace('rpi-usb-gadget', '')
    if line.strip():
        new_lines.append(line)
open(path, 'w').writelines(new_lines + ['# nasOS-pkgfix applied\n'])
PYEOF
  success "Missing arm64 packages removed from sys-tweaks."
fi

SYS_TWEAKS_RUN="$PIGEN_DIR/stage2/01-sys-tweaks/01-run.sh"
if [ -f "$SYS_TWEAKS_RUN" ] && ! grep -q 'nasOS-resizefix' "$SYS_TWEAKS_RUN"; then
  info "Patching stage2: removing systemctl enable rpi-resize..."
  python3 - "$SYS_TWEAKS_RUN" << 'PYEOF'
import sys
path = sys.argv[1]
lines = open(path).readlines()
new_lines = [l for l in lines if 'systemctl enable rpi-resize' not in l]
open(path, 'w').writelines(new_lines + ['# nasOS-resizefix applied\n'])
PYEOF
  success "rpi-resize enablement removed."
fi

# ─────────────────────────────────────────
info "Configuring pi-gen..."

# Copy our config file to pi-gen root (pi-gen sources this)
cp "$SCRIPT_DIR/config" "$PIGEN_DIR/config"

# Tell pi-gen to write its output image directly to image-builder/deploy/
# (otherwise it defaults to .pi-gen/deploy which is buried inside the build dir)
mkdir -p "$DEPLOY_DIR"
echo "DEPLOY_DIR=\"$DEPLOY_DIR\"" >> "$PIGEN_DIR/config"

# Skip the stages we don't need (stage3 = desktop environment, stage4/5 = full desktop)
# We stop at stage2 (RPi OS Lite) then add our own stage-nasos
for stage in stage3 stage4 stage5; do
  touch "$PIGEN_DIR/$stage/SKIP"
  touch "$PIGEN_DIR/$stage/SKIP_IMAGES"
done

# Skip intermediate image exports for our stages too (only final stage-nasos exports)
touch "$PIGEN_DIR/stage0/SKIP_IMAGES"
touch "$PIGEN_DIR/stage1/SKIP_IMAGES"
touch "$PIGEN_DIR/stage2/SKIP_IMAGES"

# Skip cloud-init since it requires the missing rpi-cloud-init-mods for arm64 Bookworm
touch "$PIGEN_DIR/stage2/04-cloud-init/SKIP"

# ─────────────────────────────────────────
# STEP 5: Populate stage-nasos
# ─────────────────────────────────────────
info "Copying stage-nasos into pi-gen..."

PIGEN_STAGE="$PIGEN_DIR/stage-nasos"
rm -rf "$PIGEN_STAGE"
cp -r "$SCRIPT_DIR/stage-nasos" "$PIGEN_STAGE"

# Make all shell scripts executable
find "$PIGEN_STAGE" -name "*.sh" -exec chmod +x {} \;

# Run the host-side staging script for stage 03
# This copies the built app files into stage-nasos/03-install-nasos/files/
info "Staging application files for stage-nasos/03-install-nasos..."
PROJECT_ROOT="$PROJECT_ROOT" bash "$PIGEN_STAGE/03-install-nasos/00-run.sh"
success "App files staged."

# ─────────────────────────────────────────
# STEP 6: Run pi-gen via Docker
# ─────────────────────────────────────────
info "Starting pi-gen Docker build..."
info "  This takes 20-40 minutes on first run (downloads ARM packages)."
info "  Subsequent builds are faster thanks to Docker layer caching."
echo ""

cd "$PIGEN_DIR"

# Remove any leftover container from a previous (possibly failed) run
# pi-gen aborts if pigen_work exists and CONTINUE=1 is not set
if docker inspect pigen_work &>/dev/null 2>&1; then
  info "Removing leftover pigen_work container from previous run..."
  docker rm -v pigen_work
fi

./build-docker.sh

# ─────────────────────────────────────────
# STEP 7: Collect output
# ─────────────────────────────────────────
echo ""
info "Collecting output image..."

# pi-gen writes directly to $DEPLOY_DIR (set in config above)
PIGEN_OUTPUT=$(ls "$DEPLOY_DIR/"*.img.xz 2>/dev/null | tail -1)
if [ -z "$PIGEN_OUTPUT" ]; then
  PIGEN_OUTPUT=$(ls "$DEPLOY_DIR/"*.img 2>/dev/null | tail -1)
fi

if [ -z "$PIGEN_OUTPUT" ]; then
  error "Build failed — no .img or .img.xz found in $DEPLOY_DIR/"
  error "Check pi-gen logs above for errors."
  exit 1
fi

OUTPUT_FILE="$PIGEN_OUTPUT"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    BUILD COMPLETE!                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
success "Image: $OUTPUT_FILE"
success "Size:  $(du -sh "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "To flash to an SD card (macOS):"
echo "  1. Find your SD card device:"
echo "     diskutil list"
echo ""
echo "  2. Unmount it (replace diskN):"
echo "     diskutil unmountDisk /dev/diskN"
echo ""
if [[ "$OUTPUT_FILE" == *.xz ]]; then
echo "  3. Flash (decompress on the fly):"
echo "     xzcat $OUTPUT_FILE | sudo dd of=/dev/rdiskN bs=4m status=progress"
else
echo "  3. Flash:"
echo "     sudo dd if=$OUTPUT_FILE of=/dev/rdiskN bs=4m status=progress"
fi
echo ""
echo "  4. Eject, insert into Pi 5, power on."
echo "     First boot takes ~2 minutes (setup wizard runs once)."
echo "     Access via: https://nasos.local:8080"
echo ""
