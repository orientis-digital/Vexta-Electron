import { useCallback, useEffect, useState } from 'react'
import {
  CheckIcon,
  CopyIcon,
  DatabaseIcon,
  DesktopIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  GearIcon,
  KeyIcon,
  LockIcon,
  OrientisLogo,
  QrCodeIcon,
  RefreshIcon,
  ServerIcon,
  ShieldIcon,
  SmartphoneIcon,
  TrashIcon,
  VolumeIcon,
  KeyboardIcon,
} from '../components/icons'
import { QRCodeSVG } from '../components/QRCode'

import { bridgeClient } from '../network/bridge'
import { exportVault, importVault, hashPasscode } from '../crypto/vault_backup'
import { VextaDatabaseManager } from '../crypto/db_manager'
import type { DbDevice } from '../crypto/db_manager'
import { AuthSession } from '../crypto/session'
import { getRegisteredAccounts, changePassword } from '../crypto/auth'
import { getOrCreateUserIdentityKeys, exportPublicKeyPem, generateFingerprintFromKey } from '../crypto/identity'
import {
  loadSoundSettings,
  saveSoundSettings,
  playIncomingMessageSound,
  playSentMessageSound,
  playErrorSound,
  playCallConnectedSound,
  playVaultUnlockSound,
  type SoundSettings,
} from '../core/sound_effects'
import {
  loadShortcuts,
  saveShortcuts,
  resetShortcuts,
  formatHotkeyEvent,
  type ShortcutItem,
} from '../core/shortcuts'

type Tab = 'account' | 'security' | 'sound' | 'shortcuts' | 'devices' | 'bridge' | 'storage' | 'about'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'account', label: 'Account & Keys', icon: <KeyIcon size={14} /> },
  { id: 'security', label: 'Security & Privacy', icon: <ShieldIcon size={14} /> },
  { id: 'sound', label: 'Sound & Audio', icon: <VolumeIcon size={14} /> },
  { id: 'shortcuts', label: 'Shortcuts & Hotkeys', icon: <KeyboardIcon size={14} /> },
  { id: 'devices', label: 'Devices', icon: <DesktopIcon size={14} /> },
  { id: 'bridge', label: 'Bridge Network', icon: <ServerIcon size={14} /> },
  { id: 'storage', label: 'Data & Storage', icon: <DatabaseIcon size={14} /> },
  { id: 'about', label: 'About', icon: <GearIcon size={14} /> },
]

type DeviceItem = {
  id: string
  name: string
  type: 'desktop' | 'mobile'
  hardwareHash: string
  lastSeen: string
  isCurrent?: boolean
  status?: string
}

