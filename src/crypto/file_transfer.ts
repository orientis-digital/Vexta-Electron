/**
 * Vexta Encrypted File Transfer Cryptographic Helper
 * Handles AES-256-GCM chunked file encryption/decryption and integrity checks.
 */

export function generateFileKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer
}

export async function computeSHA256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', toArrayBuffer(data))
  const bytes = new Uint8Array(hashBuffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function encryptFileChunk(
  keyHex: string,
  chunkData: Uint8Array,
): Promise<string> {
  const keyBytes = hexToBytes(keyHex)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )

  const nonce = new Uint8Array(12)
  crypto.getRandomValues(nonce)

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    toArrayBuffer(chunkData),
  )

  const ciphertextBytes = new Uint8Array(encryptedBuffer)
  const combined = new Uint8Array(nonce.length + ciphertextBytes.length)
  combined.set(nonce, 0)
  combined.set(ciphertextBytes, nonce.length)

  let binary = ''
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i])
  }
  return btoa(binary)
}

export async function decryptFileChunk(
  keyHex: string,
  encryptedB64: string,
): Promise<Uint8Array> {
  const binary = atob(encryptedB64)
  const combined = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    combined[i] = binary.charCodeAt(i)
  }

  const nonce = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const keyBytes = hexToBytes(keyHex)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    toArrayBuffer(ciphertext),
  )

  return new Uint8Array(decryptedBuffer)
}

export async function sliceFile(
  file: File | Blob,
  chunkSize = 128 * 1024,
): Promise<{ chunks: Uint8Array[]; fileHash: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const fullBytes = new Uint8Array(arrayBuffer)
  const fileHash = await computeSHA256(fullBytes)

  const chunks: Uint8Array[] = []
  let offset = 0
  while (offset < fullBytes.length) {
    const end = Math.min(offset + chunkSize, fullBytes.length)
    chunks.push(fullBytes.slice(offset, end))
    offset = end
  }

  return { chunks, fileHash }
}

export async function verifyFileIntegrity(
  chunks: Uint8Array[],
  expectedHash: string,
): Promise<{ valid: boolean; actualHash: string }> {
  let totalLen = 0
  for (const chunk of chunks) {
    totalLen += chunk.length
  }
  const combined = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  const actualHash = await computeSHA256(combined)
  return { valid: actualHash.toLowerCase() === expectedHash.toLowerCase(), actualHash }
}

export function sanitizeFilename(filename: string): string {
  // Strip any OS path delimiters or dangerous characters
  const basename = filename.replace(/^.*[\\/]/, '')
  return basename.replace(/[^\w.-\s]/g, '_')
}

export async function stripImageMetadata(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          resolve(blob || file)
        },
        file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        0.95,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}

export async function stripFileMetadata(
  file: File,
  stripExif = true,
): Promise<{ cleanBlob: Blob | File; cleanFilename: string }> {
  const cleanFilename = sanitizeFilename(file.name)
  if (stripExif && file.type.startsWith('image/')) {
    const cleanBlob = await stripImageMetadata(file)
    return { cleanBlob, cleanFilename }
  }
  return { cleanBlob: file, cleanFilename }
}

export function reassembleChunks(
  chunks: Uint8Array[],
  _filename: string,
  mimeType = 'application/octet-stream',
): { blob: Blob; url: string } {
  const blobParts: BlobPart[] = chunks.map((c) => toArrayBuffer(c))
  const blob = new Blob(blobParts, { type: mimeType })
  const url = URL.createObjectURL(blob)
  return { blob, url }
}

/**
 * Cache received media to a hidden OS-appropriate location with an obfuscated
 * UID+Date filename. Uses Electron IPC when available, falls back to in-memory
 * blob URL for browser dev mode.
 */
export async function cacheReceivedMedia(
  blob: Blob,
  originalName: string,
): Promise<{ cachedUrl: string; cachedFilename: string; cachedPath?: string }> {
  const native = (window as any).vextaNative
  if (native?.saveCacheMedia) {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const result = await native.saveCacheMedia({ arrayBuffer, originalName })
      if (result.success) {
        return {
          cachedUrl: `file://${result.filePath}`,
          cachedFilename: result.cachedFilename,
          cachedPath: result.filePath,
        }
      }
    } catch (err) {
      console.warn('[Vexta Media Cache] Electron IPC cache failed, falling back to blob URL:', err)
    }
  }

  // Browser fallback: store as DataURL if under 5MB for reload persistence
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '.bin'
  const uid = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6)
  const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  const cachedFilename = `vx_${uid}_${dateStr}${ext}`

  if (blob.size < 5 * 1024 * 1024) {
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      return { cachedUrl: dataUrl, cachedFilename }
    } catch {
      // Fallback to object URL if DataURL conversion fails
    }
  } else {
    try {
      await indexedDbCache.saveMediaBlob(cachedFilename, blob)
    } catch (e) {
      console.warn('[Vexta Media Cache] IndexedDB Blob save failed:', e)
    }
  }

  const cachedUrl = URL.createObjectURL(blob)
  return { cachedUrl, cachedFilename }
}

