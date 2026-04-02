import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, Box, ChevronDown, ChevronUp, Cpu, HardDrive,
  LayoutDashboard, Menu, Minus, Monitor, Network, Plus, RefreshCw, Server,
  Settings, Share2, Thermometer, X, ZoomIn,
} from 'lucide-react'
import { useSystemStore } from '../../store/systemStore'
import {
  DASHBOARD_PANELS,
  useDashboardStore,
  isDisplaySession,
} from '../../store/dashboardStore'
import { api } from '../../hooks/useApi'

// ── Sparkline Chart ────────────────────────────────────────────────

function Sparkline({
  data,
  max,
  color,
  height = 48,
}: {
  data: number[]
  max: number
  color: string
  height?: number
}) {
  const width = 300
  const safeMax = Math.max(max, 1)

  if (data.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="db-sparkline" preserveAspectRatio="none">
        <line x1="0" y1={height} x2={width} y2={height} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      </svg>
    )
  }

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / safeMax) * (height - 2)
    return `${x},${y}`
  })

  const fillPoints = `0,${height} ${points.join(' ')} ${width},${height}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="db-sparkline" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`db-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#db-grad-${color.replace('#', '')})`} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Gauge Bar ──────────────────────────────────────────────────────

function GaugeBar({ percent, color }: { percent: number; color?: string }) {
  const c = color ?? (percent > 90 ? '#ff5252' : percent > 75 ? '#ffb74d' : '#4fc3f7')
  return (
    <div className="db-gauge">
      <div className="db-gauge-fill" style={{ width: `${Math.min(100, percent)}%`, background: c }} />
    </div>
  )
}

// ── CPU Panel ──────────────────────────────────────────────────────

function CpuPanel() {
  const { cpuPercent } = useSystemStore((s) => s.metrics)
  const cpuHistory = useSystemStore((s) => s.history.cpu)

  return (
    <div className="db-panel db-panel--small">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Cpu size={14} /></div>
        <span className="db-panel-title">CPU</span>
        <span className="db-panel-value">{cpuPercent.toFixed(1)}%</span>
      </div>
      <Sparkline data={cpuHistory} max={100} color="#4fc3f7" />
      <GaugeBar percent={cpuPercent} />
    </div>
  )
}

// ── Memory Panel ───────────────────────────────────────────────────

function MemoryPanel() {
  const { memoryPercent, memoryUsed, memoryTotal } = useSystemStore((s) => s.metrics)
  const memHistory = useSystemStore((s) => s.history.memory)

  return (
    <div className="db-panel db-panel--small">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Activity size={14} /></div>
        <span className="db-panel-title">Memory</span>
        <span className="db-panel-value">{memoryPercent.toFixed(1)}%</span>
      </div>
      <Sparkline data={memHistory} max={100} color="#ce93d8" />
      <GaugeBar percent={memoryPercent} color="#ce93d8" />
      <div className="db-panel-sub">
        {fmtBytes(memoryUsed)} / {fmtBytes(memoryTotal)}
      </div>
    </div>
  )
}

// ── Temperature Panel ──────────────────────────────────────────────

function TemperaturePanel() {
  const { temperature } = useSystemStore((s) => s.metrics)
  const tempHistory = useSystemStore((s) => s.history.temp)
  const level = temperature === null ? 'unknown'
    : temperature > 75 ? 'hot'
    : temperature > 60 ? 'warm'
    : 'cool'
  const color = level === 'hot' ? '#ff5252' : level === 'warm' ? '#ffb74d' : '#66bb6a'

  return (
    <div className="db-panel db-panel--small">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Thermometer size={14} /></div>
        <span className="db-panel-title">Temperature</span>
        <span className="db-panel-value" data-temp={level}>
          {temperature !== null ? `${temperature.toFixed(1)}°C` : 'N/A'}
        </span>
      </div>
      <Sparkline data={tempHistory} max={100} color={color} />
      <div className="db-temp-zones">
        <span className="db-zone db-zone--cool" />
        <span className="db-zone db-zone--warm" />
        <span className="db-zone db-zone--hot" />
      </div>
      {temperature !== null && (
        <div className="db-temp-needle" style={{ left: `${Math.min(temperature, 100)}%` }} />
      )}
    </div>
  )
}

