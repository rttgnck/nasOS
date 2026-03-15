import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Download, AlertCircle, Loader, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'
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

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

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
  const progressRef = useRef<HTMLDivElement>(null)
  const isNative = NATIVE_VIDEO.has(ext)
  const [src, setSrc] = useState(isNative ? streamUrl : transcodeUrl)
  const [transcoding, setTranscoding] = useState(!isNative)
  const [error, setError] = useState<string | null>(null)
  const triedTranscode = useRef(!isNative)

  const [playing, setPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [muted, setMuted] = useState(false)
  const [seeking, setSeeking] = useState(false)

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

  const updateBuffered = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.buffered.length > 0) {
      setBufferedEnd(v.buffered.end(v.buffered.length - 1))
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onTimeUpdate = () => {
      if (!seeking) setCurrentTime(v.currentTime)
      updateBuffered()
    }
    const onDurationChange = () => {
      if (isFinite(v.duration)) setDuration(v.duration)
    }
    const onProgress = () => updateBuffered()
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('durationchange', onDurationChange)
    v.addEventListener('progress', onProgress)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('loadedmetadata', onDurationChange)

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('durationchange', onDurationChange)
      v.removeEventListener('progress', onProgress)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('loadedmetadata', onDurationChange)
    }
  }, [seeking, updateBuffered])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    const bar = progressRef.current
    if (!v || !bar || !duration) return
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = pct * duration
    setCurrentTime(v.currentTime)
  }

  const handleProgressDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    setSeeking(true)
    handleProgressClick(e)
  }

  const handleProgressUp = () => {
    setSeeking(false)
  }

  const toggleFullscreen = () => {
    const el = videoRef.current?.parentElement
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen()
  }

  const playedPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0

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
          autoPlay
          preload="auto"
          onClick={togglePlay}
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
        <div className="mv-custom-controls">
          <button className="mv-ctrl-btn" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="mv-time-label">{fmtTime(currentTime)}</span>
          <div
            className="mv-progress-bar"
            ref={progressRef}
            onClick={handleProgressClick}
            onMouseDown={handleProgressDrag}
            onMouseMove={handleProgressDrag}
            onMouseUp={handleProgressUp}
            onMouseLeave={handleProgressUp}
          >
            <div className="mv-progress-total" />
            <div className="mv-progress-buffered" style={{ width: `${bufferedPct}%` }} />
            <div className="mv-progress-played" style={{ width: `${playedPct}%` }} />
            <div className="mv-progress-thumb" style={{ left: `${playedPct}%` }} />
          </div>
          <span className="mv-time-label">{fmtTime(duration)}</span>
          <button className="mv-ctrl-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button className="mv-ctrl-btn" onClick={toggleFullscreen} title="Fullscreen">
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
