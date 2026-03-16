"""Backup management service — persists to SQLite via SQLAlchemy.

On Linux: wraps rsync/rclone for real backup execution.
On macOS (dev): simulates backup runs with mock delays.
"""

import asyncio
import platform
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.backup import BackupJob, CloudRemote

_is_linux = platform.system() == "Linux"


# ── Seed data — inserted on first run when tables are empty ──────────

_SEED_JOBS = [
    {
        "name": "Daily Media Backup",
        "source": "/mnt/data/media",
        "destination": "/mnt/backup/media",
        "dest_type": "local",
        "schedule": "Daily at 02:00",
        "retention": "7 days",
        "enabled": True,
        "last_run": (datetime.now() - timedelta(hours=8)).isoformat(),
        "last_status": "success",
        "last_size": "2.4 GB",
    },
    {
        "name": "Weekly Full Backup",
        "source": "/mnt/data",
        "destination": "b2:nasos-backups/weekly",
        "dest_type": "cloud",
        "schedule": "Sunday at 03:00",
        "retention": "4 weeks",
        "enabled": True,
        "last_run": (datetime.now() - timedelta(days=3)).isoformat(),
        "last_status": "success",
        "last_size": "48.7 GB",
    },
    {
        "name": "Photos to Google Drive",
        "source": "/mnt/data/photos",
        "destination": "gdrive:NAS-Photos",
        "dest_type": "cloud",
        "schedule": "Every 6 hours",
        "retention": "30 days",
        "enabled": True,
        "last_run": (datetime.now() - timedelta(hours=2)).isoformat(),
        "last_status": "success",
        "last_size": "856 MB",
    },
    {
        "name": "Config Backup",
        "source": "/opt/nasos/config",
        "destination": "/mnt/backup/config",
        "dest_type": "local",
        "schedule": "Daily at 00:00",
        "retention": "14 days",
        "enabled": False,
        "last_run": (datetime.now() - timedelta(days=5)).isoformat(),
        "last_status": "failed",
        "last_size": "0 B",
    },
]

_SEED_REMOTES = [
    {"name": "b2", "remote_type": "Backblaze B2", "bucket": "nasos-backups", "status": "connected"},
    {"name": "gdrive", "remote_type": "Google Drive", "bucket": "", "status": "connected"},
    {"name": "s3", "remote_type": "Amazon S3", "bucket": "", "status": "not configured"},
]

# Mock snapshots (not persisted — these are filesystem-level)
_MOCK_SNAPSHOTS = [
    {"id": "snap-001", "name": "pre-update-2024-03", "path": "/mnt/data", "created": (datetime.now() - timedelta(days=7)).isoformat(), "size": "12.3 GB"},
    {"id": "snap-002", "name": "daily-auto", "path": "/mnt/data", "created": (datetime.now() - timedelta(days=1)).isoformat(), "size": "128 MB"},
    {"id": "snap-003", "name": "daily-auto", "path": "/mnt/data", "created": (datetime.now() - timedelta(hours=12)).isoformat(), "size": "64 MB"},
]


async def _ensure_seed_data(db: AsyncSession):
    """Insert seed data if tables are empty (first run)."""
    result = await db.execute(select(BackupJob).limit(1))
    if result.scalar_one_or_none() is None:
        for data in _SEED_JOBS:
            db.add(BackupJob(**data))
        await db.commit()

    result = await db.execute(select(CloudRemote).limit(1))
    if result.scalar_one_or_none() is None:
        for data in _SEED_REMOTES:
            db.add(CloudRemote(**data))
        await db.commit()


# ── CRUD Operations ──────────────────────────────────────────────────

async def get_backup_jobs(db: AsyncSession) -> list[dict]:
    await _ensure_seed_data(db)
    result = await db.execute(select(BackupJob).order_by(BackupJob.id))
    jobs = result.scalars().all()
    return [_job_to_dict(j) for j in jobs]


async def create_backup_job(db: AsyncSession, data: dict) -> dict:
    job = BackupJob(**data)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return _job_to_dict(job)


async def delete_backup_job(db: AsyncSession, job_id: int) -> bool:
    job = await db.get(BackupJob, job_id)
    if not job:
        return False
    await db.delete(job)
    await db.commit()
    return True


async def toggle_backup_job(db: AsyncSession, job_id: int) -> dict | None:
    job = await db.get(BackupJob, job_id)
    if not job:
        return None
    job.enabled = not job.enabled
    await db.commit()
    await db.refresh(job)
    return _job_to_dict(job)


async def run_backup_now(db: AsyncSession, job_id: int) -> dict:
    """Trigger a backup job immediately."""
    job = await db.get(BackupJob, job_id)
    if not job:
        return {"ok": False, "error": "Job not found"}

    # Mark as running
    job.last_status = "running"
    job.last_run = datetime.now().isoformat()
    await db.commit()

    if not _is_linux:
        # Simulate a backup run (short delay, then success)
        await asyncio.sleep(2)
        job.last_status = "success"
        job.last_size = "1.2 GB"
        await db.commit()
        return {"ok": True, "job_id": job_id, "status": "success"}

    # Validate paths before execution — reject flag injection
    for path in (job.source, job.destination):
        if path.strip().startswith("-"):
            job.last_status = "failed"
            await db.commit()
            return {"ok": False, "error": "Invalid path"}

    # Real Linux: spawn rsync or rclone subprocess
    try:
        import subprocess

        if job.dest_type == "local":
            proc = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: subprocess.run(
                    ["rsync", "-avz", "--delete", "--", f"{job.source}/", job.destination],
                    capture_output=True, text=True, timeout=3600,
                )
            )
        else:
            proc = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: subprocess.run(
                    ["rclone", "sync", job.source, job.destination, "--progress"],
                    capture_output=True, text=True, timeout=3600,
                )
            )

        if proc.returncode == 0:
            job.last_status = "success"
        else:
            job.last_status = "failed"

        await db.commit()
        return {"ok": True, "job_id": job_id, "status": job.last_status}
    except Exception as e:
        job.last_status = "failed"
        await db.commit()
        return {"ok": False, "error": str(e)}


# ── Snapshots & Remotes ──────────────────────────────────────────────

async def get_snapshots() -> list[dict]:
    """Get filesystem snapshots (btrfs/zfs). Mock for now."""
    return _MOCK_SNAPSHOTS


async def get_cloud_remotes(db: AsyncSession) -> list[dict]:
    await _ensure_seed_data(db)
    result = await db.execute(select(CloudRemote).order_by(CloudRemote.name))
    remotes = result.scalars().all()
    return [_remote_to_dict(r) for r in remotes]


# ── Helpers ───────────────────────────────────────────────────────────

def _job_to_dict(job: BackupJob) -> dict:
    return {
        "id": job.id,
        "name": job.name,
        "source": job.source,
        "destination": job.destination,
        "dest_type": job.dest_type,
        "schedule": job.schedule,
        "retention": job.retention,
        "enabled": job.enabled,
        "last_run": job.last_run,
        "last_status": job.last_status,
        "last_size": job.last_size,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }


def _remote_to_dict(remote: CloudRemote) -> dict:
    return {
        "name": remote.name,
        "type": remote.remote_type,
        "bucket": remote.bucket,
        "status": remote.status,
    }
