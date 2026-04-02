#!/usr/bin/env bash
# restore-helper.sh — privileged file restore for nasOS system backup
#
# Called by the nasOS backend via sudo to copy system config files
# that require root (smb.conf, exports, config.txt, etc.).
#
# Usage:  restore-helper.sh <extracted-tmp-dir>
#
# The tmp dir is expected to contain:
#   system/etc/samba/smb.conf
#   system/boot/firmware/config.txt
#   system/etc/exports
#   rclone/rclone.conf
# Only files that exist in the tmp dir are copied.

set -euo pipefail

TMP_DIR="${1:-}"

if [ -z "$TMP_DIR" ] || [ ! -d "$TMP_DIR" ]; then
    echo "ERROR: provide a valid extracted backup directory" >&2
    exit 1
fi

RESTORED=0
ERRORS=0

restore_file() {
    local src="$1" dest="$2"
    if [ -f "$src" ]; then
        mkdir -p "$(dirname "$dest")"
        if cp --preserve=mode,timestamps -- "$src" "$dest"; then
            echo "OK $dest"
            RESTORED=$((RESTORED + 1))
        else
            echo "FAIL $dest"
            ERRORS=$((ERRORS + 1))
        fi
    fi
}

# System config files
SYS_DIR="$TMP_DIR/system"
if [ -d "$SYS_DIR" ]; then
    # Walk all files under system/ and restore to their absolute paths
    while IFS= read -r -d '' file; do
        rel="${file#"$SYS_DIR"}"
        restore_file "$file" "$rel"
    done < <(find "$SYS_DIR" -type f -print0)
fi

# rclone config → /home/nasos/.config/rclone/
RC_SRC="$TMP_DIR/rclone/rclone.conf"
if [ -f "$RC_SRC" ]; then
    RC_DEST="/home/nasos/.config/rclone/rclone.conf"
    restore_file "$RC_SRC" "$RC_DEST"
    chown nasos:nasos "$RC_DEST" 2>/dev/null || true
fi

echo "DONE restored=$RESTORED errors=$ERRORS"
exit $ERRORS
