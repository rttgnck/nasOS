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

  useEffect(() => {
    const handler = () => setVisible((v) => !v)
    window.addEventListener('nasos:toggle-osk', handler)
    return () => window.removeEventListener('nasos:toggle-osk', handler)
  }, [])

  const isUpper = shifted || capsLock
  const rows = isUpper ? ROWS_UPPER : ROWS_LOWER

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

    const el = document.activeElement as HTMLElement | null

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

    if (shifted && !capsLock) setShifted(false)
  }, [shifted, capsLock])

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

function dispatchKey(el: HTMLElement | null, char: string, code?: string) {
  if (!el) return

  const keyCode = code || char
  const opts = { key: keyCode, code: code || `Key${char.toUpperCase()}`, bubbles: true }

  el.dispatchEvent(new KeyboardEvent('keydown', opts))

  if (char && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    el.value = el.value.slice(0, start) + char + el.value.slice(end)
    el.selectionStart = el.selectionEnd = start + char.length
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (code === 'Backspace' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    if (start === end && start > 0) {
      el.value = el.value.slice(0, start - 1) + el.value.slice(end)
      el.selectionStart = el.selectionEnd = start - 1
    } else if (start !== end) {
      el.value = el.value.slice(0, start) + el.value.slice(end)
      el.selectionStart = el.selectionEnd = start
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (code === 'Enter' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    if (el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      el.value = el.value.slice(0, start) + '\n' + el.value.slice(end)
      el.selectionStart = el.selectionEnd = start + 1
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      el.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true }))
    }
  }

  el.dispatchEvent(new KeyboardEvent('keyup', opts))
}
