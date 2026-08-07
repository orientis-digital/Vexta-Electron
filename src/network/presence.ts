/**
 * Vexta Real-Time Presence & Last Active Engine
 * Formats relative "Active N mins ago" timestamps and manages
 * 5-minute Messenger-style heartbeat presence broadcasting over Vexta WSS.
 */

import { bridgeClient } from './bridge'

export function formatLastActive(lastActiveIso: string | null | undefined): string {
  if (!lastActiveIso) return 'Offline'

  try {
    const lastDate = new Date(lastActiveIso)
    if (isNaN(lastDate.getTime())) return 'Offline'

    const now = Date.now()
    const diffMs = Math.max(0, now - lastDate.getTime())
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 5) {
      return '● Active now'
    }
    if (diffMins < 60) {
      return `Active ${diffMins}m ago`
    }
    if (diffHours < 24) {
      return `Active ${diffHours}h ago`
    }
    if (diffDays === 1) {
      return 'Active yesterday'
    }
    return `Active ${diffDays}d ago`
  } catch {
    return 'Offline'
  }
}

class PresenceEngine {
  private timer: any = null
  private running = false

  startHeartbeat() {
    if (this.running) return
    this.running = true

    // Send initial presence heartbeat
    this.broadcastPresence()

    // Send 5-minute presence heartbeat (300,000ms - Messenger standard)
    this.timer = setInterval(() => {
      this.broadcastPresence()
    }, 5 * 60 * 1000)
  }

  stopHeartbeat() {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  broadcastPresence() {
    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) return

    // Check Global Privacy Setting
    const globalPrivacy = localStorage.getItem(`vexta_${activeUser}_presence_global`) || 'everyone'
    if (globalPrivacy === 'nobody') return

    bridgeClient.sendPresence('online')
  }
}

export const presenceEngine = new PresenceEngine()
