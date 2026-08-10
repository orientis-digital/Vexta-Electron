import {
  exportPublicKeyBase64,
  getOrCreateUserIdentityKeys,
  signNonceRSA_PSS,
} from '../crypto/identity'
import { VextaDatabaseManager } from '../crypto/db_manager'
import type { DbFileTransfer } from '../crypto/db_manager'
import { cacheReceivedMedia, decryptFileChunk, indexedDbCache } from '../crypto/file_transfer'
import { base64ToUtf8, decodePayload, isControlMessage, utf8ToBase64 } from './codec'

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

function parseBinaryMessageFrame(rawText: string, _eventData?: any): any | null {
  if (!rawText) return null

  const msgTypes: string[] = ['BLIND_MESSAGE', 'SEND_MESSAGE', 'MESSAGE', 'RECEIVE_MESSAGE', 'FRIEND_REQUEST']
  const matchedType: string | undefined = msgTypes.find((t) => rawText.includes(t))

  if (!matchedType) return null

  const tokens: string[] = Array.from(rawText.match(/[A-Za-z0-9_@.\-+=/]{2,}/g) || [])
  const typeIdx = tokens.indexOf(matchedType)
  const rest = typeIdx !== -1 ? tokens.slice(typeIdx + 1) : tokens
  const cleanTokens = rest.filter((t) => t !== matchedType)

  let sender = cleanTokens.find((t) => !t.includes('=') && t.length < 32 && t.length >= 3) || cleanTokens[0] || 'unknown'
  sender = sender.replace(/^@/, '')

  let wireBlob = cleanTokens.find((t) => t !== sender && t !== `@${sender}` && t.length >= 4) || cleanTokens[1] || ''

  if (sender && wireBlob) {
    return {
      type: matchedType,
      sender,
      wire_blob: wireBlob,
      ciphertext: wireBlob,
      timestamp: Date.now(),
    }
  }

  return null
}

