import { useEffect, useRef } from 'react'
import { useSystemStore } from '../store/systemStore'

export function useMetricsWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { updateMetrics, setConnected } = useSystemStore()

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const ws = new WebSocket(`${protocol}//${host}/ws/metrics`)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'metrics') {
            updateMetrics({
              cpuPercent: data.cpu_percent,
              memoryPercent: data.memory_percent,
              memoryUsed: data.memory_used,
              memoryTotal: data.memory_total,
              temperature: data.temperature,
              netSentPerSec: data.net?.bytes_sent_per_sec ?? 0,
              netRecvPerSec: data.net?.bytes_recv_per_sec ?? 0,
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
  }, [updateMetrics, setConnected])
}
