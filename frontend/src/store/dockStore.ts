import { create } from 'zustand'

const LS_KEY = 'nasos-dock'

const DEFAULT_ITEMS = [
  'file-manager',
  'terminal',
  'system-monitor',
  'docker-manager',
  'storage-manager',
  'settings',
]

interface Persisted {
  items: string[]
  iconSize: number
  magnification: number
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { items: DEFAULT_ITEMS, iconSize: 40, magnification: 1.6 }
}

function save(state: Persisted) {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

interface DockStore {
  items: string[]
  iconSize: number
  magnification: number

  setItems: (items: string[]) => void
  addItem: (appId: string) => void
  removeItem: (appId: string) => void
  moveItem: (appId: string, direction: 'left' | 'right') => void
  setIconSize: (size: number) => void
  setMagnification: (mag: number) => void
}

const initial = load()

export const useDockStore = create<DockStore>((set) => ({
  items: initial.items,
  iconSize: initial.iconSize,
  magnification: initial.magnification,

  setItems: (items) => set({ items }),
  addItem: (appId) =>
    set((s) => ({
      items: s.items.includes(appId) ? s.items : [...s.items, appId],
    })),
  removeItem: (appId) =>
    set((s) => ({ items: s.items.filter((id) => id !== appId) })),
  moveItem: (appId, direction) =>
    set((s) => {
      const arr = [...s.items]
      const idx = arr.indexOf(appId)
      if (idx === -1) return s
      const target = direction === 'left' ? idx - 1 : idx + 1
      if (target < 0 || target >= arr.length) return s
      ;[arr[idx], arr[target]] = [arr[target]!, arr[idx]!]
      return { items: arr }
    }),
  setIconSize: (iconSize) => set({ iconSize }),
  setMagnification: (magnification) => set({ magnification }),
}))

useDockStore.subscribe((state) => {
  save({
    items: state.items,
    iconSize: state.iconSize,
    magnification: state.magnification,
  })
})
