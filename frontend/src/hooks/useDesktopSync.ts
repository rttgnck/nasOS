import { useEffect, useRef } from 'react'
import { api } from './useApi'
import { useSystemStore } from '../store/systemStore'
import { useWidgetStore } from '../store/widgetStore'

const LS_DESKTOP = 'nasos-desktop-state'

interface DesktopState {
  wallpaper: string | null
  icon_positions: Record<string, { x: number; y: number }> | null
  widgets: {
    enabledWidgets: string[]
    customWidgets: any[]
    widgetConfig: Record<string, any>
  } | null
}

// ── Sync gate ─────────────────────────────────────────────────────
// Nothing persists to backend until the initial load has completed.
// While applying remote state, subscriptions are silenced.

let _syncReady = false
let _applyingRemote = false

export function isDesktopSyncReady() {
  return _syncReady && !_applyingRemote
}

// ── localStorage cache ────────────────────────────────────────────

function cacheDesktopState(state: Partial<DesktopState>) {
  try {
    const existing = loadCachedDesktopState()
    const merged = { ...existing, ...state }
    localStorage.setItem(LS_DESKTOP, JSON.stringify(merged))
  } catch { /* ignore */ }
}

export function loadCachedDesktopState(): DesktopState {
  try {
    const raw = localStorage.getItem(LS_DESKTOP)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { wallpaper: null, icon_positions: null, widgets: null }
}

// ── Debounced backend persistence ─────────────────────────────────

let _desktopSaveTimer: ReturnType<typeof setTimeout> | null = null
let _pendingDesktopPatch: Partial<DesktopState> = {}

async function _doPersistDesktop() {
  if (!_syncReady || _applyingRemote) return

  const patch = { ..._pendingDesktopPatch }
  _pendingDesktopPatch = {}
  if (Object.keys(patch).length === 0) return

  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await api<{ ok: boolean }>('/api/preferences/desktop', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
      return
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      } else {
        console.error('[desktopSync] Failed to persist desktop state after retries')
      }
    }
  }
}

export function persistDesktopToBackend(patch: Partial<DesktopState>) {
  if (!isDesktopSyncReady()) return
  cacheDesktopState(patch)
  Object.assign(_pendingDesktopPatch, patch)
  if (_desktopSaveTimer) clearTimeout(_desktopSaveTimer)
  _desktopSaveTimer = setTimeout(_doPersistDesktop, 500)
}

// ── Apply remote desktop state (from backend load or WebSocket) ───

export function applyDesktopState(data: DesktopState | any) {
  _applyingRemote = true
  try {
    if (data.wallpaper !== undefined) {
      const store = useSystemStore.getState()
      if (data.wallpaper !== store.wallpaper) {
        if (data.wallpaper) {
          localStorage.setItem('nasos-wallpaper', data.wallpaper)
        } else {
          localStorage.removeItem('nasos-wallpaper')
        }
        useSystemStore.setState({ wallpaper: data.wallpaper })
      }
    }

    if (data.icon_positions) {
      localStorage.setItem('nasos-desktop-icon-positions', JSON.stringify(data.icon_positions))
      window.dispatchEvent(new CustomEvent('nasos:icon-positions-updated', { detail: data.icon_positions }))
    }

    if (data.widgets) {
      const ws = useWidgetStore.getState()
      const w = data.widgets
      if (w.enabledWidgets) ws.setEnabledWidgets(w.enabledWidgets)
      if (w.customWidgets) {
        for (const cw of w.customWidgets) {
          const existing = ws.customWidgets.find(x => x.id === cw.id)
          if (existing) ws.updateCustomWidget(cw)
          else ws.addCustomWidget(cw)
        }
        for (const existing of ws.customWidgets) {
          if (!w.customWidgets.find((x: any) => x.id === existing.id)) {
            ws.deleteCustomWidget(existing.id)
          }
        }
      }
      if (w.widgetConfig) ws.updateWidgetConfig(w.widgetConfig)
    }

    const cleaned = { ...data }
    delete cleaned.type
    cacheDesktopState(cleaned)
  } finally {
    _applyingRemote = false
  }
}

// ── Load from backend ─────────────────────────────────────────────

async function loadDesktopFromBackend() {
  const maxRetries = 3
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const data = await api<DesktopState>('/api/preferences/desktop')
      applyDesktopState(data)
      return
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
}

// ── Hook: call in Desktop component ───────────────────────────────

export function useDesktopSync() {
  const initializedRef = useRef(false)

  // Load desktop state from backend on mount, then enable persistence
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Clear any stale pending patches from before the load
    _pendingDesktopPatch = {}
    if (_desktopSaveTimer) {
      clearTimeout(_desktopSaveTimer)
      _desktopSaveTimer = null
    }
    _syncReady = false

    loadDesktopFromBackend().finally(() => {
      _syncReady = true
    })

    return () => {
      _syncReady = false
    }
  }, [])

  // Subscribe to wallpaper changes and persist to backend
  useEffect(() => {
    return useSystemStore.subscribe((state, prev) => {
      if (!isDesktopSyncReady()) return
      if (state.wallpaper !== prev.wallpaper) {
        persistDesktopToBackend({ wallpaper: state.wallpaper })
      }
    })
  }, [])

  // Subscribe to widget changes and persist to backend
  useEffect(() => {
    return useWidgetStore.subscribe((state, prev) => {
      if (!isDesktopSyncReady()) return
      if (
        state.enabledWidgets !== prev.enabledWidgets ||
        state.customWidgets !== prev.customWidgets ||
        state.widgetConfig !== prev.widgetConfig
      ) {
        persistDesktopToBackend({
          widgets: {
            enabledWidgets: state.enabledWidgets,
            customWidgets: state.customWidgets,
            widgetConfig: state.widgetConfig,
          },
        })
      }
    })
  }, [])
}
