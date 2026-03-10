#!/bin/bash
# nasOS Image Builder
# Produces a flashable .img file for Raspberry Pi 5
#
# Prerequisites:
#   - Docker (for running pi-gen)
#   - Built frontend (npm run build in frontend/)
#   - Backend source ready
#
# Usage:
#   ./build.sh [image-name]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="${1:-nasos}"

echo "=== Building nasOS image ==="

# Step 1: Build frontend
echo "Building frontend..."
cd "$PROJECT_ROOT/frontend"
npm run build

# Step 2: Use pi-gen to build the image
# pi-gen is Raspberry Pi's official tool for building OS images
# https://github.com/RPi-Distro/pi-gen

echo "Configuring pi-gen..."

export IMG_NAME="$IMAGE_NAME"
export RELEASE="bookworm"
export TARGET_HOSTNAME="nasos"
export FIRST_USER_NAME="nasos"
export ENABLE_SSH="1"
export STAGE_LIST="stage0 stage1 stage2 stage-nasos"
export DEPLOY_ZIP="1"

# Step 3: Run pi-gen with our custom stage
# In production, this would clone pi-gen and run ./build-docker.sh
# For now, we document the process

cat <<'EOF'
=== Pi-Gen Build Steps ===

To build the full image:

1. Clone pi-gen:
   git clone https://github.com/RPi-Distro/pi-gen.git

2. Copy our custom stage:
   cp -r image-builder/stage-nasos pi-gen/

3. Configure pi-gen:
   Edit pi-gen/config to set IMG_NAME, hostname, etc.

4. Build:
   cd pi-gen && ./build-docker.sh

The resulting image will be in pi-gen/deploy/

EOF

echo "=== Image build configuration complete ==="
echo "Follow the steps above to build the full image."
