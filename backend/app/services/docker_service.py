"""Docker container management service.

On Linux: uses docker SDK or subprocess calls.
On macOS (dev): returns mock data.
"""

import platform

_is_linux = platform.system() == "Linux"

# ── Mock data for dev ──────────────────────────────────────────────

_MOCK_CONTAINERS = [
    {
        "id": "a1b2c3d4e5f6",
        "name": "jellyfin",
        "image": "jellyfin/jellyfin:latest",
        "status": "running",
        "state": "running",
        "ports": {"8096/tcp": 8096},
        "cpu_percent": 2.3,
        "memory_mb": 412,
        "uptime": "3 days ago",
    },
    {
        "id": "b2c3d4e5f6a1",
        "name": "nextcloud",
        "image": "nextcloud:28",
        "status": "running",
        "state": "running",
        "ports": {"80/tcp": 8443},
        "cpu_percent": 1.1,
        "memory_mb": 256,
        "uptime": "5 days ago",
    },
    {
        "id": "c3d4e5f6a1b2",
        "name": "pihole",
        "image": "pihole/pihole:latest",
        "status": "running",
        "state": "running",
        "ports": {"53/tcp": 53, "53/udp": 53, "80/tcp": 8080},
        "cpu_percent": 0.5,
        "memory_mb": 128,
        "uptime": "12 days ago",
    },
    {
        "id": "d4e5f6a1b2c3",
        "name": "transmission",
        "image": "linuxserver/transmission:latest",
        "status": "exited",
        "state": "exited",
        "ports": {"9091/tcp": 9091},
        "cpu_percent": 0,
        "memory_mb": 0,
        "uptime": "2 hours ago",
    },
    {
        "id": "e5f6a1b2c3d4",
        "name": "homeassistant",
        "image": "homeassistant/home-assistant:stable",
        "status": "running",
        "state": "running",
        "ports": {"8123/tcp": 8123},
        "cpu_percent": 3.8,
        "memory_mb": 520,
        "uptime": "1 day ago",
    },
]

# App Store catalog
APP_CATALOG = [
    {
        "id": "jellyfin",
        "name": "Jellyfin",
        "category": "Media",
        "description": "Free media system for streaming movies, TV, and music",
        "icon": "🎬",
        "image": "jellyfin/jellyfin:latest",
        "ports": {"8096/tcp": 8096},
        "volumes": ["/mnt/data/media:/media", "/opt/nasos/config/jellyfin:/config"],
    },
    {
        "id": "plex",
        "name": "Plex",
        "category": "Media",
        "description": "Organize and stream your media collection",
        "icon": "📺",
        "image": "plexinc/pms-docker:latest",
        "ports": {"32400/tcp": 32400},
        "volumes": ["/mnt/data/media:/data", "/opt/nasos/config/plex:/config"],
    },
    {
        "id": "nextcloud",
        "name": "Nextcloud",
        "category": "Cloud",
        "description": "Self-hosted productivity platform and file sync",
        "icon": "☁️",
        "image": "nextcloud:28",
        "ports": {"80/tcp": 8443},
        "volumes": ["/mnt/data/nextcloud:/var/www/html"],
    },
    {
        "id": "immich",
        "name": "Immich",
        "category": "Photos",
        "description": "High performance self-hosted photo and video backup",
        "icon": "📷",
        "image": "ghcr.io/immich-app/immich-server:release",
        "ports": {"2283/tcp": 2283},
        "volumes": ["/mnt/data/photos:/usr/src/app/upload"],
    },
    {
        "id": "pihole",
        "name": "Pi-hole",
        "category": "DNS",
        "description": "Network-wide ad blocking via DNS",
        "icon": "🛡️",
        "image": "pihole/pihole:latest",
        "ports": {"53/tcp": 53, "80/tcp": 8080},
        "volumes": ["/opt/nasos/config/pihole:/etc/pihole"],
    },
    {
        "id": "homeassistant",
        "name": "Home Assistant",
        "category": "Home",
        "description": "Open source home automation platform",
        "icon": "🏠",
        "image": "homeassistant/home-assistant:stable",
        "ports": {"8123/tcp": 8123},
        "volumes": ["/opt/nasos/config/homeassistant:/config"],
    },
    {
        "id": "transmission",
        "name": "Transmission",
        "category": "Download",
        "description": "Lightweight BitTorrent client",
        "icon": "⬇️",
        "image": "linuxserver/transmission:latest",
        "ports": {"9091/tcp": 9091},
        "volumes": ["/mnt/data/downloads:/downloads", "/opt/nasos/config/transmission:/config"],
    },
    {
        "id": "gitea",
        "name": "Gitea",
        "category": "Dev",
        "description": "Lightweight self-hosted Git service",
        "icon": "🐙",
        "image": "gitea/gitea:latest",
        "ports": {"3000/tcp": 3000, "22/tcp": 2222},
        "volumes": ["/opt/nasos/config/gitea:/data"],
    },
    {
        "id": "uptime-kuma",
        "name": "Uptime Kuma",
        "category": "Monitoring",
        "description": "Self-hosted monitoring tool like Uptime Robot",
        "icon": "📈",
        "image": "louislam/uptime-kuma:latest",
        "ports": {"3001/tcp": 3001},
        "volumes": ["/opt/nasos/config/uptime-kuma:/app/data"],
    },
    {
        "id": "vaultwarden",
        "name": "Vaultwarden",
        "category": "Security",
        "description": "Lightweight Bitwarden-compatible password manager",
        "icon": "🔐",
        "image": "vaultwarden/server:latest",
        "ports": {"80/tcp": 8888},
        "volumes": ["/opt/nasos/config/vaultwarden:/data"],
    },
]


