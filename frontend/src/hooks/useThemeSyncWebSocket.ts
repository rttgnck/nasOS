import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

export function useThemeSyncWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let mounted = true

    function connect() {
      const token = useAuthStore.getState().token
      if (!token) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const ws = new WebSocket(
        `${protocol}//${host}/ws/theme-sync?token=${encodeURIComponent(token)}`,
      )
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'theme_update') {
            useThemeStore.getState().applyRemoteUpdate(data)
          }
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        if (mounted) {
          reconnectTimeout = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      mounted = false
      clearTimeout(reconnectTimeout)
      wsRef.current?.close()
    }
  }, [])
}
