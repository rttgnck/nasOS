import { create } from 'zustand'

export interface UploadItem {
  id: string
  fileName: string
  fileSize: number
  loadedBytes: number
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled'
  speed: number
  error?: string
  /** Internal: XHR ref for cancellation */
  xhr?: XMLHttpRequest
  /** Timestamp when upload started (for speed calc) */
  startedAt?: number
  /** Last progress timestamp */
  lastProgressAt?: number
  /** Loaded bytes at last speed sample */
  lastProgressBytes?: number
}

interface UploadStore {
  uploads: UploadItem[]
  showModal: boolean

  addUpload: (item: UploadItem) => void
  updateUpload: (id: string, patch: Partial<UploadItem>) => void
  removeUpload: (id: string) => void
  cancelUpload: (id: string) => void
  cancelAll: () => void
  dismissCompleted: () => void
  setShowModal: (show: boolean) => void
  clearAll: () => void
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploads: [],
  showModal: false,

  addUpload: (item) =>
    set((s) => ({ uploads: [...s.uploads, item], showModal: true })),

  updateUpload: (id, patch) =>
    set((s) => ({
      uploads: s.uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    })),

  removeUpload: (id) =>
    set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),

  cancelUpload: (id) => {
    const item = get().uploads.find((u) => u.id === id)
    if (item?.xhr && (item.status === 'pending' || item.status === 'uploading')) {
      item.xhr.abort()
    }
    set((s) => ({
      uploads: s.uploads.map((u) =>
        u.id === id && (u.status === 'pending' || u.status === 'uploading')
          ? { ...u, status: 'cancelled' as const }
          : u
      ),
    }))
  },

  cancelAll: () => {
    const { uploads } = get()
    uploads.forEach((u) => {
      if (u.xhr && (u.status === 'pending' || u.status === 'uploading')) {
        u.xhr.abort()
      }
    })
    set((s) => ({
      uploads: s.uploads.map((u) =>
        u.status === 'pending' || u.status === 'uploading'
          ? { ...u, status: 'cancelled' as const }
          : u
      ),
    }))
  },

  dismissCompleted: () =>
    set((s) => ({
      uploads: s.uploads.filter(
        (u) => u.status === 'pending' || u.status === 'uploading'
      ),
    })),

  clearAll: () => {
    get().cancelAll()
    set({ uploads: [], showModal: false })
  },

  setShowModal: (show) => set({ showModal: show }),
}))

export const selectActiveUploads = (uploads: UploadItem[]) =>
  uploads.filter((u) => u.status === 'pending' || u.status === 'uploading')

export const selectFinishedUploads = (uploads: UploadItem[]) =>
  uploads.filter(
    (u) => u.status === 'completed' || u.status === 'failed' || u.status === 'cancelled'
  )
