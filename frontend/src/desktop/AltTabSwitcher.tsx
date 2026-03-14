import {
  type LucideIcon,
  FolderOpen, HardDrive, Share2, Users, Box, Globe, Activity, Archive, ScrollText, Settings, TerminalSquare, Package,
} from 'lucide-react'
import { useWindowStore } from '../store/windowStore'

const APP_ICONS: Record<string, LucideIcon> = {
  'file-manager': FolderOpen,
  'storage-manager': HardDrive,
  'share-manager': Share2,
  'user-manager': Users,
  'docker-manager': Box,
  'network-settings': Globe,
  'system-monitor': Activity,
  'backup-manager': Archive,
  'log-viewer': ScrollText,
  'terminal': TerminalSquare,
  'settings': Settings,
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
              {(() => { const Icon = APP_ICONS[win.appId] ?? Package; return <Icon size={20} /> })()}
            </span>
            <span className="alt-tab-title">{win.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
