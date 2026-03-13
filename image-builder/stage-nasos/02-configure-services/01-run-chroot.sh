#!/bin/bash
# nasOS Stage 02: Configure Services
# Installs systemd units, udev rules, config templates, and enables all services.
set -euo pipefail

echo ">>> [02-configure-services] Installing systemd units..."

SYSTEMD_DIR="/etc/systemd/system"
cp /files/systemd/nasos-backend.service  "$SYSTEMD_DIR/"
cp /files/systemd/nasos-electron.service "$SYSTEMD_DIR/"
cp /files/systemd/nasos-firstboot.service "$SYSTEMD_DIR/"

# Enable units (systemctl enable doesn't work in chroot the normal way — create symlinks directly)
mkdir -p "$SYSTEMD_DIR/multi-user.target.wants"

ln -sf "$SYSTEMD_DIR/nasos-backend.service"   "$SYSTEMD_DIR/multi-user.target.wants/nasos-backend.service"
ln -sf "$SYSTEMD_DIR/nasos-firstboot.service" "$SYSTEMD_DIR/multi-user.target.wants/nasos-firstboot.service"
ln -sf "$SYSTEMD_DIR/nasos-electron.service"  "$SYSTEMD_DIR/multi-user.target.wants/nasos-electron.service"

echo ">>> [02-configure-services] Setting up TTY1 auto-login for nasos user..."

# Auto-login nasos on TTY1 — cage+Electron will start from their systemd service
mkdir -p "$SYSTEMD_DIR/getty@tty1.service.d"
cat > "$SYSTEMD_DIR/getty@tty1.service.d/autologin.conf" <<'AUTOLOGIN'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin nasos --noclear %I $TERM
AUTOLOGIN

echo ">>> [02-configure-services] Installing udev rules..."

UDEV_DIR="/etc/udev/rules.d"
cp /files/udev/99-disk-hotplug.rules "$UDEV_DIR/"
cp /files/udev/99-usb-backup.rules   "$UDEV_DIR/"

echo ">>> [02-configure-services] Installing config templates..."

CONFIG_DIR="/opt/nasos/system/configs"
mkdir -p "$CONFIG_DIR/nut"
cp /files/configs/smb.conf.template      "$CONFIG_DIR/"
cp /files/configs/avahi-service.template "$CONFIG_DIR/"
cp /files/configs/exports.template       "$CONFIG_DIR/"

if [ -d /files/configs/nut ]; then
  cp -r /files/configs/nut/. "$CONFIG_DIR/nut/"
fi

# Install sudoers config for backend service (allows sudo share-helper.sh)
# NOTE: first-boot.sh will patch the username if Pi Imager renamed it
if [ -f /files/configs/sudoers-nasos ]; then
  cp /files/configs/sudoers-nasos /etc/sudoers.d/nasos-backend
  chmod 440 /etc/sudoers.d/nasos-backend
  echo "    + sudoers config installed"
fi

echo ">>> [02-configure-services] Configuring fail2ban..."
# Ensure fail2ban is enabled
ln -sf /lib/systemd/system/fail2ban.service "$SYSTEMD_DIR/multi-user.target.wants/fail2ban.service" || true

echo ">>> [02-configure-services] Capping journald size..."
# Without a cap, journald grows to 10% of the filesystem (600 MB on a 6 GB root).
# A 200 MB cap keeps logs easily accessible while not threatening free space during OTA.
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/nasos-size.conf <<'JOURNALD'
[Journal]
SystemMaxUse=200M
SystemKeepFree=500M
RuntimeMaxUse=50M
JOURNALD

echo ">>> [02-configure-services] Moving Docker data-root to the data partition..."
# Docker's default /var/lib/docker on the root filesystem consumes 200-400 MB of
# daemon state (even with no user images) and grows unboundedly as users pull
# images.  Moving it to the data partition (/srv/nasos/.docker) keeps the root
# filesystem clean and lets users store however many images they want.
#
# IMPORTANT: /srv/nasos is NOT mounted during image build — it's created at first
# boot by setup-data-partition.sh.  Docker must therefore start AFTER
# nasos-firstboot.service has run and mounted the data partition.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DOCKERCFG'
{
  "data-root": "/srv/nasos/.docker",
  "log-driver": "local",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKERCFG

# Drop-in: make Docker start AFTER the data partition is mounted.
# nasos-firstboot.service runs setup-data-partition.sh which creates the
# partition, formats it, adds it to fstab, and mounts /srv/nasos.
# On subsequent boots systemd mounts it via fstab during local-fs.target,
# which is BEFORE multi-user.target (and therefore before docker.service).
# On FIRST boot the drop-in is what ensures the ordering is correct.
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/nasos-data-partition.conf <<'DOCKERDROP'
[Unit]
# On first boot, the data partition is created by nasos-firstboot.service.
# Docker's data-root lives on that partition, so Docker must start after it.
After=nasos-firstboot.service
DOCKERDROP

echo ">>> [02-configure-services] Configuring Docker service..."
mkdir -p "$SYSTEMD_DIR/multi-user.target.wants"
ln -sf /lib/systemd/system/docker.service "$SYSTEMD_DIR/multi-user.target.wants/docker.service" || true
# Add nasos to docker group (already done in 00-configure-base, belt-and-suspenders)
usermod -aG docker nasos 2>/dev/null || true
# Add nasos to shadow group so the backend can read /etc/shadow for authentication
usermod -aG shadow nasos 2>/dev/null || true

echo ">>> [02-configure-services] Setting default systemd target to graphical..."
ln -sf /lib/systemd/system/graphical.target \
  /etc/systemd/system/default.target

echo ">>> [02-configure-services] Done."
