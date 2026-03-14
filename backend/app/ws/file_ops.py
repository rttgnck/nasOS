"""WebSocket endpoint for real-time file operation progress."""
import asyncio
import json

from fastapi import WebSocket, WebSocketDisconnect

from app.services.file_ops import subscribe_user, unsubscribe_user, get_operations


async def file_ops_ws(websocket: WebSocket):
    """
    Stream file-operation progress to the connected client.
    Auth token is passed as query param: /ws/file-ops?token=<jwt>

    On connect, sends all active operations, then streams updates.
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

    queue = subscribe_user(username)
    try:
        # Send current operations snapshot
        ops = await get_operations(username)
        active = [o for o in ops if o["status"] in ("pending", "running", "conflict")]
        await websocket.send_text(json.dumps({
            "type": "file_ops_snapshot",
            "operations": active,
        }))

        # Stream real-time updates
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30)
                await websocket.send_text(msg)
            except asyncio.TimeoutError:
                # Send keepalive ping
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        unsubscribe_user(username, queue)
