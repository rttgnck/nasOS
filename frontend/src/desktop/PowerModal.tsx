import { useEffect, useRef, useState } from 'react'
import { PowerOff, RotateCcw } from 'lucide-react'
import { api } from '../hooks/useApi'

type PowerMode = 'restart' | 'shutdown'
type Phase = 'confirm' | 'waiting' | 'offline'

interface Props {
  mode: PowerMode | null
  onClose: () => void
}

export function PowerModal({ mode, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset to confirm phase whenever mode changes
  useEffect(() => {
    if (mode) setPhase('confirm')
  }, [mode])

  // When in 'waiting' phase, poll /api/system/health until it responds
  useEffect(() => {
    if (phase !== 'waiting') return

    let cancelled = false

    // Give the system a head-start before polling begins
    const startDelay = setTimeout(() => {
      const poll = async () => {
        if (cancelled) return
        try {
          await fetch('/api/system/health', { signal: AbortSignal.timeout(3000) })
          if (!cancelled) onClose()
        } catch {
          if (!cancelled) pollRef.current = setTimeout(poll, 2500)
        }
      }
      poll()
    }, 8000)

    return () => {
      cancelled = true
      clearTimeout(startDelay)
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [phase, onClose])

  if (!mode) return null

  const handleConfirm = async () => {
    try {
      await api(`/api/system/${mode}`, { method: 'POST' })
    } catch {
      // Expected — the server may close the connection immediately
    }
    setPhase(mode === 'restart' ? 'waiting' : 'offline')
  }

  const handleCancel = () => {
    onClose()
  }

  // ── Shutdown: full-screen offline message ──────────────────────────────────
  if (phase === 'offline') {
    return (
      <div className="power-offline-screen">
        <div className="power-offline-content">
          <PowerOff size={56} strokeWidth={1.25} className="power-offline-icon" />
          <h1>System Offline</h1>
          <p>nasOS has been shut down. You can now safely power off the device.</p>
        </div>
      </div>
    )
  }

  // ── Shared centred modal (confirm + waiting) ───────────────────────────────
  const isRestart = mode === 'restart'
  const isWaiting = phase === 'waiting'

  return (
    <div className="power-modal-overlay">
      <div className="power-modal">
        <div className="power-modal-icon-wrap" data-mode={mode}>
          {isRestart
            ? <RotateCcw size={32} strokeWidth={1.5} />
            : <PowerOff size={32} strokeWidth={1.5} />}
        </div>

        {isWaiting ? (
          <>
            <h2 className="power-modal-title">Restarting…</h2>
            <p className="power-modal-body">
              The system is restarting. This page will reconnect automatically when nasOS is back online.
            </p>
            <div className="power-modal-spinner">
              <span className="power-spinner" />
              <span className="power-spinner-label">Waiting for system…</span>
            </div>
          </>
        ) : (
          <>
            <h2 className="power-modal-title">
              {isRestart ? 'Restart nasOS?' : 'Shut Down nasOS?'}
            </h2>
            <p className="power-modal-body">
              {isRestart
                ? 'The system will restart and become temporarily unavailable. All active sessions will be disconnected.'
                : 'The system will shut down completely. You will need physical access to power it back on.'}
            </p>
            <div className="power-modal-actions">
              <button className="power-modal-btn power-modal-btn--cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className={`power-modal-btn power-modal-btn--confirm${isRestart ? '' : ' power-modal-btn--danger'}`}
                onClick={handleConfirm}
              >
                {isRestart ? 'Restart' : 'Shut Down'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
