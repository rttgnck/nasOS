#!/bin/bash
# Setup read-only root filesystem with overlayfs
# This protects the SD card from wear and corruption
set -euo pipefail

echo "=== Configuring tmpfs mounts for SD card wear reduction ==="

# NOTE: The overlayfs read-only root feature has been removed.
# It caused system-breaking failures (password changes, system updates) because
# chpasswd, usermod, and other tools cannot atomically replace /etc/shadow under
# an overlayfs/tmpfs upper layer.  A writable ext4 root with tmpfs overlays
# for high-churn directories is the correct approach for a NAS appliance.

# Add tmpfs for high-churn directories to reduce unnecessary SD card writes.
# (These lines are idempotent — the check prevents duplicate fstab entries.)
for MOUNT_LINE in \
  "tmpfs /tmp     tmpfs defaults,noatime,nosuid,size=100M 0 0" \
  "tmpfs /var/tmp tmpfs defaults,noatime,nosuid,size=50M  0 0" \
  "tmpfs /var/log tmpfs defaults,noatime,nosuid,size=50M  0 0"; do
  MOUNT_POINT=$(echo "$MOUNT_LINE" | awk '{print $2}')
  if ! grep -q "tmpfs $MOUNT_POINT " /etc/fstab 2>/dev/null; then
    echo "$MOUNT_LINE" >> /etc/fstab
    echo "  Added: $MOUNT_LINE"
  fi
done

# Ensure 'overlay' is NOT in cmdline.txt (safety clean-up if it was set before).
for CMDLINE_F in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
  if [[ -f "$CMDLINE_F" ]] && grep -qE '\boverlay\b' "$CMDLINE_F"; then
    sed -i -E 's/\boverlay\b//g; s/[[:space:]]+/ /g; s/^ //; s/ $//' "$CMDLINE_F"
    echo "  Removed 'overlay' from $CMDLINE_F"
  fi
done

echo "=== tmpfs mounts configured (root filesystem remains writable) ==="
