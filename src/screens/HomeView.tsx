import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GearIcon,
  GroupIcon,
  MegaphoneIcon,
  PeopleIcon,
  PlusIcon,
  ServerIcon,
  ShieldIcon,
} from '../components/icons'
import { VextaDatabaseManager } from '../crypto/db_manager'
import { bridgeClient, type BridgeStatus } from '../network/bridge'

function HomeView() {
  const navigate = useNavigate()
  const activeUser = localStorage.getItem('vexta_active_user') || ''
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(bridgeClient.getStatus())
  const [recentContacts, setRecentContacts] = useState<Array<{ name: string; isGroup?: boolean }>>([])

  useEffect(() => {
    setBridgeStatus(bridgeClient.getStatus())

    const unsub = bridgeClient.subscribeStatus(setBridgeStatus)

    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      const contacts = db
        .getContacts()
        .filter((c) => c.username !== 'Vexta - Global Message')
        .slice(0, 4)
        .map((c) => ({ name: c.username }))
      const groups = db.getGroups().slice(0, 2).map((g) => ({ name: g.group_name, isGroup: true }))
      setRecentContacts([...groups, ...contacts].slice(0, 4))
    }

    return () => unsub()
  }, [activeUser])

  const getStatusText = (status: BridgeStatus) => {
    switch (status) {
      case 'connected':
        return 'CONNECTED'
      case 'connecting':
        return 'CONNECTING...'
      case 'auth_failed':
        return 'AUTH FAILED'
      default:
        return 'DISCONNECTED'
    }
  }

  return (
    <div className="home-dashboard">
      {/* Background Cyber Ambient Glow */}
      <div className="home-hero-glow" aria-hidden="true" />

      {/* Simplified Hero Card */}
      <div className="home-hero-card">
        <div className="home-brand-badge">
          <img src="./icon.png" alt="Vexta" className="home-hero-logo" width={56} height={56} />
          <div className="home-brand-meta">
            <span className="mono-label home-hero-eyebrow">Zero-Knowledge Messenger</span>
            <h1 className="home-title">
              VEX<span>TA</span> PROTOCOL
            </h1>
            <p className="home-subtitle">
              End-to-End Encrypted Communication
              {activeUser && <span className="home-user-tag"> — @{activeUser}</span>}
            </p>
          </div>
        </div>

        {/* Prominent Bridge Relay Status Display */}
        <div className="home-relay-card">
          <div className="relay-header">
            <div className="relay-title">
              <ServerIcon size={18} className="accent-icon" />
              <h3>Bridge Connection</h3>
            </div>
            <span className={`relay-status-badge ${bridgeStatus}`}>
              <span className="status-dot" />
              {getStatusText(bridgeStatus)}
            </span>
          </div>

          <div className="relay-specs-row">
            <div className="relay-spec-pill">
              <ShieldIcon size={12} />
              <span>TOFU Active</span>
            </div>
            <div className="relay-spec-pill">
              <span>Cipher: AES-256-GCM</span>
            </div>
            <div className="relay-spec-pill">
              <span>Ed25519 / PSS</span>
            </div>
          </div>
        </div>

        {/* Action Shortcuts */}
        <div className="home-actions-row">
          <Link to="/friends" className="btn-primary">
            <PeopleIcon size={14} />
            Friends &amp; Requests
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/chat/Vexta%20-%20Global%20Message')}
          >
            <MegaphoneIcon size={14} />
            Global Announcements
          </button>
          <Link to="/settings" className="btn-secondary">
            <GearIcon size={14} />
            Vault Settings
          </Link>
        </div>
      </div>

      {/* Simplified Recent Activity */}
      {recentContacts.length > 0 && (
        <div className="info-card home-quick-card">
          <div className="card-header">
            <div className="card-title">
              <GroupIcon size={16} className="accent-icon" />
              <h3>Recent Conversations</h3>
            </div>
          </div>

          <div className="quick-chats-list">
            {recentContacts.map((c) => (
              <button
                key={c.name}
                type="button"
                className="quick-chat-item"
                onClick={() =>
                  navigate(
                    c.isGroup
                      ? `/chat/group_${encodeURIComponent(c.name)}`
                      : `/chat/${encodeURIComponent(c.name)}`,
                  )
                }
              >
                <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="quick-chat-meta">
                  <span className="quick-chat-name">{c.name}</span>
                  <span className="quick-chat-sub">
                    {c.isGroup ? 'E2EE Group Channel' : 'Direct Message'}
                  </span>
                </div>
                <PlusIcon size={14} style={{ transform: 'rotate(45deg)', opacity: 0.5 }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeView

