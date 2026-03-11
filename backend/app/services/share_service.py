"""Share management service — manages SMB/NFS/WebDAV shares.

On Linux: uses a privileged helper script (via sudo) to write system
config files (/etc/samba/smb.conf, /etc/exports) and reload services.
On macOS (dev): stores state in DB only, skips system integration.
"""

import logging
import platform
import subprocess
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.share import Share

_is_linux = platform.system() == "Linux"
_log = logging.getLogger(__name__)

HELPER = "/opt/nasos/scripts/share-helper.sh"
SMB_CONF = Path("/etc/samba/smb.conf")
EXPORTS = Path("/etc/exports")


# ── Public CRUD (called by API routes) ───────────────────────────────


async def list_shares(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Share).order_by(Share.name))
    shares = result.scalars().all()
    return [_share_to_dict(s) for s in shares]


async def get_share(db: AsyncSession, share_id: int) -> dict | None:
    share = await db.get(Share, share_id)
    return _share_to_dict(share) if share else None


async def create_share(db: AsyncSession, data: dict) -> dict:
    share = Share(**data)
    db.add(share)
    await db.commit()
    await db.refresh(share)

    # Create share directory if it doesn't exist
    _ensure_share_dir(share.path)

    # Apply to system — don't let system-level errors crash the API
    try:
        _apply_share(share)
    except Exception as e:
        _log.warning("Failed to apply share config for '%s': %s", share.name, e)

    return _share_to_dict(share)


async def update_share(db: AsyncSession, share_id: int, data: dict) -> dict | None:
    share = await db.get(Share, share_id)
    if not share:
        return None

    for key, value in data.items():
        if hasattr(share, key) and key not in ("id", "created_at"):
            setattr(share, key, value)

    await db.commit()
    await db.refresh(share)

    # Ensure directory exists (path may have changed)
    _ensure_share_dir(share.path)

    try:
        _apply_share(share)
    except Exception as e:
        _log.warning("Failed to apply share config for '%s': %s", share.name, e)

    return _share_to_dict(share)


async def delete_share(db: AsyncSession, share_id: int) -> bool:
    share = await db.get(Share, share_id)
    if not share:
        return False

    try:
        _remove_share(share)
    except Exception as e:
        _log.warning("Failed to remove share config for '%s': %s", share.name, e)

    await db.delete(share)
    await db.commit()
    return True


async def toggle_share(db: AsyncSession, share_id: int) -> dict | None:
    share = await db.get(Share, share_id)
    if not share:
        return None

    share.enabled = not share.enabled
    await db.commit()
    await db.refresh(share)

    try:
        if share.enabled:
            _apply_share(share)
        else:
            _remove_share(share)
    except Exception as e:
        _log.warning("Failed to toggle share config for '%s': %s", share.name, e)

    return _share_to_dict(share)


