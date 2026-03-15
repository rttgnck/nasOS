import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, backup, docker, extras, file_ops, files, logs, network, preferences, security, shares, storage, system, update, users, wifi
from app.core.config import settings
from app.core.database import async_session, init_db
from app.services.share_service import seed_default_shares, ensure_smb_global_settings
from app.services.user_service import ensure_admin_user
from app.services.update_service import background_update_check
from app.core.security import get_current_user
from app.ws.metrics import metrics_ws
from app.ws.file_ops import file_ops_ws
from app.ws.theme_sync import theme_sync_ws
from app.ws.terminal import terminal_ws

_UPDATE_CHECK_INTERVAL = 86400  # 24 hours


async def _daily_update_checker():
    """Background task that checks for updates once daily."""
    await asyncio.sleep(30)  # initial delay to let the app start up
    while True:
        await background_update_check()
        await asyncio.sleep(_UPDATE_CHECK_INTERVAL)


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
    yield
    update_task.cancel()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
)

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
app.include_router(system.router)  # /api/system/health is public for health checks

# ── Protected routes (JWT required) ──────────────────────────────────
_auth = [Depends(get_current_user)]

app.include_router(files.router, dependencies=_auth)
app.include_router(storage.router, dependencies=_auth)
app.include_router(shares.router, dependencies=_auth)
app.include_router(users.router, dependencies=_auth)
app.include_router(network.router, dependencies=_auth)
app.include_router(wifi.router, dependencies=_auth)
app.include_router(docker.router, dependencies=_auth)
app.include_router(backup.router, dependencies=_auth)
app.include_router(security.router, dependencies=_auth)
app.include_router(extras.router, dependencies=_auth)
app.include_router(logs.router, dependencies=_auth)
app.include_router(update.router, dependencies=_auth)
app.include_router(file_ops.router, dependencies=_auth)
app.include_router(preferences.router, dependencies=_auth)

# WebSocket
app.websocket("/ws/metrics")(metrics_ws)
app.websocket("/ws/file-ops")(file_ops_ws)
app.websocket("/ws/theme-sync")(theme_sync_ws)
app.websocket("/ws/terminal")(terminal_ws)

# Serve frontend static files in production
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
