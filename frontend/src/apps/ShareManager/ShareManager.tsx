import { useCallback, useEffect, useState } from 'react'
import { api } from '../../hooks/useApi'
import { useSystemStore } from '../../store/systemStore'

interface Share {
  id: number
  name: string
  path: string
  protocol: string
  enabled: boolean
  read_only: boolean
  guest_access: boolean
  description: string
  allowed_users: string[]
  allowed_hosts: string[]
  created_at: string | null
  updated_at: string | null
}

interface ShareForm {
  name: string
  path: string
  protocol: string
  read_only: boolean
  guest_access: boolean
  description: string
  allowed_users: string
  allowed_hosts: string
}

const emptyForm: ShareForm = {
  name: '',
  path: '',
  protocol: 'smb',
  read_only: false,
  guest_access: false,
  description: '',
  allowed_users: '',
  allowed_hosts: '',
}

const PROTOCOL_LABELS: Record<string, string> = {
  smb: 'SMB/CIFS',
  nfs: 'NFS',
  webdav: 'WebDAV',
}

const PROTOCOL_COLORS: Record<string, string> = {
  smb: '#4fc3f7',
  nfs: '#81c784',
  webdav: '#ffb74d',
}

function buildConnectionPath(protocol: string, shareName: string, sharePath: string): string {
  if (protocol === 'smb') return `\\\\nasos.local\\${shareName}`
  if (protocol === 'nfs') return `nasos.local:${sharePath}`
  if (protocol === 'webdav') return `http://nasos.local:8080/webdav/${shareName}`
  return `nasos.local/${shareName}`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available
    }
  }
  return (
    <button className="shr-copy-btn" onClick={handleCopy} title="Copy path">
      {copied ? '✓' : '⎘'}
    </button>
  )
}


