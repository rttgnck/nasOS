from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.user_service import create_user, delete_user, get_groups, get_users

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    fullname: str = ""
    groups: list[str] = []


@router.get("")
async def list_users():
    """List all system users (uid >= 1000)."""
    return {"users": get_users()}


@router.get("/groups")
async def list_groups():
    """List all system groups."""
    return {"groups": get_groups()}


@router.post("")
async def add_user(body: UserCreate):
    """Create a new system user."""
    try:
        user = create_user(
            username=body.username,
            password=body.password,
            fullname=body.fullname,
            groups=body.groups or None,
        )
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{username}")
async def remove_user(username: str):
    """Delete a system user."""
    if username in ("root", "admin"):
        raise HTTPException(status_code=400, detail="Cannot delete protected user")
    ok = delete_user(username)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
