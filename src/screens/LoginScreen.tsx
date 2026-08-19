import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getRegisteredAccounts,
  recoverAccount,
} from '../crypto/auth'
import { AuthSession } from '../crypto/session'
import { bridgeClient } from '../network/bridge'
import { base64ToUtf8 } from '../network/codec'
import { VextaDatabaseManager } from '../crypto/db_manager'
import { hashPasscode } from '../crypto/vault_backup'
import { ArrowLeft, Laptop, OrientisLogo } from '../components/icons'
import { ErrorState } from '../components/ErrorState'
import { playVaultUnlockSound } from '../core/sound_effects'

function SectionDivider({ label }: { label?: string }) {
  return (
    <div className="section-divider">
      {label ? <span>{label}</span> : null}
    </div>
  )
}

const RECOVERY_HEX = /^[0-9a-fA-F]{32}$/

function LoginScreen() {
  const navigate = useNavigate()
  const registered = useMemo(() => getRegisteredAccounts(), [])
  const localAccountNames = useMemo(() => registered.map((a) => a.username), [registered])

  const [selectedAccount, setSelectedAccount] = useState<string>(
    localAccountNames[0] || '',
  )
  const [customUsername, setCustomUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [customMode, setCustomMode] = useState(localAccountNames.length === 0)

  // Device Authorization Pending State
  const [pendingApprovalPin, setPendingApprovalPin] = useState<string | null>(null)
  const [pendingUsername, setPendingUsername] = useState('')

  // Recovery state
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryUser, setRecoveryUser] = useState(selectedAccount || '')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [recoveryError, setRecoveryError] = useState('')

  const activeUsername = customMode ? customUsername : selectedAccount

  useEffect(() => {
    const unsubApproved = bridgeClient.subscribeDeviceApproved((payload) => {
      if (payload.encryptedKeyBundle) {
        try {
          const decodedAccounts = base64ToUtf8(payload.encryptedKeyBundle)
          localStorage.setItem('vexta_registered_accounts', decodedAccounts)
        } catch (err) {
          console.warn('[LoginScreen] Error restoring key bundle:', err)
        }
      }
      if (payload.encryptedFriendRoster && pendingUsername) {
        try {
          const db = new VextaDatabaseManager(pendingUsername)
          const contacts = JSON.parse(base64ToUtf8(payload.encryptedFriendRoster))
          contacts.forEach((c: any) => db.addContact(c))
        } catch (err) {
          console.warn('[LoginScreen] Error restoring roster:', err)
        }
      }
      setPendingApprovalPin(null)
      setUnlocking(true)
      setTimeout(() => navigate('/loading'), 800)
    })

    const unsubRejected = bridgeClient.subscribeDeviceRejected((payload) => {
      setPendingApprovalPin(null)
      setAuthError(`Login declined: ${payload.reason || 'Primary device rejected authorization'}`)
    })

    return () => {
      unsubApproved()
      unsubRejected()
    }
  }, [pendingUsername, navigate])

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)

    // Check for Duress Emergency Wipe Passcode trigger
    const duressHash = localStorage.getItem('vexta_duress_passcode_hash')
    if (duressHash && password) {
      const inputHash = await hashPasscode(password)
      if (inputHash === duressHash) {
        AuthSession.logout()
        localStorage.clear()
        setAuthError('EMERGENCY WIPE TRIGGERED: All local vault data wiped successfully.')
        setPassword('')
        setTimeout(() => {
          window.location.reload()
        }, 1500)
        return
      }
    }

    const isLocal = localAccountNames.some((u) => u.toLowerCase() === activeUsername.trim().toLowerCase())

    if (!isLocal) {
      // Initiate Out-of-Band Device Authorization Flow
      const pin = Math.floor(100000 + Math.random() * 900000).toString()
      setPendingApprovalPin(pin)
      setPendingUsername(activeUsername.trim())

      localStorage.setItem('vexta_active_user', activeUsername.trim())
      bridgeClient.setAuthMode('login')
      bridgeClient.setSessionPasscode(password)
      bridgeClient.connect()
      return
    }

    const result = await AuthSession.login(activeUsername, password)
    if (!result.success) {
      setAuthError(result.error || 'Authentication failed')
      return
    }

    playVaultUnlockSound()
    setUnlocking(true)
    setTimeout(() => navigate('/loading'), 800)
  }

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!RECOVERY_HEX.test(recoveryCode.trim())) {
      setRecoveryError('Must be a valid 32-character hex code')
      return
    }
    if (!newPassword) {
      setRecoveryError('New password is required')
      return
    }

    const res = await recoverAccount(recoveryUser, recoveryCode, newPassword)
    if (!res.success) {
      setRecoveryError(res.error || 'Recovery failed')
      return
    }

    const loginRes = await AuthSession.login(recoveryUser, newPassword)
    if (!loginRes.success) {
      setRecoveryError(loginRes.error || 'Login after recovery failed')
      return
    }

    setRecoveryError('')
    setRecoveryOpen(false)
    playVaultUnlockSound()
    setUnlocking(true)
    setTimeout(() => navigate('/loading'), 800)
  }

  return (
    <div className="screen">
      <div className="login-card split">
        <div className="login-brand">
          <div className="brand-top">
            <img
              src="./icon.png"
              alt="Vexta logo"
              className="login-app-icon"
              width={72}
              height={72}
            />
            <div className="login-logo">
              VEX<span>TA</span>
            </div>
            <div className="login-tagline">Zero-Knowledge Messenger</div>
            <span className="pill">
              <span className="status-dot connected" />
              End-to-End Encrypted
            </span>
          </div>

          <p className="brand-blurb">
            Your identity, keys, and conversations never leave your devices.
            The bridge relays only encrypted blobs — it can never read your
            messages.
          </p>
        </div>

        <div className="login-panel">
          <div className="mono-label">Vault Access</div>

          {pendingApprovalPin ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '50%',
                    background: 'rgba(0, 229, 255, 0.15)',
                    color: '#00e5ff',
                    display: 'flex',
                  }}
                >
                  <Laptop size={32} />
                </div>
              </div>

              <h3 style={{ margin: '0 0 6px', fontSize: '18px', color: '#fff' }}>
                Waiting for Device Approval
              </h3>
              <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', margin: '0 0 16px' }}>
                Open Vexta on your logged-in device for <strong style={{ color: '#00ffff' }}>@{pendingUsername}</strong> and verify this PIN:
              </p>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '28px',
                  fontWeight: 700,
                  letterSpacing: '8px',
                  fontFamily: 'monospace',
                  color: '#39ff14',
                  margin: '0 auto 16px',
                  maxWidth: '260px',
                  boxShadow: '0 0 15px rgba(57, 255, 20, 0.2)',
                }}
              >
                {pendingApprovalPin.slice(0, 3)}-{pendingApprovalPin.slice(3)}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
                <span className="status-dot connected" style={{ animation: 'pulse 1.5s infinite' }} />
                Listening for primary device authorization...
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPendingApprovalPin(null)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={16} />
                  Cancel Login Request
                </button>

                <button
                  type="button"
                  className="btn-text"
                  style={{ fontSize: '12px', color: '#ffaa00' }}
                  onClick={() => {
                    setPendingApprovalPin(null)
                    setRecoveryOpen(true)
                  }}
                >
                  Device 1 Unavailable? Restore with Emergency Recovery Code
                </button>
              </div>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleUnlock} noValidate>
            {!customMode && localAccountNames.length > 0 ? (
              <label>
                <span className="field-label">Select Registered Account</span>
                <select
                  name="account"
                  value={selectedAccount}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomMode(true)
                    } else {
                      setSelectedAccount(e.target.value)
                      setAuthError(null)
                    }
                  }}
                >
                  {localAccountNames.map((a) => (
                    <option key={a} value={a}>
                      @{a}
                    </option>
                  ))}
                  <option value="__custom__">+ Enter Other Username...</option>
                </select>
              </label>
            ) : (
              <label>
                <span className="field-label">Username</span>
                <input
                  value={customUsername}
                  onChange={(e) => {
                    setCustomUsername(e.target.value)
                    setAuthError(null)
                  }}
                  placeholder="Enter your Vexta username"
                  autoComplete="username"
                  autoFocus
                />
                {localAccountNames.length > 0 && (
                  <button
                    type="button"
                    className="btn-text"
                    style={{ fontSize: '11px', marginTop: '4px', textAlign: 'left' }}
                    onClick={() => setCustomMode(false)}
                  >
                    \u2039 Select from registered accounts
                  </button>
                )}
              </label>
            )}

            <label>
              <span className="field-label">Master Password</span>
              <span className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setAuthError(null)
                  }}
                  placeholder="Enter your vault password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="reveal-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? '\u{1F441}' : '\u{1F575}'}
                </button>
              </span>
            </label>

            {authError && (
              <ErrorState
                title="Vault Authentication Error"
                error={authError}
                onDismiss={() => setAuthError(null)}
              />
            )}

            <button type="submit" className="btn-primary" disabled={unlocking}>
              {unlocking ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Unlocking Vault...
                </>
              ) : (
                <>
                  {'\u{1F513}'} Unlock Vault
                </>
              )}
            </button>
          </form>
          )}

          <button
            type="button"
            className="btn-text forgot-btn"
            onClick={() => {
              setRecoveryUser(activeUsername || 'Guest')
              setRecoveryOpen(true)
            }}
          >
            Forgot Password?
          </button>

          <SectionDivider label="NEW HERE?" />

          <div className="action-row">
            <Link to="/signup" className="action-btn">
              + Sign Up
            </Link>
            <Link to="/signup" className="action-btn">
              ↻ Restore
            </Link>
            <Link to="/signup" className="action-btn">
              ⇅ Import
            </Link>
          </div>

          <div className="login-footer-brand">
            <OrientisLogo size={20} />
            <span>Developed by <b>Orientis Digital</b></span>
          </div>
        </div>
      </div>

      {recoveryOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setRecoveryOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-title"
          >
            <h2 id="recovery-title" className="modal-title">
              {'\u{1F511}'} Account Recovery (@{recoveryUser})
            </h2>
            <p className="modal-note">
              Enter your 32-character emergency recovery key to reset your Master Password.
            </p>
            <form onSubmit={handleRecover} className="login-form" noValidate>
              <label>
                <span className="field-label">Recovery Code</span>
                <input
                  value={recoveryCode}
                  onChange={(e) => {
                    setRecoveryCode(e.target.value)
                    setRecoveryError('')
                  }}
                  placeholder="32-character hex code (e.g. a8f9c2d1e4b301758f2a4e9b6c3d0e1f)"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <label>
                <span className="field-label">New Master Password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </label>

              {recoveryError && (
                <div className="auth-error-box" role="alert">
                  <span>{recoveryError}</span>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => setRecoveryOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Recover &amp; Reset Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginScreen
