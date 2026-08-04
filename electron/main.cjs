const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, Notification } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

// Force application name and local userData directory to 'Vexta' across all platforms
app.name = 'Vexta'
try {
  const customUserDataDir = path.join(app.getPath('appData'), 'Vexta')
  app.setPath('userData', customUserDataDir)
} catch {
  // Ignore if called before app ready on certain platforms
}

// OS Settings state
let minimizeToTray = true
let autoLaunch = false
let globalHotkeysEnabled = true
let hideNotifications = false
let screenProtection = true

let tray = null
let mainWindow = null

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
  mainWindow = new BrowserWindow({
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

  if (screenProtection) {
    mainWindow.setContentProtection(true)
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (event) => {
    if (minimizeToTray && !app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.png')
  tray = new Tray(iconPath)
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Vexta',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      }
    },
    {
      label: 'Lock Vault',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('lock-vault')
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])
  
  tray.setToolTip('Vexta Messenger')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    } else {
      createWindow()
    }
  })
}

function registerShortcuts() {
  globalShortcut.unregisterAll()
  if (!globalHotkeysEnabled) return

  // Lock Shortcut (CmdOrCtrl+Shift+L)
  globalShortcut.register('CmdOrCtrl+Shift+L', () => {
    if (mainWindow) {
      mainWindow.webContents.send('lock-vault')
      mainWindow.hide()
    }
  })

  // Focus/Toggle Shortcut (CmdOrCtrl+Shift+V)
  globalShortcut.register('CmdOrCtrl+Shift+V', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

function generateObfuscatedFilename(originalName = 'photo.jpg') {
  const ext = path.extname(originalName) || '.jpg'
  const uid = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6)
  const now = new Date()
  const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  return `vx_${uid}_${dateStr}${ext}`
}

// IPC Handlers
ipcMain.handle('save-cache-media', async (_event, { arrayBuffer, originalName }) => {
  try {
    const cacheDir = path.join(app.getPath('userData'), '.cache', 'media')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }

    const cachedFilename = generateObfuscatedFilename(originalName)
    const filePath = path.join(cacheDir, cachedFilename)
    const buffer = Buffer.from(arrayBuffer)

    fs.writeFileSync(filePath, buffer)
    return { success: true, filePath, cachedFilename }
  } catch (err) {
    console.error('[Electron IPC] Error saving cache media:', err)
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('save-to-downloads', async (_event, { arrayBuffer, filename }) => {
  try {
    const downloadsDir = path.join(app.getPath('downloads'), 'Vexta')
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true })
    }

    const safeName = path.basename(filename || 'download')
    const filePath = path.join(downloadsDir, safeName)
    const buffer = Buffer.from(arrayBuffer)

    fs.writeFileSync(filePath, buffer)
    return { success: true, filePath }
  } catch (err) {
    console.error('[Electron IPC] Error saving to Downloads/Vexta:', err)
    return { success: false, error: String(err) }
  }
})

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

// OS Integration Setting IPCs
ipcMain.handle('set-minimize-to-tray', (_event, enabled) => {
  minimizeToTray = !!enabled
  return { success: true }
})

ipcMain.handle('set-auto-launch', (_event, enabled) => {
  autoLaunch = !!enabled
  app.setLoginItemSettings({
    openAtLogin: autoLaunch,
    openAsHidden: true,
  })
  return { success: true }
})

ipcMain.handle('set-global-hotkeys', (_event, enabled) => {
  globalHotkeysEnabled = !!enabled
  registerShortcuts()
  return { success: true }
})

ipcMain.handle('set-notification-privacy', (_event, hideContent) => {
  hideNotifications = !!hideContent
  return { success: true }
})

ipcMain.handle('set-screen-protection', (_event, enabled) => {
  screenProtection = !!enabled
  if (mainWindow) {
    mainWindow.setContentProtection(screenProtection)
  }
  return { success: true }
})

ipcMain.handle('show-notification', (_event, { title, body, silent }) => {
  const displayBody = hideNotifications ? 'New encrypted message' : (body || '')
  const notification = new Notification({
    title: title || 'Vexta',
    body: displayBody,
    silent: !!silent,
    icon: path.join(__dirname, '../public/icon.png'),
  })

  notification.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  notification.show()
  return { success: true }
})

ipcMain.handle('lock-vault-from-renderer', () => {
  if (mainWindow) {
    mainWindow.webContents.send('lock-vault')
  }
  return { success: true }
})

app.whenReady().then(() => {
  createWindow()
  createTray()
  registerShortcuts()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
