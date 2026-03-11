from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.docker_service import (
    container_action,
    get_app_catalog,
    get_container_logs,
    get_containers,
    install_app,
)

router = APIRouter(prefix="/api/docker", tags=["docker"])


class ContainerAction(BaseModel):
    action: str  # start, stop, restart, remove


@router.get("/containers")
async def list_containers():
    """List all Docker containers."""
    return {"containers": get_containers()}


@router.post("/containers/{container_id}")
async def perform_action(container_id: str, body: ContainerAction):
    """Start, stop, restart, or remove a container."""
    if body.action not in ("start", "stop", "restart", "remove"):
        raise HTTPException(status_code=400, detail="Invalid action")
    result = container_action(container_id, body.action)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result


@router.get("/containers/{container_id}/logs")
async def container_logs(container_id: str, tail: int = 100):
    """Get the last N log lines from a container."""
    lines = get_container_logs(container_id, tail)
    return {"logs": lines, "container_id": container_id}


@router.get("/catalog")
async def app_catalog():
    """Get the app store catalog."""
    return {"apps": get_app_catalog()}


@router.post("/install/{app_id}")
async def install(app_id: str):
    """Install an app from the catalog."""
    result = install_app(app_id)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result
