#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  nasOS OTA Apply Script
#  Launched via `sudo systemd-run` so it lives in its OWN transient
#  systemd cgroup (nasos-apply-update.service), completely separate
#  from nasos-backend.service.  This means calling
#  `systemctl restart nasos-backend` does NOT kill this script.
#
#  Usage: apply-update.sh <package_path>
#
#  Progress is written to $PROGRESS_FILE as JSON so the backend
#  can serve it while this script (and the backend) restarts.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

# ── Mount-namespace escape ───────────────────────────────────────────────────
# When the backend lacks the systemd-run sudoers rule (old devices), apply_update()
# falls back to `sudo apply-update.sh` which inherits the backend's mount namespace.
# If ProtectSystem= is active, /etc appears read-only and service-file deployments,
# sudoers writes, and cmdline.txt edits all fail silently.
# Detect this and re-exec inside PID 1's (init) mount namespace.
if [ "$(readlink /proc/self/ns/mnt 2>/dev/null)" != "$(readlink /proc/1/ns/mnt 2>/dev/null)" ]; then
  exec nsenter -t 1 -m -- "$0" "$@"
fi

PACKAGE="${1:-}"
if [[ -z "$PACKAGE" || ! -f "$PACKAGE" ]]; then
  echo "Usage: apply-update.sh <package.nasos>" >&2
  exit 1
fi

NASOS_DIR="/opt/nasos"
STAGING_DIR="$NASOS_DIR/data/update-staging"
PROGRESS_FILE="$STAGING_DIR/progress.json"
ROLLBACK_DIR="$STAGING_DIR/rollback"
EXTRACT_DIR="$STAGING_DIR/extract"
LOG_FILE="$STAGING_DIR/apply.log"

mkdir -p "$STAGING_DIR"
exec >> "$LOG_FILE" 2>&1
echo "=== OTA Apply started at $(date -Iseconds) ==="

# ── Space recovery: clear the old rollback snapshot first ────────
# The rollback is always replaced during Phase 2, so deleting the old one
# before the pre-flight check cannot cause any loss of recovery capability.
# On a 6 GB root this is rarely needed; on a 3 GB root it may be the
# difference between passing and failing the disk-space gate.
if [[ -d "$ROLLBACK_DIR" ]]; then
  ROLLBACK_SIZE=$(du -sm "$ROLLBACK_DIR" 2>/dev/null | cut -f1 || echo "?")
  rm -rf "$ROLLBACK_DIR"
  echo "  pre-flight: cleared old rollback snapshot (${ROLLBACK_SIZE} MB freed)"
fi

# Clear pip's HTTP cache — it lives under root's home dir and can grow to
# 100+ MB after repeated installs.  It is rebuilt on demand; losing it is safe.
PIP_CACHE="${HOME:-/root}/.cache/pip"
if [[ -d "$PIP_CACHE" ]]; then
  PIP_CACHE_MB=$(du -sm "$PIP_CACHE" 2>/dev/null | cut -f1 || echo "?")
  rm -rf "$PIP_CACHE"
  echo "  pre-flight: cleared pip cache (${PIP_CACHE_MB} MB freed)"
fi

# ── Pre-flight: disk space check ─────────────────────────────────
# After clearing the rollback and pip cache above, the OTA still needs:
# ~50 MB for the package extract, ~50 MB for the new rollback snapshot,
# ~100 MB for pip install temp files, plus headroom for normal writes.
FREE_MB=$(df --output=avail "$NASOS_DIR" 2>/dev/null | tail -1 | awk '{print int($1/1024)}')
echo "  disk: ${FREE_MB:-unknown} MB available on $(df --output=target "$NASOS_DIR" 2>/dev/null | tail -1)"
if [[ -n "$FREE_MB" && "$FREE_MB" -lt 150 ]]; then
  fail "Insufficient disk space: ${FREE_MB} MB free, need at least 150 MB. Run: sudo journalctl --vacuum-size=50M && sudo rm -rf /var/lib/docker/tmp"
fi

