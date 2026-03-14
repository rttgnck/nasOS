import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useFileOperationsStore, type FileOpProgress } from '../store/fileOperationsStore'

export function useFileOpsWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { upsertOperation, setOperations } = useFileOperationsStore()

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let mounted = true

    function connect() {
      const token = useAuthStore.getState().token
      if (!token) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const ws = new WebSocket(`${protocol}//${host}/ws/file-ops?token=${encodeURIComponent(token)}`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'file_ops_snapshot') {
            setOperations(data.operations as FileOpProgress[])
          } else if (data.type === 'file_op_progress') {
            const { type: _type, ...op } = data
            upsertOperation(op as FileOpProgress)
          }
          // Ignore pings
        } catch {
          // Ignore malformed messages
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
  }, [upsertOperation, setOperations])
}
