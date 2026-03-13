#!/bin/bash -e
# nasOS Stage 02: Configure Services — file staging
#
# This script runs in two modes, mirroring stage-03:
#   HOST-SIDE  ($ROOTFS_DIR not set): copy canonical files from the repo into
#              the stage's files/ directory so they're always up-to-date.
#   DOCKER-SIDE ($ROOTFS_DIR set):    inject files/ into the rootfs.
#
# Always "source of truth": system/systemd/, system/udev/, system/configs/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$SCRIPT_DIR/files"

if [ -z "${ROOTFS_DIR:-}" ]; then
  # HOST-SIDE — refresh canonical files before a Docker-side build picks them up.
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
  echo ">>> [02-configure-services/host] Syncing canonical files from repo..."

  # Systemd service units — always use system/systemd/ as the single source of truth.
  # The bundled copies in files/systemd/ previously drifted and missed EnvironmentFile=,
  # PrivateTmp=, Restart=always, RestartSec=, and the docker After= removal.
  mkdir -p "$FILES_DIR/systemd"
  cp "$PROJECT_ROOT/system/systemd/"*.service "$FILES_DIR/systemd/"
  echo "    + system/systemd/ -> files/systemd/ ($(ls "$FILES_DIR/systemd/" | wc -l | tr -d ' ') units)"

  # udev rules
  mkdir -p "$FILES_DIR/udev"
  cp "$PROJECT_ROOT/system/udev/"*.rules "$FILES_DIR/udev/"
  echo "    + system/udev/ -> files/udev/"

  # Config templates
  mkdir -p "$FILES_DIR/configs"
  cp "$PROJECT_ROOT/system/configs/"*.template "$FILES_DIR/configs/" 2>/dev/null || true
  [ -f "$PROJECT_ROOT/system/configs/sudoers-nasos" ] && \
    cp "$PROJECT_ROOT/system/configs/sudoers-nasos" "$FILES_DIR/configs/"
  if [ -d "$PROJECT_ROOT/system/configs/nut" ]; then
    mkdir -p "$FILES_DIR/configs/nut"
    cp "$PROJECT_ROOT/system/configs/nut/"* "$FILES_DIR/configs/nut/" 2>/dev/null || true
  fi
  echo "    + system/configs/ -> files/configs/"

  echo ">>> [02-configure-services/host] Sync complete."
else
  # DOCKER-SIDE — inject staged files into the rootfs being built
  mkdir -p "${ROOTFS_DIR}/files"
  cp -a "$FILES_DIR"/* "${ROOTFS_DIR}/files/"
fi
