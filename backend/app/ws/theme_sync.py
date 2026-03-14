"""WebSocket endpoint for real-time theme synchronisation across sessions."""
import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket, WebSocketDisconnect


_user_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)


def _subscribe(username: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _user_subscribers[username].add(q)
    return q


def _unsubscribe(username: str, q: asyncio.Queue):
    _user_subscribers[username].discard(q)
    if not _user_subscribers[username]:
        del _user_subscribers[username]


async def broadcast_theme_update(username: str, data: dict):
    """Push a theme_update message to every WebSocket session for this user."""
    msg = json.dumps({"type": "theme_update", **data})
    for q in list(_user_subscribers.get(username, [])):
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass


async def theme_sync_ws(websocket: WebSocket):
    """
    Per-user theme sync channel.
    Auth token is passed as query param: /ws/theme-sync?token=<jwt>
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    from app.core.security import decode_token
    username = decode_token(token)
    if not username:
        await websocket.close(code=4003, reason="Invalid token")
        return

    await websocket.accept()
    queue = _subscribe(username)
    try:
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30)
                await websocket.send_text(msg)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _unsubscribe(username, queue)
