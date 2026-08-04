import { useEffect, useRef, useState } from 'react'
import { webrtcManager, type WebRTCState } from '../network/webrtc'
import {
  MicIcon,
  PhoneOffIcon,
  VideoIcon,
  CloseIcon,
  ShieldIcon,
} from './icons'

export function CallModal() {
  const [callState, setCallState] = useState<WebRTCState>(webrtcManager.getState())
  const [duration, setDuration] = useState(0)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  useEffect(() => {
    const unsubscribe = webrtcManager.subscribe((state) => {
      setCallState(state)
    })
    return unsubscribe
  }, [])

  // Call duration counter
  useEffect(() => {
    let timer: any = null
    if (callState.status === 'active') {
      timer = setInterval(() => {
        setDuration((prev) => prev + 1)
      }, 1000)
    } else {
      setDuration(0)
    }
    return () => clearInterval(timer)
  }, [callState.status])

  // Attach local media stream to local video element
  useEffect(() => {
    if (localVideoRef.current && callState.localStream) {
      localVideoRef.current.srcObject = callState.localStream
    }
  }, [callState.localStream, callState.isPopout])

  // Attach remote streams to remote video elements
  useEffect(() => {
    callState.remoteStreams.forEach(({ peerId, stream }) => {
      const el = remoteVideoRefs.current.get(peerId)
      if (el && el.srcObject !== stream) {
        el.srcObject = stream
      }
    })
  }, [callState.remoteStreams, callState.isPopout])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (callState.status === 'idle') return null

  // 1. INCOMING CALL BANNER MODAL
  if (callState.status === 'incoming') {
    return (
      <div className="incoming-call-overlay">
        <div className="incoming-call-card">
          <div className="incoming-avatar">
            {callState.caller?.charAt(0).toUpperCase()}
          </div>
          <div className="incoming-info">
            <h3>{callState.caller}</h3>
            <p>
              <ShieldIcon size={12} /> Incoming Encrypted {callState.isVideo ? 'Video' : 'Voice'} Call
            </p>
          </div>

          <div className="incoming-actions">
            <button
              type="button"
              className="btn-call-accept voice"
              title="Accept Voice Call"
              onClick={() => webrtcManager.acceptCall(false)}
            >
              <MicIcon size={18} />
              <span>Voice</span>
            </button>

            <button
              type="button"
              className="btn-call-accept video"
              title="Accept Video Call"
              onClick={() => webrtcManager.acceptCall(true)}
            >
              <VideoIcon size={18} />
              <span>Video</span>
            </button>

            <button
              type="button"
              className="btn-call-decline"
              title="Decline Call"
              onClick={() => webrtcManager.endCall()}
            >
              <PhoneOffIcon size={18} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 2. DISCORD-STYLE POP-OUT MINI OVERLAY BAR
  if (callState.isPopout) {
    return (
      <div className="popout-mini-bar">
        <div className="popout-status-dot active" />
        <span className="popout-title">{callState.target}</span>
        <span className="popout-timer">{formatTime(duration)}</span>

        <div className="popout-actions">
          <button
            type="button"
            className={`popout-icon-btn ${callState.isMuted ? 'off' : ''}`}
            title={callState.isMuted ? 'Unmute' : 'Mute'}
            onClick={() => webrtcManager.toggleMute()}
          >
            <MicIcon size={14} />
          </button>

          <button
            type="button"
            className="popout-icon-btn"
            title="Expand Full Screen"
            onClick={() => webrtcManager.togglePopout()}
          >
            ↗
          </button>

          <button
            type="button"
            className="popout-icon-btn danger"
            title="End Call"
            onClick={() => webrtcManager.endCall()}
          >
            <PhoneOffIcon size={14} />
          </button>
        </div>
      </div>
    )
  }

  // 3. FULL-SCREEN / EXPANDED CALL MODAL OVERLAY
  return (
    <div className="call-overlay-backdrop">
      <div className="call-overlay-window">
        {/* Header Bar */}
        <div className="call-window-header">
          <div className="call-peer-meta">
            <h3>{callState.target}</h3>
            <span className="call-badge">
              <ShieldIcon size={12} /> {callState.isGroup ? 'Group E2EE Call' : 'Zero-Knowledge Call'}
            </span>
          </div>

          <div className="call-window-actions">
            <span className="call-timer-display">{formatTime(duration)}</span>
            <button
              type="button"
              className="icon-btn"
              title="Pop-Out Mini Bar (Discord Style)"
              onClick={() => webrtcManager.togglePopout()}
            >
              ↘ Pop-Out
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Minimize"
              onClick={() => webrtcManager.togglePopout()}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>

        {/* Video / Avatar Grid */}
        <div className="call-media-viewport">
          {callState.remoteStreams.length > 0 ? (
            <div className={`remote-video-grid items-${callState.remoteStreams.length}`}>
              {callState.remoteStreams.map(({ peerId }) => (
                <div key={peerId} className="remote-video-tile">
                  <video
                    ref={(el) => {
                      if (el) remoteVideoRefs.current.set(peerId, el)
                      else remoteVideoRefs.current.delete(peerId)
                    }}
                    autoPlay
                    playsInline
                    className="remote-video-element"
                  />
                  <span className="peer-tile-label">{peerId}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="call-voice-placeholder">
              <div className="calling-avatar-pulse">
                {callState.target.charAt(0).toUpperCase()}
              </div>
              <h4>{callState.status === 'calling' ? 'Calling...' : 'Connected'}</h4>
              <p>{callState.status === 'calling' ? 'Waiting for peer to accept...' : 'E2EE Stream Active'}</p>
            </div>
          )}

          {/* Picture-in-Picture Self Video Preview */}
          {callState.isVideo && (
            <div className="pip-video-wrapper">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`pip-video-element ${callState.isCameraOff ? 'hidden' : ''}`}
              />
              {callState.isCameraOff && (
                <div className="pip-video-disabled">Camera Off</div>
              )}
            </div>
          )}
        </div>

        {/* Call Controls Toolbar */}
        <div className="call-controls-toolbar">
          <button
            type="button"
            className={`call-ctrl-btn ${callState.isMuted ? 'off' : ''}`}
            title={callState.isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            onClick={() => webrtcManager.toggleMute()}
          >
            <MicIcon size={20} />
            <span>{callState.isMuted ? 'Unmuted' : 'Mute'}</span>
          </button>

          <button
            type="button"
            className={`call-ctrl-btn ${callState.isCameraOff ? 'off' : ''}`}
            title={callState.isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
            onClick={() => webrtcManager.toggleCamera()}
          >
            <VideoIcon size={20} />
            <span>{callState.isCameraOff ? 'Start Video' : 'Stop Video'}</span>
          </button>

          <button
            type="button"
            className={`call-ctrl-btn ${callState.isScreenSharing ? 'active' : ''}`}
            title="Share Screen"
            onClick={() => webrtcManager.toggleScreenShare()}
          >
            <ShieldIcon size={20} />
            <span>{callState.isScreenSharing ? 'Stop Share' : 'Screen Share'}</span>
          </button>

          <button
            type="button"
            className="call-ctrl-btn end-call-btn"
            title="End Call"
            onClick={() => webrtcManager.endCall()}
          >
            <PhoneOffIcon size={20} />
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  )
}
