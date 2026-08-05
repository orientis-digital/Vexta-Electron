import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { BridgeStatus } from '../network/bridge'
import { bridgeClient } from '../network/bridge'
import { AuthSession } from '../crypto/session'
import {
  ChatPlusIcon,
  CheckIcon,
  ChevronIcon,
  GearIcon,
  GroupIcon,
  LogoutIcon,
  MegaphoneIcon,
  PeopleIcon,
  SearchIcon,
} from '../components/icons'

import { VextaDatabaseManager } from '../crypto/db_manager'
import { CallModal } from '../components/CallModal'
import { DeviceApprovalModal } from '../components/DeviceApprovalModal'
import { presenceEngine } from '../network/presence'

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

function loadUserContacts(): Contact[] {
  const activeUser = localStorage.getItem('vexta_active_user') || ''
  if (!activeUser) return []
  const db = new VextaDatabaseManager(activeUser)

  const directContacts = db.getContacts().map((c) => {
    const msgs = db.getMessages(c.username)
    const lastMsg = msgs[msgs.length - 1]
    const lastTs = lastMsg && lastMsg.timestamp ? new Date(lastMsg.timestamp).getTime() : 0

    return {
      name: c.username,
      subtitle: lastMsg
        ? lastMsg.ciphertext.length > 25
          ? lastMsg.ciphertext.slice(0, 25) + '...'
          : lastMsg.ciphertext
        : c.username === 'Vexta - Global Message'
          ? 'Official announcements'
          : 'End-to-end encrypted',
      time: lastMsg
        ? lastMsg.timestamp.includes('T')
          ? lastMsg.timestamp.slice(11, 16)
          : lastMsg.timestamp
        : 'Recent',
      online: c.status === 'active',
      lastTimestamp: isNaN(lastTs) ? 0 : lastTs,
    }
  })

  const groupContacts = db.getGroups().map((g) => {
    const msgs = db.getMessages(`group_${g.group_name}`)
    const lastMsg = msgs[msgs.length - 1]
    const lastTs = lastMsg && lastMsg.timestamp ? new Date(lastMsg.timestamp).getTime() : 0

    return {
      name: g.group_name,
      subtitle: lastMsg ? lastMsg.ciphertext : 'E2EE Group Chat',
      time: lastMsg
        ? lastMsg.timestamp.includes('T')
          ? lastMsg.timestamp.slice(11, 16)
          : lastMsg.timestamp
        : 'Group',
      group: true,
      online: true,
      lastTimestamp: isNaN(lastTs) ? 0 : lastTs,
    }
  })

  return [...groupContacts, ...directContacts].sort(
    (a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0),
  )
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

const SYSTEM_CHANNEL = 'Vexta - Global Message'

function AppLayout() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<Contact[]>(loadUserContacts)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [groupOpen, setGroupOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('connecting')
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    bridgeClient.connect()
    presenceEngine.startHeartbeat()
    const unsub = bridgeClient.subscribeStatus(setBridgeStatus)

    const unsubMsg = bridgeClient.subscribeMessages((msg) => {
      if (msg.sender) {
        const nowMs = Date.now()
        setUnreadCounts((prev) => ({
          ...prev,
          [msg.sender]: (prev[msg.sender] || 0) + 1,
        }))
        setContacts((prevContacts) => {
          return prevContacts
            .map((c) => {
              if (c.name === msg.sender || chatIdOf(c) === msg.sender) {
                return {
                  ...c,
                  subtitle: msg.wire_blob
                    ? msg.wire_blob.length > 25
                      ? msg.wire_blob.slice(0, 25) + '...'
                      : msg.wire_blob
                    : c.subtitle,
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

    return () => {
      unsub()
      unsubMsg()
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
            <span className="badge" style={{ visibility: 'hidden' }}>
              0
            </span>
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

      {/* Global E2EE WebRTC Call Overlay */}
      <CallModal />

      {/* Out-of-Band Secondary Device Approval Listener */}
      <DeviceApprovalModal />
    </div>
  )
}

export default AppLayout
