from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.share_service import (
    create_share,
    delete_share,
    get_share,
    list_shares,
    toggle_share,
    update_share,
)

router = APIRouter(prefix="/api/shares", tags=["shares"])


class ShareCreate(BaseModel):
    name: str
    path: str
    protocol: str = "smb"
    read_only: bool = False
    guest_access: bool = False
    description: str = ""
    allowed_users: str = ""
    allowed_hosts: str = ""


class ShareUpdate(BaseModel):
    name: str | None = None
    path: str | None = None
    protocol: str | None = None
    enabled: bool | None = None
    read_only: bool | None = None
    guest_access: bool | None = None
    description: str | None = None
    allowed_users: str | None = None
    allowed_hosts: str | None = None


@router.get("")
async def get_shares(db: AsyncSession = Depends(get_db)):
    """List all configured shares."""
    shares = await list_shares(db)
    return {"shares": shares}


@router.get("/{share_id}")
async def get_share_by_id(share_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single share by ID."""
    share = await get_share(db, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    return share


@router.post("")
async def create_new_share(body: ShareCreate, db: AsyncSession = Depends(get_db)):
    """Create a new share."""
    share = await create_share(db, body.model_dump())
    return share


@router.put("/{share_id}")
async def update_existing_share(share_id: int, body: ShareUpdate, db: AsyncSession = Depends(get_db)):
    """Update an existing share."""
    data = body.model_dump(exclude_none=True)
    share = await update_share(db, share_id, data)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    return share


@router.delete("/{share_id}")
async def delete_existing_share(share_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a share."""
    ok = await delete_share(db, share_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"ok": True}


@router.post("/{share_id}/toggle")
async def toggle_share_enabled(share_id: int, db: AsyncSession = Depends(get_db)):
    """Enable or disable a share."""
    share = await toggle_share(db, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    return share
