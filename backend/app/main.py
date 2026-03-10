from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import backup, docker, extras, files, logs, network, security, shares, storage, system, users
from app.core.config import settings
from app.core.database import init_db
from app.ws.metrics import metrics_ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure data directory exists
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    yield


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

# API routes
app.include_router(system.router)
app.include_router(files.router)
app.include_router(storage.router)
app.include_router(shares.router)
app.include_router(users.router)
app.include_router(network.router)
app.include_router(docker.router)
app.include_router(backup.router)
app.include_router(security.router)
app.include_router(extras.router)
app.include_router(logs.router)

# WebSocket
app.websocket("/ws/metrics")(metrics_ws)

# Serve frontend static files in production
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
