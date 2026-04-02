const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
} = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_HOSTNAME = 'nasos.local';
const DEFAULT_PORT = 8080;
const CHECK_INTERVAL_MS = 30_000;
const BOUNDS_SAVE_DEBOUNCE_MS = 500;

// ── Config persistence ───────────────────────────────────────────────────────

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

const DEFAULT_CONFIG = {
  hostname: DEFAULT_HOSTNAME,
  ip: '',
  port: DEFAULT_PORT,
  autoLaunch: true,
  activeTarget: 'hostname',
  windowBounds: { width: 1280, height: 800, isMaximized: true },
};

function loadConfig() {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
    return { ...DEFAULT_CONFIG, ...stored, windowBounds: { ...DEFAULT_CONFIG.windowBounds, ...stored.windowBounds } };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

let config = { ...DEFAULT_CONFIG };

// ── Single instance lock ─────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ── Dock icon ────────────────────────────────────────────────────────────────

if (app.dock) {
  const dockIcon = path.join(__dirname, '..', 'assets', 'icon.png');
  if (fs.existsSync(dockIcon)) app.dock.setIcon(dockIcon);
}

// ── State ────────────────────────────────────────────────────────────────────

let tray = null;
let mainWindow = null;
let settingsWindow = null;
let hostnameOnline = false;
let ipOnline = false;
let statusTimer = null;
let boundsSaveTimer = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function urlFor(host, port) {
  return `http://${host}:${port}`;
}

function activeUrl() {
  if (config.activeTarget === 'ip' && config.ip) {
    return urlFor(config.ip, config.port);
  }
  return urlFor(config.hostname, config.port);
}

function checkHost(host, port) {
  return new Promise((resolve) => {
    if (!host) return resolve(false);
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

// ── Tray icon loading ────────────────────────────────────────────────────────

function loadTrayIcon() {
  const iconPath = path.join(__dirname, '..', 'assets', 'trayIconTemplate.png');
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createEmpty();
}

// ── Window bounds persistence ────────────────────────────────────────────────

function persistBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMaximized = mainWindow.isMaximized();
    if (!isMaximized) {
      const [width, height] = mainWindow.getSize();
      const [x, y] = mainWindow.getPosition();
      config.windowBounds = { width, height, x, y, isMaximized: false };
    } else {
      config.windowBounds = { ...config.windowBounds, isMaximized: true };
    }
    saveConfig(config);
  }, BOUNDS_SAVE_DEBOUNCE_MS);
}

// ── Main window (nasOS desktop) ──────────────────────────────────────────────

function openMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const { width, height, x, y, isMaximized } = config.windowBounds;
  const opts = {
    width: width || 1280,
    height: height || 800,
    minWidth: 800,
    minHeight: 600,
    title: 'nasOS',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0f0c29',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  };
  if (!isMaximized && x !== undefined && y !== undefined) {
    opts.x = x;
    opts.y = y;
  }

  mainWindow = new BrowserWindow(opts);
  if (isMaximized) mainWindow.maximize();
  mainWindow.loadURL(activeUrl());

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`Failed to load nasOS (${code}): ${desc}`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(activeUrl());
      }
    }, 3000);
  });

  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);
  mainWindow.on('maximize', persistBounds);
  mainWindow.on('unmaximize', persistBounds);

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function connectTo(target) {
  config.activeTarget = target;
  saveConfig(config);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(activeUrl());
    mainWindow.show();
    mainWindow.focus();
  } else {
    openMainWindow();
  }
}

// ── Settings window ──────────────────────────────────────────────────────────

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'nasOS Connect \u2014 Settings',
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'settings-preload.js'),
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ── IPC handlers (settings) ──────────────────────────────────────────────────

ipcMain.handle('get-config', () => ({
  hostname: config.hostname,
  ip: config.ip,
  port: config.port,
}));