export function ShareManager() {
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ShareForm>(emptyForm)
  const [error, setError] = useState('')

  const loadShares = useCallback(async () => {
    try {
      const data = await api<{ shares: Share[] }>('/api/shares')
      setShares(data.shares)
    } catch {
      // Shares API not available
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadShares()
  }, [loadShares])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowWizard(true)
  }

  const openEdit = (share: Share) => {
    setForm({
      name: share.name,
      path: share.path,
      protocol: share.protocol,
      read_only: share.read_only,
      guest_access: share.guest_access,
      description: share.description,
      allowed_users: share.allowed_users.join(','),
      allowed_hosts: share.allowed_hosts.join(','),
    })
    setEditingId(share.id)
    setError('')
    setShowWizard(true)
  }

  const notify = useSystemStore((s) => s.addNotification)

  const handleSave = async () => {
    if (!form.name.trim() || !form.path.trim()) {
      setError('Name and path are required')
      return
    }

    try {
      if (editingId) {
        await api(`/api/shares/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
        notify('Share Updated', `"${form.name}" has been updated`, 'success')
      } else {
        await api('/api/shares', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        notify('Share Created', `"${form.name}" (${PROTOCOL_LABELS[form.protocol]}) is now available`, 'success')
      }
      setShowWizard(false)
      loadShares()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save'
      setError(msg)
      notify('Share Error', msg, 'error')
    }
  }

  const handleDelete = async (id: number) => {
    const share = shares.find((s) => s.id === id)
    try {
      await api(`/api/shares/${id}`, { method: 'DELETE' })
      notify('Share Deleted', `"${share?.name || 'Share'}" has been removed`, 'info')
      loadShares()
    } catch {
      notify('Share Error', 'Failed to delete share', 'error')
    }
  }

  const handleToggle = async (id: number) => {
    const share = shares.find((s) => s.id === id)
    try {
      await api(`/api/shares/${id}/toggle`, { method: 'POST' })
      const action = share?.enabled ? 'disabled' : 'enabled'
      notify('Share Toggled', `"${share?.name || 'Share'}" has been ${action}`, 'info')
      loadShares()
    } catch {
      notify('Share Error', 'Failed to toggle share', 'error')
    }
  }

  if (loading) {
    return <div className="shr-loading">Loading shares...</div>
  }

  return (
    <div className="shr-root">
      {/* Connection guide banner */}
      <div className="shr-connect-guide">
        <div className="shr-connect-guide-title">📡 How to Connect</div>
        <div className="shr-connect-guide-rows">
          <div className="shr-connect-guide-row">
            <span className="shr-connect-guide-label">Guest / no password:</span>
            <span>Connect to the share path below and choose <em>Guest</em> when prompted</span>
          </div>
          <div className="shr-connect-guide-row">
            <span className="shr-connect-guide-label">Dashboard login:</span>
            <span>Go to <strong>Settings → Users → Set Password</strong> to activate your SMB credentials first, then connect with your username and that password</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shr-toolbar">
        <button className="shr-btn shr-btn-primary" onClick={openCreate}>
          + New Share
        </button>
        <button className="shr-btn" onClick={loadShares}>
          ↻ Refresh
        </button>
        <div className="shr-toolbar-info">
          {shares.length} share{shares.length !== 1 ? 's' : ''} configured
        </div>
      </div>

      {/* Share list */}
      {shares.length === 0 ? (
        <div className="shr-empty">
          <div className="shr-empty-icon">🔗</div>
          <div className="shr-empty-title">No Shares Configured</div>
          <div className="shr-empty-text">
            Create your first network share to make files accessible over SMB, NFS, or WebDAV.
          </div>
          <button className="shr-btn shr-btn-primary" onClick={openCreate}>
            Create First Share
          </button>
        </div>
      ) : (
        <div className="shr-list">
          {shares.map((share) => (
            <div
              key={share.id}
              className={`shr-card ${!share.enabled ? 'shr-card-disabled' : ''}`}
            >
              <div className="shr-card-header">
                <div className="shr-card-title">
                  <span className="shr-card-icon">📂</span>
                  <span className="shr-card-name">{share.name}</span>
                  <span
                    className="shr-protocol-badge"
                    style={{ background: PROTOCOL_COLORS[share.protocol] || '#888' }}
                  >
                    {PROTOCOL_LABELS[share.protocol] || share.protocol}
                  </span>
                  {!share.enabled && <span className="shr-disabled-badge">Disabled</span>}
                </div>
                <div className="shr-card-actions">
                  <button
                    className="shr-btn-icon"
                    title={share.enabled ? 'Disable' : 'Enable'}
                    onClick={() => handleToggle(share.id)}
                  >
                    {share.enabled ? '⏸' : '▶'}
                  </button>
                  <button
                    className="shr-btn-icon"
                    title="Edit"
                    onClick={() => openEdit(share)}
                  >
                    ✏️
                  </button>
                  <button
                    className="shr-btn-icon shr-btn-danger"
                    title="Delete"
                    onClick={() => handleDelete(share.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
              <div className="shr-card-body">
                <div className="shr-card-path">{share.path}</div>
                {share.enabled && (
                  <div className="shr-card-connect">
                    <span className="shr-connect-label">Connect:</span>
                    <code className="shr-connect-path">{buildConnectionPath(share.protocol, share.name, share.path)}</code>
                    <CopyButton text={buildConnectionPath(share.protocol, share.name, share.path)} />
                  </div>
                )}
                {share.description && (
                  <div className="shr-card-desc">{share.description}</div>
                )}
                <div className="shr-card-meta">
                  {share.read_only && <span className="shr-meta-tag">Read Only</span>}
                  {share.guest_access && <span className="shr-meta-tag">Guest Access</span>}
                  {share.allowed_users.length > 0 && (
                    <span className="shr-meta-tag">
                      👤 {share.allowed_users.length} user{share.allowed_users.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Wizard overlay */}
      {showWizard && (
        <div className="shr-overlay" onClick={() => setShowWizard(false)}>
          <div className="shr-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="shr-wizard-header">
              <h3>{editingId ? 'Edit Share' : 'Create New Share'}</h3>
              <button className="shr-btn-icon" onClick={() => setShowWizard(false)}>
                ✕
              </button>
            </div>

            {error && <div className="shr-wizard-error">{error}</div>}

            <div className="shr-wizard-body">
              <label className="shr-field">
                <span>Share Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Media, Backups, Documents"
                />
              </label>

              <label className="shr-field">
                <span>Path</span>
                <input
                  type="text"
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  placeholder="/mnt/data/shared/media"
                />
              </label>

              <label className="shr-field">
                <span>Protocol</span>
                <div className="shr-protocol-select">
                  {(['smb', 'nfs', 'webdav'] as const).map((p) => (
                    <button
                      key={p}
                      className={`shr-protocol-opt ${form.protocol === p ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, protocol: p })}
                    >
                      {PROTOCOL_LABELS[p]}
                    </button>
                  ))}
                </div>
              </label>

              <label className="shr-field">
                <span>Description</span>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description"
                />
              </label>

              <div className="shr-field-row">
                <label className="shr-checkbox">
                  <input
                    type="checkbox"
                    checked={form.read_only}
                    onChange={(e) => setForm({ ...form, read_only: e.target.checked })}
                  />
                  <span>Read Only</span>
                </label>
                <label className="shr-checkbox">
                  <input
                    type="checkbox"
                    checked={form.guest_access}
                    onChange={(e) => setForm({ ...form, guest_access: e.target.checked })}
                  />
                  <span>Guest Access</span>
                </label>
              </div>

              {form.protocol === 'smb' && (
                <label className="shr-field">
                  <span>Allowed Users (comma-separated)</span>
                  <input
                    type="text"
                    value={form.allowed_users}
                    onChange={(e) => setForm({ ...form, allowed_users: e.target.value })}
                    placeholder="user1,user2 (blank = all users)"
                  />
                </label>
              )}

              {form.protocol === 'nfs' && (
                <label className="shr-field">
                  <span>Allowed Hosts (comma-separated)</span>
                  <input
                    type="text"
                    value={form.allowed_hosts}
                    onChange={(e) => setForm({ ...form, allowed_hosts: e.target.value })}
                    placeholder="192.168.1.0/24,10.0.0.0/8 (blank = all)"
                  />
                </label>
              )}
            </div>

            <div className="shr-wizard-footer">
              <button className="shr-btn" onClick={() => setShowWizard(false)}>
                Cancel
              </button>
              <button className="shr-btn shr-btn-primary" onClick={handleSave}>
                {editingId ? 'Save Changes' : 'Create Share'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
