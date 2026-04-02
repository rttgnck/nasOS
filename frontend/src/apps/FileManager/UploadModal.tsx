import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, CheckCircle, XCircle, Loader, Upload, AlertTriangle,
  GripHorizontal, Minimize2, Maximize2,
} from 'lucide-react'
import {
  useUploadStore,
  selectActiveUploads,
  selectFinishedUploads,
  type UploadItem,
} from '../../store/uploadStore'

export function UploadModal() {
  const { uploads, showModal, setShowModal, dismissCompleted, clearAll } =
    useUploadStore()
  const active = selectActiveUploads(uploads)
  const finished = selectFinishedUploads(uploads)

  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()

    const handleMove = (ev: MouseEvent) => {
      setPosition({
        x: ev.clientX - dragOffset.current.x,
        y: ev.clientY - dragOffset.current.y,
      })
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [])

  if (!showModal || uploads.length === 0) return null

  const totalBytes = uploads.reduce((s, u) => s + u.fileSize, 0)
  const loadedBytes = uploads.reduce((s, u) => s + u.loadedBytes, 0)
  const overallPct = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0
  const totalSpeed = active.reduce((s, u) => s + u.speed, 0)
  const allDone = active.length === 0

  const style: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : {}

  return createPortal(
    <div
      ref={panelRef}
      className={`upload-panel${minimized ? ' upload-panel-minimized' : ''}`}
      style={style}
    >
      {/* Drag handle + header */}
      <div className="upload-panel-header" onMouseDown={handleDragStart}>
        <GripHorizontal size={14} className="upload-panel-grip" />
        <Upload size={14} className="upload-panel-icon" />
        <span className="upload-panel-title">
          {allDone
            ? 'Upload Complete'
            : `Uploading ${active.length} file${active.length !== 1 ? 's' : ''}  — ${overallPct.toFixed(0)}%`}
        </span>
        <div className="upload-panel-header-actions">
          <button
            className="upload-panel-hdr-btn"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
          <button
            className="upload-panel-hdr-btn"
            onClick={() => { setShowModal(false); if (allDone) clearAll() }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Collapsed: just a thin progress bar */}
      {minimized && !allDone && (
        <div className="upload-panel-mini-bar">
          <div className="upload-panel-mini-fill" style={{ width: `${overallPct}%` }} />
        </div>
      )}

      {/* Expanded body */}
      {!minimized && (
        <>
          {/* Overall progress */}
          {!allDone && (
            <div className="upload-overall">
              <div className="upload-overall-bar">
                <div
                  className="upload-overall-fill"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
              <div className="upload-overall-stats">
                <span>{formatBytes(loadedBytes)} / {formatBytes(totalBytes)}</span>
                <span>{formatSpeed(totalSpeed)}</span>
                <span>{overallPct.toFixed(0)}%</span>
              </div>
            </div>
          )}

          {/* File list */}
          <div className="upload-panel-body">
            {active.map((u) => (
              <UploadRow key={u.id} item={u} />
            ))}
            {finished.length > 0 && active.length > 0 && (
              <div className="upload-section-divider">Completed</div>
            )}
            {finished.map((u) => (
              <UploadRow key={u.id} item={u} />
            ))}
          </div>

          {/* Footer actions */}
          <div className="upload-panel-footer">
            {finished.length > 0 && (
              <button className="upload-panel-action-btn" onClick={dismissCompleted}>
                Clear done
              </button>
            )}
            {!allDone && (
              <button
                className="upload-panel-action-btn upload-panel-cancel-all"
                onClick={clearAll}
              >
                Cancel all
              </button>
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  )
}

function UploadRow({ item }: { item: UploadItem }) {
  const { cancelUpload, removeUpload } = useUploadStore()
  const pct = item.fileSize > 0 ? (item.loadedBytes / item.fileSize) * 100 : 0
  const isActive = item.status === 'pending' || item.status === 'uploading'

  return (
    <div className="upload-row" data-status={item.status}>
      <div className="upload-row-header">
        <UploadStatusIcon status={item.status} />
        <span className="upload-row-name" title={item.fileName}>
          {item.fileName}
        </span>
        <span className="upload-row-size">{formatBytes(item.fileSize)}</span>
        <div className="upload-row-actions">
          {isActive && (
            <button
              className="upload-row-cancel"
              onClick={() => cancelUpload(item.id)}
              title="Cancel"
            >
              <X size={12} />
            </button>
          )}
          {!isActive && (
            <button
              className="upload-row-dismiss"
              onClick={() => removeUpload(item.id)}
              title="Dismiss"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {isActive && (
        <>
          <div className="upload-row-bar">
            <div className="upload-row-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="upload-row-detail">
            <span>{formatBytes(item.loadedBytes)} / {formatBytes(item.fileSize)}</span>
            <span>{formatSpeed(item.speed)}</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
        </>
      )}

      {item.status === 'failed' && item.error && (
        <div className="upload-row-error">{item.error}</div>
      )}
    </div>
  )
}

function UploadStatusIcon({ status }: { status: UploadItem['status'] }) {
  switch (status) {
    case 'pending':
    case 'uploading':
      return <Loader size={14} className="fops-icon-spin" />
    case 'completed':
      return <CheckCircle size={14} className="fops-icon-ok" />
    case 'failed':
      return <XCircle size={14} className="fops-icon-err" />
    case 'cancelled':
      return <AlertTriangle size={14} className="fops-icon-warn" />
  }
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return '--'
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
