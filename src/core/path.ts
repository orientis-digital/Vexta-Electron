/**
 * Cross-Platform Path & OS Awareness Utility for Vexta-Electron
 * Ensures path separators and filesystem targets resolve cleanly on Windows, macOS, and Linux.
 */

export interface SystemPlatformInfo {
  osName: string
  osVersion: string
  deviceName: string
  platform: string
  arch: string
  isWindows: boolean
  isMac: boolean
  isLinux: boolean
  sep: string
  userDataPath: string
  downloadsPath: string
  appDataPath: string
}

let cachedSystemInfo: SystemPlatformInfo | null = null

export async function fetchSystemPlatformInfo(): Promise<SystemPlatformInfo> {
  if (cachedSystemInfo) return cachedSystemInfo

  if (typeof window !== 'undefined' && (window as any).vextaNative) {
    try {
      const info = await (window as any).vextaNative.getSystemInfo()
      if (info) {
        cachedSystemInfo = info
        return info
      }
    } catch (e) {
      console.warn('[Vexta Path] Failed fetching IPC system info:', e)
    }
  }

  // Fallback web detection
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isWindows = ua.includes('Windows')
  const isMac = ua.includes('Macintosh') || ua.includes('Mac OS')
  const isLinux = ua.includes('Linux')
  const osName = isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux'

  cachedSystemInfo = {
    osName,
    osVersion: '1.0.0',
    deviceName: `${osName} Client`,
    platform: isWindows ? 'win32' : isMac ? 'darwin' : 'linux',
    arch: 'x64',
    isWindows,
    isMac,
    isLinux,
    sep: isWindows ? '\\' : '/',
    userDataPath: isWindows ? 'C:\\Users\\Public\\VextaData' : '/tmp/vexta_data',
    downloadsPath: isWindows ? 'C:\\Users\\Public\\Downloads' : '/tmp/downloads',
    appDataPath: isWindows ? 'C:\\Users\\Public\\AppData' : '/tmp',
  }

  return cachedSystemInfo
}

export function isWindowsOS(): boolean {
  if (cachedSystemInfo) return cachedSystemInfo.isWindows
  if (typeof navigator !== 'undefined') return navigator.userAgent.includes('Windows')
  return false
}

export function getPlatformSeparator(): string {
  return isWindowsOS() ? '\\' : '/'
}

/**
 * Normalizes any file path string for the current operating system (Windows `\` vs POSIX `/`)
 */
export function normalizeOSPath(filePath: string): string {
  if (!filePath) return ''
  if (isWindowsOS()) {
    return filePath.replace(/\//g, '\\')
  }
  return filePath.replace(/\\/g, '/')
}

/**
 * Joins path segments using operating-system aware path separator
 */
export function joinOSPaths(...segments: string[]): string {
  const sep = getPlatformSeparator()
  return segments
    .filter(Boolean)
    .map((seg, idx) => {
      let clean = normalizeOSPath(seg)
      if (idx > 0 && (clean.startsWith('/') || clean.startsWith('\\'))) {
        clean = clean.slice(1)
      }
      if (idx < segments.length - 1 && (clean.endsWith('/') || clean.endsWith('\\'))) {
        clean = clean.slice(0, -1)
      }
      return clean
    })
    .join(sep)
}
