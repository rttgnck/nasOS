import platform
import time

import psutil
from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api/system", tags=["system"])

_start_time = time.time()


@router.get("/health")
async def health():
    return {"status": "ok", "version": settings.version}


@router.get("/info")
async def system_info():
    cpu_temp = _get_cpu_temp()
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
