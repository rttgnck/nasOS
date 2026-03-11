import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { api } from '../../hooks/useApi'
import type { FileEntry } from './FileManager'

interface FilePreviewProps {
  entry: FileEntry | null
}

interface PreviewData {
  type: 'image' | 'text' | 'binary'
  name: string
  size: number
  content?: string
  url?: string
  truncated?: boolean
}

export function FilePreview({ entry }: FilePreviewProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entry) {
      setPreview(null)
      return
    }
    setLoading(true)
    api<PreviewData>(`/api/files/preview?path=${encodeURIComponent(entry.path)}`)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setLoading(false))
  }, [entry])

  if (!entry) {
    return <div className="fm-preview-empty">Select a file to preview</div>
  }

  if (loading) {
    return <div className="fm-preview-empty">Loading preview...</div>
  }

  if (!preview) {
    return <div className="fm-preview-empty">Unable to preview</div>
  }

  return (
    <div className="fm-preview-content">
      <div className="fm-preview-header">
        <span className="fm-preview-name">{preview.name}</span>
        <span className="fm-preview-size">{formatPreviewSize(preview.size)}</span>
      </div>

      {preview.type === 'image' && preview.url && (
        <div className="fm-preview-image">
          <img src={preview.url} alt={preview.name} />
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
