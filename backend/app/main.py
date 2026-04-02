import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.formparsers import MultiPartParser
from starlette.types import ASGIApp, Receive, Scope, Send

# NAS: allow arbitrarily large file uploads (Starlette defaults are far too small)
_NO_LIMIT = 1024 ** 4   # 1 TiB – effectively unlimited
for _attr in ("max_file_size", "max_part_size"):
    if hasattr(MultiPartParser, _attr):
        setattr(MultiPartParser, _attr, _NO_LIMIT)

from app.api import auth, backup, display, docker, extras, file_ops, files, logs, network, preferences, sata, security, shares, storage, system, system_backup, update, users, wifi
from app.core.config import settings
from app.core.database import async_session, init_db
from app.services.share_service import seed_default_shares, ensure_smb_global_settings
from app.services.user_service import ensure_admin_user
from app.services.update_service import background_update_check
from app.services.sata_storage_service import scan_and_automount
from app.services.system_backup_service import start_scheduler as start_backup_scheduler, stop_scheduler as stop_backup_scheduler
from app.core.security import get_current_user
from app.ws.metrics import metrics_ws
from app.ws.file_ops import file_ops_ws
from app.ws.theme_sync import theme_sync_ws
from app.ws.terminal import terminal_ws

_UPDATE_CHECK_INTERVAL = 86400  # 24 hours
_DISK_SCAN_INTERVAL = 15  # seconds


async def _daily_update_checker():
    """Background task that checks for updates once daily."""
    await asyncio.sleep(30)  # initial delay to let the app start up
    while True:
        await background_update_check()
        await asyncio.sleep(_UPDATE_CHECK_INTERVAL)


async def _disk_scanner():
    """Background task that scans for new/reconnected drives and auto-mounts them."""
    import logging
    _scan_log = logging.getLogger("nasos.disk_scanner")
    await asyncio.sleep(10)  # let the boot mount service finish first
    while True:
        try:
            actions = await asyncio.to_thread(scan_and_automount)
            if actions:
                _scan_log.info("Disk scan: %s", actions)
        except Exception as exc:
            _scan_log.warning("Disk scan error: %s", exc)
        await asyncio.sleep(_DISK_SCAN_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure data directory exists
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    async with async_session() as db:
        await seed_default_shares(db)
    # Patch any legacy smb.conf global settings on existing deployments
    # (e.g. 'server smb encrypt = desired' → 'if_required' for macOS compat)
    ensure_smb_global_settings()
    # Ensure the built-in admin user exists with Samba access + change-password flag
    ensure_admin_user()
    # Start daily update checker
    update_task = asyncio.create_task(_daily_update_checker())
    # Start disk auto-mount scanner
    disk_scan_task = asyncio.create_task(_disk_scanner())
    # Start system-backup scheduler
    start_backup_scheduler()
    yield
    update_task.cancel()
    disk_scan_task.cancel()
    stop_backup_scheduler()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
)


# ── Security headers middleware (pure ASGI – does not buffer request bodies) ──
class SecurityHeadersMiddleware:
    _HEADERS: list[tuple[bytes, bytes]] = [
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"SAMEORIGIN"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
        (b"x-xss-protection", b"1; mode=block"),
    ]

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(self._HEADERS)
                if not settings.dev_mode:
                    headers.append(
                        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                    )
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(SecurityHeadersMiddleware)

# CORS for dev (frontend on different port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Public routes (no auth required) ─────────────────────────────────
app.include_router(auth.router)
app.include_router(system.health_router)  # /api/system/health only

# ── Protected routes (JWT required) ──────────────────────────────────
_auth = [Depends(get_current_user)]

app.include_router(system.router, dependencies=_auth)
app.include_router(files.router, dependencies=_auth)
app.include_router(storage.router, dependencies=_auth)
app.include_router(shares.router, dependencies=_auth)
app.include_router(users.router, dependencies=_auth)
app.include_router(network.router, dependencies=_auth)
app.include_router(wifi.router, dependencies=_auth)
app.include_router(docker.router, dependencies=_auth)
app.include_router(backup.router, dependencies=_auth)
app.include_router(security.router, dependencies=_auth)
app.include_router(display.router, dependencies=_auth)
app.include_router(sata.router, dependencies=_auth)
app.include_router(extras.router, dependencies=_auth)
app.include_router(logs.router, dependencies=_auth)
app.include_router(update.router, dependencies=_auth)
app.include_router(file_ops.router, dependencies=_auth)
app.include_router(preferences.router, dependencies=_auth)
app.include_router(system_backup.router, dependencies=_auth)

# WebSocket
app.websocket("/ws/metrics")(metrics_ws)
app.websocket("/ws/file-ops")(file_ops_ws)
app.websocket("/ws/theme-sync")(theme_sync_ws)
app.websocket("/ws/terminal")(terminal_ws)

# Serve frontend static files in production
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
