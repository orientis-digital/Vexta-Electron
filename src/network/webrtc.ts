/**
 * Vexta E2EE WebRTC Voice & Video Media Manager
 * Supports 1-on-1 and Group Mesh RTCPeerConnection instances,
 * local audio/video stream capturing, screen sharing, and STUN/ICE traversal.
 */

import { bridgeClient, cleanDecodePayload } from './bridge'
import { base64ToUtf8, utf8ToBase64 } from './codec'
import { VextaDatabaseManager } from '../crypto/db_manager'

export type CallStatus = 'idle' | 'incoming' | 'calling' | 'active' | 'ended'

export type RemotePeerStream = {
  peerId: string
  stream: MediaStream
}

export type WebRTCState = {
  status: CallStatus
  target: string
  caller?: string
  isGroup: boolean
  isVideo: boolean
  isMuted: boolean
  isCameraOff: boolean
  isScreenSharing: boolean
  isPopout: boolean
  localStream: MediaStream | null
  remoteStreams: RemotePeerStream[]
  sdpOffer?: any
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
}

class WebRTCManager {
  private state: WebRTCState = {
    status: 'idle',
    target: '',
    isGroup: false,
    isVideo: false,
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isPopout: false,
    localStream: null,
    remoteStreams: [],
  }

  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private pendingIceCandidates: Map<string, any[]> = new Map()
  private listeners: Set<(state: WebRTCState) => void> = new Set()
  private callTimeoutTimer: ReturnType<typeof setTimeout> | null = null

  private startCallTimeout() {
    this.clearCallTimeout()
    this.callTimeoutTimer = setTimeout(() => {
      if (this.state.status === 'calling' || this.state.status === 'incoming') {
        console.warn('[WebRTC] 30-second ring timeout reached. Terminating call...')
        this.endCall('timeout')
      }
    }, 30000)
  }

