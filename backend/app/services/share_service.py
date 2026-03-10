"""Share management service — manages SMB/NFS/WebDAV shares.

On Linux: generates smb.conf sections, /etc/exports entries, etc.
On macOS (dev): mocks everything, stores state in DB only.
"""

import platform
import subprocess
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.share import Share

_is_linux = platform.system() == "Linux"


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

    # Apply to system
    await _apply_share(share)

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

    await _apply_share(share)

    return _share_to_dict(share)


async def delete_share(db: AsyncSession, share_id: int) -> bool:
    share = await db.get(Share, share_id)
    if not share:
        return False

    await _remove_share(share)

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

    if share.enabled:
        await _apply_share(share)
    else:
        await _remove_share(share)

    return _share_to_dict(share)


def _share_to_dict(share: Share) -> dict:
    return {
        "id": share.id,
        "name": share.name,
        "path": share.path,
        "protocol": share.protocol,
        "enabled": share.enabled,
        "read_only": share.read_only,
        "guest_access": share.guest_access,
        "description": share.description,
        "allowed_users": share.allowed_users.split(",") if share.allowed_users else [],
        "allowed_hosts": share.allowed_hosts.split(",") if share.allowed_hosts else [],
        "created_at": share.created_at.isoformat() if share.created_at else None,
        "updated_at": share.updated_at.isoformat() if share.updated_at else None,
    }


# ── System integration (Linux only) ───────────────────────────────

async def _apply_share(share: Share):
    """Write share config to the system and reload services."""
    if not _is_linux:
        return

    if share.protocol == "smb":
        _write_smb_section(share)
        _reload_samba()
    elif share.protocol == "nfs":
        _write_nfs_export(share)
        _reload_nfs()


async def _remove_share(share: Share):
    """Remove share config from the system."""
    if not _is_linux:
        return

    if share.protocol == "smb":
        _remove_smb_section(share.name)
        _reload_samba()
    elif share.protocol == "nfs":
        _remove_nfs_export(share.path)
        _reload_nfs()


def _write_smb_section(share: Share):
    """Append or replace a [share] section in /etc/samba/smb.conf."""
    conf_path = Path("/etc/samba/smb.conf")
    if not conf_path.exists():
        return

    section = f"\n[{share.name}]\n"
    section += f"   path = {share.path}\n"
    section += f"   comment = {share.description}\n"
    section += f"   read only = {'yes' if share.read_only else 'no'}\n"
    section += f"   guest ok = {'yes' if share.guest_access else 'no'}\n"
    section += f"   browseable = yes\n"
    if share.allowed_users:
        section += f"   valid users = {share.allowed_users.replace(',', ' ')}\n"

    # Remove existing section first, then append
    _remove_smb_section(share.name)
    with open(conf_path, "a") as f:
        f.write(section)


def _remove_smb_section(name: str):
    """Remove a named section from smb.conf."""
    conf_path = Path("/etc/samba/smb.conf")
    if not conf_path.exists():
        return

    lines = conf_path.read_text().splitlines(keepends=True)
    new_lines = []
    skip = False
    for line in lines:
        if line.strip().lower() == f"[{name.lower()}]":
            skip = True
            continue
        if skip and line.strip().startswith("["):
            skip = False
        if not skip:
            new_lines.append(line)

    conf_path.write_text("".join(new_lines))


def _write_nfs_export(share: Share):
    """Add an NFS export entry to /etc/exports."""
    exports_path = Path("/etc/exports")
    hosts = share.allowed_hosts or "*"
    opts = "ro,sync,no_subtree_check" if share.read_only else "rw,sync,no_subtree_check"
    line = f"{share.path} {hosts}({opts})\n"

    _remove_nfs_export(share.path)
    with open(exports_path, "a") as f:
        f.write(line)


def _remove_nfs_export(path: str):
    """Remove an NFS export entry by path."""
    exports_path = Path("/etc/exports")
    if not exports_path.exists():
        return

    lines = exports_path.read_text().splitlines(keepends=True)
    new_lines = [l for l in lines if not l.strip().startswith(path)]
    exports_path.write_text("".join(new_lines))


def _reload_samba():
    try:
        subprocess.run(["systemctl", "reload", "smbd"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass


def _reload_nfs():
    try:
        subprocess.run(["exportfs", "-ra"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
