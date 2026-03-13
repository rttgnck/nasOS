import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type LucideIcon,
  FolderOpen, HardDrive, Share2, Box, Activity, Archive, Settings, RefreshCw,
} from 'lucide-react'
import { useWindowStore } from '../store/windowStore'

interface DesktopIcon {
  id: string
  appId: string
  label: string
  Icon: LucideIcon
}

interface IconPosition {
  x: number
  y: number
}

const DESKTOP_ICONS: DesktopIcon[] = [
  { id: 'icon-files',    appId: 'file-manager',    label: 'File Manager', Icon: FolderOpen },
  { id: 'icon-storage',  appId: 'storage-manager', label: 'Storage',      Icon: HardDrive },
  { id: 'icon-shares',   appId: 'share-manager',   label: 'Shares',       Icon: Share2 },
  { id: 'icon-docker',   appId: 'docker-manager',  label: 'Docker',       Icon: Box },
  { id: 'icon-monitor',  appId: 'system-monitor',  label: 'Monitor',      Icon: Activity },
  { id: 'icon-backup',   appId: 'backup-manager',  label: 'Backups',      Icon: Archive },
  { id: 'icon-updates',  appId: 'system-updates',  label: 'Updates',      Icon: RefreshCw },
  { id: 'icon-settings', appId: 'settings',        label: 'Settings',     Icon: Settings },
]

const GRID_SIZE = 100
const ICON_MARGIN = 20
const TASKBAR_HEIGHT = 48

/** Snap raw pixel coords to the nearest grid cell. */
function snapToGrid(x: number, y: number): IconPosition {
  return {
    x: Math.max(ICON_MARGIN, Math.round((x - ICON_MARGIN) / GRID_SIZE) * GRID_SIZE + ICON_MARGIN),
    y: Math.max(ICON_MARGIN, Math.round((y - ICON_MARGIN) / GRID_SIZE) * GRID_SIZE + ICON_MARGIN),
  }
}

/** Clamp a snapped position so icons never overlap the taskbar. */
function clampPosition(pos: IconPosition): IconPosition {
  const maxY = window.innerHeight - TASKBAR_HEIGHT - GRID_SIZE
  return {
    x: Math.max(ICON_MARGIN, pos.x),
    y: Math.min(maxY, Math.max(ICON_MARGIN, pos.y)),
  }
}

/**
 * Default positions: icons fill a column from the top; when the column would
 * overflow into the taskbar area the remaining icons wrap to a second column.
 */
function getDefaultPositions(): Record<string, IconPosition> {
  const positions: Record<string, IconPosition> = {}
  const availableHeight = window.innerHeight - TASKBAR_HEIGHT - ICON_MARGIN * 2
  const iconsPerColumn = Math.max(1, Math.floor(availableHeight / GRID_SIZE))
  DESKTOP_ICONS.forEach((icon, index) => {
    const col = Math.floor(index / iconsPerColumn)
    const row = index % iconsPerColumn
    positions[icon.id] = {
      x: ICON_MARGIN + col * GRID_SIZE,
      y: ICON_MARGIN + row * GRID_SIZE,
    }
  })
  return positions
}

function loadPositions(): Record<string, IconPosition> {
  const defaults = getDefaultPositions()
  try {
    const saved = localStorage.getItem('nasos-desktop-icon-positions')
    if (saved) {
      // Merge: saved positions take priority, but any new icons get their default position.
      // Re-snap & clamp everything so stale off-grid / below-taskbar positions are fixed.
      const merged = { ...defaults, ...JSON.parse(saved) }
      const corrected: Record<string, IconPosition> = {}
      for (const [id, pos] of Object.entries(merged)) {
        corrected[id] = clampPosition(snapToGrid((pos as IconPosition).x, (pos as IconPosition).y))
      }
      return corrected
    }
  } catch { /* ignore */ }
  return defaults
}

function savePositions(positions: Record<string, IconPosition>) {
  localStorage.setItem('nasos-desktop-icon-positions', JSON.stringify(positions))
}

export function DesktopIcons() {
  const openWindow = useWindowStore((s) => s.openWindow)
  const [positions, setPositions] = useState<Record<string, IconPosition>>(loadPositions)
  const [dragging, setDragging] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const dragStart = useRef<{ x: number; y: number; iconX: number; iconY: number } | null>(null)

  // Save positions whenever they change
  useEffect(() => {
    savePositions(positions)
  }, [positions])

  // On resize, re-validate that no icon overlaps the taskbar
  useEffect(() => {
    const handleResize = () => {
      setPositions((prev) => {
        const next = { ...prev }
        let changed = false
        for (const id of Object.keys(next)) {
          const current = next[id]
          if (!current) continue
          const clamped = clampPosition(current)
          if (clamped.x !== current.x || clamped.y !== current.y) {
            next[id] = clamped
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, iconId: string) => {
    // Only left-click starts a drag
    if (e.button !== 0) return
    e.preventDefault()
    const pos = positions[iconId] || { x: 0, y: 0 }
    dragStart.current = { x: e.clientX, y: e.clientY, iconX: pos.x, iconY: pos.y }
    setSelected(iconId)

    const handleMouseMove = (me: MouseEvent) => {
      if (!dragStart.current) return
      const dx = me.clientX - dragStart.current.x
      const dy = me.clientY - dragStart.current.y
      // Only start visual drag after 5px threshold
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setDragging(iconId)
        // Snap to grid live while dragging so the user sees the target cell
        const snapped = clampPosition(snapToGrid(
          dragStart.current.iconX + dx,
          dragStart.current.iconY + dy,
        ))
        setPositions((prev) => ({ ...prev, [iconId]: snapped }))
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      // Position is already snapped & clamped from the last mousemove; nothing extra needed.
      setDragging(null)
      dragStart.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [positions])

  const handleDesktopClick = useCallback(() => {
    setSelected(null)
  }, [])

  useEffect(() => {
    const el = document.querySelector('.desktop')
    if (el) {
      el.addEventListener('click', handleDesktopClick as EventListener)
      return () => el.removeEventListener('click', handleDesktopClick as EventListener)
    }
  }, [handleDesktopClick])

  return (
    <div className="desktop-icons">
      {DESKTOP_ICONS.map((icon) => {
        const pos = positions[icon.id] || { x: 0, y: 0 }
        return (
          <button
            key={icon.id}
            className={`desktop-icon${dragging === icon.id ? ' dragging' : ''}${selected === icon.id ? ' selected' : ''}`}
            style={{ top: pos.y, left: pos.x }}
            onMouseDown={(e) => handleMouseDown(e, icon.id)}
            onDoubleClick={() => openWindow(icon.appId, icon.label)}
            onClick={(e) => { e.stopPropagation(); setSelected(icon.id) }}
          >
            <span className="desktop-icon-image"><icon.Icon size={32} strokeWidth={1.5} /></span>
            <span className="desktop-icon-label">{icon.label}</span>
          </button>
        )
      })}
    </div>
  )
}
