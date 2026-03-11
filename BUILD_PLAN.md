# nasOS — Raspberry Pi NAS Desktop OS Build Plan

## Context

We're building a full NAS operating system for Raspberry Pi 5 — a complete, flashable OS image that boots directly into an interactive desktop environment on a connected display. Think Synology DSM or Ugreen UGOS, but purpose-built for Pi hardware. The desktop is the centerpiece: a fully interactive windowed environment with drag-and-drop file management, window tiling, taskbar, system tray, and all NAS management built in. The same UI is accessible remotely via any web browser.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Base OS | Raspberry Pi OS Lite (Bookworm, 64-bit) via `pi-gen` |
| Backend | Python 3.11+ / FastAPI + uvicorn |
| Frontend | React 18 + TypeScript |
| Local Display | Electron (auto-launches on boot via cage/wlroots compositor) |
| Remote Access | Same React UI served over HTTPS via FastAPI |
| Real-time | WebSocket (FastAPI WebSocket + React) |
| Database | SQLite (config/metadata) |
| Process Mgmt | systemd |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Pi 5 Hardware                      │
├─────────────────────────────────────────────────────┤
│  Raspberry Pi OS Lite (read-only root, overlayfs)   │
├──────────────────┬──────────────────────────────────┤
│   System Services│       nasOS Backend (FastAPI)     │
│   ┌────────────┐ │  ┌──────────────────────────┐    │
│   │ samba      │ │  │ REST API + WebSocket      │    │
│   │ nfs-server │ │  │ ├─ storage management     │    │
│   │ avahi      │ │  │ ├─ user/group management  │    │
│   │ docker     │ │  │ ├─ service control        │    │
│   │ smartd     │ │  │ ├─ network config         │    │
│   │ nut (UPS)  │ │  │ ├─ docker management      │    │
│   │ fail2ban   │ │  │ ├─ backup/sync engine     │    │
│   │ wireguard  │ │  │ ├─ notification system    │    │
│   │ certbot    │ │  │ └─ update manager         │    │
│   └────────────┘ │  └──────────┬───────────────┘    │
│                  │             │                     │
├──────────────────┴─────────────┴────────────────────┤
│              nasOS Desktop UI (React + TS)           │
│  ┌─────────────────────────────────────────────┐    │
│  │  Window Manager (custom JS engine)          │    │
│  │  ├─ File Manager (dual-pane, drag & drop)   │    │
│  │  ├─ Storage Manager                         │    │
│  │  ├─ User Manager                            │    │
│  │  ├─ Docker/App Store                        │    │
│  │  ├─ Network Settings                        │    │
│  │  ├─ System Monitor                          │    │
│  │  ├─ Backup Manager                          │    │
│  │  ├─ Log Viewer                              │    │
│  │  └─ Settings / Control Panel                │    │
│  ├─────────────────────────────────────────────┤    │
│  │  Taskbar │ System Tray │ Notifications      │    │
│  └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│  Electron Shell (local display, auto-start on boot) │
│  Browser (remote access via HTTPS on any device)    │
└─────────────────────────────────────────────────────┘
```

---

## Project Structure

```
nasOS/
├── image-builder/                 # pi-gen fork/config for building .img
│   ├── stage-nasos/               # custom pi-gen stage
│   │   ├── 00-configure-base/     # locale, timezone, hostname
│   │   ├── 01-install-packages/   # apt packages
│   │   ├── 02-configure-services/ # systemd units, default configs
│   │   ├── 03-install-nasos/      # backend + frontend + electron
│   │   └── 04-first-boot/         # first-boot wizard setup
│   └── build.sh
│
├── backend/                       # FastAPI application
│   ├── app/
│   │   ├── main.py                # app entrypoint
│   │   ├── core/
│   │   │   ├── config.py          # app settings
│   │   │   ├── security.py        # auth, JWT, 2FA
│   │   │   └── database.py        # SQLite connection
│   │   ├── api/
│   │   │   ├── auth.py            # login, sessions, 2FA
│   │   │   ├── storage.py         # disks, volumes, RAID, SMART
│   │   │   ├── shares.py          # SMB/NFS/WebDAV share management
│   │   │   ├── users.py           # user/group CRUD
│   │   │   ├── network.py         # IP, DNS, hostname, firewall
│   │   │   ├── services.py        # start/stop/status system services
│   │   │   ├── docker.py          # container management
│   │   │   ├── apps.py            # app store catalog
│   │   │   ├── backup.py          # backup jobs, rclone
│   │   │   ├── notifications.py   # email, push, gotify
│   │   │   ├── system.py          # metrics, temps, logs, power
│   │   │   ├── updates.py         # OS update mechanism
│   │   │   └── files.py           # file browser API (list, move, copy, upload, download)
│   │   ├── services/              # business logic
│   │   │   ├── disk_service.py
│   │   │   ├── samba_service.py
│   │   │   ├── nfs_service.py
│   │   │   ├── docker_service.py
│   │   │   ├── user_service.py
│   │   │   ├── smart_service.py
│   │   │   ├── thermal_service.py
│   │   │   ├── ups_service.py
│   │   │   └── update_service.py
│   │   ├── models/                # SQLAlchemy/Pydantic models
│   │   └── ws/                    # WebSocket handlers
│   │       ├── metrics.py         # real-time CPU/RAM/temp/disk
│   │       ├── transfers.py       # file transfer progress
│   │       └── notifications.py   # push notifications
│   ├── tests/
│   ├── requirements.txt
│   └── pyproject.toml
│
├── frontend/                      # React desktop UI
│   ├── src/
│   │   ├── main.tsx               # React entrypoint
│   │   ├── desktop/
│   │   │   ├── Desktop.tsx        # root desktop surface (wallpaper, icons)
│   │   │   ├── WindowManager.tsx  # window lifecycle, z-ordering, focus
│   │   │   ├── Window.tsx         # draggable, resizable window chrome
│   │   │   ├── Taskbar.tsx        # bottom bar with open windows, clock
│   │   │   ├── SystemTray.tsx     # network, volume, temp indicators
│   │   │   ├── NotificationCenter.tsx
│   │   │   ├── ContextMenu.tsx    # right-click menus
│   │   │   ├── DesktopIcons.tsx   # shortcut icons on desktop surface
│   │   │   └── WindowSnapping.tsx # snap to edges, tiling zones
│   │   ├── apps/                  # "applications" that open in windows
│   │   │   ├── FileManager/
│   │   │   │   ├── FileManager.tsx      # dual-pane file browser
│   │   │   │   ├── FileGrid.tsx         # icon/list view
│   │   │   │   ├── FileTree.tsx         # sidebar tree navigation
│   │   │   │   ├── DragDropLayer.tsx    # cross-window drag & drop
│   │   │   │   ├── FilePreview.tsx      # preview pane (images, text, video)
│   │   │   │   ├── FileOperations.tsx   # copy/move/delete progress
│   │   │   │   └── BreadcrumbNav.tsx
│   │   │   ├── StorageManager/
│   │   │   │   ├── StorageManager.tsx   # disk overview, volumes
│   │   │   │   ├── DiskInfo.tsx         # SMART data, health
│   │   │   │   ├── VolumeCreator.tsx    # create RAID/LVM volumes
│   │   │   │   └── QuotaManager.tsx
│   │   │   ├── ShareManager/
│   │   │   │   ├── ShareManager.tsx     # SMB/NFS share list
│   │   │   │   ├── ShareWizard.tsx      # create/edit share dialog
│   │   │   │   └── PermissionEditor.tsx
│   │   │   ├── UserManager/
│   │   │   │   ├── UserManager.tsx
│   │   │   │   ├── UserEditor.tsx
│   │   │   │   └── GroupEditor.tsx
│   │   │   ├── DockerManager/
│   │   │   │   ├── ContainerList.tsx
│   │   │   │   ├── AppStore.tsx         # one-click app installs
│   │   │   │   ├── ContainerLogs.tsx
│   │   │   │   └── ComposeEditor.tsx
│   │   │   ├── NetworkSettings/
│   │   │   │   ├── NetworkSettings.tsx
│   │   │   │   ├── FirewallRules.tsx
│   │   │   │   └── VpnConfig.tsx
│   │   │   ├── SystemMonitor/
│   │   │   │   ├── SystemMonitor.tsx    # real-time dashboard
│   │   │   │   ├── CpuGraph.tsx
│   │   │   │   ├── MemoryGraph.tsx
│   │   │   │   ├── DiskIOGraph.tsx
│   │   │   │   ├── NetworkGraph.tsx
│   │   │   │   └── TempGauge.tsx        # Pi thermal monitoring
│   │   │   ├── BackupManager/
│   │   │   │   ├── BackupManager.tsx
│   │   │   │   ├── BackupWizard.tsx
│   │   │   │   ├── CloudSync.tsx        # rclone targets
│   │   │   │   └── SnapshotViewer.tsx
│   │   │   ├── LogViewer/
│   │   │   │   └── LogViewer.tsx        # searchable, filterable logs
│   │   │   ├── Settings/
│   │   │   │   ├── Settings.tsx         # control panel
│   │   │   │   ├── GeneralSettings.tsx
│   │   │   │   ├── SecuritySettings.tsx # 2FA, SSL, fail2ban
│   │   │   │   ├── NotificationSettings.tsx
│   │   │   │   ├── PowerSettings.tsx    # UPS, spin-down, shutdown
│   │   │   │   ├── UpdateSettings.tsx
│   │   │   │   └── ThemeSettings.tsx    # wallpaper, colors
│   │   │   └── FirstBootWizard/
│   │   │       ├── FirstBootWizard.tsx  # initial setup flow
│   │   │       ├── StepAdminUser.tsx
│   │   │       ├── StepNetwork.tsx
│   │   │       ├── StepStorage.tsx
│   │   │       └── StepShares.tsx
│   │   ├── hooks/                 # React hooks
│   │   │   ├── useWebSocket.ts    # real-time data
│   │   │   ├── useDragDrop.ts     # cross-window drag & drop
│   │   │   ├── useWindowManager.ts
│   │   │   └── useApi.ts          # API client
│   │   ├── store/                 # state management (zustand)
│   │   │   ├── windowStore.ts     # window positions, z-index, focus
│   │   │   ├── fileStore.ts       # clipboard, selections
│   │   │   └── systemStore.ts     # metrics, notifications
│   │   ├── styles/
│   │   └── utils/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── electron/                      # Electron shell for local display
│   ├── main.ts                    # electron main process
│   ├── preload.ts                 # bridge to system APIs
│   └── package.json
│
├── system/                        # OS-level configuration
│   ├── systemd/
│   │   ├── nasos-backend.service
│   │   ├── nasos-electron.service # auto-start on boot
│   │   ├── nasos-firstboot.service
│   │   └── nasos-watchdog.service
│   ├── configs/
│   │   ├── smb.conf.template
│   │   ├── exports.template       # NFS
│   │   ├── avahi-service.template
│   │   ├── cage-config             # Wayland compositor for Electron
│   │   └── nut/                    # UPS configs
│   ├── scripts/
│   │   ├── first-boot.sh
│   │   ├── readonly-root.sh       # setup overlayfs
│   │   ├── disk-hotplug.sh
│   │   └── update.sh              # OTA update script
│   └── udev/
│       ├── 99-disk-hotplug.rules
│       └── 99-usb-backup.rules
│
├── docs/
├── Makefile
└── README.md
```

---

## Build Phases

### Phase 0: Dev Environment & Tooling
**Goal:** Buildable skeleton that runs on a dev machine (macOS/Linux), no Pi needed yet.

- [ ] Init git repo, monorepo structure
- [ ] `backend/`: FastAPI scaffold with health endpoint, CORS, static file serving
- [ ] `frontend/`: Vite + React + TS scaffold with hot reload
- [ ] `electron/`: Electron shell that loads `http://localhost:5173` (dev) or bundled build (prod)
- [ ] Makefile with `dev`, `build`, `lint`, `test` targets
- [ ] Docker Compose for dev (run backend + frontend together)

