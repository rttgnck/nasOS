import { create } from 'zustand'

const LS_KEY = 'nasos-layout'

export type ScreenEdge = 'top' | 'bottom' | 'left' | 'right'

interface Persisted {
  taskbarPosition: ScreenEdge
  dockPosition: ScreenEdge
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { taskbarPosition: 'bottom', dockPosition: 'top' }
}

function save(state: Persisted) {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

interface LayoutStore {
  taskbarPosition: ScreenEdge
  dockPosition: ScreenEdge

  setTaskbarPosition: (pos: ScreenEdge) => void
  setDockPosition: (pos: ScreenEdge) => void
}

const initial = load()

export const useLayoutStore = create<LayoutStore>((set) => ({
  taskbarPosition: initial.taskbarPosition,
  dockPosition: initial.dockPosition,

  setTaskbarPosition: (taskbarPosition) => set({ taskbarPosition }),
  setDockPosition: (dockPosition) => set({ dockPosition }),
}))

useLayoutStore.subscribe((state) => {
  save({
    taskbarPosition: state.taskbarPosition,
    dockPosition: state.dockPosition,
  })
})
