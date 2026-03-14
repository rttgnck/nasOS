import { create } from 'zustand'

export interface ClipboardItem {
  path: string
  name: string
  is_dir: boolean
}

interface FileStore {
  clipboard: ClipboardItem[]
  clipboardOp: 'copy' | 'cut' | null
  /** Source window ID for cross-window paste */
  clipboardSourceWindow: string | null

  setClipboard: (items: ClipboardItem[], op: 'copy' | 'cut', windowId?: string) => void
  clearClipboard: () => void
}

export const useFileStore = create<FileStore>((set) => ({
  clipboard: [],
  clipboardOp: null,
  clipboardSourceWindow: null,

  setClipboard: (items, op, windowId) =>
    set({ clipboard: items, clipboardOp: op, clipboardSourceWindow: windowId ?? null }),
  clearClipboard: () =>
    set({ clipboard: [], clipboardOp: null, clipboardSourceWindow: null }),
}))
