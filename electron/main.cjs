const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const os = require('os')

// Force application name and local userData directory to 'Vexta' across all platforms
app.name = 'Vexta'
try {
  const customUserDataDir = path.join(app.getPath('appData'), 'Vexta')
  app.setPath('userData', customUserDataDir)
} catch {
  // Ignore if called before app ready on certain platforms
}

function getSystemInfo() {
  const osTypeMap = {
    Linux: 'Linux',
    Darwin: 'macOS',
    Windows_NT: 'Windows',
  }
  const osName = osTypeMap[os.type()] || os.type()
  const release = os.release()
  const arch = os.arch()
  const isWindows = process.platform === 'win32'
  const isMac = process.platform === 'darwin'
  const isLinux = process.platform === 'linux'

  return {
    osName,
    osVersion: `${release} (${arch})`,
    deviceName: `${osName} (${arch})`,
    platform: process.platform,
    arch,
    isWindows,
    isMac,
    isLinux,
    sep: path.sep,
    userDataPath: app.getPath('userData'),
    downloadsPath: app.getPath('downloads'),
    appDataPath: app.getPath('appData'),
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Vexta - Zero-Knowledge Messenger',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('get-system-info', () => {
  return getSystemInfo()
})

ipcMain.handle('normalize-path', (_event, targetPath) => {
  if (typeof targetPath !== 'string') return ''
  return path.normalize(targetPath)
})

ipcMain.handle('join-paths', (_event, ...segments) => {
  return path.join(...segments)
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
