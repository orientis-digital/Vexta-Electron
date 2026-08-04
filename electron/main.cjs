const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const os = require('os')

function getSystemInfo() {
  const osTypeMap = {
    Linux: 'Linux',
    Darwin: 'macOS',
    Windows_NT: 'Windows',
  }
  const osName = osTypeMap[os.type()] || os.type()
  const release = os.release()
  const arch = os.arch()

  return {
    osName,
    osVersion: `${release} (${arch})`,
    deviceName: `${osName} (${arch})`,
    platform: process.platform,
    arch,
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
