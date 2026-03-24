#!/bin/bash
# storage-mount.sh — Manages SATA HAT config and device mounts.
# Called with sudo from the nasOS backend, and by nasos-sata-mount.service on boot.
set -euo pipefail

ACTION="${1:-}"
shift || true

NASOS_DIR="/opt/nasos"
MOUNTS_CONFIG="$NASOS_DIR/data/sata-mounts.json"

CONFIG_TXT=""
for path in /boot/firmware/config.txt /boot/config.txt; do
    [ -f "$path" ] && CONFIG_TXT="$path" && break
done

case "$ACTION" in
    enable-sata)
        [ -z "$CONFIG_TXT" ] && echo "config.txt not found" >&2 && exit 1
        sed -i '/^#*dtparam=pciex1$/d' "$CONFIG_TXT"
        echo "dtparam=pciex1" >> "$CONFIG_TXT"
        echo "SATA HAT enabled in $CONFIG_TXT"
        ;;

    disable-sata)
        [ -z "$CONFIG_TXT" ] && echo "config.txt not found" >&2 && exit 1
        sed -i '/^dtparam=pciex1$/d' "$CONFIG_TXT"
        echo "SATA HAT disabled in $CONFIG_TXT"
        ;;

    mount)
        DEVICE="${1:-}"
        MOUNT_POINT="${2:-}"
        [ -z "$DEVICE" ] || [ -z "$MOUNT_POINT" ] && \
            echo "Usage: storage-mount.sh mount <device> <mount_point>" >&2 && exit 1

        mkdir -p "$MOUNT_POINT"
        mount "$DEVICE" "$MOUNT_POINT"
        echo "Mounted $DEVICE at $MOUNT_POINT"
        ;;

    unmount)
        MOUNT_POINT="${1:-}"
        [ -z "$MOUNT_POINT" ] && \
            echo "Usage: storage-mount.sh unmount <mount_point> [device]" >&2 && exit 1

        umount "$MOUNT_POINT" 2>/dev/null || true
        echo "Unmounted $MOUNT_POINT"
        ;;

    remount)
        OLD_MOUNT="${1:-}"
        NEW_MOUNT="${2:-}"
        DEVICE="${3:-}"
        [ -z "$OLD_MOUNT" ] || [ -z "$NEW_MOUNT" ] || [ -z "$DEVICE" ] && \
            echo "Usage: storage-mount.sh remount <old> <new> <device>" >&2 && exit 1

        umount "$OLD_MOUNT" 2>/dev/null || true
        mkdir -p "$NEW_MOUNT"
        mount "$DEVICE" "$NEW_MOUNT"
        echo "Remounted $DEVICE from $OLD_MOUNT to $NEW_MOUNT"
        ;;

    auto-mount)
        # Called by nasos-sata-mount.service on boot.
        # Reads sata-mounts.json and mounts every configured device,
        # waiting for each block device to appear (SATA HAT PCIe init).
        if [ ! -f "$MOUNTS_CONFIG" ]; then
            echo "No mount config found at $MOUNTS_CONFIG — nothing to mount"
            exit 0
        fi

        # Parse config: extract device_name, device_path, mount_point for
        # every entry with auto_mount=true
        ENTRIES=$(python3 -c "
import json, sys
try:
    cfg = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for name, dev in cfg.get('devices', {}).items():
    if dev.get('auto_mount'):
        print(f\"{dev['device']}|{dev['mount_point']}\")
" "$MOUNTS_CONFIG" 2>/dev/null) || true

        if [ -z "$ENTRIES" ]; then
            echo "No auto-mount devices configured"
            exit 0
        fi

        WAIT_MAX=90
        WAIT_INTERVAL=2
        WAITED=0
        DEVICES_NEEDED=""

        # Collect all device paths we need to wait for
        while IFS='|' read -r dev_path mount_path; do
            DEVICES_NEEDED="$DEVICES_NEEDED $dev_path"
        done <<< "$ENTRIES"

        # Wait for all devices to appear
        echo "Waiting for SATA devices:$DEVICES_NEEDED (up to ${WAIT_MAX}s)..."
        ALL_READY=false
        while [ "$WAITED" -lt "$WAIT_MAX" ]; do
            ALL_READY=true
            for dev in $DEVICES_NEEDED; do
                if [ ! -b "$dev" ]; then
                    ALL_READY=false
                    break
                fi
            done
            if $ALL_READY; then
                echo "All devices ready after ${WAITED}s"
                break
            fi
            sleep "$WAIT_INTERVAL"
            WAITED=$((WAITED + WAIT_INTERVAL))
        done

        if ! $ALL_READY; then
            echo "WARNING: Not all devices appeared after ${WAIT_MAX}s — mounting what's available"
        fi

        # Mount each configured device
        MOUNTED=0
        FAILED=0
        while IFS='|' read -r dev_path mount_path; do
            if [ ! -b "$dev_path" ]; then
                echo "SKIP $dev_path — device not found"
                FAILED=$((FAILED + 1))
                continue
            fi

            # Already mounted?
            if mountpoint -q "$mount_path" 2>/dev/null; then
                echo "SKIP $dev_path — already mounted at $mount_path"
                MOUNTED=$((MOUNTED + 1))
                continue
            fi

            mkdir -p "$mount_path"
            if mount "$dev_path" "$mount_path" 2>/dev/null; then
                echo "OK   $dev_path → $mount_path"
                MOUNTED=$((MOUNTED + 1))
            else
                echo "FAIL $dev_path → $mount_path"
                FAILED=$((FAILED + 1))
            fi
        done <<< "$ENTRIES"

        echo "Auto-mount complete: $MOUNTED mounted, $FAILED failed"
        ;;

    *)
        echo "Usage: storage-mount.sh {enable-sata|disable-sata|mount|unmount|remount|auto-mount}" >&2
        exit 1
        ;;
esac
