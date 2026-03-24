"""Display configuration service — screen rotation and touch calibration.

Manages /opt/nasos/data/display.json (persisted across reboots) and
invokes display-setup.sh to write the DRM video= rotation parameter
to cmdline.txt, firmware hints to config.txt, and the udev touch rule.
"""

import json
import logging
import platform
import subprocess
from pathlib import Path

_log = logging.getLogger(__name__)
_is_linux = platform.system() == "Linux"

_DATA_DIR = (
    Path("/opt/nasos/data") if _is_linux else Path(__file__).parent.parent.parent / ".data"
)
_CONFIG_FILE = _DATA_DIR / "display.json"
_SETUP_SCRIPT = Path("/opt/nasos/scripts/display-setup.sh")

VALID_ROTATIONS = (0, 90, 180, 270)


def _read_config() -> dict:
    if _CONFIG_FILE.exists():
        try:
            return json.loads(_CONFIG_FILE.read_text())
        except Exception:
            pass
    return {"rotation": 0, "connector": "", "resolution": "", "touch_rotation": None}


def _detect_displays() -> list[dict]:
    """Detect connected displays via /sys/class/drm on Linux, mock on dev."""
    if not _is_linux:
        return [
            {
                "name": "HDMI-A-1",
                "connector": "HDMI-A-1",
                "connected": True,
                "resolution": "1280x800@60",
                "type": "HDMI",
            }
        ]

    displays: list[dict] = []
    drm_dir = Path("/sys/class/drm")
    if not drm_dir.exists():
        return displays

    for card in sorted(drm_dir.iterdir()):
        status_file = card / "status"
        if not status_file.exists():
            continue
        try:
            status = status_file.read_text().strip()
            if status != "connected":
                continue
            raw_name = card.name
            # card1-HDMI-A-1 → HDMI-A-1,  card0-DSI-1 → DSI-1
            connector = raw_name.split("-", 1)[1] if "-" in raw_name else raw_name

            resolution = ""
            modes_file = card / "modes"
            if modes_file.exists():
                first_mode = modes_file.read_text().strip().split("\n")[0].strip()
                if first_mode:
                    resolution = f"{first_mode}@60" if "@" not in first_mode else first_mode

            display_type = (
                "HDMI"
                if "HDMI" in connector
                else "DSI"
                if "DSI" in connector
                else "DP"
                if "DP" in connector
                else "Unknown"
            )
            displays.append(
                {
                    "name": raw_name,
                    "connector": connector,
                    "connected": True,
                    "resolution": resolution,
                    "type": display_type,
                }
            )
        except Exception:
            continue

    return displays


def get_display_info() -> dict:
    """Return current display config and detected displays."""
    config = _read_config()
    displays = _detect_displays()
    return {
        "displays": displays,
        "rotation": config.get("rotation", 0),
        "connector": config.get("connector", ""),
        "resolution": config.get("resolution", ""),
        "touch_rotation": config.get("touch_rotation"),
    }


def save_display_config(
    rotation: int,
    connector: str,
    resolution: str,
    touch_rotation: int | None,
) -> dict:
    """Persist display config and invoke the setup script.

    Returns status dict.  A reboot is required for full effect.
    """
    config = {
        "rotation": rotation,
        "connector": connector,
        "resolution": resolution,
        "touch_rotation": touch_rotation,
    }
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _CONFIG_FILE.write_text(json.dumps(config, indent=2) + "\n")

    if _is_linux and _SETUP_SCRIPT.exists():
        try:
            result = subprocess.run(
                ["/usr/bin/sudo", str(_SETUP_SCRIPT)],
                timeout=10,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                _log.warning(
                    "display-setup.sh exited %d: %s",
                    result.returncode,
                    result.stderr.strip(),
                )
        except Exception as exc:
            _log.warning("display-setup.sh failed: %s", exc)

    return {
        "status": "ok",
        "message": "Display settings saved. Restart the system to apply changes.",
        **config,
    }
