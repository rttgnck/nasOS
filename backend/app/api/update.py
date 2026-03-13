"""
nasOS OTA Update API
POST /api/update/upload          – stage a .nasos package
GET  /api/update/status          – current version, staged info, progress, disk space
POST /api/update/apply           – apply staged package
DELETE /api/update/staged        – cancel staged package
POST /api/update/rollback        – restore previous snapshot
DELETE /api/update/rollback      – delete rollback snapshot (reclaim disk space)
"""
from __future__ import annotations

import platform

from fastapi import APIRouter, HTTPException, UploadFile

from app.services import update_service

router = APIRouter(prefix="/api/update", tags=["update"])

_is_linux = platform.system() == "Linux"

# Minimum free space before we accept an OTA upload.
# Apply phase needs ~50 MB extract + ~30 MB backup + pip temp files.
_MIN_FREE_MB_FOR_UPLOAD = 200


@router.get("/status")
async def update_status():
    """Return current version, staged package info, live apply progress, and disk space."""
    if not _is_linux:
        return update_service.get_update_status_mock()
    return update_service.get_update_status()


@router.post("/upload")
async def upload_update(file: UploadFile):
    """
    Upload a .nasos OTA package. Streams directly to the staging directory to
    avoid exhausting the private /tmp tmpfs or reading the entire file into RAM.
    The package is validated immediately; it is not applied until POST /apply.
    """
    if not file.filename or not file.filename.endswith(".nasos"):
        raise HTTPException(400, "File must have a .nasos extension")

    # Pre-flight: refuse the upload if disk space is already dangerously low.
    # This gives the user a clear, actionable error instead of a cryptic mid-stream
    # failure (which Electron/Chromium surfaces as "error parsing body").
    free_mb = update_service.get_free_mb()
    if free_mb != -1 and free_mb < _MIN_FREE_MB_FOR_UPLOAD:
        raise HTTPException(
            507,
            f"Insufficient disk space: {free_mb} MB free, {_MIN_FREE_MB_FOR_UPLOAD} MB needed. "
            "Go to Settings → Updates → Clear rollback snapshot to reclaim space, "
            "or remove /opt/nasos/data/update-staging/rollback via SSH.",
        )

    try:
        info = await update_service.stage_update_stream(file, file.filename)
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


@router.delete("/rollback")
async def delete_rollback_snapshot():
    """
    Delete the rollback snapshot from disk to reclaim space.

    The rollback snapshot (~20-200 MB) lives in /opt/nasos/data/update-staging/rollback/
    on the root partition.  After a successful OTA you no longer need it, and
    on a Pi with a 3 GB root partition even 200 MB can be the difference between
    services starting normally and all services (Samba, NFS, journal, ...) failing
    because they cannot create PID / socket / lock files on a full filesystem.
    """
    try:
        return update_service.clear_rollback_snapshot()
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
