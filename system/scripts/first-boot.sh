#!/bin/bash
set -euo pipefail

echo "=== nasOS First Boot Setup ==="

DATA_DIR="/opt/nasos/data"

# Create data directory structure
mkdir -p "$DATA_DIR"/{db,logs,backups,docker}
mkdir -p /srv/nasos/{shares,timemachine}

# Generate a unique secret key for JWT
SECRET_KEY=$(openssl rand -hex 32)
echo "NASOS_SECRET_KEY=$SECRET_KEY" >> /opt/nasos/.env

# Set hostname
hostnamectl set-hostname nasos

# Enable and configure avahi
cp /opt/nasos/system/configs/avahi-service.template /etc/avahi/services/nasos.service
systemctl enable avahi-daemon
systemctl start avahi-daemon

# Configure samba with defaults
cp /opt/nasos/system/configs/smb.conf.template /etc/samba/smb.conf
systemctl enable smbd nmbd

# Enable NFS (but don't start until shares are configured)
systemctl enable nfs-kernel-server

# Configure firewall basics
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8080/tcp  # nasOS API
ufw allow 445/tcp   # SMB
ufw allow 139/tcp   # SMB
ufw allow 2049/tcp  # NFS
ufw allow 5353/udp  # mDNS
ufw --force enable

# Generate self-signed SSL certificate for immediate HTTPS
openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout /opt/nasos/data/ssl/nasos.key \
  -out /opt/nasos/data/ssl/nasos.crt \
  -subj "/CN=nasos.local" 2>/dev/null || true

# Mark setup as complete
touch "$DATA_DIR/.setup-complete"

echo "=== First boot setup complete ==="
echo "Access nasOS at https://nasos.local:8080"
