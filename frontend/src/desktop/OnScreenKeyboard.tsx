import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const ROWS_LOWER = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
  ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
]

const ROWS_UPPER = [
  ['~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}', '|'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?', 'Shift'],
  ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
]

const WIDE_KEYS: Record<string, number> = {
  Backspace: 2, Tab: 1.5, Caps: 1.8, Enter: 2.2,
  Shift: 2.5, Ctrl: 1.3, Alt: 1.3, Space: 6,
  '\\': 1.5, '|': 1.5,
}

export function OnScreenKeyboard() {
  const [visible, setVisible] = useState(false)
  const [shifted, setShifted] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [pressed, setPressed] = useState<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const kbRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handler = () => setVisible((v) => !v)
    window.addEventListener('nasos:toggle-osk', handler)
    return () => window.removeEventListener('nasos:toggle-osk', handler)
  }, [])

  // Track the last focused element that isn't part of the OSK itself,
  // so we always have a valid target even if activeElement is the body.
  useEffect(() => {
    if (!visible) return
    const handler = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      if (target && !kbRef.current?.contains(target)) {
        lastFocusedRef.current = target
      }
    }
    document.addEventListener('focusin', handler)
    return () => document.removeEventListener('focusin', handler)
  }, [visible])

  const isUpper = shifted || capsLock
  const rows = isUpper ? ROWS_UPPER : ROWS_LOWER

  const getTarget = useCallback((): HTMLElement | null => {
    const active = document.activeElement as HTMLElement | null
    if (active && active !== document.body && !kbRef.current?.contains(active)) {
      return active
    }
    return lastFocusedRef.current
  }, [])

  const handleKey = useCallback((key: string) => {
    setPressed(key)
    setTimeout(() => setPressed(null), 100)

    if (key === 'Shift') {
      setShifted((s) => !s)
      return
    }
    if (key === 'Caps') {
      setCapsLock((c) => !c)
      return
    }
    if (key === 'Ctrl' || key === 'Alt') return

    // Let rich editors (Monaco, etc.) handle input via their own APIs first.
    // If a listener calls preventDefault(), we skip the generic DOM path.
    const oskEvent = new CustomEvent('nasos:osk-input', {
      detail: { key },
      cancelable: true,
    })
    window.dispatchEvent(oskEvent)

    if (!oskEvent.defaultPrevented) {
      const el = getTarget()
      if (key === 'Space') {
        dispatchKey(el, ' ')
      } else if (key === 'Backspace') {
        dispatchKey(el, '', 'Backspace')
      } else if (key === 'Enter') {
        dispatchKey(el, '', 'Enter')
      } else if (key === 'Tab') {
        dispatchKey(el, '', 'Tab')
      } else {
        dispatchKey(el, key)
      }
    }

    if (shifted && !capsLock) setShifted(false)
  }, [shifted, capsLock, getTarget])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!kbRef.current) return
    const rect = kbRef.current.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()

    const handleMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      })
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [])

  if (!visible) return null

  const style: React.CSSProperties = position
    ? { left: position.x, top: position.y, bottom: 'auto' }
    : {}

  return createPortal(
    <div ref={kbRef} className="osk" style={style}>
      <div className="osk-handle" onMouseDown={handleDragStart}>
        <div className="osk-handle-grip" />
        <button className="osk-close" onClick={() => setVisible(false)} title="Close keyboard">✕</button>
      </div>
      <div className="osk-keys">
        {rows.map((row, ri) => (
          <div key={ri} className="osk-row">
            {row.map((key, ki) => {
              const w = WIDE_KEYS[key] ?? 1
              const isActive =
                (key === 'Shift' && shifted) ||
                (key === 'Caps' && capsLock) ||
                pressed === key
              return (
                <button
                  key={ki}
                  className={`osk-key${isActive ? ' osk-key-active' : ''}`}
                  style={{ flex: w }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleKey(key)
                  }}
                >
                  {key === 'Space' ? '' : key}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}

/**
 * Check if an element is a standard input/textarea that we should manipulate
 * directly (for React controlled input compatibility), as opposed to elements
 * managed by rich editors like Monaco.
 */
function isPlainInput(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
  return !el.closest('.monaco-editor')
}

/**
 * Use the native prototype setter to bypass React's internal value tracker,
 * ensuring React detects the change when the subsequent input event fires.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
}

function dispatchKey(el: HTMLElement | null, char: string, code?: string) {
  if (!el) return

  const key = code || char
  const kbOpts: KeyboardEventInit = {
    key,
    code: code || (char === ' ' ? 'Space' : `Key${char.toUpperCase()}`),
    bubbles: true,
    cancelable: true,
  }

  el.dispatchEvent(new KeyboardEvent('keydown', kbOpts))

  if (char) {
    if (isPlainInput(el)) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      setNativeValue(el, el.value.slice(0, start) + char + el.value.slice(end))
      el.selectionStart = el.selectionEnd = start + char.length
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      document.execCommand('insertText', false, char)
    }
  } else if (code === 'Backspace') {
    if (isPlainInput(el)) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      if (start === end && start > 0) {
        setNativeValue(el, el.value.slice(0, start - 1) + el.value.slice(end))
        el.selectionStart = el.selectionEnd = start - 1
      } else if (start !== end) {
        setNativeValue(el, el.value.slice(0, start) + el.value.slice(end))
        el.selectionStart = el.selectionEnd = start
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      document.execCommand('delete', false, undefined)
    }
  } else if (code === 'Enter') {
    if (isPlainInput(el) && el instanceof HTMLInputElement) {
      el.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true }))
    } else if (isPlainInput(el) && el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      setNativeValue(el, el.value.slice(0, start) + '\n' + el.value.slice(end))
      el.selectionStart = el.selectionEnd = start + 1
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      document.execCommand('insertLineBreak', false, undefined)
    }
  }

  el.dispatchEvent(new KeyboardEvent('keyup', kbOpts))
}
