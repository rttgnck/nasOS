from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


def decode_token(token: str) -> str | None:
    """Extract username from JWT. Returns None on any failure."""
    try:
        payload = decode_access_token(token)
        return payload.get("sub")
    except JWTError:
        return None


async def verify_ws_token(token: str | None) -> dict | None:
    """Validate a JWT passed as a query param on WebSocket connect."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        return {"username": username} if username else None
    except JWTError:
        return None


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> dict:
    """Decode JWT and return user dict. Raises 401 if invalid/missing.

    Accepts the token from the Authorization header (primary) or from a
    ``token`` query parameter (fallback for ``<img>``/``<video>`` elements
    that cannot send custom headers).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Fallback: accept token from query string (for media elements)
    if token is None and request is not None:
        token = request.query_params.get("token")

    if token is None:
        raise credentials_exception

    try:
        payload = decode_access_token(token)
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Return a minimal user dict from the JWT claims
    return {"username": username}
