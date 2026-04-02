import { create } from 'zustand'

export interface DashboardPanelDef {
  id: string
  name: string
  description: string
  defaultEnabled: boolean
  size: 'small' | 'medium' | 'large'
}

export const DASHBOARD_PANELS: DashboardPanelDef[] = [
  { id: 'cpu',         name: 'CPU',               description: 'Real-time CPU usage with history chart',           defaultEnabled: true,  size: 'small'  },
  { id: 'memory',      name: 'Memory',             description: 'RAM usage with history chart',                     defaultEnabled: true,  size: 'small'  },
  { id: 'temperature', name: 'Temperature',        description: 'CPU temperature gauge',                           defaultEnabled: true,  size: 'small'  },
  { id: 'uptime',      name: 'Uptime',             description: 'System uptime and load averages',                 defaultEnabled: true,  size: 'small'  },
  { id: 'network',     name: 'Network I/O',        description: 'Upload and download throughput with graph',       defaultEnabled: true,  size: 'medium' },
  { id: 'storage',     name: 'Storage',            description: 'Disk usage overview for all drives',              defaultEnabled: true,  size: 'medium' },
  { id: 'sata',        name: 'SATA Disks',         description: 'Connected SATA HAT drives and mount status',      defaultEnabled: true,  size: 'medium' },
  { id: 'docker',      name: 'Docker',             description: 'Running and stopped container status',            defaultEnabled: true,  size: 'medium' },
  { id: 'services',    name: 'Services',           description: 'System service health indicators',                defaultEnabled: true,  size: 'medium' },
  { id: 'shares',      name: 'Shares',             description: 'Network share usage and protocol info',           defaultEnabled: false, size: 'medium' },
  { id: 'system-info', name: 'System Info',        description: 'Hostname, version, platform, and kernel',         defaultEnabled: true,  size: 'large'  },
]

export type DashboardColumns = 'auto' | 2 | 3 | 4

export interface DashboardConfig {
  enabledPanels: string[]
  columns: DashboardColumns
  scaleDisplay: number
  scaleRemote: number
  autoOpenDisplay: boolean
  pollInterval: number
}

const DEFAULT_CONFIG: DashboardConfig = {
  enabledPanels: DASHBOARD_PANELS.filter(p => p.defaultEnabled).map(p => p.id),
  columns: 'auto',
  scaleDisplay: 2,
  scaleRemote: 1,
  autoOpenDisplay: true,
  pollInterval: 15,
}

export function isDisplaySession(): boolean {
  return !!(window as any).nasOS?.isElectron
}

const LS_KEY = 'nasos-dashboard'

function load(): DashboardConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function save(config: DashboardConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(config))
}

function clampScale(v: number): number {
  return Math.round(Math.max(0.5, Math.min(5, v)) * 100) / 100
}

interface DashboardStore extends DashboardConfig {
  togglePanel: (id: string) => void
  setEnabledPanels: (ids: string[]) => void
  movePanel: (id: string, direction: 'up' | 'down') => void
  setColumns: (cols: DashboardColumns) => void
  setScaleDisplay: (v: number) => void
  setScaleRemote: (v: number) => void
  setActiveScale: (v: number) => void
  setAutoOpenDisplay: (on: boolean) => void
  setPollInterval: (seconds: number) => void
  resetDefaults: () => void
}

const initial = load()

export const useDashboardStore = create<DashboardStore>((set) => ({
  ...initial,

  togglePanel: (id) =>
    set((s) => ({
      enabledPanels: s.enabledPanels.includes(id)
        ? s.enabledPanels.filter(p => p !== id)
        : [...s.enabledPanels, id],
    })),

  setEnabledPanels: (ids) => set({ enabledPanels: ids }),

  movePanel: (id, direction) =>
    set((s) => {
      const arr = [...s.enabledPanels]
      const idx = arr.indexOf(id)
      if (idx === -1) return s
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= arr.length) return s
      ;[arr[idx], arr[target]] = [arr[target]!, arr[idx]!]
      return { enabledPanels: arr }
    }),

  setColumns: (columns) => set({ columns }),
  setScaleDisplay: (v) => set({ scaleDisplay: clampScale(v) }),
  setScaleRemote: (v) => set({ scaleRemote: clampScale(v) }),
  setActiveScale: (v) => {
    const clamped = clampScale(v)
    if (isDisplaySession()) set({ scaleDisplay: clamped })
    else set({ scaleRemote: clamped })
  },
  setAutoOpenDisplay: (autoOpenDisplay) => set({ autoOpenDisplay }),
  setPollInterval: (pollInterval) => set({ pollInterval }),
  resetDefaults: () => set({ ...DEFAULT_CONFIG }),
}))

useDashboardStore.subscribe((state: DashboardConfig) => {
  save({
    enabledPanels: state.enabledPanels,
    columns: state.columns,
    scaleDisplay: state.scaleDisplay,
    scaleRemote: state.scaleRemote,
    autoOpenDisplay: state.autoOpenDisplay,
    pollInterval: state.pollInterval,
  })
})
