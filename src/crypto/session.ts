/**
 * Vexta Auth Session & Lifecycle Manager
 * Centralizes in-memory session credentials, KDF master key lifecycle,
 * and unified login/register/logout workflows.
 */

import { deriveMasterKey } from './kdf'
import { registerAccount, validateLogin } from './auth'
import { bridgeClient } from '../network/bridge'

export class AuthSessionManager {
  private activeUser: string | null = null
  private sessionPasscode: string | null = null
  private masterKey: CryptoKey | null = null

  constructor() {
    this.activeUser = localStorage.getItem('vexta_active_user') || null
  }

  getActiveUser(): string | null {
    return this.activeUser || localStorage.getItem('vexta_active_user')
  }

  getSessionPasscode(): string | null {
    return this.sessionPasscode
  }

  getMasterKey(): CryptoKey | null {
    return this.masterKey
  }

  isAuthenticated(): boolean {
    const user = this.getActiveUser()
    return Boolean(user && user.trim().length > 0)
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> {
    const res = await validateLogin(username, password)
    if (!res.success || !res.account) {
      return { success: false, error: res.error || 'Authentication failed' }
    }

    const cleanUser = res.account.username
    this.activeUser = cleanUser
    this.sessionPasscode = password

    // Derive KDF Master Key for current session
    if (res.account.saltHex) {
      this.masterKey = await deriveMasterKey(password, res.account.saltHex)
    }

    localStorage.setItem('vexta_active_user', cleanUser)
    bridgeClient.setSessionPasscode(password)
    bridgeClient.setAuthMode('login')

    return { success: true }
  }

  async register(
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; recoveryCode?: string }> {
    const res = await registerAccount(username, password)
    if (!res.success) {
      return res
    }

    const cleanUser = username.trim()
    this.activeUser = cleanUser
    this.sessionPasscode = password

    localStorage.setItem('vexta_active_user', cleanUser)
    bridgeClient.setSessionPasscode(password)
    bridgeClient.setAuthMode('register')

    return res
  }

  logout(): void {
    this.activeUser = null
    this.sessionPasscode = null
    this.masterKey = null

    // Wipe session passcode from WSS bridge client and disconnect socket cleanly
    bridgeClient.setSessionPasscode(null)
    bridgeClient.disconnect()

    localStorage.removeItem('vexta_active_user')
  }
}

export const AuthSession = new AuthSessionManager()
