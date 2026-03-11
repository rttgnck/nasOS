import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, FileText, Play, RotateCcw, Square } from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useSystemStore } from '../../store/systemStore'

interface Container {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: Record<string, number>
  cpu_percent?: number
  memory_mb?: number
  uptime?: string
}

interface CatalogApp {
  id: string
  name: string
  category: string
  description: string
  icon: string
  image: string
  ports: Record<string, number>
}

type DockerTab = 'containers' | 'catalog'

export function DockerManager() {
  const [tab, setTab] = useState<DockerTab>('containers')

  return (
    <div className="dk-root">
      <div className="dk-toolbar">
        <button
          className={`dk-tab ${tab === 'containers' ? 'active' : ''}`}
          onClick={() => setTab('containers')}
        >
          Containers
        </button>
        <button
          className={`dk-tab ${tab === 'catalog' ? 'active' : ''}`}
          onClick={() => setTab('catalog')}
        >
          App Store
        </button>
      </div>
      {tab === 'containers' ? <ContainersView /> : <CatalogView />}
    </div>
  )
}

// ── Containers View ──────────────────────────────────────────────

function ContainersView() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [logsOpen, setLogsOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<{ containers: Container[] }>('/api/docker/containers')
      setContainers(data.containers)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const notify = useSystemStore.getState().addNotification

  const doAction = async (id: string, action: string) => {
    const c = containers.find((x) => x.id === id)
    const name = c?.name || id.slice(0, 12)
    try {
      await api(`/api/docker/containers/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      const labels: Record<string, string> = {
        start: 'started',
        stop: 'stopped',
        restart: 'restarted',
      }
      notify('Container Action', `${name} has been ${labels[action] || action}`, 'success')
      load()
    } catch {
      notify('Container Error', `Failed to ${action} ${name}`, 'error')
    }
  }

  if (loading) return <div className="dk-loading">Loading containers...</div>

  const running = containers.filter((c) => c.state === 'running')
  const stopped = containers.filter((c) => c.state !== 'running')

  return (
    <div className="dk-content">
      <div className="dk-stats-bar">
        <span className="dk-stat">
          <span className="dk-stat-num">{running.length}</span> running
        </span>
        <span className="dk-stat">
          <span className="dk-stat-num">{stopped.length}</span> stopped
        </span>
        <button className="dk-btn" onClick={load} style={{ marginLeft: 'auto' }}><RotateCcw size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Refresh</button>
      </div>

      {containers.length === 0 ? (
        <div className="dk-empty">
          <div className="dk-empty-icon"><Box size={40} /></div>
          <div className="dk-empty-title">No Containers</div>
          <div className="dk-empty-text">Install apps from the App Store to get started.</div>
        </div>
      ) : (
        <div className="dk-container-list">
          {containers.map((c) => (
            <div key={c.id} className={`dk-container ${c.state !== 'running' ? 'dk-container-stopped' : ''}`}>
              <div className="dk-container-header">
                <div className={`dk-status-dot ${c.state === 'running' ? 'dk-dot-running' : 'dk-dot-stopped'}`} />
                <div className="dk-container-info">
                  <div className="dk-container-name">{c.name}</div>
                  <div className="dk-container-image">{c.image}</div>
                </div>
                <div className="dk-container-actions">
                  <button
                    className={`dk-btn-sm ${logsOpen === c.id ? 'dk-btn-active' : ''}`}
                    onClick={() => setLogsOpen(logsOpen === c.id ? null : c.id)}
                    title="View logs"
                  >
                    <FileText size={14} />
                  </button>
                  {c.state === 'running' ? (
                    <>
                      <button className="dk-btn-sm" onClick={() => doAction(c.id, 'restart')}><RotateCcw size={14} /></button>
                      <button className="dk-btn-sm dk-btn-warn" onClick={() => doAction(c.id, 'stop')}><Square size={14} /></button>
                    </>
                  ) : (
                    <button className="dk-btn-sm dk-btn-success" onClick={() => doAction(c.id, 'start')}><Play size={14} /></button>
                  )}
                </div>
              </div>
              {c.state === 'running' && (
                <div className="dk-container-details">
                  <div className="dk-detail">
                    <span className="dk-detail-label">Ports</span>
                    <span className="dk-detail-value">
                      {Object.entries(c.ports).map(([p, hp]) => `${hp}→${p}`).join(', ')}
                    </span>
                  </div>
                  {c.cpu_percent !== undefined && (
                    <div className="dk-detail">
                      <span className="dk-detail-label">CPU</span>
                      <span className="dk-detail-value">{c.cpu_percent}%</span>
                    </div>
                  )}
                  {c.memory_mb !== undefined && c.memory_mb > 0 && (
                    <div className="dk-detail">
                      <span className="dk-detail-label">Memory</span>
                      <span className="dk-detail-value">{c.memory_mb} MB</span>
                    </div>
                  )}
                </div>
              )}
              {logsOpen === c.id && <ContainerLogs containerId={c.id} containerName={c.name} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Container Logs Panel ─────────────────────────────────────────

function ContainerLogs({ containerId, containerName }: { containerId: string; containerName: string }) {
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const fetchLogs = useCallback(async () => {
    try {
      const data = await api<{ logs: string[] }>(`/api/docker/containers/${containerId}/logs?tail=50`)
      setLogs(data.logs)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [containerId])

  useEffect(() => {
    fetchLogs()
    // Poll every 5s
    intervalRef.current = setInterval(fetchLogs, 5000)
    return () => clearInterval(intervalRef.current)
  }, [fetchLogs])

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  return (
    <div className="dk-logs-panel">
      <div className="dk-logs-header">
        <span className="dk-logs-title">Logs — {containerName}</span>
        <label className="dk-logs-auto">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
        <button className="dk-btn-sm" onClick={fetchLogs}><RotateCcw size={14} /></button>
      </div>
      <div className="dk-logs-body" ref={logRef}>
        {loading ? (
          <div className="dk-logs-loading">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="dk-logs-empty">No log output</div>
        ) : (
          logs.map((line, i) => <div key={i} className="dk-logs-line">{line}</div>)
        )}
      </div>
    </div>
  )
}

// ── App Store / Catalog View ─────────────────────────────────────

function CatalogView() {
  const [apps, setApps] = useState<CatalogApp[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api<{ apps: CatalogApp[] }>('/api/docker/catalog').then((d) => setApps(d.apps)).catch(() => {})
  }, [])

  const notify = useSystemStore.getState().addNotification

  const handleInstall = async (appId: string) => {
    const app = apps.find((a) => a.id === appId)
    setInstalling(appId)
    try {
      await api(`/api/docker/install/${appId}`, { method: 'POST' })
      notify('App Installed', `${app?.name || appId} has been installed successfully`, 'success')
    } catch {
      notify('Install Failed', `Failed to install ${app?.name || appId}`, 'error')
    }
    finally { setInstalling(null) }
  }

  const categories = [...new Set(apps.map((a) => a.category))]
  const filtered = filter
    ? apps.filter((a) => a.category === filter)
    : apps

  return (
    <div className="dk-content">
      <div className="dk-catalog-filters">
        <button
          className={`dk-filter ${!filter ? 'active' : ''}`}
          onClick={() => setFilter('')}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`dk-filter ${filter === cat ? 'active' : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="dk-catalog-grid">
        {filtered.map((app) => (
          <div key={app.id} className="dk-app-card">
            <div className="dk-app-icon">{app.icon}</div>
            <div className="dk-app-info">
              <div className="dk-app-name">{app.name}</div>
              <div className="dk-app-category">{app.category}</div>
              <div className="dk-app-desc">{app.description}</div>
            </div>
            <button
              className="dk-btn dk-btn-install"
              onClick={() => handleInstall(app.id)}
              disabled={installing === app.id}
            >
              {installing === app.id ? 'Installing...' : 'Install'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
