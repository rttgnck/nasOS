from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.display_service import (
    VALID_ROTATIONS,
    get_display_info,
    save_display_config,
)

router = APIRouter(prefix="/api/display", tags=["display"])


class PerDisplayConfig(BaseModel):
    enabled: bool = True
    rotation: int = 0
    touch_rotation: int | None = None


class DisplayConfigPayload(BaseModel):
    # Multi-display fields
    primary_connector: str | None = None
    display_configs: dict[str, PerDisplayConfig] | None = None
    display_overlays: list[str] | None = None
    # Legacy single-display fields (accepted for backward compat)
    rotation: int = 0
    connector: str = ""
    resolution: str = ""
    touch_rotation: int | None = None


@router.get("")
async def display_info():
    """Connected displays, per-display configs, and overlay status."""
    return get_display_info()


@router.post("")
async def update_display(payload: DisplayConfigPayload):
    """Save display configuration.  Requires a reboot to fully apply."""
    if payload.display_configs:
        for conn, cfg in payload.display_configs.items():
            if cfg.rotation not in VALID_ROTATIONS:
                raise HTTPException(
                    400, f"rotation for {conn} must be one of {VALID_ROTATIONS}"
                )
            if (
                cfg.touch_rotation is not None
                and cfg.touch_rotation not in VALID_ROTATIONS
            ):
                raise HTTPException(
                    400,
                    f"touch_rotation for {conn} must be null or one of {VALID_ROTATIONS}",
                )
    else:
        if payload.rotation not in VALID_ROTATIONS:
            raise HTTPException(400, f"rotation must be one of {VALID_ROTATIONS}")
        if (
            payload.touch_rotation is not None
            and payload.touch_rotation not in VALID_ROTATIONS
        ):
            raise HTTPException(
                400, f"touch_rotation must be null or one of {VALID_ROTATIONS}"
            )

    configs_dict = None
    if payload.display_configs:
        configs_dict = {k: v.model_dump() for k, v in payload.display_configs.items()}

    return save_display_config(
        primary_connector=payload.primary_connector or payload.connector or "",
        display_configs=configs_dict,
        display_overlays=payload.display_overlays,
        rotation=payload.rotation,
        connector=payload.connector,
        resolution=payload.resolution,
        touch_rotation=payload.touch_rotation,
    )
