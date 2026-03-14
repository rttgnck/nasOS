import { useEffect, useCallback, useState } from 'react'
import { useWindowStore } from '../store/windowStore'

export function useKeyboardShortcuts() {
  const {
    windows,
    focusedWindowId,
    requestClose,
    focusWindow,
    minimizeWindow,
  } = useWindowStore()

  const [showAltTab, setShowAltTab] = useState(false)
  const [altTabIndex, setAltTabIndex] = useState(0)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Alt+Tab — window switcher
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault()
        if (windows.length <= 1) return

        if (!showAltTab) {
          setShowAltTab(true)
          // Start at second window (next from current)
          const sorted = [...windows].sort((a, b) => b.zIndex - a.zIndex)
          const idx = sorted.length > 1 ? 1 : 0
          setAltTabIndex(idx)
        } else {
          setAltTabIndex((prev) => (prev + 1) % windows.length)
        }
      }

      // Alt+F4 — close focused window
      if (e.altKey && e.key === 'F4') {
        e.preventDefault()
        if (focusedWindowId) {
          requestClose(focusedWindowId)
        }
      }

      // Super / Meta key — toggle app menu (handled by Taskbar)
      // We dispatch a custom event the Taskbar listens for
      if (e.key === 'Meta' && !e.altKey && !e.ctrlKey && !e.shiftKey) {
        window.dispatchEvent(new CustomEvent('nasos:toggle-app-menu'))
      }

      // Ctrl+D / Super+D — show desktop (minimize all)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        const hasVisible = windows.some((w) => !w.isMinimized)
        if (hasVisible) {
          windows.forEach((w) => {
            if (!w.isMinimized) minimizeWindow(w.id)
          })
        } else {
          // Restore all
          windows.forEach((w) => focusWindow(w.id))
        }
      }
    },
    [windows, focusedWindowId, showAltTab, requestClose, minimizeWindow, focusWindow]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      // Release Alt — commit Alt+Tab selection
      if (e.key === 'Alt' && showAltTab) {
        setShowAltTab(false)
        const sorted = [...windows].sort((a, b) => b.zIndex - a.zIndex)
        const target = sorted[altTabIndex]
        if (target) {
          focusWindow(target.id)
        }
      }
    },
    [showAltTab, altTabIndex, windows, focusWindow]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  return { showAltTab, altTabIndex }
}
