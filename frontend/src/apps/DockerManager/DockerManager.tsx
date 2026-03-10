import { useCallback, useEffect, useState } from 'react'

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

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
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

  const load = useCallback(async () => {
    try {
      const data = await api('/api/docker/containers')
      setContainers(data.containers)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const doAction = async (id: string, action: string) => {
    try {
      await api(`/api/docker/containers/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      load()
    } catch { /* ignore */ }
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
        <button className="dk-btn" onClick={load} style={{ marginLeft: 'auto' }}>↻ Refresh</button>
      </div>

      {containers.length === 0 ? (
        <div className="dk-empty">
          <div className="dk-empty-icon">🐳</div>
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
                  {c.state === 'running' ? (
                    <>
                      <button className="dk-btn-sm" onClick={() => doAction(c.id, 'restart')}>↻</button>
                      <button className="dk-btn-sm dk-btn-warn" onClick={() => doAction(c.id, 'stop')}>⏹</button>
                    </>
                  ) : (
                    <button className="dk-btn-sm dk-btn-success" onClick={() => doAction(c.id, 'start')}>▶</button>
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── App Store / Catalog View ─────────────────────────────────────

function CatalogView() {
  const [apps, setApps] = useState<CatalogApp[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api('/api/docker/catalog').then((d) => setApps(d.apps)).catch(() => {})
  }, [])

  const handleInstall = async (appId: string) => {
    setInstalling(appId)
    try {
      await api(`/api/docker/install/${appId}`, { method: 'POST' })
    } catch { /* ignore */ }
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
