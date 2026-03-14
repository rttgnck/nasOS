"""REST endpoints for batch file operations with progress tracking."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.files import _safe_path
from app.core.security import get_current_user
from app.services.file_ops import (
    start_operation,
    cancel_operation,
    resolve_conflict,
    get_operations,
    get_operation,
    dismiss_operation,
)

router = APIRouter(prefix="/api/file-ops", tags=["file-ops"])


class BatchRequest(BaseModel):
    sources: list[str]
    destination: str
    conflict_policy: str = "ask"


class ConflictResolution(BaseModel):
    resolution: str


def _validate_paths(sources: list[str], destination: str):
    for src in sources:
        resolved = _safe_path(src)
        if not resolved.exists():
            raise HTTPException(status_code=404, detail=f"Source not found: {src}")
    dst = _safe_path(destination)
    if not dst.is_dir():
        raise HTTPException(status_code=400, detail="Destination must be a directory")


@router.post("/copy")
async def batch_copy(req: BatchRequest, user: dict = Depends(get_current_user)):
    _validate_paths(req.sources, req.destination)
    op_id = await start_operation(
        user=user["username"],
        op_type="copy",
        sources=req.sources,
        destination=req.destination,
        conflict_policy=req.conflict_policy,
    )
    return {"op_id": op_id}


@router.post("/move")
async def batch_move(req: BatchRequest, user: dict = Depends(get_current_user)):
    _validate_paths(req.sources, req.destination)
    op_id = await start_operation(
        user=user["username"],
        op_type="move",
        sources=req.sources,
        destination=req.destination,
        conflict_policy=req.conflict_policy,
    )
    return {"op_id": op_id}


@router.get("/")
async def list_operations(user: dict = Depends(get_current_user)):
    ops = await get_operations(user["username"])
    return {"operations": ops}


@router.get("/{op_id}")
async def get_op(op_id: str, user: dict = Depends(get_current_user)):
    op = await get_operation(op_id)
    if not op or op["user"] != user["username"]:
        raise HTTPException(status_code=404, detail="Operation not found")
    return op


@router.post("/{op_id}/cancel")
async def cancel_op(op_id: str, user: dict = Depends(get_current_user)):
    op = await get_operation(op_id)
    if not op or op["user"] != user["username"]:
        raise HTTPException(status_code=404, detail="Operation not found")
    await cancel_operation(op_id)
    return {"status": "cancelled"}


@router.post("/{op_id}/resolve")
async def resolve_op_conflict(op_id: str, body: ConflictResolution, user: dict = Depends(get_current_user)):
    op = await get_operation(op_id)
    if not op or op["user"] != user["username"]:
        raise HTTPException(status_code=404, detail="Operation not found")
    if op["status"] != "conflict":
        raise HTTPException(status_code=400, detail="Operation is not in conflict state")
    await resolve_conflict(op_id, body.resolution)
    return {"status": "resolved"}


@router.post("/{op_id}/dismiss")
async def dismiss_op(op_id: str, user: dict = Depends(get_current_user)):
    op = await get_operation(op_id)
    if not op or op["user"] != user["username"]:
        raise HTTPException(status_code=404, detail="Operation not found")
    await dismiss_operation(op_id)
    return {"status": "dismissed"}
