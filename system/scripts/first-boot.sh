#!/bin/bash
set -x  # Log every command for debugging; don't use -e to avoid aborting on non-critical failures

echo "=== nasOS First Boot Setup ==="

DATA_DIR="/opt/nasos/data"

# Create data directory structure (on root partition — for app config, not user data)
mkdir -p "$DATA_DIR"/{db,logs,backups,docker,ssl}

# Set up the data partition (/srv/nasos) for NAS storage.
# This creates partition 3 on the SD card using all remaining space,
# formats it as ext4, adds an fstab entry, and mounts it at /srv/nasos.
/opt/nasos/scripts/setup-data-partition.sh || {
    echo "WARNING: Data partition setup failed — falling back to root filesystem"
    mkdir -p /srv/nasos/{shares,timemachine}
}

# Create Docker data directory on the data partition NOW, before Docker starts.
# /etc/docker/daemon.json (set at image build) points data-root here.
# If the data partition failed to mount above, Docker will fall back to creating
# /srv/nasos/.docker on the root filesystem — not ideal but not fatal.
mkdir -p /srv/nasos/.docker
chown root:root /srv/nasos/.docker
chmod 700 /srv/nasos/.docker
echo ">>> Docker data dir ready: /srv/nasos/.docker"

# ─────────────────────────────────────────
# Fix Pi Imager User Renaming
# If Pi Imager was used, the default 'nasos' user (UID 1000) was renamed to something else.
# We must patch our systemd units and autologin to match the new username.
# ─────────────────────────────────────────
PRIMARY_USER=$(id -nu 1000 2>/dev/null || echo "nasos")
if [ "$PRIMARY_USER" != "nasos" ]; then
  echo ">>> Fixing systemd user references for dynamically renamed user: $PRIMARY_USER"
  sed -i "s/User=nasos/User=$PRIMARY_USER/g" /etc/systemd/system/nasos-backend.service /etc/systemd/system/nasos-electron.service || true
  sed -i "s/Group=nasos/Group=$PRIMARY_USER/g" /etc/systemd/system/nasos-backend.service /etc/systemd/system/nasos-electron.service || true
  # Patch ExecStartPre user lookup in electron service (id -u nasos → id -u $PRIMARY_USER)
  sed -i "s/id -u nasos/id -u $PRIMARY_USER/g" /etc/systemd/system/nasos-electron.service || true
  sed -i "s/autologin nasos/autologin $PRIMARY_USER/g" /etc/systemd/system/getty@tty1.service.d/autologin.conf || true
  systemctl daemon-reload
fi

# ─────────────────────────────────────────
# Install sudoers for backend service
# The backend needs sudo to manage share configs (smb.conf, exports)
# and reload services (smbd, nfs) via share-helper.sh.
# ─────────────────────────────────────────
echo "$PRIMARY_USER ALL=(root) NOPASSWD: /opt/nasos/scripts/share-helper.sh *" > /etc/sudoers.d/nasos-backend
echo "$PRIMARY_USER ALL=(root) NOPASSWD: /opt/nasos/scripts/share-helper.sh" >> /etc/sudoers.d/nasos-backend
echo "$PRIMARY_USER ALL=(root) NOPASSWD: /opt/nasos/scripts/apply-update.sh *" >> /etc/sudoers.d/nasos-backend
# OTA updates via isolated systemd-run cgroup
echo "$PRIMARY_USER ALL=(root) NOPASSWD: /usr/bin/systemd-run --unit=nasos-apply-update --description=nasOS OTA apply --collect /opt/nasos/scripts/apply-update.sh *" >> /etc/sudoers.d/nasos-backend
# Power management
echo "$PRIMARY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reboot" >> /etc/sudoers.d/nasos-backend
echo "$PRIMARY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff" >> /etc/sudoers.d/nasos-backend
chmod 440 /etc/sudoers.d/nasos-backend
echo ">>> Installed sudoers for user: $PRIMARY_USER"

# ─────────────────────────────────────────
# Create built-in 'admin' user
# This is the pre-configured superuser for the nasOS dashboard and all
# network shares. It is ready to use immediately — no setup required.
# Default password: nasos
# Users are prompted to change this on their first dashboard login.
# ─────────────────────────────────────────
ADMIN_DEFAULT_PW="nasos"
# Admin should have the same groups as the primary nasos user so it has full
# system access (video/render for display, docker for containers, shadow for
# auth, etc.).  The primary user gets these in 00-configure-base and 02-configure-services.
ADMIN_GROUPS="nasos,sudo,video,render,audio,input,plugdev,docker,shadow"
if ! id admin &>/dev/null; then
  # Create the admin Linux account with all required groups
  useradd -m -s /bin/bash -c "Administrator" -G "$ADMIN_GROUPS" admin 2>/dev/null \
    || useradd -m -s /bin/bash -c "Administrator" admin 2>/dev/null || true
  printf '%s:%s\n' "admin" "$ADMIN_DEFAULT_PW" | chpasswd
  echo ">>> Created built-in admin user"
