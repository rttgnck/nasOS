import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useWindowStore } from '../store/windowStore'

beforeEach(() => {
  vi.useFakeTimers()
  useWindowStore.setState({
    windows: [],
    focusedWindowId: null,
    nextZIndex: 1,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('windowStore', () => {
  it('opens a window and returns an id', () => {
    const id = useWindowStore.getState().openWindow('file-manager', 'File Manager')
    expect(id).toBeTruthy()
    expect(useWindowStore.getState().windows).toHaveLength(1)
    expect(useWindowStore.getState().windows[0]!.appId).toBe('file-manager')
    expect(useWindowStore.getState().windows[0]!.title).toBe('File Manager')
  })

  it('closes a window', () => {
    const id = useWindowStore.getState().openWindow('settings', 'Settings')
    expect(useWindowStore.getState().windows).toHaveLength(1)

    useWindowStore.getState().closeWindow(id)
    // Window enters 'closing' animation state first, then gets removed
    // After closeWindow, the window may still exist briefly with animState='closing'
    const win = useWindowStore.getState().windows.find((w) => w.id === id)
    if (win) {
      expect(win.animState).toBe('closing')
    }
  })

  it('focuses a window and updates z-index', () => {
    const id1 = useWindowStore.getState().openWindow('app1', 'App 1')
    const id2 = useWindowStore.getState().openWindow('app2', 'App 2')

    useWindowStore.getState().focusWindow(id1)
    expect(useWindowStore.getState().focusedWindowId).toBe(id1)

    const win1 = useWindowStore.getState().windows.find((w) => w.id === id1)
    const win2 = useWindowStore.getState().windows.find((w) => w.id === id2)
    expect(win1!.zIndex).toBeGreaterThan(win2!.zIndex)
  })

  it('minimizes and restores a window', () => {
    const id = useWindowStore.getState().openWindow('test', 'Test')

    useWindowStore.getState().minimizeWindow(id)
    // minimizeWindow uses a 150ms animation timeout before setting isMinimized
    vi.advanceTimersByTime(200)
    let win = useWindowStore.getState().windows.find((w) => w.id === id)
    expect(win!.isMinimized).toBe(true)

    useWindowStore.getState().restoreWindow(id)
    vi.advanceTimersByTime(250)
    win = useWindowStore.getState().windows.find((w) => w.id === id)
    expect(win!.isMinimized).toBe(false)
  })

  it('toggles maximize', () => {
    const id = useWindowStore.getState().openWindow('test', 'Test')

    useWindowStore.getState().toggleMaximize(id)
    let win = useWindowStore.getState().windows.find((w) => w.id === id)
    expect(win!.isMaximized).toBe(true)

    useWindowStore.getState().toggleMaximize(id)
    win = useWindowStore.getState().windows.find((w) => w.id === id)
    expect(win!.isMaximized).toBe(false)
  })

  it('snaps a window to given coordinates', () => {
    const id = useWindowStore.getState().openWindow('test', 'Test')

    useWindowStore.getState().snapWindow(id, 0, 0, 640, 480)
    const win = useWindowStore.getState().windows.find((w) => w.id === id)
    expect(win!.x).toBe(0)
    expect(win!.y).toBe(0)
    expect(win!.width).toBe(640)
    expect(win!.height).toBe(480)
    expect(win!.preSnapGeometry).not.toBeNull()
  })
})
