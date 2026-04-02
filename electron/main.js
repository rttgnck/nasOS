const { app, BrowserWindow, powerSaveBlocker, session } = require('electron')
const path = require('path')

const isDev = process.argv.includes('--dev')

// Backend URL
const BACKEND_URL = isDev ? 'http://localhost:5173' : 'http://localhost:8080'

// Display dimensions detected by cage-session.sh via wlr-randr.
// Falls back to 800x480 (common DSI size) rather than 1280x800 to
// avoid creating a window larger than the physical display.
const displayWidth = parseInt(process.env.NASOS_DISPLAY_WIDTH) || 800
const displayHeight = parseInt(process.env.NASOS_DISPLAY_HEIGHT) || 480

function createWindow() {
  const win = new BrowserWindow({
    width: isDev ? 1280 : displayWidth,
    height: isDev ? 800 : displayHeight,
    minWidth: 480,
    minHeight: 320,
    frame: isDev,
    autoHideMenuBar: true,
    backgroundColor: '#0f0c29',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Cage is a kiosk compositor that fullscreens its child window
  // automatically. We don't set fullscreen/kiosk in BrowserWindow
  // options because the X11 fullscreen hint via XWayland can conflict
  // with Cage's own fullscreening on DSI displays.
  if (!isDev) win.maximize()

  win.loadURL(BACKEND_URL)

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  win.webContents.on('did-fail-load', () => {
    console.log('Failed to load, retrying in 2 seconds...')
    setTimeout(() => win.loadURL(BACKEND_URL), 2000)
  })

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

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(BACKEND_URL)) {
      event.preventDefault()
    }
  })

  return win
}

app.whenReady().then(() => {
  powerSaveBlocker.start('prevent-display-sleep')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          " connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:*;" +
          " script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline';" +
          " style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline';" +
          " font-src 'self' https://cdn.jsdelivr.net data:;" +
          " img-src 'self' data: blob: http://localhost:*;" +
          " media-src 'self' blob: http://localhost:*;" +
          " worker-src 'self' blob: https://cdn.jsdelivr.net;"
        ],
      },
    })
  })

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

if (process.env.NASOS_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration()
}
