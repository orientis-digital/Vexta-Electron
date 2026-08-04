const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vextaNative', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  normalizePath: (targetPath) => ipcRenderer.invoke('normalize-path', targetPath),
  joinPaths: (...segments) => ipcRenderer.invoke('join-paths', ...segments),
  saveCacheMedia: (data) => ipcRenderer.invoke('save-cache-media', data),
  saveToDownloads: (data) => ipcRenderer.invoke('save-to-downloads', data),
  
  // OS & Desktop Integration APIs
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('set-minimize-to-tray', enabled),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  setGlobalHotkeys: (enabled) => ipcRenderer.invoke('set-global-hotkeys', enabled),
  setNotificationPrivacy: (hideContent) => ipcRenderer.invoke('set-notification-privacy', hideContent),
  setScreenProtection: (enabled) => ipcRenderer.invoke('set-screen-protection', enabled),
  showNotification: (payload) => ipcRenderer.invoke('show-notification', payload),
  lockVault: () => ipcRenderer.invoke('lock-vault-from-renderer'),
  
  // Main -> Renderer events
  onLockVault: (callback) => {
    const subscription = (_event) => callback()
    ipcRenderer.on('lock-vault', subscription)
    return () => ipcRenderer.removeListener('lock-vault', subscription)
  }
})
