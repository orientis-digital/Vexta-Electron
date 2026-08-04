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
  status: 'pending' | 'transferring' | 'completed' | 'cancelled'
  created_at: string
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
}

export class VextaDatabaseManager {
  private dbName: string
  private storageKey: string

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

  private initTables() {
    if (!localStorage.getItem(`${this.storageKey}_contacts`)) {
      localStorage.setItem(`${this.storageKey}_contacts`, JSON.stringify([]))
    }

    if (!localStorage.getItem(`${this.storageKey}_messages`)) {
      localStorage.setItem(`${this.storageKey}_messages`, JSON.stringify([]))
    }

    if (!localStorage.getItem(`${this.storageKey}_groups`)) {
      localStorage.setItem(`${this.storageKey}_groups`, JSON.stringify([]))
    }

    if (!localStorage.getItem(`${this.storageKey}_group_members`)) {
      localStorage.setItem(`${this.storageKey}_group_members`, JSON.stringify([]))
    }

    if (!localStorage.getItem(`${this.storageKey}_file_transfers`)) {
      localStorage.setItem(`${this.storageKey}_file_transfers`, JSON.stringify([]))
    }

    if (!localStorage.getItem(`${this.storageKey}_chat_timers`)) {
      localStorage.setItem(`${this.storageKey}_chat_timers`, JSON.stringify({}))
    }

    if (!localStorage.getItem(`${this.storageKey}_server_trust`)) {
      localStorage.setItem(`${this.storageKey}_server_trust`, JSON.stringify([
        {
          server_host: 'vexta-api.nexusec.space',
          server_fingerprint: '7F:3A:91:B2:C4:E5:70:91',
          trusted_at: new Date().toISOString(),
        },
      ]))
    }
  }

  // ── Contacts API ──────────────────────────────────────
  getContacts(): DbContact[] {
    const data = localStorage.getItem(`${this.storageKey}_contacts`)
    return data ? JSON.parse(data) : []
  }

  addContact(contact: DbContact) {
    const contacts = this.getContacts()
    const updated = contacts.filter((c) => c.username !== contact.username)
    updated.push(contact)
    localStorage.setItem(`${this.storageKey}_contacts`, JSON.stringify(updated))
  }

  removeContact(username: string) {
    const contacts = this.getContacts().filter((c) => c.username !== username)
    localStorage.setItem(`${this.storageKey}_contacts`, JSON.stringify(contacts))
  }

  // ── Groups API ────────────────────────────────────────
  getGroups(): DbGroup[] {
    const data = localStorage.getItem(`${this.storageKey}_groups`)
    return data ? JSON.parse(data) : []
  }

  saveGroup(group: DbGroup, members?: string[]) {
    const groups = this.getGroups().filter((g) => g.group_id !== group.group_id)
    groups.push(group)
    localStorage.setItem(`${this.storageKey}_groups`, JSON.stringify(groups))

    if (members && members.length > 0) {
      const allMembersData = localStorage.getItem(`${this.storageKey}_group_members`)
      let allMembers: DbGroupMember[] = allMembersData ? JSON.parse(allMembersData) : []
      allMembers = allMembers.filter((m) => m.group_id !== group.group_id)
      for (const username of members) {
        allMembers.push({
          group_id: group.group_id,
          member_username: username,
          joined_at: new Date().toISOString(),
        })
      }
      localStorage.setItem(`${this.storageKey}_group_members`, JSON.stringify(allMembers))
    }
  }

  deleteGroup(groupId: string) {
    const groups = this.getGroups().filter((g) => g.group_id !== groupId)
    localStorage.setItem(`${this.storageKey}_groups`, JSON.stringify(groups))

    const allMembersData = localStorage.getItem(`${this.storageKey}_group_members`)
    const allMembers: DbGroupMember[] = allMembersData ? JSON.parse(allMembersData) : []
    const updatedMembers = allMembers.filter((m) => m.group_id !== groupId)
    localStorage.setItem(`${this.storageKey}_group_members`, JSON.stringify(updatedMembers))
  }

  getGroupMembers(groupId: string): string[] {
    const data = localStorage.getItem(`${this.storageKey}_group_members`)
    const all: DbGroupMember[] = data ? JSON.parse(data) : []
    return all.filter((m) => m.group_id === groupId).map((m) => m.member_username)
  }

  addGroupMember(groupId: string, memberUsername: string) {
    const data = localStorage.getItem(`${this.storageKey}_group_members`)
    const all: DbGroupMember[] = data ? JSON.parse(data) : []
    if (!all.some((m) => m.group_id === groupId && m.member_username === memberUsername)) {
      all.push({
        group_id: groupId,
        member_username: memberUsername,
        joined_at: new Date().toISOString(),
      })
      localStorage.setItem(`${this.storageKey}_group_members`, JSON.stringify(all))
    }
  }

