import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Download, AlertCircle, Loader, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../hooks/useApi'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv', 'flv', 'wmv', 'ts', 'mpg', 'mpeg', '3gp'])
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'wma'])

// Formats the browser <video> element can play natively
const NATIVE_VIDEO = new Set(['mp4', 'webm'])
const NATIVE_AUDIO = new Set(['mp3', 'wav', 'ogg', 'aac', 'opus', 'm4a', 'flac'])

// Audio codecs that browsers can decode inside a video container.
// If the file's audio codec is NOT in this set, we must transcode.
const BROWSER_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_f32le'])

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
  const isNativeContainer = NATIVE_VIDEO.has(ext)

  // For transcoded streams, video.currentTime starts at 0 from the
  // transcode start point. Real position = ssOffset + video.currentTime.
  const ssOffsetRef = useRef(0)

  const [src, setSrc] = useState('')
  const [transcoding, setTranscoding] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const triedTranscode = useRef(false)
  const isTranscoded = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  // Stable session ID for the lifetime of this player instance.
  // Re-using the same sid on every seek lets the backend kill the
  // previous ffmpeg process *synchronously* before spawning a new one,
  // so there are never two transcodes running at once on the Pi.
  const sessionIdRef = useRef(Math.random().toString(36).slice(2, 14))

  /** Stop the current transcode process on the backend. */
  const stopTranscode = useCallback(() => {
    const sid = sessionIdRef.current
    // Fire-and-forget — use sendBeacon for reliability during page unload,
    // fall back to fetch for normal unmount.
    const token = useAuthStore.getState().token
    const url = `/api/files/transcode/stop?session=${encodeURIComponent(sid)}&token=${encodeURIComponent(token ?? '')}`
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url)
    } else {
      fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
    }
  }, [])

  const loadSource = useCallback((url: string) => {
    const v = videoRef.current
    if (!v) return

    // If this is a transcode URL, attach our stable session ID.
    // The backend will kill any existing process with this sid before
    // starting the new one — critical on resource-limited Pi hardware.
    if (url.includes('/transcode')) {
      // Disconnect the old stream immediately so the browser drops
      // the TCP connection and the backend's _stream() generator exits.
      v.pause()
      v.removeAttribute('src')
      v.load()

      const sep = url.includes('?') ? '&' : '?'
      url = `${url}${sep}sid=${encodeURIComponent(sessionIdRef.current)}`
    }

    setSrc(url)
    v.src = url
    v.load()
    v.play().catch(() => {})
  }, [])

  // Clean up transcode on unmount
  useEffect(() => {
    return () => {
      stopTranscode()
      // Also sever the streaming connection
      const v = videoRef.current
      if (v) {
        v.pause()
        v.removeAttribute('src')
        v.load()
      }
    }
  }, [stopTranscode])

  // Fetch media-info to get duration AND audio codec. If the audio codec
  // isn't browser-decodable (e.g. AC3, DTS, EAC3), force transcoding so
  // FFmpeg re-encodes audio to AAC — otherwise the browser plays video
  // but silently drops the incompatible audio track.
  useEffect(() => {
    const encodedPath = encodeURIComponent(filePath)
    api<{ duration: number; audio_codec: string }>(`/api/files/media-info?path=${encodedPath}`)
      .then((info) => {
        if (info.duration > 0) setTotalDuration(info.duration)

        const audioOk = !info.audio_codec || BROWSER_AUDIO_CODECS.has(info.audio_codec)
        const canPlayNative = isNativeContainer && audioOk

        if (canPlayNative) {
          isTranscoded.current = false
          triedTranscode.current = false
          setTranscoding(false)
          loadSource(streamUrl)
        } else {
          isTranscoded.current = true
          triedTranscode.current = true
          loadSource(transcodeUrl)
        }
      })
      .catch(() => {
        if (isNativeContainer) {
          isTranscoded.current = false
          setTranscoding(false)
          loadSource(streamUrl)
        } else {
          isTranscoded.current = true
          triedTranscode.current = true
          loadSource(transcodeUrl)
        }
      })
  }, [filePath])

  const handleError = () => {
    if (!triedTranscode.current) {
      triedTranscode.current = true
      isTranscoded.current = true
      ssOffsetRef.current = 0
      setTranscoding(true)
      loadSource(transcodeUrl)
      return
    }
    setError('Unable to play this video. The format may be unsupported, or FFmpeg may not be installed on the server.')
  }

  const handleCanPlay = () => {
    setTranscoding(false)
  }

  // Wire up video element events (once)
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

  const seekToTime = (targetTime: number) => {
    const v = videoRef.current
    if (!v || totalDuration <= 0) return

    const clamped = Math.max(0, Math.min(targetTime, totalDuration))
    setCurrentTime(clamped)

    if (!isTranscoded.current) {
      v.currentTime = clamped
      return
    }

    // Check if the target falls within the already-buffered window
    const localTarget = clamped - ssOffsetRef.current
    const localBuffered = v.buffered.length > 0
      ? v.buffered.end(v.buffered.length - 1)
      : 0

    if (localTarget >= 0 && localTarget <= localBuffered) {
      v.currentTime = localTarget
    } else {
      // Restart transcode from the new position
      ssOffsetRef.current = clamped
      setBufferedEnd(clamped)
      const encodedPath = encodeURIComponent(filePath)
      const token = useAuthStore.getState().token
      let url = `/api/files/transcode?path=${encodedPath}&ss=${clamped}`
      if (token) url += `&token=${encodeURIComponent(token)}`
      setTranscoding(true)
      loadSource(url)
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
            <span>Loading...</span>
          </div>
        )}
        <video
          ref={videoRef}
          src={src || undefined}
          autoPlay
          preload="auto"
          playsInline
          onClick={togglePlay}
          onError={handleError}
          onCanPlay={handleCanPlay}
        />
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
