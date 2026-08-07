import { useEffect, useMemo, useState, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { BridgeStatus } from '../network/bridge'
import { bridgeClient, cleanDecodePayload } from '../network/bridge'
import { base64ToUtf8, isControlMessage } from '../network/codec'
import { AuthSession } from '../crypto/session'
import {
  ChatPlusIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  GearIcon,
  GroupIcon,
  LogoutIcon,
  MegaphoneIcon,
  PeopleIcon,
  SearchIcon,
} from '../components/icons'

import { VextaDatabaseManager } from '../crypto/db_manager'
import { formatLastActive, presenceEngine } from '../network/presence'
import { CallModal } from '../components/CallModal'
import { DeviceApprovalModal } from '../components/DeviceApprovalModal'

const AVATAR_PALETTE = [
  '#39ff14',
  '#00b4d8',
  '#9b5de5',
  '#f15bb5',
  '#fee440',
  '#ff6b6b',
  '#06d6a0',
]

type Contact = {
  name: string
  subtitle: string
  time: string
  unread?: number
  group?: boolean
  online?: boolean
  lastTimestamp?: number
}

function formatDisplayTime(ts: any): string {
  if (!ts) return ''
  if (typeof ts === 'number') {
    const d = new Date(ts)
    return isNaN(d.getTime()) ? String(ts) : d.toTimeString().slice(0, 5)
  }
  if (typeof ts === 'string') {
    if (ts.includes('T')) {
      const d = new Date(ts)
      if (!isNaN(d.getTime())) {
        const hours = String(d.getHours()).padStart(2, '0')
        const mins = String(d.getMinutes()).padStart(2, '0')
        return `${hours}:${mins}`
      }
      return ts.slice(11, 16)
    }
    return ts
  }
  return String(ts)
}

const SYSTEM_CHANNEL = 'Vexta - Global Message'

function loadUserContacts(): Contact[] {
  const activeUser = localStorage.getItem('vexta_active_user') || ''
  if (!activeUser) return []
  const db = new VextaDatabaseManager(activeUser)

  const directContacts = db
    .getContacts()
    .filter((c) => c.status !== 'pending')
    .map((c) => {
    const msgs = db.getMessages(c.username)
    const lastMsg = msgs[msgs.length - 1]
    const lastTs = lastMsg && lastMsg.timestamp ? (typeof lastMsg.timestamp === 'number' ? lastMsg.timestamp : new Date(lastMsg.timestamp).getTime()) : 0

    const lastActiveIso = db.getContactLastActive(c.username)
    const isOnline = lastActiveIso ? formatLastActive(lastActiveIso).includes('Active now') : false

    return {
      name: c.username,
      subtitle: lastMsg
        ? lastMsg.ciphertext.length > 25
          ? lastMsg.ciphertext.slice(0, 25) + '...'
          : lastMsg.ciphertext
        : c.username === 'Vexta - Global Message'
          ? 'Official announcements'
          : 'End-to-end encrypted',
      time: lastMsg ? formatDisplayTime(lastMsg.timestamp) || 'Recent' : 'Recent',
      online: isOnline || c.status === 'active',
      lastTimestamp: isNaN(lastTs) ? 0 : lastTs,
    }
  })

  const groupContacts = db.getGroups().map((g) => {
    const msgs = db.getMessages(`group_${g.group_name}`)
    const lastMsg = msgs[msgs.length - 1]
    const lastTs = lastMsg && lastMsg.timestamp ? (typeof lastMsg.timestamp === 'number' ? lastMsg.timestamp : new Date(lastMsg.timestamp).getTime()) : 0

    return {
      name: g.group_name,
      subtitle: lastMsg ? lastMsg.ciphertext : 'E2EE Group Chat',
      time: lastMsg ? formatDisplayTime(lastMsg.timestamp) || 'Group' : 'Group',
      group: true,
      online: true,
      lastTimestamp: isNaN(lastTs) ? 0 : lastTs,
    }
  })

  const sysChannel = directContacts.find((c) => c.name === SYSTEM_CHANNEL) || {
    name: SYSTEM_CHANNEL,
    subtitle: 'Official announcements',
    time: 'System',
    online: true,
    lastTimestamp: Infinity,
  }

  const otherDirects = directContacts.filter((c) => c.name !== SYSTEM_CHANNEL)
  const sortedOthers = [...groupContacts, ...otherDirects].sort(
    (a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0),
  )

  return [sysChannel, ...sortedOthers]
}

function avatarStyle(name: string, group?: boolean) {
  if (group) return { background: '#00b4d8' }
  if (name === 'Vexta - Global Message') return { background: '#39ff14' }
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return { background: AVATAR_PALETTE[hash % AVATAR_PALETTE.length] }
}

function avatarContent(name: string, group?: boolean) {
  if (group) return <GroupIcon size={15} />
  if (name === 'Vexta - Global Message') return <MegaphoneIcon size={15} />
  return name.charAt(0).toUpperCase()
}

function chatIdOf(c: Contact) {
  return c.group ? `group_${c.name}` : c.name
}

function playNotificationSound() {
  try {
    const isSoundEnabled = localStorage.getItem('vx_setting_notification_sounds') !== 'false'
    if (!isSoundEnabled) return

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()

    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    const now = ctx.currentTime

    // Pleasant high-quality double chime
    osc.type = 'sine'

    // First chime
    osc.frequency.setValueAtTime(523.25, now) // C5
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.1, now + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    // Second chime
    const osc2 = ctx.createOscillator()
    const gainNode2 = ctx.createGain()
    osc2.connect(gainNode2)
    gainNode2.connect(ctx.destination)

    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(783.99, now + 0.08) // G5

    gainNode2.gain.setValueAtTime(0, now + 0.08)
    gainNode2.gain.linearRampToValueAtTime(0.1, now + 0.09)
    gainNode2.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

    osc.start(now)
    osc.stop(now + 0.15)

    osc2.start(now + 0.08)
    osc2.stop(now + 0.3)
  } catch (err) {
    console.warn('[Vexta Audio] Failed to play notification sound:', err)
  }
}

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [contacts, setContacts] = useState<Contact[]>(loadUserContacts)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [groupOpen, setGroupOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('connecting')
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0)

  // In-app floating message notification banner state
  const [notification, setNotification] = useState<{ sender: string; snippet: string } | null>(null)
  const notificationTimeoutRef = useRef<any>(null)

  // Keep a ref of activeChat to avoid stale closures in subscribeMessages
  const activeChatRef = useRef<string | null>(null)
  useEffect(() => {
    activeChatRef.current = activeChat
  }, [activeChat])

  useEffect(() => {
    let lastActivity = Date.now()

    const updateActivity = () => {
      lastActivity = Date.now()
    }

    window.addEventListener('mousemove', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('mousedown', updateActivity)
    window.addEventListener('touchstart', updateActivity)
    window.addEventListener('scroll', updateActivity)

    const checkAutoLock = () => {
      const setting = localStorage.getItem('vx_setting_autolock') || '5m'
      if (setting === 'never') return

      let timeoutMs = 5 * 60 * 1000
      if (setting === '1m') timeoutMs = 1 * 60 * 1000
      else if (setting === '5m') timeoutMs = 5 * 60 * 1000
      else if (setting === '15m') timeoutMs = 15 * 60 * 1000
      else if (setting === '1h') timeoutMs = 60 * 60 * 1000

      const elapsed = Date.now() - lastActivity
      if (elapsed >= timeoutMs) {
        console.warn(`[Vexta Auto-Lock] Vault auto-locked after ${setting} of inactivity.`)
        AuthSession.logout()
        ;(window as any).vextaNative?.lockVault()
        navigate('/login', { replace: true })
      }
    }

    const timer = setInterval(checkAutoLock, 5000)

    return () => {
      clearInterval(timer)
      window.removeEventListener('mousemove', updateActivity)
      window.removeEventListener('keydown', updateActivity)
      window.removeEventListener('mousedown', updateActivity)
      window.removeEventListener('touchstart', updateActivity)
      window.removeEventListener('scroll', updateActivity)
    }
  }, [navigate])

  useEffect(() => {
    const parts = location.pathname.split('/')
    const currentChat = decodeURIComponent(parts[parts.length - 1] || '')
    if (currentChat) {
      setUnreadCounts((prev) => {
        if (!prev[currentChat]) return prev
        const next = { ...prev }
        delete next[currentChat]
        return next
      })
    }
  }, [location.pathname])

  useEffect(() => {
    bridgeClient.connect()
    presenceEngine.startHeartbeat()
    const unsub = bridgeClient.subscribeStatus(setBridgeStatus)

    const unsubRequests = bridgeClient.subscribeFriendRequests((reqs) => {
      setPendingRequestsCount(reqs ? reqs.length : 0)
    })
    bridgeClient.listFriendRequests()

    const unsubMsg = bridgeClient.subscribeMessages((msg) => {
      if (msg.sender) {
        const rawInput = msg.wire_blob || msg.ciphertext || (msg as any).body || ''
        let snippet = rawInput
        try {
          if (msg.wire_blob) snippet = base64ToUtf8(msg.wire_blob)
          else if (msg.ciphertext) snippet = base64ToUtf8(msg.ciphertext)
        } catch {
          snippet = rawInput
        }

        const inner = cleanDecodePayload(snippet) || cleanDecodePayload(rawInput)

        let targetName = msg.sender

        if (inner && typeof inner === 'object') {
          if (
            inner.type === 'file_chunk' ||
            inner.type === 'file_init' ||
            inner.type === 'file_status_query' ||
            inner.type === 'file_status_response' ||
            inner.type === 'presence' ||
            inner.type === 'metadata_sync' ||
            inner.type === 'call_offer' ||
            inner.type === 'call_answer' ||
            inner.type === 'call_ice' ||
            inner.type === 'call_end'
          ) {
            return
          }
          if (inner.type === 'group_msg') {
            targetName = inner.group_uuid || msg.sender
            snippet = inner.body || snippet
          }
        }

        if (isControlMessage(snippet) || isControlMessage(rawInput)) {
          return
        }

        const nowMs = Date.now()
        const activeUser = localStorage.getItem('vexta_active_user') || ''
        if (msg.sender && msg.sender !== activeUser) {
          playNotificationSound()

          const isInactive = document.hidden || !document.hasFocus()
          if (isInactive) {
            ;(window as any).vextaNative?.showNotification({
              title: msg.sender,
              body: snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet,
            })
          } else if (activeChatRef.current !== targetName && activeChatRef.current !== msg.sender) {
            if (notificationTimeoutRef.current) {
              clearTimeout(notificationTimeoutRef.current)
            }
            setNotification({ sender: msg.sender, snippet })
            notificationTimeoutRef.current = setTimeout(() => {
              setNotification(null)
            }, 4000)
          }
        }

        setUnreadCounts((prev) => ({
          ...prev,
          [msg.sender]: (prev[msg.sender] || 0) + 1,
        }))

        const formattedSubtitle = snippet.length > 25 ? snippet.slice(0, 25) + '...' : snippet

        setContacts((prevContacts) => {
          return prevContacts
            .map((c) => {
              if (
                c.name === targetName ||
                chatIdOf(c) === targetName ||
                c.name === msg.sender ||
                chatIdOf(c) === msg.sender ||
                (c.group && inner?.group_uuid && c.name.includes(inner.group_uuid))
              ) {
                return {
                  ...c,
                  subtitle: formattedSubtitle || c.subtitle,
                  lastTimestamp: nowMs,
                  time: new Date().toTimeString().slice(0, 5),
                }
              }
              return c
            })
            .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
        })
      }
    })

    const reloadContacts = (e?: any) => {
      const detail = (e as CustomEvent)?.detail
      if (detail?.chatId || detail?.name) {
        const cId = detail.chatId
        const cName = detail.name
        setUnreadCounts((prev) => {
          const next = { ...prev }
          if (cId) delete next[cId]
          if (cName) delete next[cName]
          return next
        })
      }
      setContacts(loadUserContacts())
    }
    window.addEventListener('vexta_messages_cleared', reloadContacts)
    window.addEventListener('vexta_messages_updated', reloadContacts)
    window.addEventListener('vexta_contact_removed', reloadContacts)
    window.addEventListener('vexta_contact_added', reloadContacts)
    window.addEventListener('vexta_friend_request_updated', reloadContacts)
    window.addEventListener('vexta_presence_updated', reloadContacts)

    return () => {
      unsub()
      unsubMsg()
      unsubRequests()
      window.removeEventListener('vexta_messages_cleared', reloadContacts)
      window.removeEventListener('vexta_messages_updated', reloadContacts)
      window.removeEventListener('vexta_contact_removed', reloadContacts)
      window.removeEventListener('vexta_contact_added', reloadContacts)
      window.removeEventListener('vexta_friend_request_updated', reloadContacts)
      window.removeEventListener('vexta_presence_updated', reloadContacts)
      presenceEngine.stopHeartbeat()
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => c.name.toLowerCase().includes(q))
  }, [contacts, query])

  const sections = useMemo(
    () => [
      {
        key: 'direct',
        label: 'Direct Messages',
        contacts: filtered.filter((c) => !c.group && c.name !== SYSTEM_CHANNEL),
      },
      {
        key: 'groups',
        label: 'Groups',
        contacts: filtered.filter((c) => c.group),
      },
      {
        key: 'system',
        label: 'System',
        contacts: filtered.filter((c) => c.name === SYSTEM_CHANNEL),
      },
    ],
    [filtered],
  )

  const directContacts = useMemo(
    () => contacts.filter((c) => !c.group && c.name !== SYSTEM_CHANNEL),
    [contacts],
  )

  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openChat(c: Contact) {
    const id = chatIdOf(c)
    setActiveChat(id)
    setUnreadCounts((prev) => ({ ...prev, [c.name]: 0, [id]: 0 }))
    navigate(`/chat/${encodeURIComponent(id)}`)
  }

  // ── Create group modal state ─────────────────────────
  const [groupName, setGroupName] = useState('')
  const [members, setMembers] = useState<Set<string>>(new Set())

  function toggleMember(name: string) {
    setMembers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function createGroup() {
    const name = groupName.trim()
    if (!name || members.size === 0) return
    const activeUser = localStorage.getItem('vexta_active_user') || 'self'
    const memberList = Array.from(members)
    if (!memberList.includes(activeUser)) memberList.push(activeUser)

    const groupId = name.toLowerCase().replace(/\s+/g, '_')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.saveGroup(
        {
          group_id: groupId,
          group_name: name,
          creator: activeUser,
          created_at: new Date().toISOString(),
        },
        memberList,
      )

      for (const m of memberList) {
        if (m !== activeUser) {
          bridgeClient.sendGroupInvite(groupId, name, m, memberList)
        }
      }
    }

    const newContact: Contact = {
      name,
      subtitle: 'E2EE Group Chat',
      time: 'now',
      group: true,
      online: true,
    }
    setContacts((prev) => [newContact, ...prev])
    setGroupName('')
    setMembers(new Set())
    setGroupOpen(false)
    openChat(newContact)
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <button type="button" className="brand" onClick={() => navigate('/')}>
            <span className="brand-mark">
              <img
                src="./icon.png"
                alt=""
                className="sidebar-icon"
                width={24}
                height={24}
              />
            </span>
            <span className="brand-text">
              <span className="logo">
                <span className="logo-ve">VEX</span>
                <span className="logo-ta">TA</span>
              </span>
              <span className="brand-sub">By Orientis Digital</span>
            </span>
          </button>
          <span className="spacer" />
          <span className="conn-chip" title={`Bridge Relay: wss://vexta-api.nexusec.space/ws/chat/ (${bridgeStatus})`}>
            <span className={`status-dot ${bridgeStatus === 'connected' ? 'connected' : 'connecting'}`} />
            <span className="conn-label">
              {bridgeStatus === 'connected'
                ? 'Connected'
                : bridgeStatus === 'connecting'
                  ? 'Connecting...'
                  : 'Disconnected'}
            </span>
          </span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/friends" className="sidebar-btn">
            <span className="btn-icon">
              <PeopleIcon size={14} />
            </span>
            Friends &amp; Requests
            <span className="spacer" />
            {pendingRequestsCount > 0 && (
              <span className="badge">{pendingRequestsCount}</span>
            )}
          </NavLink>

          <button
            type="button"
            className="sidebar-btn"
            onClick={() => setGroupOpen(true)}
          >
            <span className="btn-icon">
              <ChatPlusIcon size={14} />
            </span>
            Create Group Chat
          </button>
        </nav>

        <div className="search-wrap">
          <SearchIcon size={14} className="search-icon" />
          <input
            className="search-field"
            type="search"
            placeholder="Search conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="sidebar-divider" />

        <div className="contacts-scroll">
          {sections.map(
            (section) =>
              section.contacts.length > 0 && (
                <div className="contact-section" key={section.key}>
                  <button
                    type="button"
                    className="section-header"
                    onClick={() => toggleSection(section.key)}
                  >
                    <span className="section-label">{section.label}</span>
                    <span className="section-count">{section.contacts.length}</span>
                    <ChevronIcon
                      size={12}
                      className={`chevron ${collapsed.has(section.key) ? 'collapsed' : ''}`}
                    />
                  </button>
                  {!collapsed.has(section.key) &&
                    section.contacts.map((c) => (
                      <div
                        key={c.name}
                        className={`tile ${activeChat === chatIdOf(c) ? 'active' : ''}`}
                        onClick={() => openChat(c)}
                      >
                        <span className="tile-indicator" />
                        <span className="avatar" style={avatarStyle(c.name, c.group)}>
                          {avatarContent(c.name, c.group)}
                          {c.online !== undefined && (
                            <span className={`presence ${c.online ? 'on' : ''}`} />
                          )}
                        </span>
                        <span className="tile-body">
                          <span className="tile-name">{c.name}</span>
                          <span className="tile-sub">{c.subtitle}</span>
                        </span>
                        <span className="tile-right">
                          <span className="tile-time">{c.time}</span>
                          {(unreadCounts[c.name] || unreadCounts[chatIdOf(c)] || c.unread || 0) > 0 && (
                            <span className="badge">
                              {unreadCounts[c.name] || unreadCounts[chatIdOf(c)] || c.unread}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                </div>
              ),
          )}
          {filtered.length === 0 && (
            <p className="contact-empty">No conversations found.</p>
          )}
        </div>

        <div className="sidebar-divider" />

        {(() => {
          const currentUser = localStorage.getItem('vexta_active_user') || 'User'
          const avatarInitials = currentUser.slice(0, 2).toUpperCase()
          return (
            <div className="profile-card" onClick={() => navigate('/settings')}>
              <span className="avatar profile-avatar" style={avatarStyle(currentUser)}>
                {avatarInitials}
                <span className="presence" />
              </span>
              <span className="profile-body">
                <span className="profile-name">@{currentUser}</span>
                <span className="profile-status">Online \u00B7 E2EE Active</span>
              </span>
              <span className="profile-icon">
                <GearIcon size={15} />
              </span>
            </div>
          )
        })()}

        <button
          type="button"
          className="sign-out"
          onClick={() => setSignOutOpen(true)}
        >
          <LogoutIcon size={15} />
          Sign Out
        </button>
      </aside>

      <main className="content">
        <Outlet />
      </main>

      {groupOpen && (
        <div className="modal-backdrop" onClick={() => setGroupOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <GroupIcon size={18} />
            </div>
            <h2 className="modal-title">Create Group Chat</h2>
            <p className="modal-note">
              Name your channel and add at least one contact. Every message stays
              end-to-end encrypted.
            </p>
            <div className="modal-field">
              <label className="field-label" htmlFor="group-name">
                Group Name
              </label>
              <input
                id="group-name"
                className="modal-input"
                type="text"
                placeholder="e.g. Night Shift Crew"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label className="field-label">Members</label>
              <div className="member-list">
                {directContacts.map((c) => (
                  <button
                    type="button"
                    key={c.name}
                    className={`member-row ${members.has(c.name) ? 'selected' : ''}`}
                    onClick={() => toggleMember(c.name)}
                  >
                    <span className="avatar" style={avatarStyle(c.name, false)}>
                      {avatarContent(c.name, false)}
                      {c.online !== undefined && (
                        <span className={`presence ${c.online ? 'on' : ''}`} />
                      )}
                    </span>
                    <span className="member-name">{c.name}</span>
                    <span className={`member-check ${members.has(c.name) ? 'checked' : ''}`}>
                      <CheckIcon size={12} />
                    </span>
                  </button>
                ))}
                {directContacts.length === 0 && (
                  <p className="contact-empty">No contacts to add yet.</p>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setGroupOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!groupName.trim() || members.size === 0}
                onClick={createGroup}
              >
                Initialize Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {signOutOpen && (
        <div className="modal-backdrop" onClick={() => setSignOutOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon danger">
              <LogoutIcon size={18} />
            </div>
            <h2 className="modal-title">Sign Out</h2>
            <p className="modal-note">
              You'll need your 32-character recovery key to restore this account
              later. Nothing is stored on this device.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setSignOutOpen(false)}>
                Stay Logged In
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  AuthSession.logout()
                  setSignOutOpen(false)
                  navigate('/login')
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Floating Message Notification Banner */}
      {notification && (
        <div
          className="in-app-notification"
          onClick={() => {
            setNotification(null)
            navigate(`/chat/${encodeURIComponent(notification.sender)}`)
          }}
        >
          <div className="notif-avatar" style={avatarStyle(notification.sender)}>
            {notification.sender.charAt(0).toUpperCase()}
          </div>
          <div className="notif-content">
            <span className="notif-sender">{notification.sender}</span>
            <span className="notif-snippet">{notification.snippet}</span>
          </div>
          <button
            type="button"
            className="notif-close"
            onClick={(e) => {
              e.stopPropagation()
              setNotification(null)
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Global E2EE WebRTC Call Overlay */}
      <CallModal />

      {/* Out-of-Band Secondary Device Approval Listener */}
      <DeviceApprovalModal />
    </div>
  )
}

export default AppLayout
