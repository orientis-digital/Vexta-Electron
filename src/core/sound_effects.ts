/**
 * Vexta Core Web Audio API Sound Subsystem
 * Synthesizes zero-latency, high-fidelity audio feedback for user actions,
 * network events, error alerts, and call state transitions.
 */

export interface SoundSettings {
  incomingMessage: boolean
  sentMessage: boolean
  errorAlert: boolean
  callTones: boolean
  vaultClicks: boolean
  masterVolume: number // 0 to 100
}

export function loadSoundSettings(): SoundSettings {
  if (typeof localStorage === 'undefined') {
    return {
      incomingMessage: true,
      sentMessage: true,
      errorAlert: true,
      callTones: true,
      vaultClicks: true,
      masterVolume: 80,
    }
  }

  return {
    incomingMessage: localStorage.getItem('vx_setting_notification_sounds') !== 'false',
    sentMessage: localStorage.getItem('vx_setting_sent_sounds') !== 'false',
    errorAlert: localStorage.getItem('vx_setting_error_sounds') !== 'false',
    callTones: localStorage.getItem('vx_setting_call_sounds') !== 'false',
    vaultClicks: localStorage.getItem('vx_setting_vault_sounds') !== 'false',
    masterVolume: parseInt(localStorage.getItem('vx_setting_sound_volume') || '80', 10),
  }
}

export function saveSoundSettings(settings: Partial<SoundSettings>) {
  if (typeof localStorage === 'undefined') return

  if (settings.incomingMessage !== undefined) {
    localStorage.setItem('vx_setting_notification_sounds', String(settings.incomingMessage))
  }
  if (settings.sentMessage !== undefined) {
    localStorage.setItem('vx_setting_sent_sounds', String(settings.sentMessage))
  }
  if (settings.errorAlert !== undefined) {
    localStorage.setItem('vx_setting_error_sounds', String(settings.errorAlert))
  }
  if (settings.callTones !== undefined) {
    localStorage.setItem('vx_setting_call_sounds', String(settings.callTones))
  }
  if (settings.vaultClicks !== undefined) {
    localStorage.setItem('vx_setting_vault_sounds', String(settings.vaultClicks))
  }
  if (settings.masterVolume !== undefined) {
    localStorage.setItem('vx_setting_sound_volume', String(settings.masterVolume))
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextClass) return null
  try {
    return new AudioContextClass()
  } catch {
    return null
  }
}

function getGainMultiplier(): number {
  const settings = loadSoundSettings()
  return (settings.masterVolume / 100) * 0.15
}

/**
 * Plays a double sine chime when an incoming message is received.
 */
export function playIncomingMessageSound() {
  const settings = loadSoundSettings()
  if (!settings.incomingMessage || settings.masterVolume <= 0) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const vol = getGainMultiplier()
    const now = ctx.currentTime

    // First chime (C5 = 523.25 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(523.25, now)
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(vol, now + 0.01)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14)
    osc1.start(now)
    osc1.stop(now + 0.15)

    // Second chime (G5 = 783.99 Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(783.99, now + 0.08)
    gain2.gain.setValueAtTime(0, now + 0.08)
    gain2.gain.linearRampToValueAtTime(vol, now + 0.09)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
    osc2.start(now + 0.08)
    osc2.stop(now + 0.3)
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play incoming sound:', err)
  }
}

/**
 * Plays a soft high-frequency pop sound when an outgoing message is sent.
 */
export function playSentMessageSound() {
  const settings = loadSoundSettings()
  if (!settings.sentMessage || settings.masterVolume <= 0) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const vol = getGainMultiplier() * 0.8
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(vol, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)

    osc.start(now)
    osc.stop(now + 0.06)
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play sent sound:', err)
  }
}

/**
 * Plays a low-pitch warning double blip when an error alert occurs.
 */
export function playErrorSound() {
  const settings = loadSoundSettings()
  if (!settings.errorAlert || settings.masterVolume <= 0) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const vol = getGainMultiplier() * 1.1
    const now = ctx.currentTime

    // Blip 1
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.type = 'sawtooth'
    osc1.frequency.setValueAtTime(220, now)
    osc1.frequency.linearRampToValueAtTime(140, now + 0.08)
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(vol, now + 0.01)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
    osc1.start(now)
    osc1.stop(now + 0.1)

    // Blip 2
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sawtooth'
    osc2.frequency.setValueAtTime(180, now + 0.09)
    osc2.frequency.linearRampToValueAtTime(110, now + 0.18)
    gain2.gain.setValueAtTime(0, now + 0.09)
    gain2.gain.linearRampToValueAtTime(vol, now + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    osc2.start(now + 0.09)
    osc2.stop(now + 0.22)
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play error sound:', err)
  }
}

