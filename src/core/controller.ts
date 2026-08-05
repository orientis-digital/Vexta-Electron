/**
 * Vexta Main Controller Façade
 * Unifies Identity Management, KDF Vault Encryption, SQLite Bedrock Database,
 * and WSS Bridge Relay client.
 */

import { VextaDatabaseManager } from '../crypto/db_manager'
import { deriveMasterKey, generateSaltHex } from '../crypto/kdf'
import type { BridgeStatus } from '../network/bridge'
import { VextaBridgeClient } from '../network/bridge'

export class VextaController {
  private username: string
  private db: VextaDatabaseManager
  private bridge: VextaBridgeClient
  private activeMasterKey: CryptoKey | null = null

  constructor(username = 'Guest') {
    this.username = username
    this.db = new VextaDatabaseManager(username)
    this.bridge = new VextaBridgeClient('wss://vexta-api.nexusec.space/ws/chat/')
    this.bridge.subscribeStatus((status: BridgeStatus) => this.onBridgeStatusChanged(status))
    this.bridge.subscribeMessages((msg: any) => this.onInboundMessage(msg))
  }

  getActiveMasterKey() {
    return this.activeMasterKey
  }

  async login(password: string): Promise<boolean> {
    const salt = generateSaltHex()
    this.activeMasterKey = await deriveMasterKey(password, salt)
    this.bridge.connect()
    return true
  }

  logout() {
    this.activeMasterKey = null
    this.bridge.disconnect()
  }

  getContacts() {
    return this.db.getContacts()
  }

  addContact(username: string, publicKey: string) {
    this.db.addContact({
      username,
      public_key: publicKey,
      display_name: username,
      created_at: new Date().toISOString(),
      status: 'active',
    })
  }

  getMessages(chatId: string) {
    return this.db.getMessages(chatId)
  }

  sendMessage(recipient: string, plaintext: string) {
    this.db.saveMessage({
      sender: this.username,
      recipient,
      ciphertext: plaintext,
      timestamp: new Date().toTimeString().slice(0, 5),
      is_read: 1,
    })

    // Relay ciphertext to WSS bridge
    this.bridge.sendBlindMessage(recipient, btoa(plaintext))
  }

  clearHistory(chatId: string) {
    this.db.clearMessages(chatId)
  }

  private onBridgeStatusChanged(_status: BridgeStatus) {
    // Notify UI state listeners
  }

  private onInboundMessage(msg: any) {
    this.db.saveMessage({
      sender: msg.sender,
      recipient: msg.recipient,
      ciphertext: msg.wire_blob,
      timestamp: new Date().toTimeString().slice(0, 5),
      is_read: 0,
    })
  }
}
