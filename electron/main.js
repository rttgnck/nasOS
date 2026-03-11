const { app, BrowserWindow, powerSaveBlocker, session } = require('electron')
const path = require('path')

const isDev = process.argv.includes('--dev')

// Backend URL
const BACKEND_URL = isDev ? 'http://localhost:5173' : 'http://localhost:8080'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    fullscreen: !isDev,
    frame: isDev, // No frame in production (acts as the entire desktop)
    autoHideMenuBar: true,
    backgroundColor: '#0f0c29',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadURL(BACKEND_URL)

  // Open devtools in dev mode
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // Handle load failures (backend not ready yet)
  win.webContents.on('did-fail-load', () => {
    console.log('Failed to load, retrying in 2 seconds...')
    setTimeout(() => win.loadURL(BACKEND_URL), 2000)
  })

  // Auto-reload if the renderer process crashes (GPU OOM, JS exception, etc.)
  // This prevents the screen from staying blank after a renderer crash.
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details.reason, '— reloading in 3s')
    setTimeout(() => {
      if (!win.isDestroyed()) win.loadURL(BACKEND_URL)
    }, 3000)
  })

  win.webContents.on('unresponsive', () => {
    console.warn('Renderer unresponsive — forcing reload in 5s')
    setTimeout(() => {
      if (!win.isDestroyed() && !win.webContents.isLoading()) {
        win.webContents.reload()
      }
    }, 5000)
  })

  // Prevent navigation to external URLs
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(BACKEND_URL)) {
      event.preventDefault()
    }
  })

  return win
}

app.whenReady().then(() => {
  // Prevent the display from sleeping / going blank while nasOS is running.
  // This stops DPMS blanking that cage/wlroots triggers after idle time.
  powerSaveBlocker.start('prevent-display-sleep')

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Disable hardware acceleration if running on Pi without GPU driver
if (process.env.NASOS_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration()
}
