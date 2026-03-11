"""
nasOS OTA Update API
POST /api/update/upload   – stage a .nasos package
GET  /api/update/status   – current version, staged info, progress
POST /api/update/apply    – apply staged package
DELETE /api/update/staged – cancel staged package
POST /api/update/rollback – restore previous snapshot
"""
from __future__ import annotations

import platform

from fastapi import APIRouter, HTTPException, UploadFile

from app.services import update_service

router = APIRouter(prefix="/api/update", tags=["update"])

_is_linux = platform.system() == "Linux"
_MAX_UPLOAD_MB = 512
_MAX_BYTES = _MAX_UPLOAD_MB * 1024 * 1024


@router.get("/status")
async def update_status():
    """Return current version, staged package info, and live apply progress."""
    if not _is_linux:
        return update_service.get_update_status_mock()
    return update_service.get_update_status()


@router.post("/upload")
async def upload_update(file: UploadFile):
    """
    Upload a .nasos OTA package. The package is validated immediately;
    it is not applied until POST /api/update/apply is called.
    """
    if not file.filename or not file.filename.endswith(".nasos"):
        raise HTTPException(400, "File must have a .nasos extension")

    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(413, f"Package exceeds maximum allowed size ({_MAX_UPLOAD_MB} MB)")

    try:
        info = update_service.stage_update(data, file.filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    return {"status": "staged", "package": info}


@router.post("/apply")
async def apply_update():
    """
    Spawn the apply-update.sh script in a detached process.
    Poll GET /api/update/status for progress — the backend will
    restart mid-way; the UI should re-poll after reconnect.
    """
    if not _is_linux:
        raise HTTPException(400, "Update apply is only supported on a real nasOS device")

    try:
        result = update_service.apply_update()
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc

    return result


@router.delete("/staged")
async def cancel_staged():
    """Discard the staged package without applying it."""
    try:
        return update_service.cancel_staged()
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/rollback")
async def rollback():
    """Restore the installation from the rollback snapshot created before the last apply."""
    if not _is_linux:
        raise HTTPException(400, "Rollback is only supported on a real nasOS device")

    try:
        return update_service.rollback_update()
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
