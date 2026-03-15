import { useEffect } from 'react'
import { api } from './useApi'
import { useSystemStore } from '../store/systemStore'

interface CachedRelease {
  update_available: boolean
  current_version?: string
  latest_version?: string
  release_name?: string
}

export function useUpdateCheck() {
  const addNotification = useSystemStore((s) => s.addNotification)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const data = await api<CachedRelease>('/api/update/check/cached')
        if (!cancelled && data.update_available && data.latest_version) {
          addNotification(
            'Update Available',
            `nasOS ${data.release_name || `v${data.latest_version}`} is available. Go to Settings → Updates to install.`,
            'info',
          )
        }
      } catch {
        // silent
      }
    }

    const timeout = setTimeout(check, 5000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [addNotification])
}
