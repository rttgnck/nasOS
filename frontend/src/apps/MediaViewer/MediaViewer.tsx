import { useRef, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Download, AlertCircle, Loader } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv', 'flv', 'wmv', 'ts', 'mpg', 'mpeg', '3gp'])
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'wma'])

// Formats the browser <video> element can play natively
const NATIVE_VIDEO = new Set(['mp4', 'webm'])
const NATIVE_AUDIO = new Set(['mp3', 'wav', 'ogg', 'aac', 'opus', 'm4a', 'flac'])

function authUrl(url: string): string {
  const token = useAuthStore.getState().token
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

interface MediaViewerProps {
  filePath: string
  fileName: string
  fileType?: string
}

export function MediaViewer({ filePath, fileName, fileType }: MediaViewerProps) {
  const ext = fileType ?? fileName.split('.').pop()?.toLowerCase() ?? ''
  const encodedPath = encodeURIComponent(filePath)
  const streamUrl = authUrl(`/api/files/stream?path=${encodedPath}`)
  const transcodeUrl = authUrl(`/api/files/transcode?path=${encodedPath}`)
  const downloadUrl = authUrl(`/api/files/download?path=${encodedPath}`)

  const isImage = IMAGE_EXTS.has(ext)
  const isVideo = VIDEO_EXTS.has(ext)
  const isAudio = AUDIO_EXTS.has(ext)
  const isPdf = ext === 'pdf'

  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const handleDownload = () => {
    window.open(downloadUrl, '_blank')
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
            src={streamUrl}
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
      <VideoPlayer
        ext={ext}
        streamUrl={streamUrl}
        transcodeUrl={transcodeUrl}
        fileName={fileName}
        onDownload={handleDownload}
      />
    )
  }

  if (isAudio) {
    const audioSrc = NATIVE_AUDIO.has(ext) ? streamUrl : transcodeUrl
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
          <audio controls autoPlay preload="metadata">
            <source src={audioSrc} />
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
          <iframe src={streamUrl} title={fileName} />
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

/**
 * Tries native streaming first; falls back to server-side transcode on error.
 */
function VideoPlayer({
  ext,
  streamUrl,
  transcodeUrl,
  fileName,
  onDownload,
}: {
  ext: string
  streamUrl: string
  transcodeUrl: string
  fileName: string
  onDownload: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const isNative = NATIVE_VIDEO.has(ext)
  const [src, setSrc] = useState(isNative ? streamUrl : transcodeUrl)
  const [transcoding, setTranscoding] = useState(!isNative)
  const [error, setError] = useState<string | null>(null)
  const triedTranscode = useRef(!isNative)

  const handleError = () => {
    if (!triedTranscode.current) {
      triedTranscode.current = true
      setTranscoding(true)
      setSrc(transcodeUrl)
      return
    }
    setError('Unable to play this video. The format may be unsupported, or FFmpeg may not be installed on the server.')
  }

  const handleCanPlay = () => {
    setTranscoding(false)
  }

  if (error) {
    return (
      <div className="media-viewer">
        <div className="mv-content mv-unsupported">
          <AlertCircle size={32} />
          <p>{error}</p>
          <button className="fm-btn" onClick={onDownload}>
            <Download size={14} /> Download Instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="media-viewer">
      <div className="mv-content mv-video-content">
        {transcoding && (
          <div className="mv-transcode-indicator">
            <Loader size={16} className="mv-spinner" />
            <span>Transcoding...</span>
          </div>
        )}
        <video
          ref={videoRef}
          controls
          autoPlay
          preload="auto"
          onError={handleError}
          onCanPlay={handleCanPlay}
        >
          <source src={src} type="video/mp4" />
        </video>
        <div className="mv-video-overlay-bar">
          <span className="mv-filename">{fileName}</span>
          <div className="mv-toolbar-spacer" />
          <button className="fm-btn" onClick={onDownload} title="Download">
            <Download size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
