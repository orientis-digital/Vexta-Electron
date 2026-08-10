import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Vexta System] Unhandled Promise Rejection:', event.reason)
    const rawMsg = event.reason?.message || (typeof event.reason === 'string' ? event.reason : 'Background async operation failed')
    window.dispatchEvent(
      new CustomEvent('vexta_server_error', {
        detail: { message: `Async Error: ${rawMsg}` },
      }),
    )
  })

  window.addEventListener('error', (event) => {
    console.error('[Vexta System] Uncaught Global Error:', event.error || event.message)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
)
