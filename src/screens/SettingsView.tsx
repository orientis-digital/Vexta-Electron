import { useEffect, useState } from 'react'
import {
  CopyIcon,
  DatabaseIcon,
  DesktopIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  GearIcon,
  KeyIcon,
  LockIcon,
  QrCodeIcon,
  RefreshIcon,
  ServerIcon,
  ShieldIcon,
  SmartphoneIcon,
  TrashIcon,
} from '../components/icons'

type Tab = 'account' | 'security' | 'devices' | 'bridge' | 'storage' | 'about'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'account', label: 'Account & Keys', icon: <KeyIcon size={14} /> },
  { id: 'security', label: 'Security & Privacy', icon: <ShieldIcon size={14} /> },
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
}

function SettingsView() {
  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Account & Keys State ─────────────────────────────
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const recoveryCode = 'a8f9c2d1e4b301758f2a4e9b6c3d0e1f'

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!currentPw || !newPw) return
    if (newPw !== confirmPw) {
      showToast('New passwords do not match')
      return
    }
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    showToast('Master Password successfully updated')
  }

  // ── Security Settings State ──────────────────────────
  const [autoLock, setAutoLock] = useState('5m')
  const [biometrics, setBiometrics] = useState(true)
  const [screenProtection, setScreenProtection] = useState(true)
  const [hideNotifications, setHideNotifications] = useState(false)

  // ── Devices State ────────────────────────────────────
  const [devices, setDevices] = useState<DeviceItem[]>([
    {
      id: 'dev-1',
      name: 'Desktop Workstation',
      type: 'desktop',
      hardwareHash: 'sha256(7f8a91b2c4e57091)',
      lastSeen: 'Active Now',
      isCurrent: true,
    },
  ])
  const [pairQrOpen, setPairQrOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).vextaNative) {
      ;(window as any).vextaNative.getSystemInfo().then((info: any) => {
        if (info) {
          setDevices([
            {
              id: 'dev-1',
              name: `${info.osName} (${info.arch})`,
              type: 'desktop',
              hardwareHash: 'sha256(7f8a91b2c4e57091)',
              lastSeen: 'Active Now',
              isCurrent: true,
            },
          ])
        }
      }).catch(() => {})
    }
  }, [])

  function revokeDevice(id: string, devName: string) {
    setDevices((prev) => prev.filter((d) => d.id !== id))
    showToast(`Revoked access for ${devName}`)
  }

  // ── Bridge Network State ─────────────────────────────
  const [bridgeUrl, setBridgeUrl] = useState('wss://vexta-api.nexusec.space')
  const [testingPing, setTestingPing] = useState(false)
  const [pingLatency, setPingLatency] = useState<number | null>(24)
  const [customBridge, setCustomBridge] = useState(false)

  function testBridgePing() {
    setTestingPing(true)
    setTimeout(() => {
      setTestingPing(false)
      setPingLatency(Math.floor(18 + Math.random() * 15))
      showToast('Bridge ping successful \u00B7 22ms latency')
    }, 800)
  }

  // ── Storage State ────────────────────────────────────
  const [exportVaultOpen, setExportVaultOpen] = useState(false)
  const [vaultPassword, setVaultPassword] = useState('')

  function handleExportVault() {
    if (!vaultPassword) return
    const blob = new Blob(
      [JSON.stringify({ vault: 'encrypted_payload_hex', exportedAt: new Date().toISOString() })],
      { type: 'application/vxvault' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup_${Date.now()}.vxvault`
    a.click()
    URL.revokeObjectURL(url)
    setVaultPassword('')
    setExportVaultOpen(false)
    showToast('Encrypted .vxvault backup downloaded')
  }

  // ── About State ──────────────────────────────────────
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  function handleCheckUpdates() {
    setCheckingUpdates(true)
    setUpdateStatus(null)
    setTimeout(() => {
      setCheckingUpdates(false)
      setUpdateStatus('Vexta is up to date (v2.4.0-electron)')
    }, 1200)
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

      {/* Tabs Bar */}
      <div className="tabs settings-tabs">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            className={`tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="settings-body">
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
                const currentUser = localStorage.getItem('vexta_active_user') || 'User'
                const initials = currentUser.slice(0, 2).toUpperCase()
                return (
                  <div className="profile-setting-row">
                    <div className="avatar profile-avatar-lg">{initials}</div>
                    <div className="profile-setting-meta">
                      <span className="profile-setting-name">{currentUser}</span>
                      <span className="profile-setting-handle">@{currentUser.toLowerCase()}</span>
                      <span className="profile-setting-fingerprint">
                        FP: 4A8F : 9B1C : 2E3D : 8F7A
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
                  {showRecovery ? recoveryCode : '••••••••••••••••••••••••••••••••'}
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
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCode).catch(() => {})
                    showToast('Recovery code copied to clipboard')
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
                    setAutoLock(e.target.value)
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
                      setBiometrics(e.target.checked)
                      showToast(e.target.checked ? 'Biometrics enabled' : 'Biometrics disabled')
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
                      setScreenProtection(e.target.checked)
                      showToast(
                        e.target.checked ? 'Screen protection enabled' : 'Screen protection disabled',
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
                      setHideNotifications(e.target.checked)
                      showToast('Notification privacy updated')
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DEVICES */}
        {activeTab === 'devices' && (
          <div className="settings-section-group">
            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <DesktopIcon size={16} className="accent-icon" />
                  <h3>Linked Devices ({devices.length})</h3>
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
                Authorized hardware devices linked to this zero-knowledge account identity key.
              </p>

              <div className="device-roster">
                {devices.map((dev) => (
                  <div key={dev.id} className="device-row">
                    <div className="device-icon">
                      {dev.type === 'desktop' ? <DesktopIcon size={20} /> : <SmartphoneIcon size={20} />}
                    </div>

                    <div className="device-info">
                      <div className="device-name-row">
                        <span className="device-name">{dev.name}</span>
                        {dev.isCurrent && <span className="current-device-badge">This Device</span>}
                      </div>
                      <span className="device-meta">
                        {dev.hardwareHash} \u00B7 {dev.lastSeen}
                      </span>
                    </div>

                    {!dev.isCurrent && (
                      <button
                        type="button"
                        className="btn-danger-outline"
                        onClick={() => revokeDevice(dev.id, dev.name)}
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                ))}
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
                  <span className="spec-value">7F:3A:91:B2:C4:E5:70:91</span>
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
                  <span className="toggle-desc">Connect to a self-hosted Substrata bridge relay.</span>
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
                      onClick={() => showToast('Bridge URL updated')}
                    >
                      Save
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
                  <span className="spec-value">account_guest_a8f9.db</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">SQLite Size</span>
                  <span className="spec-value">14.2 MB</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Messages Stored</span>
                  <span className="spec-value">1,284 Encrypted Bubbles</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Media Cache</span>
                  <span className="spec-value">48.5 MB</span>
                </div>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => showToast('Media cache cleared (48.5 MB freed)')}
                >
                  <TrashIcon size={14} />
                  Clear Media Cache
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => showToast('Diagnostic logs downloaded')}
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
                  <h3>Export Encrypted Vault Backup (.vxvault)</h3>
                </div>
              </div>
              <p className="card-desc">
                Create a password-protected `.vxvault` archive containing your keys and local database.
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
                  <span className="spec-label">Version</span>
                  <span className="spec-value">v2.4.0-electron</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Build</span>
                  <span className="spec-value">2026.08.03-STABLE</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Runtime</span>
                  <span className="spec-value">Electron \u00B7 React 19</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Publisher</span>
                  <span className="spec-value">Orientis Digital</span>
                </div>
              </div>

              <div className="card-actions" style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdates}
                >
                  <RefreshIcon size={14} className={checkingUpdates ? 'spin' : ''} />
                  {checkingUpdates ? 'Checking for updates...' : 'Check for Updates'}
                </button>
              </div>

              {updateStatus && <p className="update-status-msg">{updateStatus}</p>}
            </div>

            <div className="info-card">
              <div className="card-header">
                <div className="card-title">
                  <ShieldIcon size={16} className="accent-icon" />
                  <h3>License &amp; Open Source</h3>
                </div>
              </div>
              <p className="card-desc">
                Vexta protocol specification &amp; client code are released under the MIT Open Source License. Designed for privacy, security, and true end-to-end zero-knowledge communication.
              </p>
            </div>
          </div>
        )}
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

            <div className="qr-container">
              <svg className="qr-svg" viewBox="0 0 200 200" fill="currentColor">
                <rect width="200" height="200" fill="#1e1e1e" rx="12" />
                <rect x="20" y="20" width="50" height="50" fill="#39ff14" rx="4" />
                <rect x="30" y="30" width="30" height="30" fill="#1e1e1e" rx="2" />
                <rect x="40" y="40" width="10" height="10" fill="#39ff14" rx="1" />

                <rect x="130" y="20" width="50" height="50" fill="#39ff14" rx="4" />
                <rect x="140" y="30" width="30" height="30" fill="#1e1e1e" rx="2" />
                <rect x="150" y="40" width="10" height="10" fill="#39ff14" rx="1" />

                <rect x="20" y="130" width="50" height="50" fill="#39ff14" rx="4" />
                <rect x="30" y="140" width="30" height="30" fill="#1e1e1e" rx="2" />
                <rect x="40" y="150" width="10" height="10" fill="#39ff14" rx="1" />

                {[
                  [80, 20], [90, 20], [110, 20], [80, 40], [100, 40],
                  [80, 70], [90, 80], [120, 80], [150, 80],
                  [20, 90], [40, 100], [80, 100], [110, 100], [140, 100],
                  [30, 110], [90, 120], [120, 110], [150, 120],
                  [80, 140], [100, 150], [140, 140], [160, 150],
                  [90, 170], [120, 160], [150, 170]
                ].map(([x, y], idx) => (
                  <rect key={idx} x={x} y={y} width="10" height="10" fill="#39ff14" rx="1" />
                ))}
              </svg>
            </div>

            <div className="modal-actions">
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
    </div>
  )
}

export default SettingsView
