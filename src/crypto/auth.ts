/**
 * Vexta Vault Account Authentication & Local Profile Store
 */

import { generateSaltHex, deriveMasterKey, bytesToHex } from './kdf'

export type AccountProfile = {
  username: string
  saltHex: string
  passwordHashHex: string
  createdAt: string
  recoveryCode: string
}

const STORAGE_ACCOUNTS_KEY = 'vexta_registered_accounts'

export function clearRegisteredAccounts() {
  localStorage.removeItem(STORAGE_ACCOUNTS_KEY)
  localStorage.removeItem('vexta_active_user')
}

export function getRegisteredAccounts(): AccountProfile[] {
  const stored = localStorage.getItem(STORAGE_ACCOUNTS_KEY)
  if (!stored) {
    return []
  }
  try {
    const parsed: AccountProfile[] = JSON.parse(stored)
    return parsed.filter((a) => Boolean(a && a.username && a.username.trim()))
  } catch {
    return []
  }
}

export async function hashPasswordWithSalt(password: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${password}:${saltHex}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(hashBuffer))
}

export async function registerAccount(
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string; recoveryCode?: string }> {
  try {
    const cleanName = username.trim()
    if (!cleanName) return { success: false, error: 'Username cannot be empty' }
    if (cleanName.length < 3) return { success: false, error: 'Username must be at least 3 characters' }

    const accounts = getRegisteredAccounts()
    const existing = accounts.find((a) => a.username.toLowerCase() === cleanName.toLowerCase())
    if (existing) {
      return { success: false, error: `Account @${cleanName} already exists on this device` }
    }

    const saltHex = generateSaltHex(16)
    const passwordHashHex = await hashPasswordWithSalt(password, saltHex)
    const recoveryCode = generateSaltHex(16)

    const newAccount: AccountProfile = {
      username: cleanName,
      saltHex,
      passwordHashHex,
      createdAt: new Date().toISOString(),
      recoveryCode,
    }

    accounts.push(newAccount)
    localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(accounts))
    localStorage.setItem('vexta_active_user', cleanName)

    // Initialize KDF Master Key derivation for profile
    await deriveMasterKey(password, saltHex)

    return { success: true, recoveryCode }
  } catch (err: any) {
    console.error('[Vexta Auth] Registration Exception:', err)
    return { success: false, error: err?.message || 'Failed to initialize account vault' }
  }
}

export async function validateLogin(
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string; account?: AccountProfile }> {
  const cleanName = username.trim()
  if (!cleanName) return { success: false, error: 'Username is required' }
  if (!password) return { success: false, error: 'Master Password is required' }

  const accounts = getRegisteredAccounts()
  const account = accounts.find((a) => a.username.toLowerCase() === cleanName.toLowerCase())

  if (!account) {
    return {
      success: false,
      error: `Account '@${cleanName}' not found. Please Sign Up to create a new vault.`,
    }
  }

  const inputHash = await hashPasswordWithSalt(password, account.saltHex)
  if (account.passwordHashHex && inputHash !== account.passwordHashHex) {
    return {
      success: false,
      error: `Incorrect Master Password for @${account.username}.`,
    }
  }

  // Derive master key for vault session
  await deriveMasterKey(password, account.saltHex)

  return { success: true, account }
}

export async function recoverAccount(
  username: string,
  recoveryCode: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const accounts = getRegisteredAccounts()
  const cleanName = username.trim()
  const account = accounts.find((a) => a.username.toLowerCase() === cleanName.toLowerCase())

  if (!account) {
    return { success: false, error: `Account '@${cleanName}' not found` }
  }

  if (account.recoveryCode.toLowerCase() !== recoveryCode.trim().toLowerCase()) {
    return { success: false, error: 'Invalid 32-character recovery code' }
  }

  // Set new password
  account.passwordHashHex = await hashPasswordWithSalt(newPassword, account.saltHex)
  localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(accounts))
  return { success: true }
}
