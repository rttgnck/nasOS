#!/usr/bin/env bash
#
# resize-image.sh — Resize root partition in a pi-gen output image
#
# Runs INSIDE a Docker container (debian:bookworm) with /deploy bind-mounted.
# Called by build.sh after pi-gen finishes:
#
#   docker run --rm --privileged -v "$DEPLOY_DIR":/deploy debian:bookworm \
#     bash /deploy/resize-image.sh 6144
#
set -euo pipefail

ROOT_SIZE_MB="${1:-6144}"

log()  { echo "==> [resize] $*"; }
fail() { echo "FATAL: $*" >&2; exit 1; }

LOOP_DISK=""
LOOP_PART=""
cleanup() {
    [[ -n "$LOOP_PART" ]] && losetup -d "$LOOP_PART" 2>/dev/null || true
    [[ -n "$LOOP_DISK" ]] && losetup -d "$LOOP_DISK" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 0. Install tools (~15 seconds)
# ---------------------------------------------------------------------------
log "Installing partition tools..."
apt-get update -qq > /dev/null 2>&1
apt-get install -y -qq --no-install-recommends \
    fdisk e2fsprogs util-linux zip unzip > /dev/null 2>&1
log "Tools installed."

# ---------------------------------------------------------------------------
# 1. Find and extract the .zip
# ---------------------------------------------------------------------------
ZIP_FILE="$(ls -t /deploy/*.zip 2>/dev/null | head -1)" \
    || fail "No .zip found in /deploy"
log "Found: ${ZIP_FILE}"

WORK="/tmp/resize-work"
mkdir -p "$WORK"
unzip -o "$ZIP_FILE" -d "$WORK"

IMG_FILE="$(ls "$WORK"/*.img 2>/dev/null | head -1)" \
    || fail "No .img found inside zip"
log "Image: ${IMG_FILE}"

# ---------------------------------------------------------------------------
# 2. Read current partition layout
# ---------------------------------------------------------------------------
SECTOR=512

# Parse partition 2 (type 83 Linux) start and end sectors from fdisk
P2_START=""
P2_OLD_END=""
while IFS= read -r line; do
    if echo "$line" | grep -qE "83[[:space:]]+Linux"; then
        P2_START=$(echo "$line" | awk '{for(i=2;i<=NF;i++){if($i~/^[0-9]+$/){print $i; exit}}}')
        P2_OLD_END=$(echo "$line" | awk '{n=0; for(i=2;i<=NF;i++){if($i~/^[0-9]+$/){n++; if(n==2){print $i; exit}}}}')
        break
    fi
done < <(fdisk -l "$IMG_FILE")

[[ -n "$P2_START" ]] || fail "Could not find root partition start sector"
[[ -n "$P2_OLD_END" ]] || fail "Could not find root partition end sector"

CURRENT_SIZE=$(stat --format=%s "$IMG_FILE")
log "Current image: $(( CURRENT_SIZE / 1024 / 1024 )) MB"
log "Root partition: start=${P2_START}, end=${P2_OLD_END} ($(( (P2_OLD_END - P2_START + 1) * SECTOR / 1024 / 1024 )) MB)"

# ---------------------------------------------------------------------------
# 3. Calculate target size and grow the .img file
# ---------------------------------------------------------------------------
ROOT_BYTES=$(( ROOT_SIZE_MB * 1024 * 1024 ))
ROOT_SECTORS=$(( ROOT_BYTES / SECTOR ))
P2_NEW_END=$(( P2_START + ROOT_SECTORS - 1 ))

# Image needs everything up to new partition end + 1 MiB alignment pad
TARGET_BYTES=$(( (P2_NEW_END + 1) * SECTOR + 1024 * 1024 ))

if (( TARGET_BYTES > CURRENT_SIZE )); then
    log "Growing image from $(( CURRENT_SIZE / 1024 / 1024 )) MB to $(( TARGET_BYTES / 1024 / 1024 )) MB..."
    truncate -s "$TARGET_BYTES" "$IMG_FILE"
else
    log "Image already large enough."
fi

# ---------------------------------------------------------------------------
# 4. Resize partition table with sfdisk (preserves disk ID / PARTUUID)
#
#    Whole-disk loop device — no partition scanning needed.
# ---------------------------------------------------------------------------
LOOP_DISK=$(losetup --show -f "$IMG_FILE")
log "Whole-disk loop: ${LOOP_DISK}"

log "Resizing partition 2 → ${ROOT_SIZE_MB} MB (${ROOT_SECTORS} sectors)..."
echo "${P2_START} ${ROOT_SECTORS}" | sfdisk --no-reread "${LOOP_DISK}" -N 2 --force 2>&1

losetup -d "$LOOP_DISK"
LOOP_DISK=""

# ---------------------------------------------------------------------------
# 5. Attach ONLY partition 2 via offset + sizelimit
#
#    This avoids -P / partition scanning, which does not create /dev/loopXpN
#    devices inside Docker containers even with --privileged.
# ---------------------------------------------------------------------------
P2_OFFSET=$(( P2_START * SECTOR ))
P2_SIZELIMIT=$(( ROOT_SECTORS * SECTOR ))

LOOP_PART=$(losetup --show -f -o "$P2_OFFSET" --sizelimit "$P2_SIZELIMIT" "$IMG_FILE")
log "Partition loop: ${LOOP_PART} (offset=${P2_OFFSET}, sizelimit=${P2_SIZELIMIT})"

# ---------------------------------------------------------------------------
# 6. Check and resize ext4 filesystem
# ---------------------------------------------------------------------------
log "Checking filesystem..."
e2fsck -fy "$LOOP_PART" || true

log "Expanding filesystem to fill partition..."
resize2fs "$LOOP_PART"

FS_BLOCKS=$(dumpe2fs -h "$LOOP_PART" 2>/dev/null | awk '/^Block count:/{print $3}')
FS_BSIZE=$(dumpe2fs -h "$LOOP_PART" 2>/dev/null | awk '/^Block size:/{print $3}')
FS_MB=$(( FS_BLOCKS * FS_BSIZE / 1024 / 1024 ))
log "Filesystem is now ${FS_MB} MB"

losetup -d "$LOOP_PART"
LOOP_PART=""

# ---------------------------------------------------------------------------
# 7. Truncate image to exact final size
# ---------------------------------------------------------------------------
FINAL_BYTES=$(( (P2_NEW_END + 1) * SECTOR ))
log "Truncating image to $(( FINAL_BYTES / 1024 / 1024 )) MB"
truncate -s "$FINAL_BYTES" "$IMG_FILE"

# ---------------------------------------------------------------------------
# 8. Repackage zip
# ---------------------------------------------------------------------------
IMG_BASE="$(basename "$IMG_FILE")"
log "Repackaging ${IMG_BASE}..."
(cd "$WORK" && zip -9 "${IMG_BASE%.img}.zip" "$IMG_BASE")
cp "$WORK/${IMG_BASE%.img}.zip" "$ZIP_FILE"

# ---------------------------------------------------------------------------
# 9. Verify
# ---------------------------------------------------------------------------
log "Final partition table:"
fdisk -l "$IMG_FILE"

rm -rf "$WORK"
log "Done! Root partition resized to ${ROOT_SIZE_MB} MB."