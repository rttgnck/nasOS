import asyncio
import json

import psutil
from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings


async def metrics_ws(websocket: WebSocket):
    """Stream system metrics to the client every 2 seconds."""
    await websocket.accept()
    try:
        while True:
            mem = psutil.virtual_memory()
            cpu_freq = psutil.cpu_freq()

            data = {
                "type": "metrics",
                "cpu_percent": psutil.cpu_percent(interval=0),
                "memory_percent": mem.percent,
                "memory_used": mem.used,
                "memory_total": mem.total,
                "cpu_freq_mhz": cpu_freq.current if cpu_freq else None,
                "temperature": _get_cpu_temp(),
                "net": _get_net_rates(),
            }
            await websocket.send_text(json.dumps(data))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass


_prev_net = None
_prev_time = None


def _get_net_rates() -> dict:
    global _prev_net, _prev_time
    import time

    counters = psutil.net_io_counters()
    now = time.time()

    rates = {"bytes_sent_per_sec": 0, "bytes_recv_per_sec": 0}
    if _prev_net and _prev_time:
        dt = now - _prev_time
        if dt > 0:
            rates["bytes_sent_per_sec"] = int((counters.bytes_sent - _prev_net.bytes_sent) / dt)
            rates["bytes_recv_per_sec"] = int((counters.bytes_recv - _prev_net.bytes_recv) / dt)

    _prev_net = counters
    _prev_time = now
    return rates


def _get_cpu_temp() -> float | None:
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
