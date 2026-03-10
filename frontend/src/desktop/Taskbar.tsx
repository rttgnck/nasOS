import { useEffect, useState } from 'react'
import { useWindowStore } from '../store/windowStore'
import { useSystemStore } from '../store/systemStore'
import { NotificationCenter } from './NotificationCenter'

const APP_MENU_ITEMS = [
  { id: 'file-manager', label: 'File Manager', icon: '📁' },
  { id: 'storage-manager', label: 'Storage', icon: '💾' },
  { id: 'share-manager', label: 'Shares', icon: '🔗' },
  { id: 'user-manager', label: 'Users', icon: '👥' },
  { id: 'docker-manager', label: 'Docker', icon: '🐳' },
  { id: 'network-settings', label: 'Network', icon: '🌐' },
  { id: 'system-monitor', label: 'Monitor', icon: '📊' },
  { id: 'backup-manager', label: 'Backup', icon: '💿' },
  { id: 'log-viewer', label: 'Logs', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export function Taskbar() {
  const { windows, focusWindow, minimizeWindow, minimizeAll, restoreAll } = useWindowStore()
  const { metrics, isConnected } = useSystemStore()
  const { openWindow } = useWindowStore()
  const [showMenu, setShowMenu] = useState(false)
  const [clock, setClock] = useState(formatTime())

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
      <button className="taskbar-menu-btn" onClick={() => setShowMenu(!showMenu)} title="Applications">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect x="2" y="3" width="7" height="7" rx="1" />
          <rect x="11" y="3" width="7" height="7" rx="1" />
          <rect x="2" y="12" width="7" height="7" rx="1" />
          <rect x="11" y="12" width="7" height="7" rx="1" />
        </svg>
      </button>

      {/* App Menu Popup */}
      {showMenu && (
        <>
          <div className="taskbar-menu-backdrop" onClick={() => setShowMenu(false)} />
          <div className="taskbar-menu">
            <div className="taskbar-menu-header">nasOS</div>
            {APP_MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                className="taskbar-menu-item"
                onClick={() => handleAppLaunch(item.id, item.label)}
              >
                <span className="taskbar-menu-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
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
