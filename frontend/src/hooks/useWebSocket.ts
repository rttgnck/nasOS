import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useSystemStore } from '../store/systemStore'

export function useMetricsWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { updateMetrics, setConnected } = useSystemStore()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    let reconnectTimeout: ReturnType<typeof setTimeout>

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const ws = new WebSocket(`${protocol}//${host}/ws/metrics?token=${encodeURIComponent(token!)}`)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'metrics') {
            const safe = (v: unknown, fallback = 0) => {
              const n = Number(v)
              return Number.isFinite(n) ? n : fallback
            }
            updateMetrics({
              cpuPercent: safe(data.cpu_percent),
              memoryPercent: safe(data.memory_percent),
              memoryUsed: safe(data.memory_used),
              memoryTotal: safe(data.memory_total, 1),
              temperature: data.temperature != null ? safe(data.temperature) : null,
              netSentPerSec: safe(data.net?.bytes_sent_per_sec),
              netRecvPerSec: safe(data.net?.bytes_recv_per_sec),
            })
          }
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimeout = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      wsRef.current?.close()
    }
  }, [updateMetrics, setConnected, token])
}
