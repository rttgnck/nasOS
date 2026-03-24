"""SATA storage service — Penta SATA HAT config and block device mount management.

Manages:
- dtparam=pciex1 in /boot/firmware/config.txt for the Penta SATA HAT
- Block device discovery (sd* devices)
- Mount point creation, fstab entries, and auto-mounting
- Persisted device labels in /opt/nasos/data/sata-mounts.json
"""

import json
import logging
import subprocess
from pathlib import Path

from app.core.config import settings

_log = logging.getLogger(__name__)

_DATA_DIR = settings.data_dir
_MOUNTS_CONFIG = _DATA_DIR / "sata-mounts.json"
_SETUP_SCRIPT = Path("/opt/nasos/scripts/storage-mount.sh")

_CONFIG_TXT_PATHS = [Path("/boot/firmware/config.txt"), Path("/boot/config.txt")]


def _read_mounts_config() -> dict:
    if _MOUNTS_CONFIG.exists():
        try:
            return json.loads(_MOUNTS_CONFIG.read_text())
        except Exception:
            pass
    return {"devices": {}}


def _write_mounts_config(config: dict):
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _MOUNTS_CONFIG.write_text(json.dumps(config, indent=2) + "\n")


def _run_script(action: str, *args: str) -> tuple[bool, str]:
    """Run storage-mount.sh with sudo."""
    if settings.dev_mode:
        return True, "dev mode — skipped"
    if not _SETUP_SCRIPT.exists():
        return False, f"Script not found: {_SETUP_SCRIPT}"
    try:
        result = subprocess.run(
            ["/usr/bin/sudo", str(_SETUP_SCRIPT), action, *args],
            timeout=30,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            _log.warning(
                "storage-mount.sh %s exited %d: %s",
                action, result.returncode, result.stderr.strip(),
            )
            return False, result.stderr.strip() or f"Exit code {result.returncode}"
        return True, result.stdout.strip()
    except Exception as exc:
        _log.warning("storage-mount.sh %s failed: %s", action, exc)
        return False, str(exc)


# ── SATA HAT (dtparam=pciex1) ───────────────────────────────────


def get_sata_hat_status() -> dict:
    """Check whether dtparam=pciex1 is present in config.txt."""
    if settings.dev_mode:
        return {"enabled": False, "available": True, "reboot_required": False}

    for cfg_path in _CONFIG_TXT_PATHS:
        if not cfg_path.exists():
            continue
        try:
            for line in cfg_path.read_text().splitlines():
                stripped = line.strip()
                if stripped == "dtparam=pciex1":
                    return {"enabled": True, "available": True, "reboot_required": False}
            return {"enabled": False, "available": True, "reboot_required": False}
        except Exception:
            continue

    return {"enabled": False, "available": False, "reboot_required": False}


def set_sata_hat_enabled(enabled: bool) -> dict:
    action = "enable-sata" if enabled else "disable-sata"
    ok, msg = _run_script(action)
    if not ok:
        return {"status": "error", "message": msg}
    return {
        "status": "ok",
        "enabled": enabled,
        "message": f"SATA HAT {'enabled' if enabled else 'disabled'}. Reboot required to apply.",
        "reboot_required": True,
    }


# ── Block device discovery ───────────────────────────────────────


def get_block_devices() -> list[dict]:
    """List sd* block devices with partitions, enriched with saved mount config."""
    if settings.dev_mode:
        return _get_mock_devices()

    try:
        result = subprocess.run(
            [
                "lsblk", "-J", "-b", "-o",
                "NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,TRAN,MOUNTPOINT,FSTYPE,UUID,LABEL",
            ],
            capture_output=True, text=True, timeout=10,
        )
        data = json.loads(result.stdout)
        mounts_config = _read_mounts_config()
        devices: list[dict] = []

        for dev in data.get("blockdevices", []):
            if dev.get("type") != "disk":
                continue
            name = dev.get("name", "")
            if not name.startswith("sd"):
                continue

            partitions = []
            for child in dev.get("children", []):
                part_name = child.get("name", "")
                cfg = mounts_config.get("devices", {}).get(part_name, {})
                partitions.append({
                    "name": part_name,
                    "path": f"/dev/{part_name}",
                    "size_bytes": child.get("size"),
                    "fstype": child.get("fstype"),
                    "mountpoint": child.get("mountpoint"),
                    "uuid": child.get("uuid"),
                    "disk_label": child.get("label"),
                    "label": cfg.get("label", part_name),
                    "configured_mount": cfg.get("mount_point", ""),
                    "auto_mount": cfg.get("auto_mount", False),
                })

            if not partitions:
                cfg = mounts_config.get("devices", {}).get(name, {})
                partitions.append({
                    "name": name,
                    "path": f"/dev/{name}",
                    "size_bytes": dev.get("size"),
                    "fstype": dev.get("fstype"),
                    "mountpoint": dev.get("mountpoint"),
                    "uuid": dev.get("uuid"),
                    "disk_label": dev.get("label"),
                    "label": cfg.get("label", name),
                    "configured_mount": cfg.get("mount_point", ""),
                    "auto_mount": cfg.get("auto_mount", False),
                })

            devices.append({
                "name": name,
                "path": f"/dev/{name}",
                "size_bytes": dev.get("size"),
                "model": (dev.get("model") or "").strip(),
                "serial": (dev.get("serial") or "").strip(),
                "vendor": (dev.get("vendor") or "").strip(),
                "transport": dev.get("tran"),
                "partitions": partitions,
            })

        return devices
    except Exception as exc:
        _log.error("Failed to list block devices: %s", exc)
        return []


# ── Mount / unmount / update ─────────────────────────────────────


def mount_device(device: str, mount_point: str, label: str) -> dict:
    """Mount a device, create the directory, and add an fstab entry."""
    if not mount_point.startswith("/mnt/"):
        mount_point = f"/mnt/{mount_point.lstrip('/')}"

    ok, msg = _run_script("mount", device, mount_point)
    if not ok:
        return {"status": "error", "message": msg}

    config = _read_mounts_config()
    dev_name = device.split("/")[-1]
    config.setdefault("devices", {})[dev_name] = {
        "device": device,
        "mount_point": mount_point,
        "label": label or dev_name,
        "auto_mount": True,
    }
    _write_mounts_config(config)

    return {"status": "ok", "message": f"Mounted {device} at {mount_point}", "mount_point": mount_point}


def unmount_device(device_name: str) -> dict:
    config = _read_mounts_config()
    device_cfg = config.get("devices", {}).get(device_name, {})
    mount_point = device_cfg.get("mount_point", "")
    device_path = device_cfg.get("device", f"/dev/{device_name}")

    if not mount_point:
        return {"status": "error", "message": f"No mount config found for {device_name}"}

    ok, msg = _run_script("unmount", mount_point, device_path)
    if not ok:
        return {"status": "error", "message": msg}

    config.get("devices", {}).pop(device_name, None)
    _write_mounts_config(config)
    return {"status": "ok", "message": f"Unmounted {device_name} from {mount_point}"}


def update_device(device_name: str, label: str | None, mount_point: str | None) -> dict:
    config = _read_mounts_config()
    device_cfg = config.get("devices", {}).get(device_name)

    if not device_cfg:
        config.setdefault("devices", {})[device_name] = {
            "device": f"/dev/{device_name}",
            "mount_point": mount_point or "",
            "label": label or device_name,
            "auto_mount": False,
        }
        _write_mounts_config(config)
        return {"status": "ok", "message": f"Saved config for {device_name}"}

    old_mount = device_cfg.get("mount_point", "")

    if label is not None:
        device_cfg["label"] = label

    if mount_point is not None and mount_point != old_mount:
        if not mount_point.startswith("/mnt/"):
            mount_point = f"/mnt/{mount_point.lstrip('/')}"

        if old_mount:
            ok, msg = _run_script("remount", old_mount, mount_point, device_cfg["device"])
            if not ok:
                return {"status": "error", "message": msg}

        device_cfg["mount_point"] = mount_point

    config["devices"][device_name] = device_cfg
    _write_mounts_config(config)
    return {"status": "ok", "message": f"Updated {device_name}"}


# ── Mock data (macOS dev) ────────────────────────────────────────


def _get_mock_devices() -> list[dict]:
    mounts = _read_mounts_config()

    def _cfg(name: str) -> dict:
        return mounts.get("devices", {}).get(name, {})

    return [
        {
            "name": "sda",
            "path": "/dev/sda",
            "size_bytes": 1000204886016,
            "model": "WDC WD10EZEX-00W",
            "serial": "WD-WMC4N0K0FAKE",
            "vendor": "Western Digital",
            "transport": "sata",
            "partitions": [
                {
                    "name": "sda1",
                    "path": "/dev/sda1",
                    "size_bytes": 1000204886016,
                    "fstype": "ext4",
                    "mountpoint": _cfg("sda1").get("mount_point") or None,
                    "uuid": "a1b2c3d4-e5f6-7890",
                    "disk_label": "WD-Data",
                    "label": _cfg("sda1").get("label", "sda1"),
                    "configured_mount": _cfg("sda1").get("mount_point", ""),
                    "auto_mount": _cfg("sda1").get("auto_mount", False),
                },
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
            "partitions": [
                {
                    "name": "sdb1",
                    "path": "/dev/sdb1",
                    "size_bytes": 500107862016,
                    "fstype": "ext4",
                    "mountpoint": _cfg("sdb1").get("mount_point") or None,
                    "uuid": "f1e2d3c4-b5a6-7890",
                    "disk_label": "Samsung-SSD",
                    "label": _cfg("sdb1").get("label", "sdb1"),
                    "configured_mount": _cfg("sdb1").get("mount_point", ""),
                    "auto_mount": _cfg("sdb1").get("auto_mount", False),
                },
                {
                    "name": "sdb2",
                    "path": "/dev/sdb2",
                    "size_bytes": 1500291071488,
                    "fstype": "ext4",
                    "mountpoint": _cfg("sdb2").get("mount_point") or None,
                    "uuid": "d4c3b2a1-6789-0123",
                    "disk_label": "Samsung-Data",
                    "label": _cfg("sdb2").get("label", "sdb2"),
                    "configured_mount": _cfg("sdb2").get("mount_point", ""),
                    "auto_mount": _cfg("sdb2").get("auto_mount", False),
                },
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
            "partitions": [
                {
                    "name": "sdc",
                    "path": "/dev/sdc",
                    "size_bytes": 4000787030016,
                    "fstype": None,
                    "mountpoint": None,
                    "uuid": None,
                    "disk_label": None,
                    "label": _cfg("sdc").get("label", "sdc"),
                    "configured_mount": _cfg("sdc").get("mount_point", ""),
                    "auto_mount": False,
                },
            ],
        },
    ]
