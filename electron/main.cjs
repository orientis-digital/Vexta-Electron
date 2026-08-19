const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, Notification, session, desktopCapturer, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

// Force application name and local userData directory to 'Vexta' across all platforms
app.name = 'Vexta'

// Chromium flags for cross-platform WebRTC audio/video traversal (Linux <-> Windows)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-webrtc-pipewire-capturer')
}

try {
  const customUserDataDir = path.join(app.getPath('appData'), 'Vexta')
  app.setPath('userData', customUserDataDir)
} catch {
  // Ignore if called before app ready on certain platforms
}

// Dynamic Single Instance Lock & Smart Instance Replacement
const currentVersion = app.getVersion() || '0.0.0.0'

const gotTheLock = app.requestSingleInstanceLock({ version: currentVersion, pid: process.pid })
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory, additionalData) => {
    const incomingVersion = additionalData && additionalData.version ? additionalData.version : null
    
    // Compare versions helper
    function isNewerVersion(newerVer, olderVer) {
      if (!newerVer || !olderVer) return false
      const v1 = String(newerVer).replace(/^v/i, '').split('.').map(Number)
      const v2 = String(olderVer).replace(/^v/i, '').split('.').map(Number)
      const maxLen = Math.max(v1.length, v2.length)
      for (let i = 0; i < maxLen; i++) {
        const num1 = v1[i] || 0
        const num2 = v2[i] || 0
        if (num1 > num2) return true
        if (num1 < num2) return false
      }
      return false
    }

    if (incomingVersion && isNewerVersion(incomingVersion, currentVersion)) {
      console.log(`[Vexta Main] Newer instance (v${incomingVersion}) launched. Terminating current instance (v${currentVersion})...`)
      app.isQuitting = true
      app.quit()
      return
    }

    // Default behavior for same or older version: focus existing window
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
    appVersion: app.getVersion() || '0.0.0.5',
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
  const currentAppVersion = app.getVersion() || '0.0.0.5'
  const windowTitle = `Vexta by Orientis Digital - v${currentAppVersion}`

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: windowTitle,
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // Prevent renderer document.title from overriding window title
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  // Security: Prevent navigation to untrusted external URLs and force external links to default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
        shell.openExternal(url).catch(() => {})
      }
    } catch {}
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDev = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')
    const isLocalFile = url.startsWith('file://')
    if (!isDev && !isLocalFile) {
      event.preventDefault()
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
          shell.openExternal(url).catch(() => {})
        }
      } catch {}
    }
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

  const isHiddenBoot = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden
  if (isHiddenBoot) {
    mainWindow.hide()
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

function fileUriToPath(fileUrl) {
  if (typeof fileUrl !== 'string') return ''
  let cleaned = fileUrl.replace(/^file:\/\//, '')
  if (process.platform === 'win32') {
    cleaned = cleaned.replace(/^\/+/, '')
  }
  try {
    cleaned = decodeURIComponent(cleaned)
  } catch {}
  return path.normalize(cleaned)
}

// IPC Handlers
ipcMain.handle('read-local-file-b64', async (_event, filePath) => {
  try {
    const cleanPath = fileUriToPath(filePath)
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
  } catch {
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
      const cleanSrcPath = fileUriToPath(srcPath)
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

  if (process.platform === 'linux') {
    const autostartDir = path.join(app.getPath('home'), '.config', 'autostart')
    const desktopFilePath = path.join(autostartDir, 'vexta.desktop')

    try {
      if (enabled) {
        const execPath = process.env.APPIMAGE || process.execPath
        const desktopContent = `[Desktop Entry]
Type=Application
Name=Vexta Messenger
Exec="${execPath}" --hidden
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Terminal=false
Comment=End-to-End Encrypted Messenger
`
        if (!fs.existsSync(autostartDir)) {
          fs.mkdirSync(autostartDir, { recursive: true })
        }
        fs.writeFileSync(desktopFilePath, desktopContent, 'utf-8')
      } else if (fs.existsSync(desktopFilePath)) {
        fs.unlinkSync(desktopFilePath)
      }
    } catch (err) {
      console.warn('[Electron Main] Linux autostart desktop file update failed:', err)
    }
  }

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
const crypto = require('crypto')
const { spawn } = require('child_process')

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, { headers: { 'User-Agent': 'Vexta-Desktop-Updater' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchJson(res.headers.location))
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err.message}`))
          }
        })
      })
      .on('error', reject)
  })
}

function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { headers: { 'User-Agent': 'Vexta-Desktop-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFileWithProgress(res.headers.location, destPath, onProgress))
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status ${res.statusCode} downloading update payload`))
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
      let downloadedBytes = 0
      const fileStream = fs.createWriteStream(destPath)
      const hashStream = crypto.createHash('sha256')

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length
        hashStream.update(chunk)
        if (totalBytes > 0 && onProgress) {
          const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
          onProgress(percent, downloadedBytes, totalBytes)
        }
      })

      res.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close(() => {
          const calculatedSha256 = hashStream.digest('hex')
          resolve({ calculatedSha256, totalBytes: downloadedBytes })
        })
      })

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => reject(err))
      })
    })

    req.on('error', reject)
  })
}

function compareVersions(v1, v2) {
  const cleanV1 = String(v1).replace(/^v/i, '').split('.').map(Number)
  const cleanV2 = String(v2).replace(/^v/i, '').split('.').map(Number)
  const maxLen = Math.max(cleanV1.length, cleanV2.length)
  for (let i = 0; i < maxLen; i++) {
    const num1 = cleanV1[i] || 0
    const num2 = cleanV2[i] || 0
    if (num1 > num2) return 1
    if (num1 < num2) return -1
  }
  return 0
}

