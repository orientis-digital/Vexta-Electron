import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  clearRegisteredAccounts,
  getRegisteredAccounts,
  recoverAccount,
} from '../crypto/auth'
import { AuthSession } from '../crypto/session'

import { hashPasscode } from '../crypto/vault_backup'

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

  // Recovery state
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryUser, setRecoveryUser] = useState(selectedAccount || '')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [recoveryError, setRecoveryError] = useState('')

  const activeUsername = customMode ? customUsername : selectedAccount

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

    const result = await AuthSession.login(activeUsername, password)
    if (!result.success) {
      setAuthError(result.error || 'Authentication failed')
      return
    }

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

    setRecoveryError('')
    setRecoveryOpen(false)
    setPassword(newPassword)
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

          <div className="brand-footer">
            <span className="footer-dot" aria-hidden="true" />
            Orientis Labs — Unified Tech Solutions
          </div>
        </div>

        <div className="login-panel">
          <div className="mono-label">Vault Access</div>

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
                <button
                  type="button"
                  className="btn-text"
                  style={{ fontSize: '11px', marginTop: '4px', textAlign: 'left', color: '#ff6b6b' }}
                  onClick={() => {
                    clearRegisteredAccounts()
                    window.location.reload()
                  }}
                >
                  Clear Saved Accounts List
                </button>
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
              <div className="auth-error-box" role="alert">
                <span>{authError}</span>
              </div>
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

          <button
            type="button"
            className="btn-ghost biometric-btn"
            onClick={() => {
              setPassword('password123')
              setAuthError(null)
            }}
          >
            <span className="biometric-glyph">{'\u{1F577}'}</span>
            Biometric Unlock (Demo)
          </button>

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
              {'\u21BB'} Restore
            </Link>
            <Link to="/signup" className="action-btn">
              {'\u21C5'} Import
            </Link>
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
