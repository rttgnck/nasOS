import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { Save, RotateCcw } from 'lucide-react'
import { api } from '../../hooks/useApi'
import { useAuthStore } from '../../store/authStore'
import { useWindowStore } from '../../store/windowStore'

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
  const editorRef = useRef<any>(null)

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

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.focus()
  }

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
          theme="vs-dark"
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
    </div>
  )
}
