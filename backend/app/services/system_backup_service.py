"""System-wide settings backup & restore service.

Collects all nasOS configuration state into a portable .nasos-backup archive
that can be applied to a freshly-flashed SD card to restore a prior install.

Backed-up artefacts:
  ┌─ data_dir files ──────────────────────────────┐
  │  nasos.db, .autologin, .default-password-accounts, │
  │  display.json, sata-mounts.json, .secret_key  │
  └────────────────────────────────────────────────┘
  ┌─ system configs (Linux only) ──────────────────┐
  │  /etc/samba/smb.conf, /etc/exports             │
  │  /boot/firmware/config.txt                     │
  │  ~/.config/rclone/rclone.conf (nasos user)     │
  └────────────────────────────────────────────────┘
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import platform
import shutil
import sqlite3
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.system_backup import SystemBackup

_log = logging.getLogger(__name__)
_is_linux = platform.system() == "Linux"

BACKUP_DIR_NAME = "system-backups"
SCHEDULE_FILE = ".backup-schedule.json"
MAX_BACKUPS = 20

_DEFAULT_SCHEDULE = {
    "enabled": False,
    "interval": "daily",       # daily | weekly | monthly
    "time": "03:00",           # HH:MM (24h)
    "day_of_week": 0,          # 0=Mon … 6=Sun (for weekly)
    "retention_count": 5,      # keep last N scheduled backups
}


# ── Paths ──────────────────────────────────────────────────────────

def _backup_dir() -> Path:
    d = settings.data_dir / BACKUP_DIR_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _schedule_path() -> Path:
    return settings.data_dir / SCHEDULE_FILE


# ── Data-dir files to include (excluding nasos.db — handled separately) ──

_DATA_DIR_FILES = [
    ".autologin",
    ".default-password-accounts",
    "display.json",
    "sata-mounts.json",
    ".secret_key",
    ".setup-complete",
]

_SYSTEM_FILES: list[str] = [
    "/etc/samba/smb.conf",
    "/etc/exports",
    "/boot/firmware/config.txt",
    "/boot/config.txt",
]

_RCLONE_PATHS = [
    Path("/home/nasos/.config/rclone/rclone.conf"),
    Path.home() / ".config" / "rclone" / "rclone.conf",
]


def _safe_copy_sqlite(src: Path, dest: Path) -> None:
    """Create a consistent snapshot of a live SQLite database.

    Tries the built-in online backup API first (WAL-safe).
    Falls back to a plain file copy if the backup API fails.
    """
    try:
        source_conn = sqlite3.connect(str(src))
        try:
            backup_conn = sqlite3.connect(str(dest))
            try:
                source_conn.backup(backup_conn)
            finally:
                backup_conn.close()
        finally:
            source_conn.close()
    except Exception:
        _log.warning("sqlite3.backup() failed, falling back to file copy")
        shutil.copy2(str(src), str(dest))
        for wal in (str(src) + "-wal", str(src) + "-shm"):
            if Path(wal).exists():
                shutil.copy2(wal, str(dest) + wal[len(str(src)):])


def _build_archive(dest: Path, trigger: str) -> dict:
    """Synchronous helper: build the tar.gz archive and return manifest.

    Runs in a worker thread so the async event loop is never blocked.
    """
    manifest: dict = {
        "version": settings.version,
        "created": datetime.now().isoformat(),
        "trigger": trigger,
        "platform": platform.system(),
        "files": [],
    }

    _log.info("Building backup archive → %s", dest)
    _log.info("  data_dir = %s  (exists=%s)", settings.data_dir, settings.data_dir.exists())
    _log.info("  backup_dir = %s", dest.parent)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        # Safe SQLite snapshot
        db_src = settings.data_dir / "nasos.db"
        db_copy = tmp / "nasos.db"
        if db_src.exists():
            _safe_copy_sqlite(db_src, db_copy)
            _log.info("  SQLite snapshot OK (%d bytes)", db_copy.stat().st_size)

        with tarfile.open(str(dest), "w:gz") as tar:
            # 1) database (from safe copy)
            if db_copy.exists():
                tar.add(str(db_copy), arcname="data/nasos.db")
                manifest["files"].append("data/nasos.db")

            # 2) other data_dir files
            for name in _DATA_DIR_FILES:
                src = settings.data_dir / name
                if src.exists():
                    tar.add(str(src), arcname=f"data/{name}")
                    manifest["files"].append(f"data/{name}")

            # 3) system config files
            for sys_path_str in _SYSTEM_FILES:
                p = Path(sys_path_str)
                if p.exists():
                    try:
                        tar.add(str(p), arcname=f"system{sys_path_str}")
                        manifest["files"].append(f"system{sys_path_str}")
                    except PermissionError:
                        _log.warning("  Skipping %s (permission denied)", p)

            # 4) rclone config
            for rc in _RCLONE_PATHS:
                if rc.exists():
                    try:
                        tar.add(str(rc), arcname="rclone/rclone.conf")
                        manifest["files"].append("rclone/rclone.conf")
                    except PermissionError:
                        _log.warning("  Skipping rclone config (permission denied)")
                    break

            # 5) embed manifest
            mdata = json.dumps(manifest, indent=2).encode()
            info = tarfile.TarInfo(name="manifest.json")
            info.size = len(mdata)
            tar.addfile(info, io.BytesIO(mdata))

    _log.info("  Archive complete: %d files, %d bytes", len(manifest["files"]), dest.stat().st_size)
    return manifest


# ── Create backup ─────────────────────────────────────────────────

async def create_backup(
    db: AsyncSession,
    trigger: str = "manual",
    notes: str | None = None,
) -> dict:
    """Build a .nasos-backup archive and record it in the DB."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"nasos-backup-{ts}.nasos-backup"
    dest = _backup_dir() / filename

    try:
        manifest = await asyncio.to_thread(_build_archive, dest, trigger)
        size = dest.stat().st_size

        row = SystemBackup(
            filename=filename,
            size_bytes=size,
            version=settings.version,
            trigger=trigger,
            status="complete",
            notes=notes,
            manifest_json=json.dumps(manifest),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)

        await _enforce_retention(db)

        return _row_to_dict(row)
    except Exception as exc:
        _log.exception("System backup failed")
        row = SystemBackup(
            filename=filename,
            size_bytes=0,
            version=settings.version,
            trigger=trigger,
            status="failed",
            notes=str(exc),
            manifest_json="{}",
        )
        db.add(row)
        await db.commit()
        return {"error": str(exc)}


