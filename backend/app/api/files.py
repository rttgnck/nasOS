import asyncio
import json
import logging
import mimetypes
import os
import shutil
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)

from app.core.database import get_db
from app.models.share import Share

router = APIRouter(prefix="/api/files", tags=["files"])

# Default browsable root — will be configurable
BROWSE_ROOT = Path(os.environ.get("NASOS_BROWSE_ROOT", Path.home()))

# Share path prefix used by the frontend
_SHARE_PREFIX = "@shares/"


def _safe_path(relative: str) -> Path:
    """Resolve a relative path within the appropriate root.

    Paths starting with ``@shares/ShareName/...`` are resolved against that
    share's filesystem path.  All other paths resolve against BROWSE_ROOT (Home).
    """
    root, rel = _resolve_root_and_rel(relative)
    resolved = (root / rel).resolve()
    if not str(resolved).startswith(str(root.resolve())):
        raise HTTPException(status_code=403, detail="Path traversal denied")
    return resolved


def _resolve_root_and_rel(relative: str) -> tuple[Path, str]:
    """Return (filesystem_root, relative_path) for a given frontend path."""
    if relative.startswith(_SHARE_PREFIX):
        rest = relative[len(_SHARE_PREFIX):]
        parts = rest.split("/", 1)
        share_name = parts[0]
        sub_path = parts[1] if len(parts) > 1 else ""
        share_root = _get_share_root(share_name)
        if share_root is None:
            raise HTTPException(status_code=404, detail=f"Share not found: {share_name}")
        return share_root, sub_path
    return BROWSE_ROOT, relative


def _make_relative(target: Path, relative_input: str) -> str:
    """Return a frontend-friendly relative path for a resolved filesystem path.

    Re-attaches the @shares/ prefix when the original request targeted a share.
    """
    root, _ = _resolve_root_and_rel(relative_input)
    try:
        return str(target.relative_to(root))
    except ValueError:
        return str(target.relative_to(BROWSE_ROOT))


def _share_prefix_for(relative_input: str) -> str:
    """Return the @shares/Name/ prefix if the path targets a share, else ''."""
    if relative_input.startswith(_SHARE_PREFIX):
        rest = relative_input[len(_SHARE_PREFIX):]
        share_name = rest.split("/", 1)[0]
        return f"{_SHARE_PREFIX}{share_name}/"
    return ""


# Cache of share name → filesystem path (refreshed per-request via _get_share_root)
_share_cache: dict[str, Path] = {}


def _get_share_root(share_name: str) -> Path | None:
    """Synchronously look up a share's root path from the cache.

    The cache is populated by the /roots endpoint and by a startup refresh.
    Falls back to scanning the DB synchronously if needed (SQLite allows this
    in a pinch since we use the same file).
    """
    if share_name in _share_cache:
        return _share_cache[share_name]
    # Fall back to reading the DB synchronously (only for SQLite)
    import sqlite3
    from app.core.config import settings
    try:
        conn = sqlite3.connect(str(settings.db_path))
        row = conn.execute(
            "SELECT path FROM shares WHERE name = ? AND enabled = 1", (share_name,)
        ).fetchone()
        conn.close()
        if row:
            _share_cache[share_name] = Path(row[0])
            return _share_cache[share_name]
    except Exception:
        pass
    return None


async def _refresh_share_cache(db: AsyncSession):
    result = await db.execute(select(Share).where(Share.enabled == True))
    shares = result.scalars().all()
    _share_cache.clear()
    for s in shares:
        _share_cache[s.name] = Path(s.path)


# --- Roots (browsable locations) ---

@router.get("/roots")
async def get_roots(db: AsyncSession = Depends(get_db)):
    """Return all browsable root locations (Home + enabled shares)."""
    await _refresh_share_cache(db)
    roots = [{"id": "home", "name": "Home", "path": "", "icon": "home"}]
    result = await db.execute(
        select(Share).where(Share.enabled == True).order_by(Share.name)
    )
    for share in result.scalars().all():
        roots.append({
            "id": f"share-{share.id}",
            "name": share.name,
            "path": f"{_SHARE_PREFIX}{share.name}",
            "icon": "share",
            "description": share.description or "",
            "protocol": share.protocol,
        })
    return {"roots": roots}


# --- List ---

