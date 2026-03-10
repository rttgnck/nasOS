"""Log viewer API endpoints."""

from fastapi import APIRouter, Query

from app.services.log_service import get_available_units, get_logs

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("")
async def list_logs(
    lines: int = Query(200, ge=1, le=5000),
    unit: str | None = Query(None),
    priority: int | None = Query(None, ge=0, le=7),
    grep: str | None = Query(None),
):
    """Get system logs with optional filtering."""
    logs = get_logs(lines=lines, unit=unit, priority=priority, grep=grep)
    return {"logs": logs, "count": len(logs)}


@router.get("/units")
async def list_units():
    """Get available systemd units."""
    units = get_available_units()
    return {"units": units}
