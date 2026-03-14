import { useEffect, useState } from 'react'
import { Edit3, Package } from 'lucide-react'
import { api } from '../../hooks/useApi'
import type { FileEntry } from './FileManager'

interface FilePreviewProps {
  entry: FileEntry | null
  onOpenEditor?: (path: string, name: string) => void
}

interface PreviewData {
  type: 'image' | 'text' | 'binary' | 'video' | 'audio' | 'pdf'
  name: string
  size: number
  content?: string
  url?: string
  truncated?: boolean
}

const CODE_EXTS = new Set([
  'py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'toml', 'cfg',
  'conf', 'ini', 'sh', 'bash', 'css', 'html', 'xml', 'csv', 'sql',
  'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'rb', 'php', 'md', 'txt',
  'log', 'env', 'gitignore', 'dockerfile',
])

export function FilePreview({ entry, onOpenEditor }: FilePreviewProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entry) { setPreview(null); return }
    setLoading(true)
    api<PreviewData>(`/api/files/preview?path=${encodeURIComponent(entry.path)}`)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setLoading(false))
  }, [entry])

  if (!entry) return <div className="fm-preview-empty">Select a file to preview</div>
  if (loading) return <div className="fm-preview-empty">Loading preview...</div>
  if (!preview) return <div className="fm-preview-empty">Unable to preview</div>

  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  const isEditable = CODE_EXTS.has(ext)

  return (
    <div className="fm-preview-content">
      <div className="fm-preview-header">
        <div className="fm-preview-header-row">
          <span className="fm-preview-name">{preview.name}</span>
          {isEditable && onOpenEditor && (
            <button className="fm-btn fm-preview-edit-btn"
              onClick={() => onOpenEditor(entry.path, entry.name)}
              title="Open in editor">
              <Edit3 size={13} />
            </button>
          )}
        </div>
        <span className="fm-preview-size">{formatPreviewSize(preview.size)}</span>
      </div>

      {preview.type === 'image' && preview.url && (
        <div className="fm-preview-image">
          <img src={preview.url} alt={preview.name} />
        </div>
      )}

      {preview.type === 'video' && preview.url && (
        <div className="fm-preview-media">
          <video controls preload="metadata" src={preview.url}>
            Your browser does not support video playback.
          </video>
        </div>
      )}

      {preview.type === 'audio' && preview.url && (
        <div className="fm-preview-media fm-preview-audio">
          <audio controls preload="metadata" src={preview.url}>
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {preview.type === 'pdf' && preview.url && (
        <div className="fm-preview-pdf">
          <iframe src={preview.url} title={preview.name} />
        </div>
      )}

      {preview.type === 'text' && preview.content !== undefined && (
        <pre className="fm-preview-text">
          <code>{preview.content}</code>
          {preview.truncated && (
            <div className="fm-preview-truncated">File truncated (showing first 100KB)</div>
          )}
        </pre>
      )}

      {preview.type === 'binary' && (
        <div className="fm-preview-binary">
          <span className="fm-preview-binary-icon"><Package size={32} /></span>
          <span>Binary file</span>
          <span className="fm-preview-binary-size">{formatPreviewSize(preview.size)}</span>
        </div>
      )}
    </div>
  )
}

function formatPreviewSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
