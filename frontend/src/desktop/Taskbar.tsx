import { useEffect, useRef, useState } from 'react'
import {
  type LucideIcon,
  FolderOpen, HardDrive, Share2, Users, Box, Network, Activity, Archive, ScrollText, Settings, RefreshCw,
} from 'lucide-react'
import { useWindowStore } from '../store/windowStore'
import { useSystemStore } from '../store/systemStore'
import { NotificationCenter } from './NotificationCenter'

const APP_MENU_ITEMS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'file-manager',     label: 'File Manager', Icon: FolderOpen  },
  { id: 'storage-manager',  label: 'Storage',      Icon: HardDrive   },
  { id: 'share-manager',    label: 'Shares',       Icon: Share2      },
  { id: 'user-manager',     label: 'Users',        Icon: Users       },
  { id: 'docker-manager',   label: 'Docker',       Icon: Box         },
  { id: 'network-settings', label: 'Network',      Icon: Network     },
  { id: 'system-monitor',   label: 'Monitor',      Icon: Activity    },
  { id: 'backup-manager',   label: 'Backup',       Icon: Archive     },
  { id: 'log-viewer',       label: 'Logs',         Icon: ScrollText  },
  { id: 'system-updates',   label: 'Updates',      Icon: RefreshCw   },
  { id: 'settings',         label: 'Settings',     Icon: Settings    },
]

export function Taskbar() {
  const { windows, focusWindow, minimizeWindow, minimizeAll, restoreAll } = useWindowStore()
  const { metrics, isConnected } = useSystemStore()
  const { openWindow } = useWindowStore()
  const [showMenu, setShowMenu] = useState(false)
  const [clock, setClock] = useState(formatTime())
  const menuRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setClock(formatTime()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Listen for Meta key toggle from keyboard shortcuts
  useEffect(() => {
    const handler = () => setShowMenu((prev) => !prev)
    window.addEventListener('nasos:toggle-app-menu', handler)
    return () => window.removeEventListener('nasos:toggle-app-menu', handler)
  }, [])

  // Close menu when clicking anywhere outside the menu panel or its button.
  // NOTE: We cannot use a position:fixed backdrop inside .taskbar for this because
  // backdrop-filter on .taskbar creates a CSS containing block that confines
  // position:fixed children to the taskbar's own bounds — it never covers the desktop.
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const handleTaskClick = (windowId: string, isMinimized: boolean, isFocused: boolean) => {
    if (isMinimized || !isFocused) {
      focusWindow(windowId)
    } else {
      minimizeWindow(windowId)
    }
  }

  const handleAppLaunch = (appId: string, label: string) => {
    openWindow(appId, label)
    setShowMenu(false)
  }

  const handleShowDesktop = () => {
    const hasVisible = windows.some((w) => !w.isMinimized)
    if (hasVisible) {
      minimizeAll()
    } else {
      restoreAll()
    }
  }

  return (
    <div className="taskbar">
      {/* App Menu Button */}
      <button ref={menuBtnRef} className="taskbar-menu-btn" onClick={() => setShowMenu(!showMenu)} title="Applications">
        <img src="/nasos-logo.svg" alt="nasOS" style={{ width: 22, height: 22, borderRadius: 4 }} />
      </button>

      {/* App Menu Popup — no backdrop div: backdrop-filter on .taskbar traps
           position:fixed children within taskbar bounds. Click-outside is handled
           by a document mousedown listener in the useEffect above. */}
      {showMenu && (
        <div ref={menuRef} className="taskbar-menu">
          <div className="taskbar-menu-header">
            <img src="/nasos-logo.svg" alt="" style={{ width: 24, height: 24, borderRadius: 4 }} />
            <span>nasOS</span>
          </div>
          {APP_MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              className="taskbar-menu-item"
              onClick={() => handleAppLaunch(item.id, item.label)}
            >
              <span className="taskbar-menu-icon"><item.Icon size={18} strokeWidth={1.75} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Window Tasks */}
      <div className="taskbar-tasks">
        {windows.map((win) => {
          const isFocused = useWindowStore.getState().focusedWindowId === win.id
          return (
            <button
              key={win.id}
              className="taskbar-task"
              data-focused={isFocused && !win.isMinimized}
              data-minimized={win.isMinimized}
              onClick={() => handleTaskClick(win.id, win.isMinimized, isFocused)}
              title={win.title}
            >
              {win.title}
            </button>
          )
        })}
      </div>

      {/* System Tray */}
      <div className="taskbar-tray">
        <span className="tray-item" title={`CPU: ${metrics.cpuPercent.toFixed(0)}%`}>
          CPU {metrics.cpuPercent.toFixed(0)}%
        </span>
        {metrics.temperature !== null && (
          <span
            className="tray-item"
            title={`Temperature: ${metrics.temperature.toFixed(1)}°C`}
            data-temp-level={
              metrics.temperature > 75 ? 'hot' : metrics.temperature > 60 ? 'warm' : 'cool'
            }
          >
            {metrics.temperature.toFixed(0)}°C
          </span>
        )}
        <span className="tray-item" data-connected={isConnected} title={isConnected ? 'Connected' : 'Disconnected'}>
          {isConnected ? '●' : '○'}
        </span>

        {/* Notification Center */}
        <NotificationCenter />

        <span className="tray-item tray-clock">{clock}</span>

        {/* Show Desktop strip */}
        <button className="taskbar-show-desktop" onClick={handleShowDesktop} title="Show Desktop" />
      </div>
    </div>
  )
}

function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
