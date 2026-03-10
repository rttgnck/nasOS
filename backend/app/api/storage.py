from fastapi import APIRouter, HTTPException, Query

from app.services.disk_service import get_disks, get_smart_data, get_volumes, get_overview

router = APIRouter(prefix="/api/storage", tags=["storage"])


@router.get("/overview")
async def storage_overview():
    """High-level storage summary."""
    return get_overview()


@router.get("/disks")
async def list_disks():
    """List all physical disks and their partitions."""
    return {"disks": get_disks()}


@router.get("/disks/smart")
async def disk_smart(device: str = Query(..., description="Device path, e.g. /dev/sda")):
    """Get SMART health data for a disk."""
    data = get_smart_data(device)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])
    return data


@router.get("/volumes")
async def list_volumes():
    """List mounted volumes with usage statistics."""
    return {"volumes": get_volumes()}
