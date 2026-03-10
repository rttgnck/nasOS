import { useEffect, useRef } from 'react'
import type { FileEntry } from './FileManager'

interface FileContextMenuProps {
  x: number
  y: number
  entry: FileEntry | null
  hasSelection: boolean
  hasClipboard: boolean
  onClose: () => void
  onOpen: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onDelete: () => void
  onRename: () => void
  onNewFolder: () => void
  onDownload: () => void
}

export function FileContextMenu({
  x,
  y,
  entry,
  hasSelection,
  hasClipboard,
  onClose,
  onOpen,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onRename,
  onNewFolder,
  onDownload,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  // Clamp position to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 9999999,
  }

  const item = (label: string, action: () => void, disabled = false, shortcut?: string) => (
    <button
      className="context-menu-item"
      disabled={disabled}
      onClick={() => { action(); onClose() }}
    >
      <span>{label}</span>
      {shortcut && <span className="fm-ctx-shortcut">{shortcut}</span>}
    </button>
  )

  const separator = <div className="context-menu-separator" />

  return (
    <div ref={menuRef} className="context-menu fm-context-menu" style={style}>
      {entry ? (
        <>
          {entry.is_dir
            ? item('Open', onOpen)
            : item('Open', onOpen, true)
          }
          {!entry.is_dir && item('Download', onDownload)}
          {separator}
          {item('Copy', onCopy, !hasSelection, '⌘C')}
          {item('Cut', onCut, !hasSelection, '⌘X')}
          {item('Paste', onPaste, !hasClipboard, '⌘V')}
          {separator}
          {item('Rename', onRename, false, 'F2')}
          {item('Delete', onDelete, !hasSelection, '⌫')}
        </>
      ) : (
        <>
          {item('New Folder', onNewFolder)}
          {separator}
          {item('Paste', onPaste, !hasClipboard, '⌘V')}
          {separator}
          {item('Refresh', () => window.location.reload())}
        </>
      )}
    </div>
  )
}
