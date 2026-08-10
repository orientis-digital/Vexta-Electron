/**
 * Vexta Keyboard Shortcuts Subsystem
 * Manages customizable in-app shortcuts, hotkey recording, active toggles,
 * and keyboard event dispatchers.
 */

export interface ShortcutItem {
  id: string
  label: string
  description: string
  category: 'navigation' | 'security' | 'calling'
  defaultKey: string
  key: string
  enabled: boolean
}

export const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'quickSwitcher',
    label: 'Quick Contact Switcher',
    description: 'Open quick contact search and navigation popup',
    category: 'navigation',
    defaultKey: 'Ctrl+K',
    key: 'Ctrl+K',
    enabled: true,
  },
  {
    id: 'searchMessages',
    label: 'Search Chat Messages',
    description: 'Focus message search bar in current active chat',
    category: 'navigation',
    defaultKey: 'Ctrl+F',
    key: 'Ctrl+F',
    enabled: true,
  },
  {
    id: 'lockVault',
    label: 'Instant Vault Lock',
    description: 'Immediately lock active encryption vault and clear session',
    category: 'security',
    defaultKey: 'Ctrl+Shift+L',
    key: 'Ctrl+Shift+L',
    enabled: true,
  },
  {
    id: 'toggleMuteMic',
    label: 'Toggle Microphone Mute',
    description: 'Mute or unmute microphone during active WebRTC call',
    category: 'calling',
    defaultKey: 'Ctrl+Shift+M',
    key: 'Ctrl+Shift+M',
    enabled: true,
  },
  {
    id: 'toggleCamera',
    label: 'Toggle Camera Stream',
    description: 'Turn local camera on or off during active video call',
    category: 'calling',
    defaultKey: 'Ctrl+Shift+V',
    key: 'Ctrl+Shift+V',
    enabled: true,
  },
  {
    id: 'closeModal',
    label: 'Close Active Modal / Overlay',
    description: 'Dismiss open modals, call popups, and media lightboxes',
    category: 'navigation',
    defaultKey: 'Escape',
    key: 'Escape',
    enabled: true,
  },
]

export function loadShortcuts(): ShortcutItem[] {
  if (typeof localStorage === 'undefined') return DEFAULT_SHORTCUTS

  const stored = localStorage.getItem('vx_setting_shortcuts')
  if (!stored) return DEFAULT_SHORTCUTS

  try {
    const parsed = JSON.parse(stored) as ShortcutItem[]
    return DEFAULT_SHORTCUTS.map((def) => {
      const match = parsed.find((p) => p.id === def.id)
      return match ? { ...def, key: match.key || def.defaultKey, enabled: match.enabled ?? def.enabled } : def
    })
  } catch {
    return DEFAULT_SHORTCUTS
  }
}

export function saveShortcuts(shortcuts: ShortcutItem[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('vx_setting_shortcuts', JSON.stringify(shortcuts))
}

export function resetShortcuts(): ShortcutItem[] {
  saveShortcuts(DEFAULT_SHORTCUTS)
  return DEFAULT_SHORTCUTS
}

/**
 * Checks if a KeyboardEvent matches a shortcut key combination string.
 * Example key strings: 'Ctrl+K', 'Ctrl+Shift+L', 'Escape', 'Alt+S'
 */
export function matchesShortcut(event: KeyboardEvent, shortcutKey: string): boolean {
  if (!shortcutKey) return false

  const parts = shortcutKey.split('+').map((p) => p.trim().toLowerCase())
  const keyPart = parts[parts.length - 1]

  const hasCtrl = parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta')
  const hasShift = parts.includes('shift')
  const hasAlt = parts.includes('alt')

  const isCtrlPressed = event.ctrlKey || event.metaKey
  const isShiftPressed = event.shiftKey
  const isAltPressed = event.altKey

  if (hasCtrl !== isCtrlPressed) return false
  if (hasShift !== isShiftPressed) return false
  if (hasAlt !== isAltPressed) return false

  if (keyPart === 'escape' && event.key === 'Escape') return true
  if (keyPart.length === 1 && event.key.toLowerCase() === keyPart) return true

  return false
}

/**
 * Formats a KeyboardEvent into a standard hotkey string (e.g. 'Ctrl+Shift+K').
 */
export function formatHotkeyEvent(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return null
  }

  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')

  const keyName = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(keyName)

  return parts.join('+')
}
