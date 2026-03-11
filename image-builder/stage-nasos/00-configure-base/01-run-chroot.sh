#!/bin/bash
# nasOS Stage 00: Configure Base System
# Runs inside the ARM chroot — sets up locale, timezone, and creates the nasos user/dirs.
set -euo pipefail

echo ">>> [00-configure-base] Configuring locale and timezone..."

# Locale
sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen
locale-gen
echo 'LANG=en_US.UTF-8' > /etc/default/locale

# Timezone defaults to UTC — user can change via Settings UI
ln -sf /usr/share/zoneinfo/UTC /etc/localtime
echo "UTC" > /etc/timezone

# Hostname
echo "nasos" > /etc/hostname
cat > /etc/hosts <<'HOSTS'
127.0.0.1       localhost
127.0.1.1       nasos
::1             localhost ip6-localhost ip6-loopback
ff02::1         ip6-allnodes
ff02::2         ip6-allrouters
HOSTS

echo ">>> [00-configure-base] Creating nasos user and group..."

# Create nasos system user (uid/gid 1000) if it doesn't already exist
if ! id nasos &>/dev/null; then
  useradd \
    --uid 1000 \
    --user-group \
    --create-home \
    --home-dir /home/nasos \
    --shell /bin/bash \
    --comment "nasOS System User" \
    nasos
fi

# Add nasos to required groups
for grp in sudo video render audio input plugdev docker; do
  getent group "$grp" &>/dev/null && usermod -aG "$grp" nasos || true
done

# Passwordless sudo for the nasos service account
echo "nasos ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/nasos
chmod 440 /etc/sudoers.d/nasos

echo ">>> [00-configure-base] Creating directory structure..."

# Application directories
mkdir -p /opt/nasos/{backend,frontend,electron,scripts,data,system}
mkdir -p /opt/nasos/data/{db,logs,backups,docker,ssl}
mkdir -p /opt/nasos/system/configs/nut

# NAS data directories on SD card root (real data goes on attached storage)
mkdir -p /srv/nasos/{shares,timemachine}

# Set ownership
chown -R nasos:nasos /opt/nasos
chown -R nasos:nasos /srv/nasos

# Create empty .env file — populated on first boot
touch /opt/nasos/.env
chown nasos:nasos /opt/nasos/.env

echo ">>> [00-configure-base] Done."
