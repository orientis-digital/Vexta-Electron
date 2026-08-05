import { Link, useNavigate } from 'react-router-dom'
import {
  ChatPlusIcon,
  GearIcon,
  GroupIcon,
  PlusIcon,
  ShieldIcon,
} from '../components/icons'

function HomeView() {
  const navigate = useNavigate()

  return (
    <div className="home-dashboard">
      {/* Background Cyber Ambient Glow */}
      <div className="home-hero-glow" aria-hidden="true" />

      {/* Hero Welcome Card */}
      <div className="home-hero-card">
        <div className="home-brand-badge">
          <img src="./icon.png" alt="Vexta" className="home-hero-logo" width={64} height={64} />
          <div className="home-brand-meta">
            <span className="mono-label home-hero-eyebrow">Zero-Knowledge messenger</span>
            <h1 className="home-title">
              VEX<span>TA</span> PROTOCOL
            </h1>
            <p className="home-subtitle">
              End-to-end encrypted messaging over the Vexta Network relay. All keys remain encrypted on your device.
            </p>
          </div>
        </div>

        <div className="home-actions-row">
          <Link to="/friends" className="btn-primary">
            <PlusIcon size={14} />
            Add Friend
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/chat/group_Ghost%20Protocol')}
          >
            <GroupIcon size={14} />
            Join Ghost Protocol
          </button>
          <Link to="/settings" className="btn-secondary">
            <GearIcon size={14} />
            Vault Settings
          </Link>
        </div>
      </div>

      {/* Telemetry & Feature Grid */}
      <div className="home-feature-grid">
        <div className="info-card home-telemetry-card">
          <div className="card-header">
            <div className="card-title">
              <ShieldIcon size={16} className="accent-icon" />
              <h3>Security Status</h3>
            </div>
            <span className="trust-tag verified">TOFU Active</span>
          </div>

          <div className="spec-grid">
            <div className="spec-item">
              <span className="spec-label">Identity Key</span>
              <span className="spec-value">RSA-4096 / PSS</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">Symmetric Cipher</span>
              <span className="spec-value">AES-256-GCM</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">Vault KDF</span>
              <span className="spec-value">Argon2id (64 MiB)</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">Bridge Relay</span>
              <span className="spec-value">wss://vexta-api.nexusec.space</span>
            </div>
          </div>
        </div>

        {/* Quick Launch Card */}
        <div className="info-card home-quick-card">
          <div className="card-header">
            <div className="card-title">
              <ChatPlusIcon size={16} className="accent-icon" />
              <h3>Recent Conversations</h3>
            </div>
          </div>

          <div className="quick-chats-list">
            <div className="empty-friends-card" style={{ padding: '24px' }}>
              <p style={{ fontSize: '12px' }}>
                No active conversations yet. Add a contact or create a group channel to get started.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomeView
