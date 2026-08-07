/**
 * Encodes a string safely into UTF-8 Base64.
 * Prevents DOMException crashes when handling non-ASCII / Unicode characters (emojis, CJK, etc.)
 */
export function utf8ToBase64(str: string): string {
  if (!str) return ''
  try {
    const bytes = new TextEncoder().encode(str)
    let binary = ''
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  } catch (err) {
    console.error('[Vexta Codec] utf8ToBase64 error:', err)
    return ''
  }
}

/**
 * Decodes a Base64 string into a UTF-8 string safely.
 * Prevents character corruption for non-ASCII / Unicode text.
 */
export function base64ToUtf8(b64: string): string {
  if (!b64) return ''
  try {
    const cleanB64 = b64.replace(/[^A-Za-z0-9+/=]/g, '')
    const binary = atob(cleanB64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch (err) {
    console.error('[Vexta Codec] base64ToUtf8 error:', err)
    return b64
  }
}

/**
 * Encodes a JavaScript object into a JSON string payload.
 */
export function encodePayload(obj: any): string {
  return JSON.stringify(obj)
}

/**
 * Robustly decodes WebSocket frames into JavaScript objects via JSON parsing.
 */
export function decodePayload(input: ArrayBuffer | Uint8Array | string | any): any | null {
  if (!input) return null

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed)
      } catch {}
    }
  }

  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer)
    if (bytes.length === 0) return null
    try {
      const text = new TextDecoder().decode(bytes)
      return JSON.parse(text)
    } catch {}
  }

  return null
}