/**
 * Plays an ascending major chord when a WebRTC call connects.
 */
export function playCallConnectedSound() {
  const settings = loadSoundSettings()
  if (!settings.callTones || settings.masterVolume <= 0) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const vol = getGainMultiplier()
    const now = ctx.currentTime

    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.07
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18)

      osc.start(startTime)
      osc.stop(startTime + 0.2)
    })
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play call connect sound:', err)
  }
}

/**
 * Plays a descending chime when a WebRTC call ends.
 */
export function playCallDisconnectedSound() {
  const settings = loadSoundSettings()
  if (!settings.callTones || settings.masterVolume <= 0) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const vol = getGainMultiplier()
    const now = ctx.currentTime

    const notes = [783.99, 659.25, 523.25] // G5, E5, C5
    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.07
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18)

      osc.start(startTime)
      osc.stop(startTime + 0.2)
    })
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play call disconnect sound:', err)
  }
}

/**
 * Plays a click + ping sound when the vault is unlocked.
 */
export function playVaultUnlockSound() {
  const settings = loadSoundSettings()
  if (!settings.vaultClicks || settings.masterVolume <= 0) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const vol = getGainMultiplier()
    const now = ctx.currentTime

    // Click pulse
    const oscClick = ctx.createOscillator()
    const gainClick = ctx.createGain()
    oscClick.connect(gainClick)
    gainClick.connect(ctx.destination)
    oscClick.type = 'triangle'
    oscClick.frequency.setValueAtTime(300, now)
    gainClick.gain.setValueAtTime(0, now)
    gainClick.gain.linearRampToValueAtTime(vol * 0.8, now + 0.003)
    gainClick.gain.exponentialRampToValueAtTime(0.001, now + 0.02)
    oscClick.start(now)
    oscClick.stop(now + 0.03)

    // Ping (A5 = 880 Hz)
    const oscPing = ctx.createOscillator()
    const gainPing = ctx.createGain()
    oscPing.connect(gainPing)
    gainPing.connect(ctx.destination)
    oscPing.type = 'sine'
    oscPing.frequency.setValueAtTime(880, now + 0.02)
    gainPing.gain.setValueAtTime(0, now + 0.02)
    gainPing.gain.linearRampToValueAtTime(vol, now + 0.03)
    gainPing.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    oscPing.start(now + 0.02)
    oscPing.stop(now + 0.28)
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play vault unlock sound:', err)
  }
}

/**
 * Plays a click + low ping sound when the vault is locked.
 */
export function playVaultLockSound() {
  const settings = loadSoundSettings()
  if (!settings.vaultClicks || settings.masterVolume <= 0) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const vol = getGainMultiplier()
    const now = ctx.currentTime

    // Click pulse
    const oscClick = ctx.createOscillator()
    const gainClick = ctx.createGain()
    oscClick.connect(gainClick)
    gainClick.connect(ctx.destination)
    oscClick.type = 'triangle'
    oscClick.frequency.setValueAtTime(400, now)
    gainClick.gain.setValueAtTime(0, now)
    gainClick.gain.linearRampToValueAtTime(vol * 0.8, now + 0.003)
    gainClick.gain.exponentialRampToValueAtTime(0.001, now + 0.02)
    oscClick.start(now)
    oscClick.stop(now + 0.03)

    // Low ping (A4 = 440 Hz)
    const oscPing = ctx.createOscillator()
    const gainPing = ctx.createGain()
    oscPing.connect(gainPing)
    gainPing.connect(ctx.destination)
    oscPing.type = 'sine'
    oscPing.frequency.setValueAtTime(440, now + 0.02)
    gainPing.gain.setValueAtTime(0, now + 0.02)
    gainPing.gain.linearRampToValueAtTime(vol, now + 0.03)
    gainPing.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    oscPing.start(now + 0.02)
    oscPing.stop(now + 0.28)
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play vault lock sound:', err)
  }
}
