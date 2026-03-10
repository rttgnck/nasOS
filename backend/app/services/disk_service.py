"""Disk and storage service — wraps lsblk, smartctl, and mount operations.

On non-Linux (dev mode), returns mock data so the UI can be developed.
"""

import json
import platform
import subprocess
from pathlib import Path

import psutil

_is_linux = platform.system() == "Linux"


def get_disks() -> list[dict]:
    """Return list of physical disks and their partitions."""
    if _is_linux:
        return _get_disks_linux()
    return _get_disks_mock()


def get_smart_data(device: str) -> dict:
    """Return SMART health data for a device (e.g. /dev/sda)."""
    if _is_linux:
        return _get_smart_linux(device)
    return _get_smart_mock(device)


def get_volumes() -> list[dict]:
    """Return mounted volumes with usage stats."""
    partitions = psutil.disk_partitions(all=False)
    volumes = []
    for p in partitions:
        try:
            usage = psutil.disk_usage(p.mountpoint)
            volumes.append({
                "device": p.device,
                "mountpoint": p.mountpoint,
                "fstype": p.fstype,
                "opts": p.opts,
                "total_bytes": usage.total,
                "used_bytes": usage.used,
                "free_bytes": usage.free,
                "percent": usage.percent,
            })
        except PermissionError:
            continue
    return volumes


def get_overview() -> dict:
    """Return high-level storage overview."""
    disks = get_disks()
    volumes = get_volumes()
    total_capacity = sum(d.get("size_bytes", 0) for d in disks)
    total_used = sum(v["used_bytes"] for v in volumes)
    total_free = sum(v["free_bytes"] for v in volumes)

    return {
        "disk_count": len(disks),
        "volume_count": len(volumes),
        "total_capacity_bytes": total_capacity,
        "total_used_bytes": total_used,
        "total_free_bytes": total_free,
    }


# --- Linux implementations ---

