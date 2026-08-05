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
  type: string
  sender: string
  recipient: string
  wire_blob?: string
  ciphertext?: string
  id?: string
  timestamp: string | number
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

export class VextaBridgeClient {
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
  private deviceRequestListeners: Set<(payload: { deviceId: string; deviceName: string; osName: string; pinChallenge: string; devicePubKey: string }) => void> = new Set()
  private deviceApprovalListeners: Set<(payload: { encryptedKeyBundle: string; encryptedFriendRoster?: string }) => void> = new Set()
  private deviceRejectionListeners: Set<(payload: { reason?: string }) => void> = new Set()
  private friendRequestsListeners: Set<(requests: any[]) => void> = new Set()
  private friendsListeners: Set<(friends: any[]) => void> = new Set()
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

  subscribeDeviceRequests(fn: (payload: { deviceId: string; deviceName: string; osName: string; pinChallenge: string; devicePubKey: string }) => void) {
    this.deviceRequestListeners.add(fn)
    return () => {
      this.deviceRequestListeners.delete(fn)
    }
  }

  subscribeDeviceApproved(fn: (payload: { encryptedKeyBundle: string; encryptedFriendRoster?: string }) => void) {
    this.deviceApprovalListeners.add(fn)
    return () => {
      this.deviceApprovalListeners.delete(fn)
    }
  }

  subscribeDeviceRejected(fn: (payload: { reason?: string }) => void) {
    this.deviceRejectionListeners.add(fn)
    return () => {
      this.deviceRejectionListeners.delete(fn)
    }
  }

  subscribeFriendRequests(fn: (requests: any[]) => void) {
    this.friendRequestsListeners.add(fn)
    return () => {
      this.friendRequestsListeners.delete(fn)
    }
  }

  subscribeFriends(fn: (friends: any[]) => void) {
    this.friendsListeners.add(fn)
    return () => {
      this.friendsListeners.delete(fn)
    }
  }

  connect() {
    this.isManualDisconnect = false

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) {
      console.log(`[Vexta WSS] Connection deferred: no active user logged in.`)
      return
    }

