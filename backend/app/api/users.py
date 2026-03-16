import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.user_service import (
    change_password,
    clear_password_change_required,
    create_user,
    delete_user,
    get_groups,
    get_users,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    fullname: str = ""
    groups: list[str] = []


class PasswordChange(BaseModel):
    password: str


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
        _log.exception("Failed to create user %s", body.username)
        raise HTTPException(status_code=500, detail="Failed to create user")


@router.delete("/{username}")
async def remove_user(username: str):
    """Delete a system user."""
    if username in ("root", "admin"):
        raise HTTPException(status_code=400, detail="Cannot delete protected user")
    ok = delete_user(username)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.post("/{username}/password")
async def set_password(username: str, body: PasswordChange):
    """
    Set a new password for an existing user — updates both the Linux shadow
    database and the Samba password database in one call.

    This is the primary fix for Pi Imager deployments: Pi Imager stores the
    password as a bcrypt/sha512 hash in firstrun.sh so first-boot.sh cannot
    extract the plaintext to initialise the Samba account. After logging into
    the nasOS desktop, go to Settings > Users and use Set Password to activate
    SMB authentication with a chosen password.
    """
    if not body.password:
        raise HTTPException(status_code=400, detail="Password cannot be empty")
    try:
        result = change_password(username, body.password)
        # Clear the must-change-password flag — the user has now set a custom password.
        clear_password_change_required(username)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        _log.exception("Failed to change password for %s", username)
        raise HTTPException(status_code=500, detail="Failed to change password")
