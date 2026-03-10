import { useWindowStore } from '../store/windowStore'

interface DesktopIcon {
  id: string
  appId: string
  label: string
  icon: string
}

const DESKTOP_ICONS: DesktopIcon[] = [
  { id: 'icon-files', appId: 'file-manager', label: 'File Manager', icon: '📁' },
  { id: 'icon-storage', appId: 'storage-manager', label: 'Storage', icon: '💾' },
  { id: 'icon-shares', appId: 'share-manager', label: 'Shares', icon: '🔗' },
  { id: 'icon-docker', appId: 'docker-manager', label: 'Docker', icon: '🐳' },
  { id: 'icon-monitor', appId: 'system-monitor', label: 'Monitor', icon: '📊' },
  { id: 'icon-backup', appId: 'backup-manager', label: 'Backups', icon: '🔄' },
  { id: 'icon-settings', appId: 'settings', label: 'Settings', icon: '⚙️' },
]

export function DesktopIcons() {
  const openWindow = useWindowStore((s) => s.openWindow)

  return (
    <div className="desktop-icons">
      {DESKTOP_ICONS.map((icon, index) => (
        <button
          key={icon.id}
          className="desktop-icon"
          style={{ top: 20 + index * 100, left: 20 }}
          onDoubleClick={() => openWindow(icon.appId, icon.label)}
        >
          <span className="desktop-icon-image">{icon.icon}</span>
          <span className="desktop-icon-label">{icon.label}</span>
        </button>
      ))}
    </div>
  )
}
