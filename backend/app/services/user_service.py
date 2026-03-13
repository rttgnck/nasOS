"""User and group management service.

On Linux: wraps useradd/usermod/userdel/groupadd etc.
On macOS (dev): returns mock data.

When creating or deleting users, also syncs them into the Samba
password database so they can authenticate to SMB shares.
"""

import logging
import platform
import subprocess
from pathlib import Path

from app.core.config import settings

_is_linux = platform.system() == "Linux"
_log = logging.getLogger(__name__)

ADMIN_DEFAULT_PASSWORD = "nasos"

# File that lists users who must change their password on next login.
# Written by first-boot.sh (always contains "admin") and by ensure_admin_user().
# Cleared per-user by the password-change API endpoint.
_DEFAULT_PW_MARKER: Path = settings.data_dir / ".default-password-accounts"


def needs_password_change(username: str) -> bool:
    """Return True if this user still has a default/temporary password."""
    try:
        if not _DEFAULT_PW_MARKER.exists():
            return False
        return username in {u.strip() for u in _DEFAULT_PW_MARKER.read_text().splitlines() if u.strip()}
    except OSError:
        return False


def mark_password_change_required(username: str) -> None:
    """Flag a user as requiring a password change on next login."""
    try:
        _DEFAULT_PW_MARKER.parent.mkdir(parents=True, exist_ok=True)
        current: set[str] = set()
        if _DEFAULT_PW_MARKER.exists():
            current = {u.strip() for u in _DEFAULT_PW_MARKER.read_text().splitlines() if u.strip()}
        current.add(username)
        _DEFAULT_PW_MARKER.write_text("\n".join(sorted(current)) + "\n")
    except OSError as e:
        _log.warning("Could not write default-password marker: %s", e)


def clear_password_change_required(username: str) -> None:
    """Remove the password-change requirement for a user."""
    try:
        if not _DEFAULT_PW_MARKER.exists():
            return
        current = {u.strip() for u in _DEFAULT_PW_MARKER.read_text().splitlines() if u.strip()}
        current.discard(username)
        if current:
            _DEFAULT_PW_MARKER.write_text("\n".join(sorted(current)) + "\n")
        else:
            _DEFAULT_PW_MARKER.unlink(missing_ok=True)
    except OSError as e:
        _log.warning("Could not update default-password marker: %s", e)


def ensure_admin_user() -> None:
    """Ensure the built-in admin user exists and is fully configured.

    Called at backend startup (idempotent). Handles deployments that were
    flashed before first-boot.sh gained admin-user creation, so existing
    devices get the admin account without reimaging.

    - Creates the Linux user if missing, with ADMIN_DEFAULT_PASSWORD
    - Adds them to the nasos + sudo groups
    - Activates their Samba account (so shares work immediately)
    - Writes the must-change-password marker
    Skipped entirely on macOS dev machines OR when the admin user already exists
    (to avoid resetting a password that the user has already changed).
    """
    if not _is_linux:
        return

    from app.services.share_service import _sudo_helper

    try:
        import pwd as _pwd
        _pwd.getpwnam("admin")
        # Admin user already exists — trust first-boot.sh to have set everything up.
        # Never overwrite Samba password here: would lock out users who already
        # changed their password to a custom one.
        return
    except KeyError:
        pass

    # Admin user is missing — this is an existing image that pre-dates this feature.
    _log.info("Built-in admin user not found — creating now (legacy image)")
    ok = _sudo_helper(
        "create-user", "admin", "Administrator",
        "nasos,sudo,video,render,audio,input,plugdev,docker,shadow",
        stdin_data=f"{ADMIN_DEFAULT_PASSWORD}\n",
    )
    if not ok:
        _log.warning("Failed to create built-in admin user — check systemd logs")
        return

    # Activate Samba account for the freshly created admin
    _sudo_helper(
        "add-smb-user", "admin",
        stdin_data=f"{ADMIN_DEFAULT_PASSWORD}\n{ADMIN_DEFAULT_PASSWORD}\n",
    )
    # Flag the account for required password change on next dashboard login
    mark_password_change_required("admin")
    _log.info("Built-in admin user created with default password (must_change_password set)")

# ── Mock data for dev ──────────────────────────────────────────────

_MOCK_USERS = [
    {"uid": 1000, "username": "admin", "fullname": "Administrator", "groups": ["sudo", "nasos", "samba"], "shell": "/bin/bash", "home": "/home/admin"},
    {"uid": 1001, "username": "alice", "fullname": "Alice Smith", "groups": ["nasos", "samba"], "shell": "/bin/bash", "home": "/home/alice"},
    {"uid": 1002, "username": "bob", "fullname": "Bob Jones", "groups": ["nasos", "samba", "media"], "shell": "/bin/bash", "home": "/home/bob"},
    {"uid": 1003, "username": "guest", "fullname": "Guest User", "groups": ["nogroup"], "shell": "/usr/sbin/nologin", "home": "/home/guest"},
]

