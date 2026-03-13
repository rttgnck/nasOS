import { useState, useEffect, type FormEvent } from 'react'
import { Eye, EyeOff, ShieldAlert, X } from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useAuthStore } from '../../store/authStore'

const DISMISS_KEY = 'nasos_pw_dismiss_count'
const MAX_DISMISSALS = 5

/**
 * Password change modal — shown as an overlay on the Desktop when the user
 * is still using the default password.  Can be dismissed up to 5 times
 * (resets on each login session). After changing the password, it also
 * updates the Samba/share password automatically via the backend.
 */
export function ChangePasswordModal() {
  const user = useAuthStore((s) => s.user)
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword)
  const clearMustChangePassword = useAuthStore((s) => s.clearMustChangePassword)
  const checkAuth = useAuthStore((s) => s.checkAuth)

  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const username = user?.username ?? 'admin'

  // Read dismiss count on mount
  const dismissCount = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10)
  const canDismiss = dismissCount < MAX_DISMISSALS

  // Reset dismiss counter when mustChangePassword is cleared (password was changed)
  useEffect(() => {
    if (!mustChangePassword) {
      localStorage.removeItem(DISMISS_KEY)
    }
  }, [mustChangePassword])

  // Don't show if: password already changed, already dismissed this session,
  // or max dismissals reached (stop nagging).
  if (!mustChangePassword || dismissed || dismissCount >= MAX_DISMISSALS) {
    return null
  }

  const handleDismiss = () => {
    const newCount = dismissCount + 1
    localStorage.setItem(DISMISS_KEY, String(newCount))
    setDismissed(true)
  }

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
      setTimeout(async () => {
        await checkAuth()
        clearMustChangePassword()
      }, 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  const remainingDismissals = MAX_DISMISSALS - dismissCount

  return (
    <div className="fcp-overlay" onClick={canDismiss && !done ? handleDismiss : undefined}>
      <div className="login-card fcp-card fcp-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        {canDismiss && !done && (
          <button className="fcp-close" onClick={handleDismiss} title="Remind me later" type="button">
            <X size={16} />
          </button>
        )}

        <div className="fcp-banner">
          <ShieldAlert size={18} className="fcp-banner-icon" />
          <div>
            <div className="fcp-banner-title">Change Default Password</div>
            <div className="fcp-banner-body">
              You are logged in as <strong>{username}</strong> using the default password.
              Please set a personal password to secure your account and network shares.
            </div>
          </div>
        </div>

        {done ? (
          <div className="fcp-success">
            <span className="fcp-success-icon">&#x2713;</span>
            Password updated for login and network shares.
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
              <div className="shr-pw-wrapper">
                <input
                  id="fcp-new"
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  autoFocus
                  disabled={saving}
                />
                <button
                  type="button"
                  className="shr-pw-reveal"
                  onClick={() => setShowPw((v) => !v)}
                  tabIndex={-1}
                  title={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="fcp-confirm">Confirm Password</label>
              <div className="shr-pw-wrapper">
                <input
                  id="fcp-confirm"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  disabled={saving}
                />
              </div>
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={saving || !newPw || !confirm}
            >
              {saving ? 'Saving...' : 'Set Password'}
            </button>

            {canDismiss && (
              <div className="fcp-dismiss-hint">
                <button className="fcp-logout-link" onClick={handleDismiss} type="button">
                  Remind me later
                </button>
                <span className="fcp-dismiss-count">({remainingDismissals} remaining)</span>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
