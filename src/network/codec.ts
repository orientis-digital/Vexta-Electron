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
 * Returns true if the given string is plausibly valid standard base64
 * (only base64 chars, properly padded length).
 */
function isValidBase64(s: string): boolean {
  if (!s || s.length < 4) return false
  // Must only contain base64 characters
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return false
  // Length must be a multiple of 4 (base64 padding rule)
  return s.length % 4 === 0
}

/**
 * Decodes a Base64 string into a UTF-8 string safely.
 * Prevents character corruption for non-ASCII / Unicode text.
 * Returns the original string unchanged if it is not valid base64.
 */
export function base64ToUtf8(b64: string): string {
  if (!b64) return ''
  try {
    const cleanB64 = b64.replace(/[^A-Za-z0-9+/=]/g, '')
    // Pad to a multiple of 4 if needed before calling atob
    const padded = cleanB64.padEnd(Math.ceil(cleanB64.length / 4) * 4, '=')
    if (!padded) return b64
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch (err) {
    // Not valid base64 — silently return the original string
    console.debug('[Vexta Codec] base64ToUtf8: not valid base64, returning as-is', (err as Error)?.message)
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

/**
 * Detects whether a string contains garbled binary bytes, unprintable control characters,
 * or replacement characters (\uFFFD) resulting from raw encrypted byte decodes.
 */
export function isBinaryGarbage(str: string): boolean {
  if (!str) return false
  if (str.includes('\uFFFD')) return true
  let unprintable = 0
  for (let i = 0; i < Math.min(str.length, 100); i++) {
    const code = str.charCodeAt(i)
    if ((code < 32 && code !== 10 && code !== 13 && code !== 9) || (code >= 127 && code < 160)) {
      unprintable++
    }
  }
  return unprintable > 3
}

/**
 * Detects whether a raw input or decoded string is an internal signaling / control frame
 * (presence, file transfer chunk, call signaling, metadata sync) or garbled binary noise
 * that should never be saved or displayed in chat messages.
 */
export function isControlMessage(input: string): boolean {
  if (!input) return false
  if (isBinaryGarbage(input)) return true

  // Fast path: base64 prefix signatures for JSON control packets starting with {"type":
  if (
    input.includes('eyJ0eXBlIjoicHJlc2VuY2') || // presence
    input.includes('eyJ0eXBlIjoiZmlsZV') ||     // file_chunk / file_init / file_status
    input.includes('eyJ0eXBlIjoiY2Fsb') ||      // call_offer / call_answer / call_ice / call_end
    input.includes('eyJ0eXBlIjoibWV0YW')        // metadata_sync
  ) {
    return true
  }

  // Fast path: plain JSON string check (avoids any decode attempt)
  const lower = input.toLowerCase()
  if (
    lower.includes('"type":"presence"') ||
    lower.includes('"type":"file_chunk"') ||
    lower.includes('"type":"file_init"') ||
    lower.includes('"type":"file_status_query"') ||
    lower.includes('"type":"file_status_response"') ||
    lower.includes('"type":"call_offer"') ||
    lower.includes('"type":"call_answer"') ||
    lower.includes('"type":"call_ice"') ||
    lower.includes('"type":"metadata_sync"')
  ) {
    return true
  }

  // Slow path: try base64 decode only if the input actually looks like valid base64
  if (isValidBase64(input.trim())) {
    const decoded = base64ToUtf8(input)
    if (decoded !== input) {
      if (isBinaryGarbage(decoded)) return true
      const dc = decoded.toLowerCase()
      return (
        dc.includes('"type":"presence"') ||
        dc.includes('"type":"file_chunk"') ||
        dc.includes('"type":"file_init"') ||
        dc.includes('"type":"file_status_query"') ||
        dc.includes('"type":"file_status_response"') ||
        dc.includes('"type":"call_offer"') ||
        dc.includes('"type":"call_answer"') ||
        dc.includes('"type":"call_ice"') ||
        dc.includes('"type":"metadata_sync"')
      )
    }
  }

  return false
}
