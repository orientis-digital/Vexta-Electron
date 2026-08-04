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

export type DbServerTrust = {
  server_host: string
  server_fingerprint: string
  trusted_at: string
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

  // ── Messages API ──────────────────────────────────────
  getMessages(chatId: string): DbMessage[] {
    const data = localStorage.getItem(`${this.storageKey}_messages`)
    const all: DbMessage[] = data ? JSON.parse(data) : []
    return all.filter(
      (m) => m.sender === chatId || m.recipient === chatId || m.recipient === `group_${chatId}`,
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
      (m) => m.sender !== chatId && m.recipient !== chatId && m.recipient !== `group_${chatId}`,
    )
    localStorage.setItem(`${this.storageKey}_messages`, JSON.stringify(filtered))
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
}