### Phase 1: Desktop Shell — The Window Manager
**Goal:** A working desktop environment in the browser/Electron with full window management.

This is the signature feature. Build it first, fill in NAS functionality after.

- [ ] **Desktop surface** — wallpaper, right-click context menu, desktop icons
- [ ] **Window component** — draggable (react-rnd or custom), resizable, title bar with minimize/maximize/close
- [ ] **Window manager state** — zustand store tracking all open windows, z-ordering, focus
- [ ] **Taskbar** — shows open windows (click to focus/minimize), system clock, start/app menu
- [ ] **System tray** — CPU temp, network status, notification bell
- [ ] **Window snapping** — snap to screen edges, half-screen tiling (drag to edge), quarter tiling
- [ ] **Keyboard shortcuts** — Alt+Tab window switching, Alt+F4 close, Super key for app menu
- [ ] **Animations** — minimize/maximize transitions, window open/close

### Phase 2: File Manager — The Core App
**Goal:** Dual-pane file browser with full drag-and-drop, the most-used NAS app.

- [ ] **Backend file API** — `GET /files/list`, `POST /files/copy`, `POST /files/move`, `DELETE /files`, `POST /files/upload`, `GET /files/download`, `GET /files/preview`
- [ ] **File grid/list view** — toggle between icon grid and detailed list, sortable columns
- [ ] **Sidebar tree** — collapsible directory tree navigation
- [ ] **Breadcrumb navigation** — clickable path segments
- [ ] **Multi-select** — click, shift+click, ctrl+click, drag-select rectangle
- [ ] **Drag and drop** — between two File Manager windows, or to/from desktop
- [ ] **Context menus** — right-click for copy, cut, paste, rename, delete, properties, share
- [ ] **File preview** — images, text, video, PDF preview pane
- [ ] **Progress tracking** — copy/move operations with progress bars via WebSocket
- [ ] **Upload/download** — drag files from host OS into the browser/Electron window
- [ ] **Search** — filename search with basic glob/regex support

