// Mock data for demo mode — realistic placeholder data for all API endpoints

export const DEMO_USER = {
  username: 'demo',
  fullname: 'Demo User',
  groups: ['sudo', 'users', 'docker'],
  must_change_password: false,
}

export const DEMO_TOKEN = 'demo-token-not-a-real-jwt'

// ── Files ────────────────────────────────────────────────────────────

export const FILE_ROOTS = {
  roots: [
    { label: 'Home', path: '/home/demo', icon: 'home' },
    { label: 'Storage', path: '/mnt/storage', icon: 'hard-drive' },
    { label: 'Media', path: '/mnt/media', icon: 'film' },
    { label: 'Backups', path: '/mnt/backups', icon: 'archive' },
  ],
}

const ts = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86400000).toISOString()

export const FILE_LIST_HOME = {
  path: '/home/demo',
  entries: [
    { name: 'Documents',  path: '/home/demo/Documents',  is_dir: true,  size: 0,        modified: ts(1)  },
    { name: 'Downloads',  path: '/home/demo/Downloads',   is_dir: true,  size: 0,        modified: ts(0)  },
    { name: 'Pictures',   path: '/home/demo/Pictures',    is_dir: true,  size: 0,        modified: ts(3)  },
    { name: 'Music',      path: '/home/demo/Music',       is_dir: true,  size: 0,        modified: ts(5)  },
    { name: 'Videos',     path: '/home/demo/Videos',      is_dir: true,  size: 0,        modified: ts(2)  },
    { name: 'Projects',   path: '/home/demo/Projects',    is_dir: true,  size: 0,        modified: ts(0)  },
    { name: 'notes.md',   path: '/home/demo/notes.md',    is_dir: false, size: 2340,     modified: ts(0)  },
    { name: 'todo.txt',   path: '/home/demo/todo.txt',    is_dir: false, size: 512,      modified: ts(1)  },
    { name: 'budget.csv', path: '/home/demo/budget.csv',  is_dir: false, size: 8120,     modified: ts(4)  },
    { name: '.bashrc',    path: '/home/demo/.bashrc',     is_dir: false, size: 3771,     modified: ts(30) },
  ],
}

export const FILE_LIST_DOCUMENTS = {
  path: '/home/demo/Documents',
  entries: [
    { name: 'Work',           path: '/home/demo/Documents/Work',           is_dir: true,  size: 0,       modified: ts(1) },
    { name: 'Personal',       path: '/home/demo/Documents/Personal',       is_dir: true,  size: 0,       modified: ts(3) },
    { name: 'report-q4.pdf',  path: '/home/demo/Documents/report-q4.pdf',  is_dir: false, size: 1240000, modified: ts(2) },
    { name: 'meeting-notes.md', path: '/home/demo/Documents/meeting-notes.md', is_dir: false, size: 4500, modified: ts(0) },
    { name: 'resume.pdf',     path: '/home/demo/Documents/resume.pdf',     is_dir: false, size: 89000,   modified: ts(14) },
  ],
}

export const FILE_LIST_STORAGE = {
  path: '/mnt/storage',
  entries: [
    { name: 'shared',     path: '/mnt/storage/shared',     is_dir: true, size: 0,         modified: ts(0) },
    { name: 'archives',   path: '/mnt/storage/archives',   is_dir: true, size: 0,         modified: ts(7) },
    { name: 'isos',       path: '/mnt/storage/isos',       is_dir: true, size: 0,         modified: ts(14) },
    { name: 'README.txt', path: '/mnt/storage/README.txt', is_dir: false, size: 1024,     modified: ts(30) },
  ],
}

