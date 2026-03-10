from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


class BackupJobCreate(BaseModel):
    name: str
    source: str
    destination: str
    dest_type: str = "local"
    schedule: str = "Manual"
    retention: str = "7 days"


@router.get("/jobs")
async def list_jobs():
    """List all backup jobs."""
    return {"jobs": get_backup_jobs()}


@router.post("/jobs")
async def create_job(body: BackupJobCreate):
    """Create a new backup job."""
    return create_backup_job(body.model_dump())


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int):
    if not delete_backup_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


@router.post("/jobs/{job_id}/toggle")
async def toggle_job(job_id: int):
    job = toggle_backup_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/run")
async def run_job(job_id: int):
    result = run_backup_now(job_id)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result


@router.get("/snapshots")
async def list_snapshots():
    return {"snapshots": get_snapshots()}


@router.get("/remotes")
async def list_remotes():
    return {"remotes": get_cloud_remotes()}
