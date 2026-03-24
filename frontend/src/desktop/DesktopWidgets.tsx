import { useEffect, useState } from 'react'
import { Activity, Box, HardDrive, Share2, Wifi, WifiOff } from 'lucide-react'
import { useSystemStore } from '../store/systemStore'
import { useWidgetStore, type CustomWidget, type WidgetConfig } from '../store/widgetStore'
import { FileOpsWidget } from './FileOpsWidget'
import { api } from '../hooks/useApi'

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B/s`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

// ── Clock Widget ────────────────────────────────────────────────

function ClockWidget({ config }: { config: WidgetConfig }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: config.clockFormat !== '24h',
  })
  const weekday = time.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = time.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="dw-card dw-clock">
      <div className="dw-clock-time">{timeStr}</div>
      {config.clockShowWeekday !== false && <div className="dw-clock-day">{weekday}</div>}
      {config.clockShowDate !== false && <div className="dw-clock-date">{dateStr}</div>}
    </div>
  )
}

// ── System Stats Widget ─────────────────────────────────────────

function SystemStatsWidget({ config }: { config: WidgetConfig }) {
  const metrics = useSystemStore((s) => s.metrics)

  return (
    <div className="dw-card dw-stats">
      {config.statsShowCpu !== false && (
        <div className="dw-stats-row">
          <span className="dw-stat-label">CPU</span>
          <div className="dw-stat-bar">
            <div
              className="dw-stat-fill"
              style={{ width: `${metrics.cpuPercent}%` }}
              data-level={metrics.cpuPercent > 80 ? 'high' : metrics.cpuPercent > 50 ? 'mid' : 'low'}
            />
          </div>
          <span className="dw-stat-value">{metrics.cpuPercent.toFixed(0)}%</span>
        </div>
      )}
      {config.statsShowRam !== false && (
        <div className="dw-stats-row">
          <span className="dw-stat-label">RAM</span>
          <div className="dw-stat-bar">
            <div
              className="dw-stat-fill"
              style={{ width: `${metrics.memoryPercent}%` }}
              data-level={metrics.memoryPercent > 80 ? 'high' : metrics.memoryPercent > 50 ? 'mid' : 'low'}
            />
          </div>
          <span className="dw-stat-value">{metrics.memoryPercent.toFixed(0)}%</span>
        </div>
      )}
      {config.statsShowTemp !== false && metrics.temperature !== null && (
        <div className="dw-stats-row">
          <span className="dw-stat-label">Temp</span>
          <div className="dw-stat-bar">
            <div
              className="dw-stat-fill"
              style={{ width: `${Math.min(100, (metrics.temperature / 85) * 100)}%` }}
              data-level={metrics.temperature > 75 ? 'high' : metrics.temperature > 60 ? 'mid' : 'low'}
            />
          </div>
          <span className="dw-stat-value">{metrics.temperature.toFixed(0)}°C</span>
        </div>
      )}
      {config.statsShowNetwork !== false && (
        <div className="dw-stats-row dw-net-row">
          <span className="dw-net-icon">↑</span>
          <span className="dw-net-value">{formatBytes(metrics.netSentPerSec)}</span>
          <span className="dw-net-icon">↓</span>
          <span className="dw-net-value">{formatBytes(metrics.netRecvPerSec)}</span>
        </div>
      )}
    </div>
  )
}

// ── Connection Status Widget ────────────────────────────────────

function StatusWidget() {
  const isConnected = useSystemStore((s) => s.isConnected)

  return (
    <div className="dw-card dw-status">
      <div className="dw-status-item">
        <span className={`dw-status-dot ${isConnected ? 'connected' : ''}`} />
        <span>{isConnected ? 'Online' : 'Offline'}</span>
      </div>
    </div>
  )
}

// ── Network Status Widget ───────────────────────────────────────

interface NetIface {
  name: string
  type: string
  state: string
  ipv4: string
  gateway: string
  speed: string
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  const d = [`M${pts[0]![0]},${pts[0]![1]}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!
    const tension = 0.35
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension
    d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`)
  }
  return d.join(' ')
}

function NetworkGraph({ up, down }: { up: number[]; down: number[] }) {
  const width = 200
  const halfH = 36
  const height = halfH * 2
  const mid = halfH

  const maxUp = Math.max(...up, 1)
  const maxDown = Math.max(...down, 1)
  const scale = Math.max(maxUp, maxDown, 1)

  const len = Math.max(up.length, down.length)
  if (len < 2) {
    return (
      <svg width={width} height={height} className="dw-netgraph">
        <line x1="0" y1={mid} x2={width} y2={mid} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      </svg>
    )
  }

  const upPts: [number, number][] = up.map((v, i) => [
    (i / (len - 1)) * width,
    mid - (v / scale) * (halfH - 2),
  ])
  const downPts: [number, number][] = down.map((v, i) => [
    (i / (len - 1)) * width,
    mid + (v / scale) * (halfH - 2),
  ])

  const upCurve = smoothPath(upPts)
  const downCurve = smoothPath(downPts)
  const lastX = width

  const upFill = `${upCurve} L${lastX},${mid} L0,${mid} Z`
  const downFill = `${downCurve} L${lastX},${mid} L0,${mid} Z`

  return (
    <svg width={width} height={height} className="dw-netgraph" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="gw-up-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4fc3f7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#4fc3f7" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="gw-down-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#81c784" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#81c784" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <path d={upFill} fill="url(#gw-up-grad)" />
      <path d={upCurve} fill="none" stroke="#4fc3f7" strokeWidth="1.5" />
      <path d={downFill} fill="url(#gw-down-grad)" />
      <path d={downCurve} fill="none" stroke="#81c784" strokeWidth="1.5" />
      <line x1="0" y1={mid} x2={width} y2={mid} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
    </svg>
  )
}

function NetworkWidget({ config }: { config: WidgetConfig }) {
  const { metrics, history, isConnected } = useSystemStore()
  const [ifaces, setIfaces] = useState<NetIface[] | null>(null)
  const [connectedSince] = useState(() => Date.now())

  useEffect(() => {
    const load = () => {
      api<{ hostname: string; interfaces: NetIface[] }>('/api/network')
        .then((d) => setIfaces(d.interfaces))
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [])

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - connectedSince) / 1000)), 1000)
    return () => clearInterval(t)
  }, [connectedSince])

  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const activeIfaces = ifaces?.filter(i => i.state === 'up') ?? []

  return (
    <div className="dw-card dw-network">
      <div className="dw-widget-title">
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>Network</span>
      </div>
      {activeIfaces.length > 0 ? activeIfaces.map((iface) => (
        <div key={iface.name} className="dw-net-iface">
          {config.networkShowInterface !== false && (
            <div className="dw-kv-row">
              <span className="dw-kv-label">{iface.name}</span>
              <span className="dw-kv-value">{iface.speed || fmtTime(elapsed)}</span>
            </div>
          )}
          {config.networkShowIp !== false && (
            <div className="dw-kv-row">
              <span className="dw-kv-label">IP</span>
              <span className="dw-kv-value dw-mono">{iface.ipv4}</span>
            </div>
          )}
          {config.networkShowGateway !== false && iface.gateway && (
            <div className="dw-kv-row">
              <span className="dw-kv-label">Gateway</span>
              <span className="dw-kv-value dw-mono">{iface.gateway}</span>
            </div>
          )}
        </div>
      )) : (
        <div className="dw-kv-row">
          <span className="dw-kv-label" style={{ opacity: 0.5 }}>
            {ifaces === null ? 'Loading…' : 'No active interface'}
          </span>
        </div>
      )}
      <div className="dw-network-throughput">
        <span className="dw-net-up">↑ {formatBytes(metrics.netSentPerSec)}</span>
        <span className="dw-net-down">↓ {formatBytes(metrics.netRecvPerSec)}</span>
      </div>
      <div className="dw-net-graph">
        <NetworkGraph up={history.netSent} down={history.netRecv} />
      </div>
    </div>
  )
}

// ── Storage Overview Widget ─────────────────────────────────────

interface PartitionInfo {
  name: string
  size_bytes: number
  fstype: string | null
  mountpoint: string | null
  used_bytes: number
  percent: number
}

interface DiskInfo {
  name: string
  path: string
  size_bytes: number
  used_bytes: number
  percent: number
  model: string
  partitions: PartitionInfo[]
}

function StorageWidget() {
  const [disks, setDisks] = useState<DiskInfo[] | null>(null)

  useEffect(() => {
    const load = () => {
      api<{ disks: DiskInfo[] }>('/api/storage/disks')
        .then((d) => setDisks(d.disks))
        .catch(() => setDisks([]))
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="dw-card dw-storage">
      <div className="dw-widget-title">
        <HardDrive size={12} />
        <span>Storage</span>
      </div>
      {disks === null ? (
        <div className="dw-widget-empty">Loading…</div>
      ) : disks.length === 0 ? (
        <div className="dw-widget-empty">No disks detected</div>
      ) : (
        disks.map((disk) => (
          <div key={disk.name} className="dw-storage-disk">
            <div className="dw-storage-header">
              <span className="dw-kv-label" title={disk.model}>{disk.name}</span>
              <span className="dw-kv-value">
                {disk.percent.toFixed(0)}% · {formatSize(disk.size_bytes)}
              </span>
            </div>
            <div className="dw-stat-bar">
              <div
                className="dw-stat-fill"
                style={{ width: `${disk.percent}%` }}
                data-level={disk.percent > 90 ? 'high' : disk.percent > 70 ? 'mid' : 'low'}
              />
            </div>
            {disk.partitions.length > 0 && (
              <div className="dw-storage-parts">
                {disk.partitions.filter(p => p.mountpoint).map((part) => (
                  <div key={part.name} className="dw-storage-part">
                    <div className="dw-storage-part-header">
                      <span className="dw-part-label">{part.mountpoint}</span>
                      <span className="dw-part-value">{part.percent.toFixed(0)}%</span>
                    </div>
                    <div className="dw-stat-bar dw-part-bar">
                      <div
                        className="dw-stat-fill dw-part-fill"
                        style={{ width: `${part.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ── Shares Widget ──────────────────────────────────────────────

interface ShareInfo {
  id: number
  name: string
  path: string
  protocol: string
  enabled: boolean
  total_bytes: number
  used_bytes: number
  percent: number
}

function SharesWidget() {
  const [shares, setShares] = useState<ShareInfo[] | null>(null)

  useEffect(() => {
    const load = () => {
      api<{ shares: ShareInfo[] }>('/api/shares/usage')
        .then((d) => setShares(d.shares))
        .catch(() => setShares([]))
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="dw-card dw-shares">
      <div className="dw-widget-title">
        <Share2 size={12} />
        <span>Shares</span>
      </div>
      {shares === null ? (
        <div className="dw-widget-empty">Loading…</div>
      ) : shares.length === 0 ? (
        <div className="dw-widget-empty">No shares configured</div>
      ) : (
        shares.filter(s => s.enabled).map((share) => (
          <div key={share.id} className="dw-storage-disk">
            <div className="dw-storage-header">
              <span className="dw-kv-label">{share.name}</span>
              <span className="dw-kv-value">
                {share.total_bytes > 0 ? `${share.percent.toFixed(0)}%` : '—'} · {share.protocol.toUpperCase()}
              </span>
            </div>
            {share.total_bytes > 0 && (
              <>
                <div className="dw-stat-bar">
                  <div
                    className="dw-stat-fill dw-share-fill"
                    style={{ width: `${share.percent}%` }}
                  />
                </div>
                <div className="dw-share-detail">
                  {formatSize(share.used_bytes)} / {formatSize(share.total_bytes)}
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ── Docker Widget ───────────────────────────────────────────────

interface DockerInfo {
  running: number
  stopped: number
  containers: { name: string; status: string }[]
}

function DockerWidget() {
  const [info, setInfo] = useState<DockerInfo | null>(null)

  useEffect(() => {
    const load = () => {
      api<DockerInfo>('/api/docker/status')
        .then(setInfo)
        .catch(() => setInfo({ running: 0, stopped: 0, containers: [] }))
    }
    load()
    const interval = setInterval(load, 15_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="dw-card dw-docker">
      <div className="dw-widget-title">
        <Box size={12} />
        <span>Docker</span>
      </div>
      {info === null ? (
        <div className="dw-widget-empty">Loading…</div>
      ) : (
        <>
          <div className="dw-docker-counts">
            <div className="dw-docker-stat">
              <span className="dw-docker-num" style={{ color: '#66bb6a' }}>{info.running}</span>
              <span className="dw-docker-lbl">running</span>
            </div>
            <div className="dw-docker-stat">
              <span className="dw-docker-num" style={{ color: '#5a6785' }}>{info.stopped}</span>
              <span className="dw-docker-lbl">stopped</span>
            </div>
          </div>
          {info.containers?.slice(0, 3).map((c) => (
            <div key={c.name} className="dw-docker-row">
              <span className={`dw-status-dot ${c.status === 'running' ? 'connected' : ''}`} />
              <span className="dw-docker-name">{c.name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Uptime Widget ───────────────────────────────────────────────

interface UptimeInfo {
  uptime_seconds: number
  load_1: number
  load_5: number
  load_15: number
}

function UptimeWidget({ config }: { config: WidgetConfig }) {
  const [info, setInfo] = useState<UptimeInfo | null>(null)

  useEffect(() => {
    const load = () => {
      api<UptimeInfo>('/api/system/uptime')
        .then(setInfo)
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [])

  const fmt = (sec: number) => {
    const d = Math.floor(sec / 86400)
    const h = Math.floor((sec % 86400) / 3600)
    const m = Math.floor((sec % 3600) / 60)
    if (d > 0) return `${d}d ${h}h ${m}m`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  return (
    <div className="dw-card dw-uptime">
      <div className="dw-widget-title">
        <Activity size={12} />
        <span>Uptime</span>
      </div>
      {info ? (
        <>
          <div className="dw-uptime-val">{fmt(info.uptime_seconds)}</div>
          {config.uptimeShowLoad !== false && (
            <div className="dw-uptime-load">
              {info.load_1.toFixed(2)} / {info.load_5.toFixed(2)} / {info.load_15.toFixed(2)}
            </div>
          )}
        </>
      ) : (
        <div className="dw-widget-empty">—</div>
      )}
    </div>
  )
}

// ── Custom Widget Renderer ──────────────────────────────────────

function CustomWidgetRenderer({ widget }: { widget: CustomWidget }) {
  const { metrics, isConnected } = useSystemStore()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const vars: Record<string, string> = {
    time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    date: time.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    weekday: time.toLocaleDateString('en-US', { weekday: 'long' }),
    cpu: metrics.cpuPercent.toFixed(0),
    ram: metrics.memoryPercent.toFixed(0),
    temp: metrics.temperature !== null ? metrics.temperature.toFixed(0) : 'N/A',
    netUp: formatBytes(metrics.netSentPerSec),
    netDown: formatBytes(metrics.netRecvPerSec),
    status: isConnected ? 'Online' : 'Offline',
    memUsed: (metrics.memoryUsed / (1024 * 1024 * 1024)).toFixed(1),
    memTotal: (metrics.memoryTotal / (1024 * 1024 * 1024)).toFixed(1),
  }

  const rendered = widget.template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`)

  return (
    <div className="dw-card dw-custom">
      <div className="dw-widget-title">
        <span>{widget.name}</span>
      </div>
      <div className="dw-custom-content">
        {rendered.split('\n').map((line, i) => (
          <div key={i} className="dw-custom-line">{line || '\u00A0'}</div>
        ))}
      </div>
    </div>
  )
}

// ── Main Container ──────────────────────────────────────────────

export function DesktopWidgets() {
  const enabledWidgets = useWidgetStore((s) => s.enabledWidgets)
  const customWidgets = useWidgetStore((s) => s.customWidgets)
  const config = useWidgetStore((s) => s.widgetConfig)

  return (
    <div className="desktop-widgets">
      {enabledWidgets.map((id) => {
        const custom = customWidgets.find(w => w.id === id)
        if (custom) return <CustomWidgetRenderer key={id} widget={custom} />

        switch (id) {
          case 'clock': return <ClockWidget key={id} config={config} />
          case 'system-stats': return <SystemStatsWidget key={id} config={config} />
          case 'status': return <StatusWidget key={id} />
          case 'file-ops': return <FileOpsWidget key={id} />
          case 'network': return <NetworkWidget key={id} config={config} />
          case 'storage': return <StorageWidget key={id} />
          case 'shares': return <SharesWidget key={id} />
          case 'docker': return <DockerWidget key={id} />
          case 'uptime': return <UptimeWidget key={id} config={config} />
          default: return null
        }
      })}
    </div>
  )
}
