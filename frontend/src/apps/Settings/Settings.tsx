import { useCallback, useEffect, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────

interface User {
  uid: number
  username: string
  fullname: string
  groups: string[]
  shell: string
  home: string
}

interface Group {
  gid: number
  name: string
  members: string[]
}

interface NetworkInterface {
  name: string
  type: string
  state: string
  mac: string
  ipv4: string
  netmask: string
  gateway: string
  method: string
  speed: string
}

interface NetworkInfo {
  hostname: string
  domain: string
  interfaces: NetworkInterface[]
  dns: string[]
}

interface ServiceInfo {
  name: string
  display: string
  description: string
  status: string
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

type SettingsTab =
  | 'users'
  | 'network'
  | 'services'
  | 'security'
  | 'thermal'
  | 'ups'
  | 'updates'
  | 'avahi'
  | 'timemachine'

export function Settings({ initialTab }: { initialTab?: SettingsTab } = {}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab || 'security')

  return (
    <div className="set-root">
      <div className="set-sidebar">
        <div className="set-nav-group">System</div>
        <button className={`set-nav ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          👤 Users & Groups
        </button>
        <button className={`set-nav ${tab === 'network' ? 'active' : ''}`} onClick={() => setTab('network')}>
          🌐 Network
        </button>
        <button className={`set-nav ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>
          ⚡ Services
        </button>
        <button className={`set-nav ${tab === 'avahi' ? 'active' : ''}`} onClick={() => setTab('avahi')}>
          📡 Avahi / mDNS
        </button>

        <div className="set-nav-group">Hardware</div>
        <button className={`set-nav ${tab === 'thermal' ? 'active' : ''}`} onClick={() => setTab('thermal')}>
          🌡️ Thermal
        </button>
        <button className={`set-nav ${tab === 'ups' ? 'active' : ''}`} onClick={() => setTab('ups')}>
          🔋 UPS / Power
        </button>

        <div className="set-nav-group">Security</div>
        <button className={`set-nav ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>
          🛡️ Security
        </button>

        <div className="set-nav-group">Maintenance</div>
        <button className={`set-nav ${tab === 'updates' ? 'active' : ''}`} onClick={() => setTab('updates')}>
          📦 Updates
        </button>
        <button className={`set-nav ${tab === 'timemachine' ? 'active' : ''}`} onClick={() => setTab('timemachine')}>
          🍎 Time Machine
        </button>
      </div>
      <div className="set-content">
        {tab === 'users' && <UsersTab />}
        {tab === 'network' && <NetworkTab />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'thermal' && <ThermalTab />}
        {tab === 'ups' && <UpsTab />}
        {tab === 'updates' && <UpdatesTab />}
        {tab === 'avahi' && <AvahiTab />}
        {tab === 'timemachine' && <TimeMachineTab />}
      </div>
    </div>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', fullname: '' })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [u, g] = await Promise.all([api('/api/users'), api('/api/users/groups')])
      setUsers(u.users)
      setGroups(g.groups)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!newUser.username || !newUser.password) {
      setError('Username and password required')
      return
    }
    try {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      })
      setShowCreate(false)
      setNewUser({ username: '', password: '', fullname: '' })
      setError('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  const handleDelete = async (username: string) => {
    try {
      await api(`/api/users/${username}`, { method: 'DELETE' })
      load()
    } catch { /* ignore */ }
  }

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>System Users</h3>
        <button className="set-btn set-btn-primary" onClick={() => setShowCreate(true)}>+ Add User</button>
      </div>

      <div className="set-table">
        <div className="set-table-header">
          <span className="set-col-user">User</span>
          <span className="set-col-groups">Groups</span>
          <span className="set-col-shell">Shell</span>
          <span className="set-col-actions">Actions</span>
        </div>
        {users.map((u) => (
          <div key={u.uid} className="set-table-row">
            <span className="set-col-user">
              <span className="set-user-avatar">👤</span>
              <span>
                <div className="set-user-name">{u.username}</div>
                {u.fullname && <div className="set-user-full">{u.fullname}</div>}
              </span>
            </span>
            <span className="set-col-groups">
              {u.groups.map((g) => (
                <span key={g} className="set-group-badge">{g}</span>
              ))}
            </span>
            <span className="set-col-shell set-mono">{u.shell}</span>
            <span className="set-col-actions">
              {u.username !== 'admin' && (
                <button className="set-btn-sm set-btn-danger" onClick={() => handleDelete(u.username)}>
                  Delete
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="set-section-header" style={{ marginTop: 24 }}>
        <h3>Groups</h3>
      </div>
      <div className="set-group-list">
        {groups.map((g) => (
          <div key={g.gid} className="set-group-card">
            <div className="set-group-name">{g.name}</div>
            <div className="set-group-members">
              {g.members.length > 0 ? g.members.join(', ') : <em>No members</em>}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="shr-overlay" onClick={() => setShowCreate(false)}>
          <div className="shr-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>Create User</h3>
              <button className="shr-btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            {error && <div className="shr-wizard-error">{error}</div>}
            <div className="shr-wizard-body">
              <label className="shr-field">
                <span>Username</span>
                <input type="text" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} placeholder="e.g. johndoe" />
              </label>
              <label className="shr-field">
                <span>Full Name</span>
                <input type="text" value={newUser.fullname} onChange={(e) => setNewUser({ ...newUser, fullname: e.target.value })} placeholder="John Doe" />
              </label>
              <label className="shr-field">
                <span>Password</span>
                <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="••••••••" />
              </label>
            </div>
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="shr-btn shr-btn-primary" onClick={handleCreate}>Create User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Network Tab ──────────────────────────────────────────────────

function NetworkTab() {
  const [info, setInfo] = useState<NetworkInfo | null>(null)

  useEffect(() => {
    api('/api/network').then(setInfo).catch(() => {})
  }, [])

  if (!info) return <div className="set-loading">Loading network info...</div>

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>Network Configuration</h3>
      </div>

      <div className="set-info-grid">
        <div className="set-info-card">
          <div className="set-info-label">Hostname</div>
          <div className="set-info-value">{info.hostname}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Domain</div>
          <div className="set-info-value">{info.domain}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">DNS Servers</div>
          <div className="set-info-value set-mono">{info.dns.join(', ')}</div>
        </div>
      </div>

      <div className="set-section-header" style={{ marginTop: 20 }}>
        <h3>Network Interfaces</h3>
      </div>

      <div className="set-iface-list">
        {info.interfaces.map((iface) => (
          <div key={iface.name} className={`set-iface-card ${iface.state === 'up' ? '' : 'set-iface-down'}`}>
            <div className="set-iface-header">
              <span className="set-iface-icon">{iface.type === 'wifi' ? '📶' : '🔌'}</span>
              <span className="set-iface-name">{iface.name}</span>
              <span className={`set-iface-state ${iface.state === 'up' ? 'set-state-up' : 'set-state-down'}`}>
                {iface.state}
              </span>
              {iface.speed && <span className="set-iface-speed">{iface.speed}</span>}
            </div>
            {iface.state === 'up' && (
              <div className="set-iface-body">
                <div className="set-iface-row">
                  <span>IP Address</span>
                  <span className="set-mono">{iface.ipv4}</span>
                </div>
                <div className="set-iface-row">
                  <span>Subnet Mask</span>
                  <span className="set-mono">{iface.netmask}</span>
                </div>
                <div className="set-iface-row">
                  <span>Gateway</span>
                  <span className="set-mono">{iface.gateway}</span>
                </div>
                <div className="set-iface-row">
                  <span>MAC Address</span>
                  <span className="set-mono">{iface.mac}</span>
                </div>
                <div className="set-iface-row">
                  <span>Method</span>
                  <span>{iface.method.toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Services Tab ─────────────────────────────────────────────────

function ServicesTab() {
  const [services, setServices] = useState<ServiceInfo[]>([])

  const load = useCallback(async () => {
    try {
      const data = await api('/api/network/services')
      setServices(data.services)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>System Services</h3>
        <button className="set-btn" onClick={load}>↻ Refresh</button>
      </div>

      <div className="set-services-list">
        {services.map((svc) => (
          <div key={svc.name} className="set-service-row">
            <div className={`set-service-dot ${svc.status === 'active' ? 'set-dot-active' : 'set-dot-inactive'}`} />
            <div className="set-service-info">
              <div className="set-service-name">{svc.display}</div>
              <div className="set-service-desc">{svc.description}</div>
            </div>
            <div className={`set-service-status ${svc.status === 'active' ? 'set-status-active' : 'set-status-inactive'}`}>
              {svc.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Security Tab ────────────────────────────────────────────────

interface SecurityOverview {
  tls: { status: string; cert_type: string }
  firewall: { enabled: boolean; rules_count: number }
  fail2ban: { enabled: boolean; active_bans: number }
  ssh: { key_only: boolean; root_login: boolean }
  two_factor: { enabled: boolean }
  issues: { level: string; message: string }[]
  score: number
}

interface FirewallRule {
  id: number
  action: string
  port: string
  from: string
  description: string
}

interface Fail2banJail {
  name: string
  enabled: boolean
  banned: number
  total_bans: number
  max_retries: number
  ban_time: number
}

function SecurityTab() {
  const [overview, setOverview] = useState<SecurityOverview | null>(null)
  const [firewall, setFirewall] = useState<{ enabled: boolean; default_policy: string; rules: FirewallRule[] } | null>(null)
  const [fail2ban, setFail2ban] = useState<{ enabled: boolean; jails: Fail2banJail[] } | null>(null)
  const [ssh, setSsh] = useState<Record<string, unknown> | null>(null)
  const [tls, setTls] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    Promise.all([
      api('/api/security/overview'),
      api('/api/security/firewall'),
      api('/api/security/fail2ban'),
      api('/api/security/ssh'),
      api('/api/security/tls'),
    ]).then(([o, fw, f2b, s, t]) => {
      setOverview(o)
      setFirewall(fw)
      setFail2ban(f2b)
      setSsh(s)
      setTls(t)
    }).catch(() => {})
  }, [])

  if (!overview) return <div className="set-loading">Loading security info...</div>

  const scoreColor = overview.score >= 80 ? '#66bb6a' : overview.score >= 50 ? '#ffa726' : '#ff5252'

  return (
    <div className="set-tab-content">
      {/* Security Score */}
      <div className="sec-score-card">
        <div className="sec-score-ring" style={{ '--score-color': scoreColor, '--score-pct': `${overview.score}%` } as React.CSSProperties}>
          <div className="sec-score-value">{overview.score}</div>
          <div className="sec-score-label">Security Score</div>
        </div>
        <div className="sec-score-summary">
          <div className="sec-score-items">
            <div className="sec-score-item">
              <span className={`sec-dot ${overview.tls.status === 'valid' ? 'sec-dot-ok' : 'sec-dot-warn'}`} />
              HTTPS: {overview.tls.cert_type}
            </div>
            <div className="sec-score-item">
              <span className={`sec-dot ${overview.firewall.enabled ? 'sec-dot-ok' : 'sec-dot-bad'}`} />
              Firewall: {overview.firewall.enabled ? `${overview.firewall.rules_count} rules` : 'Disabled'}
            </div>
            <div className="sec-score-item">
              <span className={`sec-dot ${overview.fail2ban.enabled ? 'sec-dot-ok' : 'sec-dot-bad'}`} />
              Fail2ban: {overview.fail2ban.active_bans} active bans
            </div>
            <div className="sec-score-item">
              <span className={`sec-dot ${overview.ssh.key_only ? 'sec-dot-ok' : 'sec-dot-warn'}`} />
              SSH: {overview.ssh.key_only ? 'Key-only' : 'Password auth'}
            </div>
            <div className="sec-score-item">
              <span className={`sec-dot ${overview.two_factor.enabled ? 'sec-dot-ok' : 'sec-dot-warn'}`} />
              2FA: {overview.two_factor.enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          {overview.issues.length > 0 && (
            <div className="sec-issues">
              {overview.issues.map((issue, i) => (
                <div key={i} className={`sec-issue sec-issue-${issue.level}`}>
                  {issue.level === 'warning' ? '⚠️' : 'ℹ️'} {issue.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TLS / HTTPS */}
      {tls && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>TLS / HTTPS</h3>
          </div>
          <div className="set-info-grid">
            <div className="set-info-card">
              <div className="set-info-label">Certificate Type</div>
              <div className="set-info-value">{String(tls.cert_type)}</div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Issuer</div>
              <div className="set-info-value">{String(tls.issuer)}</div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Status</div>
              <div className="set-info-value" style={{ color: tls.status === 'valid' ? '#66bb6a' : '#ff5252' }}>
                {String(tls.status).toUpperCase()}
              </div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Auto Renew</div>
              <div className="set-info-value">{tls.auto_renew ? 'Yes' : 'No'}</div>
            </div>
          </div>
        </>
      )}

      {/* Firewall Rules */}
      {firewall && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>Firewall Rules</h3>
            <span className={`sec-badge ${firewall.enabled ? 'sec-badge-on' : 'sec-badge-off'}`}>
              {firewall.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div className="sec-fw-policy">Default policy: <strong>{firewall.default_policy.toUpperCase()}</strong></div>
          <div className="set-table">
            <div className="set-table-header">
              <span style={{ flex: 1 }}>Action</span>
              <span style={{ flex: 2 }}>Port</span>
              <span style={{ flex: 2 }}>From</span>
              <span style={{ flex: 2 }}>Description</span>
            </div>
            {firewall.rules.map((r) => (
              <div key={r.id} className="set-table-row">
                <span style={{ flex: 1 }}>
                  <span className={`sec-action sec-action-${r.action}`}>{r.action.toUpperCase()}</span>
                </span>
                <span style={{ flex: 2 }} className="set-mono">{r.port}</span>
                <span style={{ flex: 2 }} className="set-mono">{r.from}</span>
                <span style={{ flex: 2 }}>{r.description}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Fail2ban */}
      {fail2ban && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>Fail2ban Jails</h3>
            <span className={`sec-badge ${fail2ban.enabled ? 'sec-badge-on' : 'sec-badge-off'}`}>
              {fail2ban.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div className="sec-jail-list">
            {fail2ban.jails.map((jail) => (
              <div key={jail.name} className="sec-jail">
                <div className="sec-jail-name">
                  <span className={`set-service-dot ${jail.enabled ? 'set-dot-active' : 'set-dot-inactive'}`} />
                  {jail.name}
                </div>
                <div className="sec-jail-stats">
                  <span className="sec-jail-stat">
                    <span className="sec-jail-num" style={{ color: jail.banned > 0 ? '#ff5252' : '#66bb6a' }}>{jail.banned}</span>
                    <span className="sec-jail-lbl">banned</span>
                  </span>
                  <span className="sec-jail-stat">
                    <span className="sec-jail-num">{jail.total_bans}</span>
                    <span className="sec-jail-lbl">total</span>
                  </span>
                  <span className="sec-jail-stat">
                    <span className="sec-jail-num">{jail.max_retries}</span>
                    <span className="sec-jail-lbl">retries</span>
                  </span>
                  <span className="sec-jail-stat">
                    <span className="sec-jail-num">{jail.ban_time}s</span>
                    <span className="sec-jail-lbl">ban time</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* SSH */}
      {ssh && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>SSH Configuration</h3>
          </div>
          <div className="set-info-grid">
            <div className="set-info-card">
              <div className="set-info-label">Port</div>
              <div className="set-info-value set-mono">{String(ssh.port)}</div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Key-Only Auth</div>
              <div className="set-info-value" style={{ color: ssh.key_only ? '#66bb6a' : '#ffa726' }}>
                {ssh.key_only ? 'Yes' : 'No'}
              </div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Root Login</div>
              <div className="set-info-value" style={{ color: ssh.root_login ? '#ff5252' : '#66bb6a' }}>
                {ssh.root_login ? 'Allowed' : 'Disabled'}
              </div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Active Sessions</div>
              <div className="set-info-value">{String(ssh.active_sessions)}</div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Authorized Keys</div>
              <div className="set-info-value">{String(ssh.authorized_keys_count)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Thermal Tab ──────────────────────────────────────────────────

interface ThermalData {
  cpu_temp: number
  gpu_temp: number
  throttled: boolean
  throttle_flags: Record<string, boolean>
  fan: { present: boolean; mode: string; speed_pct: number; rpm: number }
  fan_curves: Record<string, Record<string, number>>
  temp_history_24h: { min: number; max: number; avg: number }
}

function ThermalTab() {
  const [data, setData] = useState<ThermalData | null>(null)

  useEffect(() => {
    api('/api/extras/thermal').then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="set-loading">Loading thermal data...</div>

  const tempColor = (t: number) => t > 75 ? '#ff5252' : t > 60 ? '#ffa726' : '#66bb6a'
  const tempLabel = (t: number) => t > 75 ? 'HOT' : t > 60 ? 'WARM' : 'NORMAL'

  return (
    <div className="set-tab-content">
      <div className="set-section-header"><h3>Temperature</h3></div>

      <div className="thm-temp-cards">
        <div className="thm-temp-card">
          <div className="thm-temp-icon">🧠</div>
          <div className="thm-temp-val" style={{ color: tempColor(data.cpu_temp) }}>{data.cpu_temp.toFixed(1)}°C</div>
          <div className="thm-temp-label">CPU</div>
          <div className="thm-temp-status" style={{ color: tempColor(data.cpu_temp) }}>{tempLabel(data.cpu_temp)}</div>
        </div>
        <div className="thm-temp-card">
          <div className="thm-temp-icon">🎮</div>
          <div className="thm-temp-val" style={{ color: tempColor(data.gpu_temp) }}>{data.gpu_temp.toFixed(1)}°C</div>
          <div className="thm-temp-label">GPU</div>
          <div className="thm-temp-status" style={{ color: tempColor(data.gpu_temp) }}>{tempLabel(data.gpu_temp)}</div>
        </div>
        <div className="thm-temp-card">
          <div className="thm-temp-icon">📊</div>
          <div className="thm-temp-val">{data.temp_history_24h.avg.toFixed(1)}°C</div>
          <div className="thm-temp-label">24h Average</div>
          <div className="thm-temp-range">{data.temp_history_24h.min.toFixed(1)}° — {data.temp_history_24h.max.toFixed(1)}°</div>
        </div>
      </div>

      {/* Throttle Status */}
      <div className="set-section-header" style={{ marginTop: 20 }}>
        <h3>Throttle Status</h3>
        <span className={`sec-badge ${data.throttled ? 'sec-badge-off' : 'sec-badge-on'}`}>
          {data.throttled ? 'THROTTLED' : 'No Throttling'}
        </span>
      </div>
      <div className="thm-throttle-grid">
        {Object.entries(data.throttle_flags).map(([key, val]) => (
          <div key={key} className={`thm-throttle-item ${val ? 'thm-throttle-active' : ''}`}>
            <span className={`sec-dot ${val ? 'sec-dot-bad' : 'sec-dot-ok'}`} />
            {key.replace(/_/g, ' ')}
          </div>
        ))}
      </div>

      {/* Fan Control */}
      {data.fan.present && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}><h3>Fan Control</h3></div>
          <div className="thm-fan-card">
            <div className="thm-fan-info">
              <div className="thm-fan-mode">
                Mode: <strong>{data.fan.mode}</strong>
              </div>
              <div className="thm-fan-speed">Speed: {data.fan.speed_pct}% ({data.fan.rpm} RPM)</div>
              <div className="thm-fan-bar-track">
                <div className="thm-fan-bar-fill" style={{ width: `${data.fan.speed_pct}%` }} />
              </div>
            </div>
            <div className="thm-fan-modes">
              {Object.keys(data.fan_curves).map((mode) => (
                <button
                  key={mode}
                  className={`thm-fan-mode-btn ${data.fan.mode === mode ? 'active' : ''}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── UPS Tab ──────────────────────────────────────────────────────

interface UpsData {
  connected: boolean
  model?: string
  driver?: string
  status?: string
  battery_percent?: number
  load_percent?: number
  runtime_sec?: number
  input_voltage?: number
  output_voltage?: number
  temperature_c?: number
  last_event?: string
  last_event_time?: string
  shutdown_config?: { on_battery_min: number; low_battery_action: string; critical_battery_pct: number }
}

function UpsTab() {
  const [data, setData] = useState<UpsData | null>(null)

  useEffect(() => {
    api('/api/extras/ups').then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="set-loading">Loading UPS status...</div>

  if (!data.connected) {
    return (
      <div className="set-tab-content">
        <div className="set-section-header"><h3>UPS / Power</h3></div>
        <div className="ups-not-connected">
          <div className="ups-nc-icon">🔌</div>
          <div className="ups-nc-text">No UPS detected</div>
          <div className="ups-nc-hint">Connect a USB UPS and it will be automatically detected via NUT.</div>
        </div>
      </div>
    )
  }

  const statusLabel: Record<string, string> = { OL: 'Online', OB: 'On Battery', LB: 'Low Battery' }
  const statusColor: Record<string, string> = { OL: '#66bb6a', OB: '#ffa726', LB: '#ff5252' }
  const st = data.status || 'OL'

  const fmtRuntime = (sec: number) => {
    const m = Math.floor(sec / 60)
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
  }

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>{data.model}</h3>
        <span className="sec-badge sec-badge-on" style={{ background: `${statusColor[st]}22`, color: statusColor[st] }}>
          {statusLabel[st] || st}
        </span>
      </div>

      <div className="ups-gauge-row">
        <div className="ups-gauge">
          <div className="ups-gauge-label">Battery</div>
          <div className="ups-gauge-bar-track">
            <div
              className="ups-gauge-bar-fill"
              style={{
                width: `${data.battery_percent}%`,
                background: data.battery_percent! > 50 ? '#66bb6a' : data.battery_percent! > 20 ? '#ffa726' : '#ff5252',
              }}
            />
          </div>
          <div className="ups-gauge-value">{data.battery_percent}%</div>
        </div>
        <div className="ups-gauge">
          <div className="ups-gauge-label">Load</div>
          <div className="ups-gauge-bar-track">
            <div
              className="ups-gauge-bar-fill"
              style={{
                width: `${data.load_percent}%`,
                background: data.load_percent! < 60 ? '#4fc3f7' : data.load_percent! < 80 ? '#ffa726' : '#ff5252',
              }}
            />
          </div>
          <div className="ups-gauge-value">{data.load_percent}%</div>
        </div>
      </div>

      <div className="set-info-grid" style={{ marginTop: 16 }}>
        <div className="set-info-card">
          <div className="set-info-label">Runtime</div>
          <div className="set-info-value">{fmtRuntime(data.runtime_sec!)}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Input Voltage</div>
          <div className="set-info-value set-mono">{data.input_voltage} V</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Output Voltage</div>
          <div className="set-info-value set-mono">{data.output_voltage} V</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Temperature</div>
          <div className="set-info-value">{data.temperature_c}°C</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Driver</div>
          <div className="set-info-value set-mono">{data.driver}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Last Event</div>
          <div className="set-info-value">{data.last_event}</div>
        </div>
      </div>

      {data.shutdown_config && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}><h3>Shutdown Policy</h3></div>
          <div className="set-info-grid">
            <div className="set-info-card">
              <div className="set-info-label">On Battery Timeout</div>
              <div className="set-info-value">{data.shutdown_config.on_battery_min} min</div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Low Battery Action</div>
              <div className="set-info-value">{data.shutdown_config.low_battery_action}</div>
            </div>
            <div className="set-info-card">
              <div className="set-info-label">Critical Battery</div>
              <div className="set-info-value">{data.shutdown_config.critical_battery_pct}%</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Updates Tab ──────────────────────────────────────────────────

interface UpdateData {
  current_version: string
  latest_version: string
  update_available: boolean
  channel: string
  last_check: string
  auto_check: boolean
  auto_install: boolean
  partition_scheme: string
  active_partition: string
  changelog: { version: string; date: string; changes: string[] }[]
  rollback_available: boolean
  rollback_version: string
}

function UpdatesTab() {
  const [data, setData] = useState<UpdateData | null>(null)

  useEffect(() => {
    api('/api/extras/updates').then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="set-loading">Loading update status...</div>

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>System Updates</h3>
        {data.update_available && <span className="sec-badge upd-badge-avail">Update Available</span>}
      </div>

      <div className="upd-version-row">
        <div className="upd-ver-card">
          <div className="upd-ver-label">Current Version</div>
          <div className="upd-ver-value">v{data.current_version}</div>
        </div>
        {data.update_available && (
          <>
            <div className="upd-ver-arrow">→</div>
            <div className="upd-ver-card upd-ver-new">
              <div className="upd-ver-label">Latest Version</div>
              <div className="upd-ver-value">v{data.latest_version}</div>
            </div>
          </>
        )}
      </div>

      <div className="set-info-grid" style={{ marginTop: 16 }}>
        <div className="set-info-card">
          <div className="set-info-label">Channel</div>
          <div className="set-info-value">{data.channel}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Partition Scheme</div>
          <div className="set-info-value">{data.partition_scheme}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Active Partition</div>
          <div className="set-info-value set-mono">{data.active_partition}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Auto Check</div>
          <div className="set-info-value">{data.auto_check ? 'Yes' : 'No'}</div>
        </div>
      </div>

      {data.rollback_available && (
        <div className="upd-rollback">
          <span>Rollback available to v{data.rollback_version}</span>
          <button className="set-btn">Rollback</button>
        </div>
      )}

      {/* Changelog */}
      <div className="set-section-header" style={{ marginTop: 20 }}><h3>Changelog</h3></div>
      <div className="upd-changelog">
        {data.changelog.map((entry) => (
          <div key={entry.version} className="upd-cl-entry">
            <div className="upd-cl-header">
              <span className="upd-cl-version">v{entry.version}</span>
              <span className="upd-cl-date">{entry.date}</span>
            </div>
            <ul className="upd-cl-changes">
              {entry.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Avahi / mDNS Tab ────────────────────────────────────────────

interface AvahiData {
  enabled: boolean
  hostname: string
  services: { type: string; name: string; port: number }[]
  discovered_devices: { name: string; address: string; type: string }[]
}

function AvahiTab() {
  const [data, setData] = useState<AvahiData | null>(null)

  useEffect(() => {
    api('/api/extras/avahi').then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="set-loading">Loading Avahi status...</div>

  const deviceIcon: Record<string, string> = { computer: '💻', phone: '📱', printer: '🖨️' }

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>Avahi / mDNS</h3>
        <span className={`sec-badge ${data.enabled ? 'sec-badge-on' : 'sec-badge-off'}`}>
          {data.enabled ? 'Active' : 'Disabled'}
        </span>
      </div>

      <div className="set-info-grid">
        <div className="set-info-card">
          <div className="set-info-label">Hostname</div>
          <div className="set-info-value set-mono">{data.hostname}</div>
        </div>
      </div>

      <div className="set-section-header" style={{ marginTop: 20 }}><h3>Published Services</h3></div>
      <div className="ava-service-list">
        {data.services.map((svc) => (
          <div key={svc.type} className="ava-service-row">
            <span className="ava-service-type set-mono">{svc.type}</span>
            <span className="ava-service-name">{svc.name}</span>
            <span className="ava-service-port">{svc.port > 0 ? `port ${svc.port}` : '—'}</span>
          </div>
        ))}
      </div>

      <div className="set-section-header" style={{ marginTop: 20 }}><h3>Discovered Devices</h3></div>
      <div className="ava-device-list">
        {data.discovered_devices.map((dev) => (
          <div key={dev.name} className="ava-device-card">
            <span className="ava-device-icon">{deviceIcon[dev.type] || '📟'}</span>
            <div className="ava-device-info">
              <div className="ava-device-name">{dev.name}</div>
              <div className="ava-device-addr set-mono">{dev.address}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Time Machine Tab ────────────────────────────────────────────

interface TimeMachineData {
  enabled: boolean
  share_name: string
  share_path: string
  quota_gb: number
  used_gb: number
  vfs_modules: string[]
  connected_macs: { hostname: string; last_backup: string; size_gb: number }[]
}

function TimeMachineTab() {
  const [data, setData] = useState<TimeMachineData | null>(null)

  useEffect(() => {
    api('/api/extras/timemachine').then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="set-loading">Loading Time Machine config...</div>

  const usedPct = data.quota_gb > 0 ? Math.round((data.used_gb / data.quota_gb) * 100) : 0

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>Time Machine</h3>
        <span className={`sec-badge ${data.enabled ? 'sec-badge-on' : 'sec-badge-off'}`}>
          {data.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="set-info-grid">
        <div className="set-info-card">
          <div className="set-info-label">Share Name</div>
          <div className="set-info-value">{data.share_name || '—'}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">Share Path</div>
          <div className="set-info-value set-mono">{data.share_path || '—'}</div>
        </div>
        <div className="set-info-card">
          <div className="set-info-label">VFS Modules</div>
          <div className="set-info-value set-mono">{data.vfs_modules.join(', ') || '—'}</div>
        </div>
      </div>

      {data.quota_gb > 0 && (
        <div className="tm-quota" style={{ marginTop: 16 }}>
          <div className="tm-quota-header">
            <span>Storage Quota</span>
            <span>{data.used_gb} GB / {data.quota_gb} GB ({usedPct}%)</span>
          </div>
          <div className="ups-gauge-bar-track">
            <div
              className="ups-gauge-bar-fill"
              style={{
                width: `${usedPct}%`,
                background: usedPct > 90 ? '#ff5252' : usedPct > 70 ? '#ffa726' : '#4fc3f7',
              }}
            />
          </div>
        </div>
      )}

      {data.connected_macs.length > 0 && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}><h3>Connected Macs</h3></div>
          <div className="tm-mac-list">
            {data.connected_macs.map((mac) => (
              <div key={mac.hostname} className="tm-mac-card">
                <span className="tm-mac-icon">🍎</span>
                <div className="tm-mac-info">
                  <div className="tm-mac-name">{mac.hostname}</div>
                  <div className="tm-mac-detail">Backup size: {mac.size_gb} GB</div>
                  <div className="tm-mac-detail">Last backup: {new Date(mac.last_backup).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
