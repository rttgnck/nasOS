import { useEffect, useRef } from 'react'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import { Desktop } from './desktop/Desktop'
import { LoginScreen } from './apps/LoginScreen/LoginScreen'

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const loadThemeFromBackend = useThemeStore((s) => s.loadFromBackend)
  const themeLoadedRef = useRef(false)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Load theme from backend whenever the user becomes authenticated.
  // Also runs on mount if the user is already authenticated (e.g. page reload
  // with a valid token) to guarantee the backend theme always wins over
  // whatever localStorage had cached from a previous session on this device.
  useEffect(() => {
    if (isAuthenticated) {
      themeLoadedRef.current = true
      loadThemeFromBackend()
    } else {
      themeLoadedRef.current = false
    }
  }, [isAuthenticated, loadThemeFromBackend])

  // Show nothing while checking existing token
  if (isLoading && !isAuthenticated) {
    return (
      <div className="login-screen">
        <div className="login-loading">
          <div className="login-logo-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="8" width="40" height="10" rx="3" fill="#4fc3f7" opacity="0.9" />
              <rect x="4" y="20" width="40" height="10" rx="3" fill="#4fc3f7" opacity="0.7" />
              <rect x="4" y="32" width="40" height="10" rx="3" fill="#4fc3f7" opacity="0.5" />
              <circle cx="10" cy="13" r="2" fill="#1a1a2e" />
              <circle cx="10" cy="25" r="2" fill="#1a1a2e" />
              <circle cx="10" cy="37" r="2" fill="#1a1a2e" />
            </svg>
          </div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return <Desktop />
}
