import { createPortal } from 'react-dom'
import { X, CheckCircle, AlertTriangle, XCircle, Loader, Pause } from 'lucide-react'
import { useFileOperationsStore, selectActiveOps, selectCompletedOps, type FileOpProgress } from '../../store/fileOperationsStore'
import { api } from '../../hooks/useApi'

export function FileOpsModal() {
  const { operations, showModal, setShowModal } = useFileOperationsStore()
  const activeOps = selectActiveOps({ operations })
  const completedOps = selectCompletedOps({ operations })

  if (!showModal) return null

  return createPortal(
    <div className="fops-modal-overlay" onClick={() => setShowModal(false)}>
      <div className="fops-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fops-modal-header">
          <span className="fops-modal-title">File Operations</span>
          <button className="fops-modal-close" onClick={() => setShowModal(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="fops-modal-body">
          {operations.length === 0 && (
            <div className="fops-empty">No file operations in progress</div>
          )}
          {activeOps.map((op) => (
            <OperationRow key={op.id} op={op} />
          ))}
          {completedOps.length > 0 && activeOps.length > 0 && (
            <div className="fops-section-divider">Completed</div>
          )}
          {completedOps.map((op) => (
            <OperationRow key={op.id} op={op} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

function OperationRow({ op }: { op: FileOpProgress }) {
  const dismissOperation = useFileOperationsStore((s) => s.dismissOperation)
  const progressPct = op.total_bytes > 0 ? (op.completed_bytes / op.total_bytes) * 100 : 0

  const handleCancel = async () => {
    try {
      await api(`/api/file-ops/${op.id}/cancel`, { method: 'POST' })
    } catch { /* ignore */ }
  }

  const handleResolve = async (resolution: string) => {
    try {
      await api(`/api/file-ops/${op.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution }),
      })
    } catch { /* ignore */ }
  }

  const handleDismiss = async () => {
    try {
      await api(`/api/file-ops/${op.id}/dismiss`, { method: 'POST' })
    } catch { /* ignore */ }
    dismissOperation(op.id)
  }

  return (
    <div className="fops-row" data-status={op.status}>
      <div className="fops-row-header">
        <StatusIcon status={op.status} />
        <span className="fops-op-type">{op.op_type === 'copy' ? 'Copying' : 'Moving'}</span>
        <span className="fops-op-count">
          {op.completed_files} / {op.total_files} files
        </span>
        <div className="fops-row-actions">
          {(op.status === 'running' || op.status === 'pending') && (
            <button className="fops-cancel-btn" onClick={handleCancel} title="Cancel">
              <X size={12} />
            </button>
          )}
          {(op.status === 'completed' || op.status === 'failed' || op.status === 'cancelled') && (
            <button className="fops-dismiss-btn" onClick={handleDismiss} title="Dismiss">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {(op.status === 'running' || op.status === 'pending') && (
        <>
          <div className="fops-progress-bar">
            <div className="fops-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="fops-row-detail">
            {op.current_file && <span className="fops-current-file">{op.current_file}</span>}
            <span className="fops-speed">{formatSpeed(op.speed_bps)}</span>
            <span className="fops-size">
              {formatBytes(op.completed_bytes)} / {formatBytes(op.total_bytes)}
            </span>
          </div>
        </>
      )}

      {op.status === 'conflict' && op.conflict && (
        <div className="fops-conflict">
          <div className="fops-conflict-msg">
            File already exists: <strong>{op.conflict.file}</strong>
          </div>
          <div className="fops-conflict-actions">
            <button className="fops-resolve-btn" onClick={() => handleResolve('overwrite')}>Overwrite</button>
            <button className="fops-resolve-btn" onClick={() => handleResolve('overwrite_all')}>Overwrite All</button>
            <button className="fops-resolve-btn" onClick={() => handleResolve('skip')}>Skip</button>
            <button className="fops-resolve-btn" onClick={() => handleResolve('skip_all')}>Skip All</button>
            <button className="fops-resolve-btn" onClick={() => handleResolve('rename')}>Rename</button>
            <button className="fops-resolve-btn" onClick={() => handleResolve('rename_all')}>Rename All</button>
          </div>
        </div>
      )}

      {op.status === 'failed' && op.error_message && (
        <div className="fops-error-msg">{op.error_message}</div>
      )}

      {op.status === 'completed' && (
        <div className="fops-completed-msg">
          {formatBytes(op.total_bytes)} — {op.total_files} files completed
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
    case 'pending':
      return <Loader size={14} className="fops-icon-spin" />
    case 'conflict':
      return <Pause size={14} className="fops-icon-warn" />
    case 'completed':
      return <CheckCircle size={14} className="fops-icon-ok" />
    case 'failed':
      return <XCircle size={14} className="fops-icon-err" />
    case 'cancelled':
      return <AlertTriangle size={14} className="fops-icon-warn" />
    default:
      return null
  }
}

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