# ── Helpers ───────────────────────────────────────────────────────
progress() {
  local phase="$1" pct="$2" msg="$3" status="${4:-running}"
  printf '{"phase":"%s","percent":%d,"message":"%s","status":"%s","timestamp":"%s"}\n' \
    "$phase" "$pct" "$msg" "$status" "$(date -Iseconds)" \
    > "$PROGRESS_FILE"
  echo "[$phase $pct%] $msg"
}

fail() {
  progress "error" 0 "$1" "error"
  echo "FATAL: $1" >&2
  exit 1
}

# Safety net: if we receive SIGTERM (either because we are in the backend's
# cgroup on an older device and get killed when nasos-backend.service restarts,
# OR because systemd sends SIGTERM during the reboot sequence we requested)
# write 'complete' and clean up before exiting.  The new code is already on
# disk; the backend will come back up with the new version.  Removing
# $PACKAGE ensures the upload drop zone (not the 'Apply Update' button)
# is shown when the UI reconnects.
trap 'progress "complete" 100 "Update applied — system is restarting" "complete"; rm -f "$PACKAGE"; rm -rf "$EXTRACT_DIR"; exit 0' TERM INT

# ── Phase 1: Validate ─────────────────────────────────────────────
progress "validating" 2 "Validating package..."

rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$PACKAGE" -C "$EXTRACT_DIR" 2>/dev/null \
  || fail "Failed to extract package"

MANIFEST="$EXTRACT_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || fail "Invalid package: missing manifest.json"

# Parse manifest fields using python3 (available on Pi)
VERSION=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['version'])" "$MANIFEST") \
  || fail "Could not read version from manifest"
COMPONENTS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(' '.join(d['components']))" "$MANIFEST") \
  || fail "Could not read components from manifest"
RESTART_ELECTRON=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(str(d.get('restart_electron',False)).lower())" "$MANIFEST")
PACKAGES=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(' '.join(d.get('packages',[])))" "$MANIFEST" 2>/dev/null || echo "")

progress "validating" 10 "Package v$VERSION validated (components: $COMPONENTS)"
echo "Components: $COMPONENTS"
echo "Restart electron: $RESTART_ELECTRON"
echo "Packages: ${PACKAGES:-none}"

# ── Phase 1b: Install system packages ─────────────────────────────
# If the manifest lists apt packages, install any that are missing.
# Runs before backup/deploy so that new backend code can depend on them.
if [[ -n "$PACKAGES" ]]; then
  MISSING=""
  for pkg in $PACKAGES; do
    if ! dpkg -s "$pkg" &>/dev/null; then
      MISSING="$MISSING $pkg"
    fi
  done
  MISSING="${MISSING# }"
  if [[ -n "$MISSING" ]]; then
    progress "installing" 12 "Installing system packages: $MISSING..."
    apt-get update -y -qq 2>&1 | tail -3
    apt-get install -y --no-install-recommends $MISSING 2>&1 | tail -5
    echo "  packages: installed $MISSING"
  else
    echo "  packages: all already installed ($PACKAGES)"
  fi
fi

# ── Phase 2: Backup current install ──────────────────────────────
progress "backing_up" 15 "Backing up current installation..."

rm -rf "$ROLLBACK_DIR"
mkdir -p "$ROLLBACK_DIR"

for component in $COMPONENTS; do
  src=""
  case "$component" in
    frontend) src="$NASOS_DIR/frontend/dist" ;;
    backend)  src="$NASOS_DIR/backend" ;;
    electron) src="$NASOS_DIR/electron" ;;
    scripts)  src="$NASOS_DIR/scripts" ;;
  esac
  if [[ -n "$src" && -e "$src" ]]; then
    if [[ "$component" == "electron" ]]; then
      # CRITICAL: Exclude node_modules from electron backup.
      # Electron's node_modules is ~200 MB (the electron binary alone is ~150 MB).
      # On the 3 GB root partition this exhausts free space, causing every service
      # (Samba, backend, electron itself) to fail after reboot because they cannot
      # create PID files, temp files, or GPU caches on the full filesystem.
      # On rollback, we reuse the current node_modules or run npm install.
      mkdir -p "$ROLLBACK_DIR/$component"
      rsync -a --exclude 'node_modules' "$src/" "$ROLLBACK_DIR/$component/" 2>/dev/null || true
    else
      cp -r "$src" "$ROLLBACK_DIR/$component" 2>/dev/null || true
    fi
    echo "  Backed up: $component"
  fi
