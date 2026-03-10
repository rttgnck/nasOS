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

function getAppIcon(appId: string): string {
  const icons: Record<string, string> = {
    'storage-manager': '💾',
    'share-manager': '🔗',
    'user-manager': '👥',
    'docker-manager': '🐳',
    'network-settings': '🌐',
    'backup-manager': '💿',
    'log-viewer': '📋',
    'settings': '⚙️',
  }
  return icons[appId] ?? '📦'
}