_MOCK_GROUPS = [
    {"gid": 1000, "name": "nasos", "members": ["admin", "alice", "bob"]},
    {"gid": 1001, "name": "samba", "members": ["admin", "alice", "bob"]},
    {"gid": 1002, "name": "media", "members": ["bob"]},
    {"gid": 27, "name": "sudo", "members": ["admin"]},
    {"gid": 65534, "name": "nogroup", "members": ["guest"]},
]


def get_users() -> list[dict]:
    if not _is_linux:
        return _MOCK_USERS

    users = []
    try:
        out = subprocess.check_output(
            ["getent", "passwd"], text=True
        )
        for line in out.strip().splitlines():
            parts = line.split(":")
            uid = int(parts[2])
            if uid < 1000 or uid >= 65534:
                continue
            username = parts[0]
            groups = _get_user_groups(username)
            users.append({
                "uid": uid,
                "username": username,
                "fullname": parts[4].split(",")[0] if parts[4] else "",
                "groups": groups,
                "shell": parts[6],
                "home": parts[5],
            })
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return users


def get_groups() -> list[dict]:
    if not _is_linux:
        return _MOCK_GROUPS

    groups = []
    try:
        out = subprocess.check_output(
            ["getent", "group"], text=True
        )
        for line in out.strip().splitlines():
            parts = line.split(":")
            gid = int(parts[2])
            groups.append({
                "gid": gid,
                "name": parts[0],
                "members": [m for m in parts[3].split(",") if m],
            })
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return groups


def create_user(username: str, password: str, fullname: str = "", groups: list[str] | None = None) -> dict:
    if not _is_linux:
        new_user = {
            "uid": 1000 + len(_MOCK_USERS),
            "username": username,
            "fullname": fullname,
            "groups": groups or ["nasos"],
            "shell": "/bin/bash",
            "home": f"/home/{username}",
        }
        _MOCK_USERS.append(new_user)
        return new_user

    from app.services.share_service import _sudo_helper

    groups_str = ",".join(groups) if groups else "nasos"
    ok = _sudo_helper("create-user", username, fullname or "", groups_str, stdin_data=f"{password}\n")
    if not ok:
        raise RuntimeError(f"Failed to create user '{username}' — check system logs")

    return {"username": username, "fullname": fullname, "groups": groups or ["nasos"]}


def delete_user(username: str) -> bool:
    if not _is_linux:
        idx = next((i for i, u in enumerate(_MOCK_USERS) if u["username"] == username), None)
        if idx is not None:
            _MOCK_USERS.pop(idx)
            return True
        return False

    from app.services.share_service import _sudo_helper

    _sudo_helper("delete-user", username)
    return True


def _get_user_groups(username: str) -> list[str]:
    try:
        out = subprocess.check_output(["groups", username], text=True)
        # Output: "username : group1 group2 ..."
        return out.strip().split(":")[1].strip().split()
    except (subprocess.CalledProcessError, FileNotFoundError, IndexError):
        return []


# ── Samba user sync ──────────────────────────────────────────────────


def _sync_samba_user(username: str, password: str):
    """Add a user to Samba's password database when they are created."""
    try:
        from app.services.share_service import add_samba_user
        add_samba_user(username, password)
    except Exception as e:
        _log.warning("Failed to add Samba user '%s': %s", username, e)


def _remove_samba_user(username: str):
    """Remove a user from Samba's password database when they are deleted."""
    try:
        from app.services.share_service import remove_samba_user
        remove_samba_user(username)
    except Exception as e:
        _log.warning("Failed to remove Samba user '%s': %s", username, e)


def change_password(username: str, new_password: str) -> dict:
    """
    Set a new Linux system password AND Samba password for an existing user.

    Routes through share-helper.sh (run via sudo) because the backend runs as
    an unprivileged service user and cannot call chpasswd/smbpasswd directly.
    """
    if not _is_linux:
        return {"ok": True}  # no-op in dev

    if not username or not new_password:
        raise ValueError("username and new_password are required")

    from app.services.share_service import _sudo_helper

    # raise_on_error=True surfaces the actual stderr from chpasswd/smbpasswd
    # so the API response (and the frontend) shows the real failure reason.
    _sudo_helper("set-password", username, stdin_data=f"{new_password}\n", raise_on_error=True)

    _log.info("Password changed for user '%s' (Linux + Samba)", username)
    return {"ok": True}
