import { useEffect } from 'react'
import { initTheme } from '../store/themeStore'

/**
 * Call once at the root of the app to apply the persisted theme on boot.
 */
export function useTheme() {
  useEffect(() => {
    initTheme()
  }, [])
}
