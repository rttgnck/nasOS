/**
 * Demo mode — patches window.fetch and window.WebSocket to serve mock data
 * so the app runs fully client-side with no backend.
 *
 * Call setupDemoMode() BEFORE ReactDOM.createRoot().
 */

import * as D from './mockData'

// ── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ok() {
  return jsonResponse({ ok: true })
}

function delay(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Route matcher ────────────────────────────────────────────────────

type RouteHandler = (url: URL, init?: RequestInit) => Response | null

function matchRoute(pathname: string, routes: Record<string, RouteHandler>, url: URL, init?: RequestInit): Response | null {
  for (const [pattern, handler] of Object.entries(routes)) {
    if (pathname === pattern || pathname.startsWith(pattern + '?') || pathname.startsWith(pattern + '/')) {
      const result = handler(url, init)
      if (result) return result
    }
  }
  return null
}

// ── File list resolver ───────────────────────────────────────────────

function getFileList(path: string) {
  const lists: Record<string, unknown> = {
    '/home/demo': D.FILE_LIST_HOME,
    '/home/demo/Documents': D.FILE_LIST_DOCUMENTS,
    '/mnt/storage': D.FILE_LIST_STORAGE,
  }
  return lists[path] ?? {
    path,
    entries: [
      { name: 'sample-file.txt', path: `${path}/sample-file.txt`, is_dir: false, size: 1024, modified: new Date().toISOString() },
    ],
  }
}

function getFileTree(path: string) {
  return D.FILE_TREE_ROOT[path] ?? {
    name: path.split('/').pop(),
    path,
    is_dir: true,
    children: [],
  }
}

// ── API route table ──────────────────────────────────────────────────

const routes: Record<string, RouteHandler> = {
  // Auth
  '/api/auth/login': () =>
    jsonResponse({ access_token: D.DEMO_TOKEN, user: D.DEMO_USER }),
  '/api/auth/me': () =>
    jsonResponse(D.DEMO_USER),

  // Files
  '/api/files/list': (url) =>
    jsonResponse(getFileList(url.searchParams.get('path') ?? '/home/demo')),
  '/api/files/roots': () =>
    jsonResponse(D.FILE_ROOTS),
  '/api/files/tree': (url) =>
    jsonResponse(getFileTree(url.searchParams.get('path') ?? '/home/demo')),
  '/api/files/preview': () =>
    jsonResponse(D.FILE_PREVIEW_MD),
  '/api/files/search': (url) => {
    const query = (url.searchParams.get('query') ?? '').toLowerCase()
    const matches = D.FILE_LIST_HOME.entries.filter((e) =>
      e.name.toLowerCase().includes(query),
    )
    return jsonResponse({ results: matches })
  },
  '/api/files/upload': () => ok(),
  '/api/files/delete': () => ok(),
  '/api/files/mkdir': () => ok(),
  '/api/files/rename': () => ok(),

  // File operations
  '/api/file-ops/copy': () => jsonResponse({ id: 'demo-op-1', status: 'complete' }),
  '/api/file-ops/move': () => jsonResponse({ id: 'demo-op-2', status: 'complete' }),
  '/api/file-ops': () => ok(),

  // Storage
  '/api/storage/disks': (url) => {
    if (url.pathname.includes('smart')) return jsonResponse(D.SMART_DATA)
    return jsonResponse(D.STORAGE_DISKS)
  },
  '/api/storage/volumes': () => jsonResponse(D.STORAGE_VOLUMES),

  // Docker
  '/api/docker/status': () => jsonResponse(D.DOCKER_STATUS),
  '/api/docker/containers': (url) => {
    if (url.pathname.includes('/logs')) return jsonResponse(D.DOCKER_LOGS)
    return jsonResponse(D.DOCKER_CONTAINERS)
  },
  '/api/docker/catalog': () => jsonResponse(D.DOCKER_CATALOG),
  '/api/docker/install': () => ok(),

  // Network
  '/api/network': (url) => {
    if (url.pathname.includes('services')) return jsonResponse(D.NETWORK_SERVICES)
    return jsonResponse(D.NETWORK_INFO)
  },
  '/api/wifi/status': () => jsonResponse(D.WIFI_STATUS),
  '/api/wifi/scan': () => jsonResponse({ networks: [] }),
  '/api/wifi/connect': () => ok(),
  '/api/wifi/disconnect': () => ok(),

  // Users
  '/api/users': (url) => {
    if (url.pathname.includes('groups')) return jsonResponse(D.USER_GROUPS)
    if (url.pathname.includes('password')) return ok()
    return jsonResponse(D.USERS_LIST)
  },

  // Shares
  '/api/shares': () => jsonResponse(D.SHARES_LIST),

  // Backup
  '/api/backup/jobs': () => jsonResponse(D.BACKUP_JOBS),
  '/api/backup/snapshots': () => jsonResponse(D.BACKUP_SNAPSHOTS),
  '/api/backup/remotes': () => jsonResponse(D.BACKUP_REMOTES),

  // Security
  '/api/security/overview': () => jsonResponse(D.SECURITY_OVERVIEW),
  '/api/security/firewall': () => jsonResponse(D.SECURITY_FIREWALL),
  '/api/security/fail2ban': () => jsonResponse(D.SECURITY_FAIL2BAN),
  '/api/security/ssh': () => jsonResponse(D.SECURITY_SSH),
  '/api/security/tls': () => jsonResponse(D.SECURITY_TLS),

  // System
  '/api/system/uptime': () => jsonResponse(D.SYSTEM_UPTIME),
  '/api/system/health': () => jsonResponse(D.SYSTEM_HEALTH),
  '/api/system/restart': () => ok(),
  '/api/system/shutdown': () => ok(),

  // Updates
  '/api/update/status': () => jsonResponse(D.UPDATE_STATUS),
  '/api/update/check': () => jsonResponse(D.UPDATE_CHECK_CACHED),
  '/api/update/download': () => ok(),
  '/api/update/upload': () => ok(),
  '/api/update/apply': () => ok(),
  '/api/update/staged': () => ok(),
  '/api/update/rollback': () => ok(),

  // Preferences
  '/api/preferences/theme': () => jsonResponse(D.PREFERENCES_THEME),
  '/api/preferences/desktop': () => jsonResponse(D.PREFERENCES_DESKTOP),

  // Logs
  '/api/logs': () => jsonResponse(D.LOGS_DATA),

  // Extras
  '/api/extras/thermal': () => jsonResponse(D.EXTRAS_THERMAL),
  '/api/extras/ups': () => jsonResponse(D.EXTRAS_UPS),
  '/api/extras/avahi': () => jsonResponse(D.EXTRAS_AVAHI),
  '/api/extras/timemachine': () => jsonResponse(D.EXTRAS_TIMEMACHINE),
}

// ── Fetch interceptor ────────────────────────────────────────────────

function installFetchInterceptor() {
  const originalFetch = window.fetch

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init)
    const url = new URL(req.url, window.location.origin)

    if (!url.pathname.startsWith('/api/')) {
      return originalFetch(input, init)
    }

    await delay(Math.random() * 80 + 20)

    // Match the most specific route first: try full pathname, then progressively shorter
    const segments = url.pathname.split('/').filter(Boolean)
    for (let len = segments.length; len >= 2; len--) {
      const candidate = '/' + segments.slice(0, len).join('/')
      const handler = routes[candidate]
      if (handler) {
        const result = handler(url, init)
        if (result) return result
      }
    }

    // Fallback: unknown API endpoint → return empty success
    console.debug(`[demo] Unhandled API: ${req.method} ${url.pathname}`)
    return ok()
  }
}