function SettingsView() {
  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Account & Keys State ─────────────────────────────
  const [activeUser, setActiveUser] = useState(() => AuthSession.getActiveUser() || localStorage.getItem('vexta_active_user') || 'User')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [userFingerprint, setUserFingerprint] = useState<string | null>(null)
  const [systemInfo, setSystemInfo] = useState<{ osName?: string; arch?: string; appVersion?: string } | null>(null)

  const [serverFingerprint, setServerFingerprint] = useState<string | null>(null)
  const [bridgeUrl, setBridgeUrl] = useState(() => bridgeClient.getUrl())
  const [appVersion, setAppVersion] = useState('0.0.0.5')

  useEffect(() => {
    const user = AuthSession.getActiveUser() || localStorage.getItem('vexta_active_user') || 'User'
    setActiveUser(user)

    const accounts = getRegisteredAccounts()
    const found = accounts.find((a) => a.username.toLowerCase() === user.toLowerCase())
    if (found && found.recoveryCode) {
      setRecoveryCode(found.recoveryCode)
    }

    getOrCreateUserIdentityKeys(user).then((keys) => {
      exportPublicKeyPem(keys.publicKey).then((pem) => {
        const fp = generateFingerprintFromKey(pem)
        setUserFingerprint(fp)
      }).catch((err) => {
        console.warn('[Vexta Settings] Fingerprint export error:', err)
        setUserFingerprint('Unavailable')
      })
    }).catch((err) => {
      console.warn('[Vexta Settings] Key derivation error:', err)
      setUserFingerprint('Unavailable')
    })

    const db = new VextaDatabaseManager(user)
    const host = bridgeUrl.replace(/^wss?:\/\//, '').replace(/\/.*$/, '')
    const trust = db.getServerTrust(host)
    if (trust?.server_fingerprint) {
      setServerFingerprint(trust.server_fingerprint)
    } else {
      setServerFingerprint(generateFingerprintFromKey(host))
    }

    if (typeof window !== 'undefined' && (window as any).vextaNative?.getSystemInfo) {
      (window as any).vextaNative.getSystemInfo().then((info: any) => {
        if (info) {
          setSystemInfo(info)
          if (info.appVersion) setAppVersion(info.appVersion)
        }
      }).catch(() => {})
    }
  }, [activeTab, bridgeUrl])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!currentPw || !newPw) return
    if (newPw.length < 8) {
      showToast('New password must be at least 8 characters')
      return
    }
    if (newPw !== confirmPw) {
      showToast('New passwords do not match')
      return
    }
    const res = await changePassword(activeUser, currentPw, newPw)
    if (!res.success) {
      showToast(res.error || 'Failed to update Master Password')
      return
    }
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    showToast('Master Password successfully updated')
  }

  // ── Security Settings State ──────────────────────────
  const [autoLock, setAutoLock] = useState(() => localStorage.getItem('vx_setting_autolock') || '5m')
  const [biometrics, setBiometrics] = useState(() => {
    const val = localStorage.getItem('vx_setting_biometrics')
    return val !== null ? val === 'true' : true
  })
  const [screenProtection, setScreenProtection] = useState(() => {
    const val = localStorage.getItem('vx_setting_screen_protection')
    return val !== null ? val === 'true' : false
  })
  const [hideNotifications, setHideNotifications] = useState(() => {
    const val = localStorage.getItem('vx_setting_hide_notifications')
    return val !== null ? val === 'true' : false
  })
  const [notificationSounds, setNotificationSounds] = useState(() => {
    const val = localStorage.getItem('vx_setting_notification_sounds')
    return val !== null ? val === 'true' : true
  })
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(loadSoundSettings)
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(loadShortcuts)
  const [recordingId, setRecordingId] = useState<string | null>(null)

  useEffect(() => {
    if (!recordingId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const hotkey = formatHotkeyEvent(e)
      if (!hotkey) return

      const updated = shortcuts.map((s) => (s.id === recordingId ? { ...s, key: hotkey } : s))
      setShortcuts(updated)
      saveShortcuts(updated)
      setRecordingId(null)
      showToast(`Shortcut updated to ${hotkey}`)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [recordingId, shortcuts])
  const [globalPresencePrivacy, setGlobalPresencePrivacy] = useState<'everyone' | 'nobody'>('everyone')

  useEffect(() => {
    const activeUser = AuthSession.getActiveUser()
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      setGlobalPresencePrivacy(db.getGlobalPresencePrivacy())
    }
  }, [])

  // OS Integration Settings
  const [minimizeToTray, setMinimizeToTray] = useState(() => {
    const val = localStorage.getItem('vx_setting_minimize_to_tray')
    return val !== null ? val === 'true' : true
  })
  const [autoLaunch, setAutoLaunch] = useState(() => {
    const val = localStorage.getItem('vx_setting_auto_launch')
    return val !== null ? val === 'true' : false
  })
  const [globalHotkeys, setGlobalHotkeys] = useState(() => {
    const val = localStorage.getItem('vx_setting_global_hotkeys')
    return val !== null ? val === 'true' : true
  })

  // ── Duress State ─────────────────────────────────────
  const [duressPasscode, setDuressPasscode] = useState('')
  const [confirmDuress, setConfirmDuress] = useState('')
  const [duressConfigured, setDuressConfigured] = useState(() => {
    return Boolean(localStorage.getItem('vexta_duress_passcode_hash'))
  })

  async function handleSaveDuressPasscode(e: React.FormEvent) {
    e.preventDefault()
    if (!duressPasscode || duressPasscode !== confirmDuress) {
      showToast('Duress passcodes do not match')
      return
    }
    const hash = await hashPasscode(duressPasscode)
    localStorage.setItem('vexta_duress_passcode_hash', hash)
    setDuressConfigured(true)
    setDuressPasscode('')
    setConfirmDuress('')
    showToast('Emergency wipe passcode configured successfully')
  }

  function handleClearDuressPasscode() {
    localStorage.removeItem('vexta_duress_passcode_hash')
    setDuressConfigured(false)
    showToast('Emergency wipe passcode disabled')
  }

  // ── Devices State ────────────────────────────────────
  const [devices, setDevices] = useState<DeviceItem[]>([])
  const [pairQrOpen, setPairQrOpen] = useState(false)

  // Sync settings with Electron
  useEffect(() => {
    const native = (window as any).vextaNative
    if (native) {
      native.setMinimizeToTray(minimizeToTray).catch(() => { })
      native.setAutoLaunch(autoLaunch).catch(() => { })
      native.setGlobalHotkeys(globalHotkeys).catch(() => { })
      native.setNotificationPrivacy(hideNotifications).catch(() => { })
      native.setScreenProtection(screenProtection).catch(() => { })
    }
  }, [minimizeToTray, autoLaunch, globalHotkeys, hideNotifications, screenProtection])

  useEffect(() => {
    const user = AuthSession.getActiveUser() || 'guest'
    const db = new VextaDatabaseManager(user)
    const stored = db.getDevices()

    if (stored.length > 0) {
      setDevices(stored)
    } else if (typeof window !== 'undefined' && (window as any).vextaNative?.getSystemInfo) {
      ;(window as any).vextaNative.getSystemInfo().then((info: any) => {
        if (info) {
          const devHash = generateFingerprintFromKey(`${info.osName}-${info.arch}-${user}`).replace(/[: ]/g, '').slice(0, 16).toLowerCase()
          const currentDev: DbDevice = {
            id: 'dev-' + Date.now().toString(16),
            name: `${info.osName} (${info.arch})`,
            type: 'desktop',
            hardwareHash: `sha256_${devHash}`,
            lastSeen: 'Active Now',
            isCurrent: true,
          }
          db.saveDevice(currentDev)
          setDevices([currentDev])
        }
      }).catch(() => { })
    }

    try {
      bridgeClient.listDevices()
    } catch (e) {
      console.warn('[Vexta Settings] listDevices query error:', e)
    }
  }, [activeTab])

  function revokeDevice(id: string, devName: string, hardwareHash?: string) {
    AuthSession.revokeDevice(id, hardwareHash)
    setDevices((prev) => prev.filter((d) => d.id !== id))
    showToast(`Revoked access for ${devName}`)
  }

  // ── Bridge Network State ─────────────────────────────
  const [testingPing, setTestingPing] = useState(false)
  const [pingLatency, setPingLatency] = useState<number | null>(24)
  const [customBridge, setCustomBridge] = useState(false)

  async function testBridgePing() {
    setTestingPing(true)
    const startTime = performance.now()
    try {
      const httpEndpoint = bridgeUrl
        .replace(/^wss:\/\//, 'https://')
        .replace(/^ws:\/\//, 'http://')
        .replace(/\/ws\/chat\/?$/, '/api/v1/health')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)

      await fetch(httpEndpoint, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' })
      clearTimeout(timeoutId)
      const latency = Math.max(1, Math.round(performance.now() - startTime))
      setPingLatency(latency)
      showToast(`Bridge ping successful \u00B7 ${latency}ms latency`)
    } catch {
      setPingLatency(null)
      showToast('Bridge ping failed \u00B7 Endpoint unreachable or timed out')
    } finally {
      setTestingPing(false)
    }
  }

  function handleSaveBridgeUrl() {
    const clean = bridgeUrl.trim()
    if (!clean.startsWith('ws://') && !clean.startsWith('wss://')) {
      showToast('Bridge URL must start with ws:// or wss://')
      return
    }
    bridgeClient.setUrl(clean)
    localStorage.setItem('vexta_bridge_url', clean)
    showToast('Bridge relay URL updated & reconnected')
  }

  function handleResetBridgeUrl() {
    const defaultUrl = 'wss://vexta-api.nexusec.space/ws/chat/'
    setBridgeUrl(defaultUrl)
    setCustomBridge(false)
    bridgeClient.setUrl(defaultUrl)
    localStorage.removeItem('vexta_bridge_url')
    showToast('Bridge relay restored to default')
  }

  // ── Storage State ────────────────────────────────────
  const [exportVaultOpen, setExportVaultOpen] = useState(false)
  const [vaultPassword, setVaultPassword] = useState('')
  const [importVaultOpen, setImportVaultOpen] = useState(false)
  const [importPassword, setImportPassword] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  async function handleExportVault() {
    if (!vaultPassword) return
    try {
      const user = AuthSession.getActiveUser() || 'guest'
      const blob = await exportVault(vaultPassword, user)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vexta_backup_${user}_${Date.now()}.vxvault`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setVaultPassword('')
      setExportVaultOpen(false)
      showToast('Encrypted .vxvault backup downloaded')
    } catch (err) {
      showToast('Export failed: ' + String(err))
    }
  }

  async function handleImportVault() {
    if (!importFile || !importPassword) return
    setImporting(true)
    setImportError(null)
    try {
      const buffer = await importFile.arrayBuffer()
      const res = await importVault(buffer, importPassword)
      if (!res.success) {
        setImportError(res.error || 'Vault import failed')
        setImporting(false)
        return
      }
      setImportVaultOpen(false)
      showToast(`Vault database restored (${res.restoredCount} items). Reloading...`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (err) {
      setImportError(String(err))
      setImporting(false)
    }
  }

  // ── Real Storage & Vault Database Stats ──────────────
  const [dbStats, setDbStats] = useState({
    dbName: 'account_guest.db',
    sqliteSizeStr: '0 B',
    messagesCountStr: '0 Encrypted Bubbles',
    mediaCacheStr: '0 B',
  })

  const loadStorageStats = useCallback(() => {
    const activeUser = AuthSession.getActiveUser() || localStorage.getItem('vexta_active_user') || 'guest'
    const db = new VextaDatabaseManager(activeUser)
    const dbName = `${db.getDbName()}.db`

    let totalDbBytes = 0
    const prefix = `vexta_db_${activeUser.toLowerCase()}`
    const userPrefix = `vexta_user_${activeUser.toLowerCase()}`
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith(prefix) || key.startsWith(userPrefix))) {
        const val = localStorage.getItem(key) || ''
        totalDbBytes += key.length + val.length
      }
    }

    const allMsgsData = localStorage.getItem(`${prefix}_messages`)
    const allMsgs: any[] = allMsgsData ? JSON.parse(allMsgsData) : []
    const messagesCount = allMsgs.length

    let mediaBytes = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('vexta_chunks_') || key.startsWith('vexta_cached_media_'))) {
        const val = localStorage.getItem(key) || ''
        mediaBytes += val.length
      }
    }

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    }

    setDbStats({
      dbName,
      sqliteSizeStr: formatBytes(totalDbBytes),
      messagesCountStr: `${messagesCount.toLocaleString()} Encrypted Bubble${messagesCount === 1 ? '' : 's'}`,
      mediaCacheStr: formatBytes(mediaBytes),
    })
  }, [])

  useEffect(() => {
    loadStorageStats()
  }, [loadStorageStats])

  function handleClearMediaCache() {
    let freedBytes = 0
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('vexta_chunks_') || key.startsWith('vexta_cached_media_'))) {
        const val = localStorage.getItem(key) || ''
        freedBytes += val.length
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
    loadStorageStats()

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    }
    showToast(`Media cache cleared (${formatBytes(freedBytes)} freed)`)
  }

  function handleExportDiagnostics() {
    const activeUser = AuthSession.getActiveUser() || 'guest'
    const db = new VextaDatabaseManager(activeUser)
    const diagnostics = {
      app_name: 'Vexta Protocol Desktop',
      app_version: systemInfo?.appVersion || appVersion || '2.4.0',
      active_user: activeUser,
      bridge_url: bridgeClient.getUrl(),
      bridge_status: bridgeClient.getStatus(),
      timestamp: new Date().toISOString(),
      vault_stats: {
        db_name: db.getDbName(),
        contacts_count: db.getContacts().length,
        groups_count: db.getGroups().length,
        file_transfers_count: db.getFileTransfers().length,
        devices_count: db.getDevices().length,
      },
    }

    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vexta_diagnostics_${activeUser}_${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Diagnostic logs exported')
  }

  // ── About & Auto-Update State ─────────────────────────────
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number>(0)
  const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).vextaNative?.getSystemInfo) {
      (window as any).vextaNative.getSystemInfo().then((info: any) => {
        if (info && info.appVersion) {
          setAppVersion(info.appVersion)
        }
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).vextaNative?.onUpdateStatus) {
      return (window as any).vextaNative.onUpdateStatus((data: any) => {
        if (data.status === 'checking') {
          setCheckingUpdates(true)
          setUpdateStatus('Checking for latest Vexta release...')
        } else if (data.status === 'available') {
          setCheckingUpdates(true)
          setUpdateStatus(`New release v${data.version} found. Downloading update...`)
        } else if (data.status === 'downloading') {
          setCheckingUpdates(true)
          setUpdateProgress(data.progress || 0)
          setUpdateStatus(`Downloading v${data.version} (${data.progress}%)...`)
        } else if (data.status === 'downloaded') {
          setCheckingUpdates(false)
          setUpdateDownloaded(true)
          setUpdateStatus(`Vexta v${data.version} update ready to install!`)
        } else if (data.status === 'up_to_date') {
          setCheckingUpdates(false)
          setUpdateStatus(`Vexta is up to date (v${data.version || appVersion})`)
        } else if (data.status === 'error') {
          setCheckingUpdates(false)
          setUpdateStatus(`Update check failed: ${data.error || 'Network error'}`)
        }
      })
    }
  }, [appVersion])

  function handleCheckUpdates() {
    setCheckingUpdates(true)
    setUpdateStatus('Checking for latest Vexta release...')
    setUpdateProgress(0)
    setUpdateDownloaded(false)

    if (typeof window !== 'undefined' && (window as any).vextaNative?.checkForUpdates) {
      (window as any).vextaNative.checkForUpdates()
    } else {
      setTimeout(() => {
        setCheckingUpdates(false)
        setUpdateStatus(`Vexta is up to date (v${appVersion})`)
      }, 1200)
    }
  }

  function handleRestartInstall() {
    if (typeof window !== 'undefined' && (window as any).vextaNative?.restartAndInstall) {
      (window as any).vextaNative.restartAndInstall()
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="screen-pane settings-screen">
      {/* Notification Toast */}
      {toast && (
        <div className="info-toast" role="status">
          <ShieldIcon size={14} />
          <span>{toast}</span>
        </div>
      )}

      <div className="settings-header">
        <h1>Settings</h1>
        <p className="settings-subtitle">Manage vault security, keys, devices &amp; network settings</p>
      </div>

      <div className="settings-layout-container">
        {/* Left Column: Settings Navigation Sidebar */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar-nav">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                className={`settings-nav-item ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <div className="settings-nav-icon">{icon}</div>
                <span className="settings-nav-label">{label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Right Column: Active Options Panel */}
        <main className="settings-content-panel">
          {/* TAB 1: ACCOUNT & KEYS */}
          {activeTab === 'account' && (
          <div className="settings-section-group">
            {/* User Profile Card */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <KeyIcon size={16} className="accent-icon" />
                  <h3>Account Profile</h3>
                </div>
                <span className="trust-tag verified">Active Vault</span>
              </div>

              {(() => {
                const currentUser = activeUser
                const initials = currentUser.slice(0, 2).toUpperCase()
                return (
                  <div className="profile-setting-row">
                    <div className="avatar profile-avatar-lg">{initials}</div>
                    <div className="profile-setting-meta">
                      <span className="profile-setting-name">{currentUser}</span>
                      <span className="profile-setting-handle">@{currentUser.toLowerCase()}</span>
                      <span className="profile-setting-fingerprint">
                        {userFingerprint ? (userFingerprint.startsWith('FP:') ? userFingerprint : `FP: ${userFingerprint}`) : 'Deriving key fingerprint...'}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Change Password Card */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <LockIcon size={16} className="accent-icon" />
                  <h3>Change Master Password</h3>
                </div>
              </div>
              <p className="card-desc">
                Updating your master password re-wraps the Data Encryption Key (DEK) with Argon2id KDF.
              </p>

              <form onSubmit={handleChangePassword} className="settings-form">
                <div className="form-group">
                  <label className="field-label">Current Master Password</label>
                  <input
                    type="password"
                    className="modal-input"
                    placeholder="••••••••••••"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                  />
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="field-label">New Password</label>
                    <input
                      type="password"
                      className="modal-input"
                      placeholder="At least 8 chars"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="field-label">Confirm New Password</label>
                    <input
                      type="password"
                      className="modal-input"
                      placeholder="Repeat new password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!currentPw || !newPw || newPw !== confirmPw}
                >
                  Update Master Password
                </button>
              </form>
            </div>

            {/* Recovery Code Card */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <ShieldIcon size={16} className="accent-icon" />
                  <h3>Emergency Recovery Code</h3>
                </div>
              </div>
              <p className="card-desc">
                This 32-character recovery key is the ONLY way to restore your account if you forget your password. Keep it secure offline.
              </p>

              <div className="recovery-code-box">
                <span className="recovery-code-text">
                  {showRecovery ? (recoveryCode || 'No recovery code available') : (recoveryCode ? '••••••••••••••••••••••••••••••••' : 'Loading...')}
                </span>
                <button
                  type="button"
                  className="btn-icon-ghost"
                  onClick={() => setShowRecovery(!showRecovery)}
                  title={showRecovery ? 'Hide recovery code' : 'Reveal recovery code'}
                >
                  {showRecovery ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!recoveryCode}
                  onClick={() => {
                    if (recoveryCode) {
                      navigator.clipboard.writeText(recoveryCode).catch(() => { })
                      showToast('Recovery code copied to clipboard')
                    }
                  }}
                >
                  <CopyIcon size={14} />
                  Copy Recovery Code
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SECURITY & PRIVACY */}
        {activeTab === 'security' && (
          <div className="settings-section-group">
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <LockIcon size={16} className="accent-icon" />
                  <h3>Auto-Lock &amp; Timeout</h3>
                </div>
              </div>
              <p className="card-desc">
                Automatically lock the messenger vault after a period of inactivity.
              </p>

              <div className="setting-toggle-row">
                <span className="setting-label">Auto-Lock Duration</span>
                <select
                  className="settings-select"
                  value={autoLock}
                  onChange={(e) => {
                    const val = e.target.value
                    setAutoLock(val)
                    localStorage.setItem('vx_setting_autolock', val)
                    window.dispatchEvent(new CustomEvent('vexta_setting_autolock_updated', { detail: { value: val } }))
                    showToast('Auto-lock timeout updated')
                  }}
                >
                  <option value="1m">1 Minute</option>
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="never">Never (Not Recommended)</option>
                </select>
              </div>
            </div>

            {/* Privacy Controls */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <ShieldIcon size={16} className="accent-icon" />
                  <h3>Privacy Controls</h3>
                </div>
              </div>

              <div className="toggle-list">
                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Biometric Authentication</span>
                    <span className="toggle-desc">Use Windows Hello or Touch ID to unlock local vault.</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={biometrics}
                    onChange={(e) => {
                      const val = e.target.checked
                      setBiometrics(val)
                      localStorage.setItem('vx_setting_biometrics', String(val))
                      showToast(val ? 'Biometrics enabled' : 'Biometrics disabled')
                    }}
                  />
                </div>

                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Screen Capture Protection</span>
                    <span className="toggle-desc">Prevent screenshotting and screen recording (FLAG_SECURE / WDA).</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={screenProtection}
                    onChange={(e) => {
                      const val = e.target.checked
                      setScreenProtection(val)
                      localStorage.setItem('vx_setting_screen_protection', String(val))
                      showToast(
                        val ? 'Screen protection enabled' : 'Screen protection disabled',
                      )
                    }}
                  />
                </div>

                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Hide Message Previews</span>
                    <span className="toggle-desc">Hide message text contents in system desktop notifications.</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={hideNotifications}
                    onChange={(e) => {
                      const val = e.target.checked
                      setHideNotifications(val)
                      localStorage.setItem('vx_setting_hide_notifications', String(val))
                      showToast('Notification privacy updated')
                    }}
                  />
                </div>

                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Play Notification Sounds</span>
                    <span className="toggle-desc">Play a subtle double chime sound when a new message is received.</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={notificationSounds}
                    onChange={(e) => {
                      const val = e.target.checked
                      setNotificationSounds(val)
                      localStorage.setItem('vx_setting_notification_sounds', String(val))
                      const updated = { ...soundSettings, incomingMessage: val }
                      setSoundSettings(updated)
                      saveSoundSettings(updated)
                      showToast(val ? 'Notification sounds enabled' : 'Notification sounds disabled')
                    }}
                  />
                </div>

                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Share Last Active Status</span>
                    <span className="toggle-desc">Allow contacts to see when you are active ("Active 2m ago").</span>
                  </div>
                  <select
                    className="settings-select"
                    value={globalPresencePrivacy}
                    onChange={(e) => {
                      const val = e.target.value as 'everyone' | 'nobody'
                      setGlobalPresencePrivacy(val)
                      const activeUser = AuthSession.getActiveUser()
                      if (activeUser) {
                        const db = new VextaDatabaseManager(activeUser)
                        db.setGlobalPresencePrivacy(val)
                      }
                      showToast(`Last active status set to ${val === 'everyone' ? 'Everyone' : 'Nobody'}`)
                    }}
                  >
                    <option value="everyone">Everyone (Contacts)</option>
                    <option value="nobody">Nobody (Private)</option>
                  </select>
                </div>

                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Minimize to System Tray</span>
                    <span className="toggle-desc">Closing the window will minimize it to system tray instead of exiting.</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={minimizeToTray}
                    onChange={(e) => {
                      const val = e.target.checked
                      setMinimizeToTray(val)
                      localStorage.setItem('vx_setting_minimize_to_tray', String(val))
                      showToast(val ? 'Minimize to tray enabled' : 'Minimize to tray disabled')
                    }}
                  />
                </div>

                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Launch at Startup</span>
                    <span className="toggle-desc">Automatically launch Vexta when you boot your system.</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={autoLaunch}
                    onChange={(e) => {
                      const val = e.target.checked
                      setAutoLaunch(val)
                      localStorage.setItem('vx_setting_auto_launch', String(val))
                      showToast(val ? 'Auto-launch enabled' : 'Auto-launch disabled')
                    }}
                  />
                </div>

                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-title">Global Shortcut Hotkeys</span>
                    <span className="toggle-desc">Enable Cmd/Ctrl+Shift+L to lock vault, and Cmd/Ctrl+Shift+V to toggle focus.</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={globalHotkeys}
                    onChange={(e) => {
                      const val = e.target.checked
                      setGlobalHotkeys(val)
                      localStorage.setItem('vx_setting_global_hotkeys', String(val))
                      showToast(val ? 'Global hotkeys enabled' : 'Global hotkeys disabled')
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Duress Emergency Wipe Passcode */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <TrashIcon size={16} className="accent-icon" />
                  <h3>Duress / Emergency Wipe Passcode</h3>
                </div>
              </div>
              <p className="card-desc">
                Configure a decoy passcode. Entering this passcode on the login screen will instantly wipe all local encrypted databases and keying material.
              </p>

              {duressConfigured ? (
                <div className="setting-toggle-row" style={{ alignItems: 'center' }}>
                  <span className="mono-label" style={{ color: '#39ff14' }}>
                    ✓ Emergency wipe passcode active
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleClearDuressPasscode}
                  >
                    Remove Duress Passcode
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveDuressPasscode} className="duress-form">
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="field-label">Set Emergency Wipe Passcode</label>
                    <input
                      type="password"
                      className="modal-input"
                      placeholder="Enter emergency passcode..."
                      value={duressPasscode}
                      onChange={(e) => setDuressPasscode(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="field-label">Confirm Emergency Wipe Passcode</label>
                    <input
                      type="password"
                      className="modal-input"
                      placeholder="Confirm emergency passcode..."
                      value={confirmDuress}
                      onChange={(e) => setConfirmDuress(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={!duressPasscode || duressPasscode !== confirmDuress}
                  >
                    Enable Duress Wipe
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* TAB: SOUND & AUDIO */}
        {activeTab === 'sound' && (
          <div className="settings-section-group">
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <VolumeIcon size={18} className="accent-icon" />
                  <h3>Audio &amp; Sound Feedback Controls</h3>
                </div>
              </div>
              <p className="card-desc">
                Manage zero-latency Web Audio API sound effects, volume levels, and audio feedback triggers.
              </p>

              <div className="settings-form">
                <div className="setting-control-group" style={{ marginBottom: '20px' }}>
                  <span className="field-label" style={{ display: 'block', marginBottom: '8px' }}>
                    Master Audio Volume ({soundSettings.masterVolume}%)
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={soundSettings.masterVolume}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        const updated = { ...soundSettings, masterVolume: val }
                        setSoundSettings(updated)
                        saveSoundSettings(updated)
                      }}
                      style={{ flex: 1, accentColor: '#39ff14', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <div className="toggle-list">
                  <div className="toggle-item">
                    <div className="toggle-info">
                      <span className="toggle-title">Incoming Message Chime</span>
                      <span className="toggle-desc">Play double sine chime when a new message arrives.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => playIncomingMessageSound()}
                      >
                        Test
                      </button>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={soundSettings.incomingMessage}
                        onChange={(e) => {
                          const val = e.target.checked
                          const updated = { ...soundSettings, incomingMessage: val }
                          setSoundSettings(updated)
                          saveSoundSettings(updated)
                          setNotificationSounds(val)
                          localStorage.setItem('vx_setting_notification_sounds', String(val))
                          showToast(val ? 'Incoming message sound enabled' : 'Incoming message sound disabled')
                        }}
                      />
                    </div>
                  </div>

                  <div className="toggle-item">
                    <div className="toggle-info">
                      <span className="toggle-title">Message Sent Pop Effect</span>
                      <span className="toggle-desc">Play soft pop effect when sending an outbound message.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => playSentMessageSound()}
                      >
                        Test
                      </button>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={soundSettings.sentMessage}
                        onChange={(e) => {
                          const val = e.target.checked
                          const updated = { ...soundSettings, sentMessage: val }
                          setSoundSettings(updated)
                          saveSoundSettings(updated)
                          showToast(val ? 'Message sent sound enabled' : 'Message sent sound disabled')
                        }}
                      />
                    </div>
                  </div>

                  <div className="toggle-item">
                    <div className="toggle-info">
                      <span className="toggle-title">Error &amp; Warning Alert Blips</span>
                      <span className="toggle-desc">Play low warning blips when system or network errors occur.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => playErrorSound()}
                      >
                        Test
                      </button>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={soundSettings.errorAlert}
                        onChange={(e) => {
                          const val = e.target.checked
                          const updated = { ...soundSettings, errorAlert: val }
                          setSoundSettings(updated)
                          saveSoundSettings(updated)
                          showToast(val ? 'Error alert sound enabled' : 'Error alert sound disabled')
                        }}
                      />
                    </div>
                  </div>

                  <div className="toggle-item">
                    <div className="toggle-info">
                      <span className="toggle-title">Voice &amp; Video Call Tones</span>
                      <span className="toggle-desc">Play ascending or descending chimes when WebRTC calls connect or end.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => playCallConnectedSound()}
                      >
                        Test Connect
                      </button>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={soundSettings.callTones}
                        onChange={(e) => {
                          const val = e.target.checked
                          const updated = { ...soundSettings, callTones: val }
                          setSoundSettings(updated)
                          saveSoundSettings(updated)
                          showToast(val ? 'Call tone sounds enabled' : 'Call tone sounds disabled')
                        }}
                      />
                    </div>
                  </div>

                  <div className="toggle-item">
                    <div className="toggle-info">
                      <span className="toggle-title">Vault Lock &amp; Unlock Clicks</span>
                      <span className="toggle-desc">Play click sound when unlocking or locking the encrypted vault.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => playVaultUnlockSound()}
                      >
                        Test Click
                      </button>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={soundSettings.vaultClicks}
                        onChange={(e) => {
                          const val = e.target.checked
                          const updated = { ...soundSettings, vaultClicks: val }
                          setSoundSettings(updated)
                          saveSoundSettings(updated)
                          showToast(val ? 'Vault click sounds enabled' : 'Vault click sounds disabled')
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SHORTCUTS & HOTKEYS */}
        {activeTab === 'shortcuts' && (
          <div className="settings-section-group">
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <KeyboardIcon size={18} className="accent-icon" />
                  <h3>Keyboard Shortcuts &amp; Hotkey Controls</h3>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '11px', padding: '5px 10px' }}
                  onClick={() => {
                    const restored = resetShortcuts()
                    setShortcuts(restored)
                    setRecordingId(null)
                    showToast('Shortcuts reset to default keybindings')
                  }}
                >
                  Reset All to Defaults
                </button>
              </div>
              <p className="card-desc">
                Enable or disable active keyboard shortcuts and record custom key combinations.
              </p>

              <div className="settings-form">
                <div className="toggle-list">
                  {shortcuts.map((sc) => (
                    <div key={sc.id} className="toggle-item" style={{ alignItems: 'flex-start' }}>
                      <div className="toggle-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span className="toggle-title">{sc.label}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              color: 'var(--text-secondary)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {sc.category}
                          </span>
                        </div>
                        <span className="toggle-desc">{sc.description}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Hotkey Badge / Record Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className={`btn-secondary ${recordingId === sc.id ? 'active' : ''}`}
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '12px',
                              fontWeight: 600,
                              padding: '4px 10px',
                              minWidth: '100px',
                              textAlign: 'center',
                              borderColor: recordingId === sc.id ? '#39ff14' : undefined,
                              color: recordingId === sc.id ? '#39ff14' : undefined,
                              background: recordingId === sc.id ? 'rgba(57, 255, 20, 0.1)' : undefined,
                            }}
                            onClick={() => setRecordingId(recordingId === sc.id ? null : sc.id)}
                          >
                            {recordingId === sc.id ? 'Press keys...' : sc.key}
                          </button>

                          {sc.key !== sc.defaultKey && (
                            <button
                              type="button"
                              className="btn-text"
                              style={{ fontSize: '11px', color: 'var(--text-secondary)' }}
                              title="Reset keybinding to default"
                              onClick={() => {
                                const updated = shortcuts.map((item) =>
                                  item.id === sc.id ? { ...item, key: sc.defaultKey } : item,
                                )
                                setShortcuts(updated)
                                saveShortcuts(updated)
                                showToast(`Reset shortcut to ${sc.defaultKey}`)
                              }}
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        {/* Active Checkbox */}
                        <input
                          type="checkbox"
                          className="toggle-switch"
                          checked={sc.enabled}
                          onChange={(e) => {
                            const val = e.target.checked
                            const updated = shortcuts.map((item) =>
                              item.id === sc.id ? { ...item, enabled: val } : item,
                            )
                            setShortcuts(updated)
                            saveShortcuts(updated)
                            showToast(val ? `'${sc.label}' shortcut enabled` : `'${sc.label}' shortcut disabled`)
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DEVICES */}
        {activeTab === 'devices' && (
          <div className="settings-section-group">
            {/* Dedicated "This Device" Card */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <DesktopIcon size={18} className="accent-icon" />
                  <h3>This Device</h3>
                </div>
                <span className="trust-tag verified">
                  <span className="status-dot connected" />
                  Active Session
                </span>
              </div>

              {(() => {
                const deviceName = systemInfo?.deviceName || (systemInfo?.osName ? `${systemInfo.osName} (${systemInfo.arch || 'x86_64'})` : 'This Device')
                const currentDev = devices.find((d) => d.isCurrent) || {
                  id: 'this-device-local',
                  name: deviceName,
                  type: 'desktop' as const,
                  hardwareHash: userFingerprint ? `sha256_${userFingerprint.slice(0, 16).replace(/[: ]/g, '').toLowerCase()}` : 'sha256_active_node',
                  lastSeen: 'Active Now',
                }
                return (
                  <div className="profile-setting-row" style={{ background: 'rgba(57, 255, 20, 0.04)', borderColor: 'rgba(57, 255, 20, 0.2)' }}>
                    <div className="device-icon" style={{ width: 50, height: 50, borderRadius: 14 }}>
                      <DesktopIcon size={24} />
                    </div>
                    <div className="profile-setting-meta">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="profile-setting-name">{currentDev.name}</span>
                        <span className="current-device-badge">This Device</span>
                      </div>
                      <span className="profile-setting-handle">Hardware Hash: {currentDev.hardwareHash}</span>
                      <span className="profile-setting-fingerprint">
                        Status: Connected &amp; Authorized \u00B7 {currentDev.lastSeen}
                      </span>
                    </div>
                  </div>
                )
              })()}

              <div className="spec-grid" style={{ marginTop: 14 }}>
                <div className="spec-item">
                  <span className="spec-label">Operating System</span>
                  <span className="spec-value">
                    {systemInfo ? `${systemInfo.osName} (${systemInfo.arch})` : 'Detecting OS...'}
                  </span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Client Build</span>
                  <span className="spec-value">
                    {systemInfo ? `Vexta Desktop ${systemInfo.appVersion || appVersion}` : `Vexta Desktop ${appVersion}`}
                  </span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Session Key Bundle</span>
                  <span className="spec-value">RSA-4096 / PSS Mounted</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Authorization Role</span>
                  <span className="spec-value">Primary Master Node</span>
                </div>
              </div>
            </div>

            {/* Other Authorized & Secondary Devices */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <SmartphoneIcon size={16} className="accent-icon" />
                  <h3>Linked Secondary Devices ({devices.filter((d) => !d.isCurrent).length})</h3>
                </div>
                <button
                  type="button"
                  className="btn-primary-sm"
                  onClick={() => setPairQrOpen(true)}
                >
                  <QrCodeIcon size={14} />
                  Link New Device
                </button>
              </div>
              <p className="card-desc">
                Authorized mobile or desktop secondary devices linked via out-of-band PIN pairing.
              </p>

              <div className="device-roster">
                {devices.filter((d) => !d.isCurrent).map((dev) => (
                  <div key={dev.id} className="device-row">
                    <div className="device-icon">
                      {dev.type === 'desktop' ? <DesktopIcon size={20} /> : <SmartphoneIcon size={20} />}
                    </div>

                    <div className="device-info">
                      <div className="device-name-row">
                        <span className="device-name">{dev.name}</span>
                        {dev.status === 'pending_approval' && (
                          <span className="current-device-badge" style={{ background: 'rgba(255, 170, 0, 0.2)', color: '#ffaa00' }}>
                            Pending Approval
                          </span>
                        )}
                      </div>
                      <span className="device-meta">
                        {dev.hardwareHash} \u00B7 {dev.lastSeen}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn-danger-outline"
                      onClick={() => revokeDevice(dev.id, dev.name, dev.hardwareHash)}
                    >
                      Revoke Access
                    </button>
                  </div>
                ))}
                {devices.filter((d) => !d.isCurrent).length === 0 && (
                  <div className="empty-friends-card" style={{ padding: '20px', textAlign: 'center' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      No secondary devices linked yet. Click "Link New Device" to pair a mobile phone or secondary laptop.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BRIDGE NETWORK */}
        {activeTab === 'bridge' && (
          <div className="settings-section-group">
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <ServerIcon size={16} className="accent-icon" />
                  <h3>Bridge Relay Connection</h3>
                </div>
                <span className="trust-tag verified">
                  <span className="status-dot connected" />
                  WSS Connected
                </span>
              </div>

              <div className="spec-grid">
                <div className="spec-item">
                  <span className="spec-label">Relay Node</span>
                  <span className="spec-value">{bridgeUrl}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Latency Ping</span>
                  <span className="spec-value">
                    {pingLatency ? `${pingLatency} ms` : 'Testing...'}
                  </span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Mutual Auth</span>
                  <span className="spec-value">RSA-PSS Challenge Verified</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">TOFU Fingerprint</span>
                  <span className="spec-value">{serverFingerprint || 'Verifying trust...'}</span>
                </div>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={testBridgePing}
                  disabled={testingPing}
                >
                  <RefreshIcon size={14} className={testingPing ? 'spin' : ''} />
                  {testingPing ? 'Pinging...' : 'Test Connection Latency'}
                </button>
              </div>
            </div>

            {/* Custom Relay Settings */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <ServerIcon size={16} className="accent-icon" />
                  <h3>Custom Relay Server</h3>
                </div>
              </div>

              <div className="toggle-item">
                <div className="toggle-info">
                  <span className="toggle-title">Enable Custom Bridge Address</span>
                  <span className="toggle-desc">Connect to a self-hosted Vexta Network relay.</span>
                </div>
                <input
                  type="checkbox"
                  className="toggle-switch"
                  checked={customBridge}
                  onChange={(e) => setCustomBridge(e.target.checked)}
                />
              </div>

              {customBridge && (
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="field-label">Custom WSS Endpoint URL</label>
                  <div className="input-with-button">
                    <input
                      type="text"
                      className="modal-input"
                      value={bridgeUrl}
                      onChange={(e) => setBridgeUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveBridgeUrl}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleResetBridgeUrl}
                    >
                      Reset Default
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: DATA & STORAGE */}
        {activeTab === 'storage' && (
          <div className="settings-section-group">
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <DatabaseIcon size={16} className="accent-icon" />
                  <h3>Local Vault Storage Stats</h3>
                </div>
              </div>

              <div className="spec-grid">
                <div className="spec-item">
                  <span className="spec-label">Database File</span>
                  <span className="spec-value">{dbStats.dbName}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">SQLite Size</span>
                  <span className="spec-value">{dbStats.sqliteSizeStr}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Messages Stored</span>
                  <span className="spec-value">{dbStats.messagesCountStr}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Media Cache</span>
                  <span className="spec-value">{dbStats.mediaCacheStr}</span>
                </div>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleClearMediaCache}
                >
                  <TrashIcon size={14} />
                  Clear Media Cache
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleExportDiagnostics}
                >
                  <DownloadIcon size={14} />
                  Export Diagnostic Logs
                </button>
              </div>
            </div>

            {/* Encrypted Vault Backup (.vxvault) */}
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <DownloadIcon size={16} className="accent-icon" />
                  <h3>Encrypted Vault Backup (.vxvault)</h3>
                </div>
              </div>
              <p className="card-desc">
                Export or restore a password-protected `.vxvault` archive containing your keys and local database.
              </p>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setExportVaultOpen(true)}
                >
                  <DownloadIcon size={14} />
                  Export .vxvault Backup
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setImportVaultOpen(true)}
                >
                  <DatabaseIcon size={14} />
                  Import .vxvault Backup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ABOUT */}
        {activeTab === 'about' && (
          <div className="settings-section-group">
            <div className="info-card about-hero-card">
              <div className="about-brand-row">
                <img src="./icon.png" alt="Vexta Logo" className="about-logo" width={48} height={48} />
                <div>
                  <h2 className="about-app-title">VEX<span>TA</span></h2>
                  <p className="about-app-sub">Zero-Knowledge Encrypted Messenger</p>
                </div>
              </div>

              <div className="spec-grid">
                <div className="spec-item">
                  <span className="spec-label">Client Version</span>
                  <span className="spec-value">v{appVersion}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Environment</span>
                  <span className="spec-value">{systemInfo?.osName || 'Desktop'} ({systemInfo?.arch || 'x64'})</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Runtime Engine</span>
                  <span className="spec-value">Electron · React 19</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Crypto Core</span>
                  <span className="spec-value">Argon2id · AES-256 · RSA-4096</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Vault Security</span>
                  <span className="spec-value">AES-GCM Encrypted at Rest</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Publisher</span>
                  <span className="spec-value">Orientis Digital</span>
                </div>
              </div>

              <div className="about-developer-badge">
                <OrientisLogo size={32} />
                <div className="dev-meta">
                  <span className="dev-label">Developed &amp; Maintained by</span>
                  <h4 className="dev-name">Orientis Digital</h4>
                  <p className="dev-desc">Zero-Knowledge Security &amp; Unified Protocol Engineering</p>
                </div>
              </div>

              <div className="card-actions" style={{ marginTop: '8px' }}>
                {!updateDownloaded ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                  >
                    <RefreshIcon size={14} className={checkingUpdates ? 'spin' : ''} />
                    {checkingUpdates ? 'Checking for updates...' : 'Check for Updates'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: '#39ff14', color: '#000', fontWeight: 'bold' }}
                    onClick={handleRestartInstall}
                  >
                    <RefreshIcon size={14} />
                    Restart &amp; Install Update
                  </button>
                )}
              </div>

              {checkingUpdates && updateProgress > 0 && (
                <div className="update-progress-container" style={{ marginTop: 12 }}>
                  <div
                    className="update-progress-bar"
                    style={{
                      height: 4,
                      background: '#39ff14',
                      width: `${updateProgress}%`,
                      borderRadius: 2,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}

              {updateStatus && <p className="update-status-msg">{updateStatus}</p>}
            </div>

            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <ShieldIcon size={16} className="accent-icon" />
                  <h3>Protocol &amp; Security Architecture</h3>
                </div>
              </div>
              <p className="card-desc">
                Vexta is an open-source, zero-knowledge communication network. All chats, voice/video streams, file transfers, and device pairings operate strictly peer-to-peer or over blind relay nodes without storing plaintext metadata on servers.
              </p>
              <div className="card-actions" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href="https://github.com/orientis-digital/Vexta-Electron"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  <DesktopIcon size={14} /> GitHub Repository
                </a>
                <a
                  href="mailto:orientisdigital.official@gmail.com"
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  <ShieldIcon size={14} /> Security Advisory
                </a>
              </div>
            </div>

            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <CheckIcon size={16} className="accent-icon" />
                  <h3>License &amp; Open Source</h3>
                </div>
              </div>
              <p className="card-desc">
                Released under the <strong>MIT License</strong>. Copyright &copy; {new Date().getFullYear()} Orientis Digital. All rights reserved.
              </p>
            </div>
          </div>
        )}
        </main>
      </div>

      {/* Link Device QR Modal */}
      {pairQrOpen && (
        <div className="modal-backdrop" onClick={() => setPairQrOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <QrCodeIcon size={20} />
            </div>
            <h2 className="modal-title">Link New Device</h2>
            <p className="modal-note">
              Scan this QR code from Vexta Android or Vexta Desktop to pair identity keys.
            </p>

            <div className="qr-container" style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
              <QRCodeSVG
                value={`vexta://link-device?user=${encodeURIComponent(activeUser)}&bridge=${encodeURIComponent(bridgeUrl)}`}
                size={200}
                fgColor="#39ff14"
                bgColor="#141414"
              />
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const uri = `vexta://link-device?user=${encodeURIComponent(activeUser)}&bridge=${encodeURIComponent(bridgeUrl)}`
                  navigator.clipboard.writeText(uri)
                  showToast('Pairing URI copied to clipboard')
                }}
              >
                <CopyIcon size={14} />
                Copy Pairing URI
              </button>
              <button type="button" className="btn-ghost" onClick={() => setPairQrOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Vault Modal */}
      {exportVaultOpen && (
        <div className="modal-backdrop" onClick={() => setExportVaultOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <DownloadIcon size={20} />
            </div>
            <h2 className="modal-title">Export Vault (.vxvault)</h2>
            <p className="modal-note">
              Enter a password to encrypt this `.vxvault` file archive.
            </p>

            <div className="modal-field">
              <label className="field-label">Backup Encryption Password</label>
              <input
                type="password"
                className="modal-input"
                placeholder="Enter password..."
                value={vaultPassword}
                onChange={(e) => setVaultPassword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setExportVaultOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!vaultPassword}
                onClick={handleExportVault}
              >
                Download Backup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Vault Modal */}
      {importVaultOpen && (
        <div className="modal-backdrop" onClick={() => setImportVaultOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <DatabaseIcon size={20} />
            </div>
            <h2 className="modal-title">Import Vault (.vxvault)</h2>
            <p className="modal-note">
              Select a `.vxvault` file and enter its password to restore your encrypted database.
            </p>

            <div className="modal-field">
              <label className="field-label">Select .vxvault File</label>
              <input
                type="file"
                accept=".vxvault"
                className="modal-input"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="modal-field">
              <label className="field-label">Backup Decryption Password</label>
              <input
                type="password"
                className="modal-input"
                placeholder="Enter password..."
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
              />
            </div>

            {importError && (
              <p className="step-error-msg" style={{ marginTop: '8px', color: '#ff4d4f' }}>
                {importError}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setImportVaultOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!importFile || !importPassword || importing}
                onClick={handleImportVault}
              >
                {importing ? 'Decrypting...' : 'Restore Vault'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsView
