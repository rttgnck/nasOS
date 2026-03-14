#!/bin/bash
# nasOS Stage 01: Install Packages
# Runs inside the ARM chroot — installs all required apt packages and Node.js.
set -euo pipefail

echo ">>> [01-install-packages] Updating package lists..."
apt-get update -y

echo ">>> [01-install-packages] Installing Node.js 20.x (LTS)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo ">>> [01-install-packages] Installing Docker Engine..."
# Docker official repo for arm64/bookworm
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y --no-install-recommends \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo ">>> [01-install-packages] Installing FFmpeg for media transcoding..."
apt-get install -y --no-install-recommends ffmpeg

echo ">>> [01-install-packages] Cleaning up..."
apt-get clean
rm -rf /var/lib/apt/lists/*

echo ">>> [01-install-packages] Node version: $(node --version)"
echo ">>> [01-install-packages] Docker version: $(docker --version)"
echo ">>> [01-install-packages] Done."