done

# Record what was backed up and its version
CURRENT_VERSION=$(PYTHONPATH="$NASOS_DIR/backend" "$NASOS_DIR/venv/bin/python3" -c \
  "from app.core.config import settings; print(settings.version)" \
  2>/dev/null || echo "unknown")
echo "{\"version\":\"$CURRENT_VERSION\",\"backed_up_at\":\"$(date -Iseconds)\"}" \
  > "$ROLLBACK_DIR/rollback-manifest.json"

progress "backing_up" 30 "Backup complete (previous v$CURRENT_VERSION saved)"

# ── Phase 3: Install components ───────────────────────────────────
# Resolve the UID-1000 username once — Pi Imager may have renamed 'nasos'
OWNER=$(id -nu 1000 2>/dev/null || echo "nasos")
TOTAL_COMPONENTS=$(echo "$COMPONENTS" | wc -w)
DONE=0

for component in $COMPONENTS; do
  PCT=$(( 30 + (DONE * 40 / TOTAL_COMPONENTS) ))
  progress "installing" "$PCT" "Installing: $component..."

  case "$component" in
    frontend)
      rm -rf "$NASOS_DIR/frontend/dist"
      mkdir -p "$NASOS_DIR/frontend"
      # mv is atomic on the same filesystem and uses no extra disk space
      mv "$EXTRACT_DIR/frontend" "$NASOS_DIR/frontend/dist"
      echo "  frontend: $(find "$NASOS_DIR/frontend/dist" -type f | wc -l) files"
      ;;

    backend)
      # Swap source files (keep venv intact)
      rm -rf "$NASOS_DIR/backend"
      mv "$EXTRACT_DIR/backend" "$NASOS_DIR/backend"
      echo "  backend: source replaced"

      # Reinstall python deps if requirements changed.
      # --upgrade-strategy only-if-needed: only upgrade packages that must
      # be upgraded to satisfy the pinned requirement, never blindly upgrade
      # everything.  Using --upgrade (the old flag) could downgrade pinned
      # packages or install incompatible transitive deps.
      progress "installing" "$PCT" "Installing Python dependencies..."
      if [[ -f "$NASOS_DIR/backend/requirements.txt" ]]; then
        PIP_EXIT=0
        "$NASOS_DIR/venv/bin/pip" install \
          -r "$NASOS_DIR/backend/requirements.txt" \
          --quiet \
          --upgrade-strategy only-if-needed 2>&1 | tail -5 || PIP_EXIT=$?
        if [[ "$PIP_EXIT" -ne 0 ]]; then
          echo "WARNING: pip install exited $PIP_EXIT — attempting clean reinstall" >&2
          # Try without quiet so the full error is visible in the log
          "$NASOS_DIR/venv/bin/pip" install \
            -r "$NASOS_DIR/backend/requirements.txt" 2>&1 | tail -10 || true
        fi
      fi

      # Clean pip's download cache — it is rebuilt on demand and can grow to
      # 100+ MB after a few installs, silently eating into OTA headroom.
      rm -rf "${HOME:-/root}/.cache/pip" 2>/dev/null || true

      # Fix ownership: pip ran as root so newly created venv files are root-owned.
      # The backend service starts as $OWNER.  Files in site-packages are world-
      # readable (644/755) so imports work, but fixing ownership prevents surprises
      # if Python ever needs to write .pyc files to the venv.
      chown -R "$OWNER:$OWNER" "$NASOS_DIR/venv" 2>/dev/null || true

      # Smoke-test: verify the new backend code imports cleanly in the updated venv.
      # A broken pip install or incompatible dependency manifests here with a clear
      # error message rather than after reboot when the backend silently refuses to start.
      if ! PYTHONPATH="$NASOS_DIR/backend" "$NASOS_DIR/venv/bin/python3" \
           -c "import app.main" 2>/dev/null; then
        echo "ERROR: Backend import smoke-test failed after pip install." >&2
        echo "  This usually means a package was partially installed or a" >&2
        echo "  transitive dependency conflict exists.  Trying full reinstall..." >&2
        "$NASOS_DIR/venv/bin/pip" install \
          -r "$NASOS_DIR/backend/requirements.txt" 2>&1 | tail -10 || true
        if ! PYTHONPATH="$NASOS_DIR/backend" "$NASOS_DIR/venv/bin/python3" \
             -c "import app.main" 2>/dev/null; then
          echo "FATAL: Backend still cannot import after repair. OTA may leave" >&2
          echo "  backend non-functional. Check $LOG_FILE for details." >&2
        fi
      fi

      echo "  backend: venv updated"
      ;;

    electron)
      NEW_ELECTRON="$EXTRACT_DIR/electron"
      NM_PRESERVED=false
      # Preserve existing node_modules when package.json is unchanged.
      # npm install requires internet access that may not be available on a
      # home LAN — and the npm cache from the image build is not present on
      # the deployed Pi.  Reusing the existing node_modules avoids that
      # dependency entirely; electron binaries almost never change between
      # application-only releases.
      if [[ -d "$NASOS_DIR/electron/node_modules" ]]; then
        OLD_HASH=$(md5sum "$NASOS_DIR/electron/package.json" 2>/dev/null | cut -d' ' -f1 || echo "")
        NEW_HASH=$(md5sum "$NEW_ELECTRON/package.json" 2>/dev/null | cut -d' ' -f1 || echo "new")
        if [[ -n "$OLD_HASH" && "$OLD_HASH" == "$NEW_HASH" ]]; then
          # Move node_modules into the extract dir so they survive the rm below
          mv "$NASOS_DIR/electron/node_modules" "$NEW_ELECTRON/node_modules"
          NM_PRESERVED=true
          echo "  electron: node_modules preserved (package.json unchanged)"
        fi
      fi
      rm -rf "$NASOS_DIR/electron"
      # mv is atomic on the same filesystem — avoids disk space exhaustion
      # that caused cp -r to silently half-copy and leave a broken install
      mv "$NEW_ELECTRON" "$NASOS_DIR/electron"
      if [[ "$NM_PRESERVED" == false ]]; then
        # package.json changed or first install — npm install required.
        progress "installing" "$PCT" "Installing Node.js dependencies..."
        cd "$NASOS_DIR/electron"
        npm install --omit=dev --prefer-offline --silent 2>&1 | tail -3 \
          || echo "WARNING: npm install failed — electron may not launch correctly" >&2
      fi
      # Verify the electron binary exists — catch silent failures early
      ELECTRON_BIN="$NASOS_DIR/electron/node_modules/.bin/electron"
      if [[ ! -x "$ELECTRON_BIN" ]]; then
        echo "ERROR: electron binary missing at $ELECTRON_BIN — display will not start" >&2
      fi
      echo "  electron: updated"
      ;;

    scripts)
      # Use rsync --delete so scripts removed in new releases are cleaned up
      # on the device rather than accumulating stale files.
      rsync -a --delete "$EXTRACT_DIR/scripts/" "$NASOS_DIR/scripts/"
      chmod +x "$NASOS_DIR/scripts/"*.sh
      echo "  scripts: updated"

      # ── Helper: run a command in PID 1's mount namespace if needed ────
      # When this script runs inside a restricted mount namespace (ProtectSystem),
      # /etc writes fail silently.  _ns wraps commands to escape via nsenter.
      # If the top-level nsenter escape already ran, this is a harmless no-op.
      _in_restricted_ns=false
      if [ "$(readlink /proc/self/ns/mnt 2>/dev/null)" != "$(readlink /proc/1/ns/mnt 2>/dev/null)" ]; then
        _in_restricted_ns=true
      fi
      _ns() {
        if $_in_restricted_ns && command -v nsenter &>/dev/null; then
          nsenter -t 1 -m -- "$@"
        else
          "$@"
        fi
      }

      # Update systemd service files if bundled with this OTA package.
      # Copies to /etc/systemd/system/ then daemon-reloads so the new unit
      # definitions are active before the reboot at the end of this script.
      if [[ -d "$EXTRACT_DIR/systemd" ]]; then
        _ns cp "$EXTRACT_DIR/systemd/"*.service /etc/systemd/system/ 2>/dev/null || true

        # ── CRITICAL: Re-apply Pi Imager user-rename patch ──────────────
        # first-boot.sh patches User=nasos → User=$OWNER once at initial
        # setup. OTA just overwrote those service files with the unpatched
        # versions from the package, so we must repeat the patch NOW or the
        # next boot will fail to start nasos-backend and nasos-electron
        # (systemd: "No such user: nasos") which causes the display to stay
        # frozen on the last boot message and the API to be unreachable.
        if [[ "$OWNER" != "nasos" ]]; then
          for _SVC in nasos-backend.service nasos-electron.service; do
            _SVC_PATH="/etc/systemd/system/$_SVC"
            [[ -f "$_SVC_PATH" ]] || continue
            _ns sed -i "s/User=nasos/User=$OWNER/g"   "$_SVC_PATH"
            _ns sed -i "s/Group=nasos/Group=$OWNER/g" "$_SVC_PATH"
          done
          # electron ExecStartPre looks up 'nasos' by name for XDG_RUNTIME_DIR
          _ns sed -i "s/id -u nasos/id -u $OWNER/g" \
            /etc/systemd/system/nasos-electron.service 2>/dev/null || true
          # autologin drop-in (set by first-boot; also gets replaced by OTA)
          _AUTOLOGIN="/etc/systemd/system/getty@tty1.service.d/autologin.conf"
          [[ -f "$_AUTOLOGIN" ]] && \
            _ns sed -i "s/autologin nasos/autologin $OWNER/g" "$_AUTOLOGIN" || true
          echo "  scripts: systemd units re-patched for renamed user '$OWNER'"
        fi

        _ns systemctl daemon-reload 2>/dev/null || true
        echo "  scripts: systemd units updated + daemon-reload done"
      fi

      # Deploy systemd drop-ins (e.g. docker.service.d/nasos-data-partition.conf).
      # These live in /etc/systemd/system/<unit>.d/ and override individual directives
      # without replacing the full unit file shipped by the distro package.
      if [[ -d "$EXTRACT_DIR/systemd-dropin" ]]; then
        for _DROPIN_DIR in "$EXTRACT_DIR/systemd-dropin/"*/; do
          _UNIT=$(basename "$_DROPIN_DIR")
          _ns mkdir -p "/etc/systemd/system/$_UNIT" 2>/dev/null || true
          _ns cp "$_DROPIN_DIR"*.conf "/etc/systemd/system/$_UNIT/" 2>/dev/null || true
          echo "  scripts: deployed systemd drop-in: $_UNIT"
        done
        _ns systemctl daemon-reload 2>/dev/null || true
      fi

      # Deploy system-level config files (Docker daemon.json, journald cap, etc.)
      # from $EXTRACT_DIR/sysconfig/<subsystem>/<file> → /etc/<subsystem>/<file>.
      if [[ -d "$EXTRACT_DIR/sysconfig" ]]; then
        # Docker daemon.json — moves data-root to /srv/nasos/.docker so Docker
        # no longer fills the root partition with image layers.
        if [[ -f "$EXTRACT_DIR/sysconfig/docker/daemon.json" ]]; then
          _ns mkdir -p /etc/docker 2>/dev/null || true
          _ns cp "$EXTRACT_DIR/sysconfig/docker/daemon.json" /etc/docker/daemon.json
          echo "  scripts: deployed /etc/docker/daemon.json (data-root → /srv/nasos/.docker)"

          # Ensure the Docker data dir exists on the data partition.
          # Docker will create it if missing, but creating it now lets us set
          # correct ownership before dockerd runs.  /srv/nasos should already
          # be mounted via fstab at this point.
          if mountpoint -q /srv/nasos 2>/dev/null; then
            mkdir -p /srv/nasos/.docker
            chmod 700 /srv/nasos/.docker
            echo "  scripts: created /srv/nasos/.docker"

            # ── Migrate existing /var/lib/docker to the data partition ────────
            # If /var/lib/docker exists and has content (i.e. Docker previously ran
            # with the old default data-root), move it now so user containers and
            # images are preserved across the OTA.
            # We only migrate when /srv/nasos/.docker is empty (first time this OTA
            # runs) to avoid partial-migration races.
            if [[ -d /var/lib/docker ]] && \
               [[ -n "$(ls -A /var/lib/docker 2>/dev/null)" ]] && \
               [[ -z "$(ls -A /srv/nasos/.docker 2>/dev/null)" ]]; then
              echo "  scripts: migrating /var/lib/docker → /srv/nasos/.docker ..."
              # Stop Docker before moving its live data tree.
              _ns systemctl stop docker 2>/dev/null || true
              if cp -a /var/lib/docker/. /srv/nasos/.docker/; then
                rm -rf /var/lib/docker
                echo "  scripts: Docker data migration complete — root recovered $(du -sm /srv/nasos/.docker 2>/dev/null | cut -f1) MB"
              else
                echo "  WARNING: Docker data migration partially failed — /var/lib/docker left intact" >&2
                rm -rf /srv/nasos/.docker && mkdir -p /srv/nasos/.docker && chmod 700 /srv/nasos/.docker
              fi
            fi
          else
            echo "  WARNING: /srv/nasos not mounted — /srv/nasos/.docker cannot be created yet." >&2
            echo "  Docker will create it automatically on next reboot once fstab is applied." >&2
          fi
        fi

        # journald size cap
        if [[ -d "$EXTRACT_DIR/sysconfig/journald" ]]; then
          _ns mkdir -p /etc/systemd/journald.conf.d 2>/dev/null || true
          _ns cp "$EXTRACT_DIR/sysconfig/journald/"*.conf \
            /etc/systemd/journald.conf.d/ 2>/dev/null || true
          # Trim existing journals to the new cap immediately — frees space now.
          _ns journalctl --vacuum-size=200M 2>/dev/null || true
          echo "  scripts: deployed journald size cap + vacuumed logs"
        fi
        echo "  scripts: sysconfig deployed"
      fi

      # Remove the 'overlay' (read-only root) kernel parameter from cmdline.txt.
      # Overlayfs prevents password changes (chpasswd/usermod fail with
      # 'authentication token manipulation error') and breaks system operations.
      # A writable root is the correct default for a NAS appliance.
      for _CMDLINE in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
        if [[ -f "$_CMDLINE" ]] && grep -qE '\boverlay\b' "$_CMDLINE"; then
          _ns sed -i -E 's/\boverlay\b//g; s/[[:space:]]+/ /g; s/^ //; s/ $//' "$_CMDLINE"
          echo "  scripts: removed 'overlay' from $_CMDLINE — root will be writable after reboot"
        fi
      done

      # Self-repair sudoers — older installs lack the systemd-run rule that
      # gives the apply script its own cgroup.  Add it now so the NEXT OTA
      # is fully cgroup-isolated and doesn't rely on the SIGTERM trap above.
      SUDOERS_FILE=/etc/sudoers.d/nasos-backend
      SDRUN_RULE="$OWNER ALL=(root) NOPASSWD: /usr/bin/systemd-run --unit=nasos-apply-update --description=nasOS OTA apply --collect $NASOS_DIR/scripts/apply-update.sh *"
      if [[ -f "$SUDOERS_FILE" ]] && ! grep -q 'systemd-run.*nasos-apply-update' "$SUDOERS_FILE" 2>/dev/null; then
        _ns bash -c "echo '$SDRUN_RULE' >> '$SUDOERS_FILE' && chmod 440 '$SUDOERS_FILE'"
        echo "  scripts: sudoers updated with systemd-run OTA rule"
      fi
      ;;
  esac

  DONE=$((DONE + 1))
