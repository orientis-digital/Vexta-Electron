import { useEffect, useRef, useState } from 'react'
import { webrtcManager, type WebRTCState } from '../network/webrtc'
import { playCallConnectedSound, playCallDisconnectedSound } from '../core/sound_effects'
import {
  MicIcon,
  PhoneOffIcon,
  VideoIcon,
  CloseIcon,
  ShieldIcon,
  Laptop,
} from './icons'

function RemoteVideoTile({ peerId, stream }: { peerId: string; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="remote-video-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="remote-video-element"
      />
      <span className="peer-tile-label">{peerId}</span>
    </div>
  )
}

function LocalVideoPreview({ stream, isCameraOff }: { stream: MediaStream | null; isCameraOff: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="pip-video-wrapper">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`pip-video-element ${isCameraOff ? 'hidden' : ''}`}
      />
      {isCameraOff && <div className="pip-video-disabled">Camera Off</div>}
    </div>
  )
}

function AudioEqualizerVisualizer({ stream }: { stream: MediaStream | null }) {
  const [volume, setVolume] = useState(0)

  useEffect(() => {
    if (!stream) return
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let animFrame: number

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64

      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const updateVolume = () => {
        analyser!.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        setVolume(Math.min(100, Math.round((avg / 128) * 100)))
        animFrame = requestAnimationFrame(updateVolume)
      }

      updateVolume()
    } catch (e) {
      console.warn('[AudioVisualizer] Error setting up audio analyzer:', e)
    }

    return () => {
      cancelAnimationFrame(animFrame)
      if (audioCtx) {
        try {
          audioCtx.close()
        } catch {}
      }
    }
  }, [stream])

  return (
    <div className="audio-equalizer-bars">
      <span className="bar" style={{ height: `${Math.max(12, volume * 0.8)}px` }} />
      <span className="bar" style={{ height: `${Math.max(22, volume * 1.3)}px` }} />
      <span className="bar" style={{ height: `${Math.max(8, volume * 1.6)}px` }} />
      <span className="bar" style={{ height: `${Math.max(28, volume * 1.1)}px` }} />
      <span className="bar" style={{ height: `${Math.max(16, volume * 0.9)}px` }} />
    </div>
  )
}

export function CallModal() {
  const [callState, setCallState] = useState<WebRTCState>(webrtcManager.getState())
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const unsubscribe = webrtcManager.subscribe((state) => {
      setCallState(state)
    })
    return unsubscribe
  }, [])

  // Call duration counter
  const prevStatusRef = useRef(callState.status)

  useEffect(() => {
    const prev = prevStatusRef.current
    const curr = callState.status

    if (curr === 'active' && prev !== 'active') {
      playCallConnectedSound()
    } else if (curr === 'idle' && (prev === 'active' || prev === 'calling' || prev === 'incoming')) {
      playCallDisconnectedSound()
    }

    prevStatusRef.current = curr
  }, [callState.status])

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

  // Acoustic Web Audio Synth Ringtone for Incoming Calls
  useEffect(() => {
    if (callState.status !== 'incoming') return

    let audioCtx: AudioContext | null = null
    let ringInterval: any = null

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()

      const playRingChime = () => {
        if (!audioCtx || audioCtx.state === 'closed') return
        const osc1 = audioCtx.createOscillator()
        const osc2 = audioCtx.createOscillator()
        const gain = audioCtx.createGain()

        osc1.type = 'sine'
        osc2.type = 'sine'
        osc1.frequency.setValueAtTime(440, audioCtx.currentTime)
        osc2.frequency.setValueAtTime(480, audioCtx.currentTime)

        gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2)

        osc1.connect(gain)
        osc2.connect(gain)
        gain.connect(audioCtx.destination)

        osc1.start()
        osc2.start()
        osc1.stop(audioCtx.currentTime + 1.2)
        osc2.stop(audioCtx.currentTime + 1.2)
      }

      playRingChime()
      ringInterval = setInterval(playRingChime, 2500)
    } catch (e) {
      console.warn('[CallModal] Web Audio ringtone deferred:', e)
    }

    return () => {
      if (ringInterval) clearInterval(ringInterval)
      if (audioCtx) {
        try {
          audioCtx.close()
        } catch {}
      }
    }
  }, [callState.status])

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
              className="btn-call-accept"
              title="Accept Call"
              onClick={() => webrtcManager.acceptCall(callState.isVideo)}
            >
              {callState.isVideo ? <VideoIcon size={16} /> : <MicIcon size={16} />}
              <span>Accept</span>
            </button>

            <button
              type="button"
              className="btn-call-decline"
              title="Decline Call"
              onClick={() => webrtcManager.endCall()}
            >
              <PhoneOffIcon size={16} />
              <span>Decline</span>
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
              {callState.remoteStreams.map(({ peerId, stream }) => (
                <RemoteVideoTile key={peerId} peerId={peerId} stream={stream} />
              ))}
            </div>
          ) : (
            <div className="call-voice-placeholder">
              <div className="calling-avatar-pulse">
                {callState.target.charAt(0).toUpperCase()}
              </div>
              <AudioEqualizerVisualizer stream={callState.remoteStreams[0]?.stream || callState.localStream} />
              <h4>{callState.status === 'calling' ? 'Calling...' : 'Connected'}</h4>
              <p>{callState.status === 'calling' ? 'Waiting for peer to accept...' : 'E2EE Stream Active'}</p>
            </div>
          )}

          {/* Picture-in-Picture Self Video Preview */}
          {callState.isVideo && (
            <LocalVideoPreview stream={callState.localStream} isCameraOff={callState.isCameraOff} />
          )}

          {/* Background Audio playback for all active remote peer streams */}
          {callState.remoteStreams.map(({ peerId, stream }) => (
            <audio
              key={`audio_${peerId}`}
              ref={(node) => {
                if (node && stream) {
                  node.srcObject = stream
                }
              }}
              autoPlay
              playsInline
            />
          ))}
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
            <span>{callState.isMuted ? 'Unmute' : 'Mute'}</span>
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
            <Laptop size={20} />
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
