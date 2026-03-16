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

// ── File list resolver ───────────────────────────────────────────────

const FILE_LISTS: Record<string, unknown> = {
  '/home/admin': D.FILE_LIST_HOME,
  '/home/admin/Documents': D.FILE_LIST_DOCUMENTS,
  '/mnt/storage': D.FILE_LIST_STORAGE,
}

function getFileList(path: string) {
  return FILE_LISTS[path] ?? {
    path,
    parent: path.includes('/') ? path.substring(0, path.lastIndexOf('/')) || null : null,
    entries: [
      { name: 'sample-file.txt', path: `${path}/sample-file.txt`, is_dir: false, size: 1024, modified: Math.floor(Date.now() / 1000) },
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

// ── Route handler ────────────────────────────────────────────────────

function getMethod(init?: RequestInit): string {
  return (init?.method ?? 'GET').toUpperCase()
}

function handleApi(url: URL, init?: RequestInit): Response {
  const p = url.pathname
  const m = getMethod(init)

  // ── Auth ─────────────────────────────────────────────────────
  if (p === '/api/auth/login') {
    try {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      if (body.username === D.DEMO_CREDENTIALS.username && body.password === D.DEMO_CREDENTIALS.password) {
        return jsonResponse({ access_token: D.DEMO_TOKEN, user: D.DEMO_USER })
      }
    } catch { /* fall through to error */ }
    return jsonResponse({ detail: 'Invalid credentials — use admin / demo' }, 401)
  }
  if (p === '/api/auth/me') {
    const authHeader = init?.headers && (init.headers as Record<string, string>)['Authorization']
    if (authHeader?.includes(D.DEMO_TOKEN))
      return jsonResponse(D.DEMO_USER)
    return jsonResponse({ detail: 'Not authenticated' }, 401)
  }

  // ── Files ────────────────────────────────────────────────────
  if (p === '/api/files/list')
    return jsonResponse(getFileList(url.searchParams.get('path') ?? '/home/admin'))
  if (p === '/api/files/roots')
    return jsonResponse(D.FILE_ROOTS)
  if (p === '/api/files/tree')
    return jsonResponse(getFileTree(url.searchParams.get('path') ?? '/home/admin'))
  if (p === '/api/files/preview')
    return jsonResponse(D.FILE_PREVIEW_MD)
  if (p === '/api/files/search') {
    const query = (url.searchParams.get('query') ?? '').toLowerCase()
    const matches = D.FILE_LIST_HOME.entries.filter((e) =>
      e.name.toLowerCase().includes(query),
    )
    return jsonResponse({ results: matches })
  }
  if (p === '/api/files/media-info')
    return jsonResponse({ duration: 185.4, video_codec: 'h264', audio_codec: 'aac', width: 1920, height: 1080, format: 'mov,mp4,m4a,3gp,3g2,mj2', size_bytes: 52428800 })
  if (p === '/api/files/upload') return ok()
  if (p === '/api/files/delete') return ok()
  if (p === '/api/files/mkdir')  return ok()
  if (p === '/api/files/rename') return ok()

  // ── File operations ──────────────────────────────────────────
  if (p.startsWith('/api/file-ops')) return ok()

  // ── Storage ──────────────────────────────────────────────────
  if (p.startsWith('/api/storage/disks/smart'))
    return jsonResponse(D.SMART_DATA)
  if (p === '/api/storage/disks')
    return jsonResponse(D.STORAGE_DISKS)
  if (p === '/api/storage/volumes')
    return jsonResponse(D.STORAGE_VOLUMES)

  // ── Docker ───────────────────────────────────────────────────
  if (p === '/api/docker/status')
    return jsonResponse(D.DOCKER_STATUS)
  if (p === '/api/docker/catalog')
    return jsonResponse(D.DOCKER_CATALOG)
  if (p.startsWith('/api/docker/install/'))
    return ok()
  if (p.match(/^\/api\/docker\/containers\/[^/]+\/logs/))
    return jsonResponse(D.DOCKER_LOGS)
  if (p.match(/^\/api\/docker\/containers\/[^/]+$/) && m === 'POST')
    return ok()
  if (p.match(/^\/api\/docker\/containers\/[^/]+$/) && m === 'DELETE')
    return ok()
  if (p === '/api/docker/containers')
    return jsonResponse(D.DOCKER_CONTAINERS)

  // ── Network ──────────────────────────────────────────────────
  if (p === '/api/network/services')
    return jsonResponse(D.NETWORK_SERVICES)
  if (p === '/api/network')
    return jsonResponse(D.NETWORK_INFO)
  if (p === '/api/wifi/status')
    return jsonResponse(D.WIFI_STATUS)
  if (p === '/api/wifi/scan')
    return jsonResponse({ networks: [] })
  if (p === '/api/wifi/connect') return ok()
  if (p === '/api/wifi/disconnect') return ok()

  // ── Users ────────────────────────────────────────────────────
  if (p === '/api/users/groups')
    return jsonResponse(D.USER_GROUPS)
  if (p.match(/^\/api\/users\/[^/]+\/password$/) && m === 'POST')
    return ok()
  if (p.match(/^\/api\/users\/[^/]+$/) && m === 'DELETE')
    return ok()
  if (p === '/api/users' && m === 'POST')
    return ok()
  if (p === '/api/users')
    return jsonResponse(D.USERS_LIST)

  // ── Shares ───────────────────────────────────────────────────
  if (p.match(/^\/api\/shares\/[^/]+\/toggle$/) && m === 'POST')
    return ok()
  if (p.match(/^\/api\/shares\/[^/]+$/) && m === 'PUT')
    return ok()
  if (p.match(/^\/api\/shares\/[^/]+$/) && m === 'DELETE')
    return ok()
  if (p === '/api/shares' && m === 'POST')
    return ok()
  if (p === '/api/shares')
    return jsonResponse(D.SHARES_LIST)

  // ── Backup ───────────────────────────────────────────────────
  if (p.match(/^\/api\/backup\/jobs\/[^/]+\/(run|toggle)$/) && m === 'POST')
    return ok()
  if (p.match(/^\/api\/backup\/jobs\/[^/]+$/) && m === 'DELETE')
    return ok()
  if (p === '/api/backup/jobs')
    return jsonResponse(D.BACKUP_JOBS)
  if (p === '/api/backup/snapshots')
    return jsonResponse(D.BACKUP_SNAPSHOTS)
  if (p === '/api/backup/remotes')
    return jsonResponse(D.BACKUP_REMOTES)

  // ── Security ─────────────────────────────────────────────────
  if (p === '/api/security/overview')
    return jsonResponse(D.SECURITY_OVERVIEW)
  if (p === '/api/security/firewall')
    return jsonResponse(D.SECURITY_FIREWALL)
  if (p === '/api/security/fail2ban')
    return jsonResponse(D.SECURITY_FAIL2BAN)
  if (p === '/api/security/ssh')
    return jsonResponse(D.SECURITY_SSH)
  if (p === '/api/security/tls')
    return jsonResponse(D.SECURITY_TLS)

  // ── System ───────────────────────────────────────────────────
  if (p === '/api/system/uptime')
    return jsonResponse(D.SYSTEM_UPTIME)
  if (p === '/api/system/health')
    return jsonResponse(D.SYSTEM_HEALTH)
  if (p === '/api/system/restart' || p === '/api/system/shutdown')
    return ok()

  // ── Updates ──────────────────────────────────────────────────
  if (p === '/api/update/status')
    return jsonResponse(D.UPDATE_STATUS)
  if (p === '/api/update/check/cached')
    return jsonResponse(D.UPDATE_CHECK_CACHED)
  if (p === '/api/update/check')
    return jsonResponse(D.UPDATE_CHECK_CACHED)
  if (p === '/api/update/download')  return ok()
  if (p === '/api/update/upload')    return ok()
  if (p === '/api/update/apply')     return ok()
  if (p === '/api/update/staged')    return ok()
  if (p === '/api/update/rollback')  return ok()

  // ── Preferences ──────────────────────────────────────────────
  if (p === '/api/preferences/theme' && m === 'PUT')  return ok()
  if (p === '/api/preferences/theme')
    return jsonResponse(D.PREFERENCES_THEME)
  if (p === '/api/preferences/desktop' && m === 'PUT') return ok()
  if (p === '/api/preferences/desktop')
    return jsonResponse(D.PREFERENCES_DESKTOP)

  // ── Logs ─────────────────────────────────────────────────────
  if (p === '/api/logs')
    return jsonResponse(D.LOGS_DATA)

  // ── Extras ───────────────────────────────────────────────────
  if (p === '/api/extras/thermal')
    return jsonResponse(D.EXTRAS_THERMAL)
  if (p === '/api/extras/ups')
    return jsonResponse(D.EXTRAS_UPS)
  if (p === '/api/extras/avahi')
    return jsonResponse(D.EXTRAS_AVAHI)
  if (p === '/api/extras/timemachine')
    return jsonResponse(D.EXTRAS_TIMEMACHINE)

  // ── Fallback ─────────────────────────────────────────────────
  console.debug(`[demo] Unhandled API: ${m} ${p}`)
  return ok()
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

    const mergedInit = input instanceof Request
      ? { method: input.method, ...init }
      : init

    return handleApi(url, mergedInit)
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
    } else if (this.url.includes('/ws/terminal')) {
      this._simulateTerminal()
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

  private _simulateTerminal() {
    const welcome = '\x1b[1;36mnasOS Demo Terminal\x1b[0m\r\n' +
      'This is a mock terminal — commands are not executed.\r\n\r\n' +
      '\x1b[1;32mdemo@nasos-demo\x1b[0m:\x1b[1;34m~\x1b[0m$ '

    setTimeout(() => {
      this._sendMessage(welcome)
    }, 100)
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

  Object.defineProperties(window.WebSocket, {
    CONNECTING: { value: OriginalWebSocket.CONNECTING },
    OPEN:       { value: OriginalWebSocket.OPEN },
    CLOSING:    { value: OriginalWebSocket.CLOSING },
    CLOSED:     { value: OriginalWebSocket.CLOSED },
    prototype:  { value: OriginalWebSocket.prototype },
  })
}

// ── Demo banner ──────────────────────────────────────────────────────

function addDemoBanner() {
  const banner = document.createElement('div')
  banner.id = 'demo-banner'
  banner.innerHTML = `
    <span>🖥️ <strong>nasOS Demo</strong> · mock data ·
    <a href="https://github.com/rttgnck/nasOS" target="_blank" rel="noopener">GitHub →</a></span>
    <button onclick="this.parentElement.remove()" aria-label="Dismiss">&times;</button>
  `
  Object.assign(banner.style, {
    position: 'fixed',
    bottom: '55px',
    right: '8px',
    zIndex: '999999',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    background: 'rgba(15, 52, 96, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'rgba(238, 238, 238, 0.9)',
    fontSize: '11px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    pointerEvents: 'auto',
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
    color: 'rgba(170,170,170,0.7)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: '1',
  })

  document.body.appendChild(banner)
}

// ── Main entry point ─────────────────────────────────────────────────

export function setupDemoMode() {
  console.log('%c[nasOS Demo Mode]%c Mock API active — log in with admin / demo',
    'color: #4fc3f7; font-weight: bold', 'color: inherit')

  localStorage.removeItem('nasos_auth_token')

  // Pre-seed theme + wallpaper so initTheme() applies Liquid Glass before first paint
  localStorage.setItem('nasos-theme', 'liquid-glass')
  localStorage.setItem('nasos-wallpaper', `${import.meta.env.BASE_URL}wallpapers/abstract.png`)

  installFetchInterceptor()
  installWebSocketMock()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDemoBanner)
  } else {
    addDemoBanner()
  }
}
