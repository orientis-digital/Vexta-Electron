import {
  exportPublicKeyBase64,
  getOrCreateUserIdentityKeys,
  signNonceRSA_PSS,
} from '../crypto/identity'
import { VextaDatabaseManager } from '../crypto/db_manager'
import type { DbFileTransfer } from '../crypto/db_manager'
import { cacheReceivedMedia, decryptFileChunk } from '../crypto/file_transfer'

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'auth_failed'

export type AuthChallengePayload = {
  type: 'AUTH_CHALLENGE'
  nonce: string
  server_public_key?: string
  server_signature?: string
}

export type BlindMessagePayload = {
  type: 'BLIND_MESSAGE'
  sender: string
  recipient: string
  wire_blob: string
  timestamp: string
}

/**
 * Computes HMAC-SHA256 of passcode using server challenge nonce as key
 * passcode_hmac = hmac.new(nonce.encode(), passcode.encode(), hashlib.sha256).hexdigest()
 */
export async function computePasscodeHmac(nonceStr: string, passcode: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(nonceStr)
  const passcodeBytes = encoder.encode(passcode)
  const passcodeHash = await crypto.subtle.digest('SHA-256', passcodeBytes)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, passcodeHash)
  const bytes = new Uint8Array(signatureBuffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export class SubstrataBridgeClient {
  private url: string
  private ws: WebSocket | null = null
  private status: BridgeStatus = 'disconnected'
  private authMode: 'login' | 'register' = 'login'
  private sessionPasscode: string | null = null

  // Exponential backoff reconnect configuration
  private baseDelay = 1000
  private maxDelay = 30000
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isManualDisconnect = false

  private listeners: Set<(status: BridgeStatus) => void> = new Set()
  private messageListeners: Set<(msg: BlindMessagePayload) => void> = new Set()
  private chunkStorePrefix = 'vexta_chunks_'

  constructor(defaultUrl?: string) {
    const savedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('vexta_bridge_url') : null
    this.url = defaultUrl || savedUrl || 'wss://vexta-api.nexusec.space/ws/chat/'
  }

  setSessionPasscode(passcode: string | null) {
    this.sessionPasscode = passcode
  }

  setAuthMode(mode: 'login' | 'register') {
    this.authMode = mode
  }

  getUrl(): string {
    return this.url
  }

  setUrl(newUrl: string) {
    if (this.url !== newUrl) {
      this.url = newUrl
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vexta_bridge_url', newUrl)
      }
      this.disconnect()
      this.connect()
    }
  }

  subscribeStatus(fn: (status: BridgeStatus) => void) {
    this.listeners.add(fn)
    fn(this.status)
    return () => {
      this.listeners.delete(fn)
    }
  }

  subscribeMessages(fn: (msg: BlindMessagePayload) => void) {
    this.messageListeners.add(fn)
    return () => {
      this.messageListeners.delete(fn)
    }
  }

  connect() {
    this.isManualDisconnect = false

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) {
      console.log(`[Substrata WSS] Connection deferred: no active user logged in.`)
      return
    }

    console.log(`[Substrata WSS] Connecting to ${this.url} (mode: ${this.authMode})...`)
    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log(`[Substrata WSS] Channel OPEN to ${this.url}`)
        this.reconnectAttempts = 0
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          console.log(`[Substrata WSS] Frame:`, payload.type || payload)
          this.handlePayload(payload)
        } catch {
          console.warn(`[Substrata WSS] Raw frame:`, event.data)
        }
      }

      this.ws.onclose = (evt) => {
        console.warn(`[Substrata WSS] Connection closed (code: ${evt.code})`)
        this.ws = null
        this.setStatus('disconnected')
        if (!this.isManualDisconnect) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (err) => {
        console.error(`[Substrata WSS] Socket error:`, err)
        this.setStatus('disconnected')
      }
    } catch (err) {
      console.error(`[Substrata WSS] Exception:`, err)
      this.setStatus('disconnected')
      if (!this.isManualDisconnect) {
        this.scheduleReconnect()
      }
    }
  }

  private async handlePayload(payload: any) {
    if (payload.type === 'AUTH_CHALLENGE') {
      await this.handleAuthChallenge(payload as AuthChallengePayload)
    } else if (payload.type === 'AUTH_SUCCESS') {
      console.log(`[Substrata WSS] AUTH_SUCCESS from relay!`)
      this.setStatus('connected')
    } else if (payload.type === 'AUTH_ERROR') {
      console.error(`[Substrata WSS] AUTH_ERROR from relay:`, payload.message || payload.reason)
      this.setStatus('auth_failed')
    } else if (payload.type === 'ERROR') {
      console.error(`[Substrata WSS] ERROR from relay:`, payload.message)
      if (payload.message && (payload.message.includes('revoked') || payload.message.includes('session'))) {
        this.setStatus('auth_failed')
      }
    } else if (payload.type === 'BLIND_MESSAGE') {
      // Send ACK frame if message has id
      if (payload.id) {
        this.sendJson({ type: 'ACK', id: payload.id, hardware_hash: 'sha256_7f8a91b2c4e57091' })
      }

      const activeUser = localStorage.getItem('vexta_active_user')
      if (activeUser) {
        try {
          const db = new VextaDatabaseManager(activeUser)
          let text = payload.wire_blob || payload.ciphertext
          try {
            if (payload.wire_blob) text = atob(payload.wire_blob)
          } catch {}

          let innerPayload: any = null
          try {
            innerPayload = JSON.parse(text)
          } catch {
            innerPayload = null
          }

          if (innerPayload && typeof innerPayload === 'object') {
            if (innerPayload.type === 'group_msg') {
              db.saveMessage({
                sender: `group_${innerPayload.group_uuid}`,
                recipient: activeUser,
                ciphertext: innerPayload.body || text,
                timestamp: payload.timestamp || new Date().toISOString(),
                is_read: 0,
              })
            } else if (innerPayload.type === 'group_invite') {
              db.saveGroup({
                group_id: innerPayload.group_uuid,
                group_name: innerPayload.group_name || 'Group Chat',
                creator: payload.sender,
                created_at: payload.timestamp || new Date().toISOString(),
              }, innerPayload.members || [payload.sender, activeUser])
            } else if (innerPayload.type === 'group_update') {
              db.saveGroup({
                group_id: innerPayload.group_uuid,
                group_name: innerPayload.group_name || 'Group Chat',
                creator: payload.sender,
                created_at: payload.timestamp || new Date().toISOString(),
              }, innerPayload.members)
            } else if (innerPayload.type === 'group_kick') {
              db.deleteGroup(innerPayload.group_uuid)
            } else if (innerPayload.type === 'file_init') {
              db.saveFileTransfer({
                transfer_id: innerPayload.transfer_id,
                filename: innerPayload.filename,
                file_size: innerPayload.file_size,
                chunk_size: innerPayload.chunk_size || 128 * 1024,
                total_chunks: innerPayload.total_chunks,
                received_chunks: 0,
                file_key: innerPayload.file_key,
                file_hash: innerPayload.file_hash,
                sender: payload.sender,
                recipient: activeUser,
                status: 'pending',
                created_at: payload.timestamp || new Date().toISOString(),
              })
            } else if (innerPayload.type === 'file_chunk') {
              const transfer = db.getFileTransfer(innerPayload.transfer_id)
              if (transfer) {
                // Store received chunk data for reassembly
                const chunkKey = `${this.chunkStorePrefix}${innerPayload.transfer_id}`
                const storedChunks: string[] = JSON.parse(localStorage.getItem(chunkKey) || '[]')
                storedChunks[innerPayload.chunk_index || storedChunks.length] = innerPayload.data
                localStorage.setItem(chunkKey, JSON.stringify(storedChunks))

                const nextChunk = Math.min(transfer.total_chunks, (innerPayload.chunk_index || 0) + 1)
                const isComplete = nextChunk >= transfer.total_chunks

                if (isComplete) {
                  // Auto-cache completed file to hidden OS location
                  this.cacheCompletedTransfer(db, transfer, storedChunks)
                    .then(() => localStorage.removeItem(chunkKey))
                    .catch((err) => console.warn('[Substrata WSS] Cache failed:', err))
                }

                db.updateFileTransferProgress(
                  innerPayload.transfer_id,
                  nextChunk,
                  isComplete ? 'completed' : 'transferring',
                )
              }
            } else if (innerPayload.type === 'file_status_query') {
              const transfer = db.getFileTransfer(innerPayload.transfer_id)
              if (transfer) {
                this.sendFileStatusResponse(
                  payload.sender,
                  innerPayload.transfer_id,
                  transfer.received_chunks,
                  transfer.status,
                )
              }
            } else if (innerPayload.type === 'file_status_response') {
              console.log(
                `[Substrata WSS] Resume status for ${innerPayload.transfer_id}: ${innerPayload.received_chunks}/${innerPayload.status}`,
              )
            } else if (innerPayload.type === 'message_reaction') {
              if (innerPayload.target_msg_id && innerPayload.emoji) {
                db.toggleMessageReaction(Number(innerPayload.target_msg_id), innerPayload.emoji)
              }
            } else if (innerPayload.type === 'metadata_sync') {
              if (innerPayload.action === 'ADD_CONTACT') {
                db.addContact(innerPayload.data)
              } else if (innerPayload.action === 'DELETE_CONTACT') {
                db.removeContact(innerPayload.data.username)
              } else if (innerPayload.action === 'CREATE_GROUP') {
                db.saveGroup(innerPayload.data.group, innerPayload.data.members)
              } else if (innerPayload.action === 'DELETE_GROUP') {
                db.deleteGroup(innerPayload.data.groupId)
              }
            } else {
              db.saveMessage({
                sender: payload.sender,
                recipient: payload.recipient,
                ciphertext: text,
                timestamp: payload.timestamp || new Date().toISOString(),
                is_read: 0,
              })
            }
          } else {
            db.saveMessage({
              sender: payload.sender,
              recipient: payload.recipient,
              ciphertext: text,
              timestamp: payload.timestamp || new Date().toISOString(),
              is_read: 0,
            })
          }
        } catch (e) {
          console.warn(`[Substrata WSS] Failed saving inbound message to DB:`, e)
        }
      }
      this.messageListeners.forEach((fn) => fn(payload as BlindMessagePayload))
    }
  }

  private async handleAuthChallenge(challenge: AuthChallengePayload) {
    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) {
      console.warn(`[Substrata WSS] No active user session found. Postponing AUTH_RESPONSE until user logs in.`)
      return
    }
    console.log(`[Substrata WSS] Processing AUTH_CHALLENGE for @${activeUser} (mode: ${this.authMode})...`)

    const signKeyPair = await getOrCreateUserIdentityKeys(activeUser)
    const pubKeyB64 = await exportPublicKeyBase64(signKeyPair.publicKey)
    const signatureB64 = await signNonceRSA_PSS(signKeyPair.privateKey, challenge.nonce)

    // Dynamic System & OS Info Detection (Electron IPC or Browser UserAgent Fallback)
    let osName = 'Linux'
    let osVersion = 'x86_64'
    let deviceName = 'Desktop Workstation'

    if (typeof window !== 'undefined' && (window as any).vextaNative) {
      try {
        const nativeInfo = await (window as any).vextaNative.getSystemInfo()
        if (nativeInfo) {
          osName = nativeInfo.osName || osName
          osVersion = nativeInfo.osVersion || osVersion
          deviceName = nativeInfo.deviceName || deviceName
        }
      } catch (e) {
        console.warn('[Substrata WSS] Error querying native system info via IPC:', e)
      }
    } else if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent
      if (ua.includes('Windows')) osName = 'Windows'
      else if (ua.includes('Macintosh') || ua.includes('Mac OS')) osName = 'macOS'
      else if (ua.includes('Android')) osName = 'Android'
      else if (ua.includes('iPhone') || ua.includes('iPad')) osName = 'iOS'
      else if (ua.includes('Linux')) osName = 'Linux'
      deviceName = `${osName} Client`
    }

    if (this.authMode === 'register') {
      const registerPayload = {
        type: 'REGISTER',
        username: activeUser,
        public_key: pubKeyB64,
        nonce: challenge.nonce,
        signature: signatureB64,
        hardware_hash: 'sha256_7f8a91b2c4e57091',
        device_name: deviceName,
        os_name: osName,
        os_version: osVersion,
        device_type: 'Desktop',
        app_version: '2.4.0-electron',
      }
      console.log(`[Substrata WSS] Transmitting REGISTER payload for @${activeUser} (${osName}) to bridge server`)
      this.sendJson(registerPayload)
      this.authMode = 'login'
      return
    }

    const passcodeToUse = this.sessionPasscode || ''
    const passcodeHmac = passcodeToUse ? await computePasscodeHmac(challenge.nonce, passcodeToUse) : undefined

    const authResponse: Record<string, any> = {
      type: 'AUTH_RESPONSE',
      username: activeUser,
      public_key: pubKeyB64,
      nonce: challenge.nonce,
      signature: signatureB64,
      hardware_hash: 'sha256_7f8a91b2c4e57091',
      device_name: deviceName,
      os_name: osName,
      os_version: osVersion,
      device_type: 'Desktop',
      app_version: '2.4.0-electron',
    }

    if (passcodeHmac) {
      authResponse.passcode = passcodeHmac
      authResponse.passcode_hmac = passcodeHmac
    }

    console.log(`[Substrata WSS] Transmitting AUTH_RESPONSE for @${activeUser}`)
    this.sendJson(authResponse)
    this.setStatus('connected')
  }

  sendBlindMessage(recipient: string, wireBlob: string, selfCiphertext?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[Substrata WSS] Cannot send message: socket not connected`)
      return false
    }

    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) {
      console.warn(`[Substrata WSS] Cannot send message: no active user logged in`)
      return false
    }

    const msg: Record<string, any> = {
      type: 'SEND_MESSAGE',
      sender: activeUser,
      recipient,
      ciphertext: wireBlob,
      wire_blob: wireBlob,
      timestamp: new Date().toISOString(),
    }

    if (selfCiphertext) {
      msg.self_ciphertext = selfCiphertext
    }

    console.log(`[Substrata WSS] Transmitting SEND_MESSAGE to @${recipient}`)
    this.sendJson(msg)
    return true
  }

  // ── Group Chat & File Transfer Extensions ─────────────────
  sendGroupMessage(groupId: string, members: string[], bodyText: string) {
    const activeUser = localStorage.getItem('vexta_active_user') || 'self'
    const innerPayload = JSON.stringify({
      type: 'group_msg',
      group_uuid: groupId,
      sender: activeUser,
      body: bodyText,
    })
    const b64Payload = btoa(innerPayload)

    for (const member of members) {
      if (member !== activeUser) {
        this.sendBlindMessage(member, b64Payload)
      }
    }
  }

  sendGroupInvite(groupId: string, groupName: string, recipient: string, members: string[]) {
    const innerPayload = JSON.stringify({
      type: 'group_invite',
      group_uuid: groupId,
      group_name: groupName,
      members,
    })
    this.sendBlindMessage(recipient, btoa(innerPayload))
  }

  sendFileInit(recipient: string, initPayload: {
    transfer_id: string
    filename: string
    file_size: number
    chunk_size: number
    total_chunks: number
    file_key: string
    file_hash: string
  }) {
    const payload = JSON.stringify({
      type: 'file_init',
      ...initPayload,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendFileChunk(recipient: string, transferId: string, chunkIndex: number, encryptedChunkB64: string) {
    const payload = JSON.stringify({
      type: 'file_chunk',
      transfer_id: transferId,
      chunk_index: chunkIndex,
      data: encryptedChunkB64,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendFileStatusQuery(recipient: string, transferId: string) {
    const payload = JSON.stringify({
      type: 'file_status_query',
      transfer_id: transferId,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendFileStatusResponse(recipient: string, transferId: string, receivedChunks: number, status: string) {
    const payload = JSON.stringify({
      type: 'file_status_response',
      transfer_id: transferId,
      received_chunks: receivedChunks,
      status,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendMetadataSync(
    action:
      | 'ADD_CONTACT'
      | 'DELETE_CONTACT'
      | 'CREATE_GROUP'
      | 'DELETE_GROUP'
      | 'UPDATE_GROUP_MEMBERS'
      | 'REVOKE_DEVICE',
    data: any,
  ) {
    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) return
    const payload = JSON.stringify({
      type: 'metadata_sync',
      action,
      data,
    })
    const wireBlob = btoa(`SYNC_META:${payload}`)
    this.sendBlindMessage(activeUser, wireBlob)
  }

  sendReaction(
    recipient: string,
    targetMsgId: number | string,
    emoji: string,
    action: 'add' | 'remove' = 'add',
  ) {
    const payload = JSON.stringify({
      type: 'message_reaction',
      target_msg_id: targetMsgId,
      emoji,
      action,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendCallOffer(recipient: string, sdp: any, isGroup = false, isVideo = false) {
    const payload = JSON.stringify({
      type: 'call_offer',
      sdp,
      is_group: isGroup,
      is_video: isVideo,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendCallAnswer(recipient: string, sdp: any) {
    const payload = JSON.stringify({
      type: 'call_answer',
      sdp,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendIceCandidate(recipient: string, candidate: any) {
    const payload = JSON.stringify({
      type: 'call_ice',
      candidate,
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  sendCallEnd(recipient: string) {
    const payload = JSON.stringify({
      type: 'call_end',
    })
    this.sendBlindMessage(recipient, btoa(payload))
  }

  private async cacheCompletedTransfer(
    db: VextaDatabaseManager,
    transfer: DbFileTransfer,
    encryptedChunksB64: string[],
  ) {
    try {
      const decryptedChunks: Uint8Array[] = []
      for (const b64 of encryptedChunksB64) {
        if (!b64) continue
        const chunk = await decryptFileChunk(transfer.file_key, b64)
        decryptedChunks.push(chunk)
      }

      const mimeType = transfer.filename.match(/\.(jpe?g)$/i)
        ? 'image/jpeg'
        : transfer.filename.match(/\.png$/i)
          ? 'image/png'
          : transfer.filename.match(/\.gif$/i)
            ? 'image/gif'
            : transfer.filename.match(/\.webp$/i)
              ? 'image/webp'
              : 'application/octet-stream'

      const blobParts: BlobPart[] = decryptedChunks.map(
        (c) => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer,
      )
      const blob = new Blob(blobParts, { type: mimeType })
      const { cachedFilename, cachedPath } = await cacheReceivedMedia(blob, transfer.filename)

      db.updateFileTransferProgress(
        transfer.transfer_id,
        transfer.total_chunks,
        'completed',
        cachedPath,
        cachedFilename,
      )
      console.log(`[Substrata WSS] Cached file ${transfer.filename} → ${cachedFilename}`)
    } catch (err) {
      console.error('[Substrata WSS] Failed to cache completed transfer:', err)
    }
  }

  // ── Substrata Extended Protocol Frame Helpers ───────────────
  sendFriendRequest(recipient: string) {
    this.sendJson({ type: 'SEND_FRIEND_REQUEST', recipient })
  }

  acceptFriendRequest(requestId: string) {
    this.sendJson({ type: 'ACCEPT_FRIEND_REQUEST', request_id: requestId })
  }

  rejectFriendRequest(requestId: string) {
    this.sendJson({ type: 'REJECT_FRIEND_REQUEST', request_id: requestId })
  }

  listFriends() {
    this.sendJson({ type: 'LIST_FRIENDS' })
  }

  listFriendRequests() {
    this.sendJson({ type: 'LIST_FRIEND_REQUESTS' })
  }

  removeFriend(username: string) {
    this.sendJson({ type: 'REMOVE_FRIEND', username })
  }

  updateKey(newPublicKeyPem: string) {
    this.sendJson({ type: 'UPDATE_KEY', new_public_key: newPublicKeyPem })
  }

  updateVault(encVaultB64: string) {
    this.sendJson({ type: 'UPDATE_VAULT', enc_vault: encVaultB64 })
  }

  getVault(username: string) {
    this.sendJson({ type: 'GET_VAULT', username })
  }

  listDevices() {
    this.sendJson({ type: 'LIST_DEVICES' })
  }

  revokeDevice(hardwareHash: string) {
    this.sendJson({ type: 'REVOKE_DEVICE', hardware_hash: hardwareHash })
  }

  deleteAccount() {
    this.sendJson({ type: 'DELETE_ACCOUNT' })
  }

  private sendJson(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  private setStatus(s: BridgeStatus) {
    this.status = s
    this.listeners.forEach((fn) => fn(s))
  }

  private scheduleReconnect() {
    if (this.isManualDisconnect || !localStorage.getItem('vexta_active_user')) {
      console.log(`[Substrata WSS] Skipping reconnect schedule (manual disconnect or logged out)`)
      return
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const backoff = Math.min(this.maxDelay, this.baseDelay * Math.pow(2, this.reconnectAttempts))
    const jitter = Math.random() * 500
    const delay = Math.floor(backoff + jitter)
    this.reconnectAttempts++

    console.log(
      `[Substrata WSS] Scheduling exponential reconnect attempt #${this.reconnectAttempts} in ${delay}ms...`,
    )

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  disconnect() {
    this.isManualDisconnect = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  getStatus() {
    return this.status
  }
}

export const bridgeClient = new SubstrataBridgeClient('wss://vexta-api.nexusec.space/ws/chat/')
