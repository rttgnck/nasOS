import logging
import platform
import subprocess
import time

import psutil
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.security import get_current_user

_log = logging.getLogger(__name__)

# Public router — health check only (no auth)
health_router = APIRouter(prefix="/api/system", tags=["system"])

# Protected router — everything else requires JWT
router = APIRouter(prefix="/api/system", tags=["system"])

_start_time = time.time()


@health_router.get("/health")
async def health():
    return {"status": "ok", "version": settings.version}


@router.get("/info")
async def system_info():
    return {
        "hostname": platform.node(),
        "platform": platform.machine(),
        "os": platform.system(),
        "version": settings.version,
        "uptime_seconds": int(time.time() - _start_time),
    }


@router.get("/metrics")
async def system_metrics():
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    cpu_freq = psutil.cpu_freq()

    return {
        "cpu": {
            "percent": psutil.cpu_percent(interval=0),
            "count": psutil.cpu_count(),
            "freq_mhz": cpu_freq.current if cpu_freq else None,
        },
        "memory": {
            "total_bytes": mem.total,
            "used_bytes": mem.used,
            "percent": mem.percent,
        },
        "disk": {
            "total_bytes": disk.total,
            "used_bytes": disk.used,
            "percent": disk.percent,
        },
        "temperature": _get_cpu_temp(),
        "network": _get_network_stats(),
    }


@router.post("/restart")
async def system_restart():
    """Restart the system."""
    if settings.dev_mode:
        return {"status": "ok", "message": "Restart simulated in dev mode"}
    try:
        subprocess.Popen(
            ["/usr/bin/sudo", "/usr/bin/systemctl", "reboot"],
            close_fds=True,
            start_new_session=True,
        )
        return {"status": "ok", "message": "System is restarting"}
    except Exception as e:
        _log.exception("Failed to restart system")
        raise HTTPException(status_code=500, detail="Failed to restart system")


@router.post("/shutdown")
async def system_shutdown():
    """Shut down the system."""
    if settings.dev_mode:
        return {"status": "ok", "message": "Shutdown simulated in dev mode"}
    try:
        subprocess.Popen(
            ["/usr/bin/sudo", "/usr/bin/systemctl", "poweroff"],
            close_fds=True,
            start_new_session=True,
        )
        return {"status": "ok", "message": "System is shutting down"}
    except Exception as e:
        _log.exception("Failed to shut down system")
        raise HTTPException(status_code=500, detail="Failed to shut down system")


def _get_cpu_temp() -> float | None:
    """Read CPU temperature. Works on Pi, returns None on other platforms."""
    if not settings.dev_mode:
        try:
            with open("/sys/class/thermal/thermal_zone0/temp") as f:
                return int(f.read().strip()) / 1000.0
        except (FileNotFoundError, ValueError):
            pass

    if hasattr(psutil, "sensors_temperatures"):
        temps = psutil.sensors_temperatures()
        if temps:
            for name in ("cpu_thermal", "coretemp", "cpu-thermal"):
                if name in temps and temps[name]:
                    return temps[name][0].current
    return None


def _get_network_stats() -> dict:
    counters = psutil.net_io_counters()
    return {
        "bytes_sent": counters.bytes_sent,
        "bytes_recv": counters.bytes_recv,
    }
