import { useCallback, useState } from 'react'
import { useWindowStore } from '../store/windowStore'
import { useSystemStore } from '../store/systemStore'
import { useMetricsWebSocket } from '../hooks/useWebSocket'
import { useFileOpsWebSocket } from '../hooks/useFileOpsWebSocket'
import { useThemeSyncWebSocket } from '../hooks/useThemeSyncWebSocket'
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
import { TextEditor } from '../apps/TextEditor/TextEditor'
import { MediaViewer } from '../apps/MediaViewer/MediaViewer'
import { Terminal } from '../apps/Terminal/Terminal'
import { PlaceholderApp } from '../apps/PlaceholderApp'
import { ToastContainer } from './ToastContainer'
import { ChangePasswordModal } from '../apps/ForceChangePassword/ForceChangePassword'
import { FileOpsModal } from '../apps/FileManager/FileOpsModal'
import { Dock } from './Dock'
import { useUpdateCheck } from '../hooks/useUpdateCheck'
import { useDesktopSync } from '../hooks/useDesktopSync'
import { useLayoutStore } from '../store/layoutStore'

export function Desktop() {
  useMetricsWebSocket()
  useFileOpsWebSocket()
  useThemeSyncWebSocket()
  useUpdateCheck()
  useDesktopSync()
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
          { label: 'Open Terminal', action: () => openWindow('terminal', 'Terminal') },
          { label: 'Open System Monitor', action: () => openWindow('system-monitor', 'Monitor') },
          { separator: true, label: '' },
          { label: 'Personalization', action: () => openWindow('personalization', 'Personalization') },
          { separator: true, label: '' },
          { label: 'Refresh', action: () => window.location.reload() },
          { separator: true, label: '' },
          { label: 'Settings', action: () => openWindow('settings', 'Settings') },
        ],
      })
    },
    [openWindow]
  )

  const renderAppContent = (appId: string, title: string, windowId: string, win: any) => {
    switch (appId) {
      case 'backup-manager':
        return <BackupManager />
      case 'docker-manager':
        return <DockerManager />
      case 'file-manager':
        return <FileManager windowId={windowId} />
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
      case 'personalization':
        return <Settings initialTab="personalization" />
      case 'system-monitor':
        return <SystemMonitor />
      case 'terminal':
        return <Terminal windowId={windowId} />
      case 'text-editor': {
        const meta = (win as any).appMeta
        return meta ? (
          <TextEditor filePath={meta.filePath} fileName={meta.fileName} windowId={windowId} />
        ) : (
          <PlaceholderApp appId={appId} title={title} />
        )
      }
      case 'media-viewer': {
        const meta = (win as any).appMeta
        return meta ? (
          <MediaViewer filePath={meta.filePath} fileName={meta.fileName} fileType={meta.fileType} />
        ) : (
          <PlaceholderApp appId={appId} title={title} />
        )
      }
      default:
        return <PlaceholderApp appId={appId} title={title} />
    }
  }

  const wallpaper = useSystemStore((s) => s.wallpaper)
  const taskbarPosition = useLayoutStore((s) => s.taskbarPosition)

  return (
    <div
      className="desktop"
      data-taskbar={taskbarPosition}
      onContextMenu={handleDesktopContextMenu}
      style={wallpaper ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      <DesktopIcons />
      <DesktopWidgets />
      <SnapOverlay zone={snapZone} />

      {windows.map((win) => (
        <Window key={win.id} window={win} onSnapPreview={setSnapZone}>
          {renderAppContent(win.appId, win.title, win.id, win)}
        </Window>
      ))}

      {showAltTab && <AltTabSwitcher selectedIndex={altTabIndex} />}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <ToastContainer />
      <ChangePasswordModal />
      <FileOpsModal />
      <Dock />
      <Taskbar />
    </div>
  )
}
