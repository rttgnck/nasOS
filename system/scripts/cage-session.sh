#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  nasOS Cage Session Wrapper
#  Runs INSIDE the cage Wayland session as cage's child process.
#
#  1. Reads /opt/nasos/data/display.json for rotation + connector
#  2. Applies display rotation via wlr-randr (Wayland-native method)
#  3. Execs Electron so it becomes cage's child process
#
#  wlr-randr uses the wlr-output-management Wayland protocol to
#  ask the compositor (cage) to set an output transform.  wlroots
#  then automatically adjusts touch/pointer input to match.
#
#  IMPORTANT: wl_output_transform uses counter-clockwise rotation,
#  but our UI and fbcon=rotate use clockwise.  The case statement
#  below maps CW degrees → CCW wlr-randr values:
#    90° CW  → --transform 270  (270° CCW)
#   180°     → --transform 180
#   270° CW  → --transform 90   (90° CCW)
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

CONFIG="/opt/nasos/data/display.json"

ROTATION=0
CONNECTOR=""

if [[ -f "$CONFIG" ]]; then
  ROTATION=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
print(d.get('rotation', 0))
" "$CONFIG" 2>/dev/null || echo 0)
  CONNECTOR=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
print(d.get('connector', ''))
" "$CONFIG" 2>/dev/null || echo "")
fi

case "$ROTATION" in
  90)  TRANSFORM="270" ;;
  180) TRANSFORM="180" ;;
  270) TRANSFORM="90" ;;
  *)   TRANSFORM="" ;;
esac

if [[ -n "$TRANSFORM" ]] && command -v wlr-randr &>/dev/null; then
  if [[ -z "$CONNECTOR" ]]; then
    CONNECTOR=$(wlr-randr 2>/dev/null | head -1 | awk '{print $1}' || echo "")
  fi

  if [[ -n "$CONNECTOR" ]]; then
    echo "cage-session: applying rotation ${ROTATION}° to ${CONNECTOR}" >&2
    for _attempt in 1 2 3; do
      if wlr-randr --output "$CONNECTOR" --transform "$TRANSFORM" 2>/dev/null; then
        echo "cage-session: wlr-randr succeeded (attempt $_attempt)" >&2
        break
      fi
      sleep 0.2
    done
  fi
fi

exec /opt/nasos/electron/node_modules/.bin/electron \
  /opt/nasos/electron/main.js \
  --no-sandbox \
  --disable-gpu-sandbox \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-features=PaintHolding