else
  echo ">>> Built-in admin user already exists — skipping creation"
fi
# Ensure admin is in all required groups (idempotent on re-runs)
for grp in nasos sudo video render audio input plugdev docker shadow; do
  getent group "$grp" &>/dev/null && usermod -aG "$grp" admin 2>/dev/null || true
done
# Add admin to Samba password database with the default password so network
# shares work immediately — no password setup step required for the admin account.
printf '%s\n%s\n' "$ADMIN_DEFAULT_PW" "$ADMIN_DEFAULT_PW" | smbpasswd -a -s admin 2>/dev/null || true
smbpasswd -e admin 2>/dev/null || true
echo ">>> Samba account for admin user enabled with default password"
# Write the default-password marker — the backend reads this on startup and
# includes a must_change_password flag in login responses for listed users.
echo "admin" > "$DATA_DIR/.default-password-accounts"
echo ">>> Marked admin for required password change on first dashboard login"

# ─────────────────────────────────────────
# WiFi Configuration
# Read wpa_supplicant.conf.template from /boot/firmware/ (Pi 5 Bookworm)
# Falls back to /boot/ for older Pi models.
# ─────────────────────────────────────────
BOOT_DIR=""
if [ -d /boot/firmware ]; then
  BOOT_DIR="/boot/firmware"
elif [ -d /boot ]; then
  BOOT_DIR="/boot"
fi

WIFI_CONF=""
for candidate in "wpa_supplicant.conf" "wpa_supplicant.conf.template"; do
  if [ -n "$BOOT_DIR" ] && [ -f "$BOOT_DIR/$candidate" ]; then
    WIFI_CONF="$BOOT_DIR/$candidate"
    break
  fi
done

if [ -n "$WIFI_CONF" ]; then
  echo ">>> Configuring WiFi from $WIFI_CONF ..."
  SSID=$(grep -m1 'ssid=' "$WIFI_CONF" | sed 's/.*ssid="\(.*\)"/\1/' | tr -d '[:space:]')
  PSK=$(grep -m1 'psk=' "$WIFI_CONF" | sed 's/.*psk="\(.*\)"/\1/' | tr -d '[:space:]')
  COUNTRY=$(grep -m1 '^country=' "$WIFI_CONF" | cut -d= -f2 | tr -d '[:space:]')
  KEY_MGMT=$(grep -m1 'key_mgmt=' "$WIFI_CONF" | awk '{print $1}' | cut -d= -f2 || echo "WPA-PSK")

  # Validate — skip if placeholder values are still present
  if [ -n "$SSID" ] && [ "$SSID" != "YOUR_WIFI_NETWORK_NAME" ] && [ -n "$PSK" ] && [ "$PSK" != "YOUR_WIFI_PASSWORD" ]; then
    # Set regulatory country for WiFi
    if [ -n "$COUNTRY" ]; then
      iw reg set "$COUNTRY" 2>/dev/null || true
    fi

    # Use nmcli (NetworkManager) — standard in Pi OS Bookworm
    if command -v nmcli &>/dev/null; then
      nmcli radio wifi on 2>/dev/null || true
      nmcli device wifi connect "$SSID" password "$PSK" ifname wlan0 2>/dev/null \
        && echo ">>> WiFi connected to: $SSID" \
        || echo ">>> WiFi config saved (will connect on reboot)"
    else
      # Fallback: write to wpa_supplicant directly (older Pi OS)
      cp "$WIFI_CONF" /etc/wpa_supplicant/wpa_supplicant.conf
      chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf
      wpa_cli -i wlan0 reconfigure 2>/dev/null || true
    fi

    # Store configured SSID for the UI to show
    echo "NASOS_WIFI_SSID=$SSID" >> /opt/nasos/.env
    echo "NASOS_WIFI_COUNTRY=${COUNTRY:-US}" >> /opt/nasos/.env
  elif [ -n "$SSID" ] && [ "$SSID" = "YOUR_WIFI_NETWORK_NAME" ]; then
    echo ">>> WiFi template found but not configured — skipping (ethernet only)"
  else
    echo ">>> No WiFi credentials found — ethernet only"
  fi
else
  echo ">>> No wpa_supplicant.conf found in boot partition — ethernet only"
fi

# ─────────────────────────────────────────
# Generate a unique secret key for JWT
# ─────────────────────────────────────────
SECRET_KEY=$(openssl rand -hex 32)
echo "NASOS_SECRET_KEY=$SECRET_KEY" >> /opt/nasos/.env

# ─────────────────────────────────────────
# Set hostname
# ─────────────────────────────────────────
hostnamectl set-hostname nasos

# Avahi / mDNS
cp /opt/nasos/system/configs/avahi-service.template /etc/avahi/services/nasos.service
systemctl enable avahi-daemon
# NOTE: Do NOT call systemctl start here — starting services inside a Type=oneshot
# unit causes a systemd deadlock (the transaction can't complete while waiting
# for the sub-start to finish). Services are enabled and will start after this
# unit exits.