# ── Restore backup ────────────────────────────────────────────────

_RESTORE_HELPER = "/opt/nasos/scripts/restore-helper.sh"


def _run_restore_helper(tmp_dir: str) -> tuple[list[str], list[str]]:
    """Run the privileged restore-helper.sh via sudo.

    Returns (restored_files, error_files) parsed from the script output.
    """
    import subprocess

    restored: list[str] = []
    errors: list[str] = []

    try:
        proc = subprocess.run(
            ["sudo", _RESTORE_HELPER, tmp_dir],
            capture_output=True, text=True, timeout=30,
        )
        for line in proc.stdout.splitlines():
            if line.startswith("OK "):
                restored.append(line[3:])
            elif line.startswith("FAIL "):
                errors.append(line[5:])
        if proc.returncode != 0 and not errors:
            errors.append(proc.stderr.strip() or f"exit code {proc.returncode}")
    except Exception as e:
        errors.append(str(e))

    return restored, errors


def _extract_archive(archive: Path, db_path: Path) -> dict:
    """Synchronous restore helper — runs in a worker thread."""
    restored: list[str] = []
    errors: list[str] = []

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        with tarfile.open(str(archive), "r:gz") as tar:
            tar.extractall(tmp)

        _SKIP_ON_RESTORE = {".setup-complete"}

        # data_dir files (skip nasos.db — handled separately)
        data_src = tmp / "data"
        if data_src.is_dir():
            for f in data_src.iterdir():
                if f.name == "nasos.db" or f.name in _SKIP_ON_RESTORE:
                    continue
                dest = settings.data_dir / f.name
                try:
                    shutil.copy2(str(f), str(dest))
                    restored.append(f"data/{f.name}")
                except PermissionError:
                    if _is_linux:
                        import subprocess
                        try:
                            subprocess.run(
                                ["sudo", "cp", "--preserve=mode,timestamps",
                                 "--", str(f), str(dest)],
                                capture_output=True, timeout=10, check=True,
                            )
                            restored.append(f"data/{f.name}")
                        except Exception as e2:
                            errors.append(f"data/{f.name}: {e2}")
                    else:
                        errors.append(f"data/{f.name}: permission denied")
                except Exception as e:
                    errors.append(f"data/{f.name}: {e}")

            # Restore database using safe SQLite copy
            db_backup = data_src / "nasos.db"
            if db_backup.exists():
                try:
                    _safe_copy_sqlite(db_backup, db_path)
                    restored.append("data/nasos.db")
                except Exception as e:
                    errors.append(f"data/nasos.db: {e}")

        # system files + rclone — delegate to the root helper on Linux
        has_sys = (tmp / "system").is_dir()
        has_rc = (tmp / "rclone" / "rclone.conf").exists()
        if _is_linux and (has_sys or has_rc):
            sys_restored, sys_errors = _run_restore_helper(str(tmp))
            restored.extend(sys_restored)
            errors.extend(sys_errors)
        elif not _is_linux:
            _log.info("Dev mode: skipping system/rclone file restore")

    return {
        "restored": restored,
        "errors": errors,
    }


