// Mock data for demo mode — realistic placeholder data for all API endpoints

export const DEMO_USER = {
  username: 'admin',
  fullname: 'Demo Admin',
  groups: ['sudo', 'users', 'docker'],
  must_change_password: false,
}

export const DEMO_CREDENTIALS = { username: 'admin', password: 'demo' }

export const DEMO_TOKEN = 'demo-token-not-a-real-jwt'

// ── Files ────────────────────────────────────────────────────────────

export const FILE_ROOTS = {
  roots: [
    { id: 'home',    name: 'Home',    path: '/home/admin',  icon: 'home' },
    { id: 'storage', name: 'Storage', path: '/mnt/storage', icon: 'hard-drive' },
    { id: 'media',   name: 'Media',   path: '/mnt/media',   icon: 'film' },
    { id: 'backups', name: 'Backups', path: '/mnt/backups', icon: 'archive' },
  ],
}

const tsISO = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86400000).toISOString()

const tsEpoch = (daysAgo: number) =>
  Math.floor((Date.now() - daysAgo * 86400000) / 1000)

export const FILE_LIST_HOME = {
  path: '/home/admin',
  parent: null as string | null,
  entries: [
    { name: 'Documents',  path: '/home/admin/Documents',  is_dir: true,  size: null, modified: tsEpoch(1)  },
    { name: 'Downloads',  path: '/home/admin/Downloads',   is_dir: true,  size: null, modified: tsEpoch(0)  },
    { name: 'Pictures',   path: '/home/admin/Pictures',    is_dir: true,  size: null, modified: tsEpoch(3)  },
    { name: 'Music',      path: '/home/admin/Music',       is_dir: true,  size: null, modified: tsEpoch(5)  },
    { name: 'Videos',     path: '/home/admin/Videos',      is_dir: true,  size: null, modified: tsEpoch(2)  },
    { name: 'Projects',   path: '/home/admin/Projects',    is_dir: true,  size: null, modified: tsEpoch(0)  },
    { name: 'notes.md',   path: '/home/admin/notes.md',    is_dir: false, size: 2340, modified: tsEpoch(0)  },
    { name: 'todo.txt',   path: '/home/admin/todo.txt',    is_dir: false, size: 512,  modified: tsEpoch(1)  },
    { name: 'budget.csv', path: '/home/admin/budget.csv',  is_dir: false, size: 8120, modified: tsEpoch(4)  },
    { name: '.bashrc',    path: '/home/admin/.bashrc',     is_dir: false, size: 3771, modified: tsEpoch(30) },
  ],
}

export const FILE_LIST_DOCUMENTS = {
  path: '/home/admin/Documents',
  parent: '/home/admin',
  entries: [
    { name: 'Work',              path: '/home/admin/Documents/Work',              is_dir: true,  size: null,    modified: tsEpoch(1)  },
    { name: 'Personal',          path: '/home/admin/Documents/Personal',          is_dir: true,  size: null,    modified: tsEpoch(3)  },
    { name: 'report-q4.pdf',     path: '/home/admin/Documents/report-q4.pdf',     is_dir: false, size: 1240000, modified: tsEpoch(2)  },
    { name: 'meeting-notes.md',  path: '/home/admin/Documents/meeting-notes.md',  is_dir: false, size: 4500,    modified: tsEpoch(0)  },
    { name: 'resume.pdf',        path: '/home/admin/Documents/resume.pdf',        is_dir: false, size: 89000,   modified: tsEpoch(14) },
  ],
}

export const FILE_LIST_STORAGE = {
  path: '/mnt/storage',
  parent: null as string | null,
  entries: [
    { name: 'shared',     path: '/mnt/storage/shared',     is_dir: true,  size: null, modified: tsEpoch(0)  },
    { name: 'archives',   path: '/mnt/storage/archives',   is_dir: true,  size: null, modified: tsEpoch(7)  },
    { name: 'isos',       path: '/mnt/storage/isos',       is_dir: true,  size: null, modified: tsEpoch(14) },
    { name: 'README.txt', path: '/mnt/storage/README.txt', is_dir: false, size: 1024, modified: tsEpoch(30) },
  ],
}

