import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckIcon, ShieldIcon } from '../components/icons'

const STEPS = [
  'Deriving Argon2id Vault Key (64 MiB)...',
  'Initializing Bedrock SQLite Storage...',
  'Generating RSA-4096 Identity Key Pair...',
  'Connecting to Substrata Bridge Relay...',
  'Verifying Server TOFU Fingerprint...',
]

function LoadingScreen() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 1) return prev + 1
        return prev
      })
    }, 450)

    const timer = setTimeout(() => navigate('/'), 2600)
    return () => {
      clearInterval(stepInterval)
      clearTimeout(timer)
    }
  }, [navigate])

  return (
    <div className="screen loading-screen">
      <div className="loading-card">
        <div className="spinner-ring" aria-hidden="true" />
        <h1 className="login-logo">
          VEX<span>TA</span>
        </h1>
        <p className="mono-label">Setting up Zero-Knowledge Vault...</p>

        <div className="loading-steps-list">
          {STEPS.map((step, idx) => (
            <div
              key={step}
              className={`loading-step-item ${idx <= currentStep ? 'active' : ''}`}
            >
              {idx < currentStep ? (
                <CheckIcon size={12} className="check-icon" />
              ) : idx === currentStep ? (
                <span className="step-dot" />
              ) : (
                <span className="step-empty" />
              )}
              <span>{step}</span>
            </div>
          ))}
        </div>

        <p className="muted-hint">
          <ShieldIcon size={12} />
          End-to-End Encrypted \u00B7 SQLite Bedrock Database Ready
        </p>
      </div>
    </div>
  )
}

export default LoadingScreen
