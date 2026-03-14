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

_MAX_UPLOAD_MB = 512
_MAX_UPLOAD_BYTES = _MAX_UPLOAD_MB * 1024 * 1024


# ── Version helpers ───────────────────────────────────────────────────────────

def _current_version() -> str:
    from app.core.config import settings
    return settings.version


def get_free_mb() -> int:
    """Return free megabytes on the filesystem that hosts the nasOS installation."""
    try:
        stat = shutil.disk_usage(str(_NASOS_DIR))
        return int(stat.free / (1024 * 1024))
    except Exception:
        return -1  # unknown


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
            # If the progress file says "rebooting" but we are actively serving
            # this request, the device has clearly finished rebooting already.
            # Normalise to "complete" so the frontend exits the rebooting banner
            # and shows the success state instead of looping forever.
            if progress.get("status") == "rebooting":
                progress["status"] = "complete"
                progress["message"] = "Update applied — system restarted successfully"
                try:
                    _PROGRESS_FILE.write_text(json.dumps(progress))
                except Exception:
                    pass
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
        "disk_free_mb": get_free_mb(),
    }


# ── Dev-mode mock ─────────────────────────────────────────────────────────────

def get_update_status_mock() -> dict[str, Any]:
    return {
        "current_version": "031426-0045",
        "staged": None,
        "progress": None,
        "rollback": {"version": "0.1.0", "backed_up_at": "2026-03-10T12:00:00"},
        "disk_free_mb": 2048,
    }


# ── Upload / stage ────────────────────────────────────────────────────────────

