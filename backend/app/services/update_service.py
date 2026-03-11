"""
nasOS OTA Update Service
Handles validation, staging, and progress tracking for OTA updates.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

_is_linux = platform.system() == "Linux"

# Paths
_NASOS_DIR = Path("/opt/nasos")
_STAGING_DIR = _NASOS_DIR / "data" / "update-staging"
_PROGRESS_FILE = _STAGING_DIR / "progress.json"
_PENDING_FILE = _STAGING_DIR / "pending.nasos"
_ROLLBACK_MANIFEST = _STAGING_DIR / "rollback" / "rollback-manifest.json"
_APPLY_SCRIPT = _NASOS_DIR / "scripts" / "apply-update.sh"


# ── Version helpers ───────────────────────────────────────────────────────────

def _current_version() -> str:
    from app.core.config import settings
    return settings.version


def _read_manifest(path: Path) -> dict[str, Any]:
    """Read and return manifest.json from a .nasos package."""
    with tarfile.open(path, "r:gz") as tf:
        member = next(
            (m for m in tf.getmembers() if m.name.lstrip("./") == "manifest.json"),
            None,
        )
        if member is None:
            raise ValueError("Invalid package: missing manifest.json")
        f = tf.extractfile(member)
        if f is None:
            raise ValueError("Could not read manifest.json")
        return json.loads(f.read())


# ── Status ────────────────────────────────────────────────────────────────────

def get_update_status() -> dict[str, Any]:
    """Return current status: installed version, staged package info, apply progress."""
    current = _current_version()

    staged: dict[str, Any] | None = None
    if _PENDING_FILE.exists():
        try:
            manifest = _read_manifest(_PENDING_FILE)
            size = _PENDING_FILE.stat().st_size
            staged = {
                "version": manifest.get("version"),
                "built_at": manifest.get("built_at"),
                "components": manifest.get("components", []),
                "size_bytes": size,
                "filename": _PENDING_FILE.name,
            }
        except Exception:
            staged = None

    progress: dict[str, Any] | None = None
    if _PROGRESS_FILE.exists():
        try:
            progress = json.loads(_PROGRESS_FILE.read_text())
        except Exception:
            progress = None

    rollback: dict[str, Any] | None = None
    if _ROLLBACK_MANIFEST.exists():
        try:
            rollback = json.loads(_ROLLBACK_MANIFEST.read_text())
        except Exception:
            rollback = None

    return {
        "current_version": current,
        "staged": staged,
        "progress": progress,
        "rollback": rollback,
    }


# ── Dev-mode mock ─────────────────────────────────────────────────────────────

def get_update_status_mock() -> dict[str, Any]:
    return {
        "current_version": "0.1.0",
        "staged": None,
        "progress": None,
        "rollback": {"version": "0.0.9", "backed_up_at": "2026-03-10T12:00:00"},
    }


# ── Upload / stage ────────────────────────────────────────────────────────────

def stage_update(data: bytes, filename: str) -> dict[str, Any]:
    """Validate and save an uploaded .nasos package. Returns manifest info."""
    if not filename.endswith(".nasos"):
        raise ValueError("File must have .nasos extension")

    # Write to temp file for validation before committing
    with tempfile.NamedTemporaryFile(suffix=".nasos", delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)

    try:
        manifest = _read_manifest(tmp_path)
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        raise ValueError(f"Invalid package: {exc}") from exc

    # Commit — replace any existing pending package
    _STAGING_DIR.mkdir(parents=True, exist_ok=True)
    shutil.move(str(tmp_path), str(_PENDING_FILE))

    # Clear any previous progress/apply log so the UI starts fresh
    _PROGRESS_FILE.unlink(missing_ok=True)

    size = _PENDING_FILE.stat().st_size
    return {
        "version": manifest.get("version"),
        "built_at": manifest.get("built_at"),
        "components": manifest.get("components", []),
        "size_bytes": size,
    }


# ── Apply ─────────────────────────────────────────────────────────────────────

def apply_update() -> dict[str, str]:
    """
    Spawn apply-update.sh as a detached process.
    The script runs independently so it survives the backend restart it triggers.
    """
    if not _PENDING_FILE.exists():
        raise FileNotFoundError("No staged update package found")

    if not _APPLY_SCRIPT.exists():
        raise FileNotFoundError(f"Apply script not found: {_APPLY_SCRIPT}")

    # Clear stale progress from a previous run
    _PROGRESS_FILE.unlink(missing_ok=True)

    # Spawn detached: nohup + setsid so the child is in its own session and is
    # NOT killed when the backend process group receives SIGTERM on restart.
    subprocess.Popen(
        ["sudo", str(_APPLY_SCRIPT), str(_PENDING_FILE)],
        stdout=open(_STAGING_DIR / "apply.log", "a"),
        stderr=subprocess.STDOUT,
        close_fds=True,
        start_new_session=True,  # setsid equivalent — detaches from parent
    )

    return {"status": "applying", "message": "Update apply started"}


# ── Cancel staged update ──────────────────────────────────────────────────────

def cancel_staged() -> dict[str, str]:
    """Remove the staged package without applying."""
    if not _PENDING_FILE.exists():
        raise FileNotFoundError("No staged update to cancel")
    _PENDING_FILE.unlink()
    _PROGRESS_FILE.unlink(missing_ok=True)
    return {"status": "cancelled"}


# ── Rollback ──────────────────────────────────────────────────────────────────

def rollback_update() -> dict[str, str]:
    """Restore the previous installation from the rollback snapshot."""
    rollback_dir = _STAGING_DIR / "rollback"
    if not _ROLLBACK_MANIFEST.exists():
        raise FileNotFoundError("No rollback snapshot available")

    manifest = json.loads(_ROLLBACK_MANIFEST.read_text())

    for component in ["frontend", "backend", "electron", "scripts"]:
        src = rollback_dir / component
        if not src.exists():
            continue
        dst_map = {
            "frontend": _NASOS_DIR / "frontend" / "dist",
            "backend": _NASOS_DIR / "backend",
            "electron": _NASOS_DIR / "electron",
            "scripts": _NASOS_DIR / "scripts",
        }
        dst = dst_map[component]
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(src, dst)

    # Restart backend via systemd
    if _is_linux:
        subprocess.Popen(
            ["sudo", "systemctl", "restart", "nasos-backend"],
            start_new_session=True,
        )

    return {
        "status": "rolled_back",
        "version": manifest.get("version", "unknown"),
    }
