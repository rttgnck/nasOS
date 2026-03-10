import { useCallback, useEffect, useState } from 'react'
import { api } from '../../hooks/useApi'

interface Partition {
  name: string
  size_bytes: number
  fstype: string | null
  mountpoint: string | null
  uuid: string | null
}

interface Disk {
  name: string
  path: string
  size_bytes: number
  model: string
  serial: string
  vendor: string
  transport: string | null
  rotational: boolean
  partitions: Partition[]
}

interface Volume {
  device: string
  mountpoint: string
  fstype: string
  opts: string
  total_bytes: number
  used_bytes: number
  free_bytes: number
  percent: number
}

interface SmartData {
  device: string
  healthy: boolean | null
  temperature: number | null
  power_on_hours: number | null
  model: string | null
  serial: string | null
  firmware: string | null
  attributes: SmartAttribute[]
}

interface SmartAttribute {
  id: number
  name: string
  value: number
  worst: number
  thresh: number
  raw_value: string
}

type View = 'overview' | 'smart'

export function StorageManager() {
  const [disks, setDisks] = useState<Disk[]>([])
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('overview')
  const [selectedDisk, setSelectedDisk] = useState<Disk | null>(null)
  const [smartData, setSmartData] = useState<SmartData | null>(null)
  const [smartLoading, setSmartLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [diskRes, volRes] = await Promise.all([
        api<{ disks: Disk[] }>('/api/storage/disks'),
        api<{ volumes: Volume[] }>('/api/storage/volumes'),
      ])
      setDisks(diskRes.disks)
      setVolumes(volRes.volumes)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadSmart = async (disk: Disk) => {
    setSelectedDisk(disk)
    setView('smart')
    setSmartLoading(true)
    try {
      const data = await api<SmartData>(
        `/api/storage/disks/smart?device=${encodeURIComponent(disk.path)}`
      )
      setSmartData(data)
    } catch {
      setSmartData(null)
    } finally {
      setSmartLoading(false)
    }
  }

  if (loading) {
    return <div className="sm-loading">Loading storage data...</div>
  }

  return (
    <div className="storage-manager">
      {/* Toolbar */}
      <div className="sto-toolbar">
        <button
          className={`sto-tab ${view === 'overview' ? 'sto-tab-active' : ''}`}
          onClick={() => setView('overview')}
        >
          Disks & Volumes
        </button>
        {selectedDisk && (
          <button
            className={`sto-tab ${view === 'smart' ? 'sto-tab-active' : ''}`}
            onClick={() => setView('smart')}
          >
            SMART: {selectedDisk.name}
          </button>
        )}
        <div className="sto-toolbar-spacer" />
        <button className="fm-btn" onClick={loadData}>↻</button>
      </div>

      {view === 'overview' && (
        <div className="sto-content">
          {/* Disks */}
          <div className="sto-section">
            <h3 className="sto-section-title">Physical Disks</h3>
            <div className="sto-disk-grid">
              {disks.map((disk) => (
                <DiskCard key={disk.name} disk={disk} onViewSmart={() => loadSmart(disk)} />
              ))}
            </div>
          </div>

          {/* Volumes */}
          <div className="sto-section">
            <h3 className="sto-section-title">Mounted Volumes</h3>
            <div className="sto-volume-list">
              {volumes.map((vol) => (
                <VolumeRow key={vol.mountpoint} volume={vol} />
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'smart' && (
        <div className="sto-content">
          {smartLoading && <div className="sm-loading">Loading SMART data...</div>}
          {!smartLoading && smartData && <SmartView data={smartData} />}
          {!smartLoading && !smartData && (
            <div className="sm-loading">Failed to load SMART data</div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function DiskCard({ disk, onViewSmart }: { disk: Disk; onViewSmart: () => void }) {
  const isSSD = !disk.rotational
  const totalParts = disk.partitions.length
  const mounted = disk.partitions.filter((p) => p.mountpoint).length

  return (
    <div className="sto-disk-card">
      <div className="sto-disk-header">
        <span className="sto-disk-icon">{isSSD ? '⚡' : '💿'}</span>
        <div className="sto-disk-info">
          <span className="sto-disk-model">{disk.model || disk.name}</span>
          <span className="sto-disk-meta">
            {disk.path} · {formatBytes(disk.size_bytes)} · {disk.transport?.toUpperCase() ?? 'Unknown'}
            {isSSD ? ' SSD' : ' HDD'}
          </span>
        </div>
      </div>

      {/* Partition bar */}
      <div className="sto-disk-bar">
        {disk.partitions.map((part) => {
          const pct = (part.size_bytes / disk.size_bytes) * 100
          return (
            <div
              key={part.name}
              className="sto-disk-bar-seg"
              style={{ width: `${Math.max(pct, 2)}%` }}
              title={`${part.name} — ${formatBytes(part.size_bytes)} ${part.fstype ?? ''}`}
              data-mounted={!!part.mountpoint}
            />
          )
        })}
        {disk.partitions.length === 0 && (
          <div className="sto-disk-bar-empty" title="Unpartitioned">
            Unpartitioned
          </div>
        )}
      </div>

      <div className="sto-disk-footer">
        <span className="sto-disk-partitions">
          {totalParts} partition{totalParts !== 1 ? 's' : ''} · {mounted} mounted
        </span>
        <button className="sto-btn-small" onClick={onViewSmart}>
          SMART Health
        </button>
      </div>

      {/* Partition details */}
      {disk.partitions.length > 0 && (
        <div className="sto-partitions">
          {disk.partitions.map((p) => (
            <div key={p.name} className="sto-partition-row">
              <span className="sto-part-name">{p.name}</span>
              <span className="sto-part-size">{formatBytes(p.size_bytes)}</span>
              <span className="sto-part-fs">{p.fstype ?? '--'}</span>
              <span className="sto-part-mount">{p.mountpoint ?? 'Not mounted'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function VolumeRow({ volume }: { volume: Volume }) {
  const pct = volume.percent
  const barColor = pct > 90 ? '#ff4757' : pct > 75 ? '#ffa502' : '#2ed573'

  return (
    <div className="sto-volume-row">
      <div className="sto-vol-info">
        <span className="sto-vol-mount">{volume.mountpoint}</span>
        <span className="sto-vol-device">{volume.device} · {volume.fstype}</span>
      </div>
      <div className="sto-vol-bar-wrap">
        <div className="sto-vol-bar">
          <div
            className="sto-vol-bar-fill"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <span className="sto-vol-pct">{pct.toFixed(1)}%</span>
      </div>
      <div className="sto-vol-sizes">
        <span>{formatBytes(volume.used_bytes)} used</span>
        <span>{formatBytes(volume.free_bytes)} free</span>
        <span>{formatBytes(volume.total_bytes)} total</span>
      </div>
    </div>
  )
}

function SmartView({ data }: { data: SmartData }) {
  const healthColor = data.healthy === true ? '#2ed573' : data.healthy === false ? '#ff4757' : '#ffa502'
  const healthLabel = data.healthy === true ? 'PASSED' : data.healthy === false ? 'FAILING' : 'UNKNOWN'

  const criticalAttrs = [5, 187, 188, 197, 198] // reallocated, uncorrectable, pending

  return (
    <div className="sto-smart">
      {/* Header */}
      <div className="sto-smart-header">
        <div className="sto-smart-health" style={{ borderColor: healthColor }}>
          <span className="sto-smart-health-icon" style={{ color: healthColor }}>
            {data.healthy ? '✓' : '✕'}
          </span>
          <span className="sto-smart-health-label" style={{ color: healthColor }}>
            {healthLabel}
          </span>
        </div>
        <div className="sto-smart-info">
          <div className="sto-smart-model">{data.model ?? 'Unknown'}</div>
          <div className="sto-smart-meta">
            Serial: {data.serial ?? 'N/A'} · Firmware: {data.firmware ?? 'N/A'}
          </div>
        </div>
        <div className="sto-smart-stats">
          {data.temperature !== null && (
            <div className="sto-smart-stat">
              <span className="sto-smart-stat-val">{data.temperature}°C</span>
              <span className="sto-smart-stat-label">Temp</span>
            </div>
          )}
          {data.power_on_hours !== null && (
            <div className="sto-smart-stat">
              <span className="sto-smart-stat-val">{formatHours(data.power_on_hours)}</span>
              <span className="sto-smart-stat-label">Power On</span>
            </div>
          )}
        </div>
      </div>

      {/* Attributes table */}
      {data.attributes.length > 0 && (
        <div className="sto-smart-table">
          <div className="sto-smart-table-header">
            <span>ID</span>
            <span>Attribute</span>
            <span>Value</span>
            <span>Worst</span>
            <span>Thresh</span>
            <span>Raw</span>
          </div>
          {data.attributes.map((attr) => (
            <div
              key={attr.id}
              className="sto-smart-table-row"
              data-critical={criticalAttrs.includes(attr.id) && parseInt(attr.raw_value) > 0}
              data-warning={attr.value <= attr.thresh + 10 && attr.thresh > 0}
            >
              <span>{attr.id}</span>
              <span className="sto-smart-attr-name">{attr.name}</span>
              <span>{attr.value}</span>
              <span>{attr.worst}</span>
              <span>{attr.thresh}</span>
              <span className="sto-smart-raw">{attr.raw_value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Helpers ---

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 365) return `${days}d`
  const years = (days / 365).toFixed(1)
  return `${years}y`
}
