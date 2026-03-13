import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useSystemStore } from '../store/systemStore'

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const { notifications, markRead, clearNotifications } = useSystemStore()
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="notification-center">
      <button
        className="tray-item notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5a4 4 0 0 0-4 4v3l-1 2h10l-1-2v-3a4 4 0 0 0-4-4z" />
          <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && createPortal(
        <>
          <div className="notification-backdrop" onClick={() => setIsOpen(false)} />
          <div className="notification-panel">
            <div className="notification-panel-header">
              <span>Notifications</span>
              {notifications.length > 0 && (
                <button className="notification-clear" onClick={clearNotifications}>
                  Clear all
                </button>
              )}
            </div>
            <div className="notification-list">
              {notifications.length === 0 && (
                <div className="notification-empty">No notifications</div>
              )}
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="notification-item"
                  data-type={notif.type}
                  data-read={notif.read}
                  onClick={() => markRead(notif.id)}
                >
                  <div className="notification-item-icon">
                    {notif.type === 'error' ? <XCircle size={16} /> :
                     notif.type === 'warning' ? <AlertTriangle size={16} /> :
                     notif.type === 'success' ? <CheckCircle2 size={16} /> : <Info size={16} />}
                  </div>
                  <div className="notification-item-content">
                    <div className="notification-item-title">{notif.title}</div>
                    <div className="notification-item-message">{notif.message}</div>
                    <div className="notification-item-time">
                      {formatTimeAgo(notif.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function formatTimeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
