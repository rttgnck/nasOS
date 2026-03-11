#!/bin/bash
# /opt/nasos/scripts/setup-data-partition.sh
# Creates and mounts a data partition (partition 3) on the SD card
# using all remaining space after the root partition.
#
# Called by first-boot.sh. Idempotent — skips if partition already exists.
# Required tools: parted, mkfs.ext4, partprobe, findmnt (all in the image)
set -x

MOUNT_POINT="/srv/nasos"
LABEL="nasos-data"

# ── Identify the disk ─────────────────────────────────────────────
# Find the root device (e.g., /dev/mmcblk0p2) and derive the disk device
ROOT_DEV=$(findmnt -n -o SOURCE /)
if [ -z "$ROOT_DEV" ]; then
    echo "ERROR: Could not determine root device"
    exit 1
fi

# For mmcblk devices: /dev/mmcblk0p2 → disk=/dev/mmcblk0, partition prefix=p
# For sd/nvme devices: /dev/sda2 → disk=/dev/sda, no prefix
if echo "$ROOT_DEV" | grep -q "mmcblk"; then
    DISK=$(echo "$ROOT_DEV" | sed 's/p[0-9]*$//')
    PART3="${DISK}p3"
elif echo "$ROOT_DEV" | grep -q "nvme"; then
    DISK=$(echo "$ROOT_DEV" | sed 's/p[0-9]*$//')
    PART3="${DISK}p3"
else
    DISK=$(echo "$ROOT_DEV" | sed 's/[0-9]*$//')
    PART3="${DISK}3"
fi

echo ">>> Data partition setup: disk=$DISK, target=$PART3, mount=$MOUNT_POINT"

# ── Create partition if it doesn't exist ──────────────────────────
if [ -b "$PART3" ]; then
    echo ">>> Partition $PART3 already exists — skipping creation"
else
    echo ">>> Creating partition 3 on $DISK ..."

    # Get the end sector of partition 2
    END_OF_P2=$(parted -s "$DISK" unit s print | awk '/^ 2 /{print $3}' | tr -d 's')
    if [ -z "$END_OF_P2" ]; then
        echo "ERROR: Could not determine end of partition 2 on $DISK"
        exit 1
    fi

    START=$(( END_OF_P2 + 1 ))

    # Create partition 3 from end of partition 2 to end of disk
    parted -s "$DISK" mkpart primary ext4 "${START}s" 100%

    # Wait for the kernel to recognise the new partition
    partprobe "$DISK"
    sleep 2

    # Retry once if the device node hasn't appeared yet
    if [ ! -b "$PART3" ]; then
        echo ">>> Waiting for $PART3 ..."
        sleep 3
    fi

    if [ ! -b "$PART3" ]; then
        echo "ERROR: $PART3 not found after partprobe — aborting"
        exit 1
    fi

    echo ">>> Formatting $PART3 as ext4 (label: $LABEL) ..."
    mkfs.ext4 -L "$LABEL" -q "$PART3"
fi

# ── Add fstab entry ───────────────────────────────────────────────
if ! grep -q "$LABEL" /etc/fstab && ! grep -q "$PART3" /etc/fstab; then
    echo "LABEL=$LABEL  $MOUNT_POINT  ext4  defaults,noatime  0  2" >> /etc/fstab
    echo ">>> Added fstab entry for $LABEL at $MOUNT_POINT"
fi

# ── Mount ─────────────────────────────────────────────────────────
if ! mountpoint -q "$MOUNT_POINT"; then
    mkdir -p "$MOUNT_POINT"
    mount "$MOUNT_POINT"
fi

# ── Create share directory structure ──────────────────────────────
mkdir -p "$MOUNT_POINT/shares" "$MOUNT_POINT/timemachine"

echo ">>> Data partition ready: $PART3 mounted at $MOUNT_POINT"
