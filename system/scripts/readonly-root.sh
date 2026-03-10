#!/bin/bash
# Setup read-only root filesystem with overlayfs
# This protects the SD card from wear and corruption
set -euo pipefail

echo "=== Configuring read-only root filesystem ==="

# Add overlayfs to initramfs
cat > /etc/initramfs-tools/scripts/overlay <<'OVERLAY_SCRIPT'
#!/bin/sh

case "$1" in
  prereqs)
    echo ""
    exit 0
    ;;
esac

. /scripts/functions

# Only apply if kernel parameter 'overlay' is set
if ! grep -q "overlay" /proc/cmdline; then
  exit 0
fi

log_begin_msg "Setting up overlayfs on root"

# Create mount points
mkdir -p /overlay/lower /overlay/upper /overlay/work /overlay/merged

# Move real root to lower
mount --move ${rootmnt} /overlay/lower

# Mount tmpfs for upper layer
mount -t tmpfs tmpfs /overlay/upper
mkdir -p /overlay/upper/upper /overlay/upper/work

# Create overlay
mount -t overlay overlay \
  -o lowerdir=/overlay/lower,upperdir=/overlay/upper/upper,workdir=/overlay/upper/work \
  ${rootmnt}

# Move lower mount inside the new root for reference
mkdir -p ${rootmnt}/overlay/lower
mount --move /overlay/lower ${rootmnt}/overlay/lower

log_end_msg
OVERLAY_SCRIPT

chmod +x /etc/initramfs-tools/scripts/overlay

# Add tmpfs entries for writable directories
cat >> /etc/fstab <<'EOF'
# nasOS: tmpfs for writable directories on read-only root
tmpfs /tmp     tmpfs defaults,noatime,nosuid,size=100M 0 0
tmpfs /var/tmp tmpfs defaults,noatime,nosuid,size=50M  0 0
tmpfs /var/log tmpfs defaults,noatime,nosuid,size=50M  0 0
EOF

# Rebuild initramfs
update-initramfs -u

echo "=== Read-only root configured ==="
echo "Add 'overlay' to kernel cmdline in /boot/cmdline.txt to enable"