async def seed_default_shares(db: AsyncSession) -> None:
    """Seed the default storage share on first run.

    Called at backend startup. Only creates the share when the shares table
    is empty, so it is safe to call on every restart (idempotent).
    Skipped entirely on macOS dev machines.
    """
    if not _is_linux:
        return

    result = await db.execute(select(Share))
    if result.scalars().first() is not None:
        return  # Shares already configured — nothing to do

    _log.info("First run: seeding default 'Storage' share at /srv/nasos/shares")
    share = Share(
        name="Storage",
        path="/srv/nasos/shares",
        protocol="smb",
        enabled=True,
        read_only=False,
        guest_access=True,
        description="NAS storage on data partition",
        allowed_users="",
        allowed_hosts="",
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    _ensure_share_dir(share.path)
    try:
        _apply_share(share)
    except Exception as e:
        _log.warning("Failed to apply default share config: %s", e)


def ensure_smb_global_settings() -> None:
    """Patch legacy smb.conf global settings on existing deployments.

    Called at startup (idempotent). Ensures:
    - 'server smb encrypt' is set to 'if_required' (not 'desired'), which
      caused macOS Ventura/Sonoma to hang indefinitely during the SMB3
      encryption handshake for guest connections.
    - 'map to guest = Bad User' is present (enables guest fallback).
    - 'restrict anonymous = 0' and 'guest account = nobody' are present so
      unauthenticated clients can complete the session negotiation.

    Skipped entirely on macOS dev machines and when smb.conf doesn't exist.
    """
    if not _is_linux:
        return
    if not SMB_CONF.exists():
        return

    try:
        conf = SMB_CONF.read_text()
        patched = conf

        # Replace old 'desired' with 'if_required'
        if "server smb encrypt = desired" in patched:
            patched = patched.replace(
                "server smb encrypt = desired",
                "server smb encrypt = if_required"
            )
            _log.info("Patched smb.conf: server smb encrypt desired → if_required")

        # Inject missing guest/anonymous settings after 'map to guest' line
        if "map to guest" in patched and "restrict anonymous" not in patched:
            patched = patched.replace(
                "   map to guest = Bad User",
                "   map to guest = Bad User\n   guest account = nobody\n   restrict anonymous = 0"
            )
            _log.info("Patched smb.conf: added guest account + restrict anonymous")
        elif "map to guest" in patched and "guest account" not in patched:
            patched = patched.replace(
                "   map to guest = Bad User",
                "   map to guest = Bad User\n   guest account = nobody"
            )
            _log.info("Patched smb.conf: added guest account")

        if patched != conf:
            _sudo_helper("write-smb", stdin_data=patched)
            _sudo_helper("reload-smb")
    except Exception as e:
        _log.warning("Failed to patch smb.conf global settings: %s", e)


# ── Serialisation ────────────────────────────────────────────────────


def _share_to_dict(share: Share) -> dict:
    return {
        "id": share.id,
        "name": share.name,
        "path": share.path,
        "protocol": share.protocol,
        "enabled": share.enabled,
        "read_only": share.read_only,
        "guest_access": share.guest_access,
        "description": share.description or "",
        "allowed_users": [u.strip() for u in (share.allowed_users or "").split(",") if u.strip()],
        "allowed_hosts": [h.strip() for h in (share.allowed_hosts or "").split(",") if h.strip()],
        "created_at": share.created_at.isoformat() if share.created_at else None,
        "updated_at": share.updated_at.isoformat() if share.updated_at else None,
    }


# ── Privileged helper interface ──────────────────────────────────────


def _sudo_helper(*args: str, stdin_data: str | None = None) -> bool:
    """Run the privileged share-helper script via sudo.

    Returns True on success, False on failure.
    """
    cmd = ["sudo", HELPER, *args]
    try:
        result = subprocess.run(
            cmd,
            input=stdin_data,
            text=True,
            capture_output=True,
            timeout=15,
        )
        if result.returncode != 0:
            _log.warning(
                "share-helper %s failed (rc=%d): %s",
                args[0] if args else "?",
                result.returncode,
                result.stderr.strip(),
            )
            return False
        return True
    except subprocess.TimeoutExpired:
        _log.warning("share-helper %s timed out", args[0] if args else "?")
        return False
    except FileNotFoundError:
        _log.warning("sudo or share-helper not found")
        return False


def _ensure_share_dir(path: str):
    """Create the share directory if it doesn't exist (Linux only)."""
    if not _is_linux:
        return
    if not Path(path).exists():
        _sudo_helper("mkdir-share", path)


# ── SMB config management ───────────────────────────────────────────


def _build_smb_section(share: Share) -> str:
    """Build an smb.conf [section] for a share."""
    lines = [f"\n[{share.name}]"]
    lines.append(f"   path = {share.path}")
    if share.description:
        lines.append(f"   comment = {share.description}")
    lines.append("   browseable = yes")
    lines.append(f"   read only = {'yes' if share.read_only else 'no'}")
    lines.append(f"   guest ok = {'yes' if share.guest_access else 'no'}")
    if share.guest_access:
        # Force all connections (including anonymous guests) to run as the
        # NAS service user so they have the correct filesystem permissions.
        # Without this, guest maps to the 'nobody' account which typically
        # cannot write to /srv/nasos/shares even with broad permissions, and
        # macOS Ventura/Sonoma hangs mid-handshake trying to validate the
        # guest session before it receives an "access granted" response.
        lines.append("   force user = nasos")
        lines.append("   force group = nasos")
        lines.append("   create mask = 0664")
        lines.append("   directory mask = 0775")
    else:
        lines.append("   create mask = 0664")
        lines.append("   directory mask = 0775")
    if share.allowed_users:
        users = " ".join(u.strip() for u in share.allowed_users.split(",") if u.strip())
        if users:
            lines.append(f"   valid users = {users}")
    return "\n".join(lines) + "\n"


def _remove_section_from_text(text: str, section_name: str) -> str:
    """Remove a named [section] from smb.conf text content."""
    lines = text.splitlines(keepends=True)
    new_lines: list[str] = []
    skip = False
    for line in lines:
        stripped = line.strip().lower()
        if stripped == f"[{section_name.lower()}]":
            skip = True
            continue
        if skip and line.strip().startswith("["):
            skip = False
        if not skip:
            new_lines.append(line)
    return "".join(new_lines)


def _apply_smb(share: Share):
    """Add or update an SMB share in smb.conf via the privileged helper."""
    if not SMB_CONF.exists():
        _log.warning("smb.conf not found — skipping SMB config")
        return

    # Read current config (world-readable, no sudo needed)
    conf = SMB_CONF.read_text()

    # Remove any existing section for this share, then append new one
    conf = _remove_section_from_text(conf, share.name)
    conf += _build_smb_section(share)

    # Write via privileged helper
    _sudo_helper("write-smb", stdin_data=conf)
    _sudo_helper("reload-smb")


def _remove_smb(name: str):
    """Remove an SMB share section from smb.conf."""
    if not SMB_CONF.exists():
        return

    conf = SMB_CONF.read_text()
    conf = _remove_section_from_text(conf, name)
    _sudo_helper("write-smb", stdin_data=conf)
    _sudo_helper("reload-smb")


# ── NFS export management ───────────────────────────────────────────


def _build_nfs_export(share: Share) -> str:
    """Build an /etc/exports line for a share.

    NFS exports format requires each host to have its own options block:
      /path  host1(opts) host2(opts)
    """
    opts = "ro,sync,no_subtree_check" if share.read_only else "rw,sync,no_subtree_check"
    if share.allowed_hosts:
        hosts = [h.strip() for h in share.allowed_hosts.split(",") if h.strip()]
        host_parts = " ".join(f"{h}({opts})" for h in hosts)
    else:
        host_parts = f"*({opts})"
    return f"{share.path}  {host_parts}\n"


def _remove_export_from_text(text: str, path: str) -> str:
    """Remove an export line by path from /etc/exports content."""
    lines = text.splitlines(keepends=True)
    return "".join(ln for ln in lines if not ln.strip().startswith(path))


def _apply_nfs(share: Share):
    """Add or update an NFS export via the privileged helper."""
    exports = EXPORTS.read_text() if EXPORTS.exists() else ""
    exports = _remove_export_from_text(exports, share.path)
    exports += _build_nfs_export(share)
    _sudo_helper("write-exports", stdin_data=exports)
    _sudo_helper("reload-nfs")


def _remove_nfs(path: str):
    """Remove an NFS export."""
    if not EXPORTS.exists():
        return
    exports = EXPORTS.read_text()
    exports = _remove_export_from_text(exports, path)
    _sudo_helper("write-exports", stdin_data=exports)
    _sudo_helper("reload-nfs")


# ── Samba user management (used by user_service) ─────────────────────


def add_samba_user(username: str, password: str):
    """Add a user to Samba's password database."""
    if not _is_linux:
        return
    _sudo_helper("add-smb-user", username, stdin_data=f"{password}\n{password}\n")


def remove_samba_user(username: str):
    """Remove a user from Samba's password database."""
    if not _is_linux:
        return
    _sudo_helper("del-smb-user", username)


# ── System integration dispatch (Linux only) ────────────────────────


def _apply_share(share: Share):
    """Write share config to the system and reload services."""
    if not _is_linux:
        return

    if share.protocol == "smb":
        _apply_smb(share)
    elif share.protocol == "nfs":
        _apply_nfs(share)


def _remove_share(share: Share):
    """Remove share config from the system."""
    if not _is_linux:
        return

    if share.protocol == "smb":
        _remove_smb(share.name)
    elif share.protocol == "nfs":
        _remove_nfs(share.path)
