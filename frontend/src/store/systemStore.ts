import { create } from 'zustand'

interface SystemMetrics {
  cpuPercent: number
  memoryPercent: number
  memoryUsed: number
  memoryTotal: number
  temperature: number | null
  netSentPerSec: number
  netRecvPerSec: number
}

interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  timestamp: number
  read: boolean
}

interface MetricsHistory {
  cpu: number[]
  memory: number[]
  netSent: number[]
  netRecv: number[]
  temp: number[]
}

const HISTORY_SIZE = 60 // 60 data points ≈ 60 seconds at 1s interval

interface SystemStore {
  metrics: SystemMetrics
  history: MetricsHistory
  notifications: Notification[]
  isConnected: boolean

  updateMetrics: (metrics: SystemMetrics) => void
  setConnected: (connected: boolean) => void
  addNotification: (title: string, message: string, type: Notification['type']) => void
  markRead: (id: string) => void
  clearNotifications: () => void
}

let notifCounter = 0

export const useSystemStore = create<SystemStore>((set) => ({
  metrics: {
    cpuPercent: 0,
    memoryPercent: 0,
    memoryUsed: 0,
    memoryTotal: 0,
    temperature: null,
    netSentPerSec: 0,
    netRecvPerSec: 0,
  },
  history: {
    cpu: [],
    memory: [],
    netSent: [],
    netRecv: [],
    temp: [],
  },
  notifications: [],
  isConnected: false,

  updateMetrics: (metrics) =>
    set((state) => {
      const push = (arr: number[], val: number) => {
        const next = [...arr, val]
        return next.length > HISTORY_SIZE ? next.slice(-HISTORY_SIZE) : next
      }
      return {
        metrics,
        history: {
          cpu: push(state.history.cpu, metrics.cpuPercent),
          memory: push(state.history.memory, metrics.memoryPercent),
          netSent: push(state.history.netSent, metrics.netSentPerSec),
          netRecv: push(state.history.netRecv, metrics.netRecvPerSec),
          temp: push(state.history.temp, metrics.temperature ?? 0),
        },
      }
    }),

  setConnected: (connected) => set({ isConnected: connected }),

  addNotification: (title, message, type) => {
    const id = `notif-${++notifCounter}`
    set((state) => ({
      notifications: [
        { id, title, message, type, timestamp: Date.now(), read: false },
        ...state.notifications,
      ].slice(0, 50), // Keep last 50
    }))
  },

  markRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
  },

  clearNotifications: () => set({ notifications: [] }),
}))
