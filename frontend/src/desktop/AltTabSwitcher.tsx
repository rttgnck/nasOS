import { useWindowStore } from '../store/windowStore'

const APP_ICONS: Record<string, string> = {
  'file-manager': '📁',
  'storage-manager': '💾',
  'share-manager': '🔗',
  'user-manager': '👥',
  'docker-manager': '🐳',
  'network-settings': '🌐',
  'system-monitor': '📊',
  'backup-manager': '💿',
  'log-viewer': '📋',
  'settings': '⚙️',
}

interface AltTabSwitcherProps {
  selectedIndex: number
}

export function AltTabSwitcher({ selectedIndex }: AltTabSwitcherProps) {
  const windows = useWindowStore((s) => s.windows)
  const sorted = [...windows].sort((a, b) => b.zIndex - a.zIndex)

  if (sorted.length === 0) return null

  return (
    <div className="alt-tab-overlay">
      <div className="alt-tab-switcher">
        {sorted.map((win, i) => (
          <div
            key={win.id}
            className="alt-tab-item"
            data-selected={i === selectedIndex}
          >
            <span className="alt-tab-icon">
              {APP_ICONS[win.appId] ?? '📦'}
            </span>
            <span className="alt-tab-title">{win.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
