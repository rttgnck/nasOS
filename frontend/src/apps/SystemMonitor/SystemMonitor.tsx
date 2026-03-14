import { useSystemStore } from '../../store/systemStore'

export function SystemMonitor() {
  const metrics = useSystemStore((s) => s.metrics)
  const history = useSystemStore((s) => s.history)
  const isConnected = useSystemStore((s) => s.isConnected)

  return (
    <div className="sm-root">
      <div className="sm-grid">
        {/* CPU */}
        <div className="sm-card">
          <div className="sm-card-header">
            <span className="sm-card-title">CPU Usage</span>
            <span className="sm-card-value">{metrics.cpuPercent.toFixed(1)}%</span>
          </div>
          <Sparkline data={history.cpu} max={100} color="#4fc3f7" />
          <div className="sm-gauge">
            <div
              className="sm-gauge-fill"
              style={{ width: `${metrics.cpuPercent}%`, background: getColor(metrics.cpuPercent) }}
            />
          </div>
        </div>

        {/* Memory */}
        <div className="sm-card">
          <div className="sm-card-header">
            <span className="sm-card-title">Memory</span>
            <span className="sm-card-value">
              {formatBytes(metrics.memoryUsed)} / {formatBytes(metrics.memoryTotal)}
            </span>
          </div>
          <Sparkline data={history.memory} max={100} color="#ce93d8" />
          <div className="sm-gauge">
            <div
              className="sm-gauge-fill"
              style={{ width: `${metrics.memoryPercent}%`, background: getColor(metrics.memoryPercent) }}
            />
          </div>
          <div className="sm-card-sub">{metrics.memoryPercent.toFixed(1)}% used</div>
        </div>

        {/* Temperature */}
        <div className="sm-card">
          <div className="sm-card-header">
            <span className="sm-card-title">CPU Temperature</span>
            <span className={`sm-card-value sm-temp-${getTempLevel(metrics.temperature)}`}>
              {metrics.temperature !== null ? `${metrics.temperature.toFixed(1)}°C` : 'N/A'}
            </span>
          </div>
          <Sparkline
            data={history.temp}
            max={100}
            color={
              metrics.temperature !== null && metrics.temperature > 70
                ? '#ff5252'
                : metrics.temperature !== null && metrics.temperature > 55
                  ? '#ffb74d'
                  : '#66bb6a'
            }
          />
          <div className="sm-temp-bar">
            <div className="sm-temp-zones">
              <span className="sm-zone sm-zone-cool">Cool</span>
              <span className="sm-zone sm-zone-warm">Warm</span>
              <span className="sm-zone sm-zone-hot">Hot</span>
            </div>
            {metrics.temperature !== null && (
              <div
                className="sm-temp-needle"
                style={{ left: `${Math.min(metrics.temperature, 100)}%` }}
              />
            )}
          </div>
        </div>

        {/* Network */}
        <div className="sm-card">
          <div className="sm-card-header">
            <span className="sm-card-title">Network</span>
          </div>
          <Sparkline
            data={history.netRecv}
            max={Math.max(...(history.netRecv.length ? history.netRecv : [0]), 1024)}
            color="#4fc3f7"
            label="↓ Download"
          />
          <Sparkline
            data={history.netSent}
            max={Math.max(...(history.netSent.length ? history.netSent : [0]), 1024)}
            color="#81c784"
            label="↑ Upload"
          />
          <div className="sm-net-stats">
            <div className="sm-net-row">
              <span className="sm-net-dir sm-net-down">↓</span>
              <span>{formatRate(metrics.netRecvPerSec)}/s</span>
            </div>
            <div className="sm-net-row">
              <span className="sm-net-dir sm-net-up">↑</span>
              <span>{formatRate(metrics.netSentPerSec)}/s</span>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="sm-card sm-card-wide">
          <div className="sm-card-header">
            <span className="sm-card-title">System Info</span>
          </div>
          <div className="sm-sysinfo">
            <div className="sm-sysinfo-item">
              <span className="sm-sysinfo-label">Platform</span>
              <span className="sm-sysinfo-value">nasOS v031426-0045</span>
            </div>
            <div className="sm-sysinfo-item">
              <span className="sm-sysinfo-label">Kernel</span>
              <span className="sm-sysinfo-value">Linux 6.6.x (aarch64)</span>
            </div>
            <div className="sm-sysinfo-item">
              <span className="sm-sysinfo-label">WebSocket</span>
              <span className={`sm-sysinfo-value ${isConnected ? 'sm-connected' : 'sm-disconnected'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sparkline SVG Chart ──────────────────────────────────────────

function Sparkline({
  data,
  max,
  color,
  label,
}: {
  data: number[]
  max: number
  color: string
  label?: string
}) {
  const width = 300
  const height = 50
  const safeMax = Math.max(max, 1)

  if (data.length < 2) {
    return (
      <div className="sm-sparkline">
        {label && <div className="sm-sparkline-label">{label}</div>}
        <svg viewBox={`0 0 ${width} ${height}`} className="sm-sparkline-svg">
          <line x1="0" y1={height} x2={width} y2={height} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </svg>
      </div>
    )
  }

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / safeMax) * (height - 2)
    return `${x},${y}`
  })

  const fillPoints = `0,${height} ${points.join(' ')} ${width},${height}`

  return (
    <div className="sm-sparkline">
      {label && <div className="sm-sparkline-label">{label}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} className="sm-sparkline-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={fillPoints} fill={`url(#grad-${color.replace('#', '')})`} />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatRate(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function getTempLevel(temp: number | null): string {
  if (temp === null) return 'unknown'
  if (temp > 75) return 'hot'
  if (temp > 60) return 'warm'
  return 'cool'
}

function getColor(percent: number): string {
  if (percent > 90) return '#ff5252'
  if (percent > 75) return '#ffb74d'
  return '#4fc3f7'
}
