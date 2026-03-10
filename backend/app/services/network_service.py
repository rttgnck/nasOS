"""Network configuration service.

On Linux: reads from /sys/class/net, ip addr, etc.
On macOS (dev): returns mock data.
"""

import platform
import socket
import subprocess

_is_linux = platform.system() == "Linux"


def get_network_info() -> dict:
    hostname = socket.gethostname()

    if not _is_linux:
        return {
            "hostname": hostname,
            "domain": "local",
            "interfaces": [
                {
                    "name": "eth0",
                    "type": "ethernet",
                    "state": "up",
                    "mac": "dc:a6:32:xx:xx:01",
                    "ipv4": "192.168.1.50",
                    "netmask": "255.255.255.0",
                    "gateway": "192.168.1.1",
                    "method": "static",
                    "speed": "1000 Mbps",
                },
                {
                    "name": "wlan0",
                    "type": "wifi",
                    "state": "down",
                    "mac": "dc:a6:32:xx:xx:02",
                    "ipv4": "",
                    "netmask": "",
                    "gateway": "",
                    "method": "dhcp",
                    "speed": "",
                },
            ],
            "dns": ["1.1.1.1", "8.8.8.8"],
        }

    interfaces = _get_interfaces()
    dns = _get_dns()

    return {
        "hostname": hostname,
        "domain": _get_domain(),
        "interfaces": interfaces,
        "dns": dns,
    }


def get_services_status() -> list[dict]:
    """Get status of key NAS services."""
    services = [
        {"name": "smbd", "display": "Samba (SMB)", "description": "Windows file sharing"},
        {"name": "nfs-server", "display": "NFS Server", "description": "Unix/Linux file sharing"},
        {"name": "avahi-daemon", "display": "Avahi (mDNS)", "description": "Network discovery"},
        {"name": "docker", "display": "Docker", "description": "Container runtime"},
        {"name": "ssh", "display": "SSH Server", "description": "Secure remote access"},
        {"name": "fail2ban", "display": "Fail2Ban", "description": "Brute-force protection"},
    ]

    if not _is_linux:
        # Mock: some running, some not
        statuses = {
            "smbd": "active", "nfs-server": "inactive", "avahi-daemon": "active",
            "docker": "active", "ssh": "active", "fail2ban": "inactive",
        }
        for svc in services:
            svc["status"] = statuses.get(svc["name"], "inactive")
        return services

    for svc in services:
        svc["status"] = _get_systemd_status(svc["name"])
    return services


def _get_interfaces() -> list[dict]:
    interfaces = []
    try:
        out = subprocess.check_output(["ip", "-j", "addr", "show"], text=True)
        import json
        data = json.loads(out)
        for iface in data:
            name = iface.get("ifname", "")
            if name == "lo":
                continue
            state = iface.get("operstate", "unknown").lower()
            mac = iface.get("address", "")
            ipv4 = ""
            netmask = ""
            for addr_info in iface.get("addr_info", []):
                if addr_info.get("family") == "inet":
                    ipv4 = addr_info.get("local", "")
                    prefix = addr_info.get("prefixlen", 24)
                    netmask = _prefix_to_netmask(prefix)
                    break

            itype = "wifi" if name.startswith("wl") else "ethernet"
            interfaces.append({
                "name": name,
                "type": itype,
                "state": state,
                "mac": mac,
                "ipv4": ipv4,
                "netmask": netmask,
                "gateway": _get_gateway(name),
                "method": "dhcp",
                "speed": _get_link_speed(name),
            })
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return interfaces


def _get_gateway(iface: str) -> str:
    try:
        out = subprocess.check_output(
            ["ip", "route", "show", "default", "dev", iface], text=True
        )
        parts = out.strip().split()
        if len(parts) >= 3:
            return parts[2]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return ""


def _get_link_speed(iface: str) -> str:
    try:
        out = subprocess.check_output(["ethtool", iface], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            if "Speed:" in line:
                return line.split(":", 1)[1].strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return ""


def _get_dns() -> list[str]:
    try:
        with open("/etc/resolv.conf") as f:
            return [
                line.split()[1]
                for line in f
                if line.strip().startswith("nameserver")
            ]
    except FileNotFoundError:
        return []


def _get_domain() -> str:
    try:
        return socket.getfqdn().split(".", 1)[1] if "." in socket.getfqdn() else "local"
    except Exception:
        return "local"


def _get_systemd_status(unit: str) -> str:
    try:
        out = subprocess.check_output(
            ["systemctl", "is-active", unit], text=True, stderr=subprocess.DEVNULL
        ).strip()
        return out
    except subprocess.CalledProcessError:
        return "inactive"


def _prefix_to_netmask(prefix: int) -> str:
    mask = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF
    return f"{(mask >> 24) & 0xFF}.{(mask >> 16) & 0xFF}.{(mask >> 8) & 0xFF}.{mask & 0xFF}"
