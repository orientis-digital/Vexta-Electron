import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthSession } from '../crypto/session'
import { ErrorState } from '../components/ErrorState'

type Mode = 'welcome' | 'create' | 'restore' | 'import'

function parseSyncLink(link: string) {
  try {
    const raw = link.trim().replace(/^vexta-sync:\/\//i, '')
    const [userPart, queryPart] = raw.split('?')
    const [user] = userPart.split('@')
    const params = new URLSearchParams(queryPart || '')
    const recovery = params.get('recovery') || params.get('code') || ''
    return { username: user || '', recoveryCode: recovery }
  } catch {
    return { username: '', recoveryCode: '' }
  }
}

function SignupScreen() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('welcome')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [syncLink, setSyncLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdCode, setCreatedCode] = useState<string | null>(null)

  const handleSyncLinkChange = (val: string) => {
    setSyncLink(val)
    if (val.toLowerCase().startsWith('vexta-sync://')) {
      const parsed = parseSyncLink(val)
      if (parsed.username) setUsername(parsed.username)
      if (parsed.recoveryCode) setRecoveryCode(parsed.recoveryCode)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username.trim()) {
      setError('Username is required')
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }
    if (mode === 'create' && password !== confirmPw) {
      setError('Passwords do not match')
      return
    }

    const cleanName = username.trim()
    const res = await AuthSession.register(cleanName, password)
    if (!res.success) {
      setError(res.error || 'Registration failed')
      return
    }

    if (res.recoveryCode) {
      setCreatedCode(res.recoveryCode)
    } else {
      navigate('/loading')
    }
  }

  return (
    <div className="screen">
      <div className="login-card">
        <div className="login-logo">
          VEX<span>TA</span>
        </div>
        <div className="login-tagline">
          {mode === 'welcome'
            ? 'Identity Setup'
            : mode === 'create'
              ? 'Create Vault'
              : mode === 'restore'
                ? 'Log In & Restore'
                : 'Import Backup'}
        </div>

        {createdCode ? (
          <div className="created-code-modal">
            <h3 className="modal-title">Emergency Recovery Code</h3>
            <p className="modal-note">
              Save this 32-character recovery code in a secure offline location. It is the ONLY way to recover your account if you forget your password.
            </p>
            <div className="recovery-code-box" style={{ margin: '14px 0' }}>
              <span className="recovery-code-text">{createdCode}</span>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={() => navigate('/loading')}
            >
              I Saved My Recovery Code
            </button>
          </div>
        ) : (
          <>
            {mode === 'welcome' && (
              <>
                <div className="section-divider">
                  <span>CHOOSE PATH</span>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    setError(null)
                    setMode('create')
                  }}
                >
                  {'\u{1F5C4}'} Create Vault
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: '100%' }}
                  onClick={() => {
                    setError(null)
                    setMode('restore')
                  }}
                >
                  {'\u{1F504}'} Log In &amp; Restore
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: '100%' }}
                  onClick={() => {
                    setError(null)
                    setMode('import')
                  }}
                >
                  {'\u{1F4C1}'} Import Backup
                </button>
                <Link to="/login">{'\u2039'} Back to Unlock</Link>
              </>
            )}

            {(mode === 'create' || mode === 'restore') && (
              <form className="login-form" onSubmit={handleCreate}>
                <label>
                  Username
                  <input
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      setError(null)
                    }}
                    placeholder="Enter your Vexta username"
                    autoFocus
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError(null)
                    }}
                    placeholder="Vault password"
                  />
                </label>
                {mode === 'create' ? (
                  <label>
                    Confirm password
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => {
                        setConfirmPw(e.target.value)
                        setError(null)
                      }}
                      placeholder="Repeat password"
                    />
                  </label>
                ) : (
                  <>
                    {mode === 'restore' && (
                      <label>
                        Quick Sync Link (Optional)
                        <input
                          type="text"
                          value={syncLink}
                          onChange={(e) => handleSyncLinkChange(e.target.value)}
                          placeholder="Paste vexta-sync:// link to autofill"
                        />
                      </label>
                    )}
                    <label>
                      Recovery code
                      <input
                        type="password"
                        value={recoveryCode}
                        onChange={(e) => {
                          setRecoveryCode(e.target.value)
                          setError(null)
                        }}
                        placeholder="Paste 32-character recovery code"
                      />
                    </label>
                  </>
                )}

                {error && (
                  <ErrorState
                    title="Account Setup Error"
                    error={error}
                    onDismiss={() => setError(null)}
                  />
                )}

                <button type="submit" className="btn-primary">
                  {mode === 'create' ? '\u{1F511} Create Account' : '\u{1F511} Restore'}
                </button>
                <button type="button" className="btn-text" onClick={() => setMode('welcome')}>
                  {'\u2039'} Back
                </button>
              </form>
            )}

            {mode === 'import' && (
              <form className="login-form" onSubmit={handleCreate}>
                <label>
                  .vxvault file
                  <input type="file" accept=".vxvault" />
                </label>
                <label>
                  Backup password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Backup password"
                  />
                </label>
                <button type="submit" className="btn-primary">
                  Import Vault
                </button>
                <button type="button" className="btn-text" onClick={() => setMode('welcome')}>
                  {'\u2039'} Back
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SignupScreen