export function cleanDecodePayload(input: string | ArrayBuffer | Uint8Array): any {
  return decodePayload(input)
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
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private isManualDisconnect = false

  private startPingHeartbeat() {
    this.stopPingHeartbeat()
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendJson({ type: 'PING', timestamp: Date.now() })
      }
    }, 20000)
  }

  private stopPingHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private listeners: Set<(status: BridgeStatus) => void> = new Set()
  private messageListeners: Set<(msg: BlindMessagePayload) => void> = new Set()
  private deviceRequestListeners: Set<(payload: { deviceId: string; deviceName: string; osName: string; pinChallenge: string; devicePubKey: string }) => void> = new Set()
  private deviceApprovalListeners: Set<(payload: { encryptedKeyBundle: string; encryptedFriendRoster?: string }) => void> = new Set()
  private deviceRejectionListeners: Set<(payload: { reason?: string }) => void> = new Set()
  private friendRequestsListeners: Set<(requests: any[]) => void> = new Set()
  private friendsListeners: Set<(friends: any[]) => void> = new Set()

  constructor(defaultUrl?: string) {
    const savedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('vexta_bridge_url') : null
    this.url = defaultUrl || savedUrl || 'wss://vexta-api.nexusec.space/ws/chat/'

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[Vexta WSS] Network connection restored (online event). Triggering instant reconnect...')
        if (this.status !== 'connected' && !this.isManualDisconnect) {
          this.reconnectAttempts = 0
          this.connect()
        }
      })
      window.addEventListener('offline', () => {
        console.warn('[Vexta WSS] Network connection lost (offline event). Updating bridge status.')
        this.stopPingHeartbeat()
        this.setStatus('disconnected')
      })
    }
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
      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = () => {
        console.log(`[Vexta WSS] Channel OPEN to ${this.url}`)
        this.reconnectAttempts = 0
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }
      }

      this.ws.onmessage = async (event) => {
        try {
          let data = event.data
          if (data instanceof Blob) {
            data = await data.arrayBuffer()
          }

          let payload = decodePayload(data)
          if (!payload && typeof data === 'string') {
            payload = parseBinaryMessageFrame(data, event.data)
          }

          if (payload) {
            console.log(`[Vexta WSS] Decoded frame:`, payload.type, 'from @' + (payload.sender || 'unknown'))
            this.handlePayload(payload)
          } else {
            console.warn(`[Vexta WSS] Unrecognized payload frame received`)
          }
        } catch (err) {
          console.warn(`[Vexta WSS] Raw frame processing exception:`, err)
        }
      }

      this.ws.onclose = (evt) => {
        console.warn(`[Vexta WSS] Connection closed (code: ${evt.code})`)
        this.stopPingHeartbeat()
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
      this.startPingHeartbeat()
      this.listFriendRequests()
      this.listFriends()
      this.flushOutboundQueue()
    } else if (payload.type === 'PONG') {
      // Keep-alive heartbeat ack from relay server
    } else if (payload.type === 'FRIEND_REQUESTS_LIST') {
      console.log(`[Vexta WSS] Received FRIEND_REQUESTS_LIST:`, payload.requests)
      const reqs = payload.requests || []
      const activeUser = localStorage.getItem('vexta_active_user')
      if (activeUser) {
        try {
          const db = new VextaDatabaseManager(activeUser)
          const localContacts = db.getContacts()

          // 1. Sync pending requests to local DB
          reqs.forEach((req: any) => {
            const normRecipient = (req.recipient || '').replace(/^@/, '').toLowerCase()
            const normActiveUser = activeUser.replace(/^@/, '').toLowerCase()
            const isIncoming = normRecipient === normActiveUser
            const otherUser = isIncoming ? req.sender : req.recipient
            const cleanOtherUser = (otherUser || '').replace(/^@/, '').toLowerCase()
            const existing = localContacts.find((c) => (c.username || '').replace(/^@/, '').toLowerCase() === cleanOtherUser)
            const dir = isIncoming ? 'incoming' as const : 'outgoing' as const
            if (!existing) {
              db.addContact({
                username: (otherUser || '').replace(/^@/, ''),
                public_key: 'PENDING_KEY',
                display_name: (otherUser || '').replace(/^@/, ''),
                created_at: new Date().toISOString(),
                status: 'pending',
                direction: dir,
              })
            } else if (existing.status === 'pending' && existing.direction !== dir) {
              db.addContact({
                ...existing,
                direction: dir,
              })
            }
          })

          // 2. Clean up any local pending contact that is no longer in the server's pending list
          const serverPendingUsers = reqs.map((req: any) => {
            const normRecipient = (req.recipient || '').replace(/^@/, '').toLowerCase()
            const normActiveUser = activeUser.replace(/^@/, '').toLowerCase()
            const isIncoming = normRecipient === normActiveUser
            const otherUser = isIncoming ? req.sender : req.recipient
            return (otherUser || '').replace(/^@/, '').toLowerCase()
          })

          localContacts.forEach((c) => {
            if (c.status === 'pending') {
              const cleanContactName = (c.username || '').replace(/^@/, '').toLowerCase()
              if (!serverPendingUsers.includes(cleanContactName)) {
                db.removeContact(c.username)
              }
            }
          })
        } catch (e) {
          console.error('[Vexta WSS] Failed to sync local contacts on FRIEND_REQUESTS_LIST:', e)
        }
      }

      this.friendRequestsListeners.forEach((fn) => fn(reqs))
      window.dispatchEvent(new CustomEvent('vexta_friend_request_updated'))
      window.dispatchEvent(new CustomEvent('vexta_contacts_updated'))
    } else if (payload.type === 'FRIENDS_LIST') {
      console.log(`[Vexta WSS] Received FRIENDS_LIST:`, payload.friends)
      const friends = payload.friends || []
      const activeUser = localStorage.getItem('vexta_active_user')
      if (activeUser) {
        try {
          const db = new VextaDatabaseManager(activeUser)
          const localContacts = db.getContacts()
          friends.forEach((friendName: string) => {
            const cleanFriend = (friendName || '').replace(/^@/, '').toLowerCase()
            const existing = localContacts.find((c) => (c.username || '').replace(/^@/, '').toLowerCase() === cleanFriend)
            if (!existing) {
              db.addContact({
                username: (friendName || '').replace(/^@/, ''),
                public_key: 'UNKNOWN_KEY',
                display_name: (friendName || '').replace(/^@/, ''),
                created_at: new Date().toISOString(),
                status: 'active',
              })
            } else if (existing.status !== 'active') {
              db.addContact({
                ...existing,
                status: 'active',
              })
            }
          })
        } catch (e) {
          console.error('[Vexta WSS] Failed to sync friends to local contacts:', e)
        }
      }
      this.friendsListeners.forEach((fn) => fn(friends))
      window.dispatchEvent(new CustomEvent('vexta_friend_request_updated'))
      window.dispatchEvent(new CustomEvent('vexta_contacts_updated'))
    } else if (payload.type === 'FRIEND_REQUEST_SENT') {
      console.log(`[Vexta WSS] FRIEND_REQUEST_SENT confirmed for:`, payload.recipient)
      this.listFriendRequests()
    } else if (payload.type === 'AUTH_ERROR') {
      console.error(`[Vexta WSS] AUTH_ERROR from relay:`, payload.message || payload.reason)
      this.setStatus('auth_failed')
    } else if (payload.type === 'ERROR') {
      console.error(`[Vexta WSS] ERROR from relay:`, payload.message)
      window.dispatchEvent(new CustomEvent('vexta_server_error', { detail: { message: payload.message || 'An error occurred' } }))
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
    } else if (
      (payload.type &&
        ['blind_message', 'send_message', 'message', 'receive_message', 'relay', 'message_relay', 'direct_message'].includes(
          String(payload.type).toLowerCase(),
        )) ||
      (payload.sender && (payload.ciphertext || payload.wire_blob || payload.body))
    ) {
      console.log(`[Vexta WSS] Received incoming message frame from @${payload.sender}:`, payload.type)
      // Send ACK frame if message has id
      if (payload.id) {
        this.sendJson({ type: 'ACK', message_id: payload.id, id: payload.id, hardware_hash: 'sha256_7f8a91b2c4e57091' })
      }

      const activeUser = localStorage.getItem('vexta_active_user')
      if (activeUser) {
        try {
          const db = new VextaDatabaseManager(activeUser)
          const rawInput = payload.wire_blob || payload.ciphertext || payload.body || ''
          const trimmedInput = rawInput.trim()

          // Attempt base64 → UTF-8 decode only when the input looks like base64
          // (not a raw JSON object/array which would produce garbage if passed through atob)
          let text: string = rawInput
          let decodeSuccess = false
          if (trimmedInput && !trimmedInput.startsWith('{') && !trimmedInput.startsWith('[')) {
            try {
              const decoded = base64ToUtf8(rawInput)
              if (decoded && decoded !== rawInput) {
                text = decoded
                decodeSuccess = true
              }
            } catch {
              // not valid base64 — keep text = rawInput
            }
          }

          console.log(`[Vexta WSS] Decode: raw="${rawInput.slice(0, 30)}" → text="${text.slice(0, 60)}" (decodeOk=${decodeSuccess})`)

          // Try parsing the decoded text as JSON (for structured control/file frames)
          // Fall back to parsing the raw input in case it's already plain JSON
          const innerPayload = cleanDecodePayload(text) || cleanDecodePayload(rawInput)

          const parseTs = (ts: any): string => {
            if (typeof ts === 'number') return new Date(ts).toISOString()
            if (typeof ts === 'string' && ts) return ts
            return new Date().toISOString()
          }
          const msgTimestamp = parseTs(payload.timestamp)

          // Update sender presence on any incoming message or packet
          if (payload.sender && payload.sender !== activeUser) {
            db.updateContactLastActive(payload.sender, new Date().toISOString())
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('vexta_presence_updated', { detail: { username: payload.sender } }))
            }
          }

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

              const ext = (innerPayload.filename.split('.').pop() || '').toLowerCase()
              const isPhoto = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
              const isVideo = ['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)
              const isVoice = innerPayload.filename.startsWith('voice_')
              const kind: 'file' | 'photo' | 'video' = isPhoto ? 'photo' : isVideo ? 'video' : 'file'

              const formatSize = (bytes: number) => {
                if (bytes < 1024) return `${bytes} B`
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
              }

              if (isVoice) {
                db.saveMessage({
                  sender: payload.sender,
                  recipient: activeUser,
                  ciphertext: `🎤 Voice note (${formatSize(innerPayload.file_size)})`,
                  timestamp: msgTimestamp,
                  is_read: 0,
                  transfer_id: innerPayload.transfer_id,
                })
              } else {
                db.saveMessage({
                  sender: payload.sender,
                  recipient: activeUser,
                  ciphertext: innerPayload.filename,
                  timestamp: msgTimestamp,
                  is_read: 0,
                  transfer_id: innerPayload.transfer_id,
                  attachment: {
                    kind,
                    name: innerPayload.filename,
                    size: formatSize(innerPayload.file_size),
                  },
                })
              }

              if (typeof window !== 'undefined') {
                const cleanSender = (payload.sender || '').replace(/^@/, '')
                window.dispatchEvent(new CustomEvent('vexta_messages_updated', { detail: { name: cleanSender } }))
              }
            } else if (innerPayload.type === 'file_chunk') {
              const transfer = db.getFileTransfer(innerPayload.transfer_id)
              if (!transfer) {
                console.warn(`[Vexta WSS] file_chunk received for unknown transfer ${innerPayload.transfer_id} (file_init not yet processed?)`)
              } else {
                const chunkIdx = innerPayload.chunk_index !== undefined ? innerPayload.chunk_index : transfer.received_chunks
                console.log(`[Vexta WSS] Chunk ${chunkIdx}/${transfer.total_chunks - 1} for transfer ${innerPayload.transfer_id}`)
                indexedDbCache.saveChunk(innerPayload.transfer_id, chunkIdx, innerPayload.data)
                  .then((receivedCount) => {
                    console.log(`[Vexta WSS] Saved chunk, count=${receivedCount}/${transfer.total_chunks}`)
                    const isComplete = receivedCount >= transfer.total_chunks

                    db.updateFileTransferProgress(
                      innerPayload.transfer_id,
                      receivedCount,
                      isComplete ? 'completed' : 'transferring',
                    )

                    if (isComplete) {
                      console.log(`[Vexta WSS] Transfer ${innerPayload.transfer_id} complete! Assembling...`)
                      indexedDbCache.getChunks(innerPayload.transfer_id, transfer.total_chunks)
                        .then((allChunks) => {
                          const hasMissing = allChunks.length < transfer.total_chunks || allChunks.some((c) => !c)
                          if (hasMissing) {
                            console.warn(`[Vexta WSS] Transfer ${innerPayload.transfer_id} has missing chunks (${allChunks.filter(Boolean).length}/${transfer.total_chunks}), deferring completion`)
                            return
                          }
                          this.cacheCompletedTransfer(db, transfer, allChunks as string[])
                            .then(() => indexedDbCache.clearChunks(innerPayload.transfer_id, transfer.total_chunks))
                            .catch((err) => console.warn('[Vexta WSS] Cache failed:', err))
                        })
                    }
                  })
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
                const ts = parseTs(innerPayload.timestamp || payload.timestamp)
                db.updateContactLastActive(payload.sender, ts)
                window.dispatchEvent(new CustomEvent('vexta_presence_updated', { detail: { username: payload.sender } }))
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
            } else if (innerPayload.type === 'call_end') {
              db.saveMessage({
                sender: payload.sender,
                recipient: payload.recipient,
                ciphertext: 'CALL_EVENT:Call Ended',
                timestamp: msgTimestamp,
                is_read: 0,
              })
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('vexta_messages_updated', { detail: { name: payload.sender } }))
              }
            } else {
              // Plain text message - save with decoded text and correct recipient
              if (!isControlMessage(text) && text && text.trim()) {
                console.log(`[Vexta WSS] Saving plain text msg from @${payload.sender}: "${text.slice(0, 40)}"`)
                db.saveMessage({
                  sender: payload.sender,
                  recipient: activeUser,
                  ciphertext: text,
                  timestamp: msgTimestamp,
                  is_read: 0,
                })
              }
            }
          } else {
            // No structured inner payload — plain text or unrecognized frame
            if (!isControlMessage(rawInput) && !isControlMessage(text) && text && text.trim()) {
              console.log(`[Vexta WSS] Saving unstructured msg from @${payload.sender}: "${text.slice(0, 40)}"`)
              db.saveMessage({
                sender: payload.sender,
                recipient: activeUser,
                ciphertext: text,
                timestamp: msgTimestamp,
                is_read: 0,
              })
            }
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

  private offlineOutboundQueue: any[] = []

  private flushOutboundQueue() {
    try {
      const stored = localStorage.getItem('vexta_offline_outbound_queue')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.offlineOutboundQueue = [...parsed, ...this.offlineOutboundQueue]
        }
      }
    } catch {}

    if (this.offlineOutboundQueue.length === 0) return
    console.log(`[Vexta WSS] Flushing ${this.offlineOutboundQueue.length} queued offline messages...`)
    while (this.offlineOutboundQueue.length > 0) {
      const msg = this.offlineOutboundQueue.shift()
      if (msg) {
        this.sendJson(msg)
      }
    }
    localStorage.removeItem('vexta_offline_outbound_queue')
  }

  sendBlindMessage(recipient: string, wireBlob: string, selfCiphertext?: string) {
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

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[Vexta WSS] Socket not connected. Queuing message for recipient @${recipient}...`)
      this.offlineOutboundQueue.push(msg)
      try {
        localStorage.setItem('vexta_offline_outbound_queue', JSON.stringify(this.offlineOutboundQueue))
      } catch {}
      return false
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
    const b64Payload = utf8ToBase64(innerPayload)

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
    this.sendBlindMessage(recipient, utf8ToBase64(innerPayload))
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
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
  }

  sendFileChunk(recipient: string, transferId: string, chunkIndex: number, encryptedChunkB64: string) {
    const payload = JSON.stringify({
      type: 'file_chunk',
      transfer_id: transferId,
      chunk_index: chunkIndex,
      data: encryptedChunkB64,
    })
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
  }

  sendFileStatusQuery(recipient: string, transferId: string) {
    const payload = JSON.stringify({
      type: 'file_status_query',
      transfer_id: transferId,
    })
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
  }

  sendFileStatusResponse(recipient: string, transferId: string, receivedChunks: number, status: string) {
    const payload = JSON.stringify({
      type: 'file_status_response',
      transfer_id: transferId,
      received_chunks: receivedChunks,
      status,
    })
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
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
    const wireBlob = utf8ToBase64(`SYNC_META:${payload}`)
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
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
  }

  sendCallOffer(recipient: string, sdp: any, isGroup = false, isVideo = false) {
    const payload = JSON.stringify({
      type: 'call_offer',
      sdp,
      is_group: isGroup,
      is_video: isVideo,
    })
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
  }

  sendCallAnswer(recipient: string, sdp: any) {
    const payload = JSON.stringify({
      type: 'call_answer',
      sdp,
    })
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
  }

  sendIceCandidate(recipient: string, candidate: any) {
    const payload = JSON.stringify({
      type: 'call_ice',
      candidate,
    })
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
  }

  sendCallEnd(recipient: string) {
    const payload = JSON.stringify({
      type: 'call_end',
    })
    this.sendBlindMessage(recipient, utf8ToBase64(payload))
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
        this.sendBlindMessage(c.username, utf8ToBase64(payload))
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

      const ext = (transfer.filename.split('.').pop() || '').toLowerCase()
      let mimeType = 'application/octet-stream'

      if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg'
      else if (ext === 'png') mimeType = 'image/png'
      else if (ext === 'gif') mimeType = 'image/gif'
      else if (ext === 'webp') mimeType = 'image/webp'
      else if (ext === 'webm') mimeType = transfer.filename.startsWith('voice_') ? 'audio/webm' : 'video/webm'
      else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) mimeType = `audio/${ext}`
      else if (['mp4', 'mov', 'mkv'].includes(ext)) mimeType = `video/${ext}`
      else if (ext === 'pdf') mimeType = 'application/pdf'

      const blobParts: BlobPart[] = decryptedChunks.map(
        (c) => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer,
      )
      const blob = new Blob(blobParts, { type: mimeType })
      const { cachedFilename, cachedPath, cachedUrl } = await cacheReceivedMedia(blob, transfer.filename)

      const finalPath = cachedPath ? `file://${cachedPath}` : cachedUrl

      db.updateFileTransferProgress(
        transfer.transfer_id,
        transfer.total_chunks,
        'completed',
        finalPath,
        cachedFilename,
      )

      // Auto-save completed transfer to receiver's database & notify React UI
      const isVoice = transfer.filename.startsWith('voice_') || mimeType.startsWith('audio/')
      const isPhoto = mimeType.startsWith('image/')
      const isVideo = mimeType.startsWith('video/')

      const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      }

      if (isVoice) {
        // Try to update the existing placeholder by transfer_id first
        const updated = db.updateMessageByTransferId(transfer.transfer_id, { voiceUrl: finalPath })
        if (!updated) {
          // No placeholder found — save as new (e.g. app restarted mid-transfer)
          db.saveMessage({
            sender: transfer.sender,
            recipient: transfer.recipient,
            ciphertext: `🎤 Voice note (${formatSize(blob.size)})`,
            timestamp: new Date().toISOString(),
            is_read: 0,
            voiceUrl: finalPath,
            transfer_id: transfer.transfer_id,
          })
        }
      } else {
        const kind: 'file' | 'photo' | 'video' = isPhoto ? 'photo' : isVideo ? 'video' : 'file'
        // Try to update the existing placeholder by transfer_id first
        const updated = db.updateMessageByTransferId(transfer.transfer_id, {
          attachment: {
            kind,
            name: transfer.filename,
            size: formatSize(blob.size),
            url: finalPath,
          },
        })
        if (!updated) {
          // No placeholder found — save as new (e.g. app restarted mid-transfer)
          db.saveMessage({
            sender: transfer.sender,
            recipient: transfer.recipient,
            ciphertext: transfer.filename,
            timestamp: new Date().toISOString(),
            is_read: 0,
            attachment: {
              kind,
              name: transfer.filename,
              size: formatSize(blob.size),
              url: finalPath,
            },
            transfer_id: transfer.transfer_id,
          })
        }
      }

      const cleanSender = (transfer.sender || '').replace(/^@/, '')
      window.dispatchEvent(new CustomEvent('vexta_messages_updated', { detail: { name: cleanSender } }))
      window.dispatchEvent(
        new CustomEvent('vexta_file_transfer_completed', {
          detail: {
            filename: transfer.filename,
            url: finalPath,
            sender: cleanSender,
            transfer_id: transfer.transfer_id,
          },
        }),
      )
      console.log(`[Vexta WSS] Cached file ${transfer.filename} → ${finalPath}`)
    } catch (err) {
      console.error('[Vexta WSS] Failed to cache completed transfer:', err)
    }
  }

  // ── Substrata Extended Protocol Frame Helpers ───────────────
  sendFriendRequest(recipient: string) {
    this.sendJson({ type: 'SEND_FRIEND_REQUEST', recipient })
  }

  acceptFriendRequest(requestId: string | number) {
    const numericId = typeof requestId === 'number' ? requestId : parseInt(String(requestId), 10)
    if (!isNaN(numericId)) {
      this.sendJson({ type: 'ACCEPT_FRIEND_REQUEST', request_id: numericId, id: numericId })
    } else {
      const cleanUser = String(requestId).replace(/^@/, '').trim()
      this.sendJson({ type: 'ACCEPT_FRIEND_REQUEST', request_id: cleanUser, username: cleanUser })
    }
  }

  rejectFriendRequest(requestId: string | number) {
    const numericId = typeof requestId === 'number' ? requestId : parseInt(String(requestId), 10)
    if (!isNaN(numericId)) {
      this.sendJson({ type: 'REJECT_FRIEND_REQUEST', request_id: numericId, id: numericId })
    } else {
      const cleanUser = String(requestId).replace(/^@/, '').trim()
      this.sendJson({ type: 'REJECT_FRIEND_REQUEST', request_id: cleanUser, username: cleanUser })
    }
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
    this.stopPingHeartbeat()
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
