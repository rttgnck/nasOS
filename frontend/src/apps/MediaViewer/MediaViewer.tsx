import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Download, AlertCircle, Loader, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../hooks/useApi'

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
        filePath={filePath}
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
  filePath,
  streamUrl,
  transcodeUrl,
  fileName,
  onDownload,
}: {
  ext: string
  filePath: string
  streamUrl: string
  transcodeUrl: string
  fileName: string
  onDownload: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const seekingRef = useRef(false)
  const isNative = NATIVE_VIDEO.has(ext)

  // ssOffset tracks the -ss value sent to the transcode endpoint.
  // For transcoded streams, video.currentTime starts at 0 from the
  // transcode start point, so the real playback position = ssOffset + video.currentTime.
  const ssOffsetRef = useRef(0)

  const [src, setSrc] = useState(isNative ? streamUrl : transcodeUrl)
  const [transcoding, setTranscoding] = useState(!isNative)
  const [error, setError] = useState<string | null>(null)
  const triedTranscode = useRef(!isNative)
  const isTranscoded = useRef(!isNative)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  // Fetch the real total duration from ffprobe on mount
  useEffect(() => {
    const encodedPath = encodeURIComponent(filePath)
    api<{ duration: number }>(`/api/files/media-info?path=${encodedPath}`)
      .then((info) => {
        if (info.duration > 0) setTotalDuration(info.duration)
      })
      .catch(() => {})
  }, [filePath])

  const handleError = () => {
    if (!triedTranscode.current) {
      triedTranscode.current = true
      isTranscoded.current = true
      setTranscoding(true)
      ssOffsetRef.current = 0
      setSrc(transcodeUrl)
      return
    }
    setError('Unable to play this video. The format may be unsupported, or FFmpeg may not be installed on the server.')
  }

  const handleCanPlay = () => {
    setTranscoding(false)
  }

  // Wire up video element events (only once, no state deps)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const syncState = () => {
      if (!seekingRef.current) {
        setCurrentTime(ssOffsetRef.current + v.currentTime)
      }
      if (v.buffered.length > 0) {
        setBufferedEnd(ssOffsetRef.current + v.buffered.end(v.buffered.length - 1))
      }
    }

    const onDuration = () => {
      // For native files, the browser knows the real duration
      if (!isTranscoded.current && isFinite(v.duration) && v.duration > 0) {
        setTotalDuration(v.duration)
      }
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onVolumeChange = () => {
      setMuted(v.muted)
      setVolume(v.volume)
    }

    v.addEventListener('timeupdate', syncState)
    v.addEventListener('progress', syncState)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('loadedmetadata', onDuration)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('volumechange', onVolumeChange)

    // Sync initial state
    onDuration()
    onVolumeChange()
    setPlaying(!v.paused)

    return () => {
      v.removeEventListener('timeupdate', syncState)
      v.removeEventListener('progress', syncState)
      v.removeEventListener('durationchange', onDuration)
      v.removeEventListener('loadedmetadata', onDuration)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('volumechange', onVolumeChange)
    }
  }, [])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const val = parseFloat(e.target.value)
    v.volume = val
    if (val > 0 && v.muted) v.muted = false
  }

  // Seek to a position in the video. For native formats, just set currentTime.
  // For transcoded content, if the target is outside the buffered range, restart
  // the transcode with -ss to jump there.
  const seekToTime = (targetTime: number) => {
    const v = videoRef.current
    if (!v || totalDuration <= 0) return

    const clamped = Math.max(0, Math.min(targetTime, totalDuration))
    setCurrentTime(clamped)

    if (!isTranscoded.current) {
      // Native — browser handles range seeking
      v.currentTime = clamped
      return
    }

    // For transcoded: check if the target falls within the already-buffered window
    const localTarget = clamped - ssOffsetRef.current
    const localBuffered = v.buffered.length > 0
      ? v.buffered.end(v.buffered.length - 1)
      : 0

    if (localTarget >= 0 && localTarget <= localBuffered) {
      // Within buffered range — just seek locally
      v.currentTime = localTarget
    } else {
      // Outside buffer — restart transcode from the new position
      ssOffsetRef.current = clamped
      setBufferedEnd(clamped)
      const encodedPath = encodeURIComponent(filePath)
      const token = useAuthStore.getState().token
      const sep = '?'
      let url = `/api/files/transcode${sep}path=${encodedPath}&ss=${clamped}`
      if (token) url += `&token=${encodeURIComponent(token)}`
      setTranscoding(true)
      setSrc(url)
      // The video element will reload and autoPlay from the new src
    }
  }

  const handleProgressDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalDuration <= 0) return
    seekingRef.current = true
    const bar = progressRef.current!
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setCurrentTime(pct * totalDuration)

    const onMove = (me: MouseEvent) => {
      const r = bar.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (me.clientX - r.left) / r.width))
      setCurrentTime(p * totalDuration)
    }

    const onUp = (me: MouseEvent) => {
      seekingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const r = bar.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (me.clientX - r.left) / r.width))
      seekToTime(p * totalDuration)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const toggleFullscreen = () => {
    const el = videoRef.current?.parentElement
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen()
  }

  const playedPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0
  const bufferedPct = totalDuration > 0 ? (bufferedEnd / totalDuration) * 100 : 0

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
          playsInline
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
            onMouseDown={handleProgressDown}
          >
            <div className="mv-progress-total" />
            <div className="mv-progress-buffered" style={{ width: `${bufferedPct}%` }} />
            <div className="mv-progress-played" style={{ width: `${playedPct}%` }} />
            <div className="mv-progress-thumb" style={{ left: `${playedPct}%` }} />
          </div>
          <span className="mv-time-label">{fmtTime(totalDuration)}</span>
          <button className="mv-ctrl-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            className="mv-volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            title={`Volume ${Math.round(volume * 100)}%`}
          />
          <button className="mv-ctrl-btn" onClick={toggleFullscreen} title="Fullscreen">
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
