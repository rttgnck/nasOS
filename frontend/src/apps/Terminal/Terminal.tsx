import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useAuthStore } from '../../store/authStore'
import { useWindowStore } from '../../store/windowStore'

interface TerminalProps {
  windowId: string
}

export function Terminal({ windowId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const token = useAuthStore.getState().token
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const ws = new WebSocket(`${protocol}//${host}/ws/terminal?token=${encodeURIComponent(token ?? '')}`)
    wsRef.current = ws

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      const term = termRef.current
      const fit = fitRef.current
      if (term && fit) {
        fit.fit()
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        term.focus()
      }
    }

    ws.onmessage = (event) => {
      const term = termRef.current
      if (!term) return
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'error') {
            term.writeln(`\r\n\x1b[31m${msg.message}\x1b[0m`)
          }
        } catch {
          term.write(event.data)
        }
      } else {
        term.write(new Uint8Array(event.data))
      }
    }

    ws.onclose = () => {
      termRef.current?.writeln('\r\n\x1b[90m[Connection closed]\x1b[0m')
      reconnectRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
  }, [])

  // Re-focus xterm when this window becomes the focused window
  const focusedWindowId = useWindowStore((s) => s.focusedWindowId)
  useEffect(() => {
    if (focusedWindowId === windowId) {
      termRef.current?.focus()
    }
  }, [focusedWindowId, windowId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Courier New', monospace",
      allowTransparency: true,
      theme: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      scrollback: 5000,
      convertEol: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    term.onData((data) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // Focus the terminal immediately
    requestAnimationFrame(() => term.focus())

    connect()

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit()
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      } catch { /* container might be detached */ }
    })
    resizeObserver.observe(container)

    return () => {
      clearTimeout(reconnectRef.current)
      resizeObserver.disconnect()
      wsRef.current?.close()
      wsRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [windowId, connect])

  const handleClick = useCallback(() => {
    termRef.current?.focus()
  }, [])

  return (
    <div className="terminal-app" onMouseDown={handleClick}>
      <div className="terminal-container" ref={containerRef} />
    </div>
  )
}
