import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity, AlertTriangle, BatteryCharging, Box, Check, ChevronDown, ChevronUp, Clock,
  Code, Coffee, Copy, Cpu, Download, ExternalLink, Github, Globe, HardDrive, Heart, Info,
  LayoutGrid, Loader, Lock, LockOpen, Monitor, Network, Package, Palette, Pencil, Plug,
  Plus, Printer, Radio, RefreshCw, RotateCcw, Shield, Smartphone, Thermometer, Trash2,
  Upload, User as UserIcon, Users, Wifi, WifiOff, Zap,
} from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useAuthStore } from '../../store/authStore'
import { useSystemStore } from '../../store/systemStore'
import {
  useWidgetStore,
  WIDGET_REGISTRY,
  WIDGET_TEMPLATES,
  type CustomWidget,
} from '../../store/widgetStore'
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  THEME_VAR_META,
  Theme,
  ThemeVar,
  applyTheme,
  useThemeStore,
} from '../../store/themeStore'
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
  | 'widgets'
  | 'users'
  | 'network'
  | 'services'
  | 'security'
  | 'thermal'
  | 'ups'
  | 'updates'
  | 'avahi'
  | 'timemachine'
  | 'about'

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
        <button className={`set-nav ${tab === 'widgets' ? 'active' : ''}`} onClick={() => setTab('widgets')}>
          <LayoutGrid size={14} strokeWidth={2} /> Widgets
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

        <div className="set-nav-group">About</div>
        <button className={`set-nav ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
          <Info size={14} strokeWidth={2} /> About nasOS
        </button>
      </div>
      <div className="set-content">
        <TabErrorBoundary key={tab}>
          {tab === 'personalization' && <PersonalizationTab />}
          {tab === 'widgets' && <WidgetsTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'network' && <NetworkTab />}
          {tab === 'services' && <ServicesTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'thermal' && <ThermalTab />}
          {tab === 'ups' && <UpsTab />}
          {tab === 'updates' && <UpdatesTab />}
          {tab === 'avahi' && <AvahiTab />}
          {tab === 'timemachine' && <TimeMachineTab />}
          {tab === 'about' && <AboutTab />}
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
  status: 'running' | 'complete' | 'error' | 'rebooting'
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
  disk_free_mb?: number
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

interface GitHubRelease {
  current_version: string
  update_available: boolean
  latest_version?: string
  release_name?: string
  published_at?: string
  changelog?: string
  asset?: { name: string; size_bytes: number; download_url: string }
  error?: string
}

function UpdatesTab() {
  const [status, setStatus] = useState<OtaStatus | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [applying, setApplying] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [rebootCountdown, setRebootCountdown] = useState<number | null>(null)
  const [clearingRollback, setClearingRollback] = useState(false)
  const [clearRollbackMsg, setClearRollbackMsg] = useState('')
  const [ghRelease, setGhRelease] = useState<GitHubRelease | null>(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showRestartModal, setShowRestartModal] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const errCountRef = useRef(0)
  const countdownStartedRef = useRef(false)

  // ── polling ──────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const s = await api<OtaStatus>('/api/update/status')
      const wasReconnecting = errCountRef.current >= 2
      errCountRef.current = 0
      setReconnecting(false)
      setStatus(s)
      if (s.progress?.status === 'running') setApplying(true)
      if (s.progress?.status === 'rebooting' && !countdownStartedRef.current) {
        countdownStartedRef.current = true
        setRebootCountdown(5)
        const cdTimer = setInterval(() => {
          setRebootCountdown((c) => {
            if (c === null || c <= 1) { clearInterval(cdTimer); return 0 }
            return c - 1
          })
        }, 1000)
      }
      if (s.progress?.status === 'complete' || s.progress?.status === 'error') {
        setApplying(false)
      }
      // Backend came back online after being unreachable — show restart modal with reload button
      if (wasReconnecting && s.progress?.status === 'complete') {
        setShowRestartModal(true)
      }
    } catch {
      errCountRef.current += 1
      if (errCountRef.current >= 2) {
        setReconnecting(true)
        setShowRestartModal(true)
      }
    }
  }, [])

  useEffect(() => {
    loadStatus()
    pollRef.current = setInterval(loadStatus, 1500)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [loadStatus])

  // ── GitHub release check ────────────────────────────────────
  const checkForUpdates = async () => {
    setChecking(true)
    try {
      const r = await api<GitHubRelease>('/api/update/check')
      setGhRelease(r)
    } catch {
      setGhRelease({ current_version: '', update_available: false, error: 'Failed to reach update server' })
    }
    setChecking(false)
  }

  const handleDownloadRelease = async () => {
    if (!ghRelease?.asset) return
    setDownloading(true)
    setUploadErr('')
    try {
      await api('/api/update/download', {
        method: 'POST',
        body: JSON.stringify({
          download_url: ghRelease.asset.download_url,
          filename: ghRelease.asset.name,
        }),
      })
      await loadStatus()
      setGhRelease(null)
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Download failed')
    }
    setDownloading(false)
  }

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
      const token = useAuthStore.getState().token
      const res = await fetch('/api/update/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      })
      if (!res.ok) {
        let detail = res.statusText
        try {
          const err = await res.json()
          // err.detail can be a string or a FastAPI validation-error array
          detail = Array.isArray(err.detail)
            ? err.detail.map((d: { msg: string }) => d.msg).join(', ')
            : String(err.detail || res.statusText)
        } catch { /* non-JSON body — use statusText */ }
        // Friendly hint for the most common failure mode: full root partition
        if (res.status === 507 || detail.toLowerCase().includes('disk') || detail.toLowerCase().includes('space')) {
          throw new Error(
            `${detail} — Use the "Clear rollback snapshot" button above to free space, then retry.`
          )
        }
        throw new Error(detail || 'Upload failed')
      }
      await loadStatus()
    } catch (e) {
      // Network-level failures (backend down, connection reset mid-upload, etc.) show
      // a generic browser error.  Give a more useful hint so the user knows what to do.
      const msg = e instanceof Error ? e.message : 'Upload failed'
      if (
        msg === 'Failed to fetch' ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('parsing') ||
        msg.toLowerCase().includes('parse')
      ) {
        setUploadErr(
          'Upload failed (backend disconnected or disk full). ' +
          'If the disk-space warning is showing, clear the rollback snapshot first. ' +
          'Otherwise check that the nasOS backend service is running.'
        )
      } else {
        setUploadErr(msg)
      }
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

  const handleClearRollback = async () => {
    setClearingRollback(true)
    setClearRollbackMsg('')
    try {
      const res = await api<{ status: string; freed_mb: number; disk_free_mb: number }>(
        '/api/update/rollback', { method: 'DELETE' }
      )
      const freed = res.freed_mb > 0 ? ` Freed ${res.freed_mb} MB.` : ''
      setClearRollbackMsg(`Snapshot cleared.${freed} ${res.disk_free_mb} MB now free.`)
      setUploadErr('')
      await loadStatus()
    } catch (e) {
      setClearRollbackMsg(e instanceof Error ? e.message : 'Failed to clear snapshot')
    }
    setClearingRollback(false)
  }

  if (!status) return <div className="set-loading">Loading update status...</div>

  const { current_version, staged, progress, rollback, disk_free_mb } = status
  const diskLow = disk_free_mb !== undefined && disk_free_mb !== -1 && disk_free_mb < 200
  const diskCritical = disk_free_mb !== undefined && disk_free_mb !== -1 && disk_free_mb < 100
  const isRunning = applying || (progress?.status === 'running')
  const isRebooting = progress?.status === 'rebooting' || (rebootCountdown !== null && rebootCountdown > 0)
  const isBusy = isRunning || isRebooting || reconnecting

  // After an apply completes (or errors), stop showing the old staged package so
  // the upload drop zone reappears — even if the file cleanup happened between polls.
  const isDone = !isBusy && (progress?.status === 'complete' || progress?.status === 'error')
  const displayStaged = isDone ? null : staged

  return (
    <div className="set-tab-content">
      {/* ── Current version ── */}
      <div className="set-section-header"><h3>OTA Updates</h3></div>

      {/* ── Disk space warning ── */}
      {diskLow && (
        <div className={`upd-disk-warn${diskCritical ? ' upd-disk-critical' : ''}`}>
          <strong>{diskCritical ? '🚨 Critical:' : '⚠️ Warning:'}</strong>
          {' '}Root partition has only <strong>{disk_free_mb} MB</strong> free.
          {diskCritical
            ? ' Services like Samba and NFS cannot write on a full partition and will fail to start.'
            : ' Upload may fail if space runs out mid-transfer.'}
          {rollback && !diskCritical && (
            <div style={{ marginTop: 8 }}>
              <button
                className="set-btn"
                onClick={handleClearRollback}
                disabled={clearingRollback}
              >
                {clearingRollback ? 'Clearing…' : 'Clear rollback snapshot (frees ~20-200 MB)'}
              </button>
              {clearRollbackMsg && (
                <span style={{ marginLeft: 10, fontSize: 13, color: '#90ee90' }}>{clearRollbackMsg}</span>
              )}
            </div>
          )}
          <div style={{ marginTop: rollback && !diskCritical ? 6 : 8, fontSize: 12, opacity: 0.85 }}>
            SSH recovery:{' '}
            <code>sudo rm -rf /opt/nasos/data/update-staging/rollback</code>
            {diskCritical && (
              <span> (then reboot)</span>
            )}
          </div>
        </div>
      )}

      <div className="upd-version-row">
        <div className="upd-ver-card">
          <div className="upd-ver-label">Installed Version</div>
          <div className="upd-ver-value">v{current_version}</div>
        </div>
        {displayStaged && (
          <>
            <div className="upd-ver-arrow">&rarr;</div>
            <div className="upd-ver-card upd-ver-new">
              <div className="upd-ver-label">Staged Version</div>
              <div className="upd-ver-value">v{displayStaged.version}</div>
            </div>
          </>
        )}
      </div>

      {/* ── Reboot countdown ── */}
      {isRebooting && !reconnecting && (
        <div className="upd-reboot-banner">
          <div className="upd-reboot-icon">&#8635;</div>
          <div className="upd-reboot-text">
            <strong>Rebooting device…</strong>
            {rebootCountdown !== null && rebootCountdown > 0 && (
              <span className="upd-reboot-cd"> {rebootCountdown}s</span>
            )}
          </div>
          <div className="upd-reboot-sub">Do not power off. The page will reconnect automatically.</div>
        </div>
      )}

      {/* ── Apply progress (install phases) ── */}
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
        </div>
      )}

      {/* ── Error result ── */}
      {!isBusy && progress?.status === 'error' && (
        <div className="upd-result upd-result-err">Update failed: {progress.message}</div>
      )}

      {/* ── Staged package ── */}
      {displayStaged && !isBusy && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>Staged Package</h3>
          </div>
          <div className="upd-staged-card">
            <div className="upd-staged-info">
              <div className="upd-staged-row">
                <span>Version</span><strong>v{displayStaged.version}</strong>
              </div>
              <div className="upd-staged-row">
                <span>Built</span><span>{new Date(displayStaged.built_at).toLocaleString()}</span>
              </div>
              <div className="upd-staged-row">
                <span>Components</span>
                <span>{displayStaged.components.map(c => (
                  <span key={c} className="upd-component-badge">{c}</span>
                ))}</span>
              </div>
              <div className="upd-staged-row">
                <span>Size</span><span>{fmtBytes(displayStaged.size_bytes)}</span>
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

      {/* ── Check for Updates / Upload ── */}
      {!displayStaged && !isBusy && (
        <>
          {/* GitHub release check */}
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>Check for Updates</h3>
            <button className="set-btn" onClick={checkForUpdates} disabled={checking || downloading}>
              {checking ? (
                <><Loader size={13} className="mv-spinner" /> Checking…</>
              ) : (
                <><RefreshCw size={13} /> Check Now</>
              )}
            </button>
          </div>

          {ghRelease && !ghRelease.error && ghRelease.update_available && ghRelease.asset && (
            <div className="upd-gh-release">
              <div className="upd-gh-release-header">
                <Package size={16} />
                <span className="upd-gh-release-title">
                  {ghRelease.release_name || `v${ghRelease.latest_version}`}
                </span>
                <span className="upd-gh-release-date">
                  {ghRelease.published_at ? new Date(ghRelease.published_at).toLocaleDateString() : ''}
                </span>
              </div>
              {ghRelease.changelog && (
                <div className="upd-gh-changelog">{ghRelease.changelog}</div>
              )}
              <div className="upd-gh-release-footer">
                <span className="upd-gh-asset-info">
                  {ghRelease.asset.name} ({fmtBytes(ghRelease.asset.size_bytes)})
                </span>
                <button
                  className="set-btn set-btn-primary"
                  onClick={handleDownloadRelease}
                  disabled={downloading}
                >
                  {downloading ? (
                    <><Loader size={13} className="mv-spinner" /> Downloading…</>
                  ) : (
                    <><Download size={13} /> Download Update</>
                  )}
                </button>
              </div>
            </div>
          )}

          {ghRelease && !ghRelease.error && !ghRelease.update_available && (
            <div className="upd-result upd-result-ok" style={{ marginTop: 8 }}>
              <Check size={14} style={{ marginRight: 8 }} /> You're running the latest version.
            </div>
          )}

          {ghRelease?.error && (
            <div className="upd-result upd-result-err" style={{ marginTop: 8 }}>
              {ghRelease.error}
            </div>
          )}

          {/* Manual upload */}
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
      {rollback && !isBusy && (
        <div className="upd-rollback">
          <div>
            <div className="upd-rollback-label">Rollback available</div>
            <div className="upd-rollback-ver">Previous install: v{rollback.version}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="set-btn" onClick={handleRollback}>Restore v{rollback.version}</button>
            <button
              className="set-btn"
              style={{ opacity: 0.7 }}
              onClick={handleClearRollback}
              disabled={clearingRollback}
              title="Remove the rollback snapshot to reclaim disk space on the root partition"
            >
              {clearingRollback ? 'Clearing…' : 'Clear snapshot'}
            </button>
          </div>
          {clearRollbackMsg && (
            <div style={{ fontSize: 12, color: '#90ee90', marginTop: 4, width: '100%' }}>{clearRollbackMsg}</div>
          )}
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirm && displayStaged && (
        <div className="shr-overlay" onClick={() => setConfirm(false)}>
          <div className="shr-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>Apply Update?</h3>
              <button className="shr-btn-icon" onClick={() => setConfirm(false)}>✕</button>
            </div>
            <div className="shr-wizard-body">
              <p>This will install <strong>v{displayStaged.version}</strong> and reboot the device to apply changes.</p>
              <p>Components: {displayStaged.components.join(', ')}</p>
              <p style={{ color: '#ffa726', marginTop: 8 }}>The device will be unreachable for ~60 seconds while it reboots.</p>
            </div>
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="shr-btn shr-btn-primary" onClick={handleApply}>Apply Now</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Waiting for Restart Modal ── */}
      {showRestartModal && (
        <div className="shr-overlay">
          <div className="upd-restart-modal">
            {reconnecting ? (
              <>
                <div className="upd-restart-spinner">
                  <Loader size={36} className="mv-spinner" />
                </div>
                <h3 className="upd-restart-title">Waiting for Restart</h3>
                <p className="upd-restart-desc">
                  The device is restarting to apply updates. This page will automatically detect when it comes back online.
                </p>
                <div className="upd-restart-hint">Do not power off the device.</div>
              </>
            ) : (
              <>
                <div className="upd-restart-check">
                  <Check size={36} />
                </div>
                <h3 className="upd-restart-title">Update Applied Successfully</h3>
                <p className="upd-restart-desc">
                  {staged?.version
                    ? `v${staged.version} has been installed.`
                    : 'The update has been installed.'}
                  {' '}Reload the UI to apply the new frontend.
                </p>
                <button
                  className="set-btn set-btn-primary"
                  style={{ marginTop: 16, padding: '10px 28px' }}
                  onClick={() => window.location.reload()}
                >
                  Reload UI
                </button>
              </>
            )}
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
  { id: 'cosmic',   label: 'Cosmic',   url: '/wallpapers/cosmic.png' },
  { id: 'abstract', label: 'Abstract', url: '/wallpapers/abstract.png' },
  { id: 'aurora',   label: 'Aurora',   url: '/wallpapers/aurora.png' },
  { id: 'mesh',     label: 'Mesh',     url: '/wallpapers/mesh.png' },
]

// ── Helpers ────────────────────────────────────────────────────

/** Resolve a CSS colour-like value to an opaque hex for <input type="color"> */
function toColorPickerValue(val: string): string {
  // If it's already a #rrggbb hex, pass it through
  if (/^#[0-9a-f]{6}$/i.test(val)) return val
  // Try to parse it via a hidden canvas
  try {
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.fillStyle = '#000000'
    ctx.fillStyle = val
    const hex = ctx.fillStyle as string
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex
  } catch { /* ignore */ }
  return '#000000'
}

/** Build a deterministic preview for a theme using its vars */
function ThemePreview({ theme }: { theme: Theme }) {
  const v = { ...DEFAULT_THEME.vars, ...theme.vars }
  return (
    <div className="theme-card-preview">
      <div
        className="theme-card-preview-desktop"
        style={{ background: v['color-bg-desktop'] }}
      />
      <div
        className="theme-card-preview-window"
        style={{ background: v['color-bg-window'] }}
      >
        <div className="theme-card-preview-titlebar" style={{ background: v['color-bg-titlebar'] }} />
        <div className="theme-card-preview-body" />
      </div>
      <div
        className="theme-card-preview-taskbar"
        style={{ background: v['color-bg-taskbar'] }}
      />
      <div
        className="theme-card-preview-accent"
        style={{ background: v['color-accent'] }}
      />
    </div>
  )
}

// ── Theme Editor Modal ─────────────────────────────────────────

interface ThemeEditorProps {
  initial?: Theme
  onSave: (theme: Theme) => void
  onClose: () => void
}

function ThemeEditor({ initial, onSave, onClose }: ThemeEditorProps) {
  const [name, setName] = useState(initial?.name ?? 'My Theme')
  const [vars, setVars] = useState<Record<ThemeVar, string>>(
    initial ? { ...DEFAULT_THEME.vars, ...initial.vars } : { ...DEFAULT_THEME.vars }
  )

  // Capture the theme that was active before this editor opened so we can
  // restore it if the user cancels.
  const restoreTheme = useRef(useThemeStore.getState().getActiveTheme())

  // Live-preview: apply theme to the desktop whenever vars change.
  useEffect(() => {
    const previewTheme: Theme = {
      id: initial?.id ?? '__preview__',
      name: name.trim() || 'Preview',
      builtIn: false,
      vars,
    }
    applyTheme(previewTheme)
  }, [vars]) // eslint-disable-line react-hooks/exhaustive-deps

  const setVar = (key: ThemeVar, value: string) =>
    setVars((prev) => ({ ...prev, [key]: value }))

  const handleCancel = () => {
    // Restore the previously-active theme before closing.
    applyTheme(restoreTheme.current)
    onClose()
  }

  const handleSave = () => {
    if (!name.trim()) return
    const theme: Theme = {
      id: initial?.id ?? `custom-${Date.now()}`,
      name: name.trim(),
      builtIn: false,
      vars,
    }
    onSave(theme)
  }

  // Group vars
  const groups = Array.from(new Set(THEME_VAR_META.map((m) => m.group)))

  return (
    <div className="theme-editor-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCancel() }}>
      <div className="theme-editor-modal">
        <div className="theme-editor-header">
          <h3>{initial ? 'Edit Theme' : 'New Theme'}</h3>
          <button className="set-btn set-btn-sm" onClick={handleCancel}>✕</button>
        </div>
        <div className="theme-editor-body">
          {/* Name */}
          <div className="theme-editor-name-row">
            <label>Theme Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Theme"
              maxLength={40}
            />
          </div>

          {/* Variables by group */}
          {groups.map((group) => {
            const metas = THEME_VAR_META.filter((m) => m.group === group)
            return (
              <div key={group}>
                <div className="theme-editor-group-label">{group}</div>
                <div className="theme-editor-vars">
                  {metas.map((meta) => {
                    if (meta.type === 'slider') {
                      const rawNum = parseFloat(vars[meta.key]) || 0
                      const displayStr = meta.sliderUnit
                        ? `${rawNum}${meta.sliderUnit}`
                        : rawNum.toFixed(2)
                      return (
                        <div key={meta.key} className="theme-editor-slider-row">
                          <label htmlFor={`tvar-${meta.key}`}>{meta.label}</label>
                          <input
                            id={`tvar-${meta.key}`}
                            type="range"
                            min={meta.sliderMin ?? 0}
                            max={meta.sliderMax ?? 1}
                            step={meta.sliderStep ?? 0.01}
                            value={rawNum}
                            onChange={(e) => {
                              const n = parseFloat(e.target.value)
                              setVar(meta.key, meta.sliderUnit ? `${n}${meta.sliderUnit}` : String(n))
                            }}
                          />
                          <span className="theme-editor-slider-value">{displayStr}</span>
                        </div>
                      )
                    }
                    return (
                      <div key={meta.key} className="theme-editor-var-row">
                        <label htmlFor={`tvar-${meta.key}`}>{meta.label}</label>
                        {meta.type === 'color' ? (
                          <div
                            className="theme-editor-color-swatch"
                            style={{ background: vars[meta.key] }}
                            title={vars[meta.key]}
                          >
                            <input
                              id={`tvar-${meta.key}`}
                              type="color"
                              value={toColorPickerValue(vars[meta.key])}
                              onChange={(e) => setVar(meta.key, e.target.value)}
                            />
                          </div>
                        ) : (
                          <input
                            id={`tvar-${meta.key}`}
                            type="text"
                            className="theme-editor-text-input"
                            value={vars[meta.key]}
                            onChange={(e) => setVar(meta.key, e.target.value)}
                            placeholder="8px"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="theme-editor-footer">
          <button className="set-btn" onClick={handleCancel}>Cancel</button>
          <button className="set-btn set-btn-primary" onClick={handleSave} disabled={!name.trim()}>
            <Check size={13} />  Save Theme
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PersonalizationTab ─────────────────────────────────────────

function PersonalizationTab() {
  const wallpaper   = useSystemStore((s) => s.wallpaper)
  const setWallpaper = useSystemStore((s) => s.setWallpaper)
  const fileRef     = useRef<HTMLInputElement>(null)

  const activeThemeId    = useThemeStore((s) => s.activeThemeId)
  const customThemes     = useThemeStore((s) => s.customThemes)
  const setActiveTheme   = useThemeStore((s) => s.setActiveTheme)
  const addCustomTheme   = useThemeStore((s) => s.addCustomTheme)
  const updateCustomTheme = useThemeStore((s) => s.updateCustomTheme)
  const deleteCustomTheme = useThemeStore((s) => s.deleteCustomTheme)

  const [editTarget, setEditTarget] = useState<Theme | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setWallpaper(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const allThemes = [...BUILT_IN_THEMES, ...customThemes]

  return (
    <div className="set-tab-content">

      {/* ── Themes ─────────────────────────────────────────── */}
      <div className="set-section-header">
        <h3>Theme</h3>
      </div>

      <div className="theme-grid" style={{ marginBottom: 24 }}>
        {allThemes.map((theme) => {
          const isActive = theme.id === activeThemeId
          return (
            <div
              key={theme.id}
              className={`theme-card ${isActive ? 'theme-card-active' : ''}`}
              onClick={() => setActiveTheme(theme.id)}
              title={theme.name}
            >
              <ThemePreview theme={theme} />
              <div className="theme-card-footer">
                <span className="theme-card-name">{theme.name}</span>
                {isActive && <span className="theme-card-active-dot" />}
                {!theme.builtIn && (
                  <div className="theme-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="theme-card-icon-btn"
                      title="Edit"
                      onClick={() => setEditTarget(theme)}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      className="theme-card-icon-btn"
                      title="Delete"
                      style={{ color: '#ff5252' }}
                      onClick={() => deleteCustomTheme(theme.id)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* "New theme" card */}
        <button
          className="theme-card-add"
          onClick={() => setShowCreate(true)}
          title="Create custom theme"
        >
          <Plus size={20} />
          <span>New Theme</span>
        </button>
      </div>

      {/* ── Wallpaper ──────────────────────────────────────── */}
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

      {/* ── Theme Editor (create) ───────────────────────────── */}
      {showCreate && createPortal(
        <ThemeEditor
          onSave={(theme) => {
            addCustomTheme(theme)
            setActiveTheme(theme.id)
            setShowCreate(false)
          }}
          onClose={() => setShowCreate(false)}
        />,
        document.body
      )}

      {/* ── Theme Editor (edit) ─────────────────────────────── */}
      {editTarget && createPortal(
        <ThemeEditor
          initial={editTarget}
          onSave={(theme) => {
            updateCustomTheme(theme)
            setEditTarget(null)
            // If the edited theme wasn't active, the live preview may have applied
            // it temporarily — re-apply the actual active theme now.
            const active = useThemeStore.getState().getActiveTheme()
            if (active.id !== theme.id) applyTheme(active)
          }}
          onClose={() => setEditTarget(null)}
        />,
        document.body
      )}
    </div>
  )
}

// ── Widgets Tab ─────────────────────────────────────────────────

function widgetIcon(id: string, size = 16) {
  switch (id) {
    case 'clock': return <Clock size={size} />
    case 'system-stats': return <Cpu size={size} />
    case 'status': return <Wifi size={size} />
    case 'file-ops': return <Copy size={size} />
    case 'network': return <Network size={size} />
    case 'storage': return <HardDrive size={size} />
    case 'docker': return <Box size={size} />
    case 'uptime': return <Activity size={size} />
    default: return <Code size={size} />
  }
}

function WidgetsTab() {
  const enabledWidgets = useWidgetStore((s) => s.enabledWidgets)
  const customWidgets = useWidgetStore((s) => s.customWidgets)
  const widgetConfig = useWidgetStore((s) => s.widgetConfig)
  const {
    toggleWidget, moveWidget, addCustomWidget, updateCustomWidget,
    deleteCustomWidget, updateWidgetConfig,
  } = useWidgetStore()

  const [editingBuiltIn, setEditingBuiltIn] = useState<string | null>(null)
  const [editingCustom, setEditingCustom] = useState<CustomWidget | null>(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const allWidgets: { id: string; name: string; description: string; configurable: boolean; isCustom: boolean }[] = [
    ...WIDGET_REGISTRY.map(w => ({ ...w, isCustom: false })),
    ...customWidgets.map(w => ({
      id: w.id, name: w.name, description: 'Custom widget',
      configurable: true, isCustom: true,
    })),
  ]

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (!data.name || typeof data.template !== 'string') {
          setImportError('Invalid widget file — must contain "name" and "template" fields.')
          return
        }
        addCustomWidget({
          id: `custom-${Date.now()}`,
          name: data.name,
          template: data.template,
        })
        setImportError('')
      } catch {
        setImportError('Failed to parse widget file. Ensure it is valid JSON.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExport = (w: CustomWidget) => {
    const data = JSON.stringify({ name: w.name, template: w.template }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${w.name.toLowerCase().replace(/\s+/g, '-')}.widget.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleEdit = (id: string) => {
    const custom = customWidgets.find(w => w.id === id)
    if (custom) {
      setEditingCustom({ ...custom })
    } else {
      setEditingBuiltIn(id)
    }
  }

  const handleSaveCustom = () => {
    if (!editingCustom || !editingCustom.name.trim()) return
    const existing = customWidgets.find(w => w.id === editingCustom.id)
    if (existing) {
      updateCustomWidget(editingCustom)
    } else {
      addCustomWidget(editingCustom)
    }
    setEditingCustom(null)
  }

  return (
    <div className="set-tab-content">
      <div className="set-section-header">
        <h3>Desktop Widgets</h3>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8892b0)', marginBottom: 16 }}>
        Choose which widgets appear on your desktop and configure their display options.
      </p>

      {/* ── Widget Gallery ── */}
      <div className="wgt-gallery">
        {allWidgets.map((w) => {
          const isEnabled = enabledWidgets.includes(w.id)
          return (
            <div key={w.id} className={`wgt-card ${isEnabled ? 'wgt-card-active' : ''}`}>
              <div className="wgt-card-header">
                <div className="wgt-card-icon">{widgetIcon(w.id)}</div>
                <div className="wgt-card-info">
                  <div className="wgt-card-name">{w.name}</div>
                  <div className="wgt-card-desc">{w.description}</div>
                </div>
                <label className="wgt-toggle">
                  <input type="checkbox" checked={isEnabled} onChange={() => toggleWidget(w.id)} />
                  <span className="wgt-toggle-track" />
                </label>
              </div>
              {isEnabled && (
                <div className="wgt-card-actions">
                  {w.configurable && (
                    <button className="set-btn-sm" onClick={() => handleEdit(w.id)}>
                      <Pencil size={11} /> Edit
                    </button>
                  )}
                  {w.isCustom && (
                    <>
                      <button className="set-btn-sm" onClick={() => handleExport(customWidgets.find(c => c.id === w.id)!)}>
                        <Download size={11} /> Export
                      </button>
                      <button className="set-btn-sm set-btn-danger" onClick={() => deleteCustomWidget(w.id)}>
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Widget Order ── */}
      {enabledWidgets.length > 1 && (
        <>
          <div className="set-section-header" style={{ marginTop: 20 }}>
            <h3>Widget Order</h3>
          </div>
          <div className="wgt-order-list">
            {enabledWidgets.map((id, idx) => {
              const def = allWidgets.find(w => w.id === id)
              if (!def) return null
              return (
                <div key={id} className="wgt-order-item">
                  {widgetIcon(id, 14)}
                  <span className="wgt-order-name">{def.name}</span>
                  <div className="wgt-order-arrows">
                    <button
                      className="wgt-arrow-btn"
                      disabled={idx === 0}
                      onClick={() => moveWidget(id, 'up')}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      className="wgt-arrow-btn"
                      disabled={idx === enabledWidgets.length - 1}
                      onClick={() => moveWidget(id, 'down')}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Custom Widgets ── */}
      <div className="set-section-header" style={{ marginTop: 24 }}>
        <h3>Custom Widgets</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="set-btn" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Import
          </button>
          <button
            className="set-btn set-btn-primary"
            onClick={() => setEditingCustom({ id: `custom-${Date.now()}`, name: '', template: '' })}
          >
            <Plus size={14} /> Create
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>
      {importError && <div className="shr-wizard-error" style={{ marginBottom: 10 }}>{importError}</div>}

      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted, #8892b0)', marginBottom: 12 }}>
        Create a widget from a template or upload a <code>.widget.json</code> file.
      </p>
      <div className="wgt-template-grid">
        {WIDGET_TEMPLATES.map((tpl) => (
          <button
            key={tpl.name}
            className="wgt-template-card"
            onClick={() => setEditingCustom({
              id: `custom-${Date.now()}`,
              name: tpl.name === 'Blank' ? '' : tpl.name,
              template: tpl.template,
            })}
          >
            <Code size={16} />
            <span>{tpl.name}</span>
          </button>
        ))}
      </div>

      {/* ── Built-in Widget Config Editor ── */}
      {editingBuiltIn && (
        <div className="shr-overlay" onClick={() => setEditingBuiltIn(null)}>
          <div className="shr-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>Edit {WIDGET_REGISTRY.find(w => w.id === editingBuiltIn)?.name ?? 'Widget'}</h3>
              <button className="shr-btn-icon" onClick={() => setEditingBuiltIn(null)}>✕</button>
            </div>
            <div className="shr-wizard-body">
              {editingBuiltIn === 'clock' && (
                <>
                  <label className="wgt-config-row">
                    <span>Time Format</span>
                    <select
                      value={widgetConfig.clockFormat ?? '12h'}
                      onChange={(e) => updateWidgetConfig({ clockFormat: e.target.value as '12h' | '24h' })}
                    >
                      <option value="12h">12-hour</option>
                      <option value="24h">24-hour</option>
                    </select>
                  </label>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.clockShowWeekday !== false}
                      onChange={(e) => updateWidgetConfig({ clockShowWeekday: e.target.checked })}
                    />
                    <span>Show weekday</span>
                  </label>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.clockShowDate !== false}
                      onChange={(e) => updateWidgetConfig({ clockShowDate: e.target.checked })}
                    />
                    <span>Show date</span>
                  </label>
                </>
              )}

              {editingBuiltIn === 'system-stats' && (
                <>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.statsShowCpu !== false}
                      onChange={(e) => updateWidgetConfig({ statsShowCpu: e.target.checked })}
                    />
                    <span>Show CPU usage</span>
                  </label>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.statsShowRam !== false}
                      onChange={(e) => updateWidgetConfig({ statsShowRam: e.target.checked })}
                    />
                    <span>Show RAM usage</span>
                  </label>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.statsShowTemp !== false}
                      onChange={(e) => updateWidgetConfig({ statsShowTemp: e.target.checked })}
                    />
                    <span>Show temperature</span>
                  </label>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.statsShowNetwork !== false}
                      onChange={(e) => updateWidgetConfig({ statsShowNetwork: e.target.checked })}
                    />
                    <span>Show network throughput</span>
                  </label>
                </>
              )}

              {editingBuiltIn === 'network' && (
                <>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.networkShowInterface !== false}
                      onChange={(e) => updateWidgetConfig({ networkShowInterface: e.target.checked })}
                    />
                    <span>Show interface name &amp; speed</span>
                  </label>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.networkShowIp !== false}
                      onChange={(e) => updateWidgetConfig({ networkShowIp: e.target.checked })}
                    />
                    <span>Show IP address</span>
                  </label>
                  <label className="wgt-config-row">
                    <input
                      type="checkbox"
                      checked={widgetConfig.networkShowGateway !== false}
                      onChange={(e) => updateWidgetConfig({ networkShowGateway: e.target.checked })}
                    />
                    <span>Show gateway</span>
                  </label>
                </>
              )}

              {editingBuiltIn === 'uptime' && (
                <label className="wgt-config-row">
                  <input
                    type="checkbox"
                    checked={widgetConfig.uptimeShowLoad !== false}
                    onChange={(e) => updateWidgetConfig({ uptimeShowLoad: e.target.checked })}
                  />
                  <span>Show load averages</span>
                </label>
              )}
            </div>
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setEditingBuiltIn(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Widget Editor ── */}
      {editingCustom && (
        <div className="shr-overlay" onClick={() => setEditingCustom(null)}>
          <div className="shr-wizard" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>{customWidgets.find(w => w.id === editingCustom.id) ? 'Edit Widget' : 'Create Widget'}</h3>
              <button className="shr-btn-icon" onClick={() => setEditingCustom(null)}>✕</button>
            </div>
            <div className="shr-wizard-body">
              <label className="shr-field">
                <span>Widget Name</span>
                <input
                  type="text"
                  value={editingCustom.name}
                  onChange={(e) => setEditingCustom({ ...editingCustom, name: e.target.value })}
                  placeholder="My Widget"
                  maxLength={40}
                />
              </label>
              <label className="shr-field">
                <span>Template</span>
                <textarea
                  className="wgt-template-editor"
                  value={editingCustom.template}
                  onChange={(e) => setEditingCustom({ ...editingCustom, template: e.target.value })}
                  rows={8}
                  placeholder={'{{time}} · {{weekday}}\nCPU: {{cpu}}%'}
                  spellCheck={false}
                />
              </label>
              <div className="wgt-var-ref">
                <div className="wgt-var-ref-title">Available Variables</div>
                <div className="wgt-var-list">
                  {['time', 'date', 'weekday', 'cpu', 'ram', 'temp', 'netUp', 'netDown', 'status', 'memUsed', 'memTotal'].map((v) => (
                    <code key={v} className="wgt-var-tag">{`{{${v}}}`}</code>
                  ))}
                </div>
              </div>
            </div>
            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setEditingCustom(null)}>Cancel</button>
              <button
                className="shr-btn shr-btn-primary"
                disabled={!editingCustom.name.trim()}
                onClick={handleSaveCustom}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── About Tab ───────────────────────────────────────────────────

function AboutTab() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    api<{ current_version: string }>('/api/update/status')
      .then((s) => setVersion(s.current_version))
      .catch(() => {})
  }, [])

  return (
    <div className="set-tab-content">
      <div className="about-hero">
        <img src="/nasos-logo.svg" alt="nasOS" className="about-logo" />
        <div className="about-hero-text">
          <h2 className="about-title">nasOS</h2>
          <div className="about-version">
            {version ? `v${version}` : '...'}
          </div>
          <div className="about-tagline">A modern, lightweight NAS operating system. Complete with remote desktop environment and desktop for connected displays.</div>
        </div>
      </div>

      <div className="about-section">
        <div className="about-card">
          <Github size={18} />
          <div className="about-card-text">
            <div className="about-card-title">Open Source (non-commercial use only)</div>
            <div className="about-card-desc">
              Made by <strong>rttgnck</strong> — source code and releases available on GitHub. Commercial use requires permission.
            </div>
          </div>
          <a
            href="https://github.com/rttgnck/nasOS"
            target="_blank"
            rel="noopener noreferrer"
            className="set-btn"
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ExternalLink size={13} /> GitHub
          </a>
        </div>

        <div className="about-card about-card-donate">
          <Coffee size={18} />
          <div className="about-card-text">
            <div className="about-card-title">Support Development</div>
            <div className="about-card-desc">
              If you find nasOS useful, consider supporting the development!
            </div>
          </div>
          <a
            href="https://buymeacoffee.com/intek"
            target="_blank"
            rel="noopener noreferrer"
            className="set-btn about-donate-btn"
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Heart size={13} /> Support Development
          </a>
        </div>
      </div>

      <div className="about-section" style={{ marginTop: 24 }}>
        <div className="set-section-header"><h3>License</h3></div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8892b0)', lineHeight: 1.6 }}>
          nasOS is open-source software. Commercial use requires permission. See the{' '}
          <a href="https://github.com/rttgnck/nasOS" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
            GitHub repository
          </a>{' '}
          for license details.
        </p>
      </div>
    </div>
  )
}
