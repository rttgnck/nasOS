import { useState, type FormEvent } from 'react'
import { ShieldAlert } from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useAuthStore } from '../../store/authStore'
import { PasswordInput } from '../../components/PasswordInput'

export function ForceChangePassword() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const clearMustChangePassword = useAuthStore((s) => s.clearMustChangePassword)

  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const username = user?.username ?? 'admin'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!newPw) { setError('New password is required'); return }
    if (newPw.length < 6) { setError('Password must be at least 6 characters'); return }
    if (newPw !== confirm) { setError('Passwords do not match'); return }

    setSaving(true)
    try {
      await api(`/api/users/${username}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPw }),
      })
      setDone(true)
      // Brief pause so the user can read the success message, then unlock the desktop
      setTimeout(() => {
        clearMustChangePassword()
      }, 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card fcp-card">
        {/* Header */}
        <div className="login-logo">
          <div className="login-logo-icon">
            <img src="/nasos-logo.svg" alt="nasOS" style={{ width: 64, height: 64, borderRadius: 8 }} />
          </div>
          <h1 className="login-title">nasOS</h1>
        </div>

        <div className="fcp-banner">
          <ShieldAlert size={18} className="fcp-banner-icon" />
          <div>
            <div className="fcp-banner-title">Security Setup Required</div>
            <div className="fcp-banner-body">
              You are logged in as <strong>{username}</strong> using the default password.
              Please set a personal password to secure your account and network shares.
              This is required before you can access the desktop.
            </div>
          </div>
        </div>

        {done ? (
          <div className="fcp-success">
            <span className="fcp-success-icon">✓</span>
            Password updated — unlocking dashboard…
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="login-error" onClick={() => setError('')}>
                {error}
              </div>
            )}

            <div className="login-field">
              <label htmlFor="fcp-new">New Password</label>
              <PasswordInput
                id="fcp-new"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                autoFocus
                disabled={saving}
              />
            </div>

            <div className="login-field">
              <label htmlFor="fcp-confirm">Confirm Password</label>
              <PasswordInput
                id="fcp-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
                disabled={saving}
              />
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={saving || !newPw || !confirm}
            >
              {saving ? 'Saving…' : 'Set Password & Continue'}
            </button>
          </form>
        )}

        <div className="fcp-footer">
          <button className="fcp-logout-link" onClick={logout} type="button">
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