done

chown -R "$OWNER:$OWNER" "$NASOS_DIR/frontend" "$NASOS_DIR/backend" 2>/dev/null || true
[[ -d "$NASOS_DIR/electron" ]] && chown -R "$OWNER:$OWNER" "$NASOS_DIR/electron" 2>/dev/null || true

# Free the extract dir immediately — it's no longer needed and can be 30-50 MB.
# This reclaims space before the electron health check and reboot.
rm -rf "$EXTRACT_DIR"

progress "installing" 73 "All components installed"

# ── Pre-reboot Electron health check ──────────────────────────────
# Verify the Electron install is complete before rebooting.  A partial
# cp -r (from an old apply script) or a failed npm install can leave the
# binary present but support files missing (v8_context_snapshot.bin, icudtl.dat),
# causing a crash loop that shows the mouse for ~1 s then dumps back to TTY.
# This check runs regardless of whether 'electron' was in COMPONENTS.
if [[ -d "$NASOS_DIR/electron" ]]; then
  _ELECTRON_BIN="$NASOS_DIR/electron/node_modules/.bin/electron"
  _ELECTRON_DIST="$NASOS_DIR/electron/node_modules/electron/dist"
  if [[ ! -x "$_ELECTRON_BIN" || ! -f "$_ELECTRON_DIST/electron" || ! -f "$_ELECTRON_DIST/v8_context_snapshot.bin" ]]; then
    progress "installing" 74 "Repairing Electron installation..."
    echo "  electron: install incomplete — attempting npm install repair"
    cd "$NASOS_DIR/electron" && npm install --omit=dev --prefer-offline 2>&1 | tail -5
    chown -R "$OWNER:$OWNER" "$NASOS_DIR/electron" 2>/dev/null || true
    if [[ ! -x "$_ELECTRON_BIN" ]]; then
      echo "  WARNING: Electron repair failed — display may not start after reboot" >&2
    else
      echo "  electron: repair succeeded"
    fi
  fi
