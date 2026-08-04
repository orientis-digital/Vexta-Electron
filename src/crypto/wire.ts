/**
 * Substrata / Vexta Wire Format Helper
 * Hybrid Message Blob:
 * [4-byte key_len (uint32be)][RSA-OAEP AES key][12-byte nonce][GCM ciphertext + 16-byte tag]
 * Output / Input is Base64 string for WebSocket transmission.
 */

export function packWireBlob(rsaEncryptedAesKey: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): string {
  const keyLen = rsaEncryptedAesKey.length
  const totalLen = 4 + keyLen + nonce.length + ciphertext.length
  const buffer = new Uint8Array(totalLen)
  const view = new DataView(buffer.buffer)

  // 4-byte big-endian key length
  view.setUint32(0, keyLen, false)

  // Copy RSA encrypted AES key
  buffer.set(rsaEncryptedAesKey, 4)

  // Copy 12-byte nonce
  buffer.set(nonce, 4 + keyLen)

  // Copy GCM ciphertext + tag
  buffer.set(ciphertext, 4 + keyLen + nonce.length)

  // Base64 encode
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary)
}

export function unpackWireBlob(base64Blob: string): {
  rsaEncryptedAesKey: Uint8Array
  nonce: Uint8Array
  ciphertext: Uint8Array
} {
  const binary = atob(base64Blob)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i)
  }

  const view = new DataView(buffer.buffer)
  const keyLen = view.getUint32(0, false)

  const rsaEncryptedAesKey = buffer.slice(4, 4 + keyLen)
  const nonce = buffer.slice(4 + keyLen, 4 + keyLen + 12)
  const ciphertext = buffer.slice(4 + keyLen + 12)

  return { rsaEncryptedAesKey, nonce, ciphertext }
}
