import React, { useEffect } from 'react'
import { playErrorSound } from '../core/sound_effects'

interface ErrorStateProps {
  title?: string
  error: Error | string
  onRetry?: () => void
  onDismiss?: () => void
  isRetrying?: boolean
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  error,
  onRetry,
  onDismiss,
  isRetrying = false,
}) => {
  const errorMessage = typeof error === 'string' ? error : error.message

  useEffect(() => {
    playErrorSound()
  }, [error])

  return (
    <div className="error-state-banner">
      <div className="error-state-content">
        <h4 className="error-state-title">{title}</h4>
        <p className="error-state-message">{errorMessage}</p>
      </div>

      <div className="error-state-actions">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="btn-secondary error-retry-btn"
          >
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="error-dismiss-btn"
            title="Dismiss error"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  )
}
