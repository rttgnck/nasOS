"""User and group management service.

On Linux: wraps useradd/usermod/userdel/groupadd etc.
On macOS (dev): returns mock data.
"""

import platform
import subprocess

_is_linux = platform.system() == "Linux"

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

    cmd = ["useradd", "-m", "-s", "/bin/bash"]
    if fullname:
        cmd.extend(["-c", fullname])
    if groups:
        cmd.extend(["-G", ",".join(groups)])
    cmd.append(username)

    subprocess.check_call(cmd)

    # Set password
    proc = subprocess.Popen(
        ["chpasswd"],
        stdin=subprocess.PIPE,
        text=True,
    )
    proc.communicate(f"{username}:{password}\n")

    return {"username": username, "fullname": fullname, "groups": groups or []}


def delete_user(username: str) -> bool:
    if not _is_linux:
        idx = next((i for i, u in enumerate(_MOCK_USERS) if u["username"] == username), None)
        if idx is not None:
            _MOCK_USERS.pop(idx)
            return True
        return False

    try:
        subprocess.check_call(["userdel", "-r", username])
        return True
    except subprocess.CalledProcessError:
        return False


def _get_user_groups(username: str) -> list[str]:
    try:
        out = subprocess.check_output(["groups", username], text=True)
        # Output: "username : group1 group2 ..."
        return out.strip().split(":")[1].strip().split()
    except (subprocess.CalledProcessError, FileNotFoundError, IndexError):
        return []
