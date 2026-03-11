import { useState, useRef, useCallback } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const REVEAL_MS = 5000

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  wrapperClassName?: string
}

/**
 * A password input with a reveal button.
 * Clicking the eye icon shows the password for 5 seconds, then auto-hides it.
 * Clicking again while visible resets the 5-second timer.
 */
export function PasswordInput({ wrapperClassName, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleReveal = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(true)
    timerRef.current = setTimeout(() => setVisible(false), REVEAL_MS)
  }, [])

  return (
    <div className={`shr-pw-wrapper${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="shr-pw-reveal"
        onClick={handleReveal}
        tabIndex={-1}
        title={visible ? 'Hiding in a moment…' : 'Show password for 5 seconds'}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}
