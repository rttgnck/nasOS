#!/bin/bash
# /opt/nasos/scripts/share-helper.sh
# Privileged helper for nasOS share management.
# Called by the backend via sudo to manage system config files
# that require root permissions (smb.conf, /etc/exports, smbpasswd).
#
# Usage: sudo /opt/nasos/scripts/share-helper.sh <command> [args...]
set -euo pipefail

# ── Mount-namespace escape ───────────────────────────────────────────────────
# When the backend runs under systemd with ProtectSystem=, child processes
# (including this script invoked via sudo) inherit a restricted mount namespace
# where /etc appears read-only even after `mount -o remount,rw /`.
# Detect this and re-exec inside PID 1's (init) mount namespace where /etc
# is truly writable.  nsenter requires root — which we already have via sudo.
if [ "$(readlink /proc/self/ns/mnt 2>/dev/null)" != "$(readlink /proc/1/ns/mnt 2>/dev/null)" ]; then
  exec nsenter -t 1 -m -- "$0" "$@"
fi

LOCKFILE="/run/share-helper.lock"

CMD="${1:-}"
shift || true

# ── Helpers ──────────────────────────────────────────────────────────────────

ensure_rw() {
  # Ensure / is actually writable.  findmnt can report "rw" even when the
  # underlying block device is read-only (e.g. after fs errors), so we also
  # do a real write test to /etc.
  local need_remount=0

  if findmnt -n -o OPTIONS / | grep -qE '(^|,)ro(,|$)'; then
    need_remount=1
  elif ! touch /etc/.rw-test 2>/dev/null; then
    # findmnt says rw but actual writes fail — force remount
    need_remount=1
  else
    rm -f /etc/.rw-test
  fi

  if [ "$need_remount" -eq 1 ]; then
    ROOT_WAS_RO=1
    mount -o remount,rw / || { echo "Failed to remount / rw" >&2; exit 1; }
    # Verify the remount actually worked
    if ! touch /etc/.rw-test 2>/dev/null; then
      echo "Remounted / as rw but /etc is still not writable" >&2
      exit 1
    fi
    rm -f /etc/.rw-test
  fi
}

restore_ro() {
  if [ "${ROOT_WAS_RO:-0}" -eq 1 ]; then
    ROOT_WAS_RO=0
    mount -o remount,ro / 2>/dev/null || true
  fi
}

set_user_password() {
  # Set the Linux password AND Samba password for a user.
  # Usage: set_user_password <username> <password>
  # Caller is responsible for ensure_rw / restore_ro around this call.
  local username="$1" password="$2"

  # Use chpasswd — the standard tool for non-interactive password changes.
  # It handles /etc/shadow locking and atomic writes internally.
  printf '%s:%s\n' "$username" "$password" | chpasswd || {
    echo "chpasswd failed for '$username'" >&2
    exit 1
  }

  # Update Samba password database (add/update + enable).
  printf '%s\n%s\n' "$password" "$password" | smbpasswd -a -s "$username" 2>/dev/null || true
  smbpasswd -e "$username" 2>/dev/null || true
}

# ── Commands ─────────────────────────────────────────────────────────────────

case "$CMD" in
  write-smb)
    cat > /etc/samba/smb.conf
    ;;

  reload-smb)
    systemctl reload smbd 2>/dev/null || systemctl restart smbd 2>/dev/null || true
    ;;

  write-exports)
    cat > /etc/exports
    ;;

  reload-nfs)
    exportfs -ra 2>/dev/null || true
    ;;

  add-smb-user)
    USERNAME="${1:?Usage: share-helper.sh add-smb-user <username>}"
    smbpasswd -a -s "$USERNAME" 2>/dev/null
    smbpasswd -e "$USERNAME" 2>/dev/null || true
    ;;

  del-smb-user)
    USERNAME="${1:?Usage: share-helper.sh del-smb-user <username>}"
    smbpasswd -x "$USERNAME" 2>/dev/null || true
    ;;

  set-password)
    USERNAME="${1:?Usage: share-helper.sh set-password <username>}"
    IFS= read -r PASSWORD || true
    if [ -z "$PASSWORD" ]; then
      echo "Error: no password received on stdin" >&2
      exit 1
    fi
    (
      flock -x -w 10 200 || { echo "Could not acquire lock" >&2; exit 1; }
      ROOT_WAS_RO=0
      trap restore_ro EXIT
      ensure_rw
      set_user_password "$USERNAME" "$PASSWORD"
      restore_ro
    ) 200>"$LOCKFILE"
    ;;

  create-user)
    USERNAME="${1:?Usage: share-helper.sh create-user <username>}"
    FULLNAME="${2:-}"
    GROUPS="${3:-nasos}"
    IFS= read -r PASSWORD || true
    if [ -z "$PASSWORD" ]; then
      echo "Error: no password received on stdin" >&2
      exit 1
    fi
    (
      flock -x -w 10 200 || { echo "Could not acquire lock" >&2; exit 1; }
      ROOT_WAS_RO=0
      trap restore_ro EXIT

      # Remount before useradd — it writes to /etc/passwd, shadow, and group.
      ensure_rw

      if [ -n "$FULLNAME" ]; then
        useradd -m -s /bin/bash -c "$FULLNAME" -G "$GROUPS" "$USERNAME"
      else
        useradd -m -s /bin/bash -G "$GROUPS" "$USERNAME"
      fi

      set_user_password "$USERNAME" "$PASSWORD"
      restore_ro
    ) 200>"$LOCKFILE"
    ;;

  delete-user)
    USERNAME="${1:?Usage: share-helper.sh delete-user <username>}"
    (
      flock -x -w 10 200 || { echo "Could not acquire lock" >&2; exit 1; }
      ROOT_WAS_RO=0
      trap restore_ro EXIT
      ensure_rw
      smbpasswd -x "$USERNAME" 2>/dev/null || true
      userdel -r "$USERNAME" 2>/dev/null || true
      restore_ro
    ) 200>"$LOCKFILE"
    ;;

  mkdir-share)
    SHARE_PATH="${1:?Usage: share-helper.sh mkdir-share <path> [owner]}"
    OWNER="${2:-nasos}"
    mkdir -p "$SHARE_PATH"
    chown "$OWNER:$OWNER" "$SHARE_PATH"
    chmod 2775 "$SHARE_PATH"
    ;;

  add-user-groups)
    USERNAME="${1:?Usage: share-helper.sh add-user-groups <username> <group...>}"
    shift
    for _grp in "$@"; do
      getent group "$_grp" &>/dev/null && usermod -aG "$_grp" "$USERNAME" 2>/dev/null || true
    done
    ;;

  *)
    echo "Unknown command: $CMD" >&2
    echo "Usage: share-helper.sh {write-smb|reload-smb|write-exports|reload-nfs|add-smb-user|del-smb-user|set-password|create-user|delete-user|mkdir-share|add-user-groups}" >&2
    exit 1
    ;;
esac