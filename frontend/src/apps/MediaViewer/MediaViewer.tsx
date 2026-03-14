import { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Download } from 'lucide-react'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'])
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'wma'])

interface MediaViewerProps {
  filePath: string
  fileName: string
  fileType?: string
}

export function MediaViewer({ filePath, fileName, fileType }: MediaViewerProps) {
  const ext = fileType ?? fileName.split('.').pop()?.toLowerCase() ?? ''
  const url = `/api/files/download?path=${encodeURIComponent(filePath)}`

  const isImage = IMAGE_EXTS.has(ext)
  const isVideo = VIDEO_EXTS.has(ext)
  const isAudio = AUDIO_EXTS.has(ext)
  const isPdf = ext === 'pdf'

  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const handleDownload = () => {
    window.open(url, '_blank')
  }

  if (isImage) {
    return (
      <div className="media-viewer">
        <div className="mv-toolbar">
          <span className="mv-filename">{fileName}</span>
          <div className="mv-toolbar-spacer" />
          <button className="fm-btn" onClick={() => setZoom((z) => Math.max(0.1, z - 0.25))} title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <span className="mv-zoom-label">{(zoom * 100).toFixed(0)}%</span>
          <button className="fm-btn" onClick={() => setZoom((z) => Math.min(5, z + 0.25))} title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button className="fm-btn" onClick={() => setZoom(1)} title="Reset zoom">
            <Maximize2 size={14} />
          </button>
          <button className="fm-btn" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate">
            <RotateCw size={14} />
          </button>
          <button className="fm-btn" onClick={handleDownload} title="Download">
            <Download size={14} />
          </button>
        </div>
        <div className="mv-content mv-image-content"
          onWheel={(e) => {
            e.preventDefault()
            setZoom((z) => Math.min(5, Math.max(0.1, z + (e.deltaY > 0 ? -0.1 : 0.1))))
          }}>
          <img
            src={url}
            alt={fileName}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.15s ease',
            }}
            draggable={false}
          />
        </div>
      </div>
    )
  }

  if (isVideo) {
    return (
      <div className="media-viewer">
        <div className="mv-toolbar">
          <span className="mv-filename">{fileName}</span>
          <div className="mv-toolbar-spacer" />
          <button className="fm-btn" onClick={handleDownload} title="Download">
            <Download size={14} />
          </button>
        </div>
        <div className="mv-content mv-video-content">
          <video controls autoPlay preload="metadata" src={url}>
            Your browser does not support this video format.
          </video>
        </div>
      </div>
    )
  }

  if (isAudio) {
    return (
      <div className="media-viewer">
        <div className="mv-toolbar">
          <span className="mv-filename">{fileName}</span>
          <div className="mv-toolbar-spacer" />
          <button className="fm-btn" onClick={handleDownload} title="Download">
            <Download size={14} />
          </button>
        </div>
        <div className="mv-content mv-audio-content">
          <div className="mv-audio-artwork">🎵</div>
          <div className="mv-audio-name">{fileName}</div>
          <audio controls autoPlay preload="metadata" src={url}>
            Your browser does not support this audio format.
          </audio>
        </div>
      </div>
    )
  }

  if (isPdf) {
    return (
      <div className="media-viewer">
        <div className="mv-toolbar">
          <span className="mv-filename">{fileName}</span>
          <div className="mv-toolbar-spacer" />
          <button className="fm-btn" onClick={handleDownload} title="Download">
            <Download size={14} />
          </button>
        </div>
        <div className="mv-content mv-pdf-content">
          <iframe src={url} title={fileName} />
        </div>
      </div>
    )
  }

  return (
    <div className="media-viewer">
      <div className="mv-content mv-unsupported">
        <p>This file type cannot be previewed.</p>
        <button className="fm-btn" onClick={handleDownload}>
          <Download size={14} /> Download
        </button>
      </div>
    </div>
  )
}