### Phase 3: Storage Management
**Goal:** Manage physical disks, RAID arrays, and volumes through the UI.

- [ ] **Backend disk API** — enumerate disks (`lsblk`), SMART data (`smartctl`), format, mount/unmount
- [ ] **Volume management** — create/delete ext4/btrfs/xfs volumes, LVM thin provisioning
- [ ] **Software RAID** — mdadm create/manage/monitor RAID 0/1/5/6
- [ ] **Storage pool visualization** — graphical disk usage, health status indicators
- [ ] **SMART monitoring service** — background daemon, alert on degradation
- [ ] **Disk hot-plug** — udev rules to detect USB/SATA disk attach/detach, notify UI via WebSocket
- [ ] **Disk spin-down** — hdparm idle timers, configurable per-disk
- [ ] **Quota management** — per-user/group quotas on volumes

### Phase 4: File Sharing Protocols
**Goal:** Full SMB/NFS/WebDAV share management through the desktop UI.

- [ ] **Share manager app** — list all shares, protocol badges (SMB/NFS/WebDAV)
- [ ] **Share wizard** — step-by-step: pick folder > name share > choose protocol(s) > set permissions
- [ ] **Samba service** — generate/reload `smb.conf`, manage `smbpasswd` users
- [ ] **NFS service** — generate/reload `/etc/exports`, manage allowed hosts/networks
- [ ] **WebDAV** — nginx + webdav module, per-share auth
- [ ] **AFP / Time Machine** — samba `vfs_fruit` for macOS Time Machine backup targets
- [ ] **FTP/SFTP** — vsftpd config, SFTP via OpenSSH subsystem
- [ ] **Permission editor** — per-share user/group read/write/no-access matrix
- [ ] **ACL support** — setfacl/getfacl management through UI

### Phase 5: User & Network Management
**Goal:** Manage system users, groups, and network configuration.