// ── WebSocket mock ───────────────────────────────────────────────────

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  protocol = ''
  extensions = ''
  bufferedAmount = 0
  binaryType: BinaryType = 'blob'

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  private _interval: ReturnType<typeof setInterval> | null = null
  private _listeners: Record<string, Set<EventListenerOrEventListenerObject>> = {}

  constructor(url: string) {
    this.url = url

    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      const ev = new Event('open')
      this.onopen?.(ev)
      this._emit('open', ev)
      this._startSimulation()
    }, 50)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (!this._listeners[type]) this._listeners[type] = new Set()
    this._listeners[type].add(listener)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this._listeners[type]?.delete(listener)
  }

  dispatchEvent(_event: Event): boolean { return true }

  send(_data: string | ArrayBuffer | Blob) {
    // No-op for demo
  }

  close() {
    if (this._interval) clearInterval(this._interval)
    this.readyState = MockWebSocket.CLOSED
    const ev = new CloseEvent('close', { code: 1000, reason: 'Demo closed' })
    this.onclose?.(ev)
    this._emit('close', ev)
  }

  private _emit(type: string, ev: Event) {
    this._listeners[type]?.forEach((l) => {
      if (typeof l === 'function') l(ev)
      else l.handleEvent(ev)
    })
  }

  private _sendMessage(data: unknown) {
    if (this.readyState !== MockWebSocket.OPEN) return
    const ev = new MessageEvent('message', { data: JSON.stringify(data) })
    this.onmessage?.(ev)
    this._emit('message', ev)
  }

  private _startSimulation() {
    if (this.url.includes('/ws/metrics')) {
      this._simulateMetrics()
    } else if (this.url.includes('/ws/file-ops')) {
      this._sendMessage({ type: 'file_ops_snapshot', operations: [] })
    } else if (this.url.includes('/ws/theme-sync')) {
      // No initial message needed
    }
  }

  private _simulateMetrics() {
    let cpuBase = 15
    let memBase = 42

    const send = () => {
      cpuBase += (Math.random() - 0.5) * 6
      cpuBase = Math.max(3, Math.min(85, cpuBase))
      memBase += (Math.random() - 0.5) * 1.5
      memBase = Math.max(30, Math.min(75, memBase))

      this._sendMessage({
        type: 'metrics',
        cpu_percent: Math.round(cpuBase * 10) / 10,
        memory_percent: Math.round(memBase * 10) / 10,
        memory_used: Math.round(memBase * 81920) * 1024,
        memory_total: 8192 * 1024 * 1024,
        temperature: 48 + Math.round(Math.random() * 8),
        net: {
          bytes_sent_per_sec: Math.round(Math.random() * 2000000),
          bytes_recv_per_sec: Math.round(Math.random() * 5000000),
        },
      })
    }

    send()
    this._interval = setInterval(send, 1000)
  }
}

