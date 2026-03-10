import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../hooks/useApi'
import { useFileStore } from '../../store/fileStore'
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

export function FileManager() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showSidebar, setShowSidebar] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const lastSelectedIndex = useRef<number>(-1)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; entry: FileEntry | null
  } | null>(null)

  // Rename state
  const [renamingItem, setRenamingItem] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { clipboard, clipboardOp, setClipboard, clearClipboard } = useFileStore()

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDirectory('')
  }, [loadDirectory])

  const handleNavigate = (entry: FileEntry) => {
    if (entry.is_dir) {
      loadDirectory(entry.path)
    }
  }

  const handleSelect = (name: string, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex.current >= 0) {
      // Shift+click: range select
      const displayEntries = searchResults ?? entries
      const start = Math.min(lastSelectedIndex.current, index)
      const end = Math.max(lastSelectedIndex.current, index)
      const rangeNames = new Set(
        displayEntries.slice(start, end + 1).map((e) => e.name)
      )
      setSelectedItems((prev) => new Set([...prev, ...rangeNames]))
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle individual
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
    // If right-clicking a non-selected item, select it
    if (entry && !selectedItems.has(entry.name)) {
      setSelectedItems(new Set([entry.name]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const handleCopy = () => {
    const items = getSelectedEntries()
    if (items.length > 0) setClipboard(items, 'copy')
  }

  const handleCut = () => {
    const items = getSelectedEntries()
    if (items.length > 0) setClipboard(items, 'cut')
  }

  const handlePaste = async () => {
    if (!clipboard.length || !clipboardOp) return
    try {
      for (const item of clipboard) {
        const endpoint = clipboardOp === 'copy' ? '/api/files/copy' : '/api/files/move'
        await api(endpoint, {
          method: 'POST',
          body: JSON.stringify({ source: item.path, destination: currentPath || '.' }),
        })
      }
      if (clipboardOp === 'cut') clearClipboard()
      loadDirectory(currentPath)
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
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    setSearchLoading(true)
    try {
      const data = await api<{ results: FileEntry[] }>(
        `/api/files/search?path=${encodeURIComponent(currentPath)}&query=${encodeURIComponent(searchQuery)}`
      )
      setSearchResults(data.results)
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const handleUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        await fetch(`/api/files/upload?path=${encodeURIComponent(currentPath || '.')}`, {
          method: 'POST',
          body: formData,
        })
      } catch {
        // ignore individual failures
      }
    }
    loadDirectory(currentPath)
  }

  const handleDrop = async (e: React.DragEvent, targetPath?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)

    // Handle OS file uploads
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files)
      return
    }

    // Handle cross-window file drag (application/nasos-files)
    const nasosData = e.dataTransfer.getData('application/nasos-files')
    if (nasosData) {
      try {
        const items: FileEntry[] = JSON.parse(nasosData)
        const dest = targetPath ?? (currentPath || '.')
        const holdingShift = e.shiftKey
        for (const item of items) {
          const endpoint = holdingShift ? '/api/files/copy' : '/api/files/move'
          await api(endpoint, {
            method: 'POST',
            body: JSON.stringify({ source: item.path, destination: dest }),
          })
        }
        loadDirectory(currentPath)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Drop failed')
      }
    }
  }

  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const getSelectedEntries = (): FileEntry[] => {
    const display = searchResults ?? entries
    return display.filter((e) => selectedItems.has(e.name))
  }

  // Keyboard shortcuts within file manager
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle if file manager is focused (check closest parent)
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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const displayEntries = searchResults ?? entries
  const breadcrumbs = ['Home', ...currentPath.split('/').filter(Boolean)]
  const previewEntry = selectedItems.size === 1
    ? entries.find((e) => selectedItems.has(e.name) && !e.is_dir) ?? null
    : null

  return (
    <div
      className="file-manager"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onContextMenu={(e) => handleContextMenu(e, null)}
    >
      {/* Toolbar */}
      <div className="fm-toolbar">
        <button className="fm-btn" onClick={() => setShowSidebar(!showSidebar)} title="Toggle sidebar">
          ☰
        </button>
        <button
          className="fm-btn"
          disabled={!parentPath}
          onClick={() => parentPath && loadDirectory(parentPath === '.' ? '' : parentPath)}
        >
          ↑
        </button>
        <button className="fm-btn" onClick={() => loadDirectory(currentPath)}>↻</button>
        <div className="fm-breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              {i > 0 && <span className="fm-breadcrumb-sep">/</span>}
              <button
                className="fm-breadcrumb"
                onClick={() => {
                  const path = breadcrumbs.slice(1, i + 1).join('/')
                  loadDirectory(i === 0 ? '' : path)
                }}
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>
        <div className="fm-toolbar-spacer" />
        <div className="fm-search">
          <input
            className="fm-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          {searchResults && (
            <button className="fm-search-clear" onClick={() => { setSearchResults(null); setSearchQuery('') }}>
              ✕
            </button>
          )}
        </div>
        <button
          className="fm-btn"
          onClick={() => setShowPreview(!showPreview)}
          title="Toggle preview"
          data-active={showPreview}
        >
          ◫
        </button>
        <button
          className="fm-btn"
          onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        >
          {viewMode === 'grid' ? '☰' : '⊞'}
        </button>
      </div>

      {/* Main area */}
      <div className="fm-body">
        {/* Sidebar */}
        {showSidebar && (
          <div className="fm-sidebar">
            <FileTree currentPath={currentPath} onNavigate={loadDirectory} />
          </div>
        )}

        {/* File List */}
        <div className="fm-content" onContextMenu={(e) => handleContextMenu(e, null)}>
          {loading && <div className="fm-loading">Loading...</div>}
          {error && <div className="fm-error">{error}</div>}
          {searchLoading && <div className="fm-loading">Searching...</div>}
          {searchResults && !searchLoading && (
            <div className="fm-search-info">
              {searchResults.length} results for "{searchQuery}"
            </div>
          )}
          {!loading && !error && !searchLoading && (
            <div className={`fm-entries fm-entries-${viewMode}`}>
              {viewMode === 'list' && (
                <div className="fm-list-header">
                  <span className="fm-col-name">Name</span>
                  <span className="fm-col-size">Size</span>
                  <span className="fm-col-modified">Modified</span>
                </div>
              )}
              {displayEntries.map((entry, index) => (
                <div
                  key={entry.path}
                  className={`fm-entry fm-entry-${viewMode}`}
                  data-selected={selectedItems.has(entry.name)}
                  data-type={entry.is_dir ? 'dir' : 'file'}
                  data-cut={clipboardOp === 'cut' && clipboard.some((c) => c.path === entry.path)}
                  data-drop-target={dropTarget === entry.path}
                  onClick={(e) => handleSelect(entry.name, index, e)}
                  onDoubleClick={() => handleNavigate(entry)}
                  onContextMenu={(e) => handleContextMenu(e, entry)}
                  draggable
                  onDragStart={(e) => {
                    const items = selectedItems.has(entry.name) ? getSelectedEntries() : [entry]
                    e.dataTransfer.setData('application/nasos-files', JSON.stringify(items))
                    e.dataTransfer.effectAllowed = 'copyMove'
                  }}
                  onDragOver={(e) => {
                    if (entry.is_dir) {
                      e.preventDefault()
                      e.stopPropagation()
                      setDropTarget(entry.path)
                    }
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => {
                    if (entry.is_dir) handleDrop(e, entry.path)
                  }}
                >
                  {renamingItem === entry.name ? (
                    <input
                      className="fm-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit()
                        if (e.key === 'Escape') setRenamingItem(null)
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className="fm-entry-icon">{entry.is_dir ? '📁' : getFileIcon(entry.name)}</span>
                      <span className="fm-entry-name">{entry.name}</span>
                    </>
                  )}
                  {viewMode === 'list' && renamingItem !== entry.name && (
                    <>
                      <span className="fm-col-size">
                        {entry.is_dir ? '--' : formatSize(entry.size)}
                      </span>
                      <span className="fm-col-modified">
                        {entry.modified ? new Date(entry.modified * 1000).toLocaleString() : '--'}
                      </span>
                    </>
                  )}
                </div>
              ))}
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
            <FilePreview entry={previewEntry} />
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
          onOpen={() => contextMenu.entry && handleNavigate(contextMenu.entry)}
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
        />
      )}
    </div>
  )
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const icons: Record<string, string> = {
    pdf: '📕', doc: '📘', docx: '📘', txt: '📝', md: '📝',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬',
    mp3: '🎵', flac: '🎵', wav: '🎵', ogg: '🎵',
    zip: '📦', tar: '📦', gz: '📦', rar: '📦', '7z': '📦',
    py: '🐍', js: '📜', ts: '📜', jsx: '📜', tsx: '📜',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    sh: '⚙️', bash: '⚙️',
    iso: '💿', img: '💿',
  }
  return icons[ext] ?? '📄'
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