- [ ] **User manager app** — create/edit/delete users, assign groups, set quotas
- [ ] **Group management** — create groups, assign users, map to share permissions
- [ ] **Samba user sync** — auto-sync system users to samba password database
- [ ] **Network settings app** — static IP / DHCP toggle, DNS servers, hostname
- [ ] **Firewall management** — nftables/ufw rules editor, port opening
- [ ] **VPN config** — WireGuard setup wizard (generate keys, peer config, QR code)
- [ ] **DDNS** — configure dynamic DNS providers (DuckDNS, No-IP, Cloudflare)

### Phase 6: System Monitoring & Notifications
**Goal:** Real-time system health dashboard with alerting.

- [ ] **System monitor app** — real-time graphs for CPU, RAM, disk I/O, network throughput
- [ ] **Temperature gauge** — Pi CPU/GPU temp with throttle warning threshold
- [ ] **WebSocket metrics stream** — backend pushes system stats every 1-2 seconds
- [ ] **SMART dashboard** — disk health overview, historical trends
- [ ] **Notification system** — email (msmtp), push (ntfy/gotify), in-app notification center
- [ ] **Alert rules** — configurable thresholds (temp > 80C, disk > 90% full, SMART warning)
- [ ] **Log viewer app** — journalctl wrapper, searchable/filterable, auto-refresh

### Phase 7: Docker & App Store
**Goal:** Container management and one-click app installs, like DSM Package Center.

- [ ] **Docker manager app** — list containers (running/stopped), start/stop/restart/remove
- [ ] **Container logs** — real-time log streaming via WebSocket
- [ ] **App store** — curated catalog of docker-compose templates:
  - Media: Plex, Jellyfin, Emby
  - Photos: Immich, Photoprism
  - Cloud: Nextcloud, Seafile
  - Download: Transmission, qBittorrent, SABnzbd
  - DNS: Pi-hole, AdGuard Home
  - Home: Home Assistant
  - Dev: Gitea, code-server
  - Monitoring: Grafana, Uptime Kuma
- [ ] **One-click install** — select app, configure ports/volumes, deploy
- [ ] **Compose editor** — advanced users can edit docker-compose.yml directly
- [ ] **Resource limits** — set CPU/RAM limits per container (important on Pi 5)

### Phase 8: Backup & Cloud Sync
**Goal:** Scheduled backups, snapshots, and cloud sync via rclone.

- [ ] **Backup manager app** — list backup jobs, last run status, next scheduled run
- [ ] **Backup wizard** — source > destination > schedule > retention policy
- [ ] **Rsync engine** — local and remote rsync-based backup with progress
- [ ] **Btrfs snapshots** — create/list/restore/delete snapshots (if btrfs volume)
- [ ] **USB one-touch backup** — udev rule: plug in marked USB drive, auto-run backup job
- [ ] **Cloud sync (rclone)** — configure remotes: S3, Backblaze B2, Google Drive, OneDrive, Dropbox
- [ ] **Restore wizard** — browse backup history, restore individual files or full volumes

### Phase 9: Security & Hardening — COMPLETE
**Goal:** Production-grade security for an always-on network appliance.

- [x] **HTTPS/TLS config** — TLS status, cert type, auto-renewal display
- [x] **2FA/TOTP** — TOTP status in security overview
- [x] **Fail2ban** — jail config display (sshd/nasos-web/samba), ban counts
- [x] **Firewall rules** — rule table with allow/deny, default policy display
- [x] **SSH hardening** — config display (key-only, root login, port, sessions)
- [x] **Security Score** — composite score (0-100) with colored ring + issue list
- [x] **Thermal management** — CPU/GPU temps, throttle flags, fan modes (quiet/balanced/performance)
- [x] **UPS/NUT** — battery/load gauges, runtime, voltage, shutdown policy
- [x] **OTA Updates** — version comparison, A/B partitions, changelog, rollback
- [x] **Avahi/mDNS** — published services, discovered devices
- [x] **Time Machine** — share config, quota bar, connected Macs list

**Backend files created:**
- `backend/app/services/security_service.py`
- `backend/app/services/system_extras_service.py`
- `backend/app/api/security.py`
- `backend/app/api/extras.py`

**Frontend:** Settings.tsx expanded from 3 tabs to 9 tabs with sidebar grouping

---

## The 9 Expanded "Commonly Missed" Items

These are woven into the phases above but here's the expanded detail on each:

### 1. Avahi/mDNS (Phase 5)
- Install and configure `avahi-daemon` so the NAS appears as `nasos.local` on the network
- Publish service records: `_smb._tcp`, `_nfs._tcp`, `_http._tcp`, `_device-info._tcp`
- Custom service XML files in `/etc/avahi/services/`
- Show discovered name in the System Tray and Network Settings UI
- Test with `avahi-browse -a` and verify macOS Finder / Windows Network discovery

### 2. ACLs (Phase 4)
- Install `acl` package, ensure filesystems mounted with `acl` option
- Backend wraps `setfacl`/`getfacl` for per-user/group permissions beyond basic rwx
- Permission Editor UI: matrix view — rows are users/groups, columns are read/write/execute/deny
- Inherit ACLs on new files/folders (default ACLs)
- Visual indicator when a file/folder has extended ACLs beyond basic permissions

### 3. macOS Time Machine Support (Phase 4)
- Samba `vfs_fruit` + `vfs_catia` + `vfs_streams_xattr` modules
- Dedicated Time Machine share type in Share Wizard with Apple-specific attributes
- Advertise via Avahi as `_adisk._tcp` and `_timemachine._tcp`
- Quota enforcement on Time Machine shares to prevent disk fill
- Test with macOS System Settings > Time Machine > Add Backup Disk — NAS should appear automatically

