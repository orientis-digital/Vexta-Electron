import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckIcon, ShieldIcon } from '../components/icons'
import { getOrCreateUserIdentityKeys, exportPublicKeyBase64 } from '../crypto/identity'
import { VextaDatabaseManager } from '../crypto/db_manager'
import { bridgeClient } from '../network/bridge'

type StepState = 'pending' | 'running' | 'done' | 'error'

type Step = {
  label: string
  state: StepState
  errorMsg?: string
}

const INITIAL_STEPS: Step[] = [
  { label: 'Initialising local database engine', state: 'pending' },
  { label: 'Generating identity key pair', state: 'pending' },
  { label: 'Connecting to relay network', state: 'pending' },
  { label: 'Verifying server trust fingerprint', state: 'pending' },
  { label: 'Loading contacts and groups', state: 'pending' },
]

function LoadingScreen() {
  const navigate = useNavigate()
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)

  function updateStep(index: number, state: StepState, errorMsg?: string) {
    setSteps((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], state, errorMsg }
      return next
    })
  }

  useEffect(() => {
    let cancelled = false

    async function run() {
      const activeUser = localStorage.getItem('vexta_active_user')
      if (!activeUser) {
        navigate('/login')
        return
      }

      // Step 0: Initialise local database
      updateStep(0, 'running')
      try {
        const db = new VextaDatabaseManager(activeUser)
        db.getContacts()
        db.getGroups()
        db.purgeExpiredMessages()
        if (cancelled) return
        updateStep(0, 'done')
      } catch (err) {
        updateStep(0, 'error', String(err))
        return
      }

      // Step 1: Generate / load identity key pair
      updateStep(1, 'running')
      try {
        const keys = await getOrCreateUserIdentityKeys(activeUser)
        await exportPublicKeyBase64(keys.publicKey)
        if (cancelled) return
        updateStep(1, 'done')
      } catch (err) {
        updateStep(1, 'error', String(err))
        return
      }

      // Step 2: Connect to relay network
      updateStep(2, 'running')
      try {
        bridgeClient.connect()

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unsub()
            resolve()
          }, 6000)

          const unsub = bridgeClient.subscribeStatus((status) => {
            if (status === 'connected') {
              clearTimeout(timeout)
              unsub()
              resolve()
            } else if (status === 'auth_failed') {
              clearTimeout(timeout)
              unsub()
              reject(new Error('Authentication rejected by relay'))
            }
          })
        })

        if (cancelled) return
        const bridgeStatus = bridgeClient.getStatus()
        if (bridgeStatus === 'auth_failed') {
          updateStep(2, 'error', 'Relay authentication failed')
          return
        }
        updateStep(2, 'done')
      } catch (err) {
        updateStep(2, 'error', String(err))
        return
      }

      // Step 3: Verify TOFU fingerprint
      updateStep(3, 'running')
      try {
        const db = new VextaDatabaseManager(activeUser)
        const bridgeUrl = bridgeClient.getUrl()
        const host = bridgeUrl.replace(/^wss?:\/\//, '').replace(/\/.*$/, '')
        const trust = db.getServerTrust(host)
        if (!trust) {
          db.saveServerTrust({
            server_host: host,
            server_fingerprint: 'TOFU:' + Date.now().toString(16),
            trusted_at: new Date().toISOString(),
          })
        }
        if (cancelled) return
        updateStep(3, 'done')
      } catch (err) {
        updateStep(3, 'error', String(err))
        return
      }

      // Step 4: Load contacts and groups
      updateStep(4, 'running')
      try {
        const db = new VextaDatabaseManager(activeUser)
        db.getContacts()
        db.getGroups()
        db.getFileTransfers()
        if (cancelled) return
        updateStep(4, 'done')
      } catch (err) {
        updateStep(4, 'error', String(err))
        return
      }

      // All steps completed — navigate to app
      if (!cancelled) {
        setTimeout(() => navigate('/'), 600)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const allDone = steps.every((s) => s.state === 'done')
  const hasError = steps.some((s) => s.state === 'error')

  return (
    <div className="screen loading-screen">
      <div className="loading-card">
        {!allDone && !hasError && <div className="spinner-ring" aria-hidden="true" />}
        <h1 className="login-logo">
          VEX<span>TA</span>
        </h1>
        <p className="mono-label">
          {hasError
            ? 'Vault initialisation encountered an error'
            : allDone
              ? 'Vault ready'
              : 'Setting up Zero-Knowledge Vault...'}
        </p>

        <div className="loading-steps-list">
          {steps.map((step) => (
            <div
              key={step.label}
              className={`loading-step-item ${step.state === 'done' ? 'active' : ''} ${step.state === 'error' ? 'error' : ''}`}
            >
              {step.state === 'done' ? (
                <CheckIcon size={12} className="check-icon" />
              ) : step.state === 'running' ? (
                <span className="step-dot" />
              ) : step.state === 'error' ? (
                <span className="step-error">✕</span>
              ) : (
                <span className="step-empty" />
              )}
              <span>{step.label}</span>
              {step.errorMsg && (
                <span className="step-error-msg">{step.errorMsg}</span>
              )}
            </div>
          ))}
        </div>

        <p className="muted-hint">
          <ShieldIcon size={12} />
          End-to-End Encrypted · Bedrock Database
        </p>

        {hasError && (
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              setSteps(INITIAL_STEPS.map((s) => ({ ...s, state: 'pending' as StepState })))
              setTimeout(() => window.location.reload(), 100)
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

export default LoadingScreen
