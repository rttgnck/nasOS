from fastapi import APIRouter, Query

from app.services.system_extras_service import (
    get_acl_info,
    get_avahi_status,
    get_rootfs_status,
    get_smart_daemon_config,
    get_thermal_config,
    get_timemachine_config,
    get_update_status,
    get_ups_status,
)

router = APIRouter(prefix="/api/extras", tags=["extras"])


@router.get("/avahi")
async def avahi_status():
    """Avahi/mDNS service status and discovered devices."""
    return get_avahi_status()


@router.get("/timemachine")
async def timemachine_config():
    """Time Machine backup target configuration."""
    return get_timemachine_config()


@router.get("/ups")
async def ups_status():
    """UPS (NUT) status — battery, load, runtime."""
    return get_ups_status()


@router.get("/rootfs")
async def rootfs_status():
    """Read-only root filesystem and overlay status."""
    return get_rootfs_status()


@router.get("/thermal")
async def thermal_config():
    """Thermal management — temps, fan, throttle status."""
    return get_thermal_config()


@router.get("/updates")
async def update_status():
    """OTA update status and changelog."""
    return get_update_status()


@router.get("/smart-daemon")
async def smart_daemon():
    """SMART monitoring daemon configuration."""
    return get_smart_daemon_config()


@router.get("/acl")
async def acl_info(path: str = Query(..., description="File/directory path")):
    """Get ACL entries for a path."""
    return get_acl_info(path)