  removeGroupMember(groupId: string, memberUsername: string) {
    const data = localStorage.getItem(`${this.storageKey}_group_members`)
    const all: DbGroupMember[] = data ? JSON.parse(data) : []
    const updated = all.filter(
      (m) => !(m.group_id === groupId && m.member_username === memberUsername),
    )
    localStorage.setItem(`${this.storageKey}_group_members`, JSON.stringify(updated))
  }

  // ── Messages API ──────────────────────────────────────
  getMessages(chatId: string): DbMessage[] {
    const data = localStorage.getItem(`${this.storageKey}_messages`)
    const all: DbMessage[] = data ? JSON.parse(data) : []
    return all.filter(
      (m) => m.sender === chatId || m.recipient === chatId || m.recipient === `group_${chatId}` || m.sender === `group_${chatId}`,
    )
  }

  saveMessage(msg: DbMessage) {
    const data = localStorage.getItem(`${this.storageKey}_messages`)
    const all: DbMessage[] = data ? JSON.parse(data) : []
    msg.id = all.length + 1
    all.push(msg)
    localStorage.setItem(`${this.storageKey}_messages`, JSON.stringify(all))
  }

  clearMessages(chatId: string) {
    const data = localStorage.getItem(`${this.storageKey}_messages`)
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const filtered = all.filter(
      (m) => m.sender !== chatId && m.recipient !== chatId && m.recipient !== `group_${chatId}` && m.sender !== `group_${chatId}`,
    )
    localStorage.setItem(`${this.storageKey}_messages`, JSON.stringify(filtered))
  }

  toggleMessageReaction(msgId: number, emoji: string) {
    const data = localStorage.getItem(`${this.storageKey}_messages`)
    const all: DbMessage[] = data ? JSON.parse(data) : []
    const msg = all.find((m) => m.id === msgId)
    if (msg) {
      const current = msg.reactions || []
      if (current.includes(emoji)) {
        msg.reactions = current.filter((r) => r !== emoji)
      } else {
        msg.reactions = [...current, emoji]
      }
      localStorage.setItem(`${this.storageKey}_messages`, JSON.stringify(all))
    }
  }

  // ── Chat Timer & Disappearing Messages API ───────────
  getChatTimer(chatId: string): string | null {
    const data = localStorage.getItem(`${this.storageKey}_chat_timers`)
    const timers = data ? JSON.parse(data) : {}
    return timers[chatId] || null
  }

  setChatTimer(chatId: string, timer: string | null) {
    const data = localStorage.getItem(`${this.storageKey}_chat_timers`)
    const timers = data ? JSON.parse(data) : {}
    if (timer) {
      timers[chatId] = timer
    } else {
      delete timers[chatId]
    }
    localStorage.setItem(`${this.storageKey}_chat_timers`, JSON.stringify(timers))
  }

  purgeExpiredMessages(): number {
    const data = localStorage.getItem(`${this.storageKey}_messages`)
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
      localStorage.setItem(`${this.storageKey}_messages`, JSON.stringify(unexpired))
    }
    return purgedCount
  }

  // ── File Transfer API ─────────────────────────────────
  getFileTransfers(): DbFileTransfer[] {
    const data = localStorage.getItem(`${this.storageKey}_file_transfers`)
    return data ? JSON.parse(data) : []
  }

  getFileTransfer(transferId: string): DbFileTransfer | null {
    return this.getFileTransfers().find((t) => t.transfer_id === transferId) || null
  }

  saveFileTransfer(transfer: DbFileTransfer) {
    const transfers = this.getFileTransfers().filter((t) => t.transfer_id !== transfer.transfer_id)
    transfers.push(transfer)
    localStorage.setItem(`${this.storageKey}_file_transfers`, JSON.stringify(transfers))
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
      localStorage.setItem(`${this.storageKey}_file_transfers`, JSON.stringify(transfers))
    }
  }

  // ── Server Trust API (TOFU) ──────────────────────────
  getServerTrust(host: string): DbServerTrust | null {
    const data = localStorage.getItem(`${this.storageKey}_server_trust`)
    const all: DbServerTrust[] = data ? JSON.parse(data) : []
    return all.find((s) => s.server_host === host) || null
  }

  saveServerTrust(trust: DbServerTrust) {
    const data = localStorage.getItem(`${this.storageKey}_server_trust`)
    const all: DbServerTrust[] = data ? JSON.parse(data) : []
    const updated = all.filter((s) => s.server_host !== trust.server_host)
    updated.push(trust)
    localStorage.setItem(`${this.storageKey}_server_trust`, JSON.stringify(updated))
  }

  // ── Devices API ──────────────────────────────────────
  getDevices(): DbDevice[] {
    const data = localStorage.getItem(`${this.storageKey}_devices`)
    return data ? JSON.parse(data) : []
  }

  saveDevice(device: DbDevice) {
    const all = this.getDevices().filter((d) => d.id !== device.id)
    all.push(device)
    localStorage.setItem(`${this.storageKey}_devices`, JSON.stringify(all))
  }

  removeDevice(deviceId: string) {
    const all = this.getDevices().filter((d) => d.id !== deviceId)
    localStorage.setItem(`${this.storageKey}_devices`, JSON.stringify(all))
  }
}

