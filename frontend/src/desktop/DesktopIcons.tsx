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

function getDefaultPositions(): Record<string, IconPosition> {
  const positions: Record<string, IconPosition> = {}
  DESKTOP_ICONS.forEach((icon, index) => {
    positions[icon.id] = { x: ICON_MARGIN, y: ICON_MARGIN + index * GRID_SIZE }
  })
  return positions
}

function loadPositions(): Record<string, IconPosition> {
  const defaults = getDefaultPositions()
  try {
    const saved = localStorage.getItem('nasos-desktop-icon-positions')
    if (saved) {
      // Merge: saved positions take priority, but any new icons get their default position
      return { ...defaults, ...JSON.parse(saved) }
    }
  } catch { /* ignore */ }
  return defaults
}

function savePositions(positions: Record<string, IconPosition>) {
  localStorage.setItem('nasos-desktop-icon-positions', JSON.stringify(positions))
}

function snapToGrid(x: number, y: number): IconPosition {
  return {
    x: Math.max(0, Math.round(x / GRID_SIZE) * GRID_SIZE + ICON_MARGIN),
    y: Math.max(0, Math.round(y / GRID_SIZE) * GRID_SIZE + ICON_MARGIN),
  }
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
        setPositions((prev) => ({
          ...prev,
          [iconId]: {
            x: dragStart.current!.iconX + dx,
            y: dragStart.current!.iconY + dy,
          },
        }))
      }
    }

    const handleMouseUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      if (dragging === iconId || (dragStart.current && (Math.abs(me.clientX - dragStart.current.x) > 5 || Math.abs(me.clientY - dragStart.current.y) > 5))) {
        // Snap to grid
        const pos = positions[iconId]
        if (pos) {
          setPositions((prev) => ({
            ...prev,
            [iconId]: snapToGrid(pos.x, pos.y),
          }))
        }
      }
      setDragging(null)
      dragStart.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [positions, dragging])

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
