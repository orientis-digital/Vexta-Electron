/**
 * Vexta Bedrock Local Database Manager (SQLite Compatibility Layer)
 * Manages per-profile SQLite database storage for:
 * - user_meta (salt, encrypted DEK, encrypted RSA private key, KDF params, recovery code)
 * - contacts (username, public_key, display_name, status)
 * - messages (sender, recipient, ciphertext, timestamp, timer)
 * - groups & group_members
 * - server_trust (TOFU fingerprints)
 * - file_transfers
 */

import { isControlMessage } from '../network/codec'
import { encryptVaultString, decryptVaultString } from './kdf'
import { AuthSession } from './session'

export type DbUserMeta = {
  id: number
  username: string
  salt: string
  encrypted_dek: string
  encrypted_private_key: string
  kdf_params: string
  encrypted_recovery_code?: string
  login_throttle?: string
}

export type DbContact = {
  username: string
  public_key: string
  display_name?: string
  created_at: string
  status: 'active' | 'blocked' | 'pending'
  direction?: 'incoming' | 'outgoing'
}

export type DbMessage = {
  id?: number
  sender: string
  recipient: string
  ciphertext: string
  timestamp: string
  is_read: number
  timer?: string
  reactions?: string[]
  is_system?: number
  voiceUrl?: string
  attachment?: any
  status?: 'sent' | 'delivered' | 'read'
  transfer_id?: string
}

export type DbGroup = {
  group_id: string
  group_name: string
  creator: string
  created_at: string
}

export type DbGroupMember = {
  group_id: string
  member_username: string
  joined_at: string
}

export type DbFileTransfer = {
  transfer_id: string
  filename: string
  file_size: number
  chunk_size: number
  total_chunks: number
  received_chunks: number
  file_key: string
  file_hash: string
  sender: string
  recipient: string
  created_at: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  cached_path?: string
  cached_filename?: string
}

export type DbServerTrust = {
  server_host: string
  server_fingerprint: string
  trusted_at: string
}

export type DbDevice = {
  id: string
  name: string
  type: 'desktop' | 'mobile'
  hardwareHash: string
  lastSeen: string
  isCurrent?: boolean
  status?: 'active' | 'pending_approval' | 'revoked'
}

export class VextaDatabaseManager {
  private dbName: string
  private storageKey: string
  private static decryptedCache = new Map<string, string>()

  static clearCache() {
    VextaDatabaseManager.decryptedCache.clear()
  }

  static async preloadVault(username: string) {
    const cleanUser = username.toLowerCase()
    const storageKey = `vexta_db_${cleanUser}`
    const masterKey = AuthSession.getMasterKey()
    if (!masterKey) return

    const suffixes = [
      'contacts',
      'messages',
      'groups',
      'group_members',
      'file_transfers',
      'chat_timers',
      'chat_themes',
      'pinned_messages',
      'devices',
      'server_trust',
      'presence_overrides',
      'last_active',
    ]

    for (const suffix of suffixes) {
      const fullKey = `${storageKey}_${suffix}`
      const raw = localStorage.getItem(fullKey)
      if (raw && raw.startsWith('VXENC:')) {
        const decrypted = await decryptVaultString(masterKey, raw)
        if (decrypted) {
          VextaDatabaseManager.decryptedCache.set(fullKey, decrypted)
        }
      }
    }
  }

  getDbName() {
    return this.dbName
  }

  getVextaStoragePath() {
    return `~/.config/Vexta/${this.dbName}.db`
  }

  constructor(username: string) {
    const cleanUser = username.toLowerCase()
    this.dbName = `account_${cleanUser}`
    this.storageKey = `vexta_db_${cleanUser}`
    this.initTables()
  }

