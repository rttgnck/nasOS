import { Component, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, BatteryCharging, Clock, Cpu, Globe, Info, Lock, LockOpen,
  Monitor, Network, Package, Palette, Plug, Printer, Radio, RotateCcw, Shield, Smartphone, Thermometer,
  User as UserIcon, Users, Wifi, WifiOff, Zap,
} from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useSystemStore } from '../../store/systemStore'
import { PasswordInput } from '../../components/PasswordInput'

// ── Error Boundary ────────────────────────────────────────────────

class TabErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Settings TabErrorBoundary]', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="set-tab-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
          <AlertTriangle size={36} color="#ff5252" />
          <div style={{ color: '#ff5252', fontWeight: 600 }}>Something went wrong in this tab</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error.message}
          </div>
          <button
            className="set-btn"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

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


type SettingsTab =
  | 'personalization'
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
        <div className="set-sidebar-logo">
          <img src="/nasos-logo.svg" alt="nasOS" className="set-logo-img" />
          <span className="set-logo-text">nasOS</span>
        </div>
        <div className="set-nav-group">Appearance</div>
        <button className={`set-nav ${tab === 'personalization' ? 'active' : ''}`} onClick={() => setTab('personalization')}>
          <Palette size={14} strokeWidth={2} /> Personalization
        </button>

        <div className="set-nav-group">System</div>
        <button className={`set-nav ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          <Users size={14} strokeWidth={2} /> Users &amp; Groups
        </button>
        <button className={`set-nav ${tab === 'network' ? 'active' : ''}`} onClick={() => setTab('network')}>
          <Globe size={14} strokeWidth={2} /> Network
        </button>
        <button className={`set-nav ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>
          <Zap size={14} strokeWidth={2} /> Services
        </button>
        <button className={`set-nav ${tab === 'avahi' ? 'active' : ''}`} onClick={() => setTab('avahi')}>
          <Radio size={14} strokeWidth={2} /> Avahi / mDNS
        </button>

        <div className="set-nav-group">Hardware</div>
        <button className={`set-nav ${tab === 'thermal' ? 'active' : ''}`} onClick={() => setTab('thermal')}>
          <Thermometer size={14} strokeWidth={2} /> Thermal
        </button>
        <button className={`set-nav ${tab === 'ups' ? 'active' : ''}`} onClick={() => setTab('ups')}>
          <BatteryCharging size={14} strokeWidth={2} /> UPS / Power
        </button>

        <div className="set-nav-group">Security</div>
        <button className={`set-nav ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>
          <Shield size={14} strokeWidth={2} /> Security
        </button>

        <div className="set-nav-group">Maintenance</div>
        <button className={`set-nav ${tab === 'updates' ? 'active' : ''}`} onClick={() => setTab('updates')}>
          <Package size={14} strokeWidth={2} /> Updates
        </button>
        <button className={`set-nav ${tab === 'timemachine' ? 'active' : ''}`} onClick={() => setTab('timemachine')}>
          <Clock size={14} strokeWidth={2} /> Time Machine
        </button>
      </div>
      <div className="set-content">
        <TabErrorBoundary key={tab}>
          {tab === 'personalization' && <PersonalizationTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'network' && <NetworkTab />}
          {tab === 'services' && <ServicesTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'thermal' && <ThermalTab />}
          {tab === 'ups' && <UpsTab />}
          {tab === 'updates' && <UpdatesTab />}
          {tab === 'avahi' && <AvahiTab />}
          {tab === 'timemachine' && <TimeMachineTab />}
        </TabErrorBoundary>
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

  // Password reveal toggles — replaced by PasswordInput component

  // Set Password modal state
  const [setPwTarget, setSetPwTarget] = useState<string | null>(null)  // username
  const [setPwValue, setSetPwValue] = useState('')
  const [setPwConfirm, setSetPwConfirm] = useState('')
  const [setPwError, setSetPwError] = useState('')
  const [setPwOk, setSetPwOk] = useState(false)

  const load = useCallback(async () => {
    try {
      const [u, g] = await Promise.all([
        api<{ users: User[] }>('/api/users'),
        api<{ groups: Group[] }>('/api/users/groups'),
      ])
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

  const openSetPw = (username: string) => {
    setSetPwTarget(username)
    setSetPwValue('')
    setSetPwConfirm('')
    setSetPwError('')
    setSetPwOk(false)
  }

  const handleSetPassword = async () => {
    if (!setPwValue) { setSetPwError('Password cannot be empty'); return }
    if (setPwValue !== setPwConfirm) { setSetPwError('Passwords do not match'); return }
    try {
      await api(`/api/users/${setPwTarget}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: setPwValue }),
      })
      setSetPwOk(true)
      setSetPwError('')
    } catch (e) {
      setSetPwError(e instanceof Error ? e.message : 'Failed to set password')
    }
  }

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>System Users</h3>
        <button className="set-btn set-btn-primary" onClick={() => setShowCreate(true)}>+ Add User</button>
      </div>

      {/* Note shown when Samba password may not be configured */}
      <div className="set-info-banner" style={{ marginBottom: 12 }}>
        <strong>Tip:</strong> If your network share rejects your password, use <em>Set Password</em> below to sync your credentials.
        Modern Pi Imager stores passwords as hashes that cannot be used to auto-configure Samba.
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
              <UserIcon size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
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
              <button className="set-btn-sm set-btn-secondary" onClick={() => openSetPw(u.username)}>
                Set Password
              </button>
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

      {/* ── Create User modal ── */}
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
                <PasswordInput
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="••••••••"
                />
              </label>
            </div>
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="shr-btn shr-btn-primary" onClick={handleCreate}>Create User</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Set Password modal ── */}
      {setPwTarget !== null && (
        <div className="shr-overlay" onClick={() => setSetPwTarget(null)}>
          <div className="shr-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>Set Password — {setPwTarget}</h3>
              <button className="shr-btn-icon" onClick={() => setSetPwTarget(null)}>✕</button>
            </div>
            {setPwError && <div className="shr-wizard-error">{setPwError}</div>}
            {setPwOk ? (
              <div className="shr-wizard-body">
                <div className="upd-result-ok">
                  Password updated for <strong>{setPwTarget}</strong>.
                  Linux system password and Samba share password are now in sync.
                </div>
              </div>
            ) : (
              <div className="shr-wizard-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Updates both the Linux login password and the network share (SMB) password.
                </p>
                <label className="shr-field">
                  <span>New Password</span>
                  <PasswordInput
                    value={setPwValue}
                    onChange={(e) => setSetPwValue(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                  />
                </label>
                <label className="shr-field">
                  <span>Confirm Password</span>
                  <PasswordInput
                    value={setPwConfirm}
                    onChange={(e) => setSetPwConfirm(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
                  />
                </label>
              </div>
            )}
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setSetPwTarget(null)}>
                {setPwOk ? 'Close' : 'Cancel'}
              </button>
              {!setPwOk && (
                <button className="shr-btn shr-btn-primary" onClick={handleSetPassword}>
                  Set Password
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Network Tab ──────────────────────────────────────────────────

interface WifiStatus {
  enabled: boolean
  connected: boolean
  ssid: string
  ip_address: string
  signal: number
  country: string
}

interface WifiNetwork {
  ssid: string
  signal: number
  security: string
  frequency: string
  connected: boolean
}

function signalBars(dbm: number) {
  const bars = dbm >= -50 ? 4 : dbm >= -65 ? 3 : dbm >= -75 ? 2 : 1
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1, height: 14 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} style={{
          display: 'inline-block', width: 4,
          height: 4 + i * 3, borderRadius: 1,
          background: i < bars ? '#4fc3f7' : 'rgba(255,255,255,0.18)',
        }} />
      ))}
    </span>
  )
}

function NetworkTab() {
  const [info, setInfo] = useState<NetworkInfo | null>(null)
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null)
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(false)
  const [connectModal, setConnectModal] = useState<WifiNetwork | null>(null)
  const [password, setPassword] = useState('')
  const [country, setCountry] = useState('US')
  const [connectError, setConnectError] = useState('')
  const [connectBusy, setConnectBusy] = useState(false)

  const loadInfo = useCallback(() => {
    api<NetworkInfo>('/api/network').then(setInfo).catch(() => {})
    api<WifiStatus>('/api/wifi/status').then(setWifiStatus).catch(() => {})
  }, [])

  useEffect(() => { loadInfo() }, [loadInfo])

  const handleScan = async () => {
    setScanning(true)
    try { setNetworks(await api('/api/wifi/scan')) } catch { /* ignore */ }
    setScanning(false)
  }

  const handleDisconnect = async () => {
    try { await api('/api/wifi/disconnect', { method: 'DELETE' }) } catch { /* ignore */ }
    loadInfo()
    setNetworks([])
  }

  const handleConnect = async () => {
    if (!connectModal) return
    if (connectModal.security !== 'Open' && !password) { setConnectError('Password required'); return }
    setConnectBusy(true); setConnectError('')
    try {
      await api('/api/wifi/connect', {
        method: 'POST',
        body: JSON.stringify({ ssid: connectModal.ssid, password, country }),
      })
      setConnectModal(null)
      loadInfo()
      handleScan()
    } catch (e) { setConnectError(e instanceof Error ? e.message : 'Connection failed') }
    setConnectBusy(false)
  }

  if (!info) return <div className="set-loading">Loading network info...</div>

  return (
    <div className="set-tab-content">
      {/* ── WiFi Status ── */}
      <div className="set-section-header">
        <h3><Wifi size={15} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 6 }} />WiFi</h3>
        {wifiStatus?.connected
          ? <button className="set-btn set-btn-danger" onClick={handleDisconnect}>Disconnect</button>
          : <button className="set-btn" onClick={handleScan} disabled={scanning} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{scanning ? 'Scanning…' : <><RotateCcw size={14} /> Scan</>}</button>
        }
      </div>

      {wifiStatus && (
        <div className={`wifi-status-card ${wifiStatus.connected ? 'wifi-connected' : 'wifi-disconnected'}`}>
          <div className="wifi-status-icon">{wifiStatus.connected ? <Wifi size={22} /> : <WifiOff size={22} />}</div>
          <div className="wifi-status-info">
            {wifiStatus.connected ? (
              <>
                <div className="wifi-status-ssid">{wifiStatus.ssid}</div>
                <div className="wifi-status-meta">
                  {wifiStatus.ip_address && <span>{wifiStatus.ip_address}</span>}
                  {wifiStatus.signal !== 0 && (
                    <span style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {signalBars(wifiStatus.signal)} <span style={{ fontSize: 12, opacity: 0.7 }}>{wifiStatus.signal} dBm</span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="wifi-status-ssid" style={{ opacity: 0.5 }}>Not connected</div>
            )}
          </div>
          {!wifiStatus.connected && (
            <button className="set-btn" onClick={handleScan} disabled={scanning}>
              {scanning ? 'Scanning…' : 'Scan for Networks'}
            </button>
          )}
        </div>
      )}

      {/* ── Scan Results ── */}
      {networks.length > 0 && (
        <>
          <div className="set-section-header" style={{ marginTop: 16 }}>
            <h3>Available Networks</h3>
          </div>
          <div className="wifi-network-list">
            {networks.map((net) => (
              <div
                key={net.ssid}
                className={`wifi-network-row ${net.connected ? 'wifi-network-active' : ''}`}
                onClick={() => { if (!net.connected) { setConnectModal(net); setPassword(''); setCountry(wifiStatus?.country || 'US'); setConnectError('') } }}
              >
                <span className="wifi-network-bars">{signalBars(net.signal)}</span>
                <span className="wifi-network-ssid">{net.ssid}</span>
                <span className="wifi-network-freq" style={{ fontSize: 11, opacity: 0.6 }}>{net.frequency}</span>
                <span style={{ fontSize: 12, opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {net.security === 'Open' ? <LockOpen size={12} /> : <Lock size={12} />} {net.security}
                </span>
                {net.connected
                  ? <span className="wifi-network-connected-badge">Connected ✓</span>
                  : <span className="wifi-network-join">Join →</span>
                }
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Interfaces ── */}
      <div className="set-section-header" style={{ marginTop: 24 }}>
        <h3><Network size={15} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 6 }} />Network Interfaces</h3>
      </div>
      <div className="set-info-grid">
        <div className="set-info-card"><div className="set-info-label">Hostname</div><div className="set-info-value">{info.hostname}</div></div>
        <div className="set-info-card"><div className="set-info-label">Domain</div><div className="set-info-value">{info.domain}</div></div>
        <div className="set-info-card"><div className="set-info-label">DNS</div><div className="set-info-value set-mono">{info.dns.join(', ')}</div></div>
      </div>
      <div className="set-iface-list" style={{ marginTop: 12 }}>
        {info.interfaces.map((iface) => (
          <div key={iface.name} className={`set-iface-card ${iface.state === 'up' ? '' : 'set-iface-down'}`}>
            <div className="set-iface-header">
              <span className="set-iface-icon">{iface.type === 'wifi' ? <Wifi size={14} /> : <Plug size={14} />}</span>
              <span className="set-iface-name">{iface.name}</span>
              <span className={`set-iface-state ${iface.state === 'up' ? 'set-state-up' : 'set-state-down'}`}>{iface.state}</span>
              {iface.speed && <span className="set-iface-speed">{iface.speed}</span>}
            </div>
            {iface.state === 'up' && (
              <div className="set-iface-body">
                <div className="set-iface-row"><span>IP Address</span><span className="set-mono">{iface.ipv4}</span></div>
                <div className="set-iface-row"><span>Subnet Mask</span><span className="set-mono">{iface.netmask}</span></div>
                <div className="set-iface-row"><span>Gateway</span><span className="set-mono">{iface.gateway}</span></div>
                <div className="set-iface-row"><span>MAC</span><span className="set-mono">{iface.mac}</span></div>
                <div className="set-iface-row"><span>Method</span><span>{iface.method.toUpperCase()}</span></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Connect Modal ── */}
      {connectModal && (
        <div className="shr-overlay" onClick={() => setConnectModal(null)}>
          <div className="shr-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>Join "{connectModal.ssid}"</h3>
              <button className="shr-btn-icon" onClick={() => setConnectModal(null)}>✕</button>
            </div>
            {connectError && <div className="shr-wizard-error">{connectError}</div>}
            <div className="shr-wizard-body">
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', opacity: 0.7 }}>
                {signalBars(connectModal.signal)}
                <span style={{ fontSize: 13 }}>{connectModal.frequency} · {connectModal.security}</span>
              </div>
              {connectModal.security !== 'Open' && (
                <label className="shr-field">
                  <span>Password</span>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                    placeholder="Network password"
                    autoFocus
                  />
                </label>
              )}
              <label className="shr-field">
                <span>Country code</span>
                <input type="text" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="US" maxLength={2} style={{ width: 60 }} />
              </label>
            </div>
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setConnectModal(null)}>Cancel</button>
              <button className="shr-btn shr-btn-primary" onClick={handleConnect} disabled={connectBusy}>
                {connectBusy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Services Tab ─────────────────────────────────────────────────

function ServicesTab() {
  const [services, setServices] = useState<ServiceInfo[]>([])

  const load = useCallback(async () => {
    try {
      const data = await api<{ services: ServiceInfo[] }>('/api/network/services')
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
      api<SecurityOverview>('/api/security/overview'),
      api<{ enabled: boolean; default_policy: string; rules: FirewallRule[] }>('/api/security/firewall'),
      api<{ enabled: boolean; jails: Fail2banJail[] }>('/api/security/fail2ban'),
      api<Record<string, unknown>>('/api/security/ssh'),
      api<Record<string, unknown>>('/api/security/tls'),
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
                <div key={i} className={`sec-issue sec-issue-${issue.level}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {issue.level === 'warning' ? <AlertTriangle size={14} /> : <Info size={14} />} {issue.message}
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<ThermalData>('/api/extras/thermal')
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load thermal data'))
  }, [])

  if (error) return <div className="set-loading" style={{ color: '#ff5252' }}>Thermal error: {error}</div>
  if (!data) return <div className="set-loading">Loading thermal data...</div>

  const tempColor = (t: number) => t > 75 ? '#ff5252' : t > 60 ? '#ffa726' : '#66bb6a'
  const tempLabel = (t: number) => t > 75 ? 'HOT' : t > 60 ? 'WARM' : 'NORMAL'

  const cpuTemp = data.cpu_temp ?? 0
  const gpuTemp = data.gpu_temp ?? 0
  const history = data.temp_history_24h ?? { min: cpuTemp, max: cpuTemp, avg: cpuTemp }
  const throttleFlags = data.throttle_flags ?? {}
  const fan = data.fan ?? { present: false, mode: 'N/A', speed_pct: 0, rpm: 0 }
  const fanCurves = data.fan_curves ?? {}

  return (
    <div className="set-tab-content">
      <div className="set-section-header"><h3>Temperature</h3></div>

      <div className="thm-temp-cards">
        <div className="thm-temp-card">
          <div className="thm-temp-icon"><Cpu size={28} /></div>
          <div className="thm-temp-val" style={{ color: tempColor(cpuTemp) }}>{cpuTemp.toFixed(1)}°C</div>
          <div className="thm-temp-label">CPU</div>
          <div className="thm-temp-status" style={{ color: tempColor(cpuTemp) }}>{tempLabel(cpuTemp)}</div>
        </div>
        <div className="thm-temp-card">
          <div className="thm-temp-icon"><Monitor size={28} /></div>
          <div className="thm-temp-val" style={{ color: tempColor(gpuTemp) }}>{gpuTemp.toFixed(1)}°C</div>
          <div className="thm-temp-label">GPU</div>
          <div className="thm-temp-status" style={{ color: tempColor(gpuTemp) }}>{tempLabel(gpuTemp)}</div>
        </div>
        <div className="thm-temp-card">
          <div className="thm-temp-icon"><Thermometer size={28} /></div>
          <div className="thm-temp-val">{(history.avg ?? 0).toFixed(1)}°C</div>
          <div className="thm-temp-label">24h Average</div>
          <div className="thm-temp-range">{(history.min ?? 0).toFixed(1)}° — {(history.max ?? 0).toFixed(1)}°</div>
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
        {Object.entries(throttleFlags).map(([key, val]) => (
          <div key={key} className={`thm-throttle-item ${val ? 'thm-throttle-active' : ''}`}>
            <span className={`sec-dot ${val ? 'sec-dot-bad' : 'sec-dot-ok'}`} />
            {key.replace(/_/g, ' ')}
          </div>
        ))}
        {Object.keys(throttleFlags).length === 0 && (
          <div className="thm-throttle-item" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Throttle data unavailable
          </div>
        )}
      </div>

      {/* Fan Control */}
      {fan.present && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}><h3>Fan Control</h3></div>
          <div className="thm-fan-card">
            <div className="thm-fan-info">
              <div className="thm-fan-mode">
                Mode: <strong>{fan.mode}</strong>
              </div>
              <div className="thm-fan-speed">Speed: {fan.speed_pct}% ({fan.rpm} RPM)</div>
              <div className="thm-fan-bar-track">
                <div className="thm-fan-bar-fill" style={{ width: `${fan.speed_pct}%` }} />
              </div>
            </div>
            <div className="thm-fan-modes">
              {Object.keys(fanCurves).map((mode) => (
                <button
                  key={mode}
                  className={`thm-fan-mode-btn ${fan.mode === mode ? 'active' : ''}`}
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
    api<UpsData>('/api/extras/ups').then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="set-loading">Loading UPS status...</div>

  if (!data.connected) {
    return (
      <div className="set-tab-content">
        <div className="set-section-header"><h3>UPS / Power</h3></div>
        <div className="ups-not-connected">
          <div className="ups-nc-icon"><Plug size={40} /></div>
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

// ── OTA Status types ─────────────────────────────────────────────
interface OtaPackageInfo {
  version: string
  built_at: string
  components: string[]
  size_bytes: number
  filename?: string
}

interface OtaProgress {
  phase: string
  percent: number
  message: string
  status: 'running' | 'complete' | 'error'
  timestamp: string
}

interface OtaRollback {
  version: string
  backed_up_at: string
}

interface OtaStatus {
  current_version: string
  staged: OtaPackageInfo | null
  progress: OtaProgress | null
  rollback: OtaRollback | null
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function UpdatesTab() {
  const [status, setStatus] = useState<OtaStatus | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [applying, setApplying] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const errCountRef = useRef(0)

  // ── polling ──────────────────────────────────────────────────
  // Always poll every 1.5 s while the tab is open.
  // This means the UI automatically picks up an in-progress update even if the
  // user opens Settings > Updates after apply was already started (e.g. after a
  // backend restart), without needing any manual refresh.
  const loadStatus = useCallback(async () => {
    try {
      const s = await api<OtaStatus>('/api/update/status')
      errCountRef.current = 0
      setReconnecting(false)
      setStatus(s)
      // If we detect a running update we weren't tracking yet, enter applying state
      if (s.progress?.status === 'running') setApplying(true)
      // Clear applying when done
      if (s.progress?.status === 'complete' || s.progress?.status === 'error') {
        setApplying(false)
      }
    } catch {
      // Backend is restarting — count consecutive failures before showing indicator
      errCountRef.current += 1
      if (errCountRef.current >= 2) setReconnecting(true)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    pollRef.current = setInterval(loadStatus, 1500)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [loadStatus])

  // ── upload ───────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setUploadErr('')
    if (!file.name.endsWith('.nasos')) {
      setUploadErr('File must have a .nasos extension. Build one with scripts/build-ota.sh')
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const token = localStorage.getItem('nasos_token')
      const res = await fetch('/api/update/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Upload failed')
      }
      await loadStatus()
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed')
    }
    setUploading(false)
  }, [loadStatus])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ── apply ────────────────────────────────────────────────────
  const handleApply = async () => {
    setConfirm(false)
    setApplying(true)
    try {
      await api('/api/update/apply', { method: 'POST' })
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Apply failed')
      setApplying(false)
    }
  }

  const handleCancel = async () => {
    try { await api('/api/update/staged', { method: 'DELETE' }) } catch { /* ignore */ }
    await loadStatus()
  }

  const handleRollback = async () => {
    try { await api('/api/update/rollback', { method: 'POST' }) } catch { /* ignore */ }
    setApplying(true)
  }

  if (!status) return <div className="set-loading">Loading update status...</div>

  const { current_version, staged, progress, rollback } = status
  const isRunning = applying || (progress?.status === 'running')

  return (
    <div className="set-tab-content">
      {/* ── Current version ── */}
      <div className="set-section-header"><h3>OTA Updates</h3></div>
      <div className="upd-version-row">
        <div className="upd-ver-card">
          <div className="upd-ver-label">Installed Version</div>
          <div className="upd-ver-value">v{current_version}</div>
        </div>
        {staged && (
          <>
            <div className="upd-ver-arrow">&rarr;</div>
            <div className="upd-ver-card upd-ver-new">
              <div className="upd-ver-label">Staged Version</div>
              <div className="upd-ver-value">v{staged.version}</div>
            </div>
          </>
        )}
      </div>

      {/* ── Reconnecting banner (shown while backend is restarting mid-update) ── */}
      {reconnecting && (
        <div className="upd-reconnecting">
          <span className="upd-reconnect-spin">↻</span>
          Reconnecting to backend…
        </div>
      )}

      {/* ── Apply progress ── */}
      {isRunning && progress && (
        <div className="upd-progress-box">
          <div className="upd-progress-header">
            <span className="upd-progress-phase">{progress.phase.replace(/_/g, ' ')}</span>
            <span className="upd-progress-pct">{progress.percent}%</span>
          </div>
          <div className="upd-progress-track">
            <div
              className="upd-progress-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="upd-progress-msg">{progress.message}</div>
          {progress.percent < 80 && (
            <div className="upd-progress-note">
              The backend will restart — this page will reconnect automatically.
            </div>
          )}
        </div>
      )}

      {/* ── Complete / error result ── */}
      {!isRunning && progress?.status === 'complete' && (
        <div className="upd-result upd-result-ok">
          Update to v{staged?.version || ''} applied successfully.
          <button className="set-btn" style={{ marginLeft: 12 }}
            onClick={() => window.location.reload()}>Reload UI</button>
        </div>
      )}
      {!isRunning && progress?.status === 'error' && (
        <div className="upd-result upd-result-err">Update failed: {progress.message}</div>
      )}

      {/* ── Staged package ── */}
      {staged && !isRunning && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>Staged Package</h3>
          </div>
          <div className="upd-staged-card">
            <div className="upd-staged-info">
              <div className="upd-staged-row">
                <span>Version</span><strong>v{staged.version}</strong>
              </div>
              <div className="upd-staged-row">
                <span>Built</span><span>{new Date(staged.built_at).toLocaleString()}</span>
              </div>
              <div className="upd-staged-row">
                <span>Components</span>
                <span>{staged.components.map(c => (
                  <span key={c} className="upd-component-badge">{c}</span>
                ))}</span>
              </div>
              <div className="upd-staged-row">
                <span>Size</span><span>{fmtBytes(staged.size_bytes)}</span>
              </div>
            </div>
            <div className="upd-staged-actions">
              <button className="set-btn" onClick={handleCancel}>Cancel</button>
              <button className="set-btn set-btn-primary" onClick={() => setConfirm(true)}>
                Apply Update
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Upload drop zone ── */}
      {!staged && !isRunning && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}><h3>Upload Update Package</h3></div>
          {uploadErr && <div className="upd-result upd-result-err" style={{ marginBottom: 10 }}>{uploadErr}</div>}
          <div
            className={`upd-dropzone${dragOver ? ' upd-dropzone-over' : ''}${uploading ? ' upd-dropzone-busy' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".nasos"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {uploading ? (
              <><div className="upd-drop-icon"><RotateCcw size={24} /></div><div>Uploading and validating…</div></>
            ) : (
              <>
                <div className="upd-drop-icon">&#8593;</div>
                <div className="upd-drop-title">Drop a <code>.nasos</code> file here</div>
                <div className="upd-drop-hint">or click to browse — build one with <code>./scripts/build-ota.sh</code></div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Rollback ── */}
      {rollback && !isRunning && (
        <div className="upd-rollback">
          <div>
            <div className="upd-rollback-label">Rollback available</div>
            <div className="upd-rollback-ver">Previous install: v{rollback.version}</div>
          </div>
          <button className="set-btn" onClick={handleRollback}>Restore v{rollback.version}</button>
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirm && staged && (
        <div className="shr-overlay" onClick={() => setConfirm(false)}>
          <div className="shr-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>Apply Update?</h3>
              <button className="shr-btn-icon" onClick={() => setConfirm(false)}>✕</button>
            </div>
            <div className="shr-wizard-body">
              <p>This will install <strong>v{staged.version}</strong> and restart the backend service.</p>
              <p>Components: {staged.components.join(', ')}</p>
              {staged.components.includes('electron') && (
                <p style={{ color: '#ffa726' }}>The desktop UI will also restart.</p>
              )}
            </div>
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="shr-btn shr-btn-primary" onClick={handleApply}>Apply Now</button>
            </div>
          </div>
        </div>
      )}
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
    api<AvahiData>('/api/extras/avahi').then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="set-loading">Loading Avahi status...</div>

  const deviceIcon: Record<string, JSX.Element> = { computer: <Monitor size={18} />, phone: <Smartphone size={18} />, printer: <Printer size={18} /> }

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
            <span className="ava-device-icon">{deviceIcon[dev.type] || <Cpu size={18} />}</span>
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
    api<TimeMachineData>('/api/extras/timemachine').then(setData).catch(() => {})
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
                <span className="tm-mac-icon"><Monitor size={20} strokeWidth={1.5} /></span>
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

// ── Personalization Tab ──────────────────────────────────────────

const WALLPAPERS = [
  { id: 'cosmic', label: 'Cosmic', url: '/wallpapers/cosmic.png' },
  { id: 'abstract', label: 'Abstract', url: '/wallpapers/abstract.png' },
  { id: 'aurora', label: 'Aurora', url: '/wallpapers/aurora.png' },
  { id: 'mesh', label: 'Mesh', url: '/wallpapers/mesh.png' },
]

function PersonalizationTab() {
  const wallpaper = useSystemStore((s) => s.wallpaper)
  const setWallpaper = useSystemStore((s) => s.setWallpaper)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setWallpaper(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>Desktop Wallpaper</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="set-btn" onClick={() => fileRef.current?.click()}>
            ⬆ Upload
          </button>
          <button className="set-btn" onClick={() => setWallpaper(null)}>
            ✕ Reset to Default
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      <div className="wp-gallery">
        {/* Default (no wallpaper) option */}
        <button
          className={`wp-thumb ${wallpaper === null ? 'wp-active' : ''}`}
          onClick={() => setWallpaper(null)}
        >
          <div className="wp-thumb-default">
            <span>Default</span>
          </div>
          <span className="wp-thumb-label">Default</span>
        </button>

        {WALLPAPERS.map((wp) => (
          <button
            key={wp.id}
            className={`wp-thumb ${wallpaper === wp.url ? 'wp-active' : ''}`}
            onClick={() => setWallpaper(wp.url)}
          >
            <img src={wp.url} alt={wp.label} className="wp-thumb-img" />
            <span className="wp-thumb-label">{wp.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

