#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  nasOS Cage Session Wrapper
#  Runs INSIDE the cage Wayland session as cage's child process.
#
#  1. Reads /opt/nasos/data/display.json for rotation + connector
#  2. Detects connected output dimensions via wlr-randr
#  3. Applies display rotation via wlr-randr (Wayland-native method)
#  4. Exports display size for Electron, then execs Electron
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

# ── Detect display size and apply rotation via wlr-randr ─────────
export NASOS_DISPLAY_WIDTH=""
export NASOS_DISPLAY_HEIGHT=""

if command -v wlr-randr &>/dev/null; then
  sleep 0.3

  # Capture full wlr-randr output for parsing
  WLR_OUT=$(wlr-randr 2>/dev/null || echo "")

  if [[ -n "$WLR_OUT" ]]; then
    # Auto-detect connector if not set in config
    if [[ -z "$CONNECTOR" ]]; then
      CONNECTOR=$(echo "$WLR_OUT" | head -1 | awk '{print $1}' || echo "")
    fi

    # Extract current mode dimensions from the target connector's output.
    # wlr-randr format:  "  800x480 px, 60.000 Hz (current)"
    CURRENT_MODE=$(echo "$WLR_OUT" | sed -n "/^${CONNECTOR}/,/^[A-Z]/p" \
      | grep -i 'current' | grep -oE '[0-9]+x[0-9]+' | head -1 || echo "")

    if [[ -z "$CURRENT_MODE" ]]; then
      # Fallback: grab first mode from any output
      CURRENT_MODE=$(echo "$WLR_OUT" | grep -oE '[0-9]+x[0-9]+' | head -1 || echo "")
    fi

    if [[ -n "$CURRENT_MODE" ]]; then
      NASOS_DISPLAY_WIDTH=$(echo "$CURRENT_MODE" | cut -dx -f1)
      NASOS_DISPLAY_HEIGHT=$(echo "$CURRENT_MODE" | cut -dx -f2)
      echo "cage-session: detected display ${NASOS_DISPLAY_WIDTH}x${NASOS_DISPLAY_HEIGHT} on ${CONNECTOR}" >&2
    fi

    # Apply rotation
    if [[ -n "$TRANSFORM" && -n "$CONNECTOR" ]]; then
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
fi

exec /opt/nasos/electron/node_modules/.bin/electron \
  /opt/nasos/electron/main.js \
  --no-sandbox \
  --disable-gpu-sandbox \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-features=PaintHolding