  private readStore(tableSuffix: string): string | null {
    const fullKey = `${this.storageKey}_${tableSuffix}`
    const cached = VextaDatabaseManager.decryptedCache.get(fullKey)
    if (cached) return cached

    const raw = localStorage.getItem(fullKey)
    if (!raw) return null

    if (raw.startsWith('VXENC:')) {
      const masterKey = AuthSession.getMasterKey()
      if (masterKey) {
        decryptVaultString(masterKey, raw).then((dec) => {
          if (dec) {
            VextaDatabaseManager.decryptedCache.set(fullKey, dec)
          }
        })
      }
      return null
    }

    // Legacy unencrypted plaintext: cache and migrate to AES-GCM envelope
    VextaDatabaseManager.decryptedCache.set(fullKey, raw)
    const masterKey = AuthSession.getMasterKey()
    if (masterKey) {
      encryptVaultString(masterKey, raw).then((enc) => {
        localStorage.setItem(fullKey, enc)
      }).catch(() => {})
    }
    return raw
  }

  private writeStore(tableSuffix: string, jsonStr: string): void {
    const fullKey = `${this.storageKey}_${tableSuffix}`
    VextaDatabaseManager.decryptedCache.set(fullKey, jsonStr)

    const masterKey = AuthSession.getMasterKey()
    if (masterKey) {
      encryptVaultString(masterKey, jsonStr).then((enc) => {
        localStorage.setItem(fullKey, enc)
      }).catch(() => {
        localStorage.setItem(fullKey, jsonStr)
      })
    } else {
      localStorage.setItem(fullKey, jsonStr)
    }
  }

