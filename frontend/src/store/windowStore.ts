import { create } from 'zustand'

export interface WindowState {
  id: string
  appId: string
  title: string
  x: number
  y: number
  width: number
  height: number
  minWidth: number
  minHeight: number
  isMaximized: boolean
  isMinimized: boolean
  zIndex: number
  preSnapGeometry: { x: number; y: number; width: number; height: number } | null
  animState: 'idle' | 'opening' | 'closing' | 'minimizing' | 'restoring'
  /** Arbitrary metadata passed to the app (e.g. file path for editors) */
  appMeta?: Record<string, any>
}

type BeforeCloseHandler = () => boolean | Promise<boolean>

const _beforeCloseHandlers = new Map<string, BeforeCloseHandler>()

export function registerBeforeClose(windowId: string, handler: BeforeCloseHandler) {
  _beforeCloseHandlers.set(windowId, handler)
}

export function unregisterBeforeClose(windowId: string) {
  _beforeCloseHandlers.delete(windowId)
}

export function getBeforeCloseHandler(windowId: string): BeforeCloseHandler | undefined {
  return _beforeCloseHandlers.get(windowId)
}

interface WindowStore {
  windows: WindowState[]
  focusedWindowId: string | null
  nextZIndex: number

  openWindow: (appId: string, title: string, options?: Partial<WindowState>) => string
  closeWindow: (id: string) => void
  requestClose: (id: string) => void
  focusWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  toggleMaximize: (id: string) => void
  updateWindow: (id: string, updates: Partial<WindowState>) => void
  snapWindow: (id: string, x: number, y: number, width: number, height: number) => void
  minimizeAll: () => void
  restoreAll: () => void
}

let windowCounter = 0

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  focusedWindowId: null,
  nextZIndex: 1,

  openWindow: (appId, title, options = {}) => {
    const id = `window-${++windowCounter}`
    const { nextZIndex } = get()

    const offset = (windowCounter % 10) * 30
    const newWindow: WindowState = {
      id,
      appId,
      title,
      x: 100 + offset,
      y: 60 + offset,
      width: 800,
      height: 550,
      minWidth: 400,
      minHeight: 300,
      isMaximized: false,
      isMinimized: false,
      zIndex: nextZIndex,
      preSnapGeometry: null,
      animState: 'opening',
      ...options,
    }

    set((state) => ({
      windows: [...state.windows, newWindow],
      focusedWindowId: id,
      nextZIndex: nextZIndex + 1,
    }))

    // Clear opening animation after transition
    setTimeout(() => {
      set((state) => ({
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, animState: 'idle' as const } : w
        ),
      }))
    }, 200)

    return id
  },

  closeWindow: (id) => {
    _beforeCloseHandlers.delete(id)
    // Trigger close animation
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, animState: 'closing' as const } : w
      ),
    }))

    // Remove after animation
    setTimeout(() => {
      set((state) => {
        const remaining = state.windows.filter((w) => w.id !== id)
        const newFocused = remaining.length > 0
          ? remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).id
          : null
        return { windows: remaining, focusedWindowId: newFocused }
      })
    }, 150)
  },

  requestClose: (id) => {
    const handler = _beforeCloseHandlers.get(id)
    if (handler) {
      const result = handler()
      if (result instanceof Promise) {
        result.then((canClose) => {
          if (canClose) get().closeWindow(id)
        })
      } else {
        if (result) get().closeWindow(id)
      }
    } else {
      get().closeWindow(id)
    }
  },

  focusWindow: (id) => {
    const { nextZIndex } = get()
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id
          ? { ...w, zIndex: nextZIndex, isMinimized: false, animState: w.isMinimized ? 'restoring' as const : w.animState }
          : w
      ),
      focusedWindowId: id,
      nextZIndex: nextZIndex + 1,
    }))

    // Clear restoring animation
    setTimeout(() => {
      set((state) => ({
        windows: state.windows.map((w) =>
          w.id === id && w.animState === 'restoring' ? { ...w, animState: 'idle' as const } : w
        ),
      }))
    }, 200)
  },

  minimizeWindow: (id) => {
    // Trigger minimize animation
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, animState: 'minimizing' as const } : w
      ),
    }))

    setTimeout(() => {
      set((state) => {
        const remaining = state.windows.map((w) =>
          w.id === id ? { ...w, isMinimized: true, animState: 'idle' as const } : w
        )
        const visible = remaining.filter((w) => !w.isMinimized)
        const newFocused = visible.length > 0
          ? visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).id
          : null
        return { windows: remaining, focusedWindowId: newFocused }
      })
    }, 150)
  },

  restoreWindow: (id) => {
    const { nextZIndex } = get()
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id
          ? { ...w, isMinimized: false, zIndex: nextZIndex, animState: 'restoring' as const }
          : w
      ),
      focusedWindowId: id,
      nextZIndex: nextZIndex + 1,
    }))

    setTimeout(() => {
      set((state) => ({
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, animState: 'idle' as const } : w
        ),
      }))
    }, 200)
  },

  toggleMaximize: (id) => {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== id) return w
        if (w.isMaximized && w.preSnapGeometry) {
          // Restore from maximize — use preSnapGeometry
          return {
            ...w,
            isMaximized: false,
            x: w.preSnapGeometry.x,
            y: w.preSnapGeometry.y,
            width: w.preSnapGeometry.width,
            height: w.preSnapGeometry.height,
            preSnapGeometry: null,
          }
        }
        return {
          ...w,
          isMaximized: !w.isMaximized,
          preSnapGeometry: w.isMaximized ? null : { x: w.x, y: w.y, width: w.width, height: w.height },
        }
      }),
    }))
  },

  updateWindow: (id, updates) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, ...updates } : w
      ),
    }))
  },

  snapWindow: (id, x, y, width, height) => {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== id) return w
        return {
          ...w,
          x,
          y,
          width,
          height,
          isMaximized: false,
          preSnapGeometry: w.preSnapGeometry ?? { x: w.x, y: w.y, width: w.width, height: w.height },
        }
      }),
    }))
  },

  minimizeAll: () => {
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, isMinimized: true })),
      focusedWindowId: null,
    }))
  },

  restoreAll: () => {
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, isMinimized: false })),
    }))
  },
}))
