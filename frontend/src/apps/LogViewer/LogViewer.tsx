import { useCallback, useEffect, useRef, useState } from 'react'

interface LogEntry {
  timestamp: string
  unit: string
  priority: number
  priority_label: string
  message: string
  hostname: string
}

const UNITS = ['', 'nasos-backend', 'smbd', 'sshd', 'docker', 'kernel', 'systemd', 'avahi-daemon', 'fail2ban']
const PRIORITIES = [
  { value: '', label: 'All Priorities' },
  { value: '0', label: '0 - Emergency' },
  { value: '1', label: '1 - Alert' },
  { value: '2', label: '2 - Critical' },
  { value: '3', label: '3 - Error' },
  { value: '4', label: '4 - Warning' },
  { value: '5', label: '5 - Notice' },
  { value: '6', label: '6 - Info' },
  { value: '7', label: '7 - Debug' },
]

async function api(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [unit, setUnit] = useState('')
  const [priority, setPriority] = useState('')
  const [grep, setGrep] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [lines, setLines] = useState(200)
  const logBodyRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('lines', String(lines))
      if (unit) params.set('unit', unit)
      if (priority) params.set('priority', priority)
      if (grep) params.set('grep', grep)
      const data = await api(`/api/logs?${params}`)
      setLogs(data.logs)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [unit, priority, grep, lines])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (autoScroll && logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const priorityClass = (p: number) => {
    if (p <= 3) return 'log-pri-error'
    if (p === 4) return 'log-pri-warn'
    if (p <= 6) return 'log-pri-info'
    return 'log-pri-debug'
  }

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return ts
    }
  }

  return (
    <div className="log-root">
      {/* Toolbar */}
      <div className="log-toolbar">
        <select className="log-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">All Units</option>
          {UNITS.filter(Boolean).map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        <select className="log-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        <div className="log-search">
          <input
            type="text"
            placeholder="Search logs..."
            value={grep}
            onChange={(e) => setGrep(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          {grep && (
            <button className="log-search-clear" onClick={() => setGrep('')}>✕</button>
          )}
        </div>

        <select className="log-select log-select-lines" value={lines} onChange={(e) => setLines(Number(e.target.value))}>
          <option value={100}>100 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
        </select>

        <button className="log-btn" onClick={load} title="Refresh">↻</button>

        <button
          className={`log-btn ${autoScroll ? 'log-btn-active' : ''}`}
          onClick={() => setAutoScroll(!autoScroll)}
          title="Auto-scroll"
        >
          ⬇
        </button>
      </div>

      {/* Log body */}
      <div className="log-body" ref={logBodyRef}>
        {loading && logs.length === 0 && (
          <div className="log-loading">Loading logs...</div>
        )}
        {!loading && logs.length === 0 && (
          <div className="log-empty">No log entries found</div>
        )}
        {logs.map((entry, i) => (
          <div key={i} className={`log-line ${priorityClass(entry.priority)}`}>
            <span className="log-ts">{formatTimestamp(entry.timestamp)}</span>
            <span className="log-unit-badge">{entry.unit}</span>
            <span className={`log-pri-badge ${priorityClass(entry.priority)}`}>
              {entry.priority_label}
            </span>
            <span className="log-msg">{entry.message}</span>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div className="log-status">
        <span>{logs.length} entries</span>
        {unit && <span>Unit: {unit}</span>}
        {priority && <span>Priority: ≤ {priority}</span>}
        {grep && <span>Filter: "{grep}"</span>}
      </div>
    </div>
  )
}