// ── Uptime Panel ───────────────────────────────────────────────────

interface UptimeInfo { uptime_seconds: number; load_1: number; load_5: number; load_15: number }

function UptimePanel({ pollInterval }: { pollInterval: number }) {
  const [info, setInfo] = useState<UptimeInfo | null>(null)

  useEffect(() => {
    const load = () => { api<UptimeInfo>('/api/system/uptime').then(setInfo).catch(() => {}) }
    load()
    const t = setInterval(load, pollInterval * 1000)
    return () => clearInterval(t)
  }, [pollInterval])

  return (
    <div className="db-panel db-panel--small">
      <div className="db-panel-head">
        <div className="db-panel-icon"><RefreshCw size={14} /></div>
        <span className="db-panel-title">Uptime</span>
      </div>
      {info ? (
        <>
          <div className="db-uptime-val">{fmtDuration(info.uptime_seconds)}</div>
          <div className="db-uptime-load">
            Load: {info.load_1.toFixed(2)} / {info.load_5.toFixed(2)} / {info.load_15.toFixed(2)}
          </div>
        </>
      ) : (
        <div className="db-panel-empty">Loading…</div>
      )}
    </div>
  )
}

// ── Network Panel ──────────────────────────────────────────────────

function NetworkPanel() {
  const { netSentPerSec, netRecvPerSec } = useSystemStore((s) => s.metrics)
  const { netSent, netRecv } = useSystemStore((s) => s.history)

  const maxUp = Math.max(...(netSent.length ? netSent : [0]), 1024)
  const maxDown = Math.max(...(netRecv.length ? netRecv : [0]), 1024)
  const maxAll = Math.max(maxUp, maxDown)

  return (
    <div className="db-panel db-panel--medium">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Network size={14} /></div>
        <span className="db-panel-title">Network I/O</span>
      </div>
      <div className="db-net-rates">
        <span className="db-net-up">↑ {fmtRate(netSentPerSec)}/s</span>
        <span className="db-net-down">↓ {fmtRate(netRecvPerSec)}/s</span>
      </div>
      <div className="db-net-graphs">
        <div className="db-net-graph-wrap">
          <div className="db-net-graph-label">Upload</div>
          <Sparkline data={netSent} max={maxAll} color="#81c784" height={36} />
        </div>
        <div className="db-net-graph-wrap">
          <div className="db-net-graph-label">Download</div>
          <Sparkline data={netRecv} max={maxAll} color="#4fc3f7" height={36} />
        </div>
      </div>
    </div>
  )
}

// ── Storage Panel ──────────────────────────────────────────────────

interface PartInfo { name: string; mountpoint: string | null; percent: number; size_bytes: number }
interface DiskInfo { name: string; model: string; size_bytes: number; percent: number; partitions: PartInfo[] }

