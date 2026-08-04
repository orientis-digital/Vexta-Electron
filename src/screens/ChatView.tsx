import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import ChatInfoView from './ChatInfoView'
import { bridgeClient } from '../network/bridge'
import { VextaDatabaseManager } from '../crypto/db_manager'
import {
  AttachIcon,
  CheckIcon,
  CloseIcon,
  ImageIcon,
  InfoIcon,
  LocationIcon,
  MicIcon,
  PeopleIcon,
  SendIcon,
  ShieldIcon,
  TimerIcon,
  VideoIcon,
} from '../components/icons'

type Attachment = { kind: 'file' | 'photo' | 'video'; name: string; size: string }
type AttachmentKind = Attachment['kind']
type AttachItemKind = AttachmentKind | 'contact' | 'location'

type Message = {
  id: number
  text?: string
  timestamp: string
  me: boolean
  sender?: string
  attachment?: Attachment
  voice?: { duration: string }
  timer?: string
}

const SAMPLE_MESSAGES: Message[] = []

const TIMER_OPTIONS = [
  { label: 'Off', value: null },
  { label: '5 seconds', value: '5s' },
  { label: '10 seconds', value: '10s' },
  { label: '1 minute', value: '1m' },
  { label: '1 hour', value: '1h' },
  { label: '1 day', value: '1d' },
] as const

const ATTACH_ITEMS: {
  kind: AttachItemKind
  label: string
  icon: React.ReactNode
  soon?: boolean
}[] = [
  { kind: 'file', label: 'Document', icon: <AttachIcon size={15} /> },
  { kind: 'photo', label: 'Photo', icon: <ImageIcon size={15} /> },
  { kind: 'video', label: 'Video', icon: <VideoIcon size={15} /> },
  { kind: 'contact', label: 'Contact', icon: <PeopleIcon size={15} />, soon: true },
  { kind: 'location', label: 'Location', icon: <LocationIcon size={15} />, soon: true },
] as const

const WAVE = [8, 14, 10, 18, 12, 20, 9, 15, 7, 16, 11, 13, 6, 12, 9, 17]

function isGroup(name: string) {
  return name.startsWith('group_')
}