async def restore_backup(backup_id: int, db: AsyncSession) -> dict:
    """Extract a .nasos-backup archive back into place.

    data_dir files are overwritten directly.
    System files are attempted but skipped on permission errors.
    """
    row = await db.get(SystemBackup, backup_id)
    if not row:
        return {"ok": False, "error": "Backup not found"}

    archive = _backup_dir() / row.filename
    if not archive.exists():
        return {"ok": False, "error": "Backup archive file missing from disk"}

    try:
        result = await asyncio.to_thread(
            _extract_archive, archive, settings.db_path
        )
    except Exception as exc:
        _log.exception("Restore failed")
        return {"ok": False, "error": str(exc)}

    restored = result["restored"]
    errors = result["errors"]

    _log.info(
        "Restore complete: %d restored, %d errors",
        len(restored), len(errors),
    )

    return {
        "ok": len(restored) > 0,
        "restored": restored,
        "errors": errors,
        "needs_restart": True,
    }


# ── List / delete ─────────────────────────────────────────────────

async def list_backups(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(SystemBackup).order_by(SystemBackup.created_at.desc())
    )
    return [_row_to_dict(r) for r in result.scalars().all()]


async def get_backup(backup_id: int, db: AsyncSession) -> dict | None:
    row = await db.get(SystemBackup, backup_id)
    return _row_to_dict(row) if row else None


async def delete_backup(backup_id: int, db: AsyncSession) -> bool:
    row = await db.get(SystemBackup, backup_id)
    if not row:
        return False
    archive = _backup_dir() / row.filename
    if archive.exists():
        archive.unlink()
    await db.delete(row)
    await db.commit()
    return True


def get_backup_filepath(filename: str) -> Path | None:
    p = _backup_dir() / filename
    return p if p.exists() else None


# ── Schedule management ───────────────────────────────────────────

def load_schedule() -> dict:
    p = _schedule_path()
    if p.exists():
        try:
            return {**_DEFAULT_SCHEDULE, **json.loads(p.read_text())}
        except (json.JSONDecodeError, OSError):
            pass
    return dict(_DEFAULT_SCHEDULE)


