import { useEffect, useState } from 'react'
import { DatabaseIcon, RefreshIcon, TrashIcon } from './icons'

export function DbErrorModal() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    function handleDbError(e: Event) {
      const customEvent = e as CustomEvent<{ message: string }>
      setErrorMessage(customEvent.detail?.message || 'Cannot access local database')
    }

    window.addEventListener('vexta:db-error', handleDbError)
    return () => window.removeEventListener('vexta:db-error', handleDbError)
  }, [])

  if (!errorMessage) return null

  function handleResetCache() {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {}
    window.location.reload()
  }

  function handleRetry() {
    setErrorMessage(null)
    window.location.reload()
  }

  return (
    <div
      className="db-error-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="db-error-card"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: '#121215',
          border: '1px solid rgba(255, 77, 79, 0.4)',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 77, 79, 0.15)',
            border: '1px solid rgba(255, 77, 79, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#ff4d4f',
          }}
        >
          <DatabaseIcon size={28} />
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#ff4d4f' }}>
          Cannot Access Database
        </h3>

        <p style={{ fontSize: '13px', color: '#aaa', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          Vexta encountered a storage permissions or database locking error while opening local SQLite data.
        </p>

        <div
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#ff7875',
            marginBottom: '24px',
            wordBreak: 'break-word',
            textAlign: 'left',
          }}
        >
          {errorMessage}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 16px',
              background: 'var(--accent, #39ff14)',
              color: '#000',
              fontWeight: 700,
              fontSize: '13px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <RefreshIcon size={16} />
            Retry Access
          </button>

          <button
            type="button"
            onClick={handleResetCache}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 16px',
              background: 'rgba(255, 77, 79, 0.15)',
              color: '#ff4d4f',
              fontWeight: 600,
              fontSize: '13px',
              border: '1px solid rgba(255, 77, 79, 0.3)',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <TrashIcon size={16} />
            Clear Storage
          </button>
        </div>
      </div>
    </div>
  )
}
