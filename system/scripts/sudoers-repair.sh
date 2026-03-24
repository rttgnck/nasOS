#!/bin/bash
# sudoers-repair.sh — Ensures all required NOPASSWD rules and services exist.
# Called by apply-update.sh AFTER new scripts are deployed to /opt/nasos/scripts/,
# so new rules added here take effect on the SAME OTA that delivers this file
# (no one-OTA-delay).
#
# Usage: sudoers-repair.sh <owner> <nasos_dir> <sudoers_file>
set -uo pipefail

OWNER="${1:?owner required}"
NASOS_DIR="${2:?nasos_dir required}"
SUDOERS_FILE="${3:?sudoers_file required}"

[[ -f "$SUDOERS_FILE" ]] || exit 0

add_rule() {
    local tag="$1" rule="$2"
    if ! grep -q "$tag" "$SUDOERS_FILE" 2>/dev/null; then
        echo "$rule" >> "$SUDOERS_FILE"
        echo "  sudoers-repair: added $tag"
    fi
}

# OTA updates via systemd-run cgroup isolation
add_rule 'systemd-run.*nasos-apply-update' \
    "$OWNER ALL=(root) NOPASSWD: /usr/bin/systemd-run --unit=nasos-apply-update --description=nasOS OTA apply --collect $NASOS_DIR/scripts/apply-update.sh *"

# Display setup — screen rotation and touch calibration
add_rule 'display-setup.sh' \
    "$OWNER ALL=(root) NOPASSWD: $NASOS_DIR/scripts/display-setup.sh"

# Storage mount management — SATA HAT config and block device mounts
add_rule 'storage-mount.sh \*' \
    "$OWNER ALL=(root) NOPASSWD: $NASOS_DIR/scripts/storage-mount.sh *"
add_rule 'storage-mount.sh$' \
    "$OWNER ALL=(root) NOPASSWD: $NASOS_DIR/scripts/storage-mount.sh"

chmod 440 "$SUDOERS_FILE"

# ── Enable SATA auto-mount service ──────────────────────────────
# nasos-sata-mount.service reads sata-mounts.json on boot and mounts
# all configured drives (waits for PCIe/SATA device enumeration).
if [[ -f /etc/systemd/system/nasos-sata-mount.service ]]; then
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable nasos-sata-mount.service 2>/dev/null || true
    echo "  sudoers-repair: enabled nasos-sata-mount.service"
fi

# ── Clean up stale fstab entries ─────────────────────────────────
# Old versions wrote UUID-based fstab entries for SATA mounts. Now handled
# by nasos-sata-mount.service instead. Remove the old fstab lines to
# avoid double-mount attempts.
if [[ -f "$NASOS_DIR/data/sata-mounts.json" ]]; then
    python3 -c "
import json, subprocess, sys
try:
    cfg = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for name, dev in cfg.get('devices', {}).items():
    device = dev.get('device', '')
    if not device:
        continue
    try:
        uuid = subprocess.check_output(
            ['blkid', '-s', 'UUID', '-o', 'value', device],
            stderr=subprocess.DEVNULL, timeout=5
        ).decode().strip()
    except Exception:
        continue
    if uuid:
        subprocess.run(
            ['sed', '-i', f'/^UUID={uuid} /d', '/etc/fstab'],
            stderr=subprocess.DEVNULL
        )
        print(f'  sudoers-repair: removed fstab entry for UUID={uuid}')
" "$NASOS_DIR/data/sata-mounts.json" 2>/dev/null || true
fi
