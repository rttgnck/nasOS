import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type LucideIcon,
  Folder, File, FileText, FileImage, FileVideo, Music,
  Archive, Code, Terminal, Disc,
  Menu, ArrowUp, RotateCcw, X, PanelRight,
  LayoutGrid, List, AlignJustify, Image,
  ChevronDown, Play,
} from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useAuthStore } from '../../store/authStore'
import { useFileStore, type ClipboardItem } from '../../store/fileStore'
import { useWindowStore } from '../../store/windowStore'
import { FileTree } from './FileTree'
import { FilePreview } from './FilePreview'
import { FileContextMenu } from './FileContextMenu'

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number | null
  modified: number | null
  permissions?: string
}

interface FileListResponse {
  path: string
  parent: string | null
  entries: FileEntry[]
}

export type ViewMode = 'icons' | 'list' | 'details' | 'gallery'

const VIEW_MODE_CONFIG: { mode: ViewMode; icon: LucideIcon; label: string }[] = [
  { mode: 'icons', icon: LayoutGrid, label: 'Icons' },
  { mode: 'list', icon: List, label: 'List' },
  { mode: 'details', icon: AlignJustify, label: 'Details' },
  { mode: 'gallery', icon: Image, label: 'Gallery' },
]

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'])
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus'])
const CODE_EXTS = new Set([
  'py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'toml', 'cfg',
  'conf', 'ini', 'sh', 'bash', 'css', 'html', 'xml', 'csv', 'sql',
  'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'rb', 'php', 'md', 'txt',
  'log', 'env', 'gitignore', 'dockerfile',
])

interface FileManagerProps {
  windowId?: string
}

