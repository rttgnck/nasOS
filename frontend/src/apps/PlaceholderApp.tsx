import {
  type LucideIcon,
  Archive, Box, Globe, HardDrive, Package, ScrollText, Settings, Share2, Users,
} from 'lucide-react'

interface PlaceholderAppProps {
  appId: string
  title: string
}

export function PlaceholderApp({ appId, title }: PlaceholderAppProps) {
  return (
    <div className="placeholder-app">
      <div className="placeholder-app-icon">
        {getAppIcon(appId)}
      </div>
      <h2>{title}</h2>
      <p>This application is under development.</p>
      <p className="placeholder-app-id">App ID: {appId}</p>
    </div>
  )
}

function getAppIcon(appId: string): JSX.Element {
  const iconMap: Record<string, LucideIcon> = {
    'storage-manager': HardDrive,
    'share-manager': Share2,
    'user-manager': Users,
    'docker-manager': Box,
    'network-settings': Globe,
    'backup-manager': Archive,
    'log-viewer': ScrollText,
    'settings': Settings,
  }
  const Icon = iconMap[appId] ?? Package
  return <Icon size={48} />
}