export const FILE_TREE_ROOT: Record<string, unknown> = {
  '/home/demo': {
    name: 'demo', path: '/home/demo', is_dir: true,
    children: [
      { name: 'Documents', path: '/home/demo/Documents', is_dir: true, children: [] },
      { name: 'Downloads', path: '/home/demo/Downloads', is_dir: true, children: [] },
      { name: 'Pictures', path: '/home/demo/Pictures', is_dir: true, children: [] },
      { name: 'Music', path: '/home/demo/Music', is_dir: true, children: [] },
      { name: 'Videos', path: '/home/demo/Videos', is_dir: true, children: [] },
      { name: 'Projects', path: '/home/demo/Projects', is_dir: true, children: [] },
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

export const STORAGE_DISKS = {
  disks: [
    {
      device: '/dev/sda',
      model: 'Samsung 870 EVO 1TB',
      serial: 'S5Y1NX0T123456',
      size: 1000204886016,
      type: 'SSD',
      temperature: 34,
      health: 'PASSED',
      partitions: [
        { device: '/dev/sda1', mountpoint: '/', fstype: 'ext4', size: 53687091200, used: 18253611008 },
        { device: '/dev/sda2', mountpoint: '/home', fstype: 'ext4', size: 946517794816, used: 312475688960 },
      ],
    },
    {
      device: '/dev/sdb',
      model: 'WD Red Plus 4TB',
      serial: 'WD-WMC4N0123456',
      size: 4000787030016,
      type: 'HDD',
      temperature: 38,
      health: 'PASSED',
      partitions: [
        { device: '/dev/sdb1', mountpoint: '/mnt/storage', fstype: 'ext4', size: 4000787030016, used: 1800354365440 },
      ],
    },
    {
      device: '/dev/sdc',
      model: 'WD Red Plus 4TB',
      serial: 'WD-WMC4N0789012',
      size: 4000787030016,
      type: 'HDD',
      temperature: 37,
      health: 'PASSED',
      partitions: [
        { device: '/dev/sdc1', mountpoint: '/mnt/media', fstype: 'ext4', size: 4000787030016, used: 2400472088576 },
      ],
    },
  ],
}

export const STORAGE_VOLUMES = {
  volumes: [
    { name: 'root',    mountpoint: '/',            fstype: 'ext4', size: 53687091200,  used: 18253611008,  available: 35433480192  },
    { name: 'home',    mountpoint: '/home',         fstype: 'ext4', size: 946517794816, used: 312475688960, available: 634042105856 },
    { name: 'storage', mountpoint: '/mnt/storage',  fstype: 'ext4', size: 4000787030016, used: 1800354365440, available: 2200432664576 },
    { name: 'media',   mountpoint: '/mnt/media',    fstype: 'ext4', size: 4000787030016, used: 2400472088576, available: 1600314941440 },
  ],
}

export const SMART_DATA = {
  device: '/dev/sda',
  model: 'Samsung 870 EVO 1TB',
  health: 'PASSED',
  temperature: 34,
  power_on_hours: 8760,
  attributes: [
    { id: 5,   name: 'Reallocated_Sector_Ct', value: 100, worst: 100, threshold: 10,  raw: '0' },
    { id: 9,   name: 'Power_On_Hours',        value: 99,  worst: 99,  threshold: 0,   raw: '8760' },
    { id: 12,  name: 'Power_Cycle_Count',     value: 99,  worst: 99,  threshold: 0,   raw: '142' },
    { id: 177, name: 'Wear_Leveling_Count',   value: 98,  worst: 98,  threshold: 0,   raw: '24' },
    { id: 194, name: 'Temperature_Celsius',    value: 66,  worst: 52,  threshold: 0,   raw: '34' },
    { id: 241, name: 'Total_LBAs_Written',    value: 99,  worst: 99,  threshold: 0,   raw: '12345678' },
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

export const DOCKER_CONTAINERS = {
  containers: [
    { id: 'abc123', name: 'plex',           image: 'linuxserver/plex:latest',           status: 'running', state: 'running', ports: ['32400:32400'], created: ts(30) },
    { id: 'def456', name: 'nextcloud',      image: 'nextcloud:28',                       status: 'running', state: 'running', ports: ['8080:80'],     created: ts(25) },
    { id: 'ghi789', name: 'home-assistant', image: 'homeassistant/home-assistant:latest', status: 'running', state: 'running', ports: ['8123:8123'],   created: ts(20) },
    { id: 'jkl012', name: 'pihole',         image: 'pihole/pihole:latest',               status: 'running', state: 'running', ports: ['53:53', '80:80'], created: ts(15) },
    { id: 'mno345', name: 'transmission',   image: 'linuxserver/transmission:latest',    status: 'running', state: 'running', ports: ['9091:9091'],   created: ts(10) },
    { id: 'pqr678', name: 'grafana',        image: 'grafana/grafana:latest',             status: 'exited',  state: 'exited',  ports: ['3000:3000'],   created: ts(8) },
    { id: 'stu901', name: 'portainer',      image: 'portainer/portainer-ce:latest',      status: 'exited',  state: 'exited',  ports: ['9443:9443'],   created: ts(5) },
  ],
}

export const DOCKER_CATALOG = {
  apps: [
    { id: 'plex',            name: 'Plex Media Server',  description: 'Stream your media anywhere',           category: 'Media',     icon: '🎬', installed: true },
    { id: 'nextcloud',       name: 'Nextcloud',          description: 'Self-hosted cloud storage',            category: 'Productivity', icon: '☁️', installed: true },
    { id: 'home-assistant',  name: 'Home Assistant',     description: 'Open-source home automation',          category: 'Smart Home', icon: '🏠', installed: true },
    { id: 'pihole',          name: 'Pi-hole',            description: 'Network-wide ad blocking',             category: 'Network',   icon: '🛡️', installed: true },
    { id: 'jellyfin',        name: 'Jellyfin',           description: 'Free media system',                    category: 'Media',     icon: '📺', installed: false },
    { id: 'gitea',           name: 'Gitea',              description: 'Lightweight Git service',              category: 'Development', icon: '🐙', installed: false },
    { id: 'vaultwarden',     name: 'Vaultwarden',        description: 'Bitwarden-compatible password manager', category: 'Security', icon: '🔐', installed: false },
    { id: 'uptime-kuma',     name: 'Uptime Kuma',        description: 'Self-hosted monitoring tool',          category: 'Monitoring', icon: '📊', installed: false },
    { id: 'syncthing',       name: 'Syncthing',          description: 'Continuous file synchronization',      category: 'Productivity', icon: '🔄', installed: false },
    { id: 'wireguard',       name: 'WireGuard',          description: 'Fast modern VPN tunnel',               category: 'Network',   icon: '🔒', installed: false },
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
      speed: 1000,
      rx_bytes: 54237896704,
      tx_bytes: 12847563776,
    },
  ],
}

export const NETWORK_SERVICES = {
  services: [
    { name: 'sshd',       port: 22,    protocol: 'tcp', status: 'active' },
    { name: 'smbd',       port: 445,   protocol: 'tcp', status: 'active' },
    { name: 'nmbd',       port: 137,   protocol: 'udp', status: 'active' },
    { name: 'avahi',      port: 5353,  protocol: 'udp', status: 'active' },
    { name: 'nasOS-web',  port: 8080,  protocol: 'tcp', status: 'active' },
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
    { username: 'demo',  fullname: 'Demo User',   groups: ['sudo', 'users', 'docker'], uid: 1000 },
    { username: 'media', fullname: 'Media Service', groups: ['users', 'media'],          uid: 1001 },
    { username: 'guest', fullname: 'Guest',         groups: ['users'],                   uid: 1002 },
  ],
}

export const USER_GROUPS = {
  groups: [
    { name: 'sudo',   gid: 27,   members: ['demo'] },
    { name: 'users',  gid: 100,  members: ['demo', 'media', 'guest'] },
    { name: 'docker', gid: 998,  members: ['demo'] },
    { name: 'media',  gid: 1001, members: ['media'] },
  ],
}

// ── Shares ───────────────────────────────────────────────────────────

export const SHARES_LIST = {
  shares: [
    { id: '1', name: 'Public',   path: '/mnt/storage/shared',     protocol: 'smb', read_only: false, guest_ok: true,  enabled: true },
    { id: '2', name: 'Media',    path: '/mnt/media',              protocol: 'smb', read_only: true,  guest_ok: false, enabled: true },
    { id: '3', name: 'Backups',  path: '/mnt/backups',            protocol: 'nfs', read_only: false, guest_ok: false, enabled: true },
    { id: '4', name: 'TimeMachine', path: '/mnt/storage/timemachine', protocol: 'smb', read_only: false, guest_ok: false, enabled: false },
  ],
}

// ── Backup ───────────────────────────────────────────────────────────

export const BACKUP_JOBS = {
  jobs: [
    { id: '1', name: 'Daily Home Backup',    source: '/home',         destination: '/mnt/backups/home',    schedule: '0 2 * * *',  enabled: true,  last_run: ts(0), last_status: 'success', next_run: ts(-1) },
    { id: '2', name: 'Weekly Media Backup',   source: '/mnt/media',    destination: '/mnt/backups/media',   schedule: '0 3 * * 0', enabled: true,  last_run: ts(3), last_status: 'success', next_run: ts(-4) },
    { id: '3', name: 'Config Backup to Cloud', source: '/etc',          destination: 'remote:nasOS-config', schedule: '0 4 * * *',  enabled: false, last_run: ts(7), last_status: 'success', next_run: null },
  ],
}

export const BACKUP_SNAPSHOTS = {
  snapshots: [
    { id: 's1', job_id: '1', timestamp: ts(0), size: 1073741824,  paths: ['/home'] },
    { id: 's2', job_id: '1', timestamp: ts(1), size: 1048576000,  paths: ['/home'] },
    { id: 's3', job_id: '2', timestamp: ts(3), size: 5368709120,  paths: ['/mnt/media'] },
    { id: 's4', job_id: '1', timestamp: ts(2), size: 1060000000,  paths: ['/home'] },
  ],
}

export const BACKUP_REMOTES = {
  remotes: [
    { name: 'remote', type: 'b2', bucket: 'nasos-backup-demo' },
  ],
}

// ── Security ─────────────────────────────────────────────────────────

export const SECURITY_OVERVIEW = {
  firewall_enabled: true,
  fail2ban_enabled: true,
  ssh_password_auth: false,
  ssh_root_login: false,
  tls_enabled: true,
  open_ports: [22, 80, 443, 445, 8080],
  recent_bans: 3,
  uptime_days: 47,
}

export const SECURITY_FIREWALL = {
  enabled: true,
  default_policy: 'deny',
  rules: [
    { id: '1', port: 22,   protocol: 'tcp', action: 'allow', source: 'any',           description: 'SSH' },
    { id: '2', port: 80,   protocol: 'tcp', action: 'allow', source: 'any',           description: 'HTTP' },
    { id: '3', port: 443,  protocol: 'tcp', action: 'allow', source: 'any',           description: 'HTTPS' },
    { id: '4', port: 445,  protocol: 'tcp', action: 'allow', source: '192.168.1.0/24', description: 'SMB (LAN only)' },
    { id: '5', port: 8080, protocol: 'tcp', action: 'allow', source: '192.168.1.0/24', description: 'nasOS Web UI' },
  ],
}

export const SECURITY_FAIL2BAN = {
  enabled: true,
  jails: [
    { name: 'sshd',     enabled: true, banned: 2, total_banned: 47, find_time: 600, ban_time: 3600, max_retry: 5 },
    { name: 'nasos-web', enabled: true, banned: 1, total_banned: 12, find_time: 600, ban_time: 3600, max_retry: 5 },
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

export const UPDATE_STATUS = {
  current_version: '1.2.0',
  update_available: false,
  staged: null,
  rollback_available: true,
  rollback_version: '1.1.0',
}

export const UPDATE_CHECK_CACHED = {
  available: false,
  current_version: '1.2.0',
  latest_version: '1.2.0',
  checked_at: new Date().toISOString(),
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

export const LOGS_DATA = {
  logs: [
    { timestamp: ts(0),   level: 'INFO',    source: 'system',  message: 'System health check passed' },
    { timestamp: ts(0),   level: 'INFO',    source: 'docker',  message: 'Container plex health check OK' },
    { timestamp: ts(0),   level: 'INFO',    source: 'smbd',    message: 'Client 192.168.1.50 connected to share "Public"' },
    { timestamp: ts(0),   level: 'WARNING', source: 'fail2ban', message: 'Ban 203.0.113.42 (sshd): too many auth failures' },
    { timestamp: ts(0),   level: 'INFO',    source: 'backup',  message: 'Daily Home Backup completed (1.0 GB, 2m 14s)' },
    { timestamp: ts(0.1), level: 'INFO',    source: 'docker',  message: 'Container nextcloud health check OK' },
    { timestamp: ts(0.1), level: 'INFO',    source: 'system',  message: 'Disk temperature check: all nominal' },
    { timestamp: ts(0.2), level: 'ERROR',   source: 'smbd',    message: 'Permission denied for guest on share "Media"' },
    { timestamp: ts(0.3), level: 'INFO',    source: 'system',  message: 'Network interface eth0: 1000 Mbps full-duplex' },
    { timestamp: ts(0.5), level: 'INFO',    source: 'avahi',   message: 'Registered nasos-demo.local on eth0' },
    { timestamp: ts(1),   level: 'WARNING', source: 'storage', message: 'Disk /dev/sdb temperature 38°C (threshold: 45°C)' },
    { timestamp: ts(1),   level: 'INFO',    source: 'backup',  message: 'Snapshot s1 created for Daily Home Backup' },
    { timestamp: ts(2),   level: 'INFO',    source: 'system',  message: 'System update check: no updates available' },
    { timestamp: ts(3),   level: 'INFO',    source: 'backup',  message: 'Weekly Media Backup completed (5.0 GB, 12m 34s)' },
    { timestamp: ts(5),   level: 'INFO',    source: 'docker',  message: 'Image linuxserver/plex:latest pulled successfully' },
  ],
}

// ── Extras ───────────────────────────────────────────────────────────

export const EXTRAS_THERMAL = {
  zones: [
    { name: 'cpu-thermal', temperature: 52.3, critical: 100.0 },
    { name: 'gpu-thermal', temperature: 48.1, critical: 100.0 },
  ],
}

export const EXTRAS_UPS = {
  present: false,
}

export const EXTRAS_AVAHI = {
  enabled: true,
  hostname: 'nasos-demo',
  domain: 'local',
  services: [
    { name: 'nasOS Web UI', type: '_http._tcp', port: 8080 },
    { name: 'nasOS SMB',    type: '_smb._tcp',  port: 445 },
  ],
}

export const EXTRAS_TIMEMACHINE = {
  enabled: false,
  share: null,
  size_limit: null,
}