ipcMain.handle('save-config', (_e, { hostname, ip, port }) => {
  config.hostname = (hostname || '').trim() || DEFAULT_HOSTNAME;
  config.ip = (ip || '').trim();
  config.port = parseInt(port, 10) || DEFAULT_PORT;
  saveConfig(config);
  refreshStatus();
  return { hostname: config.hostname, ip: config.ip, port: config.port };
});

ipcMain.on('close-settings', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});

// ── Auto-launch ──────────────────────────────────────────────────────────────

function applyAutoLaunch() {
  app.setLoginItemSettings({ openAtLogin: config.autoLaunch, openAsHidden: true });
}

function toggleAutoLaunch() {
  config.autoLaunch = !config.autoLaunch;
  saveConfig(config);
  applyAutoLaunch();
  buildTrayMenu();
}

// ── Tray menu ────────────────────────────────────────────────────────────────

function statusDot(online) {
  return online ? '\u25CF' : '\u25CB';
}

function buildTrayMenu() {
  if (!tray) return;

  const anyOnline = hostnameOnline || ipOnline;
  const statusLabel = anyOnline ? '\u25CF  Connected' : '\u25CB  Offline';

  const hostnameLabel = `${config.hostname}:${config.port}`;
  const items = [
    { label: 'nasOS Connect', enabled: false },
    { type: 'separator' },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: `${statusDot(hostnameOnline)}  ${hostnameLabel}`,
      enabled: hostnameOnline,
      click: () => connectTo('hostname'),
    },
  ];

  if (config.ip) {
    const ipLabel = `${config.ip}:${config.port}`;
    items.push({
      label: `${statusDot(ipOnline)}  ${ipLabel}`,
      enabled: ipOnline,
      click: () => connectTo('ip'),
    });
  }

  items.push(
    { type: 'separator' },
    {
      label: 'Open in Browser',
      enabled: anyOnline,
      click: () => shell.openExternal(activeUrl()),
    },
    { type: 'separator' },
    { label: 'Connection Settings\u2026', click: openSettings },
    { label: 'Start at Login', type: 'checkbox', checked: config.autoLaunch, click: toggleAutoLaunch },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { app.isQuitting = true; app.quit(); } },
  );

  const menu = Menu.buildFromTemplate(items);

  // Don't auto-attach context menu — we handle click vs right-click ourselves
  tray.removeAllListeners('right-click');
  tray.on('right-click', () => tray.popUpContextMenu(menu));

  // Store for right-click popup
  tray._menu = menu;

  const anyHost = hostnameOnline ? config.hostname : config.ip || config.hostname;
  tray.setToolTip(anyOnline ? `nasOS \u2014 ${anyHost}` : 'nasOS \u2014 Offline');
}

// ── Status polling ───────────────────────────────────────────────────────────

async function refreshStatus() {
  const [hStatus, iStatus] = await Promise.all([
    checkHost(config.hostname, config.port),
    config.ip ? checkHost(config.ip, config.port) : Promise.resolve(false),
  ]);
  const changed = hStatus !== hostnameOnline || iStatus !== ipOnline;
  hostnameOnline = hStatus;
  ipOnline = iStatus;
  if (changed) buildTrayMenu();
}

function startStatusPolling() {
  refreshStatus();
  statusTimer = setInterval(refreshStatus, CHECK_INTERVAL_MS);
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  config = loadConfig();

  const icon = loadTrayIcon();
  tray = new Tray(icon);
  if (icon.isEmpty()) tray.setTitle('nOS');

  buildTrayMenu();
  applyAutoLaunch();
  startStatusPolling();

  // Left-click tray icon → show/focus main window
  tray.on('click', () => openMainWindow());
});

app.on('activate', () => {
  // Dock icon click when all windows are hidden
  openMainWindow();
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    openMainWindow();
  }
});

app.on('window-all-closed', () => {
  // Tray app stays alive
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (statusTimer) clearInterval(statusTimer);
});
