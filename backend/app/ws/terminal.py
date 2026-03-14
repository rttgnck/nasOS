import asyncio
import fcntl
import json
import logging
import os
import pty
import signal
import struct
import termios
import threading

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.security import verify_ws_token

_log = logging.getLogger(__name__)


async def terminal_ws(websocket: WebSocket):
    """WebSocket endpoint that spawns a PTY shell session."""
    token = websocket.query_params.get("token")
    user = await verify_ws_token(token)
    if user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    master_fd, slave_fd = pty.openpty()
    shell = os.environ.get("SHELL", "/bin/bash")
    env = {
        **os.environ,
        "TERM": "xterm-256color",
        "COLORTERM": "truecolor",
    }

    pid = os.fork()
    if pid == 0:
        # ── Child process ──
        os.close(master_fd)
        os.setsid()
        fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        os.close(slave_fd)

        if not settings.dev_mode:
            try:
                import pwd
                pw = pwd.getpwuid(1000)
                os.setgid(pw.pw_gid)
                os.setuid(pw.pw_uid)
                env["HOME"] = pw.pw_dir
                env["USER"] = pw.pw_name
                env["LOGNAME"] = pw.pw_name
                os.chdir(pw.pw_dir)
            except (KeyError, OSError):
                pass

        os.execve(shell, [shell, "--login"], env)

    # ── Parent process ──
    os.close(slave_fd)
    loop = asyncio.get_event_loop()
    alive = True

    # Reader thread: blocking reads from PTY, pushes to an asyncio queue
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    def _reader_thread():
        try:
            while alive:
                try:
                    data = os.read(master_fd, 4096)
                except OSError:
                    break
                if not data:
                    break
                loop.call_soon_threadsafe(queue.put_nowait, data)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    reader = threading.Thread(target=_reader_thread, daemon=True)
    reader.start()

    # Sender coroutine: drains the queue and sends to WebSocket
    async def _send_output():
        try:
            while True:
                data = await queue.get()
                if data is None:
                    break
                await websocket.send_bytes(data)
        except (WebSocketDisconnect, Exception):
            pass

    sender_task = asyncio.create_task(_send_output())

    try:
        while True:
            msg = await websocket.receive()
            if "text" in msg:
                text = msg["text"]
                try:
                    parsed = json.loads(text)
                    if parsed.get("type") == "resize":
                        cols = parsed.get("cols", 80)
                        rows = parsed.get("rows", 24)
                        winsize = struct.pack("HHHH", rows, cols, 0, 0)
                        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                        try:
                            os.kill(pid, signal.SIGWINCH)
                        except OSError:
                            pass
                        continue
                except (json.JSONDecodeError, ValueError):
                    pass
                await loop.run_in_executor(
                    None, os.write, master_fd, text.encode()
                )
            elif "bytes" in msg:
                await loop.run_in_executor(
                    None, os.write, master_fd, msg["bytes"]
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        _log.exception("Terminal WS error")
    finally:
        alive = False
        sender_task.cancel()
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            os.kill(pid, signal.SIGHUP)
            os.waitpid(pid, os.WNOHANG)
        except (OSError, ChildProcessError):
            pass
        reader.join(timeout=2)
