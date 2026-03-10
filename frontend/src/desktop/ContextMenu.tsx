import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  action?: () => void
  disabled?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position so menu stays on screen
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 48)

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu-separator" />
        ) : (
          <button
            key={i}
            className="context-menu-item"
            disabled={item.disabled}
            onClick={() => {
              item.action?.()
              onClose()
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