function installWebSocketMock() {
  const OriginalWebSocket = window.WebSocket

  // @ts-expect-error — intentional override for demo
  window.WebSocket = function (url: string, protocols?: string | string[]) {
    if (url.includes('/ws/')) {
      return new MockWebSocket(url) as unknown as WebSocket
    }
    return new OriginalWebSocket(url, protocols)
  }

  // Preserve static constants
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING
  window.WebSocket.OPEN = OriginalWebSocket.OPEN
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED
  window.WebSocket.prototype = OriginalWebSocket.prototype
}

// ── Demo banner ──────────────────────────────────────────────────────

function addDemoBanner() {
  const banner = document.createElement('div')
  banner.id = 'demo-banner'
  banner.innerHTML = `
    <span>🖥️ <strong>nasOS Demo</strong> — this is a live preview with mock data.
    <a href="https://github.com/rttgnck/nasOS" target="_blank" rel="noopener">View on GitHub →</a></span>
    <button onclick="this.parentElement.remove()" aria-label="Dismiss">&times;</button>
  `
  Object.assign(banner.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    zIndex: '999999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #0f3460, #1a1a2e)',
    color: '#eeeeee',
    fontSize: '13px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderTop: '1px solid #2a2a4a',
    boxShadow: '0 -2px 12px rgba(0,0,0,0.3)',
  })

  const link = banner.querySelector('a')!
  Object.assign(link.style, {
    color: '#4fc3f7',
    textDecoration: 'none',
  })

  const btn = banner.querySelector('button')!
  Object.assign(btn.style, {
    background: 'none',
    border: 'none',
    color: '#aaa',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: '1',
  })

  document.body.appendChild(banner)
}

// ── Pre-seed auth ────────────────────────────────────────────────────

function preseedAuth() {
  localStorage.setItem('nasos_auth_token', D.DEMO_TOKEN)
}

// ── Main entry point ─────────────────────────────────────────────────

export function setupDemoMode() {
  console.log('%c[nasOS Demo Mode]%c Mock API active — no backend required',
    'color: #4fc3f7; font-weight: bold', 'color: inherit')

  preseedAuth()
  installFetchInterceptor()
  installWebSocketMock()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDemoBanner)
  } else {
    addDemoBanner()
  }
}
