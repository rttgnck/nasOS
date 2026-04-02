#!/bin/bash
# storage-mount.sh — Manages SATA HAT config and device mounts.
# Called with sudo from the nasOS backend, and by nasos-sata-mount.service on boot.
set -uo pipefail
# NOTE: -e is intentionally omitted — individual failures are handled inline
# so the script can continue mounting remaining devices.

ACTION="${1:-}"
shift || true

NASOS_DIR="/opt/nasos"
MOUNTS_CONFIG="$NASOS_DIR/data/sata-mounts.json"
FSTAB="/etc/fstab"
FSTAB_TAG="# nasos-managed"

CONFIG_TXT=""
for path in /boot/firmware/config.txt /boot/config.txt; do
    [ -f "$path" ] && CONFIG_TXT="$path" && break
done

# ── Helpers ──────────────────────────────────────────────────────

add_fstab_entry() {
    local device="$1" mount_point="$2"

    # Remove any existing nasos-managed entry for this mount point
    remove_fstab_entry "$mount_point"

    # Get UUID and filesystem type via blkid
    local uuid="" fstype="auto"
    eval "$(blkid -o export "$device" 2>/dev/null)" || true
    fstype="${TYPE:-auto}"
    uuid="${UUID:-}"

    local src="$device"
    [ -n "$uuid" ] && src="UUID=$uuid"

    echo "$src  $mount_point  $fstype  defaults,nofail,x-systemd.device-timeout=120  0  2  $FSTAB_TAG" >> "$FSTAB"
    systemctl daemon-reload 2>/dev/null || true
}

remove_fstab_entry() {
    local mount_point="$1"
    if grep -q "$FSTAB_TAG" "$FSTAB" 2>/dev/null; then
        sed -i "\|${mount_point}.*${FSTAB_TAG}|d" "$FSTAB"
        systemctl daemon-reload 2>/dev/null || true
    fi
}

# ── Actions ──────────────────────────────────────────────────────

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

        if [ ! -b "$DEVICE" ]; then
            echo "$DEVICE is not a block device" >&2
            exit 1
        fi

        mkdir -p "$MOUNT_POINT"

        udevadm settle --timeout=10 2>/dev/null || true

        if ! mount "$DEVICE" "$MOUNT_POINT" 2>&1; then
            echo "mount command failed for $DEVICE → $MOUNT_POINT" >&2
            exit 1
        fi

        add_fstab_entry "$DEVICE" "$MOUNT_POINT"
        echo "Mounted $DEVICE at $MOUNT_POINT (fstab entry added)"
        ;;

    unmount)
        MOUNT_POINT="${1:-}"
        DEVICE="${2:-}"
        [ -z "$MOUNT_POINT" ] && \
            echo "Usage: storage-mount.sh unmount <mount_point> [device]" >&2 && exit 1

        umount "$MOUNT_POINT" 2>/dev/null || true
        remove_fstab_entry "$MOUNT_POINT"
        echo "Unmounted $MOUNT_POINT (fstab entry removed)"
        ;;

    remount)
        OLD_MOUNT="${1:-}"
        NEW_MOUNT="${2:-}"
        DEVICE="${3:-}"
        [ -z "$OLD_MOUNT" ] || [ -z "$NEW_MOUNT" ] || [ -z "$DEVICE" ] && \
            echo "Usage: storage-mount.sh remount <old> <new> <device>" >&2 && exit 1

        umount "$OLD_MOUNT" 2>/dev/null || true
        remove_fstab_entry "$OLD_MOUNT"
        mkdir -p "$NEW_MOUNT"

        udevadm settle --timeout=10 2>/dev/null || true

        if ! mount "$DEVICE" "$NEW_MOUNT" 2>&1; then
            echo "mount command failed for $DEVICE → $NEW_MOUNT" >&2
            exit 1
        fi

        add_fstab_entry "$DEVICE" "$NEW_MOUNT"
        echo "Remounted $DEVICE from $OLD_MOUNT to $NEW_MOUNT"
        ;;

    auto-mount)
        # Called by nasos-sata-mount.service on boot.
        # Strategy:
        #   1. Wait for SATA block devices to appear (PCIe init can take time)
        #   2. Let udev finish probing all partition tables and filesystems
        #   3. Run 'mount -a' to process fstab entries (including our nofail ones)
        #   4. Mount anything from sata-mounts.json that fstab missed

        echo "=== nasOS SATA auto-mount starting ==="

        # Phase 1: Wait for udev to settle (initial device enumeration)
        echo "Waiting for udev to settle..."
        udevadm settle --timeout=30 2>/dev/null || true

        if [ ! -f "$MOUNTS_CONFIG" ]; then
            echo "No mount config at $MOUNTS_CONFIG — trying fstab only"
            mount -a 2>&1 || true
            echo "=== auto-mount complete (fstab only) ==="
            exit 0
        fi

        # Parse config: extract device_path, mount_point for every auto_mount entry
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
            echo "No auto-mount devices configured — trying fstab only"
            mount -a 2>&1 || true
            echo "=== auto-mount complete (fstab only) ==="
            exit 0
        fi

        # Phase 2: Wait for all configured block devices to appear
        WAIT_MAX=90
        WAIT_INTERVAL=2
        WAITED=0
        DEVICES_NEEDED=""

        while IFS='|' read -r dev_path mount_path; do
            [ -z "$dev_path" ] && continue
            DEVICES_NEEDED="$DEVICES_NEEDED $dev_path"
        done <<< "$ENTRIES"

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

        # Phase 3: Let udev finish probing filesystems on newly appeared devices
        udevadm settle --timeout=15 2>/dev/null || true
        sleep 1

        # Phase 4: Try fstab-based mounting first (handles UUID-based entries)
        echo "Running mount -a for fstab entries..."
        mount -a 2>&1 || true

        # Phase 5: Mount anything from JSON config that isn't already mounted
        MOUNTED=0
        FAILED=0
        while IFS='|' read -r dev_path mount_path; do
            [ -z "$dev_path" ] && continue

            if [ ! -b "$dev_path" ]; then
                echo "SKIP $dev_path — device not found"
                FAILED=$((FAILED + 1))
                continue
            fi

            if mountpoint -q "$mount_path" 2>/dev/null; then
                echo "OK   $dev_path — already mounted at $mount_path"
                MOUNTED=$((MOUNTED + 1))
                continue
            fi

            mkdir -p "$mount_path"
            if mount "$dev_path" "$mount_path" 2>&1; then
                echo "OK   $dev_path → $mount_path"
                # Ensure fstab entry exists for future boots
                add_fstab_entry "$dev_path" "$mount_path"
                MOUNTED=$((MOUNTED + 1))
            else
                echo "FAIL $dev_path → $mount_path"
                FAILED=$((FAILED + 1))
            fi
        done <<< "$ENTRIES"

        echo "=== auto-mount complete: $MOUNTED mounted, $FAILED failed ==="
        ;;

    *)
        echo "Usage: storage-mount.sh {enable-sata|disable-sata|mount|unmount|remount|auto-mount}" >&2
        exit 1
        ;;
esac
