#!/bin/bash
# nasOS Stage 04: First Boot Configuration
# Finalizes the image — confirms services are properly enabled and sets boot params.
set -euo pipefail

echo ">>> [04-first-boot] Finalizing first-boot configuration..."

# Double-check that nasos-firstboot.service will run on next boot
# (belt-and-suspenders after stage 02 set up the symlinks)
SYSTEMD_DIR="/etc/systemd/system"
if [ ! -L "$SYSTEMD_DIR/multi-user.target.wants/nasos-firstboot.service" ]; then
  ln -sf "$SYSTEMD_DIR/nasos-firstboot.service" \
    "$SYSTEMD_DIR/multi-user.target.wants/nasos-firstboot.service"
fi

echo ">>> [04-first-boot] Configuring /boot/firmware/cmdline.txt for Pi 5..."

# Pi 5 uses /boot/firmware/ (Bookworm), older Pis use /boot/
CMDLINE_FILE=""
if [ -f /boot/firmware/cmdline.txt ]; then
  CMDLINE_FILE="/boot/firmware/cmdline.txt"
elif [ -f /boot/cmdline.txt ]; then
  CMDLINE_FILE="/boot/cmdline.txt"
fi

if [ -n "$CMDLINE_FILE" ]; then
  # Ensure console settings are present and append nasos-specific params
  CMDLINE=$(cat "$CMDLINE_FILE")

  # Remove any existing 'quiet' or 'splash' to show boot log during development
  CMDLINE=$(echo "$CMDLINE" | sed 's/\bquiet\b//g' | sed 's/\bsplash\b//g')

  # Remove 'resize' and init_resize.sh — nasOS creates a separate data partition
  # instead of expanding the root partition to fill the SD card
  CMDLINE=$(echo "$CMDLINE" | sed 's/\bresize\b//g')
  CMDLINE=$(echo "$CMDLINE" | sed 's|init=/usr/lib/raspi-config/init_resize\.sh||g')

  # Add logo.nologo to suppress Raspberry Pi logo on boot
  if ! echo "$CMDLINE" | grep -q "logo.nologo"; then
    CMDLINE="$CMDLINE logo.nologo"
  fi

  # NOTE: read-only root (overlay) is NOT enabled by default.
  # To enable it, add 'overlay' to cmdline.txt after the system is stable.
  # The nasOS Settings > Advanced panel can toggle this.

  echo "$CMDLINE" | tr -s ' ' > "$CMDLINE_FILE"
  echo "    cmdline.txt updated: $(cat "$CMDLINE_FILE")"
fi

echo ">>> [04-first-boot] Configuring /boot/firmware/config.txt for Pi 5..."

CONFIG_FILE=""
if [ -f /boot/firmware/config.txt ]; then
  CONFIG_FILE="/boot/firmware/config.txt"
elif [ -f /boot/config.txt ]; then
  CONFIG_FILE="/boot/config.txt"
fi

if [ -n "$CONFIG_FILE" ]; then
  # Enable the Pi 5 active cooler / fan control
  if ! grep -q "dtparam=fan_temp" "$CONFIG_FILE"; then
    cat >> "$CONFIG_FILE" <<'PICONFIG'

# nasOS: Fan control for Pi 5 active cooler
dtparam=fan_temp0=60000,fan_temp0_hyst=5000,fan_temp0_speed=75
dtparam=fan_temp1=70000,fan_temp1_hyst=5000,fan_temp1_speed=125
dtparam=fan_temp2=80000,fan_temp2_hyst=2000,fan_temp2_speed=175
dtparam=fan_temp3=85000,fan_temp3_hyst=2000,fan_temp3_speed=250
PICONFIG
  fi
  echo "    config.txt updated."
fi

echo ">>> [04-first-boot] Creating placeholder for first-run flag..."
# The firstboot service checks for absence of this file to know it must run
# This file must NOT exist in the image — first-boot.sh creates it after running
rm -f /opt/nasos/data/.setup-complete

echo ">>> [04-first-boot] Installing WiFi configuration template to boot partition..."
# Determine the boot partition path (Pi 5 Bookworm uses /boot/firmware/)
BOOT_DIR=""
if [ -d /boot/firmware ]; then
  BOOT_DIR="/boot/firmware"
elif [ -d /boot ]; then
  BOOT_DIR="/boot"
fi

if [ -n "$BOOT_DIR" ]; then
  # Copy the template — user edits this file before inserting the SD card
  # to configure WiFi credentials before first boot
  cp /files/wpa_supplicant.conf.template "$BOOT_DIR/"
  echo "    WiFi template installed to $BOOT_DIR/wpa_supplicant.conf.template"
  echo "    IMPORTANT: Edit $BOOT_DIR/wpa_supplicant.conf.template with your WiFi"
  echo "    credentials before booting, then rename to wpa_supplicant.conf"
fi

echo ">>> [04-first-boot] Generating SSH host keys..."
# pi-gen stage2 deletes SSH host keys so each image is unique.
# Since our stage runs AFTER stage2, we regenerate them here so sshd works on first boot.
ssh-keygen -A

echo ">>> [04-first-boot] Image build complete."
echo ">>> Flash nasOS.img to an SD card and boot your Pi 5!"
