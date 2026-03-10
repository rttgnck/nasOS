"""System extras service — covers the 9 commonly missed items.

Handles: Avahi/mDNS, UPS/NUT, thermal management, OTA updates,
read-only root status, Time Machine, ACLs.
"""

import platform
import socket
from datetime import datetime, timedelta

_is_linux = platform.system() == "Linux"
_now = datetime.now


# ── 1. Avahi / mDNS ───────────────────────────────────────────────

def get_avahi_status() -> dict:
    hostname = socket.gethostname()
    if not _is_linux:
        return {
            "enabled": True,
            "hostname": f"{hostname}.local",
            "services": [
                {"type": "_smb._tcp", "name": "nasOS SMB", "port": 445},
                {"type": "_nfs._tcp", "name": "nasOS NFS", "port": 2049},
                {"type": "_http._tcp", "name": "nasOS Web UI", "port": 443},
                {"type": "_device-info._tcp", "name": "nasOS", "port": 0},
                {"type": "_adisk._tcp", "name": "nasOS Time Machine", "port": 0},
                {"type": "_timemachine._tcp", "name": "Time Machine Backups", "port": 445},
            ],
            "discovered_devices": [
                {"name": "MacBook-Air.local", "address": "192.168.1.42", "type": "computer"},
                {"name": "iPhone.local", "address": "192.168.1.55", "type": "phone"},
                {"name": "printer.local", "address": "192.168.1.100", "type": "printer"},
            ],
        }
    # Real: avahi-browse -a, parse /etc/avahi/services/
    return {"enabled": False, "hostname": hostname, "services": [], "discovered_devices": []}


# ── 3. macOS Time Machine ─────────────────────────────────────────

def get_timemachine_config() -> dict:
    if not _is_linux:
        return {
            "enabled": True,
            "share_name": "Time Machine Backups",
            "share_path": "/mnt/data/timemachine",
            "quota_gb": 500,
            "used_gb": 234,
            "vfs_modules": ["fruit", "catia", "streams_xattr"],
            "connected_macs": [
                {"hostname": "MacBook-Air", "last_backup": (_now() - timedelta(hours=3)).isoformat(), "size_gb": 178},
                {"hostname": "iMac-Office", "last_backup": (_now() - timedelta(days=2)).isoformat(), "size_gb": 56},
            ],
        }
    return {"enabled": False, "share_name": "", "share_path": "", "quota_gb": 0, "used_gb": 0, "vfs_modules": [], "connected_macs": []}


# ── 5. UPS / NUT ──────────────────────────────────────────────────

def get_ups_status() -> dict:
    if not _is_linux:
        return {
            "connected": True,
            "model": "CyberPower CP1500AVRLCD",
            "driver": "usbhid-ups",
            "status": "OL",  # OL = online, OB = on battery, LB = low battery
            "battery_percent": 100,
            "load_percent": 32,
            "runtime_sec": 1800,
            "input_voltage": 121.4,
            "output_voltage": 121.4,
            "temperature_c": 28.5,
            "last_event": "Power restored",
            "last_event_time": (_now() - timedelta(days=14)).isoformat(),
            "shutdown_config": {
                "on_battery_min": 5,
                "low_battery_action": "shutdown",
                "critical_battery_pct": 10,
            },
        }
    # Real: upsc ups@localhost
    return {"connected": False}


# ── 6. Read-Only Root Filesystem ──────────────────────────────────

def get_rootfs_status() -> dict:
    if not _is_linux:
        return {
            "readonly_root": True,
            "overlay_active": True,
            "overlay_size_mb": 128,
            "overlay_used_mb": 34,
            "persistent_dirs": ["/opt/nasos/data", "/opt/nasos/config", "/var/log"],
            "sd_card": {
                "device": "/dev/mmcblk0",
                "total_gb": 32,
                "writes_total_gb": 45.2,
                "health": "good",
                "estimated_life_pct": 94,
            },
            "last_commit": (_now() - timedelta(days=3)).isoformat(),
            "pending_changes": 7,
        }
    # Real: check /proc/mounts for ro, check overlayfs
    return {"readonly_root": False, "overlay_active": False}


# ── 7. Thermal Management ─────────────────────────────────────────

