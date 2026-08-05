import { useEffect, useState } from 'react'
import { AuthSession } from '../crypto/session'
import { bridgeClient } from '../network/bridge'
import { ShieldAlert, Laptop, CheckCircle, XCircle } from 'lucide-react'

type PendingDeviceRequest = {
  deviceId: string
  deviceName: string
  osName: string
  pinChallenge: string
  devicePubKey: string
}

export function DeviceApprovalModal() {
  const [pendingRequest, setPendingRequest] = useState<PendingDeviceRequest | null>(null)
  const [inputPin, setInputPin] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isApproving, setIsApproving] = useState(false)

  useEffect(() => {
    const unsubscribe = bridgeClient.subscribeDeviceRequests((payload) => {
      setPendingRequest(payload)
      setInputPin('')
      setErrorMsg('')
    })
    return () => unsubscribe()
  }, [])

  if (!pendingRequest) {
    return null
  }

  const handleApprove = async () => {
    setErrorMsg('')
    if (pendingRequest.pinChallenge && inputPin.trim() !== pendingRequest.pinChallenge.trim()) {
      setErrorMsg('Invalid PIN code. Please check the 6-digit PIN on your new device.')
      return
    }

    setIsApproving(true)
    try {
      await AuthSession.approvePendingDevice(pendingRequest.deviceId)
      setPendingRequest(null)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to approve device')
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    setIsApproving(true)
    try {
      await AuthSession.rejectPendingDevice(pendingRequest.deviceId)
      setPendingRequest(null)
    } catch (err: any) {
      console.warn('[DeviceApproval] Error rejecting device:', err)
    } finally {
      setIsApproving(false)
    }
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="modal-card" style={{ maxWidth: '440px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '50%',
              background: 'rgba(255, 170, 0, 0.15)',
              color: '#ffaa00',
              display: 'flex',
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' }}>
              New Device Login Attempt
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              Out-of-band device authorization required
            </p>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Laptop size={18} style={{ color: '#00e5ff' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#fff' }}>
              {pendingRequest.deviceName}
            </span>
            <span
              style={{
                fontSize: '11px',
                background: 'rgba(0, 229, 255, 0.15)',
                color: '#00e5ff',
                padding: '2px 8px',
                borderRadius: '12px',
                marginLeft: 'auto',
              }}
            >
              {pendingRequest.osName}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)' }}>
            Device ID: <code style={{ color: '#00ffff' }}>{pendingRequest.deviceId.slice(0, 16)}...</code>
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '6px' }}>
            Enter 6-Digit PIN from New Device
          </label>
          <input
            type="text"
            maxLength={6}
            value={inputPin}
            onChange={(e) => {
              setInputPin(e.target.value)
              setErrorMsg('')
            }}
            placeholder={`PIN: ${pendingRequest.pinChallenge}`}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '18px',
              letterSpacing: '4px',
              textAlign: 'center',
              fontFamily: 'monospace',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.4)',
              color: '#fff',
            }}
          />
          {errorMsg && (
            <p style={{ color: '#ff6b6b', fontSize: '12px', marginTop: '6px', margin: '6px 0 0' }}>
              {errorMsg}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReject}
            disabled={isApproving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderColor: '#ff6b6b', color: '#ff6b6b' }}
          >
            <XCircle size={16} />
            Decline & Block
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApprove}
            disabled={isApproving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CheckCircle size={16} />
            {isApproving ? 'Authorizing...' : 'Approve Device'}
          </button>
        </div>
      </div>
    </div>
  )
}
