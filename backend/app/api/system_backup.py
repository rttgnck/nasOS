"""System-wide settings backup & restore API."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.system_backup_service import (
    create_backup,
    delete_backup,
    get_backup,
    get_backup_filepath,
    import_backup,
    list_backups,
    load_schedule,
    restore_backup,
    save_schedule,
)

router = APIRouter(prefix="/api/system-backup", tags=["system-backup"])


# ── List all backups ──────────────────────────────────────────────

@router.get("/")
async def get_backups(db: AsyncSession = Depends(get_db)):
    return {"backups": await list_backups(db)}


# ── Create a new backup ──────────────────────────────────────────

class CreateBackupBody(BaseModel):
    notes: str | None = None

@router.post("/")
async def trigger_backup(
    body: CreateBackupBody = CreateBackupBody(),
    db: AsyncSession = Depends(get_db),
):
    result = await create_backup(db, trigger="manual", notes=body.notes)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ── Get single backup details ────────────────────────────────────

@router.get("/{backup_id}")
async def get_single_backup(backup_id: int, db: AsyncSession = Depends(get_db)):
    item = await get_backup(backup_id, db)
    if not item:
        raise HTTPException(status_code=404, detail="Backup not found")
    return item


# ── Download a backup file ───────────────────────────────────────

@router.get("/{backup_id}/download")
async def download_backup(backup_id: int, db: AsyncSession = Depends(get_db)):
    item = await get_backup(backup_id, db)
    if not item:
        raise HTTPException(status_code=404, detail="Backup not found")
    fp = get_backup_filepath(item["filename"])
    if not fp:
        raise HTTPException(status_code=404, detail="Backup file missing from disk")
    return FileResponse(
        path=str(fp),
        filename=item["filename"],
        media_type="application/gzip",
    )


# ── Restore from a backup ───────────────────────────────────────

@router.post("/{backup_id}/restore")
async def trigger_restore(backup_id: int, db: AsyncSession = Depends(get_db)):
    result = await restore_backup(backup_id, db)
    if "error" in result and not result.get("ok"):
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ── Delete a backup ──────────────────────────────────────────────

@router.delete("/{backup_id}")
async def remove_backup(backup_id: int, db: AsyncSession = Depends(get_db)):
    if not await delete_backup(backup_id, db):
        raise HTTPException(status_code=404, detail="Backup not found")
    return {"ok": True}


# ── Import / upload a .nasos-backup file ─────────────────────────

@router.post("/import")
async def upload_backup(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".nasos-backup"):
        raise HTTPException(status_code=400, detail="File must be a .nasos-backup archive")
    contents = await file.read()
    if len(contents) > 500 * 1024 * 1024:  # 500 MB limit
        raise HTTPException(status_code=400, detail="Backup file too large (max 500 MB)")
    result = await import_backup(contents, file.filename, db)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ── Schedule ─────────────────────────────────────────────────────

class SchedulePayload(BaseModel):
    enabled: bool = False
    interval: str = "daily"
    time: str = "03:00"
    day_of_week: int = 0
    retention_count: int = 5

@router.get("/schedule/config")
async def get_schedule():
    return load_schedule()

@router.put("/schedule/config")
async def set_schedule(payload: SchedulePayload):
    return save_schedule(payload.model_dump())