  private clearCallTimeout() {
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer)
      this.callTimeoutTimer = null
    }
  }

  constructor() {
    // Register signaling listeners with Bridge
    bridgeClient.subscribeMessages((msg) => {
      if (!msg.sender) return
      const rawInput = msg.wire_blob || msg.ciphertext || (msg as any).body || ''
      let text = rawInput
      try {
        if (msg.wire_blob) text = base64ToUtf8(msg.wire_blob)
        else if (msg.ciphertext) text = base64ToUtf8(msg.ciphertext)
        else if ((msg as any).body) text = base64ToUtf8((msg as any).body)
      } catch {
        text = rawInput
      }

      const payload = cleanDecodePayload(text) || cleanDecodePayload(rawInput)
      if (payload && typeof payload === 'object') {
        const cleanSender = (msg.sender || '').replace(/^@/, '')
        if (payload.type === 'call_offer') {
          this.handleInboundOffer(cleanSender, payload.sdp, payload.is_group, payload.is_video)
        } else if (payload.type === 'call_answer') {
          this.handleInboundAnswer(cleanSender, payload.sdp)
        } else if (payload.type === 'call_ice') {
          this.handleInboundIce(cleanSender, payload.candidate)
        } else if (payload.type === 'call_end') {
          this.handleInboundEnd(cleanSender, payload.reason)
        }
      }
    })
  }

  getState(): WebRTCState {
    return { ...this.state }
  }

  subscribe(listener: (state: WebRTCState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  private notify() {
    const current = this.getState()
    this.listeners.forEach((fn) => fn(current))
  }

  async initiateCall(target: string, isGroup = false, isVideo = false) {
    if (this.state.status !== 'idle') return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } } : false,
      })

      this.state = {
        status: 'calling',
        target,
        isGroup,
        isVideo,
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false,
        isPopout: false,
        localStream: stream,
        remoteStreams: [],
      }
      this.notify()

      if (isGroup) {
        // Group Mesh Call Signaling
        const activeUser = localStorage.getItem('vexta_active_user') || ''
        const dbName = activeUser
        if (dbName) {
          const { VextaDatabaseManager } = await import('../crypto/db_manager')
          const db = new VextaDatabaseManager(dbName)
          const members = db.getGroupMembers(target).filter((m) => m !== activeUser)
          for (const member of members) {
            await this.createAndSendOffer(member, stream, true)
          }
        }
      } else {
        // 1-on-1 Call Signaling
        await this.createAndSendOffer(target, stream, false)
      }
    } catch (err) {
      console.error('[WebRTC] Failed to capture local media:', err)
      this.endCall()
    }
  }

  private async createAndSendOffer(recipient: string, stream: MediaStream, isGroup: boolean) {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.peerConnections.set(recipient, pc)

    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        bridgeClient.sendBlindMessage(
          recipient,
          utf8ToBase64(JSON.stringify({ type: 'call_ice', candidate: event.candidate })),
        )
      }
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track])
      this.addRemoteStream(recipient, remoteStream)
      this.clearCallTimeout()
      this.state.status = 'active'
      this.notify()
    }

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer Connection state (${recipient}):`, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        this.handleInboundEnd(recipient)
      }
    }

    this.startCallTimeout()

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    bridgeClient.sendBlindMessage(
      recipient,
      utf8ToBase64(
        JSON.stringify({
          type: 'call_offer',
          sdp: offer,
          is_group: isGroup,
          is_video: this.state.isVideo,
        }),
      ),
    )
  }

  private handleInboundOffer(caller: string, sdp: any, isGroup = false, isVideo = false) {
    if (this.state.status !== 'idle') return

    this.startCallTimeout()
    this.state = {
      status: 'incoming',
      target: caller,
      caller,
      isGroup,
      isVideo,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      isPopout: false,
      localStream: null,
      remoteStreams: [],
      sdpOffer: sdp,
    }
    this.notify()
  }

  async acceptCall(isVideo?: boolean) {
    if (this.state.status !== 'incoming' || !this.state.caller || !this.state.sdpOffer) return

    const caller = this.state.caller
    const useVideo = isVideo !== undefined ? isVideo : this.state.isVideo

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: useVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } } : false,
      })

      this.state.localStream = stream
      this.state.isVideo = useVideo
      this.state.status = 'active'
      this.clearCallTimeout()
      this.notify()

      const pc = new RTCPeerConnection(RTC_CONFIG)
      this.peerConnections.set(caller, pc)

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          bridgeClient.sendBlindMessage(
            caller,
            utf8ToBase64(JSON.stringify({ type: 'call_ice', candidate: event.candidate })),
          )
        }
      }

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track])
        this.addRemoteStream(caller, remoteStream)
        this.clearCallTimeout()
        this.state.status = 'active'
        this.notify()
      }

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Peer Connection state (${caller}):`, pc.connectionState)
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          this.handleInboundEnd(caller)
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(this.state.sdpOffer))
      await this.flushPendingIce(caller, pc)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      bridgeClient.sendBlindMessage(
        caller,
        utf8ToBase64(JSON.stringify({ type: 'call_answer', sdp: answer })),
      )
    } catch (err) {
      console.error('[WebRTC] Failed to accept call:', err)
      this.endCall()
    }
  }

  private async handleInboundAnswer(sender: string, sdp: any) {
    const pc = this.peerConnections.get(sender)
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      await this.flushPendingIce(sender, pc)
      this.state.status = 'active'
      this.notify()
    }
  }

  private async handleInboundIce(sender: string, candidate: any) {
    if (!candidate || !candidate.candidate) return
    const pc = this.peerConnections.get(sender)
    if (pc && pc.remoteDescription && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.warn('[WebRTC] Error adding ICE candidate:', err)
      }
    } else if (candidate) {
      let list = this.pendingIceCandidates.get(sender)
      if (!list) {
        list = []
        this.pendingIceCandidates.set(sender, list)
      }
      list.push(candidate)
    }
  }

  private async flushPendingIce(sender: string, pc: RTCPeerConnection) {
    const list = this.pendingIceCandidates.get(sender)
    if (list && list.length > 0) {
      for (const candidate of list) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.warn('[WebRTC] Error flushing queued ICE candidate:', err)
        }
      }
      this.pendingIceCandidates.delete(sender)
    }
  }

  private handleInboundEnd(sender: string, reason?: string) {
    const pc = this.peerConnections.get(sender)
    if (pc) {
      pc.close()
      this.peerConnections.delete(sender)
    }
    this.removeRemoteStream(sender)

    const activeUser = localStorage.getItem('vexta_active_user') || ''
    const currentStatus = this.state.status

    if (activeUser && sender) {
      try {
        const db = new VextaDatabaseManager(activeUser)
        let logText = 'Call Ended'
        if (reason === 'declined' || currentStatus === 'calling') {
          logText = 'Call Declined'
        } else if (reason === 'timeout' || currentStatus === 'incoming') {
          logText = 'Missed Call'
        }

        db.saveMessage({
          sender,
          recipient: activeUser,
          ciphertext: `CALL_EVENT:${logText}`,
          timestamp: new Date().toISOString(),
          is_read: 0,
        })
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vexta_messages_updated', { detail: { name: sender } }))
        }
      } catch (e) {
        console.warn('[Vexta WebRTC] Error saving inbound call end log:', e)
      }
    }

    if (this.state.status === 'incoming' || this.state.status === 'calling' || this.peerConnections.size === 0) {
      this.peerConnections.forEach((p) => p.close())
      this.peerConnections.clear()
      if (this.state.localStream) {
        this.state.localStream.getTracks().forEach((track) => track.stop())
      }
      this.state = {
        status: 'idle',
        target: '',
        caller: '',
        isGroup: false,
        isVideo: false,
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false,
        isPopout: false,
        localStream: null,
        remoteStreams: [],
      }
    }
    this.notify()
  }

  private addRemoteStream(peerId: string, stream: MediaStream) {
    const filtered = this.state.remoteStreams.filter((s) => s.peerId !== peerId)
    filtered.push({ peerId, stream })
    this.state.remoteStreams = filtered
  }

  private removeRemoteStream(peerId: string) {
    this.state.remoteStreams = this.state.remoteStreams.filter((s) => s.peerId !== peerId)
  }

  toggleMute(): boolean {
    if (!this.state.localStream) return false
    const audioTrack = this.state.localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      this.state.isMuted = !audioTrack.enabled
      this.notify()
    }
    return this.state.isMuted
  }

  toggleCamera(): boolean {
    if (!this.state.localStream) return false
    const videoTrack = this.state.localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      this.state.isCameraOff = !videoTrack.enabled
      this.notify()
    }
    return this.state.isCameraOff
  }

  async toggleScreenShare(): Promise<boolean> {
    if (!this.state.localStream) return false

    if (this.state.isScreenSharing) {
      // Revert to camera / video
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: this.state.isVideo,
        })
        const newTrack = camStream.getVideoTracks()[0]

        this.peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender && newTrack) {
            sender.replaceTrack(newTrack)
          }
        })

        this.state.localStream = camStream
        this.state.isScreenSharing = false
        this.notify()
      } catch (err) {
        console.error('[WebRTC] Error reverting screen share:', err)
      }
    } else {
      // Start Screen Share
      try {
        const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: true,
        })
        const screenTrack = screenStream.getVideoTracks()[0]

        this.peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender && screenTrack) {
            sender.replaceTrack(screenTrack)
          }
        })

        screenTrack.onended = () => {
          this.toggleScreenShare()
        }

        this.state.isScreenSharing = true
        this.notify()
      } catch (err) {
        console.warn('[WebRTC] Screen share cancelled or rejected:', err)
      }
    }

    return this.state.isScreenSharing
  }

  togglePopout(): boolean {
    this.state.isPopout = !this.state.isPopout
    this.notify()
    return this.state.isPopout
  }

  endCall(reason?: string) {
    this.clearCallTimeout()
    const target = this.state.target || this.state.caller
    const currentStatus = this.state.status

    if (target) {
      const callReason = reason || (currentStatus === 'incoming' ? 'declined' : 'ended')
      bridgeClient.sendBlindMessage(
        target,
        utf8ToBase64(JSON.stringify({ type: 'call_end', reason: callReason })),
      )

      const activeUser = localStorage.getItem('vexta_active_user') || ''
      if (activeUser) {
        try {
          const db = new VextaDatabaseManager(activeUser)
          let logText = 'Call Ended'
          if (currentStatus === 'incoming') logText = 'Declined Call'
          else if (currentStatus === 'calling' && reason === 'timeout') logText = 'Missed Call'

          db.saveMessage({
            sender: activeUser,
            recipient: target,
            ciphertext: `CALL_EVENT:${logText}`,
            timestamp: new Date().toISOString(),
            is_read: 1,
          })
          window.dispatchEvent(new CustomEvent('vexta_messages_updated', { detail: { name: target } }))
        } catch (e) {
          console.warn('[Vexta WebRTC] Error saving call log:', e)
        }
      }
    }

    this.peerConnections.forEach((pc) => pc.close())
    this.peerConnections.clear()

    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach((track) => track.stop())
    }

    this.state = {
      status: 'idle',
      target: '',
      isGroup: false,
      isVideo: false,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      isPopout: false,
      localStream: null,
      remoteStreams: [],
    }
    this.notify()
  }
}

export const webrtcManager = new WebRTCManager()
