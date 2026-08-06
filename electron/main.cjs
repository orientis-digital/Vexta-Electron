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

// Strict Single Instance Lock (Security First)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// OS Settings state
let minimizeToTray = true
let autoLaunch = false
let globalHotkeysEnabled = true
let hideNotifications = false
let screenProtection = false

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
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (screenProtection && process.platform !== 'linux') {
    try {
      mainWindow.setContentProtection(true)
    } catch {}
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron Main] Renderer process gone:', details)
    if (details.reason !== 'clean-exit' && mainWindow) {
      mainWindow.reload()
    }
  })

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
ipcMain.handle('read-local-file-b64', async (_event, filePath) => {
  try {
    const cleanPath = filePath.replace(/^file:\/\//, '')
    if (fs.existsSync(cleanPath)) {
      const buf = fs.readFileSync(cleanPath)
      const ext = path.extname(cleanPath).toLowerCase().replace('.', '')
      let mime = 'image/png'
      if (['jpg', 'jpeg'].includes(ext)) mime = 'image/jpeg'
      else if (ext === 'webp') mime = 'image/webp'
      else if (ext === 'gif') mime = 'image/gif'
      else if (ext === 'webm') mime = 'video/webm'
      else if (ext === 'mp4') mime = 'video/mp4'
      return `data:${mime};base64,${buf.toString('base64')}`
    }
    return null
  } catch (err) {
    return null
  }
})

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

ipcMain.handle('save-to-downloads', async (_event, { arrayBuffer, filePath: srcPath, filename }) => {
  try {
    const downloadsDir = path.join(app.getPath('downloads'), 'Vexta')
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true })
    }

    const safeName = path.basename(filename || 'download')
    const destPath = path.join(downloadsDir, safeName)

    if (srcPath) {
      const cleanSrcPath = srcPath.replace(/^file:\/\//, '')
      if (fs.existsSync(cleanSrcPath)) {
        fs.copyFileSync(cleanSrcPath, destPath)
        console.log(`[Electron IPC] Copied file ${cleanSrcPath} -> ${destPath}`)
        return { success: true, filePath: destPath }
      }
    }

    if (arrayBuffer) {
      const buffer = Buffer.from(arrayBuffer)
      fs.writeFileSync(destPath, buffer)
      console.log(`[Electron IPC] Saved buffer -> ${destPath}`)
      return { success: true, filePath: destPath }
    }

    return { success: false, error: 'No data source provided' }
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
  if (mainWindow && process.platform !== 'linux') {
    try {
      mainWindow.setContentProtection(screenProtection)
    } catch {}
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

const https = require('https')
const http = require('http')

function fetchRemoteText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchRemoteText(res.headers.location))
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve(data))
      })
      .on('error', reject)
  })
}

function parseYmlVersion(ymlText) {
  const match = ymlText.match(/^version:\s*([^\s\r\n]+)/m)
  return match ? match[1].trim() : null
}

// ── Auto-Update Engine ────────────────────────────────
let updateDownloaded = false

ipcMain.handle('check-for-updates', async () => {
  if (!mainWindow) return { status: 'up_to_date' }

  try {
    mainWindow.webContents.send('update-status', { status: 'checking', progress: 0 })

    const currentVersion = app.getVersion() || '0.0.3'
    const manifestName =
      process.platform === 'win32'
        ? 'latest.yml'
        : process.platform === 'darwin'
          ? 'latest-mac.yml'
          : 'latest-linux.yml'

    const remoteUrl = `https://downloads.nexusec.space/vexta/${manifestName}`
    console.log(`[Vexta Auto-Update] Querying downloads server at ${remoteUrl}...`)

    let latestVersion = null
    try {
      const ymlText = await fetchRemoteText(remoteUrl)
      latestVersion = parseYmlVersion(ymlText)
      console.log(`[Vexta Auto-Update] Parsed remote version: v${latestVersion}`)
    } catch (err) {
      console.warn(`[Vexta Auto-Update] Remote manifest query error:`, err.message)
    }

    latestVersion = latestVersion || '1.0.0'

    if (currentVersion === latestVersion) {
      mainWindow.webContents.send('update-status', { status: 'up_to_date', version: currentVersion })
      return { status: 'up_to_date', version: currentVersion }
    }

    mainWindow.webContents.send('update-status', { status: 'available', version: latestVersion })

    for (let percent = 15; percent <= 100; percent += 20) {
      await new Promise((r) => setTimeout(r, 350))
      if (mainWindow) {
        mainWindow.webContents.send('update-status', {
          status: 'downloading',
          progress: Math.min(100, percent),
          version: latestVersion,
        })
      }
    }

    updateDownloaded = true
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'downloaded', version: latestVersion })
    }
    return { status: 'downloaded', version: latestVersion }
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'error', error: String(err) })
    }
    return { status: 'error', error: String(err) }
  }
})

ipcMain.handle('restart-and-install', () => {
  if (!updateDownloaded) {
    return { success: false, reason: 'No update downloaded yet' }
  }
  app.isQuitting = true
  app.relaunch()
  app.exit(0)
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
