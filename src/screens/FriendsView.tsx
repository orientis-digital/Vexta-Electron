import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { VextaDatabaseManager } from '../crypto/db_manager'
import { bridgeClient } from '../network/bridge'
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  KeyIcon,
  PeopleIcon,
  PlusIcon,
  QrCodeIcon,
  ShieldIcon,
  UserPlusIcon,
} from '../components/icons'
import { EmptyState } from '../components/EmptyState'

type Tab = 'active' | 'pending' | 'add'

type Friend = {
  id: string
  name: string
  handle: string
  fingerprint: string
  status: string
  online: boolean
}

type PendingRequest = {
  id: string
  name: string
  handle: string
  direction: 'incoming' | 'outgoing'
  time: string
}

const AVATAR_PALETTE = [
  '#39ff14',
  '#00b4d8',
  '#9b5de5',
  '#f15bb5',
  '#fee440',
  '#ff6b6b',
  '#06d6a0',
]

function avatarStyle(name: string) {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return { background: AVATAR_PALETTE[hash % AVATAR_PALETTE.length] }
}

function FriendsView() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('active')
  const [username, setUsername] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [shareQrOpen, setShareQrOpen] = useState(false)

  const [friends, setFriends] = useState<Friend[]>([])
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])

  useEffect(() => {
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      const storedContacts = db.getContacts().filter((c) => c.username !== 'Vexta - Global Message')

      const activeFriends: Friend[] = storedContacts
        .filter((c) => c.status === 'active' || !c.status)
        .map((c) => ({
          id: c.username,
          name: c.username,
          handle: `@${c.username.toLowerCase()}`,
          fingerprint: '4A8F : 9B1C : 2E3D : 8F7A',
          status: 'online',
          online: true,
        }))
      setFriends(activeFriends)

      const pendingContacts: PendingRequest[] = storedContacts
        .filter((c) => c.status === 'pending')
        .map((c) => ({
          id: c.username,
          name: c.username,
          handle: `@${c.username.toLowerCase()}`,
          direction: c.direction === 'incoming' ? 'incoming' : 'outgoing',
          time: 'Pending',
        }))
      setPendingRequests(pendingContacts)
    }

    bridgeClient.listFriendRequests()
    bridgeClient.listFriends()

    const unsubRequests = bridgeClient.subscribeFriendRequests((remoteReqs) => {
      if (!Array.isArray(remoteReqs)) return
      const activeUser = localStorage.getItem('vexta_active_user') || ''
      const mapped: PendingRequest[] = remoteReqs.map((req) => {
        const isIncoming =
          req.recipient === activeUser ||
          (req.recipient && req.recipient.toLowerCase() === activeUser.toLowerCase())
        const otherUser = isIncoming ? req.sender : req.recipient
        return {
          id: String(req.id),
          name: otherUser,
          handle: `@${otherUser.toLowerCase()}`,
          direction: isIncoming ? 'incoming' : 'outgoing',
          time: 'Pending',
        }
      })
      setPendingRequests(mapped)
    })

    const unsubFriends = bridgeClient.subscribeFriends((remoteFriends) => {
      if (!Array.isArray(remoteFriends)) return
      const mapped: Friend[] = remoteFriends.map((fName) => ({
        id: fName,
        name: fName,
        handle: `@${fName.toLowerCase()}`,
        fingerprint: '7F3A : 91B2 : C4E5 : 7091',
        status: 'online',
        online: true,
      }))
      setFriends(mapped)
    })

    const handleServerError = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>
      if (customEvent.detail?.message) {
        showToast(customEvent.detail.message)
      }
    }
    window.addEventListener('vexta_server_error', handleServerError)

    return () => {
      unsubRequests()
      unsubFriends()
      window.removeEventListener('vexta_server_error', handleServerError)
    }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function acceptRequest(id: string, name: string) {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id))
    setFriends((prev) => [
      ...prev,
      {
        id,
        name,
        handle: `@${name.toLowerCase()}`,
        fingerprint: '7F3A : 91B2 : C4E5 : 7091',
        status: 'online',
        online: true,
      },
    ])
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.addContact({
        username: name,
        public_key: 'PENDING_KEY',
        display_name: name,
        created_at: new Date().toISOString(),
        status: 'active',
      })
      bridgeClient.acceptFriendRequest(id)
      window.dispatchEvent(new CustomEvent('vexta_friend_request_updated'))
      window.dispatchEvent(new CustomEvent('vexta_roster_updated'))
    }
    showToast(`Accepted friend request from ${name}`)
  }

  function rejectRequest(id: string, name: string) {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id))
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.removeContact(name)
      bridgeClient.rejectFriendRequest(id)
      window.dispatchEvent(new CustomEvent('vexta_friend_request_updated'))
      window.dispatchEvent(new CustomEvent('vexta_roster_updated'))
    }
    showToast(`Rejected friend request from ${name}`)
  }

  function removeFriend(id: string, name: string) {
    setFriends((prev) => prev.filter((f) => f.id !== id))
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.removeContact(name)
      db.clearMessages(name)
      bridgeClient.removeFriend(name)
      window.dispatchEvent(new CustomEvent('vexta_contact_removed', { detail: { name } }))
      window.dispatchEvent(new CustomEvent('vexta_roster_updated'))
    }
    showToast(`Removed ${name} from contacts`)
  }

  function handleAddFriend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = username.trim()
    if (!trimmed) return

    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const normTrimmed = trimmed.replace(/^@/, '').toLowerCase()
      const normActive = activeUser.replace(/^@/, '').toLowerCase()
      if (normTrimmed === normActive) {
        showToast('Cannot send friend request to yourself')
        return
      }

      const db = new VextaDatabaseManager(activeUser)
      db.addContact({
        username: trimmed,
        public_key: 'PENDING_KEY',
        display_name: trimmed,
        created_at: new Date().toISOString(),
        status: 'pending',
      })
      bridgeClient.sendFriendRequest(trimmed)
      window.dispatchEvent(new CustomEvent('vexta_friend_request_updated'))
      window.dispatchEvent(new CustomEvent('vexta_roster_updated'))
    }

    showToast(`Friend request sent to ${trimmed}`)
    setPendingRequests((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name: trimmed,
        handle: `@${trimmed.toLowerCase()}`,
        direction: 'outgoing',
        time: 'Just now',
      },
    ])
    setUsername('')
  }

  const myIdentityUri = 'vexta://identity/Guest?fingerprint=4A8F9B1C2E3D8F7A'

  return (
    <div className="screen-pane friends-screen">
      {/* Toast Notice */}
      {toast && (
        <div className="info-toast" role="status">
          <ShieldIcon size={14} />
          <span>{toast}</span>
        </div>
      )}

      <div className="friends-header">
        <h1>Friends &amp; Contacts</h1>
        <p className="friends-subtitle">
          Manage your trusted end-to-end encrypted contacts and pending identity keys
        </p>
      </div>

      <div className="tabs friends-tabs">
        <button
          type="button"
          className={`tab ${tab === 'active' ? 'active' : ''}`}
          onClick={() => setTab('active')}
        >
          <PeopleIcon size={14} />
          <span>Active Friends ({friends.length})</span>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
        >
          <UserPlusIcon size={14} />
          <span>Requests ({pendingRequests.length})</span>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'add' ? 'active' : ''}`}
          onClick={() => setTab('add')}
        >
          <PlusIcon size={14} />
          <span>Add Friend</span>
        </button>
      </div>

      {/* TAB 1: ACTIVE FRIENDS */}
      {tab === 'active' && (
        <div className="friends-grid">
          {friends.map((f) => (
            <div key={f.id} className="info-card friend-card">
              <div className="friend-card-top">
                <div className="friend-avatar" style={avatarStyle(f.name)}>
                  {f.name.charAt(0).toUpperCase()}
                  {f.online && <span className="presence-dot" />}
                </div>
                <div className="friend-meta">
                  <span className="friend-name">{f.name}</span>
                  <span className="friend-handle">{f.handle}</span>
                </div>
                <span className={`trust-tag ${f.online ? 'verified' : 'unverified'}`}>
                  {f.online ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="friend-fingerprint-box">
                <KeyIcon size={12} className="accent-icon" />
                <span className="friend-fp">{f.fingerprint}</span>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(`/chat/${encodeURIComponent(f.name)}`)}
                >
                  Start Chat
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate(`/chat/${encodeURIComponent(f.name)}/info`)}
                >
                  Security Info
                </button>
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => removeFriend(f.id, f.name)}
                  title="Remove Contact"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            </div>
          ))}

          {friends.length === 0 && (
            <EmptyState
              icon={<PeopleIcon size={32} />}
              title="No Active Contacts"
              description="Add a contact using their username or identity key to start end-to-end encrypted messaging."
              action={{
                label: 'Add Friend',
                onClick: () => setTab('add'),
              }}
            />
          )}
        </div>
      )}

      {/* TAB 2: PENDING REQUESTS */}
      {tab === 'pending' && (
        <div className="pending-list">
          {pendingRequests.map((r) => (
            <div key={r.id} className="info-card pending-card">
              <div className="pending-avatar" style={avatarStyle(r.name)}>
                {r.name.charAt(0).toUpperCase()}
              </div>

              <div className="pending-info">
                <div className="pending-name-row">
                  <span className="pending-name">{r.name}</span>
                  <span className="pending-direction">
                    {r.direction === 'incoming' ? 'Incoming Request' : 'Outgoing Request'}
                  </span>
                </div>
                <span className="pending-handle">{r.handle} \u00B7 {r.time}</span>
              </div>

              <div className="card-actions">
                {r.direction === 'incoming' ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => acceptRequest(r.id, r.name)}
                    >
                      <CheckIcon size={14} />
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn-danger-outline"
                      onClick={() => rejectRequest(r.id, r.name)}
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => rejectRequest(r.id, r.name)}
                  >
                    Cancel Request
                  </button>
                )}
              </div>
            </div>
          ))}

          {pendingRequests.length === 0 && (
            <EmptyState
              icon={<UserPlusIcon size={32} />}
              title="No Pending Requests"
              description="You have no incoming or outgoing friend authorization requests."
            />
          )}
        </div>
      )}

      {/* TAB 3: ADD FRIEND & SHARE PROFILE */}
      {tab === 'add' && (
        <div className="add-friend-layout">
          {/* Add Form Card */}
          <div className="info-card">
            <div className="card-header">
              <div className="card-title">
                <UserPlusIcon size={16} className="accent-icon" />
                <h3>Add Friend by Identity</h3>
              </div>
            </div>
            <p className="card-desc">
              Enter a Vexta username or paste an identity URI string (`vexta://identity/...`) to initiate an encrypted handshake request.
            </p>

            <form onSubmit={handleAddFriend} className="settings-form">
              <div className="form-group">
                <label className="field-label" htmlFor="add-username-input">
                  Username / Identity URI String
                </label>
                <input
                  id="add-username-input"
                  className="modal-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. NeonPriest or vexta://identity/..."
                  autoFocus
                />
              </div>

              <button type="submit" className="btn-primary" disabled={!username.trim()}>
                <UserPlusIcon size={14} />
                Send Friend Request
              </button>
            </form>
          </div>

          {/* Personal Share Profile Card */}
          <div className="info-card share-profile-card">
            <div className="card-header">
              <div className="card-title">
                <QrCodeIcon size={16} className="accent-icon" />
                <h3>Your Share Profile</h3>
              </div>
            </div>
            <p className="card-desc">
              Share your public identity key URI or QR code with friends to connect instantly over the bridge relay.
            </p>

            <div className="share-identity-box">
              <span className="share-uri">{myIdentityUri}</span>
            </div>

            <div className="card-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(myIdentityUri).catch(() => {})
                  showToast('Identity URI copied to clipboard')
                }}
              >
                <CopyIcon size={14} />
                Copy Identity Link
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShareQrOpen(true)}
              >
                <QrCodeIcon size={14} />
                Show Share QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share QR Modal */}
      {shareQrOpen && (
        <div className="modal-backdrop" onClick={() => setShareQrOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <QrCodeIcon size={20} />
            </div>
            <h2 className="modal-title">Your Profile QR Code</h2>
            <p className="modal-note">
              Scan from mobile or send this identity payload to add you on Vexta.
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
                  [80, 20], [90, 20], [110, 20], [80, 40], [100, 40],
                  [80, 70], [90, 80], [120, 80], [150, 80],
                  [20, 90], [40, 100], [80, 100], [110, 100], [140, 100],
                  [30, 110], [90, 120], [120, 110], [150, 120]
                ].map(([x, y], idx) => (
                  <rect key={idx} x={x} y={y} width="10" height="10" fill="#39ff14" rx="1" />
                ))}
              </svg>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShareQrOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FriendsView
