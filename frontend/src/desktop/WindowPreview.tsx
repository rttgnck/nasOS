import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PREVIEW_W = 240
const PREVIEW_H = 160
const HOVER_DELAY = 2000

interface WindowPreviewProps {
  windowId: string
  title: string
  anchorRect: DOMRect | null
  isMinimized?: boolean
}

function WindowPreviewPopup({ windowId, title, anchorRect, isMinimized }: WindowPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || isMinimized) return

    const source = document.querySelector<HTMLElement>(`[data-window-id="${windowId}"]`)
    if (!source) return

    const clone = source.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-window-id')
    clone.style.position = 'absolute'
    clone.style.left = '0'
    clone.style.top = '0'
    clone.style.width = `${source.offsetWidth}px`
    clone.style.height = `${source.offsetHeight}px`
    clone.style.zIndex = '1'
    clone.style.pointerEvents = 'none'
    clone.style.borderRadius = '0'
    clone.style.boxShadow = 'none'
    clone.style.border = 'none'

    const scaleX = PREVIEW_W / source.offsetWidth
    const scaleY = PREVIEW_H / source.offsetHeight
    const scale = Math.min(scaleX, scaleY)
    clone.style.transform = `scale(${scale})`
    clone.style.transformOrigin = 'top left'

    const wrapper = containerRef.current.querySelector('.wp-clone-area')
    if (wrapper) {
      wrapper.innerHTML = ''
      wrapper.appendChild(clone)
    }
  }, [windowId, isMinimized])

  if (!anchorRect) return null

  // Position the popup above/below the anchor, centered horizontally
  const left = Math.min(
    Math.max(4, anchorRect.left + anchorRect.width / 2 - PREVIEW_W / 2),
    window.innerWidth - PREVIEW_W - 4,
  )

  const spaceAbove = anchorRect.top
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const showAbove = spaceAbove > spaceBelow
  const top = showAbove
    ? anchorRect.top - PREVIEW_H - 32
    : anchorRect.bottom + 8

  return createPortal(
    <div
      ref={containerRef}
      className="window-preview"
      style={{ left, top, width: PREVIEW_W, height: PREVIEW_H + 24 }}
    >
      <div
        className="wp-clone-area"
        style={{ width: PREVIEW_W, height: PREVIEW_H }}
      >
        {isMinimized && (
          <div className="wp-minimized">
            <span>Minimized</span>
          </div>
        )}
      </div>
      <div className="wp-title">{title}</div>
    </div>,
    document.body,
  )
}

/**
 * Hook: tracks hover state on an element.
 * Returns [previewState, onMouseEnter, onMouseLeave] to wire to a button.
 */
export function useWindowPreviewHover() {
  const [preview, setPreview] = useState<{
    windowId: string
    title: string
    anchorRect: DOMRect
    isMinimized: boolean
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onEnter = (
    e: React.MouseEvent,
    windowId: string,
    title: string,
    isMinimized: boolean,
  ) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    timerRef.current = setTimeout(() => {
      setPreview({ windowId, title, anchorRect: rect, isMinimized })
    }, HOVER_DELAY)
  }

  const onLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setPreview(null)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { preview, onEnter, onLeave }
}

export { WindowPreviewPopup }
