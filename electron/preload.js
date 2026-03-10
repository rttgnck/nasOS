const { contextBridge } = require('electron')

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('nasOS', {
  platform: process.platform,
  isElectron: true,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
  },
})