export const FILE_TREE_ROOT: Record<string, unknown> = {
  '/home/admin': {
    name: 'demo', path: '/home/admin', is_dir: true,
    children: [
      { name: 'Documents', path: '/home/admin/Documents', is_dir: true, children: [] },
      { name: 'Downloads', path: '/home/admin/Downloads', is_dir: true, children: [] },
      { name: 'Pictures', path: '/home/admin/Pictures', is_dir: true, children: [] },
      { name: 'Music', path: '/home/admin/Music', is_dir: true, children: [] },
      { name: 'Videos', path: '/home/admin/Videos', is_dir: true, children: [] },
      { name: 'Projects', path: '/home/admin/Projects', is_dir: true, children: [] },
    ],
  },
  '/mnt/storage': {
    name: 'storage', path: '/mnt/storage', is_dir: true,
    children: [
      { name: 'shared', path: '/mnt/storage/shared', is_dir: true, children: [] },
      { name: 'archives', path: '/mnt/storage/archives', is_dir: true, children: [] },
      { name: 'isos', path: '/mnt/storage/isos', is_dir: true, children: [] },
    ],
  },
}

export const FILE_PREVIEW_MD = {
  type: 'text',
  content: `# Demo Notes

Welcome to **nasOS** — your personal NAS operating system.

## Quick Start
- Open the **File Manager** to browse your files
- Check **Storage Manager** for disk health
- Use **Docker Manager** to install apps
- Visit **Settings** for system configuration

## Features
- Beautiful, responsive desktop environment
- Full file management with drag-and-drop
- Docker container management
- Network file sharing (SMB/NFS)
- Automated backups
- Real-time system monitoring

---
*This is a demo instance with mock data.*
`,
}

// ── Storage ──────────────────────────────────────────────────────────
// Both StorageManager (Disk interface) and DesktopWidgets (DiskInfo)
// consume /api/storage/disks — include fields for both.

export const STORAGE_DISKS = {
  disks: [
    {
      // StorageManager Disk fields
      name: 'sda',
      path: '/dev/sda',
      size_bytes: 1000204886016,
      model: 'Samsung 870 EVO 1TB',
      serial: 'S5Y1NX0T123456',
      vendor: 'Samsung',
      transport: 'sata',
      rotational: false,
      partitions: [
        { name: 'sda1', size_bytes: 53687091200,  fstype: 'ext4', mountpoint: '/',     uuid: 'a1b2c3d4-0001' },
        { name: 'sda2', size_bytes: 946517794816, fstype: 'ext4', mountpoint: '/home', uuid: 'a1b2c3d4-0002' },
      ],
      // DesktopWidgets DiskInfo fields
      mount: '/',
      total_gb: 931.5,
      used_gb: 307.5,
      percent: 33,
    },
    {
      name: 'sdb',
      path: '/dev/sdb',
      size_bytes: 4000787030016,
      model: 'WD Red Plus 4TB',
      serial: 'WD-WMC4N0123456',
      vendor: 'Western Digital',
      transport: 'sata',
      rotational: true,
      partitions: [
        { name: 'sdb1', size_bytes: 4000787030016, fstype: 'ext4', mountpoint: '/mnt/storage', uuid: 'e5f6g7h8-0001' },
      ],
      mount: '/mnt/storage',
      total_gb: 3726.0,
      used_gb: 1676.7,
      percent: 45,
    },
    {
      name: 'sdc',
      path: '/dev/sdc',
      size_bytes: 4000787030016,
      model: 'WD Red Plus 4TB',
      serial: 'WD-WMC4N0789012',
      vendor: 'Western Digital',
      transport: 'sata',
      rotational: true,
      partitions: [
        { name: 'sdc1', size_bytes: 4000787030016, fstype: 'ext4', mountpoint: '/mnt/media', uuid: 'i9j0k1l2-0001' },
      ],
      mount: '/mnt/media',
      total_gb: 3726.0,
      used_gb: 2235.6,
      percent: 60,
    },
  ],
}

export const STORAGE_VOLUMES = {
  volumes: [
    { device: '/dev/sda1', mountpoint: '/',            fstype: 'ext4', opts: 'rw,relatime',  total_bytes: 53687091200,   used_bytes: 18253611008,   free_bytes: 35433480192,   percent: 34  },
    { device: '/dev/sda2', mountpoint: '/home',         fstype: 'ext4', opts: 'rw,relatime',  total_bytes: 946517794816,  used_bytes: 312475688960,  free_bytes: 634042105856,  percent: 33  },
    { device: '/dev/sdb1', mountpoint: '/mnt/storage',  fstype: 'ext4', opts: 'rw,relatime',  total_bytes: 4000787030016, used_bytes: 1800354365440, free_bytes: 2200432664576, percent: 45  },
    { device: '/dev/sdc1', mountpoint: '/mnt/media',    fstype: 'ext4', opts: 'rw,relatime',  total_bytes: 4000787030016, used_bytes: 2400472088576, free_bytes: 1600314941440, percent: 60  },
  ],
}

export const SMART_DATA = {
  device: '/dev/sda',
  healthy: true,
  temperature: 34,
  power_on_hours: 8760,
  model: 'Samsung 870 EVO 1TB',
  serial: 'S5Y1NX0T123456',
  firmware: 'SVT02B6Q',
  attributes: [
    { id: 5,   name: 'Reallocated_Sector_Ct', value: 100, worst: 100, thresh: 10,  raw_value: '0' },
    { id: 9,   name: 'Power_On_Hours',        value: 99,  worst: 99,  thresh: 0,   raw_value: '8760' },
    { id: 12,  name: 'Power_Cycle_Count',     value: 99,  worst: 99,  thresh: 0,   raw_value: '142' },
    { id: 177, name: 'Wear_Leveling_Count',   value: 98,  worst: 98,  thresh: 0,   raw_value: '24' },
    { id: 194, name: 'Temperature_Celsius',    value: 66,  worst: 52,  thresh: 0,   raw_value: '34' },
    { id: 241, name: 'Total_LBAs_Written',    value: 99,  worst: 99,  thresh: 0,   raw_value: '12345678' },
  ],
}

// ── Docker ───────────────────────────────────────────────────────────

export const DOCKER_STATUS = {
  installed: true,
  running: true,
  version: '24.0.7',
  containers_running: 5,
  containers_total: 7,
  images: 12,
}

// ports is Record<string, number> per the Container interface
export const DOCKER_CONTAINERS = {
  containers: [
    { id: 'abc123', name: 'plex',           image: 'linuxserver/plex:latest',           status: 'running', state: 'running', ports: { '32400/tcp': 32400 }, created: tsISO(30), cpu_percent: 2.4, memory_mb: 312, uptime: '30d 4h' },
    { id: 'def456', name: 'nextcloud',      image: 'nextcloud:28',                       status: 'running', state: 'running', ports: { '80/tcp': 8080 },     created: tsISO(25), cpu_percent: 1.1, memory_mb: 256, uptime: '25d 2h' },
    { id: 'ghi789', name: 'home-assistant', image: 'homeassistant/home-assistant:latest', status: 'running', state: 'running', ports: { '8123/tcp': 8123 },   created: tsISO(20), cpu_percent: 3.6, memory_mb: 420, uptime: '20d 6h' },
    { id: 'jkl012', name: 'pihole',         image: 'pihole/pihole:latest',               status: 'running', state: 'running', ports: { '53/tcp': 53, '80/tcp': 80 }, created: tsISO(15), cpu_percent: 0.5, memory_mb: 64, uptime: '15d 1h' },
    { id: 'mno345', name: 'transmission',   image: 'linuxserver/transmission:latest',    status: 'running', state: 'running', ports: { '9091/tcp': 9091 },   created: tsISO(10), cpu_percent: 0.8, memory_mb: 128, uptime: '10d 3h' },
    { id: 'pqr678', name: 'grafana',        image: 'grafana/grafana:latest',             status: 'exited',  state: 'exited',  ports: { '3000/tcp': 3000 },   created: tsISO(8) },
    { id: 'stu901', name: 'portainer',      image: 'portainer/portainer-ce:latest',      status: 'exited',  state: 'exited',  ports: { '9443/tcp': 9443 },   created: tsISO(5) },
  ],
}

