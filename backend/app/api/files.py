import os
import shutil
from pathlib import Path

import aiofiles
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/files", tags=["files"])

# Default browsable root — will be configurable
BROWSE_ROOT = Path(os.environ.get("NASOS_BROWSE_ROOT", Path.home()))


def _safe_path(relative: str) -> Path:
    """Resolve a relative path and ensure it stays within BROWSE_ROOT."""
    resolved = (BROWSE_ROOT / relative).resolve()
    if not str(resolved).startswith(str(BROWSE_ROOT.resolve())):
        raise HTTPException(status_code=403, detail="Path traversal denied")
    return resolved


# --- List ---

@router.get("/list")
async def list_files(path: str = Query("", description="Relative path from browse root")):
    target = _safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    entries = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            try:
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "path": str(entry.relative_to(BROWSE_ROOT)),
                    "is_dir": entry.is_dir(),
                    "size": stat.st_size if entry.is_file() else None,
                    "modified": stat.st_mtime,
                    "permissions": oct(stat.st_mode)[-3:],
                })
            except PermissionError:
                entries.append({
                    "name": entry.name,
                    "path": str(entry.relative_to(BROWSE_ROOT)),
                    "is_dir": entry.is_dir(),
                    "size": None,
                    "modified": None,
                    "permissions": "---",
                })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {
        "path": path or "/",
        "parent": str(Path(path).parent) if path else None,
        "entries": entries,
    }


# --- Tree (for sidebar) ---

@router.get("/tree")
async def directory_tree(path: str = Query("", description="Relative path"), depth: int = Query(1, ge=1, le=5)):
    """Return directory tree for sidebar navigation."""
    target = _safe_path(path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found")

    def build_tree(dir_path: Path, current_depth: int) -> list:
        if current_depth <= 0:
            return []
        result = []
        try:
            for entry in sorted(dir_path.iterdir(), key=lambda e: e.name.lower()):
                if entry.is_dir() and not entry.name.startswith('.'):
                    result.append({
                        "name": entry.name,
                        "path": str(entry.relative_to(BROWSE_ROOT)),
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
                            "path": str(entry.relative_to(BROWSE_ROOT)),
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

    return {"status": "ok", "destination": str(target.relative_to(BROWSE_ROOT))}


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

    return {"status": "ok", "destination": str(target.relative_to(BROWSE_ROOT))}


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

    return {"status": "ok", "new_path": str(target.relative_to(BROWSE_ROOT))}


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

    return {"status": "ok", "path": str(target.relative_to(BROWSE_ROOT))}


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

    stat = target.stat()
    return {
        "status": "ok",
        "name": filename,
        "path": str(target.relative_to(BROWSE_ROOT)),
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
