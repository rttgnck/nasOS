const { app, BrowserWindow, session } = require('electron')
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

  // Prevent navigation to external URLs
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(BACKEND_URL)) {
      event.preventDefault()
    }
  })

  return win
}

app.whenReady().then(() => {
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