function StoragePanel({ pollInterval }: { pollInterval: number }) {
  const [disks, setDisks] = useState<DiskInfo[] | null>(null)

  useEffect(() => {
    const load = () => {
      api<{ disks: DiskInfo[] }>('/api/storage/disks')
        .then(d => setDisks(d.disks))
        .catch(() => setDisks([]))
    }
    load()
    const t = setInterval(load, pollInterval * 1000)
    return () => clearInterval(t)
  }, [pollInterval])

  return (
    <div className="db-panel db-panel--medium">
      <div className="db-panel-head">
        <div className="db-panel-icon"><HardDrive size={14} /></div>
        <span className="db-panel-title">Storage</span>
      </div>
      {disks === null ? (
        <div className="db-panel-empty">Loading…</div>
      ) : disks.length === 0 ? (
        <div className="db-panel-empty">No disks detected</div>
      ) : (
        <div className="db-storage-list">
          {disks.map(d => (
            <div key={d.name} className="db-storage-disk">
              <div className="db-storage-row">
                <span className="db-storage-name" title={d.model}>{d.name}</span>
                <span className="db-storage-pct">{d.percent.toFixed(0)}%</span>
                <span className="db-storage-size">{fmtBytes(d.size_bytes)}</span>
              </div>
              <GaugeBar percent={d.percent} />
              {d.partitions.filter(p => p.mountpoint).map(p => (
                <div key={p.name} className="db-storage-part">
                  <span className="db-storage-mount">{p.mountpoint}</span>
                  <span className="db-storage-pct">{p.percent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SATA Panel ─────────────────────────────────────────────────────

interface SataDevice {
  name: string; model: string; serial: string; connected: boolean
  partitions: { label: string; mount_point: string | null; fstype: string }[]
}
interface SataInfo { hat: { detected: boolean }; devices: SataDevice[] }

function SataPanel({ pollInterval }: { pollInterval: number }) {
  const [info, setInfo] = useState<SataInfo | null>(null)

  useEffect(() => {
    const load = () => { api<SataInfo>('/api/sata').then(setInfo).catch(() => {}) }
    load()
    const t = setInterval(load, pollInterval * 1000)
    return () => clearInterval(t)
  }, [pollInterval])

  return (
    <div className="db-panel db-panel--medium">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Server size={14} /></div>
        <span className="db-panel-title">SATA Disks</span>
        {info && (
          <span className={`db-badge ${info.hat.detected ? 'db-badge--ok' : 'db-badge--warn'}`}>
            HAT {info.hat.detected ? 'OK' : 'N/A'}
          </span>
        )}
      </div>
      {info === null ? (
        <div className="db-panel-empty">Loading…</div>
      ) : info.devices.length === 0 ? (
        <div className="db-panel-empty">No SATA devices</div>
      ) : (
        <div className="db-sata-list">
          {info.devices.map(dev => (
            <div key={dev.name} className="db-sata-dev">
              <div className="db-sata-header">
                <span className={`db-status-dot ${dev.connected ? 'connected' : ''}`} />
                <span className="db-sata-name">{dev.name}</span>
                <span className="db-sata-model">{dev.model}</span>
              </div>
              {dev.partitions.filter(p => p.mount_point).map(p => (
                <div key={p.label || p.mount_point} className="db-sata-part">
                  <span>{p.label || p.fstype}</span>
                  <span className="db-mono">{p.mount_point}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Docker Panel ───────────────────────────────────────────────────

interface DockerContainer { name: string; status: string }
interface DockerInfo { running: number; stopped: number; containers: DockerContainer[] }

function DockerPanel({ pollInterval }: { pollInterval: number }) {
  const [info, setInfo] = useState<DockerInfo | null>(null)

  useEffect(() => {
    const load = () => { api<DockerInfo>('/api/docker/status').then(setInfo).catch(() => {}) }
    load()
    const t = setInterval(load, pollInterval * 1000)
    return () => clearInterval(t)
  }, [pollInterval])

  return (
    <div className="db-panel db-panel--medium">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Box size={14} /></div>
        <span className="db-panel-title">Docker</span>
      </div>
      {info === null ? (
        <div className="db-panel-empty">Loading…</div>
      ) : (
        <>
          <div className="db-docker-summary">
            <div className="db-docker-stat">
              <span className="db-docker-num" style={{ color: '#66bb6a' }}>{info.running}</span>
              <span className="db-docker-lbl">running</span>
            </div>
            <div className="db-docker-stat">
              <span className="db-docker-num" style={{ color: '#5a6785' }}>{info.stopped}</span>
              <span className="db-docker-lbl">stopped</span>
            </div>
          </div>
          <div className="db-docker-list">
            {info.containers.map(c => (
              <div key={c.name} className="db-docker-row">
                <span className={`db-status-dot ${c.status === 'running' ? 'connected' : ''}`} />
                <span className="db-docker-name">{c.name}</span>
                <span className="db-docker-status">{c.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Services Panel ─────────────────────────────────────────────────

interface ServiceInfo { name: string; display: string; status: string }

function ServicesPanel({ pollInterval }: { pollInterval: number }) {
  const [services, setServices] = useState<ServiceInfo[] | null>(null)

  useEffect(() => {
    const load = () => {
      api<{ services: ServiceInfo[] }>('/api/network/services')
        .then(d => setServices(d.services))
        .catch(() => {})
    }
    load()
    const t = setInterval(load, pollInterval * 1000)
    return () => clearInterval(t)
  }, [pollInterval])

  return (
    <div className="db-panel db-panel--medium">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Monitor size={14} /></div>
        <span className="db-panel-title">Services</span>
      </div>
      {services === null ? (
        <div className="db-panel-empty">Loading…</div>
      ) : (
        <div className="db-services-list">
          {services.map(svc => (
            <div key={svc.name} className="db-service-row">
              <span className={`db-status-dot ${svc.status === 'active' ? 'connected' : ''}`} />
              <span className="db-service-name">{svc.display}</span>
              <span className={`db-service-status ${svc.status === 'active' ? 'db-svc-active' : 'db-svc-inactive'}`}>
                {svc.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shares Panel ───────────────────────────────────────────────────

interface ShareInfo {
  id: number; name: string; protocol: string; enabled: boolean
  total_bytes: number; used_bytes: number; percent: number
}

function SharesPanel({ pollInterval }: { pollInterval: number }) {
  const [shares, setShares] = useState<ShareInfo[] | null>(null)

  useEffect(() => {
    const load = () => {
      api<{ shares: ShareInfo[] }>('/api/shares/usage')
        .then(d => setShares(d.shares))
        .catch(() => setShares([]))
    }
    load()
    const t = setInterval(load, pollInterval * 1000)
    return () => clearInterval(t)
  }, [pollInterval])

  return (
    <div className="db-panel db-panel--medium">
      <div className="db-panel-head">
        <div className="db-panel-icon"><Share2 size={14} /></div>
        <span className="db-panel-title">Shares</span>
      </div>
      {shares === null ? (
        <div className="db-panel-empty">Loading…</div>
      ) : shares.filter(s => s.enabled).length === 0 ? (
        <div className="db-panel-empty">No active shares</div>
      ) : (
        <div className="db-shares-list">
          {shares.filter(s => s.enabled).map(share => (
            <div key={share.id} className="db-share-item">
              <div className="db-storage-row">
                <span className="db-storage-name">{share.name}</span>
                <span className="db-badge">{share.protocol.toUpperCase()}</span>
                <span className="db-storage-pct">
                  {share.total_bytes > 0 ? `${share.percent.toFixed(0)}%` : '—'}
                </span>
              </div>
              {share.total_bytes > 0 && (
                <>
                  <GaugeBar percent={share.percent} color="#7c4dff" />
                  <div className="db-panel-sub">
                    {fmtBytes(share.used_bytes)} / {fmtBytes(share.total_bytes)}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── System Info Panel ──────────────────────────────────────────────

interface SysInfo {
  hostname: string; platform: string; os: string; version: string; uptime_seconds: number
}

function SystemInfoPanel({ pollInterval }: { pollInterval: number }) {
  const isConnected = useSystemStore((s) => s.isConnected)
  const [info, setInfo] = useState<SysInfo | null>(null)

  useEffect(() => {
    const load = () => { api<SysInfo>('/api/system/info').then(setInfo).catch(() => {}) }
    load()
    const t = setInterval(load, pollInterval * 1000)
    return () => clearInterval(t)
  }, [pollInterval])

  return (
    <div className="db-panel db-panel--large">
      <div className="db-panel-head">
        <div className="db-panel-icon"><LayoutDashboard size={14} /></div>
        <span className="db-panel-title">System Info</span>
        <span className={`db-badge ${isConnected ? 'db-badge--ok' : 'db-badge--warn'}`}>
          {isConnected ? 'Online' : 'Offline'}
        </span>
      </div>
      {info ? (
        <div className="db-sysinfo-grid">
          <div className="db-sysinfo-item">
            <span className="db-sysinfo-label">Hostname</span>
            <span className="db-sysinfo-value">{info.hostname}</span>
          </div>
          <div className="db-sysinfo-item">
            <span className="db-sysinfo-label">Version</span>
            <span className="db-sysinfo-value">{info.version}</span>
          </div>
          <div className="db-sysinfo-item">
            <span className="db-sysinfo-label">Platform</span>
            <span className="db-sysinfo-value">{info.platform}</span>
          </div>
          <div className="db-sysinfo-item">
            <span className="db-sysinfo-label">OS</span>
            <span className="db-sysinfo-value">{info.os}</span>
          </div>
          <div className="db-sysinfo-item">
            <span className="db-sysinfo-label">WebSocket</span>
            <span className={`db-sysinfo-value ${isConnected ? 'db-text-ok' : 'db-text-err'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      ) : (
        <div className="db-panel-empty">Loading…</div>
      )}
    </div>
  )
}

// ── Settings Drawer ────────────────────────────────────────────────

function ScaleControl({ scale, setScale }: { scale: number; setScale: (v: number) => void }) {
  const [editVal, setEditVal] = useState(String(scale))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setEditVal(String(scale)) }, [scale])

  const commitEdit = () => {
    const n = parseFloat(editVal)
    if (!isNaN(n) && n >= 0.5 && n <= 5) setScale(n)
    else setEditVal(String(scale))
  }

  return (
    <div className="db-scale-ctrl">
      <button
        className="db-scale-btn"
        onClick={() => setScale(Math.max(0.5, scale - 0.25))}
        disabled={scale <= 0.5}
        title="Zoom out"
      >
        <Minus size={12} />
      </button>
      <input
        ref={inputRef}
        type="range"
        className="db-scale-slider"
        min="0.5"
        max="5"
        step="0.25"
        value={scale}
        onChange={(e) => setScale(parseFloat(e.target.value))}
      />
      <button
        className="db-scale-btn"
        onClick={() => setScale(Math.min(5, scale + 0.25))}
        disabled={scale >= 5}
        title="Zoom in"
      >
        <Plus size={12} />
      </button>
      <input
        className="db-scale-input"
        type="text"
        value={editVal}
        onChange={(e) => setEditVal(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit() }}
        title="Type a scale value (0.5 – 5)"
      />
      <span className="db-scale-suffix">x</span>
    </div>
  )
}

const SCALE_PRESETS = [1, 1.5, 2, 2.5, 3, 4]

function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    enabledPanels, columns, scaleDisplay, scaleRemote, autoOpenDisplay, pollInterval,
    togglePanel, movePanel, setColumns, setScaleDisplay, setScaleRemote, setAutoOpenDisplay, setPollInterval, resetDefaults,
  } = useDashboardStore()
  const onDisplay = isDisplaySession()
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={drawerRef} className="db-drawer">
      <div className="db-drawer-header">
        <Settings size={16} />
        <span>Dashboard Settings</span>
        <button className="db-drawer-close" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="db-drawer-section">
        <div className="db-drawer-label">Panels</div>
        {DASHBOARD_PANELS.map((panel) => {
          const enabled = enabledPanels.includes(panel.id)
          const idx = enabledPanels.indexOf(panel.id)
          return (
            <div key={panel.id} className="db-drawer-panel-row">
              <label className="db-drawer-toggle">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => togglePanel(panel.id)}
                />
                <span>{panel.name}</span>
              </label>
              {enabled && (
                <div className="db-drawer-movers">
                  <button
                    className="db-drawer-move"
                    disabled={idx <= 0}
                    onClick={() => movePanel(panel.id, 'up')}
                    title="Move up"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    className="db-drawer-move"
                    disabled={idx >= enabledPanels.length - 1}
                    onClick={() => movePanel(panel.id, 'down')}
                    title="Move down"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="db-drawer-section">
        <div className="db-drawer-label">Layout</div>
        <div className="db-drawer-option">
          <span>Columns</span>
          <select
            value={columns === 'auto' ? 'auto' : String(columns)}
            onChange={(e) => setColumns(e.target.value === 'auto' ? 'auto' : Number(e.target.value) as 2 | 3 | 4)}
            className="db-drawer-select"
          >
            <option value="auto">Auto</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </div>
        <div className="db-drawer-option">
          <span>Refresh interval</span>
          <select
            value={String(pollInterval)}
            onChange={(e) => setPollInterval(Number(e.target.value))}
            className="db-drawer-select"
          >
            <option value="5">5s</option>
            <option value="10">10s</option>
            <option value="15">15s</option>
            <option value="30">30s</option>
            <option value="60">60s</option>
          </select>
        </div>
      </div>

      <div className="db-drawer-section">
        <div className="db-drawer-label">
          Scale — Display {onDisplay && <span className="db-drawer-active-tag">active</span>}
        </div>
        <ScaleControl scale={scaleDisplay} setScale={setScaleDisplay} />
        <div className="db-scale-presets">
          {SCALE_PRESETS.map(v => (
            <button
              key={v}
              className={`db-scale-preset ${scaleDisplay === v ? 'active' : ''}`}
              onClick={() => setScaleDisplay(v)}
            >
              {v}x
            </button>
          ))}
        </div>
      </div>

      <div className="db-drawer-section">
        <div className="db-drawer-label">
          Scale — Remote {!onDisplay && <span className="db-drawer-active-tag">active</span>}
        </div>
        <ScaleControl scale={scaleRemote} setScale={setScaleRemote} />
        <div className="db-scale-presets">
          {SCALE_PRESETS.map(v => (
            <button
              key={v}
              className={`db-scale-preset ${scaleRemote === v ? 'active' : ''}`}
              onClick={() => setScaleRemote(v)}
            >
              {v}x
            </button>
          ))}
        </div>
      </div>

      <div className="db-drawer-section">
        <div className="db-drawer-label">Behavior</div>
        <label className="db-drawer-toggle">
          <input
            type="checkbox"
            checked={autoOpenDisplay}
            onChange={(e) => setAutoOpenDisplay(e.target.checked)}
          />
          <span>Auto-open on display session</span>
        </label>
      </div>

      <button className="db-drawer-reset" onClick={resetDefaults}>
        Reset to Defaults
      </button>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────

export function Dashboard() {
  const { enabledPanels, columns, scaleDisplay, scaleRemote, pollInterval, setActiveScale } = useDashboardStore()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggleDrawer = useCallback(() => setDrawerOpen(o => !o), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const activeScale = isDisplaySession() ? scaleDisplay : scaleRemote

  const gridStyle: React.CSSProperties = {
    ...(columns !== 'auto' ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : {}),
    zoom: activeScale,
  }

  return (
    <div className="db-root">
      <div className="db-toolbar">
        <LayoutDashboard size={16} />
        <span className="db-toolbar-title">Dashboard</span>
        <div className="db-toolbar-scale">
          <ZoomIn size={13} />
          <ScaleControl scale={activeScale} setScale={setActiveScale} />
          <span className="db-toolbar-session-tag">
            {isDisplaySession() ? 'Display' : 'Remote'}
          </span>
        </div>
        <button className="db-toolbar-btn" onClick={toggleDrawer} title="Dashboard Settings">
          <Menu size={18} />
        </button>
      </div>

      <div className="db-grid" style={gridStyle}>
        {enabledPanels.map((id: string) => {
          switch (id) {
            case 'cpu':         return <CpuPanel key={id} />
            case 'memory':      return <MemoryPanel key={id} />
            case 'temperature': return <TemperaturePanel key={id} />
            case 'uptime':      return <UptimePanel key={id} pollInterval={pollInterval} />
            case 'network':     return <NetworkPanel key={id} />
            case 'storage':     return <StoragePanel key={id} pollInterval={pollInterval} />
            case 'sata':        return <SataPanel key={id} pollInterval={pollInterval} />
            case 'docker':      return <DockerPanel key={id} pollInterval={pollInterval} />
            case 'services':    return <ServicesPanel key={id} pollInterval={pollInterval} />
            case 'shares':      return <SharesPanel key={id} pollInterval={pollInterval} />
            case 'system-info': return <SystemInfoPanel key={id} pollInterval={pollInterval} />
            default:            return null
          }
        })}
      </div>

      <SettingsDrawer open={drawerOpen} onClose={closeDrawer} />
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

function fmtRate(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function fmtDuration(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