export const DOCKER_CATALOG = {
  apps: [
    { id: 'plex',            name: 'Plex Media Server',  description: 'Stream your media anywhere',           category: 'Media',       icon: '🎬', image: 'linuxserver/plex:latest',           ports: { '32400/tcp': 32400 } },
    { id: 'nextcloud',       name: 'Nextcloud',          description: 'Self-hosted cloud storage',            category: 'Productivity', icon: '☁️', image: 'nextcloud:28',                       ports: { '80/tcp': 8080 } },
    { id: 'home-assistant',  name: 'Home Assistant',     description: 'Open-source home automation',          category: 'Smart Home',  icon: '🏠', image: 'homeassistant/home-assistant:latest', ports: { '8123/tcp': 8123 } },
    { id: 'pihole',          name: 'Pi-hole',            description: 'Network-wide ad blocking',             category: 'Network',     icon: '🛡️', image: 'pihole/pihole:latest',               ports: { '53/tcp': 53 } },
    { id: 'jellyfin',        name: 'Jellyfin',           description: 'Free media system',                    category: 'Media',       icon: '📺', image: 'jellyfin/jellyfin:latest',            ports: { '8096/tcp': 8096 } },
    { id: 'gitea',           name: 'Gitea',              description: 'Lightweight Git service',              category: 'Development', icon: '🐙', image: 'gitea/gitea:latest',                  ports: { '3000/tcp': 3000 } },
    { id: 'vaultwarden',     name: 'Vaultwarden',        description: 'Bitwarden-compatible password manager', category: 'Security',   icon: '🔐', image: 'vaultwarden/server:latest',           ports: { '80/tcp': 8088 } },
    { id: 'uptime-kuma',     name: 'Uptime Kuma',        description: 'Self-hosted monitoring tool',          category: 'Monitoring',  icon: '📊', image: 'louislam/uptime-kuma:latest',         ports: { '3001/tcp': 3001 } },
    { id: 'syncthing',       name: 'Syncthing',          description: 'Continuous file synchronization',      category: 'Productivity', icon: '🔄', image: 'syncthing/syncthing:latest',          ports: { '8384/tcp': 8384 } },
    { id: 'wireguard',       name: 'WireGuard',          description: 'Fast modern VPN tunnel',               category: 'Network',     icon: '🔒', image: 'linuxserver/wireguard:latest',        ports: { '51820/udp': 51820 } },
  ],
}

export const DOCKER_LOGS = {
  logs: [
    '[2026-03-15 10:00:01] INFO: Container started successfully',
    '[2026-03-15 10:00:02] INFO: Listening on port 32400',
    '[2026-03-15 10:00:05] INFO: Media library scan initiated',
    '[2026-03-15 10:01:12] INFO: Found 1,247 media items',
    '[2026-03-15 10:01:13] INFO: Library scan complete',
  ],
}

// ── Network ──────────────────────────────────────────────────────────

export const NETWORK_INFO = {
  hostname: 'nasos-demo',
  domain: 'local',
  dns: ['192.168.1.1', '1.1.1.1'],
  interfaces: [
    {
      name: 'eth0',
      type: 'ethernet',
      state: 'up',
      mac: '00:1A:2B:3C:4D:5E',
      ipv4: '192.168.1.100',
      ipv6: 'fe80::21a:2bff:fe3c:4d5e',
      netmask: '255.255.255.0',
      gateway: '192.168.1.1',
      speed: '1000 Mbps',
      method: 'dhcp',
      rx_bytes: 54237896704,
      tx_bytes: 12847563776,
    },
  ],
}

export const NETWORK_SERVICES = {
  services: [
    { name: 'sshd',       display: 'SSH Server',      description: 'Secure shell access',        status: 'active' },
    { name: 'smbd',       display: 'Samba (SMB)',      description: 'Windows file sharing',       status: 'active' },
    { name: 'nmbd',       display: 'NetBIOS',          description: 'Network name resolution',    status: 'active' },
    { name: 'avahi-daemon', display: 'Avahi (mDNS)',    description: 'Bonjour/mDNS discovery',     status: 'active' },
    { name: 'nasos-backend', display: 'nasOS Backend',  description: 'nasOS web interface',        status: 'active' },
  ],
}

