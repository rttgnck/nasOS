import { useCallback, useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    nasOS?: { isElectron?: boolean }
  }
}

interface Ripple {
  id: number
  x: number
  y: number
}

let nextId = 0

export function TouchCursor() {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const activeRef = useRef<Map<number, number>>(new Map())
  const isElectron = !!window.nasOS?.isElectron

  const addRipple = useCallback((x: number, y: number) => {
    const id = nextId++
    setRipples((prev) => [...prev, { id, x, y }])
    return id
  }, [])

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id))
  }, [])

  useEffect(() => {
    if (!isElectron) return

    const onTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i)
        if (!t) continue
        const rid = addRipple(t.clientX, t.clientY)
        activeRef.current.set(t.identifier, rid)
        setTimeout(() => {
          removeRipple(rid)
          activeRef.current.delete(t.identifier)
        }, 5000)
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i)
        if (!t) continue
        const rid = activeRef.current.get(t.identifier)
        if (rid !== undefined) {
          setRipples((prev) =>
            prev.map((r) => (r.id === rid ? { ...r, x: t.clientX, y: t.clientY } : r)),
          )
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i)
        if (!t) continue
        const rid = activeRef.current.get(t.identifier)
        if (rid !== undefined) {
          activeRef.current.delete(t.identifier)
          const el = document.getElementById(`touch-ripple-${rid}`)
          if (el) el.classList.add('touch-ripple-fade')
          setTimeout(() => removeRipple(rid), 1200)
        }
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [isElectron, addRipple, removeRipple])

  if (!isElectron) return null

  return (
    <>
      <style>{`
        .touch-cursor-host { cursor: none !important; }
        .touch-cursor-host * { cursor: none !important; }

        .touch-ripple {
          position: fixed;
          pointer-events: none;
          z-index: 2147483647;
          width: 36px;
          height: 36px;
          margin-left: -18px;
          margin-top: -18px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(120,160,255,0.45) 0%, rgba(120,160,255,0.12) 50%, transparent 70%);
          box-shadow: 0 0 12px 4px rgba(120,160,255,0.3);
          opacity: 1;
          transition: opacity 1s ease-out;
          will-change: transform, opacity;
        }
        .touch-ripple-fade {
          opacity: 0;
        }
      `}</style>
      {ripples.map((r) => (
        <div
          key={r.id}
          id={`touch-ripple-${r.id}`}
          className="touch-ripple"
          style={{ left: r.x, top: r.y }}
        />
      ))}
    </>
  )
}
