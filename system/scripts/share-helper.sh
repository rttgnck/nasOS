#!/bin/bash
# /opt/nasos/scripts/share-helper.sh
# Privileged helper for nasOS share management.
# Called by the backend via sudo to manage system config files
# that require root permissions (smb.conf, /etc/exports, smbpasswd).
#
# Usage: sudo /opt/nasos/scripts/share-helper.sh <command> [args...]
set -euo pipefail

CMD="${1:-}"
shift || true

case "$CMD" in
  write-smb)
    # Write smb.conf from stdin
    cat > /etc/samba/smb.conf
    ;;

  reload-smb)
    # Reload samba config (restart if reload fails)
    systemctl reload smbd 2>/dev/null || systemctl restart smbd 2>/dev/null || true
    ;;

  write-exports)
    # Write /etc/exports from stdin
    cat > /etc/exports
    ;;

  reload-nfs)
    # Re-export NFS shares
    exportfs -ra 2>/dev/null || true
    ;;

  add-smb-user)
    # Add a user to Samba password database
    # Usage: share-helper.sh add-smb-user <username>
    # Password is read from stdin (two lines: password\npassword\n)
    USERNAME="${1:?Usage: share-helper.sh add-smb-user <username>}"
    smbpasswd -a -s "$USERNAME" 2>/dev/null
    smbpasswd -e "$USERNAME" 2>/dev/null || true
    ;;

  del-smb-user)
    # Remove a user from Samba password database
    # Usage: share-helper.sh del-smb-user <username>
    USERNAME="${1:?Usage: share-helper.sh del-smb-user <username>}"
    smbpasswd -x "$USERNAME" 2>/dev/null || true
    ;;

  set-password)
    # Set the Linux system password AND Samba password for an existing user.
    # Usage: share-helper.sh set-password <username>
    # The new password is passed on stdin (one line only)
    USERNAME="${1:?Usage: share-helper.sh set-password <username>}"
    IFS= read -r PASSWORD
    # Update Linux shadow password
    printf '%s:%s\n' "$USERNAME" "$PASSWORD" | chpasswd
    # Update Samba password database (add/update + enable)
    printf '%s\n%s\n' "$PASSWORD" "$PASSWORD" | smbpasswd -a -s "$USERNAME" 2>/dev/null || true
    smbpasswd -e "$USERNAME" 2>/dev/null || true
    ;;

  create-user)
    # Create a new Linux system user, set their password, and add to Samba.
    # Usage: share-helper.sh create-user <username> <fullname> <groups>
    # The new password is passed on stdin (one line only)
    USERNAME="${1:?Usage: share-helper.sh create-user <username>}"
    FULLNAME="${2:-}"
    GROUPS="${3:-nasos}"
    IFS= read -r PASSWORD
    # Create the Linux user
    if [ -n "$FULLNAME" ]; then
      useradd -m -s /bin/bash -c "$FULLNAME" -G "$GROUPS" "$USERNAME"
    else
      useradd -m -s /bin/bash -G "$GROUPS" "$USERNAME"
    fi
    # Set Linux password
    printf '%s:%s\n' "$USERNAME" "$PASSWORD" | chpasswd
    # Add to Samba password database and enable
    printf '%s\n%s\n' "$PASSWORD" "$PASSWORD" | smbpasswd -a -s "$USERNAME" 2>/dev/null || true
    smbpasswd -e "$USERNAME" 2>/dev/null || true
    ;;

  delete-user)
    # Remove a Linux user (and their home dir) plus their Samba entry.
    # Usage: share-helper.sh delete-user <username>
    USERNAME="${1:?Usage: share-helper.sh delete-user <username>}"
    smbpasswd -x "$USERNAME" 2>/dev/null || true
    userdel -r "$USERNAME" 2>/dev/null || true
    ;;

  mkdir-share)
    # Create a share directory with proper ownership
    # Usage: share-helper.sh mkdir-share <path> [owner]
    SHARE_PATH="${1:?Usage: share-helper.sh mkdir-share <path> [owner]}"
    OWNER="${2:-nasos}"
    mkdir -p "$SHARE_PATH"
    chown "$OWNER:$OWNER" "$SHARE_PATH"
    chmod 2775 "$SHARE_PATH"
    ;;

  *)
    echo "Unknown command: $CMD" >&2
    echo "Usage: share-helper.sh {write-smb|reload-smb|write-exports|reload-nfs|add-smb-user|del-smb-user|set-password|create-user|delete-user|mkdir-share}" >&2
    exit 1
    ;;
esac