export const WIFI_STATUS = {
  available: false,
  connected: false,
  ssid: null,
  signal: null,
}

// ── Users ────────────────────────────────────────────────────────────

export const USERS_LIST = {
  users: [
    { username: 'admin', fullname: 'Demo Admin',   groups: ['sudo', 'users', 'docker'], uid: 1000 },
    { username: 'media', fullname: 'Media Service', groups: ['users', 'media'],          uid: 1001 },
    { username: 'guest', fullname: 'Guest',         groups: ['users'],                   uid: 1002 },
  ],
}

export const USER_GROUPS = {
  groups: [
    { name: 'sudo',   gid: 27,   members: ['admin'] },
    { name: 'users',  gid: 100,  members: ['admin', 'media', 'guest'] },
    { name: 'docker', gid: 998,  members: ['admin'] },
    { name: 'media',  gid: 1001, members: ['media'] },
  ],
}

// ── Shares ───────────────────────────────────────────────────────────
// Share interface requires: id, name, path, protocol, enabled, read_only,
// guest_access, description, allowed_users[], allowed_hosts[], created_at, updated_at

export const SHARES_LIST = {
  shares: [
    { id: 1, name: 'Public',      path: '/mnt/storage/shared',        protocol: 'smb', read_only: false, guest_access: true,  enabled: true,  description: 'Public shared folder',   allowed_users: [] as string[], allowed_hosts: [] as string[], created_at: tsISO(60), updated_at: tsISO(5)  },
    { id: 2, name: 'Media',       path: '/mnt/media',                 protocol: 'smb', read_only: true,  guest_access: false, enabled: true,  description: 'Media library (read-only)', allowed_users: ['admin', 'media'], allowed_hosts: ['192.168.1.0/24'], created_at: tsISO(45), updated_at: tsISO(10) },
    { id: 3, name: 'Backups',     path: '/mnt/backups',               protocol: 'nfs', read_only: false, guest_access: false, enabled: true,  description: 'Backup target share',    allowed_users: ['admin'],       allowed_hosts: ['192.168.1.0/24'], created_at: tsISO(45), updated_at: tsISO(3)  },
    { id: 4, name: 'TimeMachine', path: '/mnt/storage/timemachine',   protocol: 'smb', read_only: false, guest_access: false, enabled: false, description: 'macOS Time Machine',     allowed_users: ['admin'],       allowed_hosts: [] as string[], created_at: tsISO(30), updated_at: tsISO(15) },
  ],
}

// ── Backup ───────────────────────────────────────────────────────────

export const BACKUP_JOBS = {
  jobs: [
    { id: '1', name: 'Daily Home Backup',     source: '/home',         destination: '/mnt/backups/home',    schedule: '0 2 * * *',  enabled: true,  last_run: tsISO(0), last_status: 'success', next_run: tsISO(-1) },
    { id: '2', name: 'Weekly Media Backup',    source: '/mnt/media',    destination: '/mnt/backups/media',   schedule: '0 3 * * 0',  enabled: true,  last_run: tsISO(3), last_status: 'success', next_run: tsISO(-4) },
    { id: '3', name: 'Config Backup to Cloud', source: '/etc',          destination: 'remote:nasOS-config',  schedule: '0 4 * * *',  enabled: false, last_run: tsISO(7), last_status: 'success', next_run: null },
  ],
}

export const BACKUP_SNAPSHOTS = {
  snapshots: [
    { id: 's1', job_id: '1', timestamp: tsISO(0), size: 1073741824,  paths: ['/home'] },
    { id: 's2', job_id: '1', timestamp: tsISO(1), size: 1048576000,  paths: ['/home'] },
    { id: 's3', job_id: '2', timestamp: tsISO(3), size: 5368709120,  paths: ['/mnt/media'] },
    { id: 's4', job_id: '1', timestamp: tsISO(2), size: 1060000000,  paths: ['/home'] },
  ],
}

export const BACKUP_REMOTES = {
  remotes: [
    { name: 'remote', type: 'b2', bucket: 'nasos-backup-demo' },
  ],
}

