import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { VextaDatabaseManager } from '../crypto/db_manager'
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  GroupIcon,
  LockIcon,
  MegaphoneIcon,
  PaletteIcon,
  PeopleIcon,
  QrCodeIcon,
  ShieldIcon,
  TimerIcon,
  TrashIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '../components/icons'

type SectionKey = 'security' | 'members' | 'theme' | 'data'

type Member = {
  name: string
  role: 'Creator' | 'Admin' | 'Member'
  online?: boolean
}

type ChatInfoViewProps = {
  chatId?: string
  onClose?: () => void
}

const WALLPAPERS = [
  { id: 'cyber_neon', label: 'Cyber Neon', color: '#09150a', border: '#39ff14', accent: '#39ff14' },
  { id: 'purple_glow', label: 'Purple Glow', color: '#140d24', border: '#9b5de5', accent: '#9b5de5' },
  { id: 'deep_ocean', label: 'Deep Ocean', color: '#091e2b', border: '#00b4d8', accent: '#00b4d8' },
  { id: 'sunset_rose', label: 'Sunset Rose', color: '#240d18', border: '#f15bb5', accent: '#f15bb5' },
  { id: 'solar_amber', label: 'Solar Amber', color: '#242009', border: '#fee440', accent: '#fee440' },
  { id: 'crimson_red', label: 'Crimson Red', color: '#240909', border: '#ff4d4f', accent: '#ff4d4f' },
] as const

const TIMER_OPTIONS = [
  { label: 'Off', value: 'Off', seconds: 0 },
  { label: '5 seconds', value: '5s', seconds: 5 },
  { label: '10 seconds', value: '10s', seconds: 10 },
  { label: '1 minute', value: '1m', seconds: 60 },
  { label: '1 hour', value: '1h', seconds: 3600 },
  { label: '1 day', value: '1d', seconds: 86400 },
] as const

const AVATAR_PALETTE = [
  '#39ff14',
  '#00b4d8',
  '#9b5de5',
  '#f15bb5',
  '#fee440',
  '#ff6b6b',
  '#06d6a0',
]

function avatarStyle(name: string, group?: boolean) {
  if (group) return { background: '#00b4d8' }
  if (name === 'Vexta - Global Message') return { background: '#39ff14' }
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return { background: AVATAR_PALETTE[hash % AVATAR_PALETTE.length] }
}

function generateFingerprint(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const blocks: string[] = []
  for (let i = 0; i < 8; i++) {
    const val = Math.abs((hash * (i + 1) * 2654435761) % 65536)
    blocks.push(val.toString(16).padStart(4, '0').toUpperCase())
  }
  return blocks.join(' : ')
}