// ── Auto-Update Engine ────────────────────────────────
let updateState = {
  downloaded: false,
  installerPath: null,
  latestRelease: null,
}

ipcMain.handle('check-for-updates', async () => {
  if (!mainWindow) return { status: 'up_to_date' }

  try {
    mainWindow.webContents.send('update-status', { status: 'checking', progress: 0 })

    const currentVersion = app.getVersion() || '0.0.0.5'
    const releaseApiUrl = 'https://downloads.nexusec.space/api/v1/vexta/latest'
    console.log(`[Vexta Auto-Update] Querying downloads server release API: ${releaseApiUrl}...`)

    const releaseData = await fetchJson(releaseApiUrl)
    const latestVersion = releaseData.latest_version

    if (!latestVersion) {
      throw new Error('Release API returned invalid version payload')
    }

    console.log(`[Vexta Auto-Update] Current: v${currentVersion} | Server Latest: v${latestVersion}`)

    // If current version >= latest version, we are up to date
    if (compareVersions(currentVersion, latestVersion) >= 0) {
      mainWindow.webContents.send('update-status', { status: 'up_to_date', version: currentVersion })
      return { status: 'up_to_date', version: currentVersion }
    }

    mainWindow.webContents.send('update-status', { status: 'available', version: latestVersion })

    // Match platform artifact key from downloads-server
    const artifacts = releaseData.artifacts || {}
    let targetArtifact = null

    if (process.platform === 'win32') {
      targetArtifact = artifacts['windows_msi'] || Object.values(artifacts).find(a => a.platform === 'windows')
    } else if (process.platform === 'darwin') {
      targetArtifact = artifacts['macos_dmg'] || Object.values(artifacts).find(a => a.platform === 'macos')
    } else {
      // linux
      targetArtifact = artifacts['linux_appimage'] || artifacts['linux_deb'] || Object.values(artifacts).find(a => a.platform === 'linux')
    }

    // Fallback if platform specific key not directly matched
    if (!targetArtifact) {
      const fallbackUrl = process.platform === 'win32'
        ? 'https://downloads.nexusec.space/api/v1/vexta/download/windows'
        : 'https://downloads.nexusec.space/api/v1/vexta/download/linux'
      targetArtifact = {
        url: fallbackUrl,
        filename: `vexta-update-${latestVersion}-${process.platform}`,
        sha256: releaseData.checksums?.sha256 || null,
      }
    }

    const updateDir = path.join(app.getPath('userData'), '.updates')
    if (!fs.existsSync(updateDir)) {
      fs.mkdirSync(updateDir, { recursive: true })
    }

    const targetFilename = targetArtifact.filename || `vexta-v${latestVersion}-${process.platform}`
    const destInstallerPath = path.join(updateDir, targetFilename)

    console.log(`[Vexta Auto-Update] Downloading artifact from ${targetArtifact.url} -> ${destInstallerPath}`)

    let lastReportedPercent = -1
    const downloadResult = await downloadFileWithProgress(targetArtifact.url, destInstallerPath, (percent) => {
      if (percent !== lastReportedPercent) {
        lastReportedPercent = percent
        if (mainWindow) {
          mainWindow.webContents.send('update-status', {
            status: 'downloading',
            progress: percent,
            version: latestVersion,
          })
        }
      }
    })

    // Verify SHA-256 Checksum if server provided expected sha256
    if (targetArtifact.sha256 && targetArtifact.sha256.length === 64) {
      const expectedSha256 = targetArtifact.sha256.toLowerCase()
      const actualSha256 = downloadResult.calculatedSha256.toLowerCase()

      if (expectedSha256 !== actualSha256) {
        throw new Error(`SHA256 Checksum mismatch! Expected ${expectedSha256}, got ${actualSha256}`)
      }
      console.log(`[Vexta Auto-Update] SHA256 integrity verified successfully (${actualSha256})`)
    }

    // Make executable if Linux
    if (process.platform === 'linux') {
      try {
        fs.chmodSync(destInstallerPath, 0o755)
      } catch {}
    }

    updateState = {
      downloaded: true,
      installerPath: destInstallerPath,
      latestRelease: releaseData,
    }

    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'downloaded', version: latestVersion })
    }
    return { status: 'downloaded', version: latestVersion }
  } catch (err) {
    console.error('[Vexta Auto-Update Error]', err)
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'error', error: err.message || String(err) })
    }
    return { status: 'error', error: err.message || String(err) }
  }
})

ipcMain.handle('restart-and-install', () => {
  if (!updateState.downloaded || !updateState.installerPath) {
    return { success: false, reason: 'No update downloaded yet' }
  }

  const installerPath = updateState.installerPath
  console.log(`[Vexta Auto-Update] Triggering installer at ${installerPath}...`)

  if (process.platform === 'win32') {
    if (installerPath.endsWith('.msi')) {
      spawn('msiexec', ['/i', installerPath, '/qb'], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    }
  } else if (process.platform === 'linux' && installerPath.endsWith('.AppImage')) {
    spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref()
  }

  app.isQuitting = true
  app.relaunch()
  app.exit(0)
  return { success: true }
})

app.whenReady().then(() => {
  if (session.defaultSession) {
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0] })
        }
      }).catch((err) => {
        console.warn('[Electron Main] setDisplayMediaRequestHandler error:', err)
      })
    })
  }

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