// ── Security ─────────────────────────────────────────────────────────
// SecurityOverview interface shape from Settings.tsx

export const SECURITY_OVERVIEW = {
  tls: { status: 'valid', cert_type: 'Self-signed' },
  firewall: { enabled: true, rules_count: 5 },
  fail2ban: { enabled: true, active_bans: 3 },
  ssh: { key_only: true, root_login: false },
  two_factor: { enabled: false },
  issues: [
    { level: 'warning', message: 'Two-factor authentication is not enabled' },
    { level: 'info', message: 'Self-signed TLS certificate — consider a CA-signed cert for external access' },
  ],
  score: 78,
}

// FirewallRule: id, action, port, from, description
export const SECURITY_FIREWALL = {
  enabled: true,
  default_policy: 'deny',
  rules: [
    { id: 1, action: 'ALLOW', port: '22/tcp',   from: 'Anywhere',       description: 'SSH' },
    { id: 2, action: 'ALLOW', port: '80/tcp',   from: 'Anywhere',       description: 'HTTP' },
    { id: 3, action: 'ALLOW', port: '443/tcp',  from: 'Anywhere',       description: 'HTTPS' },
    { id: 4, action: 'ALLOW', port: '445/tcp',  from: '192.168.1.0/24', description: 'SMB (LAN only)' },
    { id: 5, action: 'ALLOW', port: '8080/tcp', from: '192.168.1.0/24', description: 'nasOS Web UI' },
  ],
}

// Fail2banJail: name, enabled, banned, total_bans, max_retries, ban_time
export const SECURITY_FAIL2BAN = {
  enabled: true,
  jails: [
    { name: 'sshd',      enabled: true, banned: 2, total_bans: 47, max_retries: 5, ban_time: 3600 },
    { name: 'nasos-web', enabled: true, banned: 1, total_bans: 12, max_retries: 5, ban_time: 3600 },
  ],
}

export const SECURITY_SSH = {
  port: 22,
  password_auth: false,
  root_login: false,
  pubkey_auth: true,
  authorized_keys: 2,
}

export const SECURITY_TLS = {
  enabled: true,
  provider: 'self-signed',
  expires: '2027-03-15T00:00:00Z',
  cn: 'nasos-demo.local',
}

// ── System ───────────────────────────────────────────────────────────

export const SYSTEM_UPTIME = {
  uptime_seconds: 4060800,
  boot_time: new Date(Date.now() - 4060800000).toISOString(),
  load_average: [0.42, 0.38, 0.35],
}

export const SYSTEM_HEALTH = { status: 'ok' }

// ── Updates ──────────────────────────────────────────────────────────
// OtaStatus: current_version, staged, progress, rollback, disk_free_mb

export const UPDATE_STATUS = {
  current_version: '1.2.0',
  staged: null,
  progress: null,
  rollback: null,
  disk_free_mb: 24000,
}

// GitHubRelease: current_version, update_available, latest_version?, ...
export const UPDATE_CHECK_CACHED = {
  current_version: '1.2.0',
  update_available: false,
  latest_version: '1.2.0',
}

// ── Preferences ──────────────────────────────────────────────────────

export const PREFERENCES_THEME = {
  active_theme_id: 'default',
  custom_themes: [],
}

export const PREFERENCES_DESKTOP = {
  wallpaper: null,
  widgets: {
    enabledWidgets: ['clock', 'system-monitor', 'storage'],
    customWidgets: [],
    widgetConfig: {},
  },
  dock: null,
  layout: null,
}

// ── Logs ─────────────────────────────────────────────────────────────
// LogEntry: timestamp, unit, priority (number), priority_label, message, hostname