fi

progress "installing" 75 "Pre-reboot checks complete"

# ── Write the new version to /opt/nasos/.env ─────────────────────
# nasos-backend.service reads EnvironmentFile=-/opt/nasos/.env so
# NASOS_VERSION is picked up on the first backend start after reboot.
# This is what makes `GET /api/update/status` return the new version.
ENV_FILE="$NASOS_DIR/.env"
touch "$ENV_FILE" 2>/dev/null || true
# Remove any existing NASOS_VERSION line then append the new one
sed -i '/^NASOS_VERSION=/d' "$ENV_FILE" 2>/dev/null || true
echo "NASOS_VERSION=$VERSION" >> "$ENV_FILE"
echo "  version: wrote NASOS_VERSION=$VERSION → $ENV_FILE"

# ── Phase 4: Reboot ──────────────────────────────────────────────
# Signal the UI that a reboot is coming so it shows the countdown banner.
progress "rebooting" 80 "Update installed — rebooting system..." "rebooting"
echo "=== Rebooting at $(date -Iseconds) ==="

# Remove the staged package NOW, before the system goes offline.
# This ensures that when the UI reconnects it sees staged=null and shows
# the upload drop zone rather than the old 'Apply Update' button.
rm -f "$PACKAGE"
rm -rf "$EXTRACT_DIR"

# Give the frontend two poll cycles (~5 s) to pick up the 'rebooting' status
# and render the countdown banner before the connection drops.
sleep 5

# Request a full system reboot.  systemd will send SIGTERM to this script
# during shutdown, which the TERM trap (above) catches: it writes 'complete'
# to the progress file so the UI shows 'Update applied successfully' after
# reconnecting, then exits cleanly.
# Use sudo as a safety net: if this script somehow runs as non-root (e.g. the
# systemd-run cgroup path was used but running as a service user), sudo will
# still succeed because the sudoers rule grants NOPASSWD for systemctl reboot.
sudo /usr/bin/systemctl reboot || /usr/bin/systemctl reboot
