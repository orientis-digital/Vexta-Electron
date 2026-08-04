/**
 * Encrypted Vault Backup (.vxvault) & Duress Utilities
 * Provides AES-GCM-256 PBKDF2 file encryption/decryption for local databases
 * and SHA-256 hashing for duress passcodes.
 */

const MAGIC_HEADER = new Uint8Array([0x56, 0x58, 0x56, 0x54]) // 'VXVT'

async function deriveBackupKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function exportVault(password: string, activeUser: string): Promise<Blob> {
  const dumpData: Record<string, string> = {}

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      const val = localStorage.getItem(key)
      if (val !== null) {
        dumpData[key] = val
      }
    }
  }

  const payloadJson = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    user: activeUser,
    data: dumpData,
  })

  const encoder = new TextEncoder()
  const plaintext = encoder.encode(payloadJson)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const key = await deriveBackupKey(password, salt)
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )

  const ciphertext = new Uint8Array(ciphertextBuffer)

  // Combine: MAGIC (4 bytes) + salt (16 bytes) + iv (12 bytes) + ciphertext
  const finalBuffer = new Uint8Array(
    MAGIC_HEADER.length + salt.length + iv.length + ciphertext.length,
  )
  finalBuffer.set(MAGIC_HEADER, 0)
  finalBuffer.set(salt, MAGIC_HEADER.length)
  finalBuffer.set(iv, MAGIC_HEADER.length + salt.length)
  finalBuffer.set(ciphertext, MAGIC_HEADER.length + salt.length + iv.length)

  return new Blob([finalBuffer.buffer], { type: 'application/vxvault' })
}

export async function importVault(
  arrayBuffer: ArrayBuffer,
  password: string,
): Promise<{ success: boolean; restoredCount?: number; error?: string }> {
  try {
    const dataView = new Uint8Array(arrayBuffer)

    if (dataView.length < MAGIC_HEADER.length + 16 + 12 + 1) {
      return { success: false, error: 'Invalid or corrupt .vxvault file' }
    }

    // Check magic header
    for (let i = 0; i < MAGIC_HEADER.length; i++) {
      if (dataView[i] !== MAGIC_HEADER[i]) {
        return { success: false, error: 'File is not a valid Vexta Vault archive (.vxvault)' }
      }
    }

    let offset = MAGIC_HEADER.length
    const salt = dataView.slice(offset, offset + 16)
    offset += 16
    const iv = dataView.slice(offset, offset + 12)
    offset += 12
    const ciphertext = dataView.slice(offset)

    const key = await deriveBackupKey(password, salt)
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )

    const decoder = new TextDecoder()
    const jsonStr = decoder.decode(decryptedBuffer)
    const parsed = JSON.parse(jsonStr)

    if (!parsed.data || typeof parsed.data !== 'object') {
      return { success: false, error: 'Archive contains invalid database structures' }
    }

    let restoredCount = 0
    for (const [k, v] of Object.entries(parsed.data)) {
      if (typeof v === 'string') {
        localStorage.setItem(k, v)
        restoredCount++
      }
    }

    return { success: true, restoredCount }
  } catch (err) {
    console.error('[Vault Import Error]', err)
    return {
      success: false,
      error: 'Decryption failed. Please check that the backup password is correct.',
    }
  }
}

export async function hashPasscode(passcode: string): Promise<string> {
  const enc = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(passcode))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