    console.log(`[Vexta WSS] Connecting to ${this.url} (mode: ${this.authMode})...`)
    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log(`[Vexta WSS] Channel OPEN to ${this.url}`)
        this.reconnectAttempts = 0
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          console.log(`[Vexta WSS] Frame:`, payload.type || payload)
          this.handlePayload(payload)
        } catch {
          console.warn(`[Vexta WSS] Raw frame:`, event.data)
        }
      }

      this.ws.onclose = (evt) => {
        console.warn(`[Vexta WSS] Connection closed (code: ${evt.code})`)
        this.ws = null
        this.setStatus('disconnected')
        if (!this.isManualDisconnect) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (err) => {
        console.error(`[Vexta WSS] Socket error:`, err)
        this.setStatus('disconnected')
      }
    } catch (err) {
      console.error(`[Vexta WSS] Exception:`, err)
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
      console.log(`[Vexta WSS] AUTH_SUCCESS from relay!`)
      this.setStatus('connected')
      this.listFriendRequests()
      this.listFriends()
    } else if (payload.type === 'FRIEND_REQUESTS_LIST') {
      console.log(`[Vexta WSS] Received FRIEND_REQUESTS_LIST:`, payload.requests)
      this.friendRequestsListeners.forEach((fn) => fn(payload.requests || []))
    } else if (payload.type === 'FRIENDS_LIST') {
      console.log(`[Vexta WSS] Received FRIENDS_LIST:`, payload.friends)
      this.friendsListeners.forEach((fn) => fn(payload.friends || []))
    } else if (payload.type === 'FRIEND_REQUEST_SENT') {
      console.log(`[Vexta WSS] FRIEND_REQUEST_SENT confirmed for:`, payload.recipient)
      this.listFriendRequests()
    } else if (payload.type === 'AUTH_ERROR') {
      console.error(`[Vexta WSS] AUTH_ERROR from relay:`, payload.message || payload.reason)
      this.setStatus('auth_failed')
    } else if (payload.type === 'ERROR') {
      console.error(`[Vexta WSS] ERROR from relay:`, payload.message)
      if (payload.message && typeof payload.message === 'string' && (payload.message.includes('revoked') || payload.message.includes('session'))) {
        this.setStatus('auth_failed')
      }
    } else if (payload.type === 'PUSH_DEVICE_REQUEST') {
      console.log(`[Vexta WSS] Received PUSH_DEVICE_REQUEST from device: ${payload.device_name} (${payload.device_id})`)
      const activeUser = localStorage.getItem('vexta_active_user')
      if (activeUser) {
        const db = new VextaDatabaseManager(activeUser)
        db.saveDevice({
          id: payload.device_id || `dev_${Date.now()}`,
          name: payload.device_name || 'Secondary Device',
          type: 'desktop',
          hardwareHash: payload.hardware_hash || 'sha256_unknown',
          lastSeen: new Date().toISOString(),
          status: 'pending_approval',
          osName: payload.os_name || 'Linux',
          pinChallenge: payload.pin_challenge,
          devicePubKey: payload.device_pubkey,
        })
      }
      this.deviceRequestListeners.forEach((fn) =>
        fn({
          deviceId: payload.device_id || 'dev_pending',
          deviceName: payload.device_name || 'Secondary Device',
          osName: payload.os_name || 'Desktop Client',
          pinChallenge: payload.pin_challenge || '000000',
          devicePubKey: payload.device_pubkey || '',
        }),
      )
    } else if (payload.type === 'DEVICE_APPROVED_EVENT') {
      console.log(`[Vexta WSS] Received DEVICE_APPROVED_EVENT! Key bundle received.`)
      this.deviceApprovalListeners.forEach((fn) =>
        fn({
          encryptedKeyBundle: payload.encrypted_key_bundle,
          encryptedFriendRoster: payload.encrypted_friend_roster,
        }),
      )
    } else if (payload.type === 'DEVICE_REJECTED_EVENT') {
      console.warn(`[Vexta WSS] Received DEVICE_REJECTED_EVENT:`, payload.reason)
      this.deviceRejectionListeners.forEach((fn) => fn({ reason: payload.reason }))
    } else if (payload.type === 'BLIND_MESSAGE' || payload.type === 'SEND_MESSAGE' || payload.type === 'MESSAGE' || payload.type === 'RECEIVE_MESSAGE') {
      // Send ACK frame if message has id
      if (payload.id) {
        this.sendJson({ type: 'ACK', id: payload.id, hardware_hash: 'sha256_7f8a91b2c4e57091' })
      }

      const activeUser = localStorage.getItem('vexta_active_user')
      if (activeUser) {
        try {
          const db = new VextaDatabaseManager(activeUser)
          let text = payload.wire_blob || payload.ciphertext || ''
          try {
            if (payload.wire_blob) text = atob(payload.wire_blob)
            else if (payload.ciphertext) text = atob(payload.ciphertext)
          } catch {
            text = payload.wire_blob || payload.ciphertext || ''
          }

          let innerPayload: any = null
          try {
            innerPayload = JSON.parse(text)
          } catch {
            innerPayload = null
          }

          const parseTs = (ts: any): string => {
            if (typeof ts === 'number') return new Date(ts).toISOString()
            if (typeof ts === 'string' && ts) return ts
            return new Date().toISOString()
          }
          const msgTimestamp = parseTs(payload.timestamp)

          if (innerPayload && typeof innerPayload === 'object') {
            if (innerPayload.type === 'group_msg') {
              db.saveMessage({
                sender: `group_${innerPayload.group_uuid}`,
                recipient: activeUser,
                ciphertext: innerPayload.body || text,
                timestamp: msgTimestamp,
                is_read: 0,
              })
            } else if (innerPayload.type === 'group_invite') {
              db.saveGroup({
                group_id: innerPayload.group_uuid,
                group_name: innerPayload.group_name || 'Group Chat',
                creator: payload.sender,
                created_at: msgTimestamp,
              }, innerPayload.members || [payload.sender, activeUser])
            } else if (innerPayload.type === 'group_update') {
              db.saveGroup({
                group_id: innerPayload.group_uuid,
                group_name: innerPayload.group_name || 'Group Chat',
                creator: payload.sender,
                created_at: msgTimestamp,
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
                created_at: msgTimestamp,
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
                    .catch((err) => console.warn('[Vexta WSS] Cache failed:', err))
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
                `[Vexta WSS] Resume status for ${innerPayload.transfer_id}: ${innerPayload.received_chunks}/${innerPayload.status}`,
              )
            } else if (innerPayload.type === 'message_reaction') {
              if (innerPayload.target_msg_id && innerPayload.emoji) {
                db.toggleMessageReaction(Number(innerPayload.target_msg_id), innerPayload.emoji)
              }
            } else if (innerPayload.type === 'presence') {
              const isGlobalAllowed = db.getGlobalPresencePrivacy() !== 'nobody'
              const isFriendAllowed = db.getFriendPresenceOverride(payload.sender) !== false
              if (isGlobalAllowed && isFriendAllowed) {
                db.updateContactLastActive(
                  payload.sender,
                  parseTs(innerPayload.timestamp || payload.timestamp),
                )
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
            } else if (innerPayload.type === 'system_broadcast') {
              db.saveMessage({
                sender: 'Vexta - Global Message',
                recipient: activeUser,
                ciphertext: innerPayload.announcement || text,
                timestamp: msgTimestamp,
                is_read: 0,
                is_system: 1,
              })
            } else {
              db.saveMessage({
                sender: payload.sender,
                recipient: payload.recipient,
                ciphertext: text,
                timestamp: msgTimestamp,
                is_read: 0,
              })
            }
          } else {
            db.saveMessage({
              sender: payload.sender,
              recipient: payload.recipient,
              ciphertext: text,
              timestamp: msgTimestamp,
              is_read: 0,
            })
          }
        } catch (e) {
          console.warn(`[Vexta WSS] Failed saving inbound message to DB:`, e)
        }
      }
      this.messageListeners.forEach((fn) => fn(payload as BlindMessagePayload))
    }
  }

  private async handleAuthChallenge(challenge: AuthChallengePayload) {
    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) {
      console.warn(`[Vexta WSS] No active user session found. Postponing AUTH_RESPONSE until user logs in.`)
      return
    }
    console.log(`[Vexta WSS] Processing AUTH_CHALLENGE for @${activeUser} (mode: ${this.authMode})...`)

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
        console.warn('[Vexta WSS] Error querying native system info via IPC:', e)
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
      console.log(`[Vexta WSS] Transmitting REGISTER payload for @${activeUser} (${osName}) to bridge server`)
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

    console.log(`[Vexta WSS] Transmitting AUTH_RESPONSE for @${activeUser}`)
    this.sendJson(authResponse)
    this.setStatus('connected')
  }

  sendBlindMessage(recipient: string, wireBlob: string, selfCiphertext?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[Vexta WSS] Cannot send message: socket not connected`)
      return false
    }

    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) {
      console.warn(`[Vexta WSS] Cannot send message: no active user logged in`)
      return false
    }

    const msg: Record<string, any> = {
      type: 'SEND_MESSAGE',
      sender: activeUser,
      recipient,
      ciphertext: wireBlob,
      wire_blob: wireBlob,
      timestamp: Date.now(),
    }

    if (selfCiphertext) {
      msg.self_ciphertext = selfCiphertext
    }

    console.log(`[Vexta WSS] Transmitting SEND_MESSAGE to @${recipient}`)
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

  sendPresence(status: 'online' | 'offline' = 'online') {
    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) return
    const payload = JSON.stringify({
      type: 'presence',
      status,
      timestamp: new Date().toISOString(),
    })
    const contacts = new VextaDatabaseManager(activeUser).getContacts()
    contacts.forEach((c) => {
      if (c.username !== activeUser && c.username !== 'Vexta - Global Message') {
        this.sendBlindMessage(c.username, btoa(payload))
      }
    })
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
      console.log(`[Vexta WSS] Cached file ${transfer.filename} → ${cachedFilename}`)
    } catch (err) {
      console.error('[Vexta WSS] Failed to cache completed transfer:', err)
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

  sendDeviceApproval(targetDeviceId: string, encryptedKeyBundle: string, encryptedFriendRoster?: string) {
    console.log(`[Vexta WSS] Transmitting APPROVE_DEVICE for device: ${targetDeviceId}`)
    this.sendJson({
      type: 'APPROVE_DEVICE',
      target_device_id: targetDeviceId,
      encrypted_key_bundle: encryptedKeyBundle,
      encrypted_friend_roster: encryptedFriendRoster,
    })
  }

  sendDeviceRejection(targetDeviceId: string, reason?: string) {
    console.log(`[Vexta WSS] Transmitting REJECT_DEVICE for device: ${targetDeviceId}`)
    this.sendJson({
      type: 'REJECT_DEVICE',
      target_device_id: targetDeviceId,
      reason: reason || 'Declined by primary device',
    })
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
      console.log(`[Vexta WSS] Skipping reconnect schedule (manual disconnect or logged out)`)
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
      `[Vexta WSS] Scheduling exponential reconnect attempt #${this.reconnectAttempts} in ${delay}ms...`,
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

export const bridgeClient = new VextaBridgeClient('wss://vexta-api.nexusec.space/ws/chat/')
export const SubstrataBridgeClient = VextaBridgeClient
