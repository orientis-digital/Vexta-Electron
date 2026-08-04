const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vextaNative', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  normalizePath: (targetPath) => ipcRenderer.invoke('normalize-path', targetPath),
  joinPaths: (...segments) => ipcRenderer.invoke('join-paths', ...segments),
})
