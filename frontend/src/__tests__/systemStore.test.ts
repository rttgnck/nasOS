import { describe, it, expect, beforeEach } from 'vitest'
import { useSystemStore } from '../store/systemStore'

beforeEach(() => {
  useSystemStore.setState({
    metrics: {
      cpuPercent: 0,
      memoryPercent: 0,
      memoryUsed: 0,
      memoryTotal: 0,
      temperature: null,
      netSentPerSec: 0,
      netRecvPerSec: 0,
    },
    history: { cpu: [], memory: [], netSent: [], netRecv: [], temp: [] },
    notifications: [],
    isConnected: false,
  })
})

describe('systemStore', () => {
  it('updates metrics and builds history', () => {
    const metrics = {
      cpuPercent: 42,
      memoryPercent: 65,
      memoryUsed: 4_000_000_000,
      memoryTotal: 8_000_000_000,
      temperature: 55,
      netSentPerSec: 1024,
      netRecvPerSec: 2048,
    }

    useSystemStore.getState().updateMetrics(metrics)

    const state = useSystemStore.getState()
    expect(state.metrics.cpuPercent).toBe(42)
    expect(state.metrics.temperature).toBe(55)
    expect(state.history.cpu).toEqual([42])
    expect(state.history.memory).toEqual([65])
    expect(state.history.temp).toEqual([55])
  })

  it('caps history at 60 entries', () => {
    const makeMetrics = (cpu: number) => ({
      cpuPercent: cpu,
      memoryPercent: 50,
      memoryUsed: 4_000_000_000,
      memoryTotal: 8_000_000_000,
      temperature: 50,
      netSentPerSec: 0,
      netRecvPerSec: 0,
    })

    // Push 65 data points
    for (let i = 0; i < 65; i++) {
      useSystemStore.getState().updateMetrics(makeMetrics(i))
    }

    const history = useSystemStore.getState().history
    expect(history.cpu).toHaveLength(60)
    // Should contain the last 60 values (5..64)
    expect(history.cpu[0]).toBe(5)
    expect(history.cpu[59]).toBe(64)
  })

  it('adds a notification', () => {
    useSystemStore.getState().addNotification('Test', 'Hello world', 'info')

    const notifs = useSystemStore.getState().notifications
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.title).toBe('Test')
    expect(notifs[0]!.message).toBe('Hello world')
    expect(notifs[0]!.type).toBe('info')
    expect(notifs[0]!.read).toBe(false)
  })

  it('marks a notification as read', () => {
    useSystemStore.getState().addNotification('Alert', 'Disk full', 'warning')
    const id = useSystemStore.getState().notifications[0]!.id

    useSystemStore.getState().markRead(id)

    const notif = useSystemStore.getState().notifications.find((n) => n.id === id)
    expect(notif!.read).toBe(true)
  })

  it('clears all notifications', () => {
    useSystemStore.getState().addNotification('A', 'msg', 'info')
    useSystemStore.getState().addNotification('B', 'msg', 'error')
    expect(useSystemStore.getState().notifications).toHaveLength(2)

    useSystemStore.getState().clearNotifications()
    expect(useSystemStore.getState().notifications).toHaveLength(0)
  })

  it('sets connection status', () => {
    expect(useSystemStore.getState().isConnected).toBe(false)

    useSystemStore.getState().setConnected(true)
    expect(useSystemStore.getState().isConnected).toBe(true)

    useSystemStore.getState().setConnected(false)
    expect(useSystemStore.getState().isConnected).toBe(false)
  })

  it('handles null temperature in history', () => {
    const metrics = {
      cpuPercent: 10,
      memoryPercent: 20,
      memoryUsed: 1_000_000_000,
      memoryTotal: 4_000_000_000,
      temperature: null,
      netSentPerSec: 0,
      netRecvPerSec: 0,
    }

    useSystemStore.getState().updateMetrics(metrics)
    // null temperature should be stored as 0 in history
    expect(useSystemStore.getState().history.temp).toEqual([0])
  })
})