/**
 * Save a cached media file to the user's Downloads/Vexta directory.
 * Uses Electron IPC when available, falls back to a browser download anchor.
 */
export async function saveMediaToDownloads(
  urlOrBlob: Blob | string,
  filename: string,
): Promise<{ success: boolean; filePath?: string }> {
  try {
    const native = (window as any).vextaNative

    // If a file:// URL or string path is passed, pass filePath directly to Electron IPC
    if (typeof urlOrBlob === 'string' && (urlOrBlob.startsWith('file://') || urlOrBlob.startsWith('/'))) {
      if (native?.saveToDownloads) {
        const result = await native.saveToDownloads({ filePath: urlOrBlob, filename })
        if (result.success) return { success: true, filePath: result.filePath }
      }
    }

    let blob: Blob
    if (typeof urlOrBlob === 'string') {
      const res = await fetch(urlOrBlob)
      blob = await res.blob()
    } else {
      blob = urlOrBlob
    }

    if (native?.saveToDownloads) {
      try {
        const arrayBuffer = await blob.arrayBuffer()
        const result = await native.saveToDownloads({ arrayBuffer, filename })
        return { success: result.success, filePath: result.filePath }
      } catch (err) {
        console.warn('[Vexta Save] Electron IPC save failed, falling back to browser download:', err)
      }
    }

    // Browser fallback: trigger anchor download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return { success: true }
  } catch (err) {
    console.error('[Vexta Save] Save to downloads failed:', err)
    return { success: false }
  }
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

class IndexedDBCache {
  private dbPromise: Promise<IDBDatabase> | null = null

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not supported'))
        return
      }
      const req = indexedDB.open('VextaMediaCacheDB', 2)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('chunks')) {
          db.createObjectStore('chunks')
        }
        if (!db.objectStoreNames.contains('media_blobs')) {
          db.createObjectStore('media_blobs')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return this.dbPromise
  }

  async saveChunk(transferId: string, chunkIndex: number, data: string): Promise<number> {
    try {
      const db = await this.getDB()
      // Use a single transaction for both the put AND the count so the
      // transaction does not auto-commit between the two async operations.
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction('chunks', 'readwrite')
        const store = tx.objectStore('chunks')
        let savedCount = 0

        const putReq = store.put(data, `${transferId}_${chunkIndex}`)
        putReq.onerror = () => reject(putReq.error)

        putReq.onsuccess = () => {
          // Still inside the same active transaction – safe to issue another request
          const countReq = store.getAllKeys()
          countReq.onsuccess = () => {
            const keys = countReq.result as string[]
            savedCount = keys.filter((k) => k.startsWith(`${transferId}_`)).length
          }
          countReq.onerror = () => { savedCount = 0 }
        }

        tx.oncomplete = () => resolve(savedCount)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(new Error('Transaction aborted'))
      })
    } catch (err) {
      console.warn('[IndexedDB] Save chunk error:', err)
      return 0
    }
  }

  async getChunks(transferId: string, totalChunks: number): Promise<(string | undefined)[]> {
    try {
      const db = await this.getDB()
      const tx = db.transaction('chunks', 'readonly')
      const store = tx.objectStore('chunks')
      const result: (string | undefined)[] = []
      for (let i = 0; i < totalChunks; i++) {
        const val = await new Promise<string | undefined>((res) => {
          const req = store.get(`${transferId}_${i}`)
          req.onsuccess = () => res(req.result)
          req.onerror = () => res(undefined)
        })
        result[i] = val
      }
      return result
    } catch {
      return []
    }
  }

  async clearChunks(transferId: string, totalChunks: number): Promise<void> {
    try {
      const db = await this.getDB()
      const tx = db.transaction('chunks', 'readwrite')
      const store = tx.objectStore('chunks')
      for (let i = 0; i < totalChunks; i++) {
        store.delete(`${transferId}_${i}`)
      }
    } catch {}
  }

  async saveMediaBlob(filename: string, blob: Blob): Promise<void> {
    try {
      const db = await this.getDB()
      const tx = db.transaction('media_blobs', 'readwrite')
      const store = tx.objectStore('media_blobs')
      store.put(blob, filename)
    } catch (err) {
      console.warn('[IndexedDB] Save media blob error:', err)
    }
  }

  async getMediaBlob(filename: string): Promise<Blob | undefined> {
    try {
      const db = await this.getDB()
      const tx = db.transaction('media_blobs', 'readonly')
      const store = tx.objectStore('media_blobs')
      return new Promise<Blob | undefined>((resolve) => {
        const req = store.get(filename)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
      })
    } catch {
      return undefined
    }
  }
}

export const indexedDbCache = new IndexedDBCache()

