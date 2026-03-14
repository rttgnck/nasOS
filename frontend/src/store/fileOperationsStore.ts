import { create } from 'zustand'

export interface FileOpProgress {
  id: string
  user: string
  op_type: 'copy' | 'move' | 'delete'
  status: 'pending' | 'running' | 'paused' | 'conflict' | 'completed' | 'failed' | 'cancelled'
  sources: string[]
  destination: string
  total_files: number
  total_bytes: number
  completed_files: number
  completed_bytes: number
  current_file: string | null
  speed_bps: number
  error_message: string | null
  conflict: {
    file: string
    path: string
    existing_size: number
    existing_modified: number
  } | null
  created_at: string | null
  updated_at: string | null
}

interface FileOperationsStore {
  operations: FileOpProgress[]
  showModal: boolean
  /** Operation IDs dismissed by user (completed ops that were closed) */
  dismissed: Set<string>

  setOperations: (ops: FileOpProgress[]) => void
  upsertOperation: (op: FileOpProgress) => void
  removeOperation: (id: string) => void
  dismissOperation: (id: string) => void
  setShowModal: (show: boolean) => void
}

export const useFileOperationsStore = create<FileOperationsStore>((set) => ({
  operations: [],
  showModal: false,
  dismissed: new Set(),

  setOperations: (ops) => set({ operations: ops }),

  upsertOperation: (op) =>
    set((state) => {
      const idx = state.operations.findIndex((o) => o.id === op.id)
      if (idx >= 0) {
        const next = [...state.operations]
        next[idx] = op
        return { operations: next }
      }
      return { operations: [...state.operations, op] }
    }),

  removeOperation: (id) =>
    set((state) => ({
      operations: state.operations.filter((o) => o.id !== id),
    })),

  dismissOperation: (id) =>
    set((state) => {
      const next = new Set(state.dismissed)
      next.add(id)
      return {
        dismissed: next,
        operations: state.operations.filter((o) => o.id !== id),
      }
    }),

  setShowModal: (show) => set({ showModal: show }),
}))

// Derived selectors
export const selectActiveOps = (state: { operations: FileOpProgress[] }) =>
  state.operations.filter((o) => o.status === 'running' || o.status === 'pending' || o.status === 'conflict')

export const selectCompletedOps = (state: { operations: FileOpProgress[] }) =>
  state.operations.filter((o) => o.status === 'completed' || o.status === 'failed' || o.status === 'cancelled')
