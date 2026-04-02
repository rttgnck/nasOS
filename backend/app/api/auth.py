"""Authentication endpoints — login, token refresh, current user."""

import logging
import platform
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import create_access_token, get_current_user
from app.services.user_service import needs_password_change

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Simple in-memory rate limiter for login ─────────────────────────
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 300  # 5 minutes
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(client_ip: str) -> None:
    """Raise 429 if the client has exceeded the login attempt limit."""
    now = time.monotonic()
    attempts = _login_attempts[client_ip]
    # Prune old entries outside the window
    _login_attempts[client_ip] = [t for t in attempts if now - t < _WINDOW_SECONDS]
    if len(_login_attempts[client_ip]) >= _MAX_ATTEMPTS:
        _log.warning("Rate limit exceeded for login from %s", client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
        )


def _record_attempt(client_ip: str) -> None:
    _login_attempts[client_ip].append(time.monotonic())

_is_linux = platform.system() == "Linux"

# ── Dev-mode mock credentials ────────────────────────────────────────
# In production (Linux), we validate against /etc/shadow via crypt module.
# In dev mode, we use these hardcoded users with plaintext passwords.
_DEV_USERS = {
    "admin": {
        "username": "admin",
        "fullname": "Administrator",
        "password": "admin123",
        "groups": ["sudo", "nasos", "samba"],
    },
    "alice": {
        "username": "alice",
        "fullname": "Alice Smith",
        "password": "alice123",
        "groups": ["nasos", "samba"],
    },
}


# ── Pydantic models ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    must_change_password: bool = False


# ── Helpers ───────────────────────────────────────────────────────────

def _authenticate_dev(username: str, password: str) -> dict | None:
    """Validate against dev mock users (plaintext comparison for dev only)."""
    user = _DEV_USERS.get(username)
    if not user:
        return None
    if password != user["password"]:
        return None
    return {
        "username": user["username"],
        "fullname": user["fullname"],
        "groups": user["groups"],
    }


def _authenticate_linux(username: str, password: str) -> dict | None:
    """Validate against system shadow file (Linux only)."""
    try:
        import crypt
        import spwd

        shadow = spwd.getspnam(username)
        if crypt.crypt(password, shadow.sp_pwdp) == shadow.sp_pwdp:
            import pwd as pwd_mod
            import grp
            pw = pwd_mod.getpwnam(username)
            groups = [g.gr_name for g in grp.getgrall() if username in g.gr_mem]
            return {
                "username": username,
                "fullname": pw.pw_gecos.split(",")[0] if pw.pw_gecos else "",
                "groups": groups,
            }
    except (KeyError, ImportError, PermissionError):
        pass
    return None


def authenticate_user(username: str, password: str) -> dict | None:
    """Authenticate a user. Returns user dict or None."""
    if _is_linux:
        return _authenticate_linux(username, password)
    return _authenticate_dev(username, password)


def _get_user_profile(username: str) -> dict | None:
    """Look up user info by username (no password check). Returns None if unknown."""
    if not _is_linux:
        dev_user = _DEV_USERS.get(username)
        if not dev_user:
            return None
        return {
            "username": dev_user["username"],
            "fullname": dev_user["fullname"],
            "groups": dev_user["groups"],
        }
    try:
        import pwd as pwd_mod
        import grp
        pw = pwd_mod.getpwnam(username)
        groups = [g.gr_name for g in grp.getgrall() if username in g.gr_mem]
        return {
            "username": username,
            "fullname": pw.pw_gecos.split(",")[0] if pw.pw_gecos else "",
            "groups": groups,
        }
    except (KeyError, ImportError):
        return None


# ── Auto-login config (file-backed) ─────────────────────────────────

_AUTOLOGIN_FILE = settings.data_dir / ".autologin"


def _get_autologin_username() -> str | None:
    """Return the configured auto-login username, or None if disabled."""
    if not _AUTOLOGIN_FILE.exists():
        return None
    try:
        name = _AUTOLOGIN_FILE.read_text().strip()
        return name or None
    except OSError:
        return None


def _set_autologin_username(username: str | None) -> None:
    """Persist (or clear) the auto-login username."""
    _AUTOLOGIN_FILE.parent.mkdir(parents=True, exist_ok=True)
    if username:
        _AUTOLOGIN_FILE.write_text(username)
    elif _AUTOLOGIN_FILE.exists():
        _AUTOLOGIN_FILE.unlink()


def _is_localhost(request: Request) -> bool:
    """True when the request originates from the local machine."""
    if not request.client:
        return False
    return request.client.host in ("127.0.0.1", "::1", "localhost")


# ── Routes ────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request):
    """Authenticate user and return JWT access token."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    user = authenticate_user(body.username, body.password)
    if not user:
        _record_attempt(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject=user["username"])
    return LoginResponse(
        access_token=token,
        user=user,
        must_change_password=needs_password_change(user["username"]),
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return the current authenticated user's info, including must_change_password flag."""
    username = current_user["username"]
    profile = _get_user_profile(username)
    if profile:
        return {**profile, "must_change_password": needs_password_change(username)}
    return {**current_user, "must_change_password": needs_password_change(username)}


# ── Auto-login routes ────────────────────────────────────────────────

class AutologinRequest(BaseModel):
    username: str | None = None


@router.get("/autologin")
async def autologin_token(request: Request):
    """Public endpoint — issue a JWT if auto-login is configured.

    Restricted to localhost so only the onboard display can use it.
    """
    if not _is_localhost(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Auto-login is only available from the local display")

    username = _get_autologin_username()
    if not username:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-login not configured")

    profile = _get_user_profile(username)
    if not profile:
        _log.warning("Auto-login user %r no longer exists — clearing config", username)
        _set_autologin_username(None)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-login user no longer exists")

    token = create_access_token(subject=username)
    return LoginResponse(
        access_token=token,
        user=profile,
        must_change_password=needs_password_change(username),
    )


@router.get("/autologin/status")
async def autologin_status(current_user: dict = Depends(get_current_user)):
    """Return current auto-login configuration."""
    username = _get_autologin_username()
    return {"enabled": username is not None, "username": username}


@router.put("/autologin")
async def autologin_set(body: AutologinRequest, current_user: dict = Depends(get_current_user)):
    """Enable or disable auto-login. Send username to enable, null to disable."""
    if body.username:
        profile = _get_user_profile(body.username)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User '{body.username}' not found")
        _set_autologin_username(body.username)
        _log.info("Auto-login enabled for user %r by %s", body.username, current_user["username"])
    else:
        _set_autologin_username(None)
        _log.info("Auto-login disabled by %s", current_user["username"])
    return {"enabled": body.username is not None, "username": body.username}
