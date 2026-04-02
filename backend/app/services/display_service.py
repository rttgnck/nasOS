"""Display configuration service — multi-display management.

Manages /opt/nasos/data/display.json and invokes display-setup.sh for
boot-level config (config.txt, cmdline.txt, touch calibration, and
display overlay management).

Supports multiple connected displays (HDMI + DSI) with per-display
rotation and touch calibration, primary display selection, and
dtoverlay management in config.txt for Raspberry Pi.
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

# Marker comments used in config.txt to delimit the managed block
_OVERLAY_BLOCK_START = "# nasOS display overlays — start"
_OVERLAY_BLOCK_END = "# nasOS display overlays — end"

DSI_OVERLAYS = [
    {"id": "vc4-kms-dsi-7inch", "label": 'Official Raspberry Pi 7" Touch Display'},
    {"id": "vc4-kms-dsi-waveshare-panel,7_9_inch", "label": 'Waveshare 7.9" DSI'},
    {"id": "vc4-kms-dsi-waveshare-panel,8_inch", "label": 'Waveshare 8" DSI'},
    {"id": "vc4-kms-dsi-waveshare-panel,10_1_inch", "label": 'Waveshare 10.1" DSI'},
    {"id": "vc4-kms-dsi-waveshare-panel,11_9_inch", "label": 'Waveshare 11.9" DSI'},
]

HDMI_OVERLAYS = [
    {"id": "vc4-kms-v3d", "label": "KMS V3D (default graphics driver)"},
]


def _default_display_config() -> dict:
    return {"enabled": True, "rotation": 0, "touch_rotation": None}


def _read_config() -> dict:
    """Read and normalize config, migrating from legacy single-display format."""
    if _CONFIG_FILE.exists():
        try:
            raw = json.loads(_CONFIG_FILE.read_text())
        except Exception:
            raw = {}
    else:
        raw = {}

    if "display_configs" in raw:
        return raw

    # Migrate legacy format → multi-display
    connector = raw.get("connector", "")
    rotation = raw.get("rotation", 0)
    touch_rotation = raw.get("touch_rotation")
    display_configs: dict[str, dict] = {}
    if connector:
        display_configs[connector] = {
            "enabled": True,
            "rotation": rotation,
            "touch_rotation": touch_rotation,
        }
    return {
        "primary_connector": connector,
        "display_configs": display_configs,
        "display_overlays": raw.get("display_overlays", []),
        "rotation": rotation,
        "connector": connector,
        "resolution": raw.get("resolution", ""),
        "touch_rotation": touch_rotation,
    }


def _detect_displays() -> list[dict]:
    """Detect connected displays via /sys/class/drm on Linux, mock on dev."""
    if not _is_linux:
        return [
            {
                "name": "card0-DSI-1",
                "connector": "DSI-1",
                "connected": True,
                "resolution": "800x480@60",
                "type": "DSI",
                "modes": ["800x480"],
            },
            {
                "name": "card1-HDMI-A-1",
                "connector": "HDMI-A-1",
                "connected": True,
                "resolution": "1920x1080@60",
                "type": "HDMI",
                "modes": ["1920x1080", "1280x720", "720x480"],
            },
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
            connector = raw_name.split("-", 1)[1] if "-" in raw_name else raw_name

            modes: list[str] = []
            resolution = ""
            modes_file = card / "modes"
            if modes_file.exists():
                modes_text = modes_file.read_text().strip()
                if modes_text:
                    modes = [m.strip() for m in modes_text.split("\n") if m.strip()]
                    if modes:
                        first_mode = modes[0]
                        resolution = (
                            f"{first_mode}@60" if "@" not in first_mode else first_mode
                        )

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
                    "modes": modes,
                }
            )
        except Exception:
            continue

    return displays


def _read_active_overlays_from_config_txt() -> list[str]:
    """Return all dtoverlay values from the nasOS-managed block in config.txt."""
    if not _is_linux:
        return ["vc4-kms-dsi-7inch"]
    for boot_dir in ("/boot/firmware", "/boot"):
        config_txt = Path(boot_dir) / "config.txt"
        if config_txt.exists():
            try:
                lines = config_txt.read_text().splitlines()
                in_block = False
                overlays: list[str] = []
                for line in lines:
                    stripped = line.strip()
                    if stripped == _OVERLAY_BLOCK_START:
                        in_block = True
                        continue
                    if stripped == _OVERLAY_BLOCK_END:
                        in_block = False
                        continue
                    if in_block and stripped.startswith("dtoverlay="):
                        overlays.append(stripped.split("=", 1)[1])
                return overlays
            except Exception:
                return []
    return []


def get_display_info() -> dict:
    """Return current display config, detected displays, and overlay status."""
    config = _read_config()
    displays = _detect_displays()

    primary = config.get("primary_connector", "")
    connected = [d["connector"] for d in displays]
    if not primary or primary not in connected:
        primary = connected[0] if connected else ""

    display_configs: dict[str, dict] = dict(config.get("display_configs", {}))
    for d in displays:
        if d["connector"] not in display_configs:
            display_configs[d["connector"]] = _default_display_config()

    active_overlays = _read_active_overlays_from_config_txt()
    saved_overlays: list[str] = config.get("display_overlays", [])

    return {
        "displays": displays,
        "primary_connector": primary,
        "display_configs": display_configs,
        "display_overlays": saved_overlays,
        "display_overlays_active": active_overlays,
        "dsi_overlays_available": DSI_OVERLAYS,
        "hdmi_overlays_available": HDMI_OVERLAYS,
        # Legacy fields for backward compat
        "rotation": config.get("rotation", 0),
        "connector": config.get("connector", primary),
        "resolution": config.get("resolution", ""),
        "touch_rotation": config.get("touch_rotation"),
    }


def save_display_config(
    *,
    primary_connector: str = "",
    display_configs: dict[str, dict] | None = None,
    display_overlays: list[str] | None = None,
    rotation: int = 0,
    connector: str = "",
    resolution: str = "",
    touch_rotation: int | None = None,
) -> dict:
    """Persist display config and invoke the setup script.

    Accepts either multi-display format (primary_connector + display_configs)
    or legacy single-display format (rotation + connector).  Both are stored
    together so shell scripts can read whichever they support.
    """
    if display_configs is None:
        display_configs = {}
        if connector:
            display_configs[connector] = {
                "enabled": True,
                "rotation": rotation,
                "touch_rotation": touch_rotation,
            }
        primary_connector = primary_connector or connector

    if display_overlays is None:
        display_overlays = []

    primary_cfg = display_configs.get(primary_connector, {})

    config = {
        "primary_connector": primary_connector,
        "display_configs": display_configs,
        "display_overlays": display_overlays,
        # Legacy compat for shell scripts
        "rotation": primary_cfg.get("rotation", rotation),
        "connector": primary_connector,
        "resolution": resolution,
        "touch_rotation": primary_cfg.get("touch_rotation", touch_rotation),
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
