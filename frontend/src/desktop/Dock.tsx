import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  type LucideIcon,
  FolderOpen, HardDrive, Share2, Users, Box, Network, Activity, Archive, ScrollText,
  Settings, RefreshCw, TerminalSquare, Globe, Package, Palette,
} from 'lucide-react'
import { useDockStore } from '../store/dockStore'
import { useLayoutStore } from '../store/layoutStore'
import { useWindowStore } from '../store/windowStore'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { WindowPreviewPopup, useWindowPreviewHover } from './WindowPreview'

const APP_META: Record<string, { label: string; Icon: LucideIcon }> = {
  'file-manager':    { label: 'File Manager', Icon: FolderOpen },
  'storage-manager': { label: 'Storage',      Icon: HardDrive },
  'share-manager':   { label: 'Shares',       Icon: Share2 },
  'user-manager':    { label: 'Users',         Icon: Users },
  'docker-manager':  { label: 'Docker',        Icon: Box },
  'network-settings':{ label: 'Network',       Icon: Globe },
  'system-monitor':  { label: 'Monitor',       Icon: Activity },
  'backup-manager':  { label: 'Backups',       Icon: Archive },
  'log-viewer':      { label: 'Logs',          Icon: ScrollText },
  'terminal':        { label: 'Terminal',       Icon: TerminalSquare },
  'settings':        { label: 'Settings',      Icon: Settings },
  'system-updates':  { label: 'Updates',       Icon: RefreshCw },
  'personalization': { label: 'Personalization', Icon: Palette },
  'network':         { label: 'Network',       Icon: Network },
}

export function Dock() {
  const items = useDockStore((s) => s.items)
  const iconSize = useDockStore((s) => s.iconSize)
  const magnification = useDockStore((s) => s.magnification)
  const dockPosition = useLayoutStore((s) => s.dockPosition)
  const windows = useWindowStore((s) => s.windows)
  const openWindow = useWindowStore((s) => s.openWindow)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize)
  const requestClose = useWindowStore((s) => s.requestClose)

  const dockRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const { preview: dockPreview, onEnter: onDockEnter, onLeave: onDockLeave } = useWindowPreviewHover()

  const isVertical = dockPosition === 'left' || dockPosition === 'right'

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setMousePos(null)
  }, [])

  const getScale = useCallback((index: number): number => {
    if (!mousePos || !dockRef.current) return 1
    const children = dockRef.current.querySelectorAll('.dock-item')
    const child = children[index] as HTMLElement | undefined
    if (!child) return 1
    const rect = child.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distance = isVertical
      ? Math.abs(mousePos.y - centerY)
      : Math.abs(mousePos.x - centerX)
    const maxDist = iconSize * 2.5
    if (distance > maxDist) return 1
    const ratio = 1 - distance / maxDist
    return 1 + (magnification - 1) * ratio * ratio
  }, [mousePos, iconSize, magnification, isVertical])

  const openApps = new Set(windows.map((w) => w.appId))

  const handleClick = (appId: string) => {
    const existing = windows.filter((w) => w.appId === appId)
    if (existing.length > 0) {
      const unfocused = existing.find((w) => w.isMinimized) ?? existing[0]!
      focusWindow(unfocused.id)
    } else {
      const meta = APP_META[appId]
      openWindow(appId, meta?.label ?? appId)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, appId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const appWindows = windows.filter((w) => w.appId === appId)
    const menuItems: MenuItem[] = []

    if (appWindows.length > 0) {
      menuItems.push({
        label: 'Bring to Front',
        action: () => focusWindow(appWindows[0]!.id),
      })
      menuItems.push({
        label: appWindows[0]!.isMaximized ? 'Restore' : 'Maximize',
        action: () => toggleMaximize(appWindows[0]!.id),
      })
      menuItems.push({ separator: true, label: '' })
      menuItems.push({
        label: 'Close',
        action: () => appWindows.forEach((w) => requestClose(w.id)),
      })
    } else {
      const meta = APP_META[appId]
      menuItems.push({
        label: `Open ${meta?.label ?? appId}`,
        action: () => openWindow(appId, meta?.label ?? appId),
      })
    }

    setCtx({ x: e.clientX, y: e.clientY, items: menuItems })
  }

  // Dismiss tooltip/scale when dock hidden
  useEffect(() => {
    return () => setMousePos(null)
  }, [])

  const positionClass = `dock--${dockPosition}`
  const orientClass = isVertical ? 'dock--vertical' : 'dock--horizontal'

  return (
    <>
      <div
        ref={dockRef}
        className={`dock ${positionClass} ${orientClass}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="dock-items">
          {items.map((appId, i) => {
            const meta = APP_META[appId]
            if (!meta) return null
            const Icon = meta.Icon ?? Package
            const scale = getScale(i)
            const size = iconSize * scale
            const isOpen = openApps.has(appId)

            const appWin = windows.find((w) => w.appId === appId)

            return (
              <button
                key={appId}
                className="dock-item"
                style={{
                  width: size,
                  height: size,
                  transition: mousePos ? 'width 0.1s, height 0.1s' : 'width 0.25s, height 0.25s',
                }}
                onClick={() => handleClick(appId)}
                onMouseEnter={(e) => {
                  if (appWin) onDockEnter(e, appWin.id, appWin.title, appWin.isMinimized)
                }}
                onMouseLeave={onDockLeave}
                onContextMenu={(e) => { onDockLeave(); handleContextMenu(e, appId) }}
                title={meta.label}
              >
                <Icon size={size * 0.7} strokeWidth={1.5} />
                {isOpen && <span className="dock-indicator" />}
              </button>
            )
          })}
        </div>
      </div>

      {ctx && createPortal(
        <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />,
        document.body
      )}

      {dockPreview && (
        <WindowPreviewPopup
          windowId={dockPreview.windowId}
          title={dockPreview.title}
          anchorRect={dockPreview.anchorRect}
          isMinimized={dockPreview.isMinimized}
        />
      )}
    </>
  )
}