def get_containers() -> list[dict]:
    if not _is_linux:
        return _MOCK_CONTAINERS

    try:
        import subprocess, json
        out = subprocess.check_output([
            "docker", "ps", "-a", "--format",
            '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}"}'
        ], text=True)
        containers = []
        for line in out.strip().splitlines():
            c = json.loads(line)
            containers.append(c)
        return containers
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []


def container_action(container_id: str, action: str) -> dict:
    """Start, stop, restart, or remove a container."""
    if not _is_linux:
        # Mock: toggle state
        for c in _MOCK_CONTAINERS:
            if c["id"] == container_id:
                if action == "start":
                    c["state"] = "running"
                    c["status"] = "running"
                elif action == "stop":
                    c["state"] = "exited"
                    c["status"] = "exited"
                elif action == "restart":
                    c["state"] = "running"
                    c["status"] = "running"
                return {"ok": True, "action": action, "container": container_id}
        return {"ok": False, "error": "Container not found"}

    try:
        import subprocess
        subprocess.check_call(["docker", action, container_id])
        return {"ok": True, "action": action, "container": container_id}
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": str(e)}


def get_container_logs(container_id: str, tail: int = 100) -> list[str]:
    """Get the last N log lines from a Docker container."""
    if not _is_linux:
        # Mock log output
        import random
        from datetime import datetime, timedelta

        container = next((c for c in _MOCK_CONTAINERS if c["id"] == container_id), None)
        name = container["name"] if container else "unknown"
        now = datetime.now()
        log_templates = {
            "jellyfin": [
                "[INF] Jellyfin version 10.9.4",
                "[INF] Starting Jellyfin Server",
                "[INF] Startup complete",
                "[INF] Device registered: iPhone-14",
                "[INF] User authenticated: admin",
                "[INF] Scanning media library: /media/movies",
                "[INF] Found 247 items in library",
                "[INF] Stream started: Movie.mkv (direct play)",
                "[INF] Transcoding: TV/Episode.mp4 (h264 -> h264, 1080p)",
                "[WRN] Slow media scan detected (>30s)",
            ],
            "nextcloud": [
                "Apache/2.4 (Debian) configured",
                "OC\\Setup: Configuration file created",
                "[notice] Nextcloud ready",
                "192.168.1.42 - admin [GET /index.php HTTP/1.1] 200",
                "192.168.1.42 - alice [PUT /remote.php/dav HTTP/1.1] 201",
                "OC\\Files: File uploaded: photo.jpg (4.2MB)",
                "OC\\Cron: Background job finished (23ms)",
                "OC\\Preview: Generated thumbnail for document.pdf",
            ],
            "pihole": [
                "FTL started!",
                "Blocking status is enabled",
                "Imported 124,302 domains for blocking",
                "query[A] google.com from 192.168.1.42 -> NODATA",
                "query[AAAA] ads.tracker.com from 192.168.1.10 -> BLOCKED (gravity)",
                "query[A] github.com from 192.168.1.42 -> forwarded to 1.1.1.1",
                "Gravity update: 124,502 domains on blocklist",
                "Rate limit: 192.168.1.100 exceeded 1000 queries/10min",
            ],
        }
        templates = log_templates.get(name, [
            f"[INFO] {name} started",
            f"[INFO] {name} processing request",
            "[DEBUG] Health check passed",
            "[INFO] Connection accepted from 192.168.1.42",
            "[WARN] High memory usage detected",
        ])

        lines = []
        for i in range(min(tail, 50)):
            ts = (now - timedelta(minutes=tail - i)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            msg = random.choice(templates)
            lines.append(f"{ts} {msg}")
        return lines

    try:
        import subprocess
        out = subprocess.check_output(
            ["docker", "logs", "--tail", str(tail), "--timestamps", container_id],
            text=True, stderr=subprocess.STDOUT, timeout=10,
        )
        return out.strip().splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return ["Error: could not retrieve container logs"]


def get_app_catalog() -> list[dict]:
    return APP_CATALOG


import re

_VALID_APP_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")


def install_app(app_id: str) -> dict:
    """Install an app from the catalog (docker pull + run)."""
    if not _VALID_APP_ID.match(app_id):
        return {"ok": False, "error": "Invalid app ID"}

    # app_id must exist in the catalog — prevents arbitrary container names
    app = next((a for a in APP_CATALOG if a["id"] == app_id), None)
    if not app:
        return {"ok": False, "error": "App not found in catalog"}

    if not _is_linux:
        # Mock install
        _MOCK_CONTAINERS.append({
            "id": f"new_{app_id[:8]}",
            "name": app_id,
            "image": app["image"],
            "status": "running",
            "state": "running",
            "ports": app["ports"],
            "cpu_percent": 0,
            "memory_mb": 0,
            "uptime": "just now",
        })
        return {"ok": True, "app": app_id}

    try:
        import subprocess
        # Pull image
        subprocess.check_call(["docker", "pull", app["image"]])
        # Build run command
        cmd = ["docker", "run", "-d", "--name", app_id, "--restart", "unless-stopped"]
        for container_port, host_port in app["ports"].items():
            cmd.extend(["-p", f"{host_port}:{container_port.split('/')[0]}"])
        for vol in app.get("volumes", []):
            cmd.extend(["-v", vol])
        cmd.append(app["image"])
        subprocess.check_call(cmd)
        return {"ok": True, "app": app_id}
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": str(e)}
