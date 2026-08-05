/**
 * RSA Identity Keys, RSA-PSS Nonce Signatures & Cryptographic Fingerprinting Engine
 */

import { packWireBlob, unpackWireBlob } from './wire'
import { bytesToHex, hexToBytes } from './kdf'

export type IdentityKeys = {
  publicKeyPem: string
  privateKeyPem: string
  fingerprint: string
}

export function generateFingerprintFromKey(publicKeyPem: string): string {
  let hash = 0
  for (let i = 0; i < publicKeyPem.length; i++) {
    hash = (hash << 5) - hash + publicKeyPem.charCodeAt(i)
    hash |= 0
  }
  const blocks: string[] = []
  for (let i = 0; i < 8; i++) {
    const val = Math.abs((hash * (i + 1) * 2654435761) % 65536)
    blocks.push(val.toString(16).padStart(4, '0').toUpperCase())
  }
  return blocks.join(' : ')
}

/**
 * Generates an RSA key pair with RSA-OAEP encryption
 */
export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  )
}

/**
 * Generates an RSA-PSS key pair for identity signatures
 */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
}

/**
 * Gets or creates persistent RSA-PSS signing identity keys for a specific username
 */
export async function getOrCreateUserIdentityKeys(username: string): Promise<CryptoKeyPair> {
  const cleanName = username.toLowerCase()
  const storageKey = `vexta_keypair_${cleanName}`
  const stored = localStorage.getItem(storageKey)

  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      const publicKey = await crypto.subtle.importKey(
        'spki',
        hexToBytes(parsed.pubSpkiHex).buffer as ArrayBuffer,
        { name: 'RSA-PSS', hash: 'SHA-256' },
        true,
        ['verify'],
      )
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        hexToBytes(parsed.privPkcs8Hex).buffer as ArrayBuffer,
        { name: 'RSA-PSS', hash: 'SHA-256' },
        true,
        ['sign'],
      )
      return { publicKey, privateKey }
    } catch (e) {
      console.warn(`[Vexta Keys] Failed loading saved keypair for @${username}, generating new identity:`, e)
    }
  }

  const keyPair = await generateSigningKeyPair()
  const pubSpki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const privPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

  const serializable = {
    pubSpkiHex: bytesToHex(new Uint8Array(pubSpki)),
    privPkcs8Hex: bytesToHex(new Uint8Array(privPkcs8)),
  }
  localStorage.setItem(storageKey, JSON.stringify(serializable))
  return keyPair
}

/**
 * Signs a nonce string using RSA-PSS SHA-256 (matching Python cryptography padding.PSS)
 */
export async function signNonceRSA_PSS(privateKey: CryptoKey, nonceStr: string): Promise<string> {
  const encoder = new TextEncoder()
  const nonceBytes = encoder.encode(nonceStr)

  // saltLength: 222 matches Python cryptography padding.PSS.MAX_LENGTH for 2048-bit RSA keys (256 - 32 - 2 = 222)
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'RSA-PSS',
      saltLength: 222,
    },
    privateKey,
    nonceBytes,
  )

  const bytes = new Uint8Array(signatureBuffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Exports a public CryptoKey into standard SPKI PEM format
 */
export async function exportPublicKeyPem(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key)
  const bytes = new Uint8Array(exported)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  const chunks = base64.match(/.{1,64}/g) || []
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join('\n')}\n-----END PUBLIC KEY-----\n`
}

/**
 * Encodes SPKI PEM public key to Base64 for Substrata bridge relay payload
 */
export async function exportPublicKeyBase64(key: CryptoKey): Promise<string> {
  const pem = await exportPublicKeyPem(key)
  return btoa(pem)
}

export async function encryptHybridMessage(
  recipientPublicKey: CryptoKey,
  plaintextUtf8: string,
): Promise<string> {
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )

  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(plaintextUtf8),
  )

  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)
  const wrappedAesKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientPublicKey,
    rawAesKey,
  )

  return packWireBlob(
    new Uint8Array(wrappedAesKey),
    iv,
    new Uint8Array(ciphertextBuffer),
  )
}

export async function decryptHybridMessage(
  myPrivateKey: CryptoKey,
  base64WireBlob: string,
): Promise<string> {
  const { rsaEncryptedAesKey, nonce, ciphertext } = unpackWireBlob(base64WireBlob)

  const rawAesKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    myPrivateKey,
    rsaEncryptedAesKey.buffer as ArrayBuffer,
  )

  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawAesKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    aesKey,
    ciphertext.buffer as ArrayBuffer,
  )

  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}
