"""Per-user preferences API (theme + desktop state)."""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user_preferences import UserPreferences
from app.ws.theme_sync import broadcast_theme_update, broadcast_desktop_update

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


# ── Theme ──────────────────────────────────────────────────────────


class ThemePrefsPayload(BaseModel):
    active_theme_id: str
    custom_themes: list[dict]


@router.get("/theme")
async def get_theme_prefs(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(UserPreferences, user["username"])
    if not row:
        return {"active_theme_id": "default", "custom_themes": []}
    return {
        "active_theme_id": row.active_theme_id,
        "custom_themes": json.loads(row.custom_themes_json),
    }


@router.put("/theme")
async def set_theme_prefs(
    payload: ThemePrefsPayload,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    username = user["username"]
    row = await db.get(UserPreferences, username)
    if row is None:
        row = UserPreferences(username=username)
        db.add(row)

    row.active_theme_id = payload.active_theme_id
    row.custom_themes_json = json.dumps(payload.custom_themes)
    await db.commit()

    await broadcast_theme_update(username, {
        "active_theme_id": payload.active_theme_id,
        "custom_themes": payload.custom_themes,
    })

    return {"ok": True}


# ── Desktop state (wallpaper, icon positions, widgets) ─────────────


class DesktopStatePayload(BaseModel):
    wallpaper: str | None = None
    icon_positions: dict | None = None
    widgets: dict | None = None


@router.get("/desktop")
async def get_desktop_state(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(UserPreferences, user["username"])
    if not row or not row.desktop_state_json:
        return {"wallpaper": None, "icon_positions": None, "widgets": None}
    try:
        return json.loads(row.desktop_state_json)
    except (json.JSONDecodeError, TypeError):
        return {"wallpaper": None, "icon_positions": None, "widgets": None}


@router.put("/desktop")
async def set_desktop_state(
    payload: DesktopStatePayload,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    username = user["username"]
    row = await db.get(UserPreferences, username)
    if row is None:
        row = UserPreferences(username=username)
        db.add(row)

    # Merge: only overwrite fields that are provided, keep existing values
    try:
        existing = json.loads(row.desktop_state_json) if row.desktop_state_json else {}
    except (json.JSONDecodeError, TypeError):
        existing = {}

    update = payload.model_dump(exclude_none=True)
    existing.update(update)
    row.desktop_state_json = json.dumps(existing)
    await db.commit()

    await broadcast_desktop_update(username, existing)

    return {"ok": True}
