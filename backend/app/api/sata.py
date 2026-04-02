import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.sata_storage_service import (
    forget_device,
    get_block_devices,
    get_mounted_volumes,
    get_sata_hat_status,
    mount_device,
    scan_and_automount,
    set_auto_mount,
    set_sata_hat_enabled,
    unmount_device,
    update_device,
)

router = APIRouter(prefix="/api/sata", tags=["sata"])


class SataHatPayload(BaseModel):
    enabled: bool


class MountPayload(BaseModel):
    device: str
    mount_point: str
    label: str = ""
    auto_mount: bool = True


class UnmountPayload(BaseModel):
    device_name: str


class UpdateDevicePayload(BaseModel):
    device_name: str
    label: str | None = None
    mount_point: str | None = None


class AutoMountPayload(BaseModel):
    device_name: str
    auto_mount: bool


@router.get("")
async def sata_status():
    """SATA HAT status and connected block devices."""
    await asyncio.to_thread(scan_and_automount)
    return {
        "hat": get_sata_hat_status(),
        "devices": get_block_devices(),
    }


@router.get("/volumes")
async def mounted_volumes():
    """Return all currently mounted data volumes (for the file manager)."""
    return {"volumes": get_mounted_volumes()}


@router.post("/hat")
async def toggle_sata_hat(payload: SataHatPayload):
    """Enable or disable the Penta SATA HAT (dtparam=pciex1)."""
    result = set_sata_hat_enabled(payload.enabled)
    if result.get("status") == "error":
        raise HTTPException(500, result["message"])
    return result


@router.post("/mount")
async def mount(payload: MountPayload):
    """Mount a partition at a given mount point."""
    if not payload.device:
        raise HTTPException(400, "device is required")
    if not payload.mount_point:
        raise HTTPException(400, "mount_point is required")
    result = mount_device(payload.device, payload.mount_point, payload.label, payload.auto_mount)
    if result.get("status") == "error":
        raise HTTPException(500, result["message"])
    return result


@router.post("/unmount")
async def unmount(payload: UnmountPayload):
    """Unmount a partition and remove its fstab entry."""
    result = unmount_device(payload.device_name)
    if result.get("status") == "error":
        raise HTTPException(500, result["message"])
    return result


@router.post("/auto-mount")
async def toggle_auto_mount(payload: AutoMountPayload):
    """Enable or disable auto-mount on boot for a device."""
    result = set_auto_mount(payload.device_name, payload.auto_mount)
    if result.get("status") == "error":
        raise HTTPException(500, result["message"])
    return result


@router.post("/scan")
async def scan():
    """Scan for new/reconnected drives and auto-mount them."""
    actions = await asyncio.to_thread(scan_and_automount)
    return {"actions": actions}


@router.delete("/device/{device_name}")
async def forget(device_name: str):
    """Completely remove a device from saved config (forget it)."""
    result = forget_device(device_name)
    if result.get("status") == "error":
        raise HTTPException(404, result["message"])
    return result


@router.put("/device")
async def update(payload: UpdateDevicePayload):
    """Rename a device or change its mount point."""
    result = update_device(payload.device_name, payload.label, payload.mount_point)
    if result.get("status") == "error":
        raise HTTPException(500, result["message"])
    return result
