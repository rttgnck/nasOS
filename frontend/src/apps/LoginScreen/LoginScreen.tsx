import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../../store/authStore'

export function LoginScreen() {
  const login = useAuthStore((s) => s.login)
  const error = useAuthStore((s) => s.error)
  const isLoading = useAuthStore((s) => s.isLoading)
  const clearError = useAuthStore((s) => s.clearError)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    await login(username, password)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <img src="/nasos-logo.svg" alt="nasOS" style={{ width: 64, height: 64, borderRadius: 8 }} />
          </div>
          <h1 className="login-title">nasOS</h1>
          <p className="login-subtitle">Network Attached Storage</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error" onClick={clearError}>
              {error}
            </div>
          )}

          <div className="login-field">
            <label htmlFor="login-user">Username</label>
            <input
              id="login-user"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-pass">Password</label>
            <input
              id="login-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="login-btn"
            disabled={isLoading || !username || !password}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <span>v031426-0045</span>
          <span className="login-footer-hint">Default login: <strong>admin</strong> / <strong>nasos</strong></span>
        </div>
      </div>
    </div>
  )
}
