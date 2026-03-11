import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useSystemStore } from '../store/systemStore'

interface Toast {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  exiting: boolean
}

export function ToastContainer() {
  const notifications = useSystemStore((s) => s.notifications)
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastSeenRef = useRef('')

  // Watch for new notifications and create toasts
  useEffect(() => {
    if (notifications.length === 0) return

    const newest = notifications[0] // notifications are prepended
    if (newest && newest.id > lastSeenRef.current) {
      lastSeenRef.current = newest.id
      const toast: Toast = {
        id: newest.id,
        title: newest.title,
        message: newest.message,
        type: newest.type,
        exiting: false,
      }
      setToasts((prev) => [...prev, toast].slice(-5)) // max 5 toasts

      // Auto-dismiss after 5s
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === toast.id ? { ...t, exiting: true } : t))
        )
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id))
        }, 300) // exit animation duration
      }, 5000)
    }
  }, [notifications])

  const dismissToast = (id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }

  if (toasts.length === 0) return null

  const typeIcon = (type: string) => {
    switch (type) {
      case 'error': return <XCircle size={16} />
      case 'warning': return <AlertTriangle size={16} />
      case 'success': return <CheckCircle2 size={16} />
      default: return <Info size={16} />
    }
  }

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-item toast-${toast.type} ${toast.exiting ? 'toast-exit' : 'toast-enter'}`}
        >
          <span className="toast-icon">{typeIcon(toast.type)}</span>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button className="toast-close" onClick={() => dismissToast(toast.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}