@router.get("/list")
async def list_files(path: str = Query("", description="Relative path from browse root")):
    target = _safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    root, _ = _resolve_root_and_rel(path)
    prefix = _share_prefix_for(path)

    entries = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            rel_path = prefix + str(entry.relative_to(root))
            try:
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "path": rel_path,
                    "is_dir": entry.is_dir(),
                    "size": stat.st_size if entry.is_file() else None,
                    "modified": stat.st_mtime,
                    "permissions": oct(stat.st_mode)[-3:],
                })
            except PermissionError:
                entries.append({
                    "name": entry.name,
                    "path": rel_path,
                    "is_dir": entry.is_dir(),
                    "size": None,
                    "modified": None,
                    "permissions": "---",
                })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Compute parent path
    if not path or path == prefix.rstrip("/"):
        parent_path = None
    elif path.startswith(_SHARE_PREFIX):
        rest = path[len(prefix):]
        parent_rel = str(Path(rest).parent)
        parent_path = prefix + parent_rel if parent_rel != "." else prefix.rstrip("/")
    else:
        parent_path = str(Path(path).parent) if path else None

    return {
        "path": path or "/",
        "parent": parent_path,
        "entries": entries,
    }


# --- Tree (for sidebar) ---

@router.get("/tree")
async def directory_tree(path: str = Query("", description="Relative path"), depth: int = Query(1, ge=1, le=5)):
    """Return directory tree for sidebar navigation."""
    target = _safe_path(path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found")

    root, _ = _resolve_root_and_rel(path)
    prefix = _share_prefix_for(path)

    def build_tree(dir_path: Path, current_depth: int) -> list:
        if current_depth <= 0:
            return []
        result = []
        try:
            for entry in sorted(dir_path.iterdir(), key=lambda e: e.name.lower()):
                if entry.is_dir() and not entry.name.startswith('.'):
                    result.append({
                        "name": entry.name,
                        "path": prefix + str(entry.relative_to(root)),
                        "children": build_tree(entry, current_depth - 1) if current_depth > 1 else [],
                        "has_children": any(e.is_dir() for e in entry.iterdir()) if current_depth == 1 else None,
                    })
        except PermissionError:
            pass
        return result

    return {"path": path or "/", "children": build_tree(target, depth)}


# --- Search ---

@router.get("/search")
async def search_files(
    path: str = Query("", description="Directory to search in"),
    query: str = Query(..., min_length=1, description="Search term"),
    max_results: int = Query(100, ge=1, le=500),
):
    """Search for files by name (case-insensitive substring match)."""
    target = _safe_path(path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found")

    root, _ = _resolve_root_and_rel(path)
    prefix = _share_prefix_for(path)
    results = []
    query_lower = query.lower()

    def search_recursive(dir_path: Path, depth: int = 0):
        if depth > 10 or len(results) >= max_results:
            return
        try:
            for entry in dir_path.iterdir():
                if len(results) >= max_results:
                    return
                if query_lower in entry.name.lower():
                    try:
                        stat = entry.stat()
                        results.append({
                            "name": entry.name,
                            "path": prefix + str(entry.relative_to(root)),
                            "is_dir": entry.is_dir(),
                            "size": stat.st_size if entry.is_file() else None,
                            "modified": stat.st_mtime,
                        })
                    except PermissionError:
                        pass
                if entry.is_dir() and not entry.name.startswith('.'):
                    search_recursive(entry, depth + 1)
        except PermissionError:
            pass

    search_recursive(target)
    return {"query": query, "path": path, "results": results}


# --- File Operations ---

class FileOpRequest(BaseModel):
    source: str
    destination: str


class RenameRequest(BaseModel):
    path: str
    new_name: str


class MkdirRequest(BaseModel):
    path: str
    name: str


class DeleteRequest(BaseModel):
    paths: list[str]


@router.post("/copy")
async def copy_files(req: FileOpRequest):
    src = _safe_path(req.source)
    dst = _safe_path(req.destination)
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source not found")
    if not dst.is_dir():
        raise HTTPException(status_code=400, detail="Destination must be a directory")

    target = dst / src.name
    # Handle name collision
    if target.exists():
        stem = src.stem
        suffix = src.suffix
        counter = 1
        while target.exists():
            target = dst / f"{stem} ({counter}){suffix}"
            counter += 1

    try:
        if src.is_dir():
            shutil.copytree(str(src), str(target))
        else:
            shutil.copy2(str(src), str(target))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    dst_prefix = _share_prefix_for(req.destination)
    dst_root, _ = _resolve_root_and_rel(req.destination)
    return {"status": "ok", "destination": dst_prefix + str(target.relative_to(dst_root))}


@router.post("/move")
async def move_files(req: FileOpRequest):
    src = _safe_path(req.source)
    dst = _safe_path(req.destination)
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source not found")
    if not dst.is_dir():
        raise HTTPException(status_code=400, detail="Destination must be a directory")

    target = dst / src.name
    try:
        shutil.move(str(src), str(target))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    dst_prefix = _share_prefix_for(req.destination)
    dst_root, _ = _resolve_root_and_rel(req.destination)
    return {"status": "ok", "destination": dst_prefix + str(target.relative_to(dst_root))}


@router.post("/rename")
async def rename_file(req: RenameRequest):
    src = _safe_path(req.path)
    if not src.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if '/' in req.new_name or '\\' in req.new_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    target = src.parent / req.new_name
    if target.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists")

    try:
        src.rename(target)
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    prefix = _share_prefix_for(req.path)
    root, _ = _resolve_root_and_rel(req.path)
    return {"status": "ok", "new_path": prefix + str(target.relative_to(root))}


@router.post("/mkdir")
async def make_directory(req: MkdirRequest):
    parent = _safe_path(req.path)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="Parent must be a directory")
    if '/' in req.name or '\\' in req.name:
        raise HTTPException(status_code=400, detail="Invalid folder name")

    target = parent / req.name
    if target.exists():
        raise HTTPException(status_code=409, detail="Already exists")

    try:
        target.mkdir()
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    prefix = _share_prefix_for(req.path)
    root, _ = _resolve_root_and_rel(req.path)
    return {"status": "ok", "path": prefix + str(target.relative_to(root))}


@router.post("/delete")
async def delete_files(req: DeleteRequest):
    deleted = []
    errors = []
    for p in req.paths:
        target = _safe_path(p)
        if not target.exists():
            errors.append({"path": p, "error": "Not found"})
            continue
        try:
            if target.is_dir():
                shutil.rmtree(str(target))
            else:
                target.unlink()
            deleted.append(p)
        except PermissionError:
            errors.append({"path": p, "error": "Permission denied"})

    return {"deleted": deleted, "errors": errors}


# --- Upload / Download ---

@router.post("/upload")
async def upload_file(
    path: str = Query("", description="Directory to upload into"),
    file: UploadFile = File(...),
):
    target_dir = _safe_path(path)
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="Target must be a directory")

    filename = file.filename or "upload"
    # Sanitize filename
    filename = filename.replace('/', '_').replace('\\', '_')
    target = target_dir / filename

    try:
        async with aiofiles.open(str(target), "wb") as f:
            while chunk := await file.read(1024 * 64):
                await f.write(chunk)
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    prefix = _share_prefix_for(path)
    root, _ = _resolve_root_and_rel(path)
    stat = target.stat()
    return {
        "status": "ok",
        "name": filename,
        "path": prefix + str(target.relative_to(root)),
        "size": stat.st_size,
    }


