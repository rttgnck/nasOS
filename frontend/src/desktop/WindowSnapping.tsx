import { useState, useCallback } from 'react'

export type SnapZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'maximize' | null

const EDGE_THRESHOLD = 8 // px from screen edge to trigger snap
const TASKBAR_HEIGHT = 48

export interface SnapPreview {
  zone: SnapZone
  x: number
  y: number
  width: number
  height: number
}

export function getSnapZone(mouseX: number, mouseY: number): SnapZone {
  const screenW = window.innerWidth
  const screenH = window.innerHeight - TASKBAR_HEIGHT
  const atLeft = mouseX <= EDGE_THRESHOLD
  const atRight = mouseX >= screenW - EDGE_THRESHOLD
  const atTop = mouseY <= EDGE_THRESHOLD
  const atBottom = mouseY >= screenH - EDGE_THRESHOLD && mouseY < screenH

  // Corners first (more specific)
  if (atLeft && atTop) return 'top-left'
  if (atRight && atTop) return 'top-right'
  if (atLeft && atBottom) return 'bottom-left'
  if (atRight && atBottom) return 'bottom-right'

  // Edges
  if (atTop) return 'maximize'
  if (atLeft) return 'left'
  if (atRight) return 'right'

  return null
}

export function getSnapGeometry(zone: SnapZone): { x: number; y: number; width: number; height: number } | null {
  const screenW = window.innerWidth
  const screenH = window.innerHeight - TASKBAR_HEIGHT
  const halfW = Math.floor(screenW / 2)
  const halfH = Math.floor(screenH / 2)

  switch (zone) {
    case 'left':
      return { x: 0, y: 0, width: halfW, height: screenH }
    case 'right':
      return { x: halfW, y: 0, width: screenW - halfW, height: screenH }
    case 'top-left':
      return { x: 0, y: 0, width: halfW, height: halfH }
    case 'top-right':
      return { x: halfW, y: 0, width: screenW - halfW, height: halfH }
    case 'bottom-left':
      return { x: 0, y: halfH, width: halfW, height: screenH - halfH }
    case 'bottom-right':
      return { x: halfW, y: halfH, width: screenW - halfW, height: screenH - halfH }
    case 'maximize':
      return { x: 0, y: 0, width: screenW, height: screenH }
    default:
      return null
  }
}

interface SnapOverlayProps {
  zone: SnapZone
}

export function SnapOverlay({ zone }: SnapOverlayProps) {
  if (!zone) return null

  const geo = getSnapGeometry(zone)
  if (!geo) return null

  return (
    <div className="snap-overlay" style={{
      left: geo.x,
      top: geo.y,
      width: geo.width,
      height: geo.height,
    }} />
  )
}

export function useSnapZone() {
  const [activeZone, setActiveZone] = useState<SnapZone>(null)

  const updateSnapZone = useCallback((mouseX: number, mouseY: number) => {
    setActiveZone(getSnapZone(mouseX, mouseY))
  }, [])

  const clearSnapZone = useCallback(() => {
    setActiveZone(null)
  }, [])

  return { activeZone, updateSnapZone, clearSnapZone }
}
