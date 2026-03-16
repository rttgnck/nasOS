#!/bin/bash
# nasOS Stage 03: Install nasOS Application (CHROOT-SIDE)
# Installs the backend, frontend, and Electron shell into /opt/nasos.
set -euo pipefail

echo ">>> [03-install-nasos/chroot] Installing nasOS frontend..."

NASOS_DIR="/opt/nasos"

# Frontend — static files served by FastAPI at /opt/nasos/frontend/dist/
mkdir -p "$NASOS_DIR/frontend/dist"
cp -r /files/frontend-dist/. "$NASOS_DIR/frontend/dist/"
echo "    frontend installed ($(find "$NASOS_DIR/frontend/dist" -type f | wc -l) files)"

echo ">>> [03-install-nasos/chroot] Installing nasOS backend..."

mkdir -p "$NASOS_DIR/backend"
cp -r /files/backend/. "$NASOS_DIR/backend/"

# Create Python virtualenv for dependency isolation
python3 -m venv "$NASOS_DIR/venv"

# Upgrade pip
"$NASOS_DIR/venv/bin/pip" install --upgrade pip --quiet

# Install backend dependencies
if [ -f "$NASOS_DIR/backend/requirements.txt" ]; then
  "$NASOS_DIR/venv/bin/pip" install -r "$NASOS_DIR/backend/requirements.txt" --quiet
elif [ -f "$NASOS_DIR/backend/pyproject.toml" ]; then
  "$NASOS_DIR/venv/bin/pip" install "$NASOS_DIR/backend" --quiet
else
  echo "ERROR: No requirements.txt or pyproject.toml found in backend/"
  exit 1
fi

echo "    backend venv installed: $("$NASOS_DIR/venv/bin/pip" list --format=freeze | wc -l) packages"

echo ">>> [03-install-nasos/chroot] Installing Electron shell..."

mkdir -p "$NASOS_DIR/electron"
cp -r /files/electron/. "$NASOS_DIR/electron/"

# Install Node dependencies for Electron (target: linux-arm64)
cd "$NASOS_DIR/electron"
npm install --omit=dev --prefer-offline 2>&1 | tail -5

echo "    electron installed"

echo ">>> [03-install-nasos/chroot] Installing nasOS system scripts..."

mkdir -p "$NASOS_DIR/scripts"
cp -r /files/scripts/. "$NASOS_DIR/scripts/"
chmod +x "$NASOS_DIR/scripts/"*.sh

echo ">>> [03-install-nasos/chroot] Setting ownership..."

chown -R nasos:nasos "$NASOS_DIR"

echo ">>> [03-install-nasos/chroot] Writing initial version to .env..."
# Read the version from backend config.py (stamped by build.sh before this runs)
NASOS_VER=$(PYTHONPATH="$NASOS_DIR/backend" "$NASOS_DIR/venv/bin/python3" -c \
  "from app.core.config import settings; print(settings.version)" 2>/dev/null || echo "unknown")
# Write to .env so the backend service picks it up via EnvironmentFile
sed -i '/^NASOS_VERSION=/d' "$NASOS_DIR/.env" 2>/dev/null || true
echo "NASOS_VERSION=$NASOS_VER" >> "$NASOS_DIR/.env"
echo "    NASOS_VERSION=$NASOS_VER written to .env"

echo ">>> [03-install-nasos/chroot] Verifying install..."
"$NASOS_DIR/venv/bin/python3" -c "import fastapi; import uvicorn; print('    backend imports OK')"
node --version | xargs echo "    Node version:"

echo ">>> [03-install-nasos/chroot] Done."