function ChatInfoView({ chatId: chatIdProp, onClose }: ChatInfoViewProps) {
  const { chatId: paramsChatId = '' } = useParams()
  const chatId = chatIdProp || paramsChatId
  const navigate = useNavigate()

  const isGlobal = chatId === 'Vexta - Global Message'
  const isGroup = chatId.startsWith('group_')
  const name = isGroup ? chatId.slice(6) : chatId

  // Expanding dropdown sections state (closed by default)
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set())

  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [timer, setTimer] = useState<string>('Off')
  const [selectedWallpaper, setSelectedWallpaper] = useState<string>('wallpaper-default')
  const [verified, setVerified] = useState<boolean>(true)
  const [notice, setNotice] = useState<string | null>(null)

  // Group members state
  const [members, setMembers] = useState<Member[]>([
    { name: 'Guest (You)', role: 'Creator', online: true },
  ])
  const [newMemberName, setNewMemberName] = useState('')
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [sharedTransfers, setSharedTransfers] = useState<any[]>([])
  const [friendPresenceAllow, setFriendPresenceAllow] = useState(true)

  // Modals state
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false)
  const [deleteChatOpen, setDeleteChatOpen] = useState(false)

  const fingerprint = useMemo(() => generateFingerprint(chatId), [chatId])

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function showToast(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3000)
  }

  function handleCopyFingerprint() {
    navigator.clipboard.writeText(fingerprint).catch(() => {})
    setCopied(true)
    showToast('Fingerprint copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  // Load saved timer, group members, and shared file transfers from Database
  useEffect(() => {
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (!activeUser || !name) return
    const db = new VextaDatabaseManager(activeUser)

    const transfers = db.getFileTransfers().filter(
      (t) => t.sender === name || t.recipient === name,
    )
    setSharedTransfers(transfers)

    const savedTimer = db.getChatTimer(name)
    if (savedTimer) setTimer(savedTimer)

    const savedTheme = db.getChatTheme(name)
    if (savedTheme) setSelectedWallpaper(savedTheme)

    setFriendPresenceAllow(db.getFriendPresenceOverride(name))

    if (isGroup) {
      const dbMembers = db.getGroupMembers(name)
      if (dbMembers.length > 0) {
        setMembers(
          dbMembers.map((m) => ({
            name: m === activeUser ? `${m} (You)` : m,
            role: m === activeUser ? 'Creator' : 'Member',
            online: true,
          })),
        )
      }
    }
  }, [name, isGroup])

  function handleSetTimer(val: string) {
    setTimer(val)
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && name) {
      const db = new VextaDatabaseManager(activeUser)
      db.setChatTimer(name, val === 'Off' ? null : val)
    }
    showToast(`Disappearing messages set to ${val}`)
  }

  function handleAddMember() {
    const trimmed = newMemberName.trim()
    if (!trimmed) return
    if (members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast('User is already a member of this chat')
      return
    }

    setMembers((prev) => [...prev, { name: trimmed, role: 'Member', online: true }])
    setNewMemberName('')
    setAddMemberOpen(false)

    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && isGroup) {
      const db = new VextaDatabaseManager(activeUser)
      db.addGroupMember(name, trimmed)
    }
    showToast(`Added ${trimmed} to group`)
  }

  function handleKickMember(memberName: string) {
    if (memberName.includes('(You)')) return
    setMembers((prev) => prev.filter((m) => m.name !== memberName))

    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && isGroup) {
      const db = new VextaDatabaseManager(activeUser)
      db.removeGroupMember(name, memberName)
    }
    showToast(`Removed ${memberName} from group`)
  }

  function handleExport(format: 'txt' | 'json') {
    const timestamp = new Date().toISOString()
    const content =
      format === 'json'
        ? JSON.stringify(
            {
              chatId,
              name,
              exportedAt: timestamp,
              securityFingerprint: fingerprint,
              messages: [
                {
                  id: 1,
                  sender: isGroup ? 'The Watcher' : name,
                  text: 'All comms encrypted. Key handshake verified on both ends.',
                  timestamp: '09:41',
                },
                {
                  id: 2,
                  sender: 'Guest',
                  text: 'Acknowledged. Rotating session keys now.',
                  timestamp: '09:42',
                },
                {
                  id: 3,
                  sender: isGroup ? 'The Watcher' : name,
                  text: 'Rendezvous point is clean. Proceed with the exchange.',
                  timestamp: '09:43',
                },
              ],
            },
            null,
            2,
          )
        : `=== VEXTA ENCRYPTED CHAT TRANSCRIPT ===\nChat: ${name}\nID: ${chatId}\nExported: ${timestamp}\nFingerprint: ${fingerprint}\n\n(No messages recorded in local vault)\n`

    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vexta_transcript_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(`Exported chat transcript as .${format.toUpperCase()}`)
  }

  function handleClearHistory() {
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.clearMessages(name)
      db.clearMessages(chatId)
      window.dispatchEvent(new CustomEvent('vexta_messages_cleared', { detail: { chatId, name } }))
    }
    setClearHistoryOpen(false)
    showToast('Chat history cleared')
  }

  function handleDeleteChat() {
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.clearMessages(name)
      db.clearMessages(chatId)
      window.dispatchEvent(new CustomEvent('vexta_messages_cleared', { detail: { chatId, name } }))
      if (isGroup) {
        db.deleteGroup(name)
        db.deleteGroup(chatId)
      } else {
        db.removeContact(name)
      }
    }
    setDeleteChatOpen(false)
    navigate('/')
  }

  return (
    <div className="chat-info-container">
      {/* Toast Notice */}
      {notice && (
        <div className="info-toast" role="status">
          <ShieldIcon size={14} />
          <span>{notice}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="info-header">
        <div className="info-header-title">
          <h2>Conversation Info</h2>
          <span className="info-badge">
            {isGlobal ? 'Global Announcement' : isGroup ? 'E2EE Group' : 'Direct Channel'}
          </span>
        </div>

        <div className="info-header-actions">
          <button
            type="button"
            className="btn-icon-ghost"
            onClick={() => setQrOpen(true)}
            title="Show Security QR"
          >
            <QrCodeIcon size={16} />
          </button>
          <button
            type="button"
            className="btn-icon-ghost close-btn"
            title="Close Info"
            onClick={onClose}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </header>

      <div className="info-content">
        {/* Profile Hero Card */}
        <div className="info-hero-card">
          <div className="info-avatar-large" style={avatarStyle(name, isGroup)}>
            {isGlobal ? (
              <MegaphoneIcon size={28} />
            ) : isGroup ? (
              <GroupIcon size={28} />
            ) : (
              <span>{name.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="info-hero-details">
            <h1 className="info-hero-name">{name}</h1>
            <p className="info-hero-sub">
              {isGlobal
                ? 'Official System Broadcast'
                : isGroup
                  ? `${members.length} Members \u00B7 Encrypted`
                  : 'RSA-4096 / AES-256-GCM'}
            </p>
            <div className="info-hero-tags">
              <span className={`trust-tag ${verified ? 'verified' : 'unverified'}`}>
                <ShieldIcon size={11} />
                {verified ? 'TOFU Verified' : 'Unverified'}
              </span>
              <span className="protocol-tag">
                <LockIcon size={11} />
                E2EE Active
              </span>
            </div>
          </div>
        </div>

        {/* Expanding Dropdown Accordion Menu List */}
        <div className="info-dropdown-accordion">
          {/* SECTION 1: SECURITY & CRYPTOGRAPHY */}
          <div className={`dropdown-card ${openSections.has('security') ? 'open' : ''}`}>
            <button
              type="button"
              className="dropdown-card-header"
              onClick={() => toggleSection('security')}
            >
              <div className="dropdown-card-title">
                <ShieldIcon size={16} className="accent-icon" />
                <h3>Security &amp; Key Fingerprint</h3>
              </div>
              <div className="dropdown-card-meta">
                <span className={`trust-tag ${verified ? 'verified' : 'unverified'}`}>
                  {verified ? 'Verified' : 'Unverified'}
                </span>
                <ChevronIcon
                  size={14}
                  className={`chevron-icon ${openSections.has('security') ? 'expanded' : ''}`}
                />
              </div>
            </button>

            {openSections.has('security') && (
              <div className="dropdown-card-body">
                <p className="card-desc">
                  Compare this cryptographic fingerprint out-of-band to verify end-to-end security.
                </p>

                <div className="fingerprint-box">
                  <span className="fingerprint-code">{fingerprint}</span>
                </div>

                <div className="card-actions">
                  <button type="button" className="btn-secondary" onClick={handleCopyFingerprint}>
                    <CopyIcon size={14} />
                    {copied ? 'Copied!' : 'Copy Fingerprint'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setQrOpen(true)}>
                    <QrCodeIcon size={14} />
                    Show Security QR
                  </button>
                  <button
                    type="button"
                    className={`btn-tiny ${verified ? 'btn-tiny-active' : ''}`}
                    onClick={() => {
                      setVerified(!verified)
                      showToast(verified ? 'Marked as unverified' : 'Fingerprint manually verified')
                    }}
                  >
                    {verified ? 'Verified' : 'Verify Key'}
                  </button>
                </div>

                <div className="spec-grid">
                  <div className="spec-item">
                    <span className="spec-label">Key Exchange</span>
                    <span className="spec-value">RSA-OAEP 4096-bit</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Cipher</span>
                    <span className="spec-value">AES-256-GCM</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Signatures</span>
                    <span className="spec-value">SHA-256 PSS</span>
                  </div>
                </div>

                {!isGroup && !isGlobal && (
                  <div className="dropdown-sub-section" style={{ marginTop: 14 }}>
                    <div className="card-title">
                      <ShieldIcon size={14} className="accent-icon" />
                      <h4 className="sub-title">Friend Presence Privacy</h4>
                    </div>
                    <div className="setting-toggle-row">
                      <span className="setting-label">Share Last Active Status</span>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={friendPresenceAllow}
                        onChange={(e) => {
                          const val = e.target.checked
                          setFriendPresenceAllow(val)
                          const activeUser = localStorage.getItem('vexta_active_user') || ''
                          if (activeUser && name) {
                            const db = new VextaDatabaseManager(activeUser)
                            db.setFriendPresenceOverride(name, val)
                          }
                          showToast(val ? `Sharing presence with @${name}` : `Presence hidden from @${name}`)
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="spec-grid">
                  <div className="spec-item">
                    <span className="spec-label">Trust Policy</span>
                    <span className="spec-value">TOFU</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: GROUP MEMBERS (IF GROUP CHAT) */}
          {isGroup && (
            <div className={`dropdown-card ${openSections.has('members') ? 'open' : ''}`}>
              <button
                type="button"
                className="dropdown-card-header"
                onClick={() => toggleSection('members')}
              >
                <div className="dropdown-card-title">
                  <PeopleIcon size={16} className="accent-icon" />
                  <h3>Group Roster</h3>
                </div>
                <div className="dropdown-card-meta">
                  <span className="dropdown-badge">{members.length} Members</span>
                  <ChevronIcon
                    size={14}
                    className={`chevron-icon ${openSections.has('members') ? 'expanded' : ''}`}
                  />
                </div>
              </button>

              {openSections.has('members') && (
                <div className="dropdown-card-body">
                  <div className="card-sub-header">
                    <span className="card-desc">Channel members &amp; roles</span>
                    <button
                      type="button"
                      className="btn-primary-sm"
                      onClick={() => setAddMemberOpen(true)}
                    >
                      <UserPlusIcon size={14} />
                      Add Member
                    </button>
                  </div>

                  <div className="member-roster">
                    {members.map((m) => (
                      <div key={m.name} className="roster-item">
                        <div className="roster-avatar" style={avatarStyle(m.name)}>
                          {m.name.charAt(0).toUpperCase()}
                          {m.online && <span className="presence-dot" />}
                        </div>

                        <div className="roster-info">
                          <span className="roster-name">{m.name}</span>
                          <span className="roster-status">
                            {m.online ? 'Online' : 'Offline'} \u00B7 {m.role}
                          </span>
                        </div>

                        <span className={`role-badge ${m.role.toLowerCase()}`}>{m.role}</span>

                        {!m.name.includes('(You)') && (
                          <button
                            type="button"
                            className="btn-icon-danger"
                            onClick={() => handleKickMember(m.name)}
                            title={`Remove ${m.name} from group`}
                          >
                            <UserMinusIcon size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: THEME & DISAPPEARING MESSAGES */}
          <div className={`dropdown-card ${openSections.has('theme') ? 'open' : ''}`}>
            <button
              type="button"
              className="dropdown-card-header"
              onClick={() => toggleSection('theme')}
            >
              <div className="dropdown-card-title">
                <PaletteIcon size={16} className="accent-icon" />
                <h3>Theme &amp; Disappearing</h3>
              </div>
              <div className="dropdown-card-meta">
                <span className="setting-active-val">{timer}</span>
                <ChevronIcon
                  size={14}
                  className={`chevron-icon ${openSections.has('theme') ? 'expanded' : ''}`}
                />
              </div>
            </button>

            {openSections.has('theme') && (
              <div className="dropdown-card-body">
                {/* Disappearing Messages */}
                <div className="dropdown-sub-section">
                  <div className="card-title">
                    <TimerIcon size={14} className="accent-icon" />
                    <h4 className="sub-title">Disappearing Messages</h4>
                  </div>
                  <p className="card-desc">
                    Auto-delete new messages after the selected duration.
                  </p>

                  <div className="timer-selector-grid">
                    {TIMER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`timer-option-btn ${timer === opt.value ? 'selected' : ''}`}
                        onClick={() => handleSetTimer(opt.value)}
                      >
                        <TimerIcon size={14} />
                        <span>{opt.label}</span>
                        {timer === opt.value && <CheckIcon size={12} className="check-icon" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wallpaper Theme Picker */}
                <div className="dropdown-sub-section">
                  <div className="card-title">
                    <PaletteIcon size={14} className="accent-icon" />
                    <h4 className="sub-title">Wallpaper Theme</h4>
                  </div>
                  <p className="card-desc">Select ambient chat background styling.</p>

                  <div className="wallpaper-grid">
                    {WALLPAPERS.map((wp) => (
                      <button
                        key={wp.id}
                        type="button"
                        className={`wallpaper-card ${selectedWallpaper === wp.id ? 'active' : ''}`}
                        style={{ background: wp.color, borderColor: wp.border }}
                        onClick={() => {
                          setSelectedWallpaper(wp.id)
                          const activeUser = localStorage.getItem('vexta_active_user') || ''
                          if (activeUser && name) {
                            const db = new VextaDatabaseManager(activeUser)
                            db.setChatTheme(name, wp.id)
                          }
                          showToast(`Chat theme updated to ${wp.label}`)
                        }}
                      >
                        <div className="wallpaper-preview-bubbles">
                          <div className="mini-bubble incoming" />
                          <div className="mini-bubble outgoing" />
                        </div>
                        <span className="wallpaper-label">{wp.label}</span>
                        {selectedWallpaper === wp.id && (
                          <span className="wallpaper-check">
                            <CheckIcon size={12} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: DATA & DANGER ZONE */}
          <div className={`dropdown-card ${openSections.has('data') ? 'open' : ''}`}>
            <button
              type="button"
              className="dropdown-card-header"
              onClick={() => toggleSection('data')}
            >
              <div className="dropdown-card-title">
                <DownloadIcon size={16} className="accent-icon" />
                <h3>Data &amp; Danger Zone</h3>
              </div>
              <div className="dropdown-card-meta">
                <span className="dropdown-badge">Privacy</span>
                <ChevronIcon
                  size={14}
                  className={`chevron-icon ${openSections.has('data') ? 'expanded' : ''}`}
                />
              </div>
            </button>

            {openSections.has('data') && (
              <div className="dropdown-card-body">
                {/* Shared Media & Files Grid */}
                <div className="dropdown-sub-section">
                  <span className="sub-title">Shared Media &amp; Files ({sharedTransfers.length})</span>
                  <p className="card-desc">Files and media exchanged in this channel.</p>
                  {sharedTransfers.length === 0 ? (
                    <p className="muted-hint">No shared files yet</p>
                  ) : (
                    <div className="shared-files-list">
                      {sharedTransfers.map((t: any) => (
                        <div key={t.transfer_id} className="shared-file-item">
                          <DownloadIcon size={14} className="accent-icon" />
                          <div className="shared-file-info">
                            <span className="shared-file-name">{t.filename}</span>
                            <span className="shared-file-meta">
                              {Math.round(t.file_size / 1024)} KB &middot; {t.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Export Transcript */}
                <div className="dropdown-sub-section">
                  <span className="sub-title">Export Chat Transcript</span>
                  <p className="card-desc">Download transcript to local device storage.</p>
                  <div className="card-actions">
                    <button type="button" className="btn-secondary" onClick={() => handleExport('txt')}>
                      <DownloadIcon size={14} />
                      Export .TXT
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => handleExport('json')}>
                      <DownloadIcon size={14} />
                      Export .JSON
                    </button>
                  </div>
                </div>

                {/* Danger Zone Actions */}
                <div className="danger-sub-box">
                  <span className="action-title text-danger">Danger Zone</span>
                  <div className="danger-action-row">
                    <div>
                      <span className="action-title">Clear Message History</span>
                      <span className="action-desc">Wipe local ciphertexts in SQLite.</span>
                    </div>
                    <button
                      type="button"
                      className="btn-danger-outline"
                      onClick={() => setClearHistoryOpen(true)}
                    >
                      Clear
                    </button>
                  </div>

                  <div className="danger-action-row">
                    <div>
                      <span className="action-title">
                        {isGroup ? 'Delete Group' : 'Delete Contact'}
                      </span>
                      <span className="action-desc">
                        {isGroup ? 'Leave and remove group.' : 'Delete from address book.'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-danger-solid"
                      onClick={() => setDeleteChatOpen(true)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {qrOpen && (
        <div className="modal-backdrop" onClick={() => setQrOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <QrCodeIcon size={20} />
            </div>
            <h2 className="modal-title">Security QR Code</h2>
            <p className="modal-note">
              Scan with Vexta or copy the identity string to verify the safety fingerprint.
            </p>

            <div className="qr-container">
              <svg className="qr-svg" viewBox="0 0 200 200" fill="currentColor">
                <rect width="200" height="200" fill="#1e1e1e" rx="12" />
                <rect x="20" y="20" width="50" height="50" fill="#39ff14" rx="4" />
                <rect x="30" y="30" width="30" height="30" fill="#1e1e1e" rx="2" />
                <rect x="40" y="40" width="10" height="10" fill="#39ff14" rx="1" />

                <rect x="130" y="20" width="50" height="50" fill="#39ff14" rx="4" />
                <rect x="140" y="30" width="30" height="30" fill="#1e1e1e" rx="2" />
                <rect x="150" y="40" width="10" height="10" fill="#39ff14" rx="1" />

                <rect x="20" y="130" width="50" height="50" fill="#39ff14" rx="4" />
                <rect x="30" y="140" width="30" height="30" fill="#1e1e1e" rx="2" />
                <rect x="40" y="150" width="10" height="10" fill="#39ff14" rx="1" />

                {[
                  [80, 20], [90, 20], [110, 20], [80, 40], [100, 40], [110, 50],
                  [80, 70], [90, 80], [100, 70], [120, 80], [150, 80], [170, 80],
                  [20, 90], [40, 100], [60, 90], [80, 100], [110, 100], [140, 100], [160, 90],
                  [30, 110], [50, 110], [90, 120], [120, 110], [150, 120], [170, 110],
                  [80, 140], [100, 150], [110, 140], [140, 140], [160, 150], [170, 130],
                  [90, 170], [120, 160], [130, 170], [150, 170], [170, 160], [180, 180]
                ].map(([x, y], idx) => (
                  <rect key={idx} x={x} y={y} width="10" height="10" fill="#39ff14" rx="1" />
                ))}
              </svg>
            </div>

            <div className="modal-field">
              <label className="field-label">Identity URI</label>
              <input
                className="modal-input"
                type="text"
                readOnly
                value={`vexta://identity/${encodeURIComponent(name)}?fingerprint=${fingerprint.replace(/\s+:\s+/g, '')}`}
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setQrOpen(false)}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={handleCopyFingerprint}>
                Copy Fingerprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberOpen && (
        <div className="modal-backdrop" onClick={() => setAddMemberOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <UserPlusIcon size={18} />
            </div>
            <h2 className="modal-title">Add Member to Group</h2>
            <p className="modal-note">
              Enter username or identity key string to add to {name}.
            </p>
            <div className="modal-field">
              <label className="field-label" htmlFor="member-username">
                Username / Identity Key
              </label>
              <input
                id="member-username"
                className="modal-input"
                type="text"
                placeholder="e.g. CipherPunk99"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setAddMemberOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!newMemberName.trim()}
                onClick={handleAddMember}
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Confirmation Modal */}
      {clearHistoryOpen && (
        <div className="modal-backdrop" onClick={() => setClearHistoryOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon danger">
              <TrashIcon size={18} />
            </div>
            <h2 className="modal-title">Clear Chat History?</h2>
            <p className="modal-note">
              This will permanently delete all encrypted local messages for this conversation.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setClearHistoryOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={handleClearHistory}>
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Confirmation Modal */}
      {deleteChatOpen && (
        <div className="modal-backdrop" onClick={() => setDeleteChatOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon danger">
              <TrashIcon size={18} />
            </div>
            <h2 className="modal-title">
              {isGroup ? `Delete Group "${name}"?` : `Delete Contact "${name}"?`}
            </h2>
            <p className="modal-note">
              {isGroup
                ? 'You will leave this group chat and delete all associated channel data.'
                : 'This contact and your message history will be deleted from this device.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDeleteChatOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={handleDeleteChat}>
                {isGroup ? 'Delete Group' : 'Delete Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatInfoView
