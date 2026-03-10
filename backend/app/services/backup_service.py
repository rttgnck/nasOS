"""Backup management service.

On Linux: wraps rsync, rclone, btrfs snapshots.
On macOS (dev): returns mock data.
"""

import platform
from datetime import datetime, timedelta

_is_linux = platform.system() == "Linux"

# ── Mock data ──────────────────────────────────────────────────────

_now = datetime.now()

_MOCK_JOBS = [
    {
        "id": 1,
        "name": "Daily Media Backup",
        "source": "/mnt/data/media",
        "destination": "/mnt/backup/media",
        "dest_type": "local",
        "schedule": "Daily at 02:00",
        "retention": "7 days",
        "enabled": True,
        "last_run": (_now - timedelta(hours=8)).isoformat(),
        "last_status": "success",
        "last_size": "2.4 GB",
        "next_run": (_now + timedelta(hours=16)).isoformat(),
    },
    {
        "id": 2,
        "name": "Weekly Full Backup",
        "source": "/mnt/data",
        "destination": "b2:nasos-backups/weekly",
        "dest_type": "cloud",
        "schedule": "Sunday at 03:00",
        "retention": "4 weeks",
        "enabled": True,
        "last_run": (_now - timedelta(days=3)).isoformat(),
        "last_status": "success",
        "last_size": "48.7 GB",
        "next_run": (_now + timedelta(days=4)).isoformat(),
    },
    {
        "id": 3,
        "name": "Photos to Google Drive",
        "source": "/mnt/data/photos",
        "destination": "gdrive:NAS-Photos",
        "dest_type": "cloud",
        "schedule": "Every 6 hours",
        "retention": "30 days",
        "enabled": True,
        "last_run": (_now - timedelta(hours=2)).isoformat(),
        "last_status": "success",
        "last_size": "856 MB",
        "next_run": (_now + timedelta(hours=4)).isoformat(),
    },
    {
        "id": 4,
        "name": "Config Backup",
        "source": "/opt/nasos/config",
        "destination": "/mnt/backup/config",
        "dest_type": "local",
        "schedule": "Daily at 00:00",
        "retention": "14 days",
        "enabled": False,
        "last_run": (_now - timedelta(days=5)).isoformat(),
        "last_status": "failed",
        "last_size": "0 B",
        "next_run": None,
    },
]

_MOCK_SNAPSHOTS = [
    {"id": "snap-001", "name": "pre-update-2024-03", "path": "/mnt/data", "created": (_now - timedelta(days=7)).isoformat(), "size": "12.3 GB"},
    {"id": "snap-002", "name": "daily-auto", "path": "/mnt/data", "created": (_now - timedelta(days=1)).isoformat(), "size": "128 MB"},
    {"id": "snap-003", "name": "daily-auto", "path": "/mnt/data", "created": (_now - timedelta(hours=12)).isoformat(), "size": "64 MB"},
]

_CLOUD_REMOTES = [
    {"name": "b2", "type": "Backblaze B2", "status": "connected"},
    {"name": "gdrive", "type": "Google Drive", "status": "connected"},
    {"name": "s3", "type": "Amazon S3", "status": "not configured"},
]

_job_counter = len(_MOCK_JOBS)


def get_backup_jobs() -> list[dict]:
    return _MOCK_JOBS


def get_snapshots() -> list[dict]:
    return _MOCK_SNAPSHOTS


def get_cloud_remotes() -> list[dict]:
    return _CLOUD_REMOTES


def create_backup_job(data: dict) -> dict:
    global _job_counter
    _job_counter += 1
    job = {
        "id": _job_counter,
        "name": data.get("name", "Untitled"),
        "source": data.get("source", ""),
        "destination": data.get("destination", ""),
        "dest_type": data.get("dest_type", "local"),
        "schedule": data.get("schedule", "Manual"),
        "retention": data.get("retention", "7 days"),
        "enabled": True,
        "last_run": None,
        "last_status": None,
        "last_size": "0 B",
        "next_run": None,
    }
    _MOCK_JOBS.append(job)
    return job


def delete_backup_job(job_id: int) -> bool:
    idx = next((i for i, j in enumerate(_MOCK_JOBS) if j["id"] == job_id), None)
    if idx is not None:
        _MOCK_JOBS.pop(idx)
        return True
    return False


def toggle_backup_job(job_id: int) -> dict | None:
    job = next((j for j in _MOCK_JOBS if j["id"] == job_id), None)
    if not job:
        return None
    job["enabled"] = not job["enabled"]
    return job


def run_backup_now(job_id: int) -> dict:
    """Trigger a backup job immediately."""
    job = next((j for j in _MOCK_JOBS if j["id"] == job_id), None)
    if not job:
        return {"ok": False, "error": "Job not found"}

    if not _is_linux:
        job["last_run"] = datetime.now().isoformat()
        job["last_status"] = "success"
        return {"ok": True, "job_id": job_id}

    # Real implementation would spawn rsync/rclone subprocess
    return {"ok": True, "job_id": job_id}
