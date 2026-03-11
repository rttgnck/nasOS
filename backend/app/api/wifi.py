"""WiFi management API.

On Linux: uses nmcli (NetworkManager) — standard on Pi OS Bookworm.
On macOS/dev: returns mock data.
"""

import platform
import subprocess

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/wifi", tags=["wifi"])

_is_linux = platform.system() == "Linux"


# ── Models ──────────────────────────────────────────────────────────────────

class WifiNetwork(BaseModel):
    ssid: str
    signal: int          # dBm
    security: str        # WPA2, WPA3, Open, etc.
    frequency: str       # 2.4GHz or 5GHz
    connected: bool


class WifiStatus(BaseModel):
    enabled: bool
    connected: bool
    ssid: str
    ip_address: str
    signal: int
    country: str


class WifiConnectRequest(BaseModel):
    ssid: str
    password: str
    country: str = "US"


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/status", response_model=WifiStatus)
async def wifi_status():
    """Get current WiFi connection status."""
    if not _is_linux:
        return WifiStatus(
            enabled=True,
            connected=True,
            ssid="HomeNetwork",
            ip_address="192.168.1.52",
            signal=-55,
            country="US",
        )
    return _get_wifi_status()


@router.get("/scan", response_model=list[WifiNetwork])
async def wifi_scan():
    """Scan for available WiFi networks."""
    if not _is_linux:
        return [
            WifiNetwork(ssid="HomeNetwork",    signal=-45, security="WPA2", frequency="5GHz",  connected=True),
            WifiNetwork(ssid="HomeNetwork_2G", signal=-60, security="WPA2", frequency="2.4GHz",connected=False),
            WifiNetwork(ssid="Neighbor_5G",    signal=-75, security="WPA2", frequency="5GHz",  connected=False),
            WifiNetwork(ssid="GuestNetwork",   signal=-80, security="Open", frequency="2.4GHz",connected=False),
        ]
    return _scan_networks()


@router.post("/connect")
async def wifi_connect(req: WifiConnectRequest):
    """Connect to a WiFi network."""
    if not _is_linux:
        return {"status": "connected", "ssid": req.ssid}

    try:
        # Set regulatory country
        subprocess.run(["iw", "reg", "set", req.country], capture_output=True)

        # Enable wifi radio
        subprocess.run(["nmcli", "radio", "wifi", "on"], capture_output=True)

        # Delete existing connection for this SSID if it exists
        subprocess.run(
            ["nmcli", "connection", "delete", req.ssid],
            capture_output=True
        )

        # Connect (creates a persistent connection profile)
        result = subprocess.run(
            ["nmcli", "device", "wifi", "connect", req.ssid,
             "password", req.password, "ifname", "wlan0"],
            capture_output=True, text=True, timeout=30
        )

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=result.stderr.strip() or "Connection failed")

        return {"status": "connected", "ssid": req.ssid}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="WiFi connection timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="nmcli not available")


@router.delete("/disconnect")
async def wifi_disconnect():
    """Disconnect from the current WiFi network."""
    if not _is_linux:
        return {"status": "disconnected"}

    try:
        subprocess.run(
            ["nmcli", "device", "disconnect", "wlan0"],
            capture_output=True, check=True
        )
        return {"status": "disconnected"}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail="Failed to disconnect")


@router.post("/toggle")
async def wifi_toggle():
    """Enable or disable the WiFi radio."""
    if not _is_linux:
        return {"enabled": True}

    try:
        result = subprocess.run(
            ["nmcli", "radio", "wifi"], capture_output=True, text=True
        )
        currently_enabled = "enabled" in result.stdout.lower()
        new_state = "off" if currently_enabled else "on"
        subprocess.run(["nmcli", "radio", "wifi", new_state], check=True, capture_output=True)
        return {"enabled": new_state == "on"}
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=500, detail="Failed to toggle WiFi")


# ── Linux helpers ─────────────────────────────────────────────────────────

def _get_wifi_status() -> WifiStatus:
    try:
        # Get connected wifi info via nmcli
        result = subprocess.run(
            ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"],
            capture_output=True, text=True
        )
        wifi_line = next(
            (l for l in result.stdout.splitlines() if ":wifi:" in l), ""
        )
        connected = ":connected:" in wifi_line
        ssid = wifi_line.split(":")[-1] if connected else ""

        # Get signal strength
        signal = _get_signal_strength() if connected else 0

        # Get IP
        ip = ""
        if connected:
            ip_result = subprocess.run(
                ["nmcli", "-t", "-f", "IP4.ADDRESS", "device", "show", "wlan0"],
                capture_output=True, text=True
            )
            for line in ip_result.stdout.splitlines():
                if "IP4.ADDRESS" in line:
                    ip = line.split(":")[-1].split("/")[0]
                    break

        # WiFi radio enabled?
        radio = subprocess.run(
            ["nmcli", "radio", "wifi"], capture_output=True, text=True
        )
        enabled = "enabled" in radio.stdout.lower()

        # Country
        country = _get_wifi_country()

        return WifiStatus(
            enabled=enabled,
            connected=connected,
            ssid=ssid,
            ip_address=ip,
            signal=signal,
            country=country,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, StopIteration):
        return WifiStatus(enabled=False, connected=False, ssid="", ip_address="", signal=0, country="US")


def _scan_networks() -> list[WifiNetwork]:
    try:
        # Trigger a fresh scan
        subprocess.run(["nmcli", "device", "wifi", "rescan"], capture_output=True)

        # Get current connected SSID
        status = _get_wifi_status()
        connected_ssid = status.ssid if status.connected else ""

        result = subprocess.run(
            ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,FREQ", "device", "wifi", "list"],
            capture_output=True, text=True
        )

        seen: set[str] = set()
        networks: list[WifiNetwork] = []

        for line in result.stdout.splitlines():
            parts = line.split(":")
            if len(parts) < 4:
                continue
            ssid, signal_str, security, freq = parts[0], parts[1], parts[2], parts[3]
            if not ssid or ssid in seen:
                continue
            seen.add(ssid)

            try:
                signal = int(signal_str)
                # Convert percentage to approximate dBm
                dbm = -100 + (signal * 70 // 100)
            except ValueError:
                dbm = -80

            frequency = "5GHz" if "5" in freq else "2.4GHz"
            security_label = "Open" if not security or security == "--" else security

            networks.append(WifiNetwork(
                ssid=ssid,
                signal=dbm,
                security=security_label,
                frequency=frequency,
                connected=(ssid == connected_ssid),
            ))

        # Sort: connected first, then by signal
        networks.sort(key=lambda n: (not n.connected, n.signal), reverse=False)
        networks.sort(key=lambda n: n.connected, reverse=True)
        return networks

    except (subprocess.CalledProcessError, FileNotFoundError):
        return []


def _get_signal_strength() -> int:
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "IN-USE,SIGNAL", "device", "wifi", "list"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if line.startswith("*:"):
                return int(line.split(":")[1])
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        pass
    return 0


def _get_wifi_country() -> str:
    try:
        result = subprocess.run(["iw", "reg", "get"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            if "country" in line.lower():
                parts = line.split()
                if len(parts) >= 2:
                    return parts[1].rstrip(":")
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return "US"
