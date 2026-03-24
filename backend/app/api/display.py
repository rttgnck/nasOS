from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.display_service import (
    VALID_ROTATIONS,
    get_display_info,
    save_display_config,
)

router = APIRouter(prefix="/api/display", tags=["display"])


class DisplayConfigPayload(BaseModel):
    rotation: int = 0
    connector: str = ""
    resolution: str = ""
    touch_rotation: int | None = None


@router.get("")
async def display_info():
    """Connected displays and current rotation / touch settings."""
    return get_display_info()


@router.post("")
async def update_display(payload: DisplayConfigPayload):
    """Save screen rotation and touch orientation.  Requires a reboot to apply."""
    if payload.rotation not in VALID_ROTATIONS:
        raise HTTPException(400, f"rotation must be one of {VALID_ROTATIONS}")
    if (
        payload.touch_rotation is not None
        and payload.touch_rotation not in VALID_ROTATIONS
    ):
        raise HTTPException(400, f"touch_rotation must be null or one of {VALID_ROTATIONS}")
    return save_display_config(
        payload.rotation,
        payload.connector,
        payload.resolution,
        payload.touch_rotation,
    )