export function FileManager({ windowId }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showViewDropdown, setShowViewDropdown] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showSidebar, setShowSidebar] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const lastSelectedIndex = useRef<number>(-1)
  const viewDropdownRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; entry: FileEntry | null
  } | null>(null)

  const [renamingItem, setRenamingItem] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Cross-window drop dialog
  const [dropDialog, setDropDialog] = useState<{
    items: FileEntry[]
    destination: string
  } | null>(null)

  const { clipboard, clipboardOp, setClipboard, clearClipboard } = useFileStore()
  const updateWindowTitle = useWindowStore((s) => s.updateWindow)

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    setSelectedItems(new Set())
    setSearchResults(null)
    setSearchQuery('')
    lastSelectedIndex.current = -1
    try {
      const data = await api<FileListResponse>(`/api/files/list?path=${encodeURIComponent(path)}`)
      setEntries(data.entries)
      setParentPath(data.parent)
      setCurrentPath(path)
      if (windowId) {
        const folder = path ? path.split('/').pop() : 'Home'
        updateWindowTitle(windowId, { title: `File Manager — ${folder}` })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }, [windowId, updateWindowTitle])

  useEffect(() => {
    loadDirectory('')
  }, [loadDirectory])

  // Close view dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
        setShowViewDropdown(false)
      }
    }
    if (showViewDropdown) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [showViewDropdown])

  const handleOpen = (entry: FileEntry) => {
    if (entry.is_dir) {
      loadDirectory(entry.path)
      return
    }
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
    if (CODE_EXTS.has(ext)) {
      const { openWindow } = useWindowStore.getState()
      openWindow('text-editor', entry.name, {
        width: 900,
        height: 650,
        appMeta: { filePath: entry.path, fileName: entry.name },
      } as any)
      return
    }
    if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext) || ext === 'pdf') {
      const { openWindow } = useWindowStore.getState()
      openWindow('media-viewer', entry.name, {
        width: 800,
        height: 600,
        appMeta: { filePath: entry.path, fileName: entry.name, fileType: ext },
      } as any)
      return
    }
    // Fallback: download
    window.open(`/api/files/download?path=${encodeURIComponent(entry.path)}`)
  }

  const handleSelect = (name: string, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex.current >= 0) {
      const displayEntries = searchResults ?? entries
      const start = Math.min(lastSelectedIndex.current, index)
      const end = Math.max(lastSelectedIndex.current, index)
      const rangeNames = new Set(
        displayEntries.slice(start, end + 1).map((e) => e.name)
      )
      setSelectedItems((prev) => new Set([...prev, ...rangeNames]))
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedItems((prev) => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      })
    } else {
      setSelectedItems(new Set([name]))
    }
    lastSelectedIndex.current = index
  }

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault()
    e.stopPropagation()
    if (entry && !selectedItems.has(entry.name)) {
      setSelectedItems(new Set([entry.name]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const handleCopy = () => {
    const items = getSelectedEntries()
    if (items.length > 0) setClipboard(items as ClipboardItem[], 'copy', windowId)
  }

  const handleCut = () => {
    const items = getSelectedEntries()
    if (items.length > 0) setClipboard(items as ClipboardItem[], 'cut', windowId)
  }

  const handlePaste = async () => {
    if (!clipboard.length || !clipboardOp) return
    const dest = currentPath || '.'
    try {
      const endpoint = clipboardOp === 'copy' ? '/api/file-ops/copy' : '/api/file-ops/move'
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          sources: clipboard.map((c) => c.path),
          destination: dest,
          conflict_policy: 'ask',
        }),
      })
      if (clipboardOp === 'cut') clearClipboard()
      setTimeout(() => loadDirectory(currentPath), 500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Paste failed')
    }
  }

  const handleDelete = async () => {
    const items = getSelectedEntries()
    if (items.length === 0) return
    try {
      await api('/api/files/delete', {
        method: 'POST',
        body: JSON.stringify({ paths: items.map((i) => i.path) }),
      })
      loadDirectory(currentPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleNewFolder = async () => {
    const name = 'New Folder'
    try {
      await api('/api/files/mkdir', {
        method: 'POST',
        body: JSON.stringify({ path: currentPath || '.', name }),
      })
      loadDirectory(currentPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create folder')
    }
  }

  const handleRenameStart = (entry: FileEntry) => {
    setRenamingItem(entry.name)
    setRenameValue(entry.name)
  }

  const handleRenameSubmit = async () => {
    if (!renamingItem || !renameValue || renameValue === renamingItem) {
      setRenamingItem(null)
      return
    }
    const entry = entries.find((e) => e.name === renamingItem)
    if (!entry) return
    try {
      await api('/api/files/rename', {
        method: 'POST',
        body: JSON.stringify({ path: entry.path, new_name: renameValue }),
      })
      setRenamingItem(null)
      loadDirectory(currentPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setSearchLoading(true)
    try {
      const data = await api<{ results: FileEntry[] }>(
        `/api/files/search?path=${encodeURIComponent(currentPath)}&query=${encodeURIComponent(searchQuery)}`
      )
      setSearchResults(data.results)
    } catch { setSearchResults([]) }
    finally { setSearchLoading(false) }
  }

  const handleUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        const token = useAuthStore.getState().token
        await fetch(`/api/files/upload?path=${encodeURIComponent(currentPath || '.')}`, {
          method: 'POST',
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
      } catch { /* ignore individual failures */ }
    }
    loadDirectory(currentPath)
  }

  const handleDrop = async (e: React.DragEvent, targetPath?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)

    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files)
      return
    }

    const nasosData = e.dataTransfer.getData('application/nasos-files')
    if (nasosData) {
      try {
        const items: FileEntry[] = JSON.parse(nasosData)
        const dest = targetPath ?? (currentPath || '.')
        const sourceWindowId = e.dataTransfer.getData('application/nasos-window-id')
        if (sourceWindowId && sourceWindowId !== windowId) {
          // Cross-window drop: show copy/move dialog
          setDropDialog({ items, destination: dest })
        } else {
          // Same-window: shift = copy, otherwise move
          const holdingShift = e.shiftKey
          const endpoint = holdingShift ? '/api/file-ops/copy' : '/api/file-ops/move'
          await api(endpoint, {
            method: 'POST',
            body: JSON.stringify({
              sources: items.map((i) => i.path),
              destination: dest,
              conflict_policy: 'ask',
            }),
          })
          setTimeout(() => loadDirectory(currentPath), 500)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Drop failed')
      }
    }
  }

  const handleDropDialogAction = async (action: 'copy' | 'move') => {
    if (!dropDialog) return
    try {
      const endpoint = action === 'copy' ? '/api/file-ops/copy' : '/api/file-ops/move'
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          sources: dropDialog.items.map((i) => i.path),
          destination: dropDialog.destination,
          conflict_policy: 'ask',
        }),
      })
      setTimeout(() => loadDirectory(currentPath), 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    }
    setDropDialog(null)
  }

  const getSelectedEntries = (): FileEntry[] => {
    const display = searchResults ?? entries
    return display.filter((e) => selectedItems.has(e.name))
  }

  const getFileExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

  // Keyboard shortcuts scoped to this file manager instance
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItems.size > 0) handleDelete()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') handleCopy()
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') handleCut()
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') handlePaste()
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        const display = searchResults ?? entries
        setSelectedItems(new Set(display.map((e) => e.name)))
      }
      if (e.key === 'F2' && selectedItems.size === 1) {
        const entry = entries.find((e) => selectedItems.has(e.name))
        if (entry) handleRenameStart(entry)
      }
      if (e.key === 'Enter' && selectedItems.size === 1) {
        const entry = entries.find((e) => selectedItems.has(e.name))
        if (entry) handleOpen(entry)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const displayEntries = searchResults ?? entries
  const breadcrumbs = ['Home', ...currentPath.split('/').filter(Boolean)]
  const previewEntry = selectedItems.size === 1
    ? entries.find((e) => selectedItems.has(e.name) && !e.is_dir) ?? null
    : null

  const currentViewConfig = VIEW_MODE_CONFIG.find((v) => v.mode === viewMode)!

  return (
    <div
      ref={containerRef}
      className="file-manager"
      tabIndex={-1}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onContextMenu={(e) => handleContextMenu(e, null)}
    >
      {/* Toolbar */}
      <div className="fm-toolbar">
        <button className="fm-btn" onClick={() => setShowSidebar(!showSidebar)} title="Toggle sidebar">
          <Menu size={16} />
        </button>
        <button className="fm-btn" disabled={!parentPath}
          onClick={() => parentPath && loadDirectory(parentPath === '.' ? '' : parentPath)}>
          <ArrowUp size={16} />
        </button>
        <button className="fm-btn" onClick={() => loadDirectory(currentPath)}><RotateCcw size={16} /></button>
        <div className="fm-breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              {i > 0 && <span className="fm-breadcrumb-sep">/</span>}
              <button className="fm-breadcrumb"
                onClick={() => {
                  const path = breadcrumbs.slice(1, i + 1).join('/')
                  loadDirectory(i === 0 ? '' : path)
                }}>
                {crumb}
              </button>
            </span>
          ))}
        </div>
        <div className="fm-toolbar-spacer" />
        <div className="fm-search">
          <input className="fm-search-input" placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
          {searchResults && (
            <button className="fm-search-clear" onClick={() => { setSearchResults(null); setSearchQuery('') }}>
              <X size={14} />
            </button>
          )}
        </div>
        <button className="fm-btn" onClick={() => setShowPreview(!showPreview)}
          title="Toggle preview" data-active={showPreview}>
          <PanelRight size={16} />
        </button>

        {/* View mode dropdown */}
        <div className="fm-view-dropdown-wrap" ref={viewDropdownRef}>
          <button className="fm-btn fm-view-btn" onClick={() => setShowViewDropdown(!showViewDropdown)}>
            <currentViewConfig.icon size={16} />
            <ChevronDown size={10} />
          </button>
          {showViewDropdown && (
            <div className="fm-view-dropdown">
              {VIEW_MODE_CONFIG.map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  className="fm-view-dropdown-item"
                  data-active={viewMode === mode}
                  onClick={() => { setViewMode(mode); setShowViewDropdown(false) }}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="fm-body">
        {showSidebar && (
          <div className="fm-sidebar">
            <FileTree currentPath={currentPath} onNavigate={loadDirectory} />
          </div>
        )}

        {/* File entries */}
        <div className="fm-content" onContextMenu={(e) => handleContextMenu(e, null)}>
          {loading && <div className="fm-loading">Loading...</div>}
          {error && <div className="fm-error">{error}</div>}
          {searchLoading && <div className="fm-loading">Searching...</div>}
          {searchResults && !searchLoading && (
            <div className="fm-search-info">
              {searchResults.length} results for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
          {!loading && !error && !searchLoading && (
            <div className={`fm-entries fm-entries-${viewMode}`}>
              {/* Column headers for list & details */}
              {(viewMode === 'list' || viewMode === 'details') && (
                <div className={`fm-list-header ${viewMode === 'details' ? 'fm-list-header-details' : ''}`}>
                  <span className="fm-col-name">Name</span>
                  <span className="fm-col-size">Size</span>
                  <span className="fm-col-modified">Modified</span>
                  {viewMode === 'details' && (
                    <>
                      <span className="fm-col-type">Type</span>
                      <span className="fm-col-perms">Permissions</span>
                    </>
                  )}
                </div>
              )}
              {displayEntries.map((entry, index) => {
                const ext = getFileExt(entry.name)
                const isImage = IMAGE_EXTS.has(ext)
                const isVideo = VIDEO_EXTS.has(ext)

                return (
                  <div
                    key={entry.path}
                    className={`fm-entry fm-entry-${viewMode}`}
                    data-selected={selectedItems.has(entry.name)}
                    data-type={entry.is_dir ? 'dir' : 'file'}
                    data-cut={clipboardOp === 'cut' && clipboard.some((c) => c.path === entry.path)}
                    data-drop-target={dropTarget === entry.path}
                    onClick={(e) => handleSelect(entry.name, index, e)}
                    onDoubleClick={() => handleOpen(entry)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                    draggable
                    onDragStart={(e) => {
                      const items = selectedItems.has(entry.name) ? getSelectedEntries() : [entry]
                      e.dataTransfer.setData('application/nasos-files', JSON.stringify(items))
                      e.dataTransfer.setData('application/nasos-window-id', windowId ?? '')
                      e.dataTransfer.effectAllowed = 'copyMove'
                    }}
                    onDragOver={(e) => {
                      if (entry.is_dir) { e.preventDefault(); e.stopPropagation(); setDropTarget(entry.path) }
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => { if (entry.is_dir) handleDrop(e, entry.path) }}
                  >
                    {renamingItem === entry.name ? (
                      <input className="fm-rename-input" value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit()
                          if (e.key === 'Escape') setRenamingItem(null)
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <>
                        {/* Gallery: thumbnail */}
                        {viewMode === 'gallery' && (isImage || isVideo) ? (
                          <div className="fm-gallery-thumb">
                            {isImage ? (
                              <img src={`/api/files/thumbnail?path=${encodeURIComponent(entry.path)}`}
                                alt={entry.name} loading="lazy" />
                            ) : (
                              <div className="fm-gallery-video-thumb">
                                <FileVideo size={32} />
                                <Play size={16} className="fm-gallery-play" />
                              </div>
                            )}
                          </div>
                        ) : viewMode === 'gallery' ? (
                          <div className="fm-gallery-thumb fm-gallery-thumb-icon">
                            {entry.is_dir ? <Folder size={40} /> : getFileIcon(entry.name, 32)}
                          </div>
                        ) : null}

                        {/* Icons view: large icon */}
                        {viewMode === 'icons' && (
                          <span className="fm-entry-icon fm-icon-large">
                            {entry.is_dir ? <Folder size={40} /> : getFileIcon(entry.name, 32)}
                          </span>
                        )}

                        {/* List/Details: inline icon + name */}
                        {(viewMode === 'list' || viewMode === 'details') && (
                          <span className="fm-col-name">
                            <span className="fm-entry-icon">
                              {entry.is_dir ? <Folder size={16} /> : getFileIcon(entry.name)}
                            </span>
                            <span className="fm-entry-name">{entry.name}</span>
                          </span>
                        )}

                        {/* Name for icons/gallery */}
                        {(viewMode === 'icons' || viewMode === 'gallery') && (
                          <span className="fm-entry-name">{entry.name}</span>
                        )}

                        {/* Size + Modified for list/details */}
                        {(viewMode === 'list' || viewMode === 'details') && (
                          <>
                            <span className="fm-col-size">
                              {entry.is_dir ? '--' : formatSize(entry.size)}
                            </span>
                            <span className="fm-col-modified">
                              {entry.modified ? new Date(entry.modified * 1000).toLocaleString() : '--'}
                            </span>
                          </>
                        )}

                        {/* Extra columns for details */}
                        {viewMode === 'details' && (
                          <>
                            <span className="fm-col-type">
                              {entry.is_dir ? 'Folder' : getFileTypeName(entry.name)}
                            </span>
                            <span className="fm-col-perms">{entry.permissions ?? '---'}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              {displayEntries.length === 0 && (
                <div className="fm-empty">
                  {searchResults ? 'No results found' : 'This folder is empty'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview Pane */}
        {showPreview && (
          <div className="fm-preview">
            <FilePreview
              entry={previewEntry}
              onOpenEditor={(path, name) => {
                const { openWindow } = useWindowStore.getState()
                openWindow('text-editor', name, {
                  width: 900, height: 650,
                  appMeta: { filePath: path, fileName: name },
                } as any)
              }}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="fm-statusbar">
        <span>
          {displayEntries.length} items
          {selectedItems.size > 0 && ` · ${selectedItems.size} selected`}
        </span>
        {clipboard.length > 0 && (
          <span className="fm-clipboard-info">
            {clipboard.length} item(s) in clipboard ({clipboardOp})
          </span>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          hasSelection={selectedItems.size > 0}
          hasClipboard={clipboard.length > 0}
          onClose={() => setContextMenu(null)}
          onOpen={() => contextMenu.entry && handleOpen(contextMenu.entry)}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onRename={() => contextMenu.entry && handleRenameStart(contextMenu.entry)}
          onNewFolder={handleNewFolder}
          onDownload={() => {
            if (contextMenu.entry && !contextMenu.entry.is_dir) {
              window.open(`/api/files/download?path=${encodeURIComponent(contextMenu.entry.path)}`)
            }
          }}
          onEdit={() => {
            if (contextMenu.entry && !contextMenu.entry.is_dir) {
              const ext = getFileExt(contextMenu.entry.name)
              if (CODE_EXTS.has(ext)) {
                const { openWindow } = useWindowStore.getState()
                openWindow('text-editor', contextMenu.entry.name, {
                  width: 900, height: 650,
                  appMeta: { filePath: contextMenu.entry.path, fileName: contextMenu.entry.name },
                } as any)
              }
            }
          }}
          isEditable={
            contextMenu.entry
              ? CODE_EXTS.has(getFileExt(contextMenu.entry.name))
              : false
          }
        />
      )}

      {/* Cross-window drop dialog */}
      {dropDialog && (
        <div className="fm-drop-dialog-overlay" onClick={() => setDropDialog(null)}>
          <div className="fm-drop-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="fm-drop-dialog-title">
              {dropDialog.items.length} item(s) dropped here
            </div>
            <div className="fm-drop-dialog-text">
              What would you like to do?
            </div>
            <div className="fm-drop-dialog-actions">
              <button className="fm-drop-dialog-btn fm-drop-dialog-copy"
                onClick={() => handleDropDialogAction('copy')}>
                Copy Here
              </button>
              <button className="fm-drop-dialog-btn fm-drop-dialog-move"
                onClick={() => handleDropDialogAction('move')}>
                Move Here
              </button>
              <button className="fm-drop-dialog-btn fm-drop-dialog-cancel"
                onClick={() => setDropDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getFileIcon(name: string, size = 16): JSX.Element {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const iconMap: Record<string, LucideIcon> = {
    pdf: FileText, doc: FileText, docx: FileText, txt: FileText, md: FileText,
    jpg: FileImage, jpeg: FileImage, png: FileImage, gif: FileImage, webp: FileImage, svg: FileImage,
    mp4: FileVideo, mkv: FileVideo, avi: FileVideo, mov: FileVideo, webm: FileVideo,
    mp3: Music, flac: Music, wav: Music, ogg: Music, m4a: Music, aac: Music,
    zip: Archive, tar: Archive, gz: Archive, rar: Archive, '7z': Archive,
    py: Code, js: Code, ts: Code, jsx: Code, tsx: Code,
    json: Code, yaml: Code, yml: Code, toml: Code,
    sh: Terminal, bash: Terminal,
    iso: Disc, img: Disc,
  }
  const Icon = iconMap[ext] ?? File
  return <Icon size={size} />
}

function getFileTypeName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const typeMap: Record<string, string> = {
    pdf: 'PDF', doc: 'Word', docx: 'Word', txt: 'Text', md: 'Markdown',
    jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', gif: 'GIF', webp: 'WebP', svg: 'SVG',
    mp4: 'Video', mkv: 'Video', avi: 'Video', mov: 'Video', webm: 'Video',
    mp3: 'Audio', flac: 'Audio', wav: 'Audio', ogg: 'Audio',
    zip: 'Archive', tar: 'Archive', gz: 'Archive', rar: 'Archive',
    py: 'Python', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX',
    json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
    sh: 'Shell', bash: 'Shell', css: 'CSS', html: 'HTML',
  }
  return typeMap[ext] ?? (ext ? ext.toUpperCase() : 'File')
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
