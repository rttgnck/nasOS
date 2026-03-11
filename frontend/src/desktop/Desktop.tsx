import { useCallback, useState } from 'react'
import { useWindowStore } from '../store/windowStore'
import { useSystemStore } from '../store/systemStore'
import { useMetricsWebSocket } from '../hooks/useWebSocket'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { Window } from './Window'
import { Taskbar } from './Taskbar'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { DesktopIcons } from './DesktopIcons'
import { DesktopWidgets } from './DesktopWidgets'
import { SnapOverlay, type SnapZone } from './WindowSnapping'
import { AltTabSwitcher } from './AltTabSwitcher'
import { BackupManager } from '../apps/BackupManager/BackupManager'
import { DockerManager } from '../apps/DockerManager/DockerManager'
import { FileManager } from '../apps/FileManager/FileManager'
import { LogViewer } from '../apps/LogViewer/LogViewer'
import { ShareManager } from '../apps/ShareManager/ShareManager'
import { StorageManager } from '../apps/StorageManager/StorageManager'
import { Settings } from '../apps/Settings/Settings'
import { SystemMonitor } from '../apps/SystemMonitor/SystemMonitor'
import { PlaceholderApp } from '../apps/PlaceholderApp'
import { ToastContainer } from './ToastContainer'

export function Desktop() {
  useMetricsWebSocket()
  const { showAltTab, altTabIndex } = useKeyboardShortcuts()

  const windows = useWindowStore((s) => s.windows)
  const openWindow = useWindowStore((s) => s.openWindow)
  const [snapZone, setSnapZone] = useState<SnapZone>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: MenuItem[]
  } | null>(null)

  const handleDesktopContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Open File Manager', action: () => openWindow('file-manager', 'File Manager') },
          { label: 'Open System Monitor', action: () => openWindow('system-monitor', 'Monitor') },
          { separator: true, label: '' },
          { label: 'Refresh', action: () => window.location.reload() },
          { separator: true, label: '' },
          { label: 'Settings', action: () => openWindow('settings', 'Settings') },
        ],
      })
    },
    [openWindow]
  )

  const renderAppContent = (appId: string, title: string) => {
    switch (appId) {
      case 'backup-manager':
        return <BackupManager />
      case 'docker-manager':
        return <DockerManager />
      case 'file-manager':
        return <FileManager />
      case 'log-viewer':
        return <LogViewer />
      case 'share-manager':
        return <ShareManager />
      case 'storage-manager':
        return <StorageManager />
      case 'settings':
        return <Settings />
      case 'user-manager':
        return <Settings initialTab="users" />
      case 'network-settings':
        return <Settings initialTab="network" />
      case 'system-updates':
        return <Settings initialTab="updates" />
      case 'system-monitor':
        return <SystemMonitor />
      default:
        return <PlaceholderApp appId={appId} title={title} />
    }
  }

  const wallpaper = useSystemStore((s) => s.wallpaper)

  return (
    <div
      className="desktop"
      onContextMenu={handleDesktopContextMenu}
      style={wallpaper ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {/* Desktop icons */}
      <DesktopIcons />

      {/* Desktop widgets */}
      <DesktopWidgets />
      {/* Snap zone preview overlay */}
      <SnapOverlay zone={snapZone} />

      {/* Windows */}
      {windows.map((win) => (
        <Window key={win.id} window={win} onSnapPreview={setSnapZone}>
          {renderAppContent(win.appId, win.title)}
        </Window>
      ))}

      {/* Alt+Tab Switcher */}
      {showAltTab && <AltTabSwitcher selectedIndex={altTabIndex} />}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Taskbar */}
      <Taskbar />
    </div>
  )
}