async def stage_update_stream(file: Any, filename: str) -> dict[str, Any]:
    """Stream an uploaded .nasos package directly into the staging directory.

    Writes chunks to a temp file inside the staging directory so that the
    final atomic rename() is an O(1) metadata operation on the same
    filesystem — no cross-device copy and no risk of filling /tmp (which is
    a tmpfs when the backend runs with PrivateTmp=true in its systemd unit).
    """
    import aiofiles

    if not filename.endswith(".nasos"):
        raise ValueError("File must have .nasos extension")

    _STAGING_DIR.mkdir(parents=True, exist_ok=True)

    # Use a pid-scoped name so concurrent (or interrupted) uploads don't collide
    tmp_path = _STAGING_DIR / f"upload-{os.getpid()}.tmp"
    tmp_path.unlink(missing_ok=True)

    try:
        total = 0
        async with aiofiles.open(str(tmp_path), "wb") as f:
            while True:
                chunk = await file.read(65536)  # 64 KB chunks
                if not chunk:
                    break
                await f.write(chunk)
                total += len(chunk)
                if total > _MAX_UPLOAD_BYTES:
                    raise ValueError(
                        f"Package exceeds maximum allowed size ({_MAX_UPLOAD_MB} MB)"
                    )

        # Validate the fully-written file before committing it
        try:
            manifest = _read_manifest(tmp_path)
        except Exception as exc:
            raise ValueError(f"Invalid package: {exc}") from exc

        # Atomic rename — guaranteed same filesystem since tmp is in _STAGING_DIR
        _PENDING_FILE.unlink(missing_ok=True)
        tmp_path.rename(_PENDING_FILE)

        # Clear any previous progress/apply log so the UI starts fresh
        _PROGRESS_FILE.unlink(missing_ok=True)

        size = _PENDING_FILE.stat().st_size
        return {
            "version": manifest.get("version"),
            "built_at": manifest.get("built_at"),
            "components": manifest.get("components", []),
            "size_bytes": size,
        }
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def stage_update(data: bytes, filename: str) -> dict[str, Any]:
    """Validate and save an uploaded .nasos package from an already-read bytes buffer.

    Kept for backward compatibility.  New callers should prefer
    stage_update_stream() which avoids reading the entire package into RAM.
    """
    if not filename.endswith(".nasos"):
        raise ValueError("File must have .nasos extension")

    _STAGING_DIR.mkdir(parents=True, exist_ok=True)

    # Write to a temp file inside the STAGING dir (same filesystem as PENDING_FILE).
    # This avoids tmpfs limitations when the backend runs with PrivateTmp=true and
    # makes the final shutil.move() a rename (O(1)) instead of a copy+delete.
    tmp_path = _STAGING_DIR / f"upload-{os.getpid()}.tmp"
    tmp_path.unlink(missing_ok=True)

    try:
        tmp_path.write_bytes(data)

        try:
            manifest = _read_manifest(tmp_path)
        except Exception as exc:
            raise ValueError(f"Invalid package: {exc}") from exc

        # Atomic rename — same filesystem guarantees this never copies bytes
        _PENDING_FILE.unlink(missing_ok=True)
        tmp_path.rename(_PENDING_FILE)

        # Clear any previous progress/apply log so the UI starts fresh
        _PROGRESS_FILE.unlink(missing_ok=True)

        size = _PENDING_FILE.stat().st_size
        return {
            "version": manifest.get("version"),
            "built_at": manifest.get("built_at"),
            "components": manifest.get("components", []),
            "size_bytes": size,
        }
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


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

    # Prefer systemd-run so the apply script runs in its OWN transient cgroup
    # (nasos-apply-update.service), isolated from nasos-backend.service.
    # Without this, `systemctl restart nasos-backend` inside the script would
    # kill the script itself because systemd sends SIGTERM to the whole cgroup.
    #
    # Fallback to direct sudo for devices whose sudoers predates the
    # systemd-run rule (the apply script contains a SIGTERM trap + a sudoers
    # self-repair step so the next OTA will automatically use the isolated path).
    _systemd_run = "/usr/bin/systemd-run"
    _use_systemd_run = False
    try:
        # Check if the sudoers rule for systemd-run OTA launch exists.
        # `sudo -l -n` lists allowed commands non-interactively (no password
        # prompt) — we look for 'nasos-apply-update' which appears only in the
        # specific systemd-run rule added by first-boot or the scripts OTA step.
        probe = subprocess.run(
            ["sudo", "-l", "-n"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        _use_systemd_run = (
            probe.returncode == 0
            and "nasos-apply-update" in probe.stdout
            and os.path.exists(_systemd_run)
        )
    except Exception:
        pass

    if _use_systemd_run:
        cmd = [
            "sudo", _systemd_run,
            "--unit=nasos-apply-update",
            "--description=nasOS OTA apply",
            "--collect",
            str(_APPLY_SCRIPT), str(_PENDING_FILE),
        ]
    else:
        # Old device — apply script handles self-preservation via SIGTERM trap
        cmd = ["sudo", str(_APPLY_SCRIPT), str(_PENDING_FILE)]

    subprocess.Popen(
        cmd,
        stdout=open(_STAGING_DIR / "apply.log", "a"),
        stderr=subprocess.STDOUT,
        close_fds=True,
        start_new_session=True,
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


def clear_rollback_snapshot() -> dict[str, Any]:
    """Delete the rollback snapshot directory to reclaim disk space.

    After a successful OTA this can free 20-200 MB on the root partition.
    The main risk case where you'd NEED a rollback (broken backend) usually
    also means you can't serve this endpoint anyway, so the trade-off is
    acceptable — and the user still has the option to reflash.
    """
    rollback_dir = _STAGING_DIR / "rollback"
    freed_mb = 0
    if rollback_dir.exists():
        try:
            stat = shutil.disk_usage(str(_STAGING_DIR))
            shutil.rmtree(rollback_dir)
            stat_after = shutil.disk_usage(str(_STAGING_DIR))
            freed_mb = int((stat_after.free - stat.free) / (1024 * 1024))
        except Exception as exc:
            raise RuntimeError(f"Failed to remove rollback snapshot: {exc}") from exc
    # Also clean up any old temp upload files that might have been left behind
    for leftover in _STAGING_DIR.glob("upload-*.tmp"):
        leftover.unlink(missing_ok=True)
    return {
        "status": "cleared",
        "freed_mb": freed_mb,
        "disk_free_mb": get_free_mb(),
    }


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

        if component == "electron":
            # The rollback snapshot excludes node_modules (~200 MB) to prevent
            # disk exhaustion on the 3 GB root partition.  Reuse the current
            # node_modules if package.json hasn't changed; otherwise we'll need
            # npm install after the rollback.
            current_nm = dst / "node_modules"
            _preserve_nm = False
            if current_nm.is_dir() and (src / "package.json").exists() and (dst / "package.json").exists():
                import hashlib
                old_hash = hashlib.md5((src / "package.json").read_bytes()).hexdigest()
                cur_hash = hashlib.md5((dst / "package.json").read_bytes()).hexdigest()
                _preserve_nm = old_hash == cur_hash

            tmp_dst = dst.parent / f".rollback-{component}"
            if tmp_dst.exists():
                shutil.rmtree(tmp_dst, ignore_errors=True)
            shutil.copytree(src, tmp_dst)

            if _preserve_nm:
                # Move current node_modules into the rollback copy (space-neutral mv)
                shutil.move(str(current_nm), str(tmp_dst / "node_modules"))

            shutil.rmtree(dst, ignore_errors=True)
            tmp_dst.rename(dst)

            if not _preserve_nm and _is_linux:
                # node_modules missing — attempt npm install repair
                subprocess.run(
                    ["npm", "install", "--omit=dev", "--prefer-offline"],
                    cwd=str(dst),
                    capture_output=True,
                    timeout=120,
                )
        else:
            # Copy to a temp location first, then atomic rename.
            tmp_dst = dst.parent / f".rollback-{component}"
            if tmp_dst.exists():
                shutil.rmtree(tmp_dst, ignore_errors=True)
            shutil.copytree(src, tmp_dst)
            shutil.rmtree(dst, ignore_errors=True)
            tmp_dst.rename(dst)

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
