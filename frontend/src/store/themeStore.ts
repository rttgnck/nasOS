import { create } from 'zustand'
import { api } from '../hooks/useApi'

// ── Theme Variable Keys ────────────────────────────────────────────

export type ThemeVar =
  | 'color-bg-desktop'
  | 'color-bg-window'
  | 'color-bg-titlebar'
  | 'color-bg-taskbar'
  | 'color-bg-surface'
  | 'color-accent'
  | 'color-accent-hover'
  | 'color-text'
  | 'color-text-secondary'
  | 'color-border'
  | 'color-shadow'
  | 'radius'
  | 'radius-sm'
  | 'glass-blur-window'
  | 'glass-blur-titlebar'
  | 'glass-blur-taskbar'
  | 'glass-blur-startmenu'
  | 'glass-blur-popup'
  | 'glass-blur-widget'
  | 'glass-blur-notification'
  | 'glass-blur-modal'
  | 'glass-window-alpha'
  | 'glass-titlebar-alpha'
  | 'glass-taskbar-alpha'
  | 'glass-startmenu-alpha'
  | 'glass-popup-alpha'
  | 'glass-widget-alpha'
  | 'glass-notification-alpha'
  | 'glass-modal-alpha'

export const THEME_VAR_META: {
  key: ThemeVar
  label: string
  type: 'color' | 'text' | 'slider'
  group: string
  sliderMin?: number
  sliderMax?: number
  sliderStep?: number
  sliderUnit?: string
}[] = [
  { key: 'color-bg-desktop',     label: 'Desktop Background',   type: 'color',  group: 'Backgrounds' },
  { key: 'color-bg-window',      label: 'Window Background',    type: 'color',  group: 'Backgrounds' },
  { key: 'color-bg-titlebar',    label: 'Titlebar',             type: 'color',  group: 'Backgrounds' },
  { key: 'color-bg-taskbar',     label: 'Taskbar',              type: 'color',  group: 'Backgrounds' },
  { key: 'color-bg-surface',     label: 'Surface',              type: 'color',  group: 'Backgrounds' },
  { key: 'color-accent',         label: 'Accent Color',         type: 'color',  group: 'Colors' },
  { key: 'color-accent-hover',   label: 'Accent Hover',         type: 'color',  group: 'Colors' },
  { key: 'color-text',           label: 'Primary Text',         type: 'color',  group: 'Colors' },
  { key: 'color-text-secondary', label: 'Secondary Text',       type: 'color',  group: 'Colors' },
  { key: 'color-border',         label: 'Border Color',         type: 'color',  group: 'Colors' },
  { key: 'radius',               label: 'Border Radius',        type: 'text',   group: 'Shape' },
  { key: 'radius-sm',            label: 'Border Radius (sm)',   type: 'text',   group: 'Shape' },
  { key: 'glass-blur-window',      label: 'Window Blur',          type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-blur-titlebar',    label: 'Titlebar Blur',        type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-blur-taskbar',     label: 'Taskbar Blur',         type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-blur-startmenu',   label: 'Start Menu Blur',      type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-blur-popup',         label: 'Popup / Menu Blur',    type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-blur-widget',         label: 'Widget Blur',          type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-blur-notification',   label: 'Notification Blur',    type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-blur-modal',           label: 'Modal Blur',           type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 64, sliderStep: 1,    sliderUnit: 'px' },
  { key: 'glass-window-alpha',     label: 'Window Opacity',       type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
  { key: 'glass-titlebar-alpha',   label: 'Titlebar Opacity',     type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
  { key: 'glass-taskbar-alpha',    label: 'Taskbar Opacity',      type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
  { key: 'glass-startmenu-alpha',  label: 'Start Menu Opacity',   type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
  { key: 'glass-popup-alpha',        label: 'Popup / Menu Opacity', type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
  { key: 'glass-widget-alpha',        label: 'Widget Opacity',       type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
  { key: 'glass-notification-alpha',  label: 'Notification Opacity', type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
  { key: 'glass-modal-alpha',          label: 'Modal Opacity',        type: 'slider', group: 'Glass Effect', sliderMin: 0, sliderMax: 1,  sliderStep: 0.01, sliderUnit: '' },
]

// ── Theme Definition ───────────────────────────────────────────────

export interface Theme {
  id: string
  name: string
  builtIn: boolean
  vars: Record<ThemeVar, string>
}

// ── Built-in Themes ────────────────────────────────────────────────

export const DEFAULT_THEME: Theme = {
  id: 'default',
  name: 'Default',
  builtIn: true,
  vars: {
    'color-bg-desktop':    '#1a1a2e',
    'color-bg-window':     '#16213e',
    'color-bg-titlebar':   '#0f3460',
    'color-bg-taskbar':    '#0a0a1a',
    'color-bg-surface':    '#1e1e3a',
    'color-accent':        '#e94560',
    'color-accent-hover':  '#ff6b81',
    'color-text':          '#eeeeee',
    'color-text-secondary':'#aaaaaa',
    'color-border':        '#2a2a4a',
    'color-shadow':        'rgba(0,0,0,0.4)',
    'radius':              '8px',
    'radius-sm':           '4px',
    'glass-blur-window':     '0px',
    'glass-blur-titlebar':   '0px',
    'glass-blur-taskbar':    '0px',
    'glass-blur-startmenu':       '0px',
    'glass-blur-popup':           '0px',
    'glass-blur-widget':          '0px',
    'glass-blur-notification':    '0px',
    'glass-blur-modal':            '0px',
    'glass-window-alpha':         '1',
    'glass-titlebar-alpha':       '1',
    'glass-taskbar-alpha':        '1',
    'glass-startmenu-alpha':      '1',
    'glass-popup-alpha':          '1',
    'glass-widget-alpha':         '1',
    'glass-notification-alpha':   '1',
    'glass-modal-alpha':          '1',
  },
}

export const LIQUID_GLASS_THEME: Theme = {
  id: 'liquid-glass',
  name: 'Liquid Glass',
  builtIn: true,
  vars: {
    'color-bg-desktop':    '#080d1f',
    'color-bg-window':     '#102244',
    'color-bg-titlebar':   '#09182e',
    'color-bg-taskbar':    '#04070f',
    'color-bg-surface':    '#112060',
    'color-accent':        '#4fc3f7',
    'color-accent-hover':  '#81d4fa',
    'color-text':          'rgba(255,255,255,0.95)',
    'color-text-secondary':'rgba(255,255,255,0.58)',
    'color-border':        'transparent',
    'color-shadow':        'rgba(0,0,0,0.18)',
    'radius':              '14px',
    'radius-sm':           '7px',
    'glass-blur-window':     '32px',
    'glass-blur-titlebar':   '0px',
    'glass-blur-taskbar':    '28px',
    'glass-blur-startmenu':       '40px',
    'glass-blur-popup':           '24px',
    'glass-blur-widget':          '20px',
    'glass-blur-notification':    '16px',
    'glass-blur-modal':               '28px',
    'glass-window-alpha':         '0.55',
    'glass-titlebar-alpha':       '0.42',
    'glass-taskbar-alpha':        '0.48',
    'glass-startmenu-alpha':      '0.75',
    'glass-popup-alpha':          '0.80',
    'glass-widget-alpha':         '0.60',
    'glass-notification-alpha':   '0.85',
    'glass-modal-alpha':          '0.70',
  },
}

export const BUILT_IN_THEMES: Theme[] = [DEFAULT_THEME, LIQUID_GLASS_THEME]

// ── DOM application ────────────────────────────────────────────────

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme.id
  const vars: Record<ThemeVar, string> = { ...DEFAULT_THEME.vars, ...theme.vars }
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(`--${key}`, value)
  }
  const alpha = (key: ThemeVar) => parseFloat(vars[key] ?? '1')
  root.style.setProperty('--glass-border-window',    alpha('glass-window-alpha')    >= 1 ? '1' : '0')
  root.style.setProperty('--glass-border-titlebar',  alpha('glass-titlebar-alpha')  >= 1 ? '1' : '0')
  root.style.setProperty('--glass-border-taskbar',   alpha('glass-taskbar-alpha')   >= 1 ? '1' : '0')
  root.style.setProperty('--glass-border-startmenu',     alpha('glass-startmenu-alpha')     >= 1 ? '1' : '0')
  root.style.setProperty('--glass-border-popup',          alpha('glass-popup-alpha')          >= 1 ? '1' : '0')
  root.style.setProperty('--glass-border-widget',         alpha('glass-widget-alpha')         >= 1 ? '1' : '0')
  root.style.setProperty('--glass-border-notification',   alpha('glass-notification-alpha')   >= 1 ? '1' : '0')
  root.style.setProperty('--glass-border-modal',           alpha('glass-modal-alpha')           >= 1 ? '1' : '0')
}

// ── Backend persistence ────────────────────────────────────────────

let _saveTimer: ReturnType<typeof setTimeout> | null = null

function persistToBackend() {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    const { activeThemeId, customThemes } = useThemeStore.getState()
    api('/api/preferences/theme', {
      method: 'PUT',
      body: JSON.stringify({
        active_theme_id: activeThemeId,
        custom_themes: customThemes,
      }),
    }).catch(() => {})
  }, 300)
}

// ── Store ──────────────────────────────────────────────────────────

interface ThemeStore {
  activeThemeId: string
  customThemes: Theme[]

  getActiveTheme: () => Theme
  setActiveTheme: (id: string) => void
  addCustomTheme: (theme: Theme) => void
  updateCustomTheme: (theme: Theme) => void
  deleteCustomTheme: (id: string) => void

  /** Load theme prefs from the backend after authentication. */
  loadFromBackend: () => Promise<void>
  /** Apply an incoming WebSocket theme_update from another session. */
  applyRemoteUpdate: (data: { active_theme_id: string; custom_themes: Theme[] }) => void
}

function resolveTheme(id: string, customs: Theme[]): Theme {
  return (
    BUILT_IN_THEMES.find((t) => t.id === id) ??
    customs.find((t) => t.id === id) ??
    DEFAULT_THEME
  )
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  activeThemeId: localStorage.getItem('nasos-theme') ?? 'default',
  customThemes: [],

  getActiveTheme: () => {
    const { activeThemeId, customThemes } = get()
    return resolveTheme(activeThemeId, customThemes)
  },

  setActiveTheme: (id) => {
    const { customThemes } = get()
    const theme = resolveTheme(id, customThemes)
    localStorage.setItem('nasos-theme', id)
    applyTheme(theme)
    set({ activeThemeId: id })
    persistToBackend()
  },

  addCustomTheme: (theme) => {
    set((state) => {
      const updated = [...state.customThemes, theme]
      return { customThemes: updated }
    })
    persistToBackend()
  },

  updateCustomTheme: (theme) => {
    set((state) => {
      const updated = state.customThemes.map((t) => (t.id === theme.id ? theme : t))
      if (state.activeThemeId === theme.id) applyTheme(theme)
      return { customThemes: updated }
    })
    persistToBackend()
  },

  deleteCustomTheme: (id) => {
    set((state) => {
      const updated = state.customThemes.filter((t) => t.id !== id)
      const patch: Partial<ThemeStore> = { customThemes: updated }
      if (state.activeThemeId === id) {
        localStorage.setItem('nasos-theme', 'default')
        patch.activeThemeId = 'default'
        applyTheme(DEFAULT_THEME)
      }
      return patch
    })
    persistToBackend()
  },

  loadFromBackend: async () => {
    try {
      const data = await api<{ active_theme_id: string; custom_themes: Theme[] }>(
        '/api/preferences/theme',
      )
      const customs = data.custom_themes ?? []
      const id = data.active_theme_id ?? 'default'
      const theme = resolveTheme(id, customs)
      localStorage.setItem('nasos-theme', id)
      set({ activeThemeId: id, customThemes: customs })
      applyTheme(theme)
    } catch {
      // Backend unreachable — keep whatever is in localStorage
    }
  },

  applyRemoteUpdate: (data) => {
    const customs = data.custom_themes ?? []
    const id = data.active_theme_id ?? 'default'
    const theme = resolveTheme(id, customs)
    localStorage.setItem('nasos-theme', id)
    set({ activeThemeId: id, customThemes: customs })
    applyTheme(theme)
  },
}))

// ── Init (call once on app boot, before auth) ──────────────────────

export function initTheme() {
  const id = localStorage.getItem('nasos-theme') ?? 'default'
  const theme = resolveTheme(id, [])
  applyTheme(theme)
}
