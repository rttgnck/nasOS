"""Storage service — Penta SATA HAT config and block device mount management.

Manages:
- dtparam=pciex1 in /boot/firmware/config.txt for the Penta SATA HAT
- Block device discovery (all removable / data disks)
- Mount point creation, fstab entries, and auto-mounting
- Persisted device labels in /opt/nasos/data/sata-mounts.json
- Background auto-mount of newly connected / reconnected drives
"""

import json
import logging
import re
import subprocess
from pathlib import Path

from app.core.config import settings

_log = logging.getLogger(__name__)

_DATA_DIR = settings.data_dir
_MOUNTS_CONFIG = _DATA_DIR / "sata-mounts.json"
_SETUP_SCRIPT = Path("/opt/nasos/scripts/storage-mount.sh")

_CONFIG_TXT_PATHS = [Path("/boot/firmware/config.txt"), Path("/boot/config.txt")]

_EXCLUDED_PREFIXES = ("loop", "ram", "zram")
_OS_MOUNTPOINTS = {"/", "/boot", "/boot/firmware"}


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


def _get_device_uuid(device_path: str) -> str:
    """Look up the UUID of a block device via lsblk."""
    if settings.dev_mode:
        return ""
    try:
        result = subprocess.run(
            ["lsblk", "-n", "-o", "UUID", device_path],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.strip().splitlines():
            val = line.strip()
            if val:
                return val
    except Exception:
        pass
    return ""


def _sanitize_mount_name(name: str) -> str:
    """Convert a disk label or device name into a safe /mnt/ directory name."""
    sanitized = re.sub(r"[^a-zA-Z0-9._-]", "-", name.strip())
    sanitized = re.sub(r"-+", "-", sanitized).strip("-").lower()
    return sanitized or "disk"


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


def _is_os_disk(dev: dict) -> bool:
    """Return True if any partition of *dev* is mounted on an OS path."""
    for child in dev.get("children", []):
        mp = child.get("mountpoint") or ""
        if mp in _OS_MOUNTPOINTS:
            return True
    mp = dev.get("mountpoint") or ""
    return mp in _OS_MOUNTPOINTS


def _lsblk_full() -> dict:
    """Run lsblk and return parsed JSON. Returns empty dict on failure."""
    try:
        result = subprocess.run(
            [
                "lsblk", "-J", "-b", "-o",
                "NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,TRAN,MOUNTPOINT,FSTYPE,UUID,LABEL",
            ],
            capture_output=True, text=True, timeout=10,
        )
        return json.loads(result.stdout)
    except Exception as exc:
        _log.error("lsblk failed: %s", exc)
        return {}


def _cfg_match(mounts_config: dict, part_name: str, part_uuid: str | None) -> dict:
    """Find config entry by device name, or fall back to UUID match."""
    devices = mounts_config.get("devices", {})
    if part_name in devices:
        return devices[part_name]
    if part_uuid:
        for cfg in devices.values():
            if cfg.get("uuid") == part_uuid:
                return cfg
    return {}


def get_block_devices() -> list[dict]:
    """List all data block devices with partitions, enriched with saved mount config.

    Discovers every disk/partition visible via lsblk and excludes the OS disk,
    loop devices, and RAM disks.  Also appends disconnected-but-remembered
    devices from the config so the UI can show them.
    """
    if settings.dev_mode:
        return _get_mock_devices()

    data = _lsblk_full()
    if not data:
        return []

    mounts_config = _read_mounts_config()
    devices: list[dict] = []
    seen_part_names: set[str] = set()
    seen_uuids: set[str] = set()

    for dev in data.get("blockdevices", []):
        if dev.get("type") != "disk":
            continue
        name = dev.get("name", "")
        if any(name.startswith(p) for p in _EXCLUDED_PREFIXES):
            continue
        if _is_os_disk(dev):
            continue

        partitions = []
        for child in dev.get("children", []):
            part_name = child.get("name", "")
            part_uuid = child.get("uuid") or ""
            seen_part_names.add(part_name)
            if part_uuid:
                seen_uuids.add(part_uuid)
            cfg = _cfg_match(mounts_config, part_name, part_uuid)
            partitions.append({
                "name": part_name,
                "path": f"/dev/{part_name}",
                "size_bytes": child.get("size"),
                "fstype": child.get("fstype"),
                "mountpoint": child.get("mountpoint"),
                "uuid": part_uuid,
                "disk_label": child.get("label"),
                "label": cfg.get("label", part_name),
                "configured_mount": cfg.get("mount_point", ""),
                "auto_mount": cfg.get("auto_mount", False),
                "connected": True,
            })

        if not partitions:
            cfg = _cfg_match(mounts_config, name, dev.get("uuid"))
            seen_part_names.add(name)
            if dev.get("uuid"):
                seen_uuids.add(dev["uuid"])
            partitions.append({
                "name": name,
                "path": f"/dev/{name}",
                "size_bytes": dev.get("size"),
                "fstype": dev.get("fstype"),
                "mountpoint": dev.get("mountpoint"),
                "uuid": dev.get("uuid") or "",
                "disk_label": dev.get("label"),
                "label": cfg.get("label", name),
                "configured_mount": cfg.get("mount_point", ""),
                "auto_mount": cfg.get("auto_mount", False),
                "connected": True,
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

    # Append disconnected-but-remembered devices from config
    for dev_name, cfg in mounts_config.get("devices", {}).items():
        cfg_uuid = cfg.get("uuid", "")
        if dev_name in seen_part_names:
            continue
        if cfg_uuid and cfg_uuid in seen_uuids:
            continue
        devices.append({
            "name": dev_name,
            "path": cfg.get("device", f"/dev/{dev_name}"),
            "size_bytes": None,
            "model": "",
            "serial": "",
            "vendor": "",
            "transport": None,
            "partitions": [{
                "name": dev_name,
                "path": cfg.get("device", f"/dev/{dev_name}"),
                "size_bytes": None,
                "fstype": None,
                "mountpoint": None,
                "uuid": cfg_uuid,
                "disk_label": None,
                "label": cfg.get("label", dev_name),
                "configured_mount": cfg.get("mount_point", ""),
                "auto_mount": cfg.get("auto_mount", False),
                "connected": False,
            }],
        })

    return devices


def get_mounted_volumes() -> list[dict]:
    """Return all currently mounted volumes managed by nasOS (under /mnt/).

    Used by the files API to expose mounted disks as browsable roots.
    """
    if settings.dev_mode:
        return _get_mock_mounted_volumes()

    mounts_config = _read_mounts_config()
    volumes: list[dict] = []

    try:
        result = subprocess.run(
            ["lsblk", "-J", "-b", "-o", "NAME,MOUNTPOINT,SIZE,LABEL,FSTYPE"],
            capture_output=True, text=True, timeout=10,
        )
        data = json.loads(result.stdout)
        seen_mounts: set[str] = set()

        def _scan(nodes: list[dict]):
            for node in nodes:
                mp = node.get("mountpoint") or ""
                name = node.get("name", "")
                if mp.startswith("/mnt/") and mp not in seen_mounts:
                    seen_mounts.add(mp)
                    cfg = mounts_config.get("devices", {}).get(name, {})
                    label = cfg.get("label") or node.get("label") or name
                    volumes.append({
                        "name": name,
                        "label": label,
                        "mountpoint": mp,
                        "size_bytes": node.get("size"),
                        "fstype": node.get("fstype"),
                    })
                for child in node.get("children", []):
                    _scan([child])

        _scan(data.get("blockdevices", []))
    except Exception as exc:
        _log.error("Failed to list mounted volumes: %s", exc)

    # Also include configured mounts from JSON that may not be in lsblk
    # (e.g. device was mounted but lsblk doesn't show it under /mnt/)
    for dev_name, cfg in mounts_config.get("devices", {}).items():
        mp = cfg.get("mount_point", "")
        if mp and mp.startswith("/mnt/") and mp not in {v["mountpoint"] for v in volumes}:
            if Path(mp).is_mount():
                volumes.append({
                    "name": dev_name,
                    "label": cfg.get("label", dev_name),
                    "mountpoint": mp,
                    "size_bytes": None,
                    "fstype": None,
                })

    return volumes


def _get_mock_mounted_volumes() -> list[dict]:
    mounts = _read_mounts_config()
    volumes = []
    for name, cfg in mounts.get("devices", {}).items():
        mp = cfg.get("mount_point", "")
        if mp:
            volumes.append({
                "name": name,
                "label": cfg.get("label", name),
                "mountpoint": mp,
                "size_bytes": 500107862016,
                "fstype": "ext4",
            })
    return volumes


# ── Mount / unmount / update ─────────────────────────────────────


def mount_device(device: str, mount_point: str, label: str, auto_mount: bool = True) -> dict:
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
        "auto_mount": auto_mount,
        "uuid": _get_device_uuid(device),
    }
    _write_mounts_config(config)

    return {"status": "ok", "message": f"Mounted {device} at {mount_point}", "mount_point": mount_point}


def unmount_device(device_name: str) -> dict:
    """Unmount a device.  Config is kept with auto_mount=False so the drive
    is remembered if it is reconnected later."""
    config = _read_mounts_config()
    device_cfg = config.get("devices", {}).get(device_name, {})
    mount_point = device_cfg.get("mount_point", "")
    device_path = device_cfg.get("device", f"/dev/{device_name}")

    if not mount_point:
        try:
            result = subprocess.run(
                ["lsblk", "-n", "-o", "MOUNTPOINT", f"/dev/{device_name}"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.strip().splitlines():
                mp = line.strip()
                if mp and mp.startswith("/mnt/"):
                    mount_point = mp
                    break
        except Exception:
            pass

    if not mount_point:
        return {"status": "error", "message": f"No mount point found for {device_name}"}

    ok, msg = _run_script("unmount", mount_point, device_path)
    if not ok:
        return {"status": "error", "message": msg}

    if device_name in config.get("devices", {}):
        config["devices"][device_name]["auto_mount"] = False
        _write_mounts_config(config)

    return {"status": "ok", "message": f"Unmounted {device_name} from {mount_point}"}


def forget_device(device_name: str) -> dict:
    """Completely remove a device from saved config (stops remembering it)."""
    config = _read_mounts_config()
    removed = config.get("devices", {}).pop(device_name, None)
    if not removed:
        return {"status": "error", "message": f"No config for {device_name}"}
    _write_mounts_config(config)
    return {"status": "ok", "message": f"Forgot {device_name}"}


def set_auto_mount(device_name: str, auto_mount: bool) -> dict:
    """Toggle auto_mount on/off for a device."""
    config = _read_mounts_config()
    device_cfg = config.get("devices", {}).get(device_name)

    if not device_cfg:
        return {"status": "error", "message": f"No config found for {device_name}"}

    device_cfg["auto_mount"] = auto_mount
    config["devices"][device_name] = device_cfg
    _write_mounts_config(config)
    return {"status": "ok", "auto_mount": auto_mount}


def update_device(device_name: str, label: str | None, mount_point: str | None) -> dict:
    config = _read_mounts_config()
    device_cfg = config.get("devices", {}).get(device_name)

    if not device_cfg:
        config.setdefault("devices", {})[device_name] = {
            "device": f"/dev/{device_name}",
            "mount_point": mount_point or "",
            "label": label or device_name,
            "auto_mount": True,
            "uuid": _get_device_uuid(f"/dev/{device_name}"),
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
        else:
            ok, msg = _run_script("mount", device_cfg["device"], mount_point)
            if not ok:
                return {"status": "error", "message": msg}

        device_cfg["mount_point"] = mount_point

    config["devices"][device_name] = device_cfg
    _write_mounts_config(config)
    return {"status": "ok", "message": f"Updated {device_name}"}


# ── Background auto-mount scanner ────────────────────────────────


def scan_and_automount() -> list[dict]:
    """Scan for unmounted partitions and auto-mount them.

    - Known devices (matched by UUID) with auto_mount=True → re-mount at
      their saved mount point.  Device path in config is updated if it changed.
    - Brand-new devices with a filesystem → auto-mount at /mnt/<label>,
      added to config with auto_mount=True.
    - Devices with auto_mount=False are left alone.

    Called by the background scanner task every ~15 s and by the boot service.
    In dev mode, simulates mounting by updating config for mock devices.
    """
    if settings.dev_mode:
        return _scan_dev_mode()

    # Let udev finish probing any recently-attached devices
    try:
        subprocess.run(
            ["udevadm", "settle", "--timeout=5"],
            capture_output=True, timeout=8,
        )
    except Exception:
        pass

    data = _lsblk_full()
    if not data:
        return []

    config = _read_mounts_config()

    # UUID → (config_key, config_entry) for reconnect matching
    uuid_map: dict[str, tuple[str, dict]] = {}
    for dev_name, cfg in config.get("devices", {}).items():
        u = cfg.get("uuid")
        if u:
            uuid_map[u] = (dev_name, cfg)

    # Collect currently used mount points to avoid collisions
    used_mounts: set[str] = set()
    for dev in data.get("blockdevices", []):
        for child in dev.get("children", []):
            mp = child.get("mountpoint")
            if mp:
                used_mounts.add(mp)
        if dev.get("mountpoint"):
            used_mounts.add(dev["mountpoint"])
    for cfg in config.get("devices", {}).values():
        mp = cfg.get("mount_point")
        if mp:
            used_mounts.add(mp)

    actions: list[dict] = []
    config_changed = False

    for dev in data.get("blockdevices", []):
        if dev.get("type") != "disk":
            continue
        name = dev.get("name", "")
        if any(name.startswith(p) for p in _EXCLUDED_PREFIXES):
            continue
        if _is_os_disk(dev):
            continue

        parts = dev.get("children", [])
        if not parts:
            parts = [dev]

        for part in parts:
            part_name = part.get("name", "")
            fstype = part.get("fstype")
            mountpoint = part.get("mountpoint")
            part_uuid = part.get("uuid") or ""
            disk_label = part.get("label") or ""
            device_path = f"/dev/{part_name}"

            if not fstype or mountpoint:
                continue

            # Try to match to existing config by UUID then by name
            cfg_key: str | None = None
            cfg_entry: dict | None = None

            if part_uuid and part_uuid in uuid_map:
                cfg_key, cfg_entry = uuid_map[part_uuid]
            elif part_name in config.get("devices", {}):
                cfg_key = part_name
                cfg_entry = config["devices"][part_name]

            if cfg_entry:
                if not cfg_entry.get("auto_mount"):
                    continue

                mount_point = cfg_entry.get("mount_point", "")
                if not mount_point:
                    continue

                # Update device path if it shifted (e.g. sda1 → sdb1)
                if cfg_entry.get("device") != device_path or cfg_key != part_name:
                    cfg_entry["device"] = device_path
                    if cfg_key and cfg_key != part_name:
                        config["devices"].pop(cfg_key, None)
                    config.setdefault("devices", {})[part_name] = cfg_entry
                    config_changed = True

                ok, msg = _run_script("mount", device_path, mount_point)
                if ok:
                    used_mounts.add(mount_point)
                    actions.append({"device": part_name, "mount_point": mount_point, "action": "remounted"})
                    _log.info("Auto-remounted %s at %s", part_name, mount_point)
                else:
                    _log.warning("Auto-remount failed for %s: %s", part_name, msg)
            else:
                # Brand-new device: generate label + mount point, save config
                # immediately so the UI always shows the drive with useful info,
                # then attempt the actual mount.
                label = disk_label or part_name
                mount_name = _sanitize_mount_name(label)
                mount_point = f"/mnt/{mount_name}"

                base = mount_point
                counter = 1
                while mount_point in used_mounts:
                    mount_point = f"{base}-{counter}"
                    counter += 1

                new_entry = {
                    "device": device_path,
                    "mount_point": mount_point,
                    "label": label,
                    "auto_mount": True,
                    "uuid": part_uuid,
                }
                config.setdefault("devices", {})[part_name] = new_entry
                config_changed = True
                used_mounts.add(mount_point)

                ok, msg = _run_script("mount", device_path, mount_point)
                if ok:
                    actions.append({"device": part_name, "mount_point": mount_point, "action": "mounted_new"})
                    _log.info("Auto-mounted new drive %s at %s", part_name, mount_point)
                else:
                    _log.warning("Auto-mount failed for %s (will retry): %s", part_name, msg)
                    actions.append({"device": part_name, "mount_point": mount_point, "action": "mount_failed", "error": msg})

    if config_changed:
        _write_mounts_config(config)

    return actions


def _scan_dev_mode() -> list[dict]:
    """Dev-mode simulation: auto-mount mock devices by updating config."""
    mock_devices = _get_mock_devices()
    config = _read_mounts_config()
    actions: list[dict] = []
    config_changed = False
    used_mounts: set[str] = set()

    for cfg in config.get("devices", {}).values():
        mp = cfg.get("mount_point")
        if mp:
            used_mounts.add(mp)

    for dev in mock_devices:
        for part in dev.get("partitions", []):
            part_name = part.get("name", "")
            fstype = part.get("fstype")
            existing_cfg = config.get("devices", {}).get(part_name, {})

            if not fstype:
                continue
            # Already configured with a mount point → treat as mounted
            if existing_cfg.get("mount_point"):
                continue

            label = part.get("disk_label") or part_name
            mount_name = _sanitize_mount_name(label)
            mount_point = f"/mnt/{mount_name}"

            base = mount_point
            counter = 1
            while mount_point in used_mounts:
                mount_point = f"{base}-{counter}"
                counter += 1

            config.setdefault("devices", {})[part_name] = {
                "device": part.get("path", f"/dev/{part_name}"),
                "mount_point": mount_point,
                "label": label,
                "auto_mount": True,
                "uuid": part.get("uuid", ""),
            }
            config_changed = True
            used_mounts.add(mount_point)
            actions.append({"device": part_name, "mount_point": mount_point, "action": "mounted_new"})

    if config_changed:
        _write_mounts_config(config)

    return actions


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
                    "connected": True,
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
                    "connected": True,
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
                    "connected": True,
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
                    "connected": True,
                },
            ],
        },
    ]
