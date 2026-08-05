import React, { Component, type ReactNode } from 'react'
import { ShieldIcon, RefreshIcon } from './icons'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Vexta React ErrorBoundary] Caught error:', error, errorInfo)
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: '#0c0c0e',
          color: '#fff',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div className="info-card" style={{
            maxWidth: '500px',
            padding: '32px',
            background: 'rgba(18, 18, 20, 0.95)',
            border: '1px solid rgba(255, 77, 79, 0.3)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#ff4d4f', marginBottom: '16px' }}>
              <ShieldIcon size={24} />
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Vexta Application Guard</h2>
            </div>

            <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '20px', lineHeight: 1.5 }}>
              An unexpected interface error occurred. Your cryptographic keys and offline vault data remain safely encrypted.
            </p>

            {this.state.error && (
              <pre style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle, #2a2a2a)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#ff7875',
                overflowX: 'auto',
                textAlign: 'left',
                marginBottom: '20px',
                maxHeight: '120px'
              }}>
                {this.state.error.message}
              </pre>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={this.handleReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--accent, #39ff14)',
                color: '#000',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              <RefreshIcon size={16} />
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
