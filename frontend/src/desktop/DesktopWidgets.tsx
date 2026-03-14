import { useEffect, useState } from 'react'
import { Activity, Box, HardDrive, Wifi, WifiOff } from 'lucide-react'
import { useSystemStore } from '../store/systemStore'
import { useWidgetStore, type CustomWidget, type WidgetConfig } from '../store/widgetStore'
import { FileOpsWidget } from './FileOpsWidget'
import { api } from '../hooks/useApi'

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B/s`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`
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

function NetworkWidget({ config }: { config: WidgetConfig }) {
  const { metrics, isConnected } = useSystemStore()
  const [ifaces, setIfaces] = useState<NetIface[] | null>(null)

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

  const active = ifaces?.find(i => i.state === 'up')

  return (
    <div className="dw-card dw-network">
      <div className="dw-widget-title">
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>Network</span>
      </div>
      {active ? (
        <>
          {config.networkShowInterface !== false && (
            <div className="dw-kv-row">
              <span className="dw-kv-label">{active.name}</span>
              {active.speed && <span className="dw-kv-value">{active.speed}</span>}
            </div>
          )}
          {config.networkShowIp !== false && (
            <div className="dw-kv-row">
              <span className="dw-kv-label">IP</span>
              <span className="dw-kv-value dw-mono">{active.ipv4}</span>
            </div>
          )}
          {config.networkShowGateway !== false && active.gateway && (
            <div className="dw-kv-row">
              <span className="dw-kv-label">Gateway</span>
              <span className="dw-kv-value dw-mono">{active.gateway}</span>
            </div>
          )}
        </>
      ) : (
        <div className="dw-kv-row">
          <span className="dw-kv-label" style={{ opacity: 0.5 }}>
            {ifaces === null ? 'Loading…' : 'No active interface'}
          </span>
        </div>
      )}
      <div className="dw-network-throughput">
        <span>↑ {formatBytes(metrics.netSentPerSec)}</span>
        <span>↓ {formatBytes(metrics.netRecvPerSec)}</span>
      </div>
    </div>
  )
}

// ── Storage Overview Widget ─────────────────────────────────────

interface DiskInfo {
  name: string
  mount: string
  total_gb: number
  used_gb: number
  percent: number
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
        disks.slice(0, 3).map((d) => {
          const pct = d.percent ?? (d.total_gb > 0 ? (d.used_gb / d.total_gb) * 100 : 0)
          return (
            <div key={d.name} className="dw-storage-row">
              <div className="dw-storage-header">
                <span className="dw-kv-label">{d.name}</span>
                <span className="dw-kv-value">{pct.toFixed(0)}%</span>
              </div>
              <div className="dw-stat-bar">
                <div
                  className="dw-stat-fill"
                  style={{ width: `${pct}%` }}
                  data-level={pct > 90 ? 'high' : pct > 70 ? 'mid' : 'low'}
                />
              </div>
            </div>
          )
        })
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
          case 'docker': return <DockerWidget key={id} />
          case 'uptime': return <UptimeWidget key={id} config={config} />
          default: return null
        }
      })}
    </div>
  )
}
