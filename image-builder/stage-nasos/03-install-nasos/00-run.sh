#!/bin/bash
# nasOS Stage 03: Install nasOS Application (HOST-SIDE and DOCKER-SIDE)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$SCRIPT_DIR/files"

if [ -z "${ROOTFS_DIR:-}" ]; then
  # ==========================================
  # HOST-SIDE: Runs on Mac before Docker starts
  # ==========================================
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
  echo ">>> [03-install-nasos/host] Staging app files into $FILES_DIR ..."

  mkdir -p "$FILES_DIR"

  # Frontend
  if [ ! -d "$PROJECT_ROOT/frontend/dist" ]; then
    echo "ERROR: frontend/dist not found. Run 'npm run build' in frontend/ first."
    exit 1
  fi
  rm -rf "$FILES_DIR/frontend-dist"
  cp -r "$PROJECT_ROOT/frontend/dist" "$FILES_DIR/frontend-dist"
  echo "    + frontend/dist -> files/frontend-dist"

  # Backend
  if [ ! -d "$PROJECT_ROOT/backend" ]; then
    echo "ERROR: backend/ directory not found."
    exit 1
  fi
  rm -rf "$FILES_DIR/backend"
  cp -r "$PROJECT_ROOT/backend" "$FILES_DIR/backend"
  rm -rf "$FILES_DIR/backend"/{.venv,__pycache__,*.egg-info,.pytest_cache}
  echo "    + backend/ -> files/backend"

  # Electron
  if [ ! -d "$PROJECT_ROOT/electron" ]; then
    echo "ERROR: electron/ directory not found."
    exit 1
  fi
  rm -rf "$FILES_DIR/electron"
  cp -r "$PROJECT_ROOT/electron" "$FILES_DIR/electron"
  rm -rf "$FILES_DIR/electron/node_modules"
  echo "    + electron/ -> files/electron"

  # System scripts
  if [ ! -d "$PROJECT_ROOT/system/scripts" ]; then
    echo "ERROR: system/scripts/ directory not found."
    exit 1
  fi
  rm -rf "$FILES_DIR/scripts"
  cp -r "$PROJECT_ROOT/system/scripts" "$FILES_DIR/scripts"
  echo "    + system/scripts/ -> files/scripts"

  echo ">>> [03-install-nasos/host] Staging complete."

else
  # ==========================================
  # DOCKER-SIDE: Runs inside pi-gen builder
  # ==========================================
  echo ">>> [03-install-nasos/docker] Injecting files into ROOTFS_DIR..."
  mkdir -p "${ROOTFS_DIR}/files"
  cp -a "$FILES_DIR"/* "${ROOTFS_DIR}/files/"
fi