@router.get("/download")
async def download_file(path: str = Query(..., description="File to download")):
    target = _safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not target.is_file():
        raise HTTPException(status_code=400, detail="Cannot download a directory")

    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream",
    )


# --- Stream (for media playback with range support) ---

@router.get("/stream")
async def stream_file(
    request: Request,
    path: str = Query(..., description="File to stream"),
):
    """Serve a file with correct MIME type and HTTP range request support."""
    target = _safe_path(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    file_size = target.stat().st_size
    content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"

    range_header = request.headers.get("range")
    if range_header:
        range_spec = range_header.strip().lower().replace("bytes=", "")
        parts = range_spec.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        async def ranged_chunks():
            async with aiofiles.open(str(target), "rb") as f:
                await f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk_size = min(65536, remaining)
                    data = await f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            ranged_chunks(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
            },
        )

    return FileResponse(
        path=str(target),
        media_type=content_type,
        headers={"Accept-Ranges": "bytes"},
    )


# --- Transcode (for non-browser-native video formats) ---

async def _ffprobe_codecs(file_path: str) -> tuple[str, str]:
    """Return (video_codec, audio_codec) for a file using ffprobe."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", file_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        data = json.loads(stdout)
        v_codec = ""
        a_codec = ""
        for s in data.get("streams", []):
            if s.get("codec_type") == "video" and not v_codec:
                v_codec = s.get("codec_name", "")
            elif s.get("codec_type") == "audio" and not a_codec:
                a_codec = s.get("codec_name", "")
        return v_codec, a_codec
    except Exception as e:
        _log.warning("ffprobe failed for %s: %s", file_path, e)
        return "", ""


@router.get("/transcode")
async def transcode_file(
    path: str = Query(..., description="Video file to transcode"),
):
    """Transcode a video file to fragmented MP4 for browser playback.

    Uses ``-c copy`` when the source already uses H.264/AAC (instant remux),
    otherwise re-encodes with libx264 ultrafast.
    """
    target = _safe_path(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    v_codec, a_codec = await _ffprobe_codecs(str(target))

    # H.264 streams can be remuxed directly into MP4
    v_args = ["-c:v", "copy"] if v_codec in ("h264", "h265", "hevc") else [
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
    ]
    # AAC audio can be copied; everything else gets transcoded
    a_args = ["-c:a", "copy"] if a_codec == "aac" else ["-c:a", "aac", "-b:a", "192k"]

    cmd = [
        "ffmpeg", "-i", str(target),
        *v_args, *a_args,
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4",
        "-loglevel", "error",
        "pipe:1",
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="FFmpeg is not installed on this system",
        )

    async def _stream():
        assert proc.stdout is not None
        try:
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            if proc.returncode is None:
                proc.kill()
            await proc.wait()

    return StreamingResponse(
        _stream(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'inline; filename="{target.stem}.mp4"',
            "Cache-Control": "no-cache",
        },
    )


# --- Thumbnail (for gallery view) ---

@router.get("/thumbnail")
async def get_thumbnail(path: str = Query(..., description="Image file path")):
    """Serve image file directly for thumbnails. Falls back to download."""
    target = _safe_path(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    ext = target.suffix.lower()
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'}
    video_exts = {'.mp4', '.webm', '.mov', '.avi', '.mkv'}
    if ext in image_exts:
        media_map = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
            '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        }
        return FileResponse(path=str(target), media_type=media_map.get(ext, 'application/octet-stream'))
    if ext in video_exts:
        return FileResponse(path=str(target), media_type='video/mp4')
    raise HTTPException(status_code=400, detail="Not a supported media file")


# --- Preview ---

@router.get("/preview")
async def preview_file(path: str = Query(..., description="File to preview")):
    """Return file content for preview (text files, limited size)."""
    target = _safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not target.is_file():
        raise HTTPException(status_code=400, detail="Not a file")

    size = target.stat().st_size
    ext = target.suffix.lower()

    # Image files — return metadata only; frontend loads via /download
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'}
    if ext in image_exts:
        return {
            "type": "image",
            "name": target.name,
            "size": size,
            "url": f"/api/files/download?path={path}",
        }

    # Video files
    video_exts = {'.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv'}
    if ext in video_exts:
        return {
            "type": "video",
            "name": target.name,
            "size": size,
            "url": f"/api/files/download?path={path}",
        }

    # Audio files
    audio_exts = {'.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'}
    if ext in audio_exts:
        return {
            "type": "audio",
            "name": target.name,
            "size": size,
            "url": f"/api/files/download?path={path}",
        }

    # PDF files
    if ext == '.pdf':
        return {
            "type": "pdf",
            "name": target.name,
            "size": size,
            "url": f"/api/files/download?path={path}",
        }

    # Text files — return content (max 100KB)
    text_exts = {
        '.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml',
        '.toml', '.cfg', '.conf', '.ini', '.sh', '.bash', '.zsh', '.css', '.html',
        '.xml', '.csv', '.log', '.env', '.gitignore', '.dockerfile', '.sql',
        '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.rb', '.php',
    }
    if ext in text_exts or size < 50_000:
        try:
            async with aiofiles.open(str(target), "r", errors="replace") as f:
                content = await f.read(100_000)
            return {
                "type": "text",
                "name": target.name,
                "size": size,
                "content": content,
                "truncated": size > 100_000,
            }
        except Exception:
            pass

    return {
        "type": "binary",
        "name": target.name,
        "size": size,
    }
