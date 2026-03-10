import { create } from 'zustand'

interface ClipboardItem {
  path: string
  name: string
  is_dir: boolean
}

interface FileStore {
  clipboard: ClipboardItem[]
  clipboardOp: 'copy' | 'cut' | null

  setClipboard: (items: ClipboardItem[], op: 'copy' | 'cut') => void
  clearClipboard: () => void
}

export const useFileStore = create<FileStore>((set) => ({
  clipboard: [],
  clipboardOp: null,

  setClipboard: (items, op) => set({ clipboard: items, clipboardOp: op }),
  clearClipboard: () => set({ clipboard: [], clipboardOp: null }),
}))