def save_schedule(data: dict) -> dict:
    merged = {**_DEFAULT_SCHEDULE, **data}
    _schedule_path().write_text(json.dumps(merged, indent=2))
    return merged


# ── Scheduled-backup background loop ─────────────────────────────

_scheduler_task: asyncio.Task | None = None


async def _scheduler_loop():
    """Runs forever; checks once per minute if a scheduled backup is due."""
    from app.core.database import async_session

    _log.info("System-backup scheduler started")
    last_run_date: str | None = None

    while True:
        await asyncio.sleep(60)
        try:
            sched = load_schedule()
            if not sched.get("enabled"):
                continue

            now = datetime.now()
            target_time = sched.get("time", "03:00")
            try:
                hh, mm = (int(x) for x in target_time.split(":"))
            except ValueError:
                hh, mm = 3, 0

            if now.hour != hh or now.minute != mm:
                continue

            today_key = now.strftime("%Y-%m-%d")
            if last_run_date == today_key:
                continue

            interval = sched.get("interval", "daily")
            if interval == "weekly" and now.weekday() != sched.get("day_of_week", 0):
                continue
            if interval == "monthly" and now.day != 1:
                continue

            _log.info("Running scheduled system backup")
            last_run_date = today_key
            async with async_session() as db:
                await create_backup(db, trigger="scheduled", notes="Automatic scheduled backup")
        except Exception:
            _log.exception("Scheduler loop error")


def start_scheduler():
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())


def stop_scheduler():
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        _scheduler_task = None


# ── Retention / cleanup ───────────────────────────────────────────

async def _enforce_retention(db: AsyncSession):
    """Keep at most MAX_BACKUPS entries; prune oldest first."""
    result = await db.execute(
        select(SystemBackup).order_by(SystemBackup.created_at.desc())
    )
    rows = list(result.scalars().all())
    if len(rows) <= MAX_BACKUPS:
        return
    for old in rows[MAX_BACKUPS:]:
        archive = _backup_dir() / old.filename
        if archive.exists():
            archive.unlink()
        await db.delete(old)
    await db.commit()


# ── Upload / import a backup file ─────────────────────────────────

async def import_backup(file_bytes: bytes, original_name: str, db: AsyncSession) -> dict:
    """Import an uploaded .nasos-backup file into the backup directory."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"nasos-imported-{ts}.nasos-backup"
    dest = _backup_dir() / filename

    try:
        dest.write_bytes(file_bytes)

        manifest: dict = {}
        version = "unknown"
        with tarfile.open(str(dest), "r:gz") as tar:
            try:
                mf = tar.extractfile("manifest.json")
                if mf:
                    manifest = json.loads(mf.read())
                    version = manifest.get("version", "unknown")
            except (KeyError, json.JSONDecodeError):
                pass

        size = dest.stat().st_size
        row = SystemBackup(
            filename=filename,
            size_bytes=size,
            version=version,
            trigger="imported",
            status="complete",
            notes=f"Imported from {original_name}",
            manifest_json=json.dumps(manifest),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return _row_to_dict(row)
    except Exception as exc:
        if dest.exists():
            dest.unlink()
        return {"error": str(exc)}


# ── Helpers ────────────────────────────────────────────────────────

def _row_to_dict(row: SystemBackup) -> dict:
    return {
        "id": row.id,
        "filename": row.filename,
        "size_bytes": row.size_bytes,
        "size_display": _fmt_size(row.size_bytes),
        "version": row.version,
        "trigger": row.trigger,
        "status": row.status,
        "notes": row.notes,
        "manifest": json.loads(row.manifest_json) if row.manifest_json else {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _fmt_size(b: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.1f} {unit}" if unit != "B" else f"{b} B"
        b /= 1024
    return f"{b:.1f} TB"