export const LOGS_DATA = {
  logs: [
    { timestamp: tsISO(0),   unit: 'systemd',        priority: 6, priority_label: 'info',    message: 'System health check passed',                              hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'docker',          priority: 6, priority_label: 'info',    message: 'Container plex health check OK',                          hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'smbd',            priority: 6, priority_label: 'info',    message: 'Client 192.168.1.50 connected to share "Public"',         hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'fail2ban',        priority: 4, priority_label: 'warning', message: 'Ban 203.0.113.42 (sshd): too many auth failures',         hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'nasos-backend',   priority: 6, priority_label: 'info',    message: 'Daily Home Backup completed (1.0 GB, 2m 14s)',           hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'docker',          priority: 6, priority_label: 'info',    message: 'Container nextcloud health check OK',                     hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'systemd',         priority: 6, priority_label: 'info',    message: 'Disk temperature check: all nominal',                     hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'smbd',            priority: 3, priority_label: 'error',   message: 'Permission denied for guest on share "Media"',            hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'kernel',          priority: 6, priority_label: 'info',    message: 'Network interface eth0: 1000 Mbps full-duplex',           hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'avahi-daemon',    priority: 6, priority_label: 'info',    message: 'Registered nasos-demo.local on eth0',                     hostname: 'nasos-demo' },
    { timestamp: tsISO(0.5), unit: 'kernel',          priority: 4, priority_label: 'warning', message: 'Disk /dev/sdb temperature 38°C (threshold: 45°C)',        hostname: 'nasos-demo' },
    { timestamp: tsISO(0.5), unit: 'nasos-backend',   priority: 6, priority_label: 'info',    message: 'Snapshot s1 created for Daily Home Backup',               hostname: 'nasos-demo' },
    { timestamp: tsISO(1),   unit: 'systemd',         priority: 6, priority_label: 'info',    message: 'System update check: no updates available',               hostname: 'nasos-demo' },
    { timestamp: tsISO(2),   unit: 'nasos-backend',   priority: 6, priority_label: 'info',    message: 'Weekly Media Backup completed (5.0 GB, 12m 34s)',        hostname: 'nasos-demo' },
    { timestamp: tsISO(3),   unit: 'docker',          priority: 6, priority_label: 'info',    message: 'Image linuxserver/plex:latest pulled successfully',       hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'sshd',            priority: 6, priority_label: 'info',    message: 'Accepted publickey for demo from 192.168.1.50 port 52341', hostname: 'nasos-demo' },
    { timestamp: tsISO(0),   unit: 'sshd',            priority: 4, priority_label: 'warning', message: 'Failed password for invalid user admin from 203.0.113.42', hostname: 'nasos-demo' },
  ],
}

// ── Extras ───────────────────────────────────────────────────────────
// ThermalData: cpu_temp, gpu_temp, throttled, throttle_flags, fan, fan_curves, temp_history_24h

export const EXTRAS_THERMAL = {
  cpu_temp: 52.3,
  gpu_temp: 48.1,
  throttled: false,
  throttle_flags: {
    under_voltage: false,
    arm_frequency_capped: false,
    currently_throttled: false,
    soft_temperature_limit: false,
  },
  fan: { present: true, mode: 'auto', speed_pct: 35, rpm: 1200 },
  fan_curves: {
    auto: { '40': 0, '50': 30, '60': 50, '70': 70, '80': 100 },
  },
  temp_history_24h: { min: 41.2, max: 58.7, avg: 49.3 },
}

// UpsData: connected, model?, ...
export const EXTRAS_UPS = {
  connected: false,
}

// AvahiData: enabled, hostname, services[], discovered_devices[]
export const EXTRAS_AVAHI = {
  enabled: true,
  hostname: 'nasos-demo',
  services: [
    { type: '_http._tcp', name: 'nasOS Web UI', port: 8080 },
    { type: '_smb._tcp',  name: 'nasOS SMB',    port: 445 },
  ],
  discovered_devices: [
    { name: 'living-room-tv', address: '192.168.1.120', type: '_googlecast._tcp' },
    { name: 'printer',        address: '192.168.1.150', type: '_ipp._tcp' },
  ],
}

// TimeMachineData: enabled, share_name, share_path, quota_gb, used_gb, vfs_modules[], connected_macs[]
export const EXTRAS_TIMEMACHINE = {
  enabled: false,
  share_name: '',
  share_path: '',
  quota_gb: 0,
  used_gb: 0,
  vfs_modules: [] as string[],
  connected_macs: [] as { hostname: string; last_backup: string; size_gb: number }[],
}