function nowTimestamp() {
  return new Date().toTimeString().slice(0, 5)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function attachmentIcon(a: Attachment) {
  if (a.kind === 'photo') return <ImageIcon size={16} />
  if (a.kind === 'video') return <VideoIcon size={16} />
  return <AttachIcon size={16} />
}

function attachmentLabel(a: Attachment) {
  if (a.kind === 'photo') return 'Image'
  if (a.kind === 'video') return 'Video'
  return 'Document'
}

type ChatViewProps = {
  showInfo?: boolean
}

function ChatView({ showInfo = false }: ChatViewProps) {
  const { chatId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const infoOpen = showInfo || location.pathname.endsWith('/info')

  const isGlobal = chatId === 'Vexta - Global Message'
  const name = isGroup(chatId) ? chatId.slice(6) : chatId
  const subtitle = isGlobal
    ? 'Official Announcement Channel'
    : isGroup(chatId)
      ? 'E2EE Group Chat'
      : 'Zero-Knowledge Channel'

  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [timer, setTimer] = useState<string | null>(null)
  const [menu, setMenu] = useState<'attach' | 'timer' | null>(null)
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [pendingKind, setPendingKind] = useState<Attachment['kind']>('file')

  const nextId = useRef(SAMPLE_MESSAGES.length + 1)
  const listRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && name) {
      const db = new VextaDatabaseManager(activeUser)
      const dbMsgs = db.getMessages(name)
      const formatted: Message[] = dbMsgs.map((m, idx) => ({
        id: idx + 1,
        text: m.ciphertext,
        timestamp: m.timestamp,
        me: m.sender === activeUser,
        sender: m.sender,
      }))
      setMessages(formatted)
    } else {
      setMessages([])
    }
    setDraft('')
    setAttachment(null)
    setTimer(null)
    setMenu(null)
    setRecording(false)
    setRecSeconds(0)
  }, [chatId, name])

  useEffect(() => {
    const unsubscribe = bridgeClient.subscribeMessages((msg) => {
      const activeUser = localStorage.getItem('vexta_active_user') || ''
      if (msg.sender === name || msg.recipient === name) {
        let text = msg.wire_blob
        try {
          text = atob(msg.wire_blob)
        } catch {}
        setMessages((prev) => [
          ...prev,
          {
            id: prev.length + 1,
            text,
            timestamp: msg.timestamp,
            me: msg.sender === activeUser,
            sender: msg.sender,
          },
        ])
      }
    })
    return unsubscribe
  }, [name])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setRecSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  function openPicker(kind: AttachItemKind) {
    if (kind === 'contact' || kind === 'location') return
    setPendingKind(kind)
    const input = fileRef.current
    if (!input) return
    input.accept = kind === 'photo' ? 'image/*' : kind === 'video' ? 'video/*' : ''
    input.value = ''
    input.click()
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setAttachment({ kind: pendingKind, name: file.name, size: formatBytes(file.size) })
    }
    setMenu(null)
  }

  function send() {
    const text = draft.trim()
    if (!text && !attachment) return

    // Relay ciphertext blob over live WebSocket connection
    bridgeClient.sendBlindMessage(name, btoa(text || ''))

    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && (text || attachment)) {
      try {
        const db = new VextaDatabaseManager(activeUser)
        db.saveMessage({
          sender: activeUser,
          recipient: name,
          ciphertext: text || attachment?.name || 'Attachment',
          timestamp: new Date().toISOString(),
          is_read: 1,
        })
      } catch (e) {
        console.warn('[Vexta DB] Error saving outbound message:', e)
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        id: nextId.current++,
        text: text || undefined,
        timestamp: nowTimestamp(),
        me: true,
        attachment: attachment || undefined,
        timer: timer || undefined,
      },
    ])
    setDraft('')
    setAttachment(null)
    const field = fieldRef.current
    if (field) {
      field.style.height = 'auto'
      field.focus()
    }
  }

  function sendVoice() {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId.current++,
        timestamp: nowTimestamp(),
        me: true,
        voice: { duration: formatDuration(recSeconds) },
        timer: timer || undefined,
      },
    ])
    setRecording(false)
    setRecSeconds(0)
  }

  function startRec() {
    setRecSeconds(0)
    setRecording(true)
  }

  function cancelRec() {
    setRecording(false)
    setRecSeconds(0)
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  function toggleInfo() {
    if (infoOpen) {
      navigate(`/chat/${encodeURIComponent(chatId)}`)
    } else {
      navigate(`/chat/${encodeURIComponent(chatId)}/info`)
    }
  }

  const sendDisabled = isGlobal || (!draft.trim() && !attachment && !recording)

  return (
    <div className="chat-layout-wrapper">
      <div className="chat wallpaper-default">
        <header className="chat-header">
          <span className="avatar">
            {isGlobal
              ? '\u{1F4E2}'
              : isGroup(chatId)
                ? '\u{1F465}'
                : name.charAt(0).toUpperCase()}
          </span>
          <span className="chat-title">
            <span className="chat-name">{name}</span>
            <span className="chat-sub">{subtitle}</span>
          </span>
          <button
            type="button"
            className={`icon-btn ${infoOpen ? 'active' : ''}`}
            title="Chat info"
            onClick={toggleInfo}
          >
            <InfoIcon size={17} />
          </button>
        </header>

      <div className="messages" ref={listRef}>
        <div className="date-sep">
          <span>Today</span>
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`msg-row ${m.me ? 'me' : ''}`}>
            <div className={`bubble ${m.me ? 'outgoing' : 'incoming'}`}>
              {!m.me && <span className="sender">{m.sender}</span>}
              {m.voice ? (
                <div className="voice-msg">
                  <span className="voice-play">{'\u25B6'}</span>
                  <span className="voice-wave" aria-hidden="true">
                    {WAVE.map((h, i) => (
                      <i key={i} style={{ height: `${h}px` }} />
                    ))}
                  </span>
                  <span className="voice-dur">{m.voice.duration}</span>
                </div>
              ) : (
                <>
                  {m.attachment && (
                    <div className="file-card">
                      <span className="file-icon">{attachmentIcon(m.attachment)}</span>
                      <span className="file-meta">
                        <b>{m.attachment.name}</b>
                        <small>
                          {attachmentLabel(m.attachment)} &middot; {m.attachment.size}
                        </small>
                      </span>
                    </div>
                  )}
                  {m.text && <span className="body">{m.text}</span>}
                </>
              )}
              <span className="meta">
                {m.me && <span className="check">{'\u2713\u2713'}</span>}
                {m.timer && <span className="timer">{'\u23F1'}</span>}
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="composer-wrap">
        {attachment && (
          <div className="attach-chip">
            <span className="attach-chip-icon">{attachmentIcon(attachment)}</span>
            <span className="attach-chip-meta">
              <b>{attachment.name}</b>
              <small>
                {attachmentLabel(attachment)} &middot; {attachment.size}
              </small>
            </span>
            <button
              type="button"
              className="attach-chip-x"
              onClick={() => setAttachment(null)}
              aria-label="Remove attachment"
            >
              {'\u00D7'}
            </button>
          </div>
        )}

        <div className="composer-row">
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            {recording ? (
              <span className="rec-bar">
                <span className="rec-dot" />
                <span className="rec-timer">{formatDuration(recSeconds)}</span>
                <span className="rec-hint">Recording</span>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  title="Attach"
                  disabled={isGlobal}
                  onClick={() => setMenu(menu === 'attach' ? null : 'attach')}
                >
                  <AttachIcon size={18} />
                </button>
                <textarea
                  ref={fieldRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    autoGrow(e.target)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder={
                    isGlobal
                      ? 'System channel — announcements only'
                      : `Type a message${isGroup(chatId) ? ' to group' : ''}...`
                  }
                  disabled={isGlobal}
                  rows={1}
                  aria-label="Message"
                />
                <button
                  type="button"
                  className={`icon-btn timer-btn ${timer ? 'on' : ''}`}
                  title="Disappearing messages"
                  disabled={isGlobal}
                  onClick={() => setMenu(menu === 'timer' ? null : 'timer')}
                >
                  <TimerIcon size={17} />
                  {timer && <span className="timer-badge">{timer}</span>}
                </button>
              </>
            )}
          </form>

          <div className="composer-actions">
            <button
              type="button"
              className={`icon-btn ${recording ? 'rec-cancel' : ''}`}
              title={recording ? 'Cancel recording' : 'Voice message'}
              disabled={isGlobal}
              onClick={recording ? cancelRec : startRec}
            >
              {recording ? <CloseIcon size={18} /> : <MicIcon size={18} />}
            </button>
            <button
              type="button"
              className="send-btn"
              title={recording ? 'Send voice message' : 'Send'}
              disabled={sendDisabled}
              onClick={recording ? sendVoice : send}
            >
              {recording ? <CheckIcon size={17} /> : <SendIcon size={17} />}
            </button>
          </div>
        </div>

        <p className="chat-input-hint">
          <ShieldIcon size={10} />
          End-to-end encrypted
          <span aria-hidden="true">&middot;</span>
          {timer ? (
            <>
              Disappearing messages: <b>{timer}</b>
            </>
          ) : (
            <>
              Enter to send <span aria-hidden="true">&middot;</span> Shift+Enter for new line
            </>
          )}
        </p>

        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={onFilePicked}
        />

        {menu === 'attach' && (
          <>
            <div className="menu-backdrop" onClick={() => setMenu(null)} />
            <div className="menu attach">
              {ATTACH_ITEMS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  className="menu-item"
                  disabled={item.soon}
                  onClick={() => openPicker(item.kind)}
                >
                  {item.icon}
                  {item.label}
                  {item.soon && <span className="menu-note">soon</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {menu === 'timer' && (
          <>
            <div className="menu-backdrop" onClick={() => setMenu(null)} />
            <div className="menu timer">
              {TIMER_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setTimer(opt.value)
                    setMenu(null)
                  }}
                >
                  {opt.label}
                  <span className="menu-check">{timer === opt.value ? '\u2713' : ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>

    <aside className={`chat-info-drawer ${infoOpen ? 'open' : ''}`}>
      <ChatInfoView
        chatId={chatId}
        onClose={() => navigate(`/chat/${encodeURIComponent(chatId)}`)}
      />
    </aside>
  </div>
)
}

export default ChatView
