import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { VextaDatabaseManager } from '../crypto/db_manager'
import { bridgeClient } from '../network/bridge'
import { generateFingerprintFromKey } from '../crypto/identity'
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
import { QRCodeSVG } from '../components/QRCode'
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
    const reloadLocalRoster = () => {
      const activeUser = localStorage.getItem('vexta_active_user') || ''
      if (activeUser) {
        const db = new VextaDatabaseManager(activeUser)
        const storedContacts = db.getContacts().filter((c) => c.username !== 'Vexta - Global Message')

        const activeFriends: Friend[] = storedContacts
          .filter((c) => c.status === 'active' || !c.status)
          .map((c) => {
            const lastActiveStr = db.getContactLastActive(c.username)
            const lastActiveTime = lastActiveStr ? new Date(lastActiveStr).getTime() : 0
            const isOnline = !isNaN(lastActiveTime) && lastActiveTime > 0 && Date.now() - lastActiveTime < 2 * 60 * 1000

            return {
              id: c.username,
              name: c.username,
              handle: `@${c.username.toLowerCase()}`,
              fingerprint: generateFingerprintFromKey(c.public_key || c.username),
              status: isOnline ? 'online' : 'offline',
              online: isOnline,
            }
          })
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
    }

    reloadLocalRoster()

    try {
      bridgeClient.listFriendRequests()
      bridgeClient.listFriends()
    } catch {}

    const unsubRequests = bridgeClient.subscribeFriendRequests((remoteReqs) => {
      if (!Array.isArray(remoteReqs)) return
      const activeUser = localStorage.getItem('vexta_active_user') || ''
      if (!activeUser) return

      const db = new VextaDatabaseManager(activeUser)
      const localPending = db.getContacts().filter((c) => c.status === 'pending')

      const mapped: PendingRequest[] = [
        ...localPending.map((c) => ({
          id: c.username,
          name: c.username,
          handle: `@${c.username.toLowerCase()}`,
          direction: (c.direction === 'incoming' ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
          time: 'Pending',
        })),
        ...remoteReqs.map((req) => {
          const isIncoming =
            req.recipient === activeUser ||
            (req.recipient && req.recipient.toLowerCase() === activeUser.toLowerCase())
          const otherUser = isIncoming ? req.sender : req.recipient
          return {
            id: String(req.id),
            name: otherUser,
            handle: `@${otherUser.toLowerCase()}`,
            direction: isIncoming ? ('incoming' as const) : ('outgoing' as const),
            time: 'Pending',
          }
        }),
      ]
      const uniqueReqs = mapped.filter(
        (r, idx, arr) => arr.findIndex((x) => x.name.toLowerCase() === r.name.toLowerCase()) === idx,
      )
      setPendingRequests(uniqueReqs)
    })

    const unsubFriends = bridgeClient.subscribeFriends((remoteFriends) => {
      if (!Array.isArray(remoteFriends)) return
      const activeUser = localStorage.getItem('vexta_active_user') || ''
      if (!activeUser) return

      const db = new VextaDatabaseManager(activeUser)
      for (const fName of remoteFriends) {
        if (typeof fName === 'string' && fName.trim() && fName !== 'Vexta - Global Message') {
          const clean = fName.trim().replace(/^@/, '')
          const exists = db.getContacts().some((c) => c.username.toLowerCase() === clean.toLowerCase())
          if (!exists) {
            db.addContact({
              username: clean,
              public_key: clean,
              created_at: new Date().toISOString(),
              status: 'active',
            })
          }
        }
      }
      reloadLocalRoster()
    })

    const handleServerError = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>
      if (customEvent.detail?.message) {
        showToast(customEvent.detail.message)
      }
    }
    window.addEventListener('vexta_server_error', handleServerError)
    window.addEventListener('vexta_contacts_updated', reloadLocalRoster)

    return () => {
      unsubRequests()
      unsubFriends()
      window.removeEventListener('vexta_server_error', handleServerError)
      window.removeEventListener('vexta_contacts_updated', reloadLocalRoster)
    }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function acceptRequest(id: string, name: string) {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id && r.name !== name))
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.addContact({
        username: name,
        public_key: name,
        created_at: new Date().toISOString(),
        status: 'active',
      })
      window.dispatchEvent(new CustomEvent('vexta_contacts_updated'))
    }
    bridgeClient.acceptFriendRequest(id)
    showToast(`Accepted friend request from ${name}`)
  }

  function rejectRequest(id: string, name: string) {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id && r.name !== name))
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.removeContact(name)
      window.dispatchEvent(new CustomEvent('vexta_contacts_updated'))
    }
    bridgeClient.rejectFriendRequest(id)
    showToast(`Rejected friend request from ${name}`)
  }

  function removeFriend(id: string, name: string) {
    setFriends((prev) => prev.filter((f) => f.id !== id && f.name !== name))
    const activeUser = localStorage.getItem('vexta_active_user')
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.removeContact(name)
      window.dispatchEvent(new CustomEvent('vexta_contacts_updated'))
    }
    bridgeClient.removeFriend(name)
    showToast(`Removed ${name} from friends`)
  }

  async function handleAddFriend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = username.trim()
    if (!trimmed) return

    const activeUser = localStorage.getItem('vexta_active_user')
    if (!activeUser) return

    const normTrimmed = trimmed.replace(/^@/, '').toLowerCase()
    const normActive = activeUser.replace(/^@/, '').toLowerCase()

    // 1. Failsafe: Prevent user from adding themselves
    if (normTrimmed === normActive) {
      showToast('Cannot send friend request to yourself')
      return
    }

    // 2. Network Check: Verify recipient user exists on the Vexta Bridge network
    try {
      const httpBase = bridgeClient.getUrl().replace(/^ws/i, 'http').replace(/\/ws\/.*$/i, '').replace(/\/$/, '')
      const checkRes = await fetch(`${httpBase}/api/check-account/${encodeURIComponent(normTrimmed)}`)
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (!checkData.exists) {
          showToast(`User @${normTrimmed} does not exist on Vexta network`)
          return
        }
      }
    } catch (err) {
      console.warn('[FriendsView] Account check error:', err)
    }

    const db = new VextaDatabaseManager(activeUser)
    db.addContact({
      username: normTrimmed,
      public_key: 'PENDING_KEY',
      display_name: normTrimmed,
      created_at: new Date().toISOString(),
      status: 'pending',
    })
    bridgeClient.sendFriendRequest(normTrimmed)
    window.dispatchEvent(new CustomEvent('vexta_friend_request_updated'))
    window.dispatchEvent(new CustomEvent('vexta_roster_updated'))

    showToast(`Friend request sent to @${normTrimmed}`)
    setPendingRequests((prev) => [
      ...prev.filter((r) => r.name.toLowerCase() !== normTrimmed),
      {
        id: Date.now().toString(),
        name: normTrimmed,
        handle: `@${normTrimmed}`,
        direction: 'outgoing',
        time: 'Just now',
      },
    ])
    setUsername('')
  }

  const activeUser = localStorage.getItem('vexta_active_user') || 'User'
  const myFingerprintRaw = generateFingerprintFromKey(activeUser).replace(/[: ]/g, '')
  const myIdentityUri = `vexta://identity/${activeUser}?fingerprint=${myFingerprintRaw}`

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
          <span>Friend List ({friends.length})</span>
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

      {/* TAB 1: FRIEND LIST */}
      {tab === 'active' && (
        <div className="friends-grid">
          {friends.map((f) => (
            <div key={f.id} className="info-card friend-card">
              <div className="friend-card-top">
                <div className="friend-avatar" style={avatarStyle(f.name)}>
                  {f.name.charAt(0).toUpperCase()}
                  <span className={`presence-dot ${f.online ? 'online' : 'offline'}`} title={f.online ? 'Online' : 'Offline'} />
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

            <div className="qr-container" style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
              <QRCodeSVG
                value={myIdentityUri}
                size={200}
                fgColor="#39ff14"
                bgColor="#141414"
              />
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
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
