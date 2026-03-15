import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

export function useThemeSyncWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    let reconnectTimeout: ReturnType<typeof setTimeout>
    let retryDelay = 1000
    let mounted = true

    function connect() {
      if (!mounted) return
      const currentToken = useAuthStore.getState().token
      if (!currentToken) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const ws = new WebSocket(
        `${protocol}//${host}/ws/theme-sync?token=${encodeURIComponent(currentToken)}`,
      )
      wsRef.current = ws

      ws.onopen = () => {
        retryDelay = 1000
      }

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
          reconnectTimeout = setTimeout(connect, retryDelay)
          retryDelay = Math.min(retryDelay * 1.5, 15000)
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
  }, [token])
}
