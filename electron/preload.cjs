const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vextaNative', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
})
