from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.backup_service import (
    create_backup_job,
    delete_backup_job,
    get_backup_jobs,
    get_cloud_remotes,
    get_snapshots,
    run_backup_now,
    toggle_backup_job,
)

router = APIRouter(prefix="/api/backup", tags=["backup"])


def _validate_backup_path(value: str, field_name: str) -> str:
    """Reject paths that could inject flags into rsync/rclone."""
    # Local paths must be absolute; cloud paths like "b2:bucket" are okay
    stripped = value.strip()
    if not stripped:
        raise ValueError(f"{field_name} cannot be empty")
    if stripped.startswith("-"):
        raise ValueError(f"{field_name} cannot start with '-'")
    # Block embedded flag injection via spaces (e.g. "/tmp --delete-excluded")
    for segment in stripped.split():
        if segment.startswith("-") and segment != stripped:
            raise ValueError(f"{field_name} contains invalid flag-like segment")
    return stripped


class BackupJobCreate(BaseModel):
    name: str
    source: str
    destination: str
    dest_type: str = "local"
    schedule: str = "Manual"
    retention: str = "7 days"

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        return _validate_backup_path(v, "source")

    @field_validator("destination")
    @classmethod
    def validate_destination(cls, v: str) -> str:
        return _validate_backup_path(v, "destination")


@router.get("/jobs")
async def list_jobs(db: AsyncSession = Depends(get_db)):
    """List all backup jobs."""
    return {"jobs": await get_backup_jobs(db)}


@router.post("/jobs")
async def create_job(body: BackupJobCreate, db: AsyncSession = Depends(get_db)):
    """Create a new backup job."""
    return await create_backup_job(db, body.model_dump())


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    if not await delete_backup_job(db, job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


@router.post("/jobs/{job_id}/toggle")
async def toggle_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await toggle_backup_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/run")
async def run_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await run_backup_now(db, job_id)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result


@router.get("/snapshots")
async def list_snapshots():
    return {"snapshots": await get_snapshots()}


@router.get("/remotes")
async def list_remotes(db: AsyncSession = Depends(get_db)):
    return {"remotes": await get_cloud_remotes(db)}
