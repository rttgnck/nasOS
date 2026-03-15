import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Suppress EPIPE errors from WebSocket disconnects (harmless in dev)
function suppressWsErrors(): PluginOption {
  return {
    name: 'suppress-ws-errors',
    configureServer(server) {
      server.ws.on('connection', (socket) => {
        socket.on('error', () => {})
      })
      server.httpServer?.on('upgrade', (_req, socket) => {
        socket.on('error', () => {})
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), suppressWsErrors()],
  base: mode === 'demo' ? '/nasOS/' : '/',
  build: {
    ...(mode === 'demo' ? { outDir: '../dist-demo' } : {}),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        configure: (proxy) => {
          proxy.on('error', () => {})
        },
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {})
        },
      },
    },
  },
}))
