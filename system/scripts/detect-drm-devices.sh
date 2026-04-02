#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Detect DRM display cards for wlroots/Cage.
#
#  Pi 5 has separate /dev/dri/card* nodes for HDMI, DSI, DPI, VEC
#  plus a render-only V3D card.  wlroots auto-probes only the first
#  card it finds (usually HDMI), missing DSI entirely.
#
#  This script:
#  1. Enumerates all cards that have at least one connector in
#     /sys/class/drm (filtering out the render-only V3D card)
#     and writes WLR_DRM_DEVICES to /run/nasos/drm-env.
#  2. Sets WLR_DRM_NO_ATOMIC=1 ONLY when no DSI display is
#     present.  DSI on Pi 5 requires atomic modesetting — the
#     old blanket WLR_DRM_NO_ATOMIC=1 was killing DSI output.
#
#  If no display cards are found the env file is left empty so
#  Cage falls back to its default auto-probing behaviour.
#
#  Called by: nasos-electron.service ExecStartPre (as root)
# ═══════════════════════════════════════════════════════════════

DEVS=""
HAS_DSI=false

for c in /dev/dri/card*; do
  [ -c "$c" ] || continue
  cn=$(basename "$c")

  # Check if this card has any connector directories in sysfs.
  # Render-only cards (V3D) have no connectors, only renderD* nodes.
  has_connector=false
  for s in /sys/class/drm/${cn}-*/status; do
    if [ -f "$s" ]; then
      has_connector=true
      break
    fi
  done

  if $has_connector; then
    DEVS="${DEVS:+${DEVS}:}${c}"
  fi

  # Check for a connected DSI output on this card
  for s in /sys/class/drm/${cn}-DSI-*/status; do
    if [ -f "$s" ] && [ "$(cat "$s" 2>/dev/null)" = "connected" ]; then
      HAS_DSI=true
    fi
  done
done

mkdir -p /run/nasos

# Start with an empty env file
: > /run/nasos/drm-env

if [ -n "$DEVS" ]; then
  echo "WLR_DRM_DEVICES=${DEVS}" >> /run/nasos/drm-env
  echo "detect-drm: WLR_DRM_DEVICES=${DEVS}" >&2
else
  echo "detect-drm: no display cards found, Cage will auto-probe" >&2
fi

if $HAS_DSI; then
  # DSI requires atomic modesetting on Pi 5 — do NOT disable it
  echo "detect-drm: DSI connected — atomic modesetting enabled" >&2
else
  # HDMI-only: disable atomic modesetting (legacy Pi 5 workaround)
  echo "WLR_DRM_NO_ATOMIC=1" >> /run/nasos/drm-env
  echo "detect-drm: no DSI — WLR_DRM_NO_ATOMIC=1" >&2
fi
