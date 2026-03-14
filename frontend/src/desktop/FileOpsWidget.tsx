import { X, Copy, ArrowRightLeft, CheckCircle, Loader } from 'lucide-react'
import { useFileOperationsStore, selectActiveOps, selectCompletedOps } from '../store/fileOperationsStore'

export function FileOpsWidget() {
  const { operations, setShowModal, dismissOperation } = useFileOperationsStore()
  const activeOps = selectActiveOps({ operations })
  const completedOps = selectCompletedOps({ operations })

  if (operations.length === 0) return null

  return (
    <div className="dw-card dw-fileops" onClick={() => setShowModal(true)}>
      <div className="dw-fileops-header">
        <span className="dw-fileops-title">File Operations</span>
      </div>

      {activeOps.map((op) => {
        const pct = op.total_bytes > 0 ? (op.completed_bytes / op.total_bytes) * 100 : 0
        return (
          <div key={op.id} className="dw-fileops-item" data-status={op.status}>
            <div className="dw-fileops-item-row">
              {op.op_type === 'copy' ? <Copy size={12} /> : <ArrowRightLeft size={12} />}
              <span className="dw-fileops-item-label">
                {op.op_type === 'copy' ? 'Copying' : 'Moving'} {op.completed_files}/{op.total_files}
              </span>
              <Loader size={11} className="fops-icon-spin" />
            </div>
            <div className="dw-fileops-bar">
              <div className="dw-fileops-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            {op.status === 'conflict' && (
              <span className="dw-fileops-conflict-badge">Conflict — click to resolve</span>
            )}
          </div>
        )
      })}

      {completedOps.map((op) => (
        <div key={op.id} className="dw-fileops-item dw-fileops-done" data-status={op.status}>
          <div className="dw-fileops-item-row">
            <CheckCircle size={12} className={op.status === 'completed' ? 'fops-icon-ok' : 'fops-icon-warn'} />
            <span className="dw-fileops-item-label">
              {op.op_type === 'copy' ? 'Copied' : 'Moved'} {op.total_files} files
              {op.status !== 'completed' && ` (${op.status})`}
            </span>
            <button className="dw-fileops-dismiss"
              onClick={(e) => { e.stopPropagation(); dismissOperation(op.id) }}
              title="Dismiss">
              <X size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
