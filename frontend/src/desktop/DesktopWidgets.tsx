import { useEffect, useState } from 'react'
import { useSystemStore } from '../store/systemStore'

export function DesktopWidgets() {
  const { metrics, isConnected } = useSystemStore()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B/s`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`
  }

  const weekday = time.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = time.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="desktop-widgets">
      {/* Clock Widget */}
      <div className="dw-card dw-clock">
        <div className="dw-clock-time">{timeStr}</div>
        <div className="dw-clock-day">{weekday}</div>
        <div className="dw-clock-date">{dateStr}</div>
      </div>

      {/* System Stats Widget */}
      <div className="dw-card dw-stats">
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
        {metrics.temperature !== null && (
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
        <div className="dw-stats-row dw-net-row">
          <span className="dw-net-icon">↑</span>
          <span className="dw-net-value">{formatBytes(metrics.netSentPerSec)}</span>
          <span className="dw-net-icon">↓</span>
          <span className="dw-net-value">{formatBytes(metrics.netRecvPerSec)}</span>
        </div>
      </div>

      {/* Status Widget */}
      <div className="dw-card dw-status">
        <div className="dw-status-item">
          <span className={`dw-status-dot ${isConnected ? 'connected' : ''}`} />
          <span>{isConnected ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </div>
  )
}
