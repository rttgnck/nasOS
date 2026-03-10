import React, { useCallback, useRef, useState } from 'react'
import { useWindowStore, type WindowState } from '../store/windowStore'
import { getSnapZone, getSnapGeometry, type SnapZone } from './WindowSnapping'

interface WindowProps {
  window: WindowState
  onSnapPreview: (zone: SnapZone) => void
  children: React.ReactNode
}

export function Window({ window: win, onSnapPreview, children }: WindowProps) {
  const { focusWindow, closeWindow, minimizeWindow, toggleMaximize, updateWindow, snapWindow } =
    useWindowStore()

  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

  const handleTitleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) {
        // Unsnap on drag from maximized: restore window size centered on cursor
        const restoreW = win.preSnapGeometry?.width ?? 800
        const restoreH = win.preSnapGeometry?.height ?? 550
        const ratioX = e.clientX / window.innerWidth
        const newX = e.clientX - restoreW * ratioX
        const newY = e.clientY - 18 // half titlebar

        updateWindow(win.id, {
          isMaximized: false,
          x: newX,
          y: Math.max(0, newY),
          width: restoreW,
          height: restoreH,
          preSnapGeometry: null,
        })

        dragOffset.current = { x: restoreW * ratioX, y: 18 }
      } else {
        dragOffset.current = { x: e.clientX - win.x, y: e.clientY - win.y }
      }

      e.preventDefault()
      focusWindow(win.id)
      setIsDragging(true)

      const handleMove = (e: MouseEvent) => {
        updateWindow(win.id, {
          x: e.clientX - dragOffset.current.x,
          y: Math.max(0, e.clientY - dragOffset.current.y),
        })
        // Show snap preview
        onSnapPreview(getSnapZone(e.clientX, e.clientY))
      }

      const handleUp = (e: MouseEvent) => {
        setIsDragging(false)
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)

        // Apply snap if at an edge
        const zone = getSnapZone(e.clientX, e.clientY)
        if (zone) {
          const geo = getSnapGeometry(zone)
          if (geo) {
            if (zone === 'maximize') {
              updateWindow(win.id, {
                isMaximized: true,
                preSnapGeometry: win.preSnapGeometry ?? {
                  x: e.clientX - dragOffset.current.x,
                  y: e.clientY - dragOffset.current.y,
                  width: win.width,
                  height: win.height,
                },
              })
            } else {
              snapWindow(win.id, geo.x, geo.y, geo.width, geo.height)
            }
          }
        }
        onSnapPreview(null)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [win.id, win.x, win.y, win.width, win.height, win.isMaximized, win.preSnapGeometry, focusWindow, updateWindow, snapWindow, onSnapPreview]
  )

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) return
      e.preventDefault()
      e.stopPropagation()
      focusWindow(win.id)
      setIsResizing(true)
      resizeStart.current = { x: e.clientX, y: e.clientY, w: win.width, h: win.height }

      const handleMove = (e: MouseEvent) => {
        const dx = e.clientX - resizeStart.current.x
        const dy = e.clientY - resizeStart.current.y
        updateWindow(win.id, {
          width: Math.max(win.minWidth, resizeStart.current.w + dx),
          height: Math.max(win.minHeight, resizeStart.current.h + dy),
          preSnapGeometry: null, // Clear snap state on manual resize
        })
      }

      const handleUp = () => {
        setIsResizing(false)
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [win.id, win.width, win.height, win.minWidth, win.minHeight, win.isMaximized, focusWindow, updateWindow]
  )

  const isFocused = useWindowStore((s) => s.focusedWindowId === win.id)

  if (win.isMinimized) return null

  const taskbarH = 48
  const style: React.CSSProperties = win.isMaximized
    ? {
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: `calc(100% - ${taskbarH}px)`,
        zIndex: win.zIndex,
        borderRadius: 0,
      }
    : {
        position: 'absolute',
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      }

  return (
    <div
      className="window"
      style={style}
      onMouseDown={() => focusWindow(win.id)}
      data-focused={isFocused}
      data-dragging={isDragging}
      data-resizing={isResizing}
      data-anim={win.animState}
    >
      {/* Title bar */}
      <div className="window-titlebar" onMouseDown={handleTitleBarMouseDown} onDoubleClick={() => toggleMaximize(win.id)}>
        <span className="window-title">{win.title}</span>
        <div className="window-controls">
          <button className="window-btn window-btn-minimize" onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id) }} title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" fill="currentColor" /></svg>
          </button>
          <button className="window-btn window-btn-maximize" onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id) }} title="Maximize">
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button className="window-btn window-btn-close" onClick={(e) => { e.stopPropagation(); closeWindow(win.id) }} title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="window-content">
        {children}
      </div>

      {/* Resize handle */}
      {!win.isMaximized && (
        <div className="window-resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
    </div>
  )
}
