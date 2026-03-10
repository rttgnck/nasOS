"""Log service — wraps journalctl for system log access."""

import json
import platform
import subprocess
from datetime import datetime, timedelta
import random

_is_linux = platform.system() == "Linux"

# Realistic mock log entries for dev
_MOCK_UNITS = ["nasos-backend", "smbd", "sshd", "docker", "kernel", "systemd", "avahi-daemon", "fail2ban"]
_MOCK_MESSAGES = {
    "nasos-backend": [
        "Started nasOS backend service",
        "Listening on 0.0.0.0:8080",
        "WebSocket client connected from 192.168.1.42",
        "WebSocket client disconnected",
        "GET /api/system/metrics 200 OK (3ms)",
        "GET /api/files/list 200 OK (12ms)",
        "POST /api/shares 201 Created",
        "Database migration completed successfully",
    ],
    "smbd": [
        "smbd version 4.18.6 started",
        "connect to service Media from 192.168.1.42 (MacBook-Air) as user admin",
        "connect to service Backups from 192.168.1.55 (iMac)",
        "closed connection to service Media",
        "tdb_transaction_cancel: transaction cancelled",
    ],
    "sshd": [
        "Accepted publickey for admin from 192.168.1.42 port 52341 ssh2",
        "pam_unix(sshd:session): session opened for user admin",
        "pam_unix(sshd:session): session closed for user admin",
        "Connection closed by 192.168.1.100 port 45123 [preauth]",
        "Invalid user root from 103.45.67.89 port 22345",
        "Failed password for invalid user root from 103.45.67.89 port 22345 ssh2",
    ],
    "docker": [
        "Starting containers...",
        "Container jellyfin started successfully",
        "Container nextcloud health check passed",
        "Pulling image pihole/pihole:latest",
        "Container transmission stopped by user request",
        "Network bridge0 created",
    ],
    "kernel": [
        "USB device connected: /dev/sdb (WD Elements)",
        "EXT4-fs (sdb1): mounted filesystem with ordered data mode",
        "usb 1-1.2: USB disconnect, device number 5",
        "temperature above threshold, cpu clock throttled",
        "sd 0:0:0:0: [sda] Spinning up disk...",
    ],
    "systemd": [
        "Started Network Manager",
        "Started Avahi mDNS/DNS-SD Stack",
        "Starting Docker Application Container Engine...",
        "Started fail2ban.service - Fail2Ban Service",
        "Reached target Multi-User System",
        "System time updated: NTP sync",
    ],
    "avahi-daemon": [
        "Server startup complete. Host name is nasos.local",
        "Registering new address 192.168.1.100 on eth0",
        "Service 'nasOS SMB' (_smb._tcp) successfully established",
        "Service 'nasOS Web UI' (_http._tcp) successfully established",
    ],
    "fail2ban": [
        "Started Fail2Ban Service",
        "Jail 'sshd' started",
        "Jail 'nasos-web' started",
        "Ban 103.45.67.89 (sshd)",
        "Unban 103.45.67.89 (sshd) after 600s",
        "Found 103.45.67.89 in sshd (3 retries)",
    ],
}

_PRIORITY_LABELS = {0: "emerg", 1: "alert", 2: "crit", 3: "err", 4: "warning", 5: "notice", 6: "info", 7: "debug"}


def _generate_mock_logs(lines: int = 200, unit: str | None = None, priority: int | None = None, grep: str | None = None) -> list[dict]:
    """Generate realistic mock log entries."""
    now = datetime.now()
    entries = []

    units = [unit] if unit and unit in _MOCK_UNITS else _MOCK_UNITS

    for i in range(lines):
        u = random.choice(units)
        msg = random.choice(_MOCK_MESSAGES.get(u, ["Service running"]))

        # Assign realistic priorities
        if "error" in msg.lower() or "failed" in msg.lower() or "invalid" in msg.lower():
            pri = 3
        elif "warning" in msg.lower() or "throttled" in msg.lower() or "ban" in msg.lower().split():
            pri = 4
        elif "started" in msg.lower() or "connected" in msg.lower() or "success" in msg.lower():
            pri = 6
        else:
            pri = random.choice([5, 6, 6, 6, 7])

        if priority is not None and pri != priority:
            continue

        ts = now - timedelta(seconds=random.randint(0, 86400))

        entry = {
            "timestamp": ts.isoformat(),
            "unit": u,
            "priority": pri,
            "priority_label": _PRIORITY_LABELS.get(pri, "info"),
            "message": msg,
            "hostname": "nasos",
        }

        if grep and grep.lower() not in msg.lower():
            continue

        entries.append(entry)

    # Sort by timestamp descending (newest first)
    entries.sort(key=lambda e: e["timestamp"], reverse=True)
    return entries[:lines]


def get_logs(lines: int = 200, unit: str | None = None, priority: int | None = None, grep: str | None = None) -> list[dict]:
    """Get system logs. Uses journalctl on Linux, mock data on dev."""
    if not _is_linux:
        return _generate_mock_logs(lines, unit, priority, grep)

    # Real Linux: use journalctl JSON output
    cmd = ["journalctl", "--no-pager", "-o", "json", f"--lines={lines}"]
    if unit:
        cmd.extend(["-u", unit])
    if priority is not None:
        cmd.extend(["-p", str(priority)])
    if grep:
        cmd.extend(["-g", grep])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        entries = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            try:
                raw = json.loads(line)
                pri = int(raw.get("PRIORITY", 6))
                entries.append({
                    "timestamp": datetime.fromtimestamp(
                        int(raw.get("__REALTIME_TIMESTAMP", "0")) / 1_000_000
                    ).isoformat(),
                    "unit": raw.get("_SYSTEMD_UNIT", raw.get("SYSLOG_IDENTIFIER", "unknown")),
                    "priority": pri,
                    "priority_label": _PRIORITY_LABELS.get(pri, "info"),
                    "message": raw.get("MESSAGE", ""),
                    "hostname": raw.get("_HOSTNAME", "nasos"),
                })
            except (json.JSONDecodeError, ValueError):
                continue
        return entries
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return _generate_mock_logs(lines, unit, priority, grep)


def get_available_units() -> list[str]:
    """Get list of systemd units that have journal entries."""
    if not _is_linux:
        return _MOCK_UNITS

    try:
        result = subprocess.run(
            ["journalctl", "--no-pager", "-F", "_SYSTEMD_UNIT"],
            capture_output=True, text=True, timeout=5,
        )
        return [u.strip() for u in result.stdout.strip().split("\n") if u.strip()]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return _MOCK_UNITS