def get_thermal_config() -> dict:
    if not _is_linux:
        return {
            "cpu_temp": 52.3,
            "gpu_temp": 50.1,
            "throttled": False,
            "throttle_flags": {
                "under_voltage": False,
                "arm_freq_capped": False,
                "currently_throttled": False,
                "soft_temp_limit": False,
            },
            "fan": {
                "present": True,
                "mode": "balanced",  # quiet, balanced, performance, custom
                "speed_pct": 45,
                "rpm": 2700,
            },
            "fan_curves": {
                "quiet": {"30": 0, "55": 25, "65": 50, "75": 75, "80": 100},
                "balanced": {"25": 0, "45": 25, "55": 50, "65": 75, "75": 100},
                "performance": {"20": 25, "35": 50, "50": 75, "60": 100},
            },
            "temp_history_24h": {
                "min": 38.2,
                "max": 67.4,
                "avg": 49.8,
            },
        }
    # Real: /sys/class/thermal/, vcgencmd get_throttled
    return {"cpu_temp": 0, "gpu_temp": 0, "throttled": False}


# ── 8. OTA Update Mechanism ───────────────────────────────────────

def get_update_status() -> dict:
    if not _is_linux:
        return {
            "current_version": "0.1.0",
            "latest_version": "0.2.0",
            "update_available": True,
            "channel": "stable",
            "last_check": (_now() - timedelta(hours=6)).isoformat(),
            "auto_check": True,
            "auto_install": False,
            "partition_scheme": "A/B",
            "active_partition": "A",
            "changelog": [
                {"version": "0.2.0", "date": "2024-03-01", "changes": [
                    "Added Docker App Store with 10+ curated apps",
                    "Improved SMART monitoring with historical tracking",
                    "Fixed SMB share permissions on macOS clients",
                    "Security: updated OpenSSL to 3.2.1",
                ]},
                {"version": "0.1.1", "date": "2024-02-15", "changes": [
                    "Fixed WebSocket reconnection on network change",
                    "Added NFS export support",
                    "Improved thermal fan curve accuracy",
                ]},
            ],
            "rollback_available": True,
            "rollback_version": "0.1.0",
        }
    return {"current_version": "0.1.0", "update_available": False}


# ── 4. SMART Monitoring Daemon Config ─────────────────────────────

def get_smart_daemon_config() -> dict:
    if not _is_linux:
        return {
            "enabled": True,
            "short_test_schedule": "weekly",
            "long_test_schedule": "monthly",
            "alert_on_warning": True,
            "alert_on_critical": True,
            "email_alerts": True,
            "email_to": "admin@nasos.local",
            "monitored_disks": [
                {"device": "/dev/sda", "model": "WDC WD10EZEX-00W", "health": "PASSED", "last_test": (_now() - timedelta(days=2)).isoformat()},
                {"device": "/dev/sdb", "model": "Samsung SSD 870", "health": "PASSED", "last_test": (_now() - timedelta(days=5)).isoformat()},
                {"device": "/dev/sdc", "model": "Seagate IronWolf", "health": "FAILING", "last_test": (_now() - timedelta(days=1)).isoformat()},
                {"device": "/dev/nvme0n1", "model": "Samsung 980 PRO", "health": "PASSED", "last_test": (_now() - timedelta(days=3)).isoformat()},
            ],
        }
    return {"enabled": False}


# ── 2. ACL Management ─────────────────────────────────────────────

def get_acl_info(path: str) -> dict:
    """Get ACL info for a path."""
    if not _is_linux:
        return {
            "path": path,
            "owner": "admin",
            "group": "nasos",
            "permissions": "rwxrwxr-x",
            "acl_entries": [
                {"type": "user", "name": "admin", "permissions": "rwx"},
                {"type": "user", "name": "alice", "permissions": "r-x"},
                {"type": "group", "name": "nasos", "permissions": "rwx"},
                {"type": "group", "name": "media", "permissions": "r-x"},
                {"type": "mask", "name": "", "permissions": "rwx"},
                {"type": "other", "name": "", "permissions": "r-x"},
            ],
            "has_extended_acl": True,
            "default_acl": True,
        }
    # Real: getfacl path
    return {"path": path, "acl_entries": []}
