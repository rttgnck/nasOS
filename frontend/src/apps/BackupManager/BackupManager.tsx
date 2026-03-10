import { useCallback, useEffect, useState } from 'react'

interface BackupJob {
  id: number
  name: string
  source: string
  destination: string
  dest_type: string
  schedule: string
  retention: string
  enabled: boolean
  last_run: string | null
  last_status: string | null
  last_size: string
  next_run: string | null
}

interface Snapshot {
  id: string
  name: string
  path: string
  created: string
  size: string
}

interface CloudRemote {
  name: string
  type: string
  status: string
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

type BkTab = 'jobs' | 'snapshots' | 'cloud'

export function BackupManager() {
  const [tab, setTab] = useState<BkTab>('jobs')

  return (
    <div className="bk-root">
      <div className="bk-toolbar">
        <button className={`bk-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>
          Backup Jobs
        </button>
        <button className={`bk-tab ${tab === 'snapshots' ? 'active' : ''}`} onClick={() => setTab('snapshots')}>
          Snapshots
        </button>
        <button className={`bk-tab ${tab === 'cloud' ? 'active' : ''}`} onClick={() => setTab('cloud')}>
          Cloud Remotes
        </button>
      </div>
      {tab === 'jobs' && <JobsView />}
      {tab === 'snapshots' && <SnapshotsView />}
      {tab === 'cloud' && <CloudView />}
    </div>
  )
}

// ── Backup Jobs ──────────────────────────────────────────────────

function JobsView() {
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api('/api/backup/jobs')
      setJobs(data.jobs)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const runNow = async (id: number) => {
    await api(`/api/backup/jobs/${id}/run`, { method: 'POST' }).catch(() => {})
    load()
  }

  const toggle = async (id: number) => {
    await api(`/api/backup/jobs/${id}/toggle`, { method: 'POST' }).catch(() => {})
    load()
  }

  const remove = async (id: number) => {
    await api(`/api/backup/jobs/${id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  if (loading) return <div className="bk-loading">Loading...</div>

  return (
    <div className="bk-content">
      <div className="bk-job-list">
        {jobs.map((job) => (
          <div key={job.id} className={`bk-job ${!job.enabled ? 'bk-job-disabled' : ''}`}>
            <div className="bk-job-header">
              <div className="bk-job-title">
                <span className="bk-job-name">{job.name}</span>
                <span className={`bk-dest-badge bk-dest-${job.dest_type}`}>
                  {job.dest_type === 'cloud' ? '☁️' : '💽'} {job.dest_type}
                </span>
                {!job.enabled && <span className="bk-disabled-badge">Disabled</span>}
              </div>
              <div className="bk-job-actions">
                <button className="bk-btn-sm" title="Run Now" onClick={() => runNow(job.id)}>▶</button>
                <button className="bk-btn-sm" title={job.enabled ? 'Disable' : 'Enable'} onClick={() => toggle(job.id)}>
                  {job.enabled ? '⏸' : '⏵'}
                </button>
                <button className="bk-btn-sm bk-btn-danger" title="Delete" onClick={() => remove(job.id)}>🗑</button>
              </div>
            </div>
            <div className="bk-job-body">
              <div className="bk-job-paths">
                <div className="bk-path-row">
                  <span className="bk-path-label">Source</span>
                  <span className="bk-path-value">{job.source}</span>
                </div>
                <div className="bk-path-row">
                  <span className="bk-path-label">Dest</span>
                  <span className="bk-path-value">{job.destination}</span>
                </div>
              </div>
              <div className="bk-job-meta">
                <div className="bk-meta-item">
                  <span className="bk-meta-label">Schedule</span>
                  <span className="bk-meta-value">{job.schedule}</span>
                </div>
                <div className="bk-meta-item">
                  <span className="bk-meta-label">Retention</span>
                  <span className="bk-meta-value">{job.retention}</span>
                </div>
                <div className="bk-meta-item">
                  <span className="bk-meta-label">Last Run</span>
                  <span className={`bk-meta-value ${job.last_status === 'failed' ? 'bk-text-error' : ''}`}>
                    {job.last_status === 'success' ? '✓ ' : job.last_status === 'failed' ? '✗ ' : ''}
                    {job.last_run ? formatRelative(job.last_run) : 'Never'}
                  </span>
                </div>
                <div className="bk-meta-item">
                  <span className="bk-meta-label">Size</span>
                  <span className="bk-meta-value">{job.last_size}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Snapshots ────────────────────────────────────────────────────

function SnapshotsView() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])

  useEffect(() => {
    api('/api/backup/snapshots').then((d) => setSnapshots(d.snapshots)).catch(() => {})
  }, [])

  return (
    <div className="bk-content">
      <div className="bk-section-header">
        <h3>Volume Snapshots</h3>
      </div>
      {snapshots.length === 0 ? (
        <div className="bk-empty">No snapshots found. Btrfs volumes support automatic snapshots.</div>
      ) : (
        <div className="bk-snap-list">
          {snapshots.map((snap) => (
            <div key={snap.id} className="bk-snap-row">
              <div className="bk-snap-icon">📸</div>
              <div className="bk-snap-info">
                <div className="bk-snap-name">{snap.name}</div>
                <div className="bk-snap-path">{snap.path}</div>
              </div>
              <div className="bk-snap-meta">
                <div className="bk-snap-size">{snap.size}</div>
                <div className="bk-snap-date">{formatRelative(snap.created)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Cloud Remotes ────────────────────────────────────────────────

function CloudView() {
  const [remotes, setRemotes] = useState<CloudRemote[]>([])

  useEffect(() => {
    api('/api/backup/remotes').then((d) => setRemotes(d.remotes)).catch(() => {})
  }, [])

  return (
    <div className="bk-content">
      <div className="bk-section-header">
        <h3>Cloud Remotes (rclone)</h3>
      </div>
      <div className="bk-remote-list">
        {remotes.map((r) => (
          <div key={r.name} className="bk-remote-card">
            <div className="bk-remote-icon">
              {r.type.includes('S3') ? '🪣' : r.type.includes('Google') ? '📁' : r.type.includes('Backblaze') ? '🔵' : '☁️'}
            </div>
            <div className="bk-remote-info">
              <div className="bk-remote-name">{r.name}</div>
              <div className="bk-remote-type">{r.type}</div>
            </div>
            <div className={`bk-remote-status ${r.status === 'connected' ? 'bk-remote-connected' : 'bk-remote-disconnected'}`}>
              {r.status === 'connected' ? '● Connected' : '○ Not configured'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