# ─────────────────────────────────────────
# Configure Samba
# ─────────────────────────────────────────
cp /opt/nasos/system/configs/smb.conf.template /etc/samba/smb.conf
systemctl enable smbd nmbd
# NOTE: Do NOT call systemctl start here (see avahi note above)

# Add the primary user to Samba's password database.
# Use the system login password if Pi Imager set one, otherwise skip.
# The user can always set/change their Samba password via the web UI.
# The default 'SD Card' share (guest-accessible, at /srv/nasos/shares) is
# seeded into the database by the backend on first startup.
# The user can always set/change their Samba password via the web UI.
#
# Try to read the Pi Imager password from the boot partition firstrun config;
# If unavailable, create the Samba account but leave it disabled —
# the user will set their password later via the nasOS web interface.
PI_PASSWORD=""
PI_PASS_PLAIN=""
for firstrun in /boot/firmware/firstrun.sh /boot/firstrun.sh; do
  if [ -f "$firstrun" ]; then
    # Pi Imager writes either:
    #   echo 'user:plaintext' | chpasswd          <- plaintext (older Pi Imager)
    #   echo 'user:$6$hash...' | chpasswd -e      <- pre-hashed (newer Pi Imager)
    # Extract the full 'user:...' argument from the echo
    PI_PASSWORD=$(grep -oP "(?<=echo ')[^']*(?='\s*\|\s*chpasswd)" "$firstrun" 2>/dev/null | head -1 || true)
    if [ -n "$PI_PASSWORD" ]; then
      # Only treat as plaintext if chpasswd is called WITHOUT -e on that line
      if grep -q "chpasswd -e" "$firstrun" 2>/dev/null; then
        # Hashed — cannot use for Samba (it needs plaintext)
        echo ">>> Pi Imager used pre-hashed password — Samba password not auto-configured"
        PI_PASS_PLAIN=""
      else
        PI_PASS_PLAIN=$(echo "$PI_PASSWORD" | cut -d: -f2-)
      fi
    fi
    break
  fi
done

if [ -n "$PI_PASS_PLAIN" ]; then
  echo -e "$PI_PASS_PLAIN\n$PI_PASS_PLAIN" | smbpasswd -a -s "$PRIMARY_USER" 2>/dev/null || true
  smbpasswd -e "$PRIMARY_USER" 2>/dev/null || true
  echo ">>> Samba user '$PRIMARY_USER' created with system password"
else
  # No plaintext password available — create Samba account but leave disabled.
  # User MUST set their SMB password via Settings > Users > Set Password in the
  # nasOS desktop, which will call smbpasswd to activate the account.
  echo -e "nasos-temp-setup\nnasos-temp-setup" | smbpasswd -a -s "$PRIMARY_USER" 2>/dev/null || true
  smbpasswd -d "$PRIMARY_USER" 2>/dev/null || true
  echo ">>> Samba user '$PRIMARY_USER' created (disabled — set password via nasOS Settings > Users)"
fi

# Enable NFS (but don't start until shares are configured)
systemctl enable nfs-kernel-server

# ─────────────────────────────────────────
# Firewall basics
# ─────────────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8080/tcp  # nasOS API
ufw allow 445/tcp   # SMB/CIFS (direct TCP)
ufw allow 139/tcp   # SMB/CIFS (NetBIOS over TCP)
ufw allow 137/udp   # NetBIOS Name Service (required for SMB discovery)
ufw allow 138/udp   # NetBIOS Datagram (required for SMB browsing)
ufw allow 2049/tcp  # NFS
ufw allow 5353/udp  # mDNS
ufw --force enable

# ─────────────────────────────────────────
# Generate self-signed SSL certificate
# ─────────────────────────────────────────
mkdir -p /opt/nasos/data/ssl
openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout /opt/nasos/data/ssl/nasos.key \
  -out /opt/nasos/data/ssl/nasos.crt \
  -subj "/CN=nasos.local" 2>/dev/null || true

# ─────────────────────────────────────────
# Fix Permissions
# ─────────────────────────────────────────
# Backend MUST be able to write to data/db and data/logs
chown -R "$PRIMARY_USER:$PRIMARY_USER" /opt/nasos/data /srv/nasos 2>/dev/null || true

# Public share directory needs to be writable by everyone (guest access)
chmod 2777 /srv/nasos/shares 2>/dev/null || true

# admin home dir ownership
chown -R admin:admin /home/admin 2>/dev/null || true

# ─────────────────────────────────────────
# SSH and Hardware init
# ─────────────────────────────────────────
# Generate missing SSH host keys (since pi-gen removes them to ensure uniqueness)
ssh-keygen -A 2>/dev/null || true
# Just ensure ssh is enabled; do NOT restart here (systemd deadlock — see avahi note)
systemctl enable ssh 2>/dev/null || true

# ─────────────────────────────────────────
# Mark setup as complete
# ─────────────────────────────────────────
touch "$DATA_DIR/.setup-complete"

echo "=== First boot setup complete ==="
echo "Access nasOS at http://nasos.local:8080"
