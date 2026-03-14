"""
Async file-operations engine with per-chunk progress reporting.

All heavy I/O runs in a thread pool so the event loop stays responsive.
Progress is persisted to the DB and broadcast over WebSocket.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Literal

from sqlalchemy import select, update

from app.core.database import async_session
from app.models.file_operation import FileOperation

CHUNK_SIZE = 256 * 1024  # 256 KB per chunk

# ── In-memory registry of running tasks ──────────────────────────────
_running: dict[str, asyncio.Task] = {}
# Subscribers: op_id -> set of asyncio.Queue (one per WS connection)
_subscribers: dict[str, set[asyncio.Queue]] = {}


def subscribe(op_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=64)
    _subscribers.setdefault(op_id, set()).add(q)
    return q


def unsubscribe(op_id: str, q: asyncio.Queue):
    if op_id in _subscribers:
        _subscribers[op_id].discard(q)
        if not _subscribers[op_id]:
            del _subscribers[op_id]


# Global subscriber for *all* ops belonging to a user (keyed by username)
_user_subscribers: dict[str, set[asyncio.Queue]] = {}


def subscribe_user(username: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=64)
    _user_subscribers.setdefault(username, set()).add(q)
    return q


def unsubscribe_user(username: str, q: asyncio.Queue):
    if username in _user_subscribers:
        _user_subscribers[username].discard(q)
        if not _user_subscribers[username]:
            del _user_subscribers[username]


async def _broadcast(op_id: str, username: str, payload: dict):
    """Push a progress update to all WS subscribers for this op and user."""
    msg = json.dumps(payload)
    for q in list(_subscribers.get(op_id, [])):
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass
    for q in list(_user_subscribers.get(username, [])):
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass


# ── Public API ───────────────────────────────────────────────────────

def _resolve_path(rel: str) -> Path:
    """Resolve a frontend relative path to a filesystem path, share-aware."""
    from app.api.files import _safe_path
    return _safe_path(rel)


async def start_operation(
    user: str,
    op_type: Literal["copy", "move", "delete"],
    sources: list[str],
    destination: str,
    conflict_policy: str = "ask",
) -> str:
    """Create a DB record, compute totals, then launch the background task."""
    op_id = f"fop-{uuid.uuid4().hex[:12]}"

    resolved_sources = [_resolve_path(s) for s in sources]
    total_files, total_bytes = await asyncio.to_thread(
        _scan_totals_resolved, resolved_sources
    )

    async with async_session() as db:
        op = FileOperation(
            id=op_id,
            user=user,
            op_type=op_type,
            status="running",
            sources_json=json.dumps(sources),
            destination=destination,
            total_files=total_files,
            total_bytes=total_bytes,
        )
        db.add(op)
        await db.commit()

    task = asyncio.create_task(
        _run_operation(op_id, user, op_type, sources, destination, conflict_policy)
    )
    _running[op_id] = task
    task.add_done_callback(lambda _t: _running.pop(op_id, None))
    return op_id


async def cancel_operation(op_id: str):
    task = _running.get(op_id)
    if task and not task.done():
        task.cancel()
    async with async_session() as db:
        await db.execute(
            update(FileOperation)
            .where(FileOperation.id == op_id)
            .values(status="cancelled")
        )
        await db.commit()


async def resolve_conflict(op_id: str, resolution: str):
    """Resume a paused (conflict) operation with a resolution."""
    pending = _conflict_resolutions.get(op_id)
    if pending and not pending.done():
        pending.set_result(resolution)


_conflict_resolutions: dict[str, asyncio.Future] = {}


async def get_operations(user: str) -> list[dict]:
    async with async_session() as db:
        result = await db.execute(
            select(FileOperation)
            .where(FileOperation.user == user)
            .order_by(FileOperation.created_at.desc())
            .limit(50)
        )
        rows = result.scalars().all()
        return [_row_to_dict(r) for r in rows]


async def get_operation(op_id: str) -> dict | None:
    async with async_session() as db:
        row = await db.get(FileOperation, op_id)
        return _row_to_dict(row) if row else None


async def dismiss_operation(op_id: str):
    """Remove a completed/cancelled/failed operation from the DB."""
    async with async_session() as db:
        row = await db.get(FileOperation, op_id)
        if row and row.status in ("completed", "failed", "cancelled"):
            await db.delete(row)
            await db.commit()


# ── Internal helpers ─────────────────────────────────────────────────

def _scan_totals_resolved(resolved_sources: list[Path]) -> tuple[int, int]:
    total_files = 0
    total_bytes = 0
    for src in resolved_sources:
        if src.is_file():
            total_files += 1
            total_bytes += src.stat().st_size
        elif src.is_dir():
            for root, _dirs, files in os.walk(src):
                for f in files:
                    total_files += 1
                    try:
                        total_bytes += os.path.getsize(os.path.join(root, f))
                    except OSError:
                        pass
    return total_files, total_bytes


def _row_to_dict(row: FileOperation) -> dict:
    return {
        "id": row.id,
        "user": row.user,
        "op_type": row.op_type,
        "status": row.status,
        "sources": json.loads(row.sources_json),
        "destination": row.destination,
        "total_files": row.total_files,
        "total_bytes": row.total_bytes,
        "completed_files": row.completed_files,
        "completed_bytes": row.completed_bytes,
        "current_file": row.current_file,
        "speed_bps": row.speed_bps,
        "error_message": row.error_message,
        "conflict": json.loads(row.conflict_json) if row.conflict_json else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _update_progress(op_id: str, username: str, **fields):
    """Persist progress and broadcast to WS subscribers."""
    async with async_session() as db:
        await db.execute(
            update(FileOperation)
            .where(FileOperation.id == op_id)
            .values(**fields)
        )
        await db.commit()
        row = await db.get(FileOperation, op_id)
        payload = _row_to_dict(row) if row else {"id": op_id, **fields}
    payload["type"] = "file_op_progress"
    await _broadcast(op_id, username, payload)


# ── Copy/Move engine ────────────────────────────────────────────────

async def _run_operation(
    op_id: str,
    user: str,
    op_type: str,
    sources: list[str],
    destination: str,
    conflict_policy: str,
):
    completed_files = 0
    completed_bytes = 0
    speed_window: list[tuple[float, int]] = []

    dst_base = _resolve_path(destination)

    try:
        for src_rel in sources:
            src = _resolve_path(src_rel)
            if not src.exists():
                continue

            if src.is_file():
                target = dst_base / src.name
                target, conflict_policy = await _handle_conflict(
                    op_id, user, target, conflict_policy
                )
                if target is None:
                    completed_files += 1
                    continue

                bytes_copied = await _copy_file_chunked(
                    op_id, user, src, target,
                    completed_files, completed_bytes, speed_window,
                )
                completed_bytes += bytes_copied
                completed_files += 1

                if op_type == "move":
                    await asyncio.to_thread(src.unlink)

            elif src.is_dir():
                file_list = await asyncio.to_thread(_collect_dir_files, src)
                for file_path in file_list:
                    rel = file_path.relative_to(src)
                    target = dst_base / src.name / rel
                    await asyncio.to_thread(target.parent.mkdir, parents=True, exist_ok=True)

                    target, conflict_policy = await _handle_conflict(
                        op_id, user, target, conflict_policy
                    )
                    if target is None:
                        completed_files += 1
                        continue

                    bytes_copied = await _copy_file_chunked(
                        op_id, user, file_path, target,
                        completed_files, completed_bytes, speed_window,
                    )
                    completed_bytes += bytes_copied
                    completed_files += 1

                if op_type == "move":
                    await asyncio.to_thread(shutil.rmtree, str(src))

        await _update_progress(
            op_id, user,
            status="completed",
            completed_files=completed_files,
            completed_bytes=completed_bytes,
            current_file=None,
            speed_bps=0,
        )

    except asyncio.CancelledError:
        await _update_progress(op_id, user, status="cancelled", current_file=None)
    except Exception as exc:
        await _update_progress(
            op_id, user,
            status="failed",
            error_message=str(exc),
            current_file=None,
        )


def _collect_dir_files(src: Path) -> list[Path]:
    result = []
    for root, _dirs, files in os.walk(src):
        for f in files:
            result.append(Path(root) / f)
    return result


async def _copy_file_chunked(
    op_id: str,
    user: str,
    src: Path,
    dst: Path,
    completed_files: int,
    completed_bytes: int,
    speed_window: list[tuple[float, int]],
) -> int:
    """Copy a single file in CHUNK_SIZE chunks, reporting progress."""
    file_size = src.stat().st_size
    copied = 0
    last_update = time.monotonic()

    await asyncio.to_thread(dst.parent.mkdir, parents=True, exist_ok=True)

    with open(src, "rb") as fin:
        with open(dst, "wb") as fout:
            while True:
                chunk = await asyncio.to_thread(fin.read, CHUNK_SIZE)
                if not chunk:
                    break
                await asyncio.to_thread(fout.write, chunk)
                copied += len(chunk)

                now = time.monotonic()
                speed_window.append((now, len(chunk)))
                # Trim window to last 2 seconds
                speed_window[:] = [(t, b) for t, b in speed_window if now - t < 2.0]
                total_window_bytes = sum(b for _, b in speed_window)
                window_duration = max(now - speed_window[0][0], 0.1) if speed_window else 1.0
                speed = total_window_bytes / window_duration

                if now - last_update >= 0.25:
                    await _update_progress(
                        op_id, user,
                        completed_files=completed_files,
                        completed_bytes=completed_bytes + copied,
                        current_file=src.name,
                        speed_bps=speed,
                    )
                    last_update = now

    # Preserve timestamps
    try:
        stat = src.stat()
        os.utime(dst, (stat.st_atime, stat.st_mtime))
    except OSError:
        pass

    return file_size


async def _handle_conflict(
    op_id: str,
    user: str,
    target: Path,
    policy: str,
) -> tuple[Path | None, str]:
    """
    If target exists, handle based on policy.
    Returns (resolved_target, possibly_updated_policy).
    None target = skip this file.
    """
    if not target.exists():
        return target, policy

    if policy == "overwrite" or policy == "overwrite_all":
        return target, policy
    if policy == "skip" or policy == "skip_all":
        return None, policy
    if policy == "rename" or policy == "rename_all":
        return _auto_rename(target), policy

    # policy == "ask": pause and wait for user resolution
    conflict_data = {
        "file": target.name,
        "path": str(target),
        "existing_size": target.stat().st_size,
        "existing_modified": target.stat().st_mtime,
    }
    await _update_progress(
        op_id, user,
        status="conflict",
        conflict_json=json.dumps(conflict_data),
    )

    loop = asyncio.get_running_loop()
    future: asyncio.Future = loop.create_future()
    _conflict_resolutions[op_id] = future

    try:
        resolution = await asyncio.wait_for(future, timeout=300)
    except asyncio.TimeoutError:
        resolution = "skip"
    finally:
        _conflict_resolutions.pop(op_id, None)

    await _update_progress(op_id, user, status="running", conflict_json=None)

    if resolution == "overwrite":
        return target, policy
    if resolution == "overwrite_all":
        return target, "overwrite_all"
    if resolution == "skip":
        return None, policy
    if resolution == "skip_all":
        return None, "skip_all"
    if resolution == "rename":
        return _auto_rename(target), policy
    if resolution == "rename_all":
        return _auto_rename(target), "rename_all"

    return None, policy


def _auto_rename(target: Path) -> Path:
    stem = target.stem
    suffix = target.suffix
    parent = target.parent
    counter = 1
    while True:
        candidate = parent / f"{stem} ({counter}){suffix}"
        if not candidate.exists():
            return candidate
        counter += 1
