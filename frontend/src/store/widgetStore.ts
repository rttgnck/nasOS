import { create } from 'zustand'

export interface WidgetDefinition {
  id: string
  name: string
  description: string
  builtIn: boolean
  defaultEnabled: boolean
  configurable: boolean
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  { id: 'clock', name: 'Clock', description: 'Current time and date', builtIn: true, defaultEnabled: true, configurable: true },
  { id: 'system-stats', name: 'System Stats', description: 'CPU, RAM, temperature, and network speed', builtIn: true, defaultEnabled: true, configurable: true },
  { id: 'status', name: 'Connection Status', description: 'Server online/offline indicator', builtIn: true, defaultEnabled: true, configurable: false },
  { id: 'file-ops', name: 'File Operations', description: 'Active file copy/move progress', builtIn: true, defaultEnabled: true, configurable: false },
  { id: 'network', name: 'Network Status', description: 'Interface details, IPs, and connectivity', builtIn: true, defaultEnabled: true, configurable: true },
  { id: 'storage', name: 'Storage Overview', description: 'Disk usage and pool health', builtIn: true, defaultEnabled: false, configurable: false },
  { id: 'docker', name: 'Docker Containers', description: 'Running and stopped container status', builtIn: true, defaultEnabled: false, configurable: false },
  { id: 'uptime', name: 'Uptime', description: 'System uptime and load averages', builtIn: true, defaultEnabled: false, configurable: true },
]

export interface CustomWidget {
  id: string
  name: string
  template: string
}

export interface WidgetConfig {
  clockFormat?: '12h' | '24h'
  clockShowWeekday?: boolean
  clockShowDate?: boolean
  statsShowCpu?: boolean
  statsShowRam?: boolean
  statsShowTemp?: boolean
  statsShowNetwork?: boolean
  networkShowInterface?: boolean
  networkShowIp?: boolean
  networkShowGateway?: boolean
  uptimeShowLoad?: boolean
}

const DEFAULT_CONFIG: WidgetConfig = {
  clockFormat: '12h',
  clockShowWeekday: true,
  clockShowDate: true,
  statsShowCpu: true,
  statsShowRam: true,
  statsShowTemp: true,
  statsShowNetwork: true,
  networkShowInterface: true,
  networkShowIp: true,
  networkShowGateway: true,
  uptimeShowLoad: true,
}

const STORAGE_KEY = 'nasos-widgets'

interface Persisted {
  enabledWidgets: string[]
  customWidgets: CustomWidget[]
  widgetConfig: WidgetConfig
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {
    enabledWidgets: WIDGET_REGISTRY.filter(w => w.defaultEnabled).map(w => w.id),
    customWidgets: [],
    widgetConfig: { ...DEFAULT_CONFIG },
  }
}

function save(state: Persisted) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

interface WidgetStore {
  enabledWidgets: string[]
  customWidgets: CustomWidget[]
  widgetConfig: WidgetConfig

  toggleWidget: (id: string) => void
  setEnabledWidgets: (ids: string[]) => void
  moveWidget: (id: string, direction: 'up' | 'down') => void
  addCustomWidget: (widget: CustomWidget) => void
  updateCustomWidget: (widget: CustomWidget) => void
  deleteCustomWidget: (id: string) => void
  updateWidgetConfig: (patch: Partial<WidgetConfig>) => void
}

const initial = load()

export const useWidgetStore = create<WidgetStore>((set) => ({
  enabledWidgets: initial.enabledWidgets,
  customWidgets: initial.customWidgets,
  widgetConfig: { ...DEFAULT_CONFIG, ...initial.widgetConfig },

  toggleWidget: (id) =>
    set((s) => ({
      enabledWidgets: s.enabledWidgets.includes(id)
        ? s.enabledWidgets.filter(w => w !== id)
        : [...s.enabledWidgets, id],
    })),

  setEnabledWidgets: (ids) => set({ enabledWidgets: ids }),

  moveWidget: (id, direction) =>
    set((s) => {
      const arr = [...s.enabledWidgets]
      const idx = arr.indexOf(id)
      if (idx === -1) return s
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= arr.length) return s
      const tmp = arr[idx]!
      arr[idx] = arr[target]!
      arr[target] = tmp
      return { enabledWidgets: arr }
    }),

  addCustomWidget: (widget) =>
    set((s) => ({
      customWidgets: [...s.customWidgets, widget],
      enabledWidgets: [...s.enabledWidgets, widget.id],
    })),

  updateCustomWidget: (widget) =>
    set((s) => ({
      customWidgets: s.customWidgets.map(w => w.id === widget.id ? widget : w),
    })),

  deleteCustomWidget: (id) =>
    set((s) => ({
      customWidgets: s.customWidgets.filter(w => w.id !== id),
      enabledWidgets: s.enabledWidgets.filter(w => w !== id),
    })),

  updateWidgetConfig: (patch) =>
    set((s) => ({ widgetConfig: { ...s.widgetConfig, ...patch } })),
}))

useWidgetStore.subscribe((state) => {
  save({
    enabledWidgets: state.enabledWidgets,
    customWidgets: state.customWidgets,
    widgetConfig: state.widgetConfig,
  })
})

export const WIDGET_TEMPLATES = [
  { name: 'Blank', template: '' },
  { name: 'Status Monitor', template: 'CPU: {{cpu}}%\nRAM: {{ram}}%\nTemp: {{temp}}°C' },
  { name: 'Quick Glance', template: '{{time}} · {{weekday}}\n{{status}} · CPU {{cpu}}%' },
  { name: 'Network Info', template: '↑ {{netUp}}  ↓ {{netDown}}\n{{status}}' },
]
