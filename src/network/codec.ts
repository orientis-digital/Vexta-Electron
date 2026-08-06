import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack'

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
 * Encodes a JavaScript object or binary payload into a MessagePack Uint8Array.
 */
export function encodePayload(obj: any): Uint8Array {
  return msgpackEncode(obj)
}

/**
 * Robustly decodes WebSocket frames.
 * Supports MessagePack binary frames, ArrayBuffers, Blobs, clean Base64, and legacy JSON text frames.
 */
export function decodePayload(input: ArrayBuffer | Uint8Array | string | any): any | null {
  if (!input) return null

  // 1. ArrayBuffer or Uint8Array binary frame
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer)
    if (bytes.length === 0) return null

    // Check if it's legacy JSON starting with '{' (0x7B) or '[' (0x5B)
    if (bytes[0] === 0x7B || bytes[0] === 0x5B) {
      try {
        const text = new TextDecoder().decode(bytes)
        return JSON.parse(text)
      } catch {}
    }

    // Try MessagePack decode
    try {
      return msgpackDecode(bytes)
    } catch {
      // Fallback: try decoding as UTF-8 string
      try {
        const text = new TextDecoder().decode(bytes)
        return decodePayload(text)
      } catch {}
    }
  }

  // 2. String frame (legacy WebSocket text frame or Base64 encoded payload)
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null

    // Direct JSON parse
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === 'object') return parsed
      } catch {}
    }

    // Try Base64 -> UTF-8 -> JSON decode
    try {
      const decodedUtf8 = base64ToUtf8(trimmed)
      if (decodedUtf8.startsWith('{') || decodedUtf8.startsWith('[')) {
        const parsed = JSON.parse(decodedUtf8)
        if (parsed && typeof parsed === 'object') return parsed
      }
    } catch {}

    // Base64 candidate search (e.g. eyJ...)
    const eyjIdx = trimmed.indexOf('eyJ')
    if (eyjIdx !== -1) {
      try {
        const cleanB64 = trimmed.slice(eyjIdx).replace(/[^A-Za-z0-9+/=]/g, '')
        const decodedUtf8 = base64ToUtf8(cleanB64)
        const parsed = JSON.parse(decodedUtf8)
        if (parsed && typeof parsed === 'object') return parsed
      } catch {}
    }
  }

  return null
}