### 4. SMART Monitoring (Phase 3 & 6)
- `smartmontools` installed, `smartd` daemon running
- Short self-test weekly, long self-test monthly (configurable)
- Backend polls SMART attributes: Reallocated Sectors, Current Pending, Uncorrectable, Temperature
- Health score calculation (Good / Warning / Critical) per disk
- Historical SMART data stored in SQLite, graphed in Storage Manager
- Alert triggers: email/push when any disk enters Warning or Critical state
- Pre-failure prediction: alert when attributes cross manufacturer thresholds

### 5. UPS Support via NUT (Phase 6)
- `nut` (Network UPS Tools) package installed
- UPS Setup Wizard in Settings: auto-detect USB-connected UPS, configure driver
- Dashboard widget: battery %, load, estimated runtime, line voltage
- Configurable actions: on battery > X minutes → graceful shutdown
- Low battery auto-shutdown with safe disk unmount sequence
- UPS event log in System Monitor
- Support for networked UPS (NUT client mode for multiple Pi's sharing one UPS)

### 6. Read-Only Root Filesystem (Phase 0 / Image Builder)
- Root partition mounted read-only with `overlayfs` for runtime writes
- `/var`, `/tmp`, `/run` on tmpfs
- Persistent data partition on attached storage (not SD card)
- Config changes written to persistent overlay, survive reboots
- "Commit changes" action in Settings to bake overlay into base (for system updates)
- SD card wear indicator in System Monitor: estimate writes remaining
- Recovery mode: boot with clean overlay if system is corrupted

### 7. Thermal Management (Phase 6)
- Pi 5 CPU/GPU temperature read via `/sys/class/thermal/`
- Real-time temperature gauge in System Tray (always visible)
- Color coding: green (< 60C), yellow (60-75C), red (> 75C)
- Throttle detection: read `vcgencmd get_throttled`, alert if thermal throttling active
- Fan control: Pi 5 active cooler PWM control via `pinctrl` / device tree
- Configurable fan curves in Settings (quiet/balanced/performance)
- Temperature history graph in System Monitor (last 24h, 7d, 30d)
- Alert + notification when sustained high temp detected

### 8. OTA Update Mechanism (Phase 9)
- **A/B partition scheme**: two root partitions, update writes to inactive, swap on reboot
- Fallback: if new partition fails to boot 3 times, auto-revert to previous
- Update server: hosted repository with signed update packages
- Update check: daily poll for new versions (configurable)
- Update flow in UI: check > download > verify signature > install > reboot
- Backend, frontend, system configs all versioned and updated together
- Changelog display before applying update
- Manual update: upload `.nasos-update` file via UI for offline/air-gapped installs
- Rollback button in Settings to revert to previous version

### 9. HTTPS / Let's Encrypt (Phase 9)
- `caddy` or `nginx` reverse proxy in front of FastAPI
- Self-signed cert generated on first boot (immediate HTTPS)
- Let's Encrypt wizard in Settings: enter domain, choose validation method (HTTP-01 or DNS-01)
- Auto-renewal via systemd timer
- HSTS headers enabled by default
- Internal network detection: skip cert warnings for `.local` access
- Certificate status indicator in System Tray (valid/expiring/expired)
- Support for custom certificates (upload PEM/key)

---

## Display Auto-Start (Electron on Boot)

The Electron app auto-launches on the connected HDMI display:

1. **Wayland compositor**: `cage` (single-app Wayland compositor) or `labwc` launches at boot via systemd
2. **Electron launches inside cage**: fullscreen, no window decorations, acts as the entire display
3. **systemd service chain**: `getty@tty1` → auto-login as `nasos` user → `cage -- electron /opt/nasos/electron`
4. **Fallback**: if no display connected, Electron doesn't start; backend + web access still works
5. **Display detection**: `udev` rule for HDMI hotplug — start/stop Electron on cable connect/disconnect
6. **Resolution handling**: Electron runs at native display resolution, React UI is responsive
7. **Touch support**: if touchscreen attached, full touch input works through Electron
8. **Screen sleep**: DPMS power management, configurable idle timeout

---

## Desktop Interactivity Features (Detailed)

### Window Manager
- **Drag to move** — grab title bar, move anywhere on screen
- **Resize** — drag edges/corners, minimum size constraints
- **Maximize** — double-click title bar or click maximize button; restores on second click
- **Minimize** — to taskbar, click taskbar icon to restore
- **Snap zones** — drag to left/right edge for 50/50 split, corners for quarter-tile
- **Z-ordering** — click window to bring to front, track z-index stack
- **Multi-window** — open multiple instances of same app (e.g., two File Managers for drag-between)
- **Window cycling** — Alt+Tab overlay with window previews
- **Close confirmation** — unsaved changes prompt

### Drag & Drop System
- **Within File Manager** — drag files to move between folders
- **Between File Managers** — drag files from one window to another, shows copy/move indicator
- **To Desktop** — drag files to create desktop shortcuts
- **From Desktop** — drag desktop files into File Manager to move them
- **Drag preview** — shows file icon + count following cursor during drag
- **Drop zones** — highlight valid drop targets with visual indicator
- **Cross-app** — drag a file onto Docker Manager to upload to container volume

### Right-Click Context Menus
- **Desktop** — New Folder, Paste, Refresh, Display Settings, Change Wallpaper
- **File/Folder** — Open, Copy, Cut, Paste, Rename, Delete, Properties, Share, Compress
- **Taskbar** — Show Desktop, Task Manager, Lock Screen
- **System Tray** — individual service context menus

---

---

## Full Audit — Build Plan vs. Implementation (March 2026)

### Context

A comprehensive codebase audit was performed to compare everything built vs. the original build plan. The project is at **~6,900 lines** (2,800 backend Python + 4,100 frontend TypeScript) with ~3,300 lines of CSS.

### Phase-by-Phase Completion Status

| Phase | Status | Score | Notes |
|-------|--------|-------|-------|
| Phase 0: Scaffold | ✅ COMPLETE | 95% | Makefile, docker-compose, Electron, all present. Missing: README.md |
| Phase 1: Desktop Shell | ✅ COMPLETE | 100% | Window drag/resize/snap, Alt+Tab, animations, taskbar, tray, context menu |
| Phase 2: File Manager | ✅ COMPLETE | 95% | Tree sidebar, preview, context menu, drag-drop, multi-select, search, upload/download. No file transfer progress WebSocket |
| Phase 3: Storage | ✅ COMPLETE | 90% | Disk overview, SMART health, volumes. No RAID wizard, no quota UI, no disk spin-down |
| Phase 4: File Sharing | ✅ COMPLETE | 85% | Share CRUD, SMB/NFS/WebDAV wizard. No FTP/SFTP, no ACL editor UI |
| Phase 5: User/Network | ✅ COMPLETE | 80% | Users, groups, network, services. No VPN/WireGuard, no DDNS, no Samba user sync |
| Phase 6: Monitoring | ✅ COMPLETE | 75% | Sparklines, temp gauge, WebSocket metrics. No log viewer, no alert rules, no notification email/push |
| Phase 7: Docker | ✅ COMPLETE | 80% | Container list, app store catalog. No container logs, no compose editor, no resource limits |
| Phase 8: Backup | ✅ COMPLETE | 70% | Job CRUD, snapshots, cloud remotes in UI. Backend is mock-only (no rsync/rclone exec) |
| Phase 9: Security + Extras | ✅ COMPLETE | 85% | Security score, TLS, Fail2ban, Firewall, SSH, Thermal, UPS, Updates, Avahi, Time Machine tabs. All mock backend |

### Commonly Missed Items Completion

| Item | Backend | Frontend | Real Linux Impl |
|------|---------|----------|-----------------|
| 1. Avahi/mDNS | ✅ Mock API | ✅ Settings tab | ❌ No avahi-browse |
| 2. ACLs | ✅ Mock API | ❌ No editor UI | ❌ No getfacl/setfacl |
| 3. Time Machine | ✅ Mock API | ✅ Settings tab | ❌ No vfs config |
| 4. SMART Monitoring | ✅ Real smartctl read | ✅ Storage Manager | ❌ No daemon/alerts |
| 5. UPS/NUT | ✅ Mock API | ✅ Settings tab | ❌ No upsc calls |
| 6. Read-Only Root | ✅ Mock API | ❌ No UI (API only) | ❌ No overlay check |
| 7. Thermal Mgmt | ✅ Mock API | ✅ Settings tab | ❌ No fan control |
| 8. OTA Updates | ✅ Mock API | ✅ Settings tab | ❌ No partition swap |
| 9. HTTPS/Let's Encrypt | ✅ Mock API | ✅ Security tab | ❌ No certbot |

### Gaps Ranked by Priority

#### 🔴 HIGH — Missing Features Referenced in App Menu / UI

1. **Log Viewer App** — Taskbar menu has `log-viewer` entry → opens PlaceholderApp. No backend journalctl API, no frontend component.
2. **`user-manager` / `network-settings` appId routing** — Taskbar menu launches these IDs but Desktop.tsx doesn't route them. They open PlaceholderApp instead of redirecting to the Settings tabs.
3. **Authentication** — Backend has JWT/bcrypt in `core/security.py` but NO login endpoint, NO token middleware, NO route protection. Completely unauthenticated.

#### 🟡 MEDIUM — Planned Features Not Yet Implemented

4. **Notification system (email/push)** — NotificationCenter UI exists for in-app. No email (msmtp), no push (ntfy/gotify), no webhook backend.
5. **Container logs streaming** — Docker containers are listed but no log view. Plan calls for real-time WebSocket log streaming.
6. **Backup execution engine** — Job CRUD works in-memory, but `run_backup_now()` is a no-op. No rsync/rclone actually executes. Jobs not persisted to SQLite.
7. **Alert rules system** — No configurable thresholds (temp > 80°C, disk > 90% full). No alert trigger/dispatch.
8. **File transfer progress** — Upload/download work but no WebSocket progress stream for large transfers.

#### 🟢 LOW — Advanced Features / Polish

9. **VPN (WireGuard) config** — No backend, no UI.
10. **DDNS support** — No backend, no UI.
11. **Compose editor** — Docker app install works but no docker-compose.yml editor.
12. **Container resource limits** — No CPU/RAM limit UI for containers.
13. **RAID wizard** — Storage shows disks/volumes but no mdadm RAID creation.
14. **Disk spin-down** — No hdparm config.
15. **Quota management** — No per-user/group quota UI.
16. **FTP/SFTP** — Share wizard does SMB/NFS/WebDAV but not FTP/SFTP.
17. **Samba user sync** — Users are managed but not auto-synced to smbpasswd.
18. **FirstBootWizard** — Referenced in plan but not implemented. System script exists in `system/scripts/first-boot.sh`.
19. **Toast notifications** — Notification panel exists; no transient toast popups.
20. **README.md** — No project documentation.
21. **Test coverage** — `backend/tests/` is empty. No frontend tests. pytest/vitest configured but zero tests.

### What's FULLY Working (Real Implementation, Not Just Mock)

- ✅ File operations (list, tree, search, copy, move, rename, delete, upload, download, preview)
- ✅ Disk enumeration (lsblk), SMART data (smartctl), volumes (psutil)
- ✅ System metrics (CPU, memory, temp, network) via psutil + WebSocket
- ✅ User/group management (getent, useradd, userdel on Linux)
- ✅ Docker container management (docker CLI)
- ✅ Share CRUD with SQLite + SMB/NFS config generation on Linux
- ✅ Network info (ip command, systemctl service status)
- ✅ Complete desktop window manager (drag, resize, snap, Alt+Tab, animations)
- ✅ Full file manager with drag-drop, context menus, keyboard shortcuts
- ✅ Electron shell with preload security

### Implementation Plan — Close All Gaps (4 Batches)

---

#### BATCH 1: Log Viewer + Menu Fixes + Toasts

**Step 1.1 — Log Viewer Backend**
- Create `backend/app/services/log_service.py`
  - `get_logs(lines=200, unit=None, priority=None, grep=None) → list[dict]`
  - Linux: `journalctl --no-pager -o json --lines=N [-u unit] [-p priority] [-g grep]`
  - Dev mock: generate ~50 realistic log lines (samba, sshd, docker, kernel, nasos-backend, systemd)
  - Each entry: `{timestamp, unit, priority, message, hostname}`
- Create `backend/app/api/logs.py`
  - `GET /api/logs?lines=200&unit=&priority=&grep=` — returns `{logs: [...]}`
- Wire router in `backend/app/main.py`

**Step 1.2 — Log Viewer Frontend**
- Create `frontend/src/apps/LogViewer/LogViewer.tsx`
  - Toolbar: unit dropdown (All/samba/sshd/docker/kernel/nasos), priority dropdown (All/0-7), search input, refresh button, auto-scroll toggle
  - Log body: monospace scrollable list, each line = timestamp + unit badge + priority color + message
  - Priority colors: 0-3 red (error), 4 yellow (warning), 5-6 white (info), 7 gray (debug)
  - CSS prefix: `log-*`
- Add CSS to `frontend/src/styles/desktop.css`
- Wire in `frontend/src/desktop/Desktop.tsx`: `case 'log-viewer': return <LogViewer />`

**Step 1.3 — Fix Taskbar Menu Routing**
- Modify `frontend/src/apps/Settings/Settings.tsx`:
  - Accept prop: `{ initialTab?: SettingsTab }`
  - Default to `initialTab || 'security'`
- Modify `frontend/src/desktop/Desktop.tsx` `renderAppContent()`:
  - `case 'user-manager': return <Settings initialTab="users" />`
  - `case 'network-settings': return <Settings initialTab="network" />`

**Step 1.4 — Toast Notification System**
- Create `frontend/src/desktop/ToastContainer.tsx`
  - Watches `systemStore.notifications` for new entries (track lastSeenId)
  - Renders bottom-right stacked toast popups
  - Auto-dismiss after 5s, close button, slide-in animation
  - Type-colored left border: info=#4fc3f7, warning=#ffa726, error=#ff5252, success=#66bb6a
  - CSS prefix: `toast-*`
- Render `<ToastContainer />` in `Desktop.tsx` above all windows
- Add CSS to desktop.css

**Verify Batch 1:**
- Open Log Viewer from Taskbar menu → see mock logs with filters
- Click "Users" in Taskbar menu → Settings opens on Users tab
- Click "Network" in Taskbar menu → Settings opens on Network tab
- Trigger a notification → see toast popup bottom-right

---

#### BATCH 2: Authentication System

**Step 2.1 — Auth Backend**
- Expand `backend/app/core/security.py`:
  - Add `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")`
  - Add `async def get_current_user(token = Depends(oauth2_scheme))` — decodes JWT, returns user dict or raises HTTPException(401)
- Create `backend/app/api/auth.py`:
  - `POST /api/auth/login` — accepts `{username, password}`, validates against user_service, returns `{access_token, token_type: "bearer", user: {username, fullname}}`
  - `GET /api/auth/me` — returns current user from JWT (protected)
  - Dev mode validation: check against mock users in user_service (admin/admin123)
  - Linux validation: verify via `crypt` module against `/etc/shadow`
- Wire auth router in `main.py` (NO auth dependency on this router itself)

**Step 2.2 — Protect All Routes**
- In `backend/app/main.py`: add `dependencies=[Depends(get_current_user)]` to ALL routers EXCEPT auth router and `GET /api/system/health`
- Alternatively: create a `protected_router` wrapper

**Step 2.3 — Auth Frontend Store**
- Create `frontend/src/store/authStore.ts` (zustand):
  - State: `token, user, isAuthenticated`
  - Actions: `login(username, password)`, `logout()`, `checkAuth()`
  - Persists token to localStorage

**Step 2.4 — Login Screen**
- Create `frontend/src/apps/LoginScreen/LoginScreen.tsx`:
  - Centered card: nasOS logo/title, username input, password input, login button
  - Error message display
  - Gradient background (same desktop gradient)
  - CSS prefix: `login-*`

**Step 2.5 — Gate Desktop Behind Auth**
- Modify `frontend/src/main.tsx` or top-level App:
  - If `!isAuthenticated` → show `<LoginScreen />`
  - If authenticated → show `<Desktop />`
- Modify `frontend/src/hooks/useApi.ts`:
  - Add `Authorization: Bearer {token}` header to all fetch calls
  - On 401 response → call `authStore.logout()` to return to login

**Verify Batch 2:**
- Load app → see login screen
- Login with admin/admin123 → desktop appears
- API calls include JWT header
- Invalid token → redirected to login

---

#### BATCH 3: Backup Execution + Container Logs

**Step 3.1 — Backup Job SQLite Persistence**
- Create `backend/app/models/backup.py`:
  - `BackupJob` model: id, name, source, destination, dest_type, schedule, retention_days, enabled, last_run, last_status, created_at, updated_at
  - `CloudRemote` model: id, name, remote_type, bucket, connected, created_at
- Update `backend/app/models/__init__.py` to import new models
- Rewrite `backend/app/services/backup_service.py`:
  - Replace in-memory lists with async SQLAlchemy queries (follow `share_service.py` pattern)
  - Keep mock seed data as initial DB inserts on first run (check if table empty)
  - `run_backup_now()`: on Linux → spawn `rsync` or `rclone sync` subprocess; on dev → 3-second sleep + mock success + update last_run/last_status

**Step 3.2 — Docker Container Log Streaming**
- Add to `backend/app/api/docker.py`:
  - `GET /api/docker/containers/{id}/logs?tail=100` — returns last N log lines
  - Linux: `docker logs --tail=N {id}`
  - Dev: return mock log lines
- Add to `frontend/src/apps/DockerManager/DockerManager.tsx`:
  - "Logs" button on each container card
  - Expandable log panel below container (monospace, scrollable, auto-scroll)
  - Uses polling (fetch every 3s) or simple refresh button

**Verify Batch 3:**
- Create a backup job → persists after server restart
- Click "Run Now" on a backup job → status updates to "running" then "completed"
- Click "Logs" on a Docker container → see log output

---

#### BATCH 4: Polish + Tests + README

**Step 4.1 — README.md**
- Create root `README.md`: project overview, architecture diagram (ASCII from plan), quick start (`make dev`), screenshot descriptions, tech stack table, project structure

**Step 4.2 — Backend Tests**
- Install dev deps: `pip install httpx pytest pytest-asyncio`
- Create `backend/tests/conftest.py`: async test client fixture using httpx.AsyncClient
- Create test files:
  - `test_system.py` — GET /api/system/health returns 200
  - `test_files.py` — list, search, mkdir, rename, delete
  - `test_shares.py` — create, list, toggle, delete share
  - `test_auth.py` — login success, login failure, protected route without token returns 401

**Step 4.3 — Frontend Tests**
- Add vitest: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
- Configure in `vite.config.ts`: `test: { environment: 'jsdom', globals: true }`
- Create `frontend/src/__tests__/`:
  - `windowStore.test.ts` — openWindow, closeWindow, focusWindow, snapWindow
  - `systemStore.test.ts` — updateMetrics, addNotification
  - `Settings.test.tsx` — renders, switches tabs

**Step 4.4 — Wire Toast Notifications to Actions**
- In ShareManager: share created/deleted → `addNotification({type: 'success', ...})`
- In DockerManager: container started/stopped → success toast
- In BackupManager: job started → info toast, completed → success toast
- In useApi hook: on fetch error → error toast via addNotification

**Verify Batch 4:**
- `cd backend && python -m pytest` → all tests pass
- `cd frontend && npx vitest run` → all tests pass
- README.md reads well
- Actions across apps trigger visible toast notifications

---

**Critical files to modify (all batches):**
- `backend/app/main.py` — add auth, logs routers + auth middleware
- `backend/app/core/security.py` — add OAuth2 scheme + get_current_user dependency
- `frontend/src/desktop/Desktop.tsx` — add LogViewer, LoginScreen imports + routing cases
- `frontend/src/apps/Settings/Settings.tsx` — add initialTab prop
- `frontend/src/hooks/useApi.ts` — add Authorization header
- `frontend/src/styles/desktop.css` — add log-*, login-*, toast-* CSS sections
- `backend/app/services/backup_service.py` — full rewrite to SQLAlchemy

---

## Verification / Testing Plan

### Dev Machine Testing
1. `make dev` — starts backend + frontend with hot reload
2. Open browser to `http://localhost:5173` — full desktop UI works in browser
3. `make electron-dev` — launches Electron shell with dev server
4. All window management, drag-drop, file browsing testable without a Pi
5. Backend mocks system calls on non-Linux platforms for dev

### Pi Testing
1. Flash built image to SD card: `dd if=nasos.img of=/dev/sdX bs=4M`
2. Boot Pi 5 with HDMI display — Electron desktop should auto-launch
3. Complete first-boot wizard on display
4. From another machine, open `https://nasos.local` — same desktop in browser
5. Attach USB drive — notification appears, disk shows in Storage Manager
6. Create SMB share — verify accessible from Windows/Mac on same network
7. Install Docker app from App Store — verify container runs
8. Simulate power loss — verify read-only root survives, data intact
9. Run SMART test — verify alerts fire if simulated degradation
