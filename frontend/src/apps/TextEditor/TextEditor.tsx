import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount, loader } from '@monaco-editor/react'
import { Save, RotateCcw } from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useAuthStore } from '../../store/authStore'
import { useWindowStore, registerBeforeClose, unregisterBeforeClose } from '../../store/windowStore'

let _themeRegistered = false

function registerNasOSTheme(monaco: typeof import('monaco-editor')) {
  if (_themeRegistered) return
  _themeRegistered = true
  monaco.editor.defineTheme('nasos-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editor.lineHighlightBackground': '#ffffff08',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000020',
      'editorOverviewRuler.background': '#00000000',
      'scrollbarSlider.background': '#ffffff15',
      'scrollbarSlider.hoverBackground': '#ffffff25',
      'scrollbarSlider.activeBackground': '#ffffff35',
    },
  })
}

loader.init().then(registerNasOSTheme)

interface TextEditorProps {
  filePath: string
  fileName: string
  windowId?: string
}

const EXT_LANGUAGE: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', tsx: 'typescript',
  jsx: 'javascript', json: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', md: 'markdown', html: 'html', css: 'css',
  xml: 'xml', sql: 'sql', sh: 'shell', bash: 'shell',
  rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
  h: 'c', hpp: 'cpp', rb: 'ruby', php: 'php', csv: 'plaintext',
  txt: 'plaintext', log: 'plaintext', env: 'plaintext',
  gitignore: 'plaintext', dockerfile: 'dockerfile',
  conf: 'ini', cfg: 'ini', ini: 'ini',
}

export function TextEditor({ filePath, fileName, windowId }: TextEditorProps) {
  const [content, setContent] = useState<string | null>(null)
  const [originalContent, setOriginalContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const editorRef = useRef<any>(null)
  const closeResolveRef = useRef<((canClose: boolean) => void) | null>(null)

  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const language = EXT_LANGUAGE[ext] ?? 'plaintext'

  const loadFile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api<{ type: string; content?: string }>(`/api/files/preview?path=${encodeURIComponent(filePath)}`)
      if (data.type === 'text' && data.content !== undefined) {
        setContent(data.content)
        setOriginalContent(data.content)
        setDirty(false)
      } else {
        setError('This file type cannot be edited as text.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load file')
    } finally {
      setLoading(false)
    }
  }, [filePath])

  useEffect(() => { loadFile() }, [loadFile])

  const handleSave = useCallback(async () => {
    if (content === null) return
    setSaving(true)
    setError(null)
    try {
      const token = useAuthStore.getState().token
      const blob = new Blob([content], { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', blob, fileName)
      const parentPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.'
      await fetch(`/api/files/upload?path=${encodeURIComponent(parentPath)}`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      setOriginalContent(content)
      setDirty(false)
      if (windowId) {
        useWindowStore.getState().updateWindow(windowId, { title: fileName })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [content, fileName, filePath, windowId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // Register before-close guard
  useEffect(() => {
    if (!windowId) return
    registerBeforeClose(windowId, () => {
      const currentDirty = useWindowStore.getState().windows
        .find((w) => w.id === windowId)?.title.startsWith('● ')
      if (!currentDirty) return true
      return new Promise<boolean>((resolve) => {
        closeResolveRef.current = resolve
        setShowCloseModal(true)
      })
    })
    return () => { unregisterBeforeClose(windowId) }
  }, [windowId])

  const handleCloseDiscard = () => {
    setShowCloseModal(false)
    closeResolveRef.current?.(true)
    closeResolveRef.current = null
  }

  const handleCloseSave = async () => {
    await handleSave()
    setShowCloseModal(false)
    closeResolveRef.current?.(true)
    closeResolveRef.current = null
  }

  const handleCloseCancel = () => {
    setShowCloseModal(false)
    closeResolveRef.current?.(false)
    closeResolveRef.current = null
  }

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.focus()
  }

  // Bridge on-screen keyboard input into Monaco via its trigger API.
  // The OSK fires a cancelable nasos:osk-input event; if we handle it
  // here we call preventDefault() so the OSK skips its generic DOM path.
  useEffect(() => {
    const handler = (e: Event) => {
      const editor = editorRef.current
      if (!editor || !editor.hasTextFocus()) return

      const { key } = (e as CustomEvent).detail as { key: string }
      e.preventDefault()

      if (key === 'Backspace') {
        editor.trigger('osk', 'deleteLeft', {})
      } else if (key === 'Enter') {
        editor.trigger('osk', 'type', { text: '\n' })
      } else if (key === 'Tab') {
        editor.trigger('osk', 'tab', {})
      } else if (key === 'Space') {
        editor.trigger('osk', 'type', { text: ' ' })
      } else {
        editor.trigger('osk', 'type', { text: key })
      }
    }
    window.addEventListener('nasos:osk-input', handler)
    return () => window.removeEventListener('nasos:osk-input', handler)
  }, [])

  const handleChange = (value: string | undefined) => {
    setContent(value ?? '')
    setDirty(value !== originalContent)
    if (windowId) {
      const prefix = value !== originalContent ? '● ' : ''
      useWindowStore.getState().updateWindow(windowId, { title: `${prefix}${fileName}` })
    }
  }

  if (loading) {
    return (
      <div className="text-editor">
        <div className="te-loading">Loading...</div>
      </div>
    )
  }

  if (error && content === null) {
    return (
      <div className="text-editor">
        <div className="te-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="text-editor">
      <div className="te-toolbar">
        <span className="te-filename">{fileName}</span>
        {dirty && <span className="te-dirty-badge">Modified</span>}
        <div className="te-toolbar-spacer" />
        {error && <span className="te-save-error">{error}</span>}
        <button className="fm-btn" onClick={loadFile} title="Revert">
          <RotateCcw size={14} />
        </button>
        <button className="fm-btn te-save-btn" onClick={handleSave} disabled={!dirty || saving}
          title="Save (⌘S)">
          <Save size={14} />
          <span>{saving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>
      <div className="te-editor-wrap">
        <Editor
          height="100%"
          language={language}
          value={content ?? ''}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="nasos-dark"
          options={{
            fontSize: 13,
            minimap: { enabled: true },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8 },
          }}
        />
      </div>

      {showCloseModal && (
        <div className="te-close-modal-overlay">
          <div className="te-close-modal">
            <div className="te-close-modal-title">Unsaved Changes</div>
            <p className="te-close-modal-msg">
              <strong>{fileName}</strong> has unsaved changes. What would you like to do?
            </p>
            <div className="te-close-modal-actions">
              <button className="te-close-modal-btn te-close-modal-btn--discard" onClick={handleCloseDiscard}>
                Don't Save
              </button>
              <button className="te-close-modal-btn te-close-modal-btn--cancel" onClick={handleCloseCancel}>
                Cancel
              </button>
              <button className="te-close-modal-btn te-close-modal-btn--save" onClick={handleCloseSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