def _get_disks_linux() -> list[dict]:
    try:
        result = subprocess.run(
            ["lsblk", "-J", "-b", "-o",
             "NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,TRAN,ROTA,MOUNTPOINT,FSTYPE,UUID"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        disks = []
        for dev in data.get("blockdevices", []):
            if dev.get("type") != "disk":
                continue
            partitions = []
            for child in dev.get("children", []):
                partitions.append({
                    "name": child.get("name"),
                    "size_bytes": child.get("size"),
                    "fstype": child.get("fstype"),
                    "mountpoint": child.get("mountpoint"),
                    "uuid": child.get("uuid"),
                })
            disks.append({
                "name": dev.get("name"),
                "path": f"/dev/{dev.get('name')}",
                "size_bytes": dev.get("size"),
                "model": (dev.get("model") or "").strip(),
                "serial": (dev.get("serial") or "").strip(),
                "vendor": (dev.get("vendor") or "").strip(),
                "transport": dev.get("tran"),
                "rotational": dev.get("rota"),
                "partitions": partitions,
            })
        return disks
    except Exception:
        return []


def _get_smart_linux(device: str) -> dict:
    try:
        result = subprocess.run(
            ["smartctl", "-a", "-j", device],
            capture_output=True, text=True, timeout=15
        )
        data = json.loads(result.stdout)
        health = data.get("smart_status", {}).get("passed", None)
        temp = None
        if "temperature" in data:
            temp = data["temperature"].get("current")

        attrs = []
        for attr in data.get("ata_smart_attributes", {}).get("table", []):
            attrs.append({
                "id": attr.get("id"),
                "name": attr.get("name"),
                "value": attr.get("value"),
                "worst": attr.get("worst"),
                "thresh": attr.get("thresh"),
                "raw_value": attr.get("raw", {}).get("string"),
            })

        return {
            "device": device,
            "healthy": health,
            "temperature": temp,
            "power_on_hours": data.get("power_on_time", {}).get("hours"),
            "model": data.get("model_name"),
            "serial": data.get("serial_number"),
            "firmware": data.get("firmware_version"),
            "attributes": attrs,
        }
    except Exception as e:
        return {"device": device, "error": str(e)}


# --- Mock data for macOS dev ---

def _get_disks_mock() -> list[dict]:
    return [
        {
            "name": "sda",
            "path": "/dev/sda",
            "size_bytes": 1000204886016,
            "model": "WDC WD10EZEX-00W",
            "serial": "WD-WMC4N0K0FAKE",
            "vendor": "Western Digital",
            "transport": "sata",
            "rotational": True,
            "partitions": [
                {"name": "sda1", "size_bytes": 536870912, "fstype": "vfat", "mountpoint": "/boot/efi", "uuid": "ABCD-1234"},
                {"name": "sda2", "size_bytes": 999667015680, "fstype": "ext4", "mountpoint": "/mnt/data", "uuid": "a1b2c3d4-e5f6-7890"},
            ],
        },
        {
            "name": "sdb",
            "path": "/dev/sdb",
            "size_bytes": 2000398934016,
            "model": "Samsung SSD 870",
            "serial": "S5FAKE123456",
            "vendor": "Samsung",
            "transport": "sata",
            "rotational": False,
            "partitions": [
                {"name": "sdb1", "size_bytes": 2000398934016, "fstype": "ext4", "mountpoint": "/mnt/ssd", "uuid": "f1e2d3c4-b5a6-7890"},
            ],
        },
        {
            "name": "sdc",
            "path": "/dev/sdc",
            "size_bytes": 4000787030016,
            "model": "Seagate IronWolf",
            "serial": "ZA40FAKE7890",
            "vendor": "Seagate",
            "transport": "sata",
            "rotational": True,
            "partitions": [],
        },
        {
            "name": "nvme0n1",
            "path": "/dev/nvme0n1",
            "size_bytes": 500107862016,
            "model": "NVMe Samsung 980 PRO",
            "serial": "S6FKNV0FAKE",
            "vendor": "Samsung",
            "transport": "nvme",
            "rotational": False,
            "partitions": [
                {"name": "nvme0n1p1", "size_bytes": 268435456, "fstype": "vfat", "mountpoint": "/boot", "uuid": "BOOT-0001"},
                {"name": "nvme0n1p2", "size_bytes": 499839426560, "fstype": "btrfs", "mountpoint": "/", "uuid": "root-uuid-0001"},
            ],
        },
    ]


def _get_smart_mock(device: str) -> dict:
    mock_data = {
        "/dev/sda": {
            "device": "/dev/sda",
            "healthy": True,
            "temperature": 34,
            "power_on_hours": 18562,
            "model": "WDC WD10EZEX-00W",
            "serial": "WD-WMC4N0K0FAKE",
            "firmware": "01.01A01",
            "attributes": [
                {"id": 1, "name": "Raw_Read_Error_Rate", "value": 200, "worst": 200, "thresh": 51, "raw_value": "0"},
                {"id": 5, "name": "Reallocated_Sector_Ct", "value": 200, "worst": 200, "thresh": 140, "raw_value": "0"},
                {"id": 9, "name": "Power_On_Hours", "value": 78, "worst": 78, "thresh": 0, "raw_value": "18562"},
                {"id": 194, "name": "Temperature_Celsius", "value": 117, "worst": 100, "thresh": 0, "raw_value": "34"},
                {"id": 197, "name": "Current_Pending_Sector", "value": 200, "worst": 200, "thresh": 0, "raw_value": "0"},
                {"id": 198, "name": "Offline_Uncorrectable", "value": 200, "worst": 200, "thresh": 0, "raw_value": "0"},
            ],
        },
        "/dev/sdb": {
            "device": "/dev/sdb",
            "healthy": True,
            "temperature": 29,
            "power_on_hours": 4210,
            "model": "Samsung SSD 870",
            "serial": "S5FAKE123456",
            "firmware": "SVT02B6Q",
            "attributes": [
                {"id": 5, "name": "Reallocated_Sector_Ct", "value": 100, "worst": 100, "thresh": 10, "raw_value": "0"},
                {"id": 9, "name": "Power_On_Hours", "value": 99, "worst": 99, "thresh": 0, "raw_value": "4210"},
                {"id": 177, "name": "Wear_Leveling_Count", "value": 98, "worst": 98, "thresh": 5, "raw_value": "12"},
                {"id": 194, "name": "Temperature_Celsius", "value": 71, "worst": 55, "thresh": 0, "raw_value": "29"},
            ],
        },
        "/dev/sdc": {
            "device": "/dev/sdc",
            "healthy": False,
            "temperature": 41,
            "power_on_hours": 32105,
            "model": "Seagate IronWolf",
            "serial": "ZA40FAKE7890",
            "firmware": "SC60",
            "attributes": [
                {"id": 5, "name": "Reallocated_Sector_Ct", "value": 95, "worst": 95, "thresh": 36, "raw_value": "48"},
                {"id": 9, "name": "Power_On_Hours", "value": 60, "worst": 60, "thresh": 0, "raw_value": "32105"},
                {"id": 194, "name": "Temperature_Celsius", "value": 109, "worst": 90, "thresh": 0, "raw_value": "41"},
                {"id": 197, "name": "Current_Pending_Sector", "value": 100, "worst": 100, "thresh": 0, "raw_value": "3"},
                {"id": 198, "name": "Offline_Uncorrectable", "value": 100, "worst": 100, "thresh": 0, "raw_value": "1"},
            ],
        },
    }
    return mock_data.get(device, {
        "device": device,
        "healthy": True,
        "temperature": 35,
        "power_on_hours": 1000,
        "model": "Unknown",
        "serial": "N/A",
        "firmware": "N/A",
        "attributes": [],
    })