  private checkStorageAccess(): boolean {
    try {
      const testKey = `__vexta_test_${Date.now()}`
      localStorage.setItem(testKey, '1')
      localStorage.removeItem(testKey)
      return true
    } catch (err: any) {
      console.error('[Vexta DB] Cannot access database/storage:', err)
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('vexta:db-error', {
          detail: { message: err?.message || 'Access to local database storage is denied or blocked' },
        })
        window.dispatchEvent(event)
      }
      return false
    }
  }

  private initTables() {
    if (!this.checkStorageAccess()) return

    try {
      const defaultSystemContact: DbContact = {
        username: 'Vexta - Global Message',
        public_key: 'SYSTEM_GLOBAL_KEY',
        display_name: 'Vexta - Global Message',
        created_at: new Date().toISOString(),
        status: 'active',
      }

      if (!this.readStore('contacts')) {
        this.writeStore('contacts', JSON.stringify([defaultSystemContact]))
      }

      if (!this.readStore('messages')) {
        const defaultWelcomeMsg: DbMessage = {
          id: 1,
          sender: 'Vexta - Global Message',
          recipient: this.storageKey.replace('vexta_db_', ''),
          ciphertext: 'Welcome to Vexta Protocol! All your session keys remain zero-knowledge encrypted on your device.',
          timestamp: new Date().toISOString(),
          is_read: 1,
          is_system: 1,
        }
        this.writeStore('messages', JSON.stringify([defaultWelcomeMsg]))
      }

      if (!this.readStore('groups')) {
        this.writeStore('groups', JSON.stringify([]))
      }

      if (!this.readStore('group_members')) {
        this.writeStore('group_members', JSON.stringify([]))
      }

      if (!this.readStore('file_transfers')) {
        this.writeStore('file_transfers', JSON.stringify([]))
      }

      if (!this.readStore('chat_timers')) {
        this.writeStore('chat_timers', JSON.stringify({}))
      }

      if (!this.readStore('devices')) {
        this.writeStore('devices', JSON.stringify([]))
      }

      if (!this.readStore('server_trust')) {
        this.writeStore('server_trust', JSON.stringify([]))
      }
    } catch (err: any) {
      console.error('[Vexta DB] Error initializing tables:', err)
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('vexta:db-error', {
          detail: { message: err?.message || 'Cannot access local database storage' },
        })
        window.dispatchEvent(event)
      }
    }
  }

  // ── Contacts API ──────────────────────────────────────
  getContacts(): DbContact[] {
    const data = this.readStore('contacts')
    let contacts: DbContact[] = data ? JSON.parse(data) : []
    const systemChannelName = 'Vexta - Global Message'
    if (!contacts.some((c) => c.username === systemChannelName)) {
      const defaultSysContact: DbContact = {
        username: systemChannelName,
        public_key: 'SYSTEM_GLOBAL_KEY',
        display_name: systemChannelName,
        created_at: new Date().toISOString(),
        status: 'active',
      }
      contacts.unshift(defaultSysContact)
      this.writeStore('contacts', JSON.stringify(contacts))
    }
    return contacts
  }

  addContact(contact: DbContact) {
    const contacts = this.getContacts()
    const cleanUsername = (contact.username || '').trim().replace(/^@/, '').toLowerCase()
    const updated = contacts.filter((c) => (c.username || '').trim().replace(/^@/, '').toLowerCase() !== cleanUsername)
    const normalizedContact: DbContact = {
      ...contact,
      username: (contact.username || '').trim().replace(/^@/, '')
    }
    updated.push(normalizedContact)
    this.writeStore('contacts', JSON.stringify(updated))
  }

  removeContact(username: string) {
    const cleanUsername = (username || '').trim().replace(/^@/, '').toLowerCase()
    const contacts = this.getContacts().filter((c) => (c.username || '').trim().replace(/^@/, '').toLowerCase() !== cleanUsername)
    this.writeStore('contacts', JSON.stringify(contacts))
  }

  // ── Groups API ────────────────────────────────────────
  getGroups(): DbGroup[] {
    const data = this.readStore('groups')
    return data ? JSON.parse(data) : []
  }

  saveGroup(group: DbGroup, members?: string[]) {
    const groups = this.getGroups().filter((g) => g.group_id !== group.group_id)
    groups.push(group)
    this.writeStore('groups', JSON.stringify(groups))

    if (members && members.length > 0) {
      const allMembersData = this.readStore('group_members')
      let allMembers: DbGroupMember[] = allMembersData ? JSON.parse(allMembersData) : []
      allMembers = allMembers.filter((m) => m.group_id !== group.group_id)
      for (const username of members) {
        allMembers.push({
          group_id: group.group_id,
          member_username: username,
          joined_at: new Date().toISOString(),
        })
      }
      this.writeStore('group_members', JSON.stringify(allMembers))
    }
  }

  deleteGroup(groupId: string) {
    const groups = this.getGroups().filter((g) => g.group_id !== groupId)
    this.writeStore('groups', JSON.stringify(groups))

    const allMembersData = this.readStore('group_members')
    const allMembers: DbGroupMember[] = allMembersData ? JSON.parse(allMembersData) : []
    const updatedMembers = allMembers.filter((m) => m.group_id !== groupId)
    this.writeStore('group_members', JSON.stringify(updatedMembers))
  }

  getGroupMembers(groupId: string): string[] {
    const data = this.readStore('group_members')
    const all: DbGroupMember[] = data ? JSON.parse(data) : []
    return all.filter((m) => m.group_id === groupId).map((m) => m.member_username)
  }

  addGroupMember(groupId: string, memberUsername: string) {
    const data = this.readStore('group_members')
    const all: DbGroupMember[] = data ? JSON.parse(data) : []
    if (!all.some((m) => m.group_id === groupId && m.member_username === memberUsername)) {
      all.push({
        group_id: groupId,
        member_username: memberUsername,
        joined_at: new Date().toISOString(),
      })
      this.writeStore('group_members', JSON.stringify(all))
    }
  }

  removeGroupMember(groupId: string, memberUsername: string) {
    const data = this.readStore('group_members')
    const all: DbGroupMember[] = data ? JSON.parse(data) : []
    const updated = all.filter(
      (m) => !(m.group_id === groupId && m.member_username === memberUsername),
    )
    this.writeStore('group_members', JSON.stringify(updated))
  }

  // ── Messages API ──────────────────────────────────────
  getMessages(chatId: string): DbMessage[] {
    const data = this.readStore('messages')
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const cleanId = (chatId || '').trim().replace(/^group_/, '').replace(/^@/, '').toLowerCase()
    const isGroupChat = chatId.startsWith('group_')

    return all.filter((m) => {
      if (!m || (!m.ciphertext && !m.attachment && !m.voiceUrl)) return false
      if (m.ciphertext && !m.ciphertext.trim() && !m.attachment && !m.voiceUrl) return false
      if (isControlMessage(m.ciphertext)) return false

      const cleanSender = (m.sender || '').trim().replace(/^group_/, '').replace(/^@/, '').toLowerCase()
      const cleanRecipient = (m.recipient || '').trim().replace(/^group_/, '').replace(/^@/, '').toLowerCase()

      if (isGroupChat) {
        return (
          (m.sender || '').trim().replace(/^@/, '').toLowerCase() === `group_${cleanId}` ||
          (m.recipient || '').trim().replace(/^@/, '').toLowerCase() === `group_${cleanId}` ||
          cleanSender === cleanId ||
          cleanRecipient === cleanId
        )
      }

      return cleanSender === cleanId || cleanRecipient === cleanId
    })
  }

  saveMessage(msg: DbMessage) {
    if (!msg || (!msg.ciphertext && !msg.attachment && !msg.voiceUrl)) return
    if (msg.ciphertext && isControlMessage(msg.ciphertext)) {
      return // Ignore control / signaling packets
    }

    const data = this.readStore('messages')
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const cleanSender = (msg.sender || '').trim().replace(/^@/, '')
    const cleanRecipient = (msg.recipient || '').trim().replace(/^@/, '')

    // Check if an existing pending placeholder message exists for this attachment/filename
    const existingIndex = all.findIndex((m) => {
      if (msg.id && m.id === msg.id) return true

      const sameSender = (m.sender || '').trim().replace(/^@/, '').toLowerCase() === cleanSender.toLowerCase()
      const sameRecipient = (m.recipient || '').trim().replace(/^@/, '').toLowerCase() === cleanRecipient.toLowerCase()
      if (!sameSender || !sameRecipient) return false

      // Only match placeholders that haven't been completed yet (no attachment.url or voiceUrl)
      const isPendingPlaceholder = !m.voiceUrl && (!m.attachment || !m.attachment.url)
      if (!isPendingPlaceholder) return false

      if (msg.attachment?.name && m.attachment?.name === msg.attachment.name) return true
      if (msg.ciphertext && m.ciphertext === msg.ciphertext && (m.attachment || m.voiceUrl || msg.attachment || msg.voiceUrl)) return true
      return false
    })

    if (existingIndex >= 0) {
      all[existingIndex] = {
        ...all[existingIndex],
        ...msg,
        sender: cleanSender,
        recipient: cleanRecipient,
        attachment: msg.attachment || all[existingIndex].attachment,
        voiceUrl: msg.voiceUrl || all[existingIndex].voiceUrl,
      }
    } else {
      const normalizedMsg: DbMessage = {
        ...msg,
        sender: cleanSender,
        recipient: cleanRecipient,
        id: all.length + 1,
      }
      all.push(normalizedMsg)
    }

    this.writeStore('messages', JSON.stringify(all))
  }

  deleteMessage(msgId: number) {
    const data = this.readStore('messages')
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const filtered = all.filter((m) => m.id !== msgId)
    this.writeStore('messages', JSON.stringify(filtered))
  }

  /**
   * Updates an existing placeholder message that has a matching transfer_id.
   * Patches in the resolved URL / voiceUrl / attachment.url without creating a duplicate.
   * Returns true if a matching placeholder was found and updated.
   */
  updateMessageByTransferId(
    transferId: string,
    patch: { url?: string; voiceUrl?: string; attachment?: any },
  ): boolean {
    const data = this.readStore('messages')
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const idx = all.findIndex((m) => m.transfer_id === transferId)
    if (idx < 0) return false
    const existing = all[idx]
    if (patch.voiceUrl) {
      existing.voiceUrl = patch.voiceUrl
    }
    if (patch.attachment) {
      existing.attachment = { ...(existing.attachment || {}), ...patch.attachment }
    } else if (patch.url && existing.attachment) {
      existing.attachment = { ...existing.attachment, url: patch.url }
    }
    this.writeStore('messages', JSON.stringify(all))
    return true
  }

  clearMessages(chatId: string) {
    const data = this.readStore('messages')
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const cleanId = chatId.replace(/^group_/, '')
    const filtered = all.filter(
      (m) =>
        m.sender !== chatId &&
        m.recipient !== chatId &&
        m.recipient !== `group_${chatId}` &&
        m.sender !== `group_${chatId}` &&
        m.sender !== cleanId &&
        m.recipient !== cleanId &&
        m.sender !== `group_${cleanId}` &&
        m.recipient !== `group_${cleanId}`,
    )
    this.writeStore('messages', JSON.stringify(filtered))
  }

  toggleMessageReaction(msgId: number, emoji: string) {
    const data = this.readStore('messages')
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const msg = all.find((m) => m.id === msgId)
    if (msg) {
      const current = msg.reactions || []
      if (current.includes(emoji)) {
        msg.reactions = current.filter((r) => r !== emoji)
      } else {
        msg.reactions = [...current, emoji]
      }
      this.writeStore('messages', JSON.stringify(all))
    }
  }

  // ── Chat Timer & Disappearing Messages API ───────────
  getChatTimer(chatId: string): string | null {
    const data = this.readStore('chat_timers')
    const timers = data ? JSON.parse(data) : {}
    return timers[chatId] || null
  }

  setChatTimer(chatId: string, timer: string | null) {
    const data = this.readStore('chat_timers')
    const timers = data ? JSON.parse(data) : {}
    if (timer) {
      timers[chatId] = timer
    } else {
      delete timers[chatId]
    }
    this.writeStore('chat_timers', JSON.stringify(timers))
  }

  // ── Per-Chat Color Theme Presets API ────────────────────
  getChatTheme(chatId: string): string {
    const data = this.readStore('chat_themes')
    const themes = data ? JSON.parse(data) : {}
    return themes[chatId] || 'cyber_neon'
  }

  setChatTheme(chatId: string, themeId: string) {
    const data = this.readStore('chat_themes')
    const themes = data ? JSON.parse(data) : {}
    themes[chatId] = themeId
    this.writeStore('chat_themes', JSON.stringify(themes))
  }

  // ── Pinned Messages API ──────────────────────────────
  getPinnedMessage(chatId: string): string | null {
    const data = this.readStore('pinned_messages')
    const pinnedMap = data ? JSON.parse(data) : {}
    return pinnedMap[chatId] || null
  }

  setPinnedMessage(chatId: string, text: string | null) {
    const data = this.readStore('pinned_messages')
    const pinnedMap = data ? JSON.parse(data) : {}
    if (text) {
      pinnedMap[chatId] = text
    } else {
      delete pinnedMap[chatId]
    }
    this.writeStore('pinned_messages', JSON.stringify(pinnedMap))
  }

  purgeExpiredMessages(): number {
    const data = this.readStore('messages')
    if (!data) return 0
    const all: DbMessage[] = JSON.parse(data)
    const now = Date.now()

    const parseDurationMs = (timerStr?: string): number | null => {
      if (!timerStr) return null
      const unit = timerStr.slice(-1)
      const val = parseInt(timerStr.slice(0, -1), 10)
      if (isNaN(val)) return null
      if (unit === 's') return val * 1000
      if (unit === 'm') return val * 60 * 1000
      if (unit === 'h') return val * 3600 * 1000
      if (unit === 'd') return val * 86400 * 1000
      return null
    }

    const unexpired = all.filter((msg) => {
      if (!msg.timer) return true
      const ms = parseDurationMs(msg.timer)
      if (!ms) return true
      const created = new Date(msg.timestamp).getTime()
      if (isNaN(created)) return true
      return now - created < ms
    })

    const purgedCount = all.length - unexpired.length
    if (purgedCount > 0) {
      this.writeStore('messages', JSON.stringify(unexpired))
    }
    return purgedCount
  }

  // ── File Transfer API ─────────────────────────────────
  getFileTransfers(): DbFileTransfer[] {
    const data = this.readStore('file_transfers')
    return data ? JSON.parse(data) : []
  }

  getFileTransfer(transferId: string): DbFileTransfer | null {
    return this.getFileTransfers().find((t) => t.transfer_id === transferId) || null
  }

  saveFileTransfer(transfer: DbFileTransfer) {
    const transfers = this.getFileTransfers().filter((t) => t.transfer_id !== transfer.transfer_id)
    transfers.push(transfer)
    this.writeStore('file_transfers', JSON.stringify(transfers))
  }

  updateFileTransferProgress(
    transferId: string,
    receivedChunks: number,
    status?: DbFileTransfer['status'],
    cachedPath?: string,
    cachedFilename?: string,
  ) {
    const transfers = this.getFileTransfers()
    const item = transfers.find((t) => t.transfer_id === transferId)
    if (item) {
      item.received_chunks = receivedChunks
      if (status) item.status = status
      if (cachedPath) item.cached_path = cachedPath
      if (cachedFilename) item.cached_filename = cachedFilename
      this.writeStore('file_transfers', JSON.stringify(transfers))
    }
  }

  // ── Server Trust API (TOFU) ──────────────────────────
  getServerTrust(host: string): DbServerTrust | null {
    const data = this.readStore('server_trust')
    const all: DbServerTrust[] = data ? JSON.parse(data) : []
    return all.find((s) => s.server_host === host) || null
  }

  saveServerTrust(trust: DbServerTrust) {
    const data = this.readStore('server_trust')
    const all: DbServerTrust[] = data ? JSON.parse(data) : []
    const updated = all.filter((s) => s.server_host !== trust.server_host)
    updated.push(trust)
    this.writeStore('server_trust', JSON.stringify(updated))
  }

  // ── Devices API ──────────────────────────────────────
  getDevices(): DbDevice[] {
    const data = this.readStore('devices')
    return data ? JSON.parse(data) : []
  }

  getPendingDevices(): DbDevice[] {
    return this.getDevices().filter((d) => d.status === 'pending_approval')
  }

  saveDevice(device: DbDevice) {
    const all = this.getDevices().filter((d) => d.id !== device.id)
    all.push(device)
    this.writeStore('devices', JSON.stringify(all))
  }

  updateDeviceStatus(deviceId: string, status: 'active' | 'pending_approval' | 'revoked') {
    const devices = this.getDevices()
    const target = devices.find((d) => d.id === deviceId)
    if (target) {
      target.status = status
      target.lastSeen = new Date().toISOString()
      this.writeStore('devices', JSON.stringify(devices))
    }
  }

  removeDevice(deviceId: string) {
    const all = this.getDevices().filter((d) => d.id !== deviceId)
    this.writeStore('devices', JSON.stringify(all))
  }

  // ── Real-Time Presence & Privacy API ──────────────────
  getGlobalPresencePrivacy(): 'everyone' | 'nobody' {
    const val = this.readStore('presence_global')
    return val === 'nobody' ? 'nobody' : 'everyone'
  }

  setGlobalPresencePrivacy(mode: 'everyone' | 'nobody') {
    this.writeStore('presence_global', mode)
  }

  getFriendPresenceOverride(username: string): boolean {
    const cleanUsername = (username || '').trim().replace(/^@/, '').toLowerCase()
    const data = this.readStore('presence_overrides')
    const overrides = data ? JSON.parse(data) : {}
    return overrides[cleanUsername] !== false // Default true (allowed)
  }

  setFriendPresenceOverride(username: string, allow: boolean) {
    const cleanUsername = (username || '').trim().replace(/^@/, '').toLowerCase()
    const data = this.readStore('presence_overrides')
    const overrides = data ? JSON.parse(data) : {}
    overrides[cleanUsername] = allow
    this.writeStore('presence_overrides', JSON.stringify(overrides))
  }

  updateContactLastActive(username: string, timestamp: string) {
    const cleanUsername = (username || '').trim().replace(/^@/, '').toLowerCase()
    const data = this.readStore('last_active')
    const lastActiveMap = data ? JSON.parse(data) : {}
    lastActiveMap[cleanUsername] = timestamp
    this.writeStore('last_active', JSON.stringify(lastActiveMap))
  }

  getContactLastActive(username: string): string | null {
    const cleanUsername = (username || '').trim().replace(/^@/, '').toLowerCase()
    const data = this.readStore('last_active')
    const lastActiveMap = data ? JSON.parse(data) : {}
    return lastActiveMap[cleanUsername] || null
  }
}

