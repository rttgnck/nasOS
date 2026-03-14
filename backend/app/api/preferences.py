"""Per-user preferences API (theme data)."""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user_preferences import UserPreferences
from app.ws.theme_sync import broadcast_theme_update

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


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
