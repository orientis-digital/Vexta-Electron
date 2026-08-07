import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import ChatInfoView from './ChatInfoView'
import { bridgeClient, cleanDecodePayload } from '../network/bridge'
import { base64ToUtf8, isControlMessage, utf8ToBase64 } from '../network/codec'
import { webrtcManager } from '../network/webrtc'
import { VextaDatabaseManager } from '../crypto/db_manager'
import {
  encryptFileChunk,
  generateFileKey,
  saveMediaToDownloads,
  sliceFile,
  stripFileMetadata,
} from '../crypto/file_transfer'
import {
  AttachIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  ImageIcon,
  InfoIcon,
  LocationIcon,
  MicIcon,
  PeopleIcon,
  PhoneOffIcon,
  PinIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
  SmileIcon,
  ThreeDotsIcon,
  TimerIcon,
  VideoIcon,
} from '../components/icons'
import { MarkdownMessage } from '../components/MarkdownMessage'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { AudioPlayer } from '../components/AudioPlayer'
import { MediaLightbox } from '../components/MediaLightbox'
import type { LightboxItem } from '../components/MediaLightbox'

import { formatLastActive } from '../network/presence'

type Attachment = { kind: 'file' | 'photo' | 'video'; name: string; size: string; url?: string }
type AttachmentKind = Attachment['kind']
type AttachItemKind = AttachmentKind | 'contact' | 'location'

type Message = {
  id: number
  text?: string
  timestamp: string
  me: boolean
  sender?: string
  attachment?: Attachment
  voiceUrl?: string
  voiceDuration?: string
  timer?: string
  reactions?: string[]
  isSystem?: boolean
  replyTo?: { sender: string; text: string }
  rawDate?: string | number
  status?: 'sent' | 'delivered' | 'read'
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

const EMOJI_REACTIONS = ['❤️', '👍', '🔥', '😮', '😂', '🎉']

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

// ── Time-Gap Divider Helpers ─────────────────────────────
function parseMessageDate(m: Message): Date {
  if (m.rawDate) {
    const d = new Date(m.rawDate)
    if (!isNaN(d.getTime())) return d
  }
  const now = new Date()
  if (m.timestamp && typeof m.timestamp === 'string' && m.timestamp.includes(':')) {
    const [h, min] = m.timestamp.split(':').map(Number)
    if (!isNaN(h) && !isNaN(min)) {
      const d = new Date(now)
      d.setHours(h, min, 0, 0)
      return d
    }
  } else if (typeof m.timestamp === 'number') {
    const d = new Date(m.timestamp)
    if (!isNaN(d.getTime())) return d
  }
  return now
}

function shouldShowTimeDivider(prev: Message | null, curr: Message): boolean {
  if (!prev) return true
  const prevDate = parseMessageDate(prev)
  const currDate = parseMessageDate(curr)

  const isDiffDay = prevDate.toDateString() !== currDate.toDateString()
  const isBigGap = Math.abs(currDate.getTime() - prevDate.getTime()) >= 3600000 // 1 hour

  return isDiffDay || isBigGap
}

function formatTimeDivider(m: Message): string {
  const d = parseMessageDate(m)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) {
    return `TODAY AT ${timeStr}`
  }
  const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return `${dateStr.toUpperCase()} AT ${timeStr}`
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

  const [presenceText, setPresenceText] = useState<string>('')
  const [bridgeStatus, setBridgeStatus] = useState<string>('connected')
  const [pinnedText, setPinnedText] = useState<string | null>(null)
  const [matchIndex, setMatchIndex] = useState<number>(0)
  const subtitle = isGlobal
    ? 'Official Announcement Channel'
    : isGroup(chatId)
      ? 'E2EE Group Chat'
      : presenceText || 'Zero-Knowledge Channel'

  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [timer, setTimer] = useState<string | null>(null)
  const [menu, setMenu] = useState<'attach' | 'timer' | null>(null)
  const [recording, setRecording] = useState(false)
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null)
  const [pendingKind, setPendingKind] = useState<Attachment['kind']>('file')

  // UI Polish States
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [lightboxItems, setLightboxItems] = useState<LightboxItem[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<number | null>(null)
  const [activeMoreMenuMsgId, setActiveMoreMenuMsgId] = useState<number | null>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [chatTheme, setChatTheme] = useState<string>('cyber_neon')

  const nextId = useRef(SAMPLE_MESSAGES.length + 1)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMenu(null)
    setTimer(null)
    setRecording(false)
    setSearchOpen(false)
    setSearchQuery('')
    setReplyingTo(null)
  }, [chatId, name])

  useEffect(() => {
    return bridgeClient.subscribeStatus(setBridgeStatus)
  }, [])

  useEffect(() => {
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && name) {
      const db = new VextaDatabaseManager(activeUser)
      const savedTimer = db.getChatTimer(name)
      if (savedTimer) setTimer(savedTimer)

      const savedTheme = db.getChatTheme(name)
      if (savedTheme) setChatTheme(savedTheme)

      const savedPinned = db.getPinnedMessage(name)
      setPinnedText(savedPinned)

      const updatePresence = () => {
        if (!isGroup(chatId) && !isGlobal) {
          const globalPrivacy = db.getGlobalPresencePrivacy()
          const friendOverride = db.getFriendPresenceOverride(name)
          if (globalPrivacy !== 'nobody' && friendOverride !== false) {
            const lastActiveIso = db.getContactLastActive(name)
            setPresenceText(formatLastActive(lastActiveIso))
          } else {
            setPresenceText('Zero-Knowledge Channel')
          }
        }
      }

      updatePresence()
      const pInterval = setInterval(updatePresence, 5000)
      window.addEventListener('vexta_presence_updated', updatePresence)

      const dbMsgs = db.getMessages(name).filter((m) => {
        const text = m.ciphertext || ''
        if (
          text.includes('call_offer') ||
          text.includes('call_answer') ||
          text.includes('call_ice') ||
          text.includes('call_end') ||
          text.includes('file_init') ||
          text.includes('eyJ0eXBlIjoiY2Fsb') ||
          text.includes('TeyJ0eXBl') ||
          text.includes('8eyJ0eXBl')
        ) {
          return false
        }
        return true
      })
      const formatted: Message[] = dbMsgs.map((m, idx) => {
        const isMediaOnly = Boolean(m.voiceUrl || m.attachment)
        const isAutoLabel = m.ciphertext === m.attachment?.name || (m.ciphertext && m.ciphertext.startsWith('🎤 Voice note'))
        return {
          id: idx + 1,
          text: (isMediaOnly && isAutoLabel) ? undefined : m.ciphertext,
          timestamp: formatDisplayTime(m.timestamp),
          rawDate: m.timestamp,
          me: m.sender === activeUser,
          sender: m.sender,
          voiceUrl: m.voiceUrl,
          attachment: m.attachment,
        }
      })
      setMessages(formatted)

      const handleMessagesUpdated = (e: any) => {
        const detailName = e.detail?.name
        const detailChatId = e.detail?.chatId
        if (!detailName || detailName === name || detailName === chatId || detailChatId === chatId || detailChatId === name) {
          const freshDbMsgs = db.getMessages(name).filter((m) => {
            const text = m.ciphertext || ''
            if (
              text.includes('call_offer') ||
              text.includes('call_answer') ||
              text.includes('call_ice') ||
              text.includes('file_init') ||
              text.includes('eyJ0eXBlIjoiY2Fsb') ||
              text.includes('TeyJ0eXBl') ||
              text.includes('8eyJ0eXBl')
            ) {
              return false
            }
            return true
          })
          const freshFormatted: Message[] = freshDbMsgs.map((m, idx) => {
            const isMediaOnly = Boolean(m.voiceUrl || m.attachment)
            const isAutoLabel = m.ciphertext === m.attachment?.name || (m.ciphertext && m.ciphertext.startsWith('🎤 Voice note'))
            return {
              id: idx + 1,
              text: (isMediaOnly && isAutoLabel) ? undefined : m.ciphertext,
              timestamp: formatDisplayTime(m.timestamp),
              rawDate: m.timestamp,
              me: m.sender === activeUser,
              sender: m.sender,
              voiceUrl: m.voiceUrl,
              attachment: m.attachment,
            }
          })
          setMessages(freshFormatted)
        }
      }

      window.addEventListener('vexta_messages_updated', handleMessagesUpdated)

      return () => {
        clearInterval(pInterval)
        window.removeEventListener('vexta_presence_updated', updatePresence)
        window.removeEventListener('vexta_messages_updated', handleMessagesUpdated)
      }
    } else {
      setMessages([])
    }
  }, [name, chatId, isGlobal])

  useEffect(() => {
    const unsubscribe = bridgeClient.subscribeMessages((msg) => {
      const activeUser = localStorage.getItem('vexta_active_user') || ''
      const rawInput = msg.wire_blob || msg.ciphertext || (msg as any).body || ''
      const inner = cleanDecodePayload(rawInput)

      let text = rawInput
      try {
        if (msg.wire_blob) text = base64ToUtf8(msg.wire_blob)
        else if (msg.ciphertext) text = base64ToUtf8(msg.ciphertext)
        else if ((msg as any).body) text = base64ToUtf8((msg as any).body)
      } catch {
        text = rawInput
      }

      let msgSender = msg.sender
      let displayText = text

      if (inner && typeof inner === 'object') {
        if (inner.type === 'group_msg') {
          msgSender = `group_${inner.group_uuid}`
          displayText = inner.body || text
        } else if (
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
      } else if (isControlMessage(text) || isControlMessage(rawInput)) {
        return
      }

      const matchesTarget =
        msg.sender === name ||
        msg.recipient === name ||
        msgSender === name ||
        msgSender === chatId ||
        (isGroup(chatId) && inner?.group_uuid && chatId.includes(inner.group_uuid))

      if (matchesTarget) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            text: displayText,
            timestamp: formatDisplayTime(msg.timestamp),
            rawDate: msg.timestamp,
            me: msg.sender === activeUser,
            sender: msg.sender,
          },
        ])
      }
    })
    return unsubscribe
  }, [name, chatId])

  useEffect(() => {
    const handleCleared = (e: any) => {
      const cId = e.detail?.chatId
      const cName = e.detail?.name
      if (cId === chatId || cName === name || cId === name || cName === chatId) {
        setMessages([])
      }
    }
    window.addEventListener('vexta_messages_cleared', handleCleared)
    return () => window.removeEventListener('vexta_messages_cleared', handleCleared)
  }, [chatId, name])

  function openPicker(kind: AttachItemKind) {
    if (kind === 'contact' || kind === 'location') return
    setPendingKind(kind)
    setMenu(null)

    const input = fileInputRef.current
    if (!input) return

    if (kind === 'photo') input.accept = 'image/*'
    else if (kind === 'video') input.accept = 'video/*'
    else input.accept = '*/*'

    input.click()
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFileObj(file)
    setAttachment({
      kind: pendingKind,
      name: file.name,
      size: formatBytes(file.size),
      url: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined,
    })

    e.target.value = ''
  }

  // Drag & Drop File Handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isGlobal) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isGlobal) return

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const kind: AttachmentKind = file.type.startsWith('image/')
      ? 'photo'
      : file.type.startsWith('video/')
        ? 'video'
        : 'file'

    setSelectedFileObj(file)
    setPendingKind(kind)
    setAttachment({
      kind,
      name: file.name,
      size: formatBytes(file.size),
      url: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined,
    })
  }

  async function send() {
    const text = draft.trim()
    if (!text && !attachment) return

    const activeUser = localStorage.getItem('vexta_active_user') || ''

    if (isGroup(chatId)) {
      const db = new VextaDatabaseManager(activeUser)
      const members = db.getGroupMembers(name)
      bridgeClient.sendGroupMessage(name, members, text || attachment?.name || '')
    } else {
      bridgeClient.sendBlindMessage(name, utf8ToBase64(text || ''))
    }

    if (selectedFileObj) {
      try {
        const { cleanBlob, cleanFilename } = await stripFileMetadata(selectedFileObj)
        const fileKey = generateFileKey()
        const { chunks, fileHash } = await sliceFile(cleanBlob)
        const transferId = `tf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

        bridgeClient.sendFileInit(name, {
          transfer_id: transferId,
          filename: cleanFilename,
          file_size: cleanBlob.size,
          chunk_size: 128 * 1024,
          total_chunks: chunks.length,
          file_key: fileKey,
          file_hash: fileHash,
        })

        for (let i = 0; i < chunks.length; i++) {
          const encChunk = await encryptFileChunk(fileKey, chunks[i])
          bridgeClient.sendFileChunk(name, transferId, i, encChunk)
        }
      } catch (err) {
        console.warn('[Vexta File Transfer] Error encrypting/sending file:', err)
      }
    }

    if (activeUser && (text || attachment)) {
      try {
        const db = new VextaDatabaseManager(activeUser)
        db.saveMessage({
          sender: activeUser,
          recipient: name,
          ciphertext: text || attachment?.name || 'Attachment',
          timestamp: new Date().toISOString(),
          is_read: 1,
          timer: timer || undefined,
          voiceUrl: attachment && attachment.url && (attachment.kind as string) === 'audio' ? attachment.url : undefined,
          attachment: attachment || undefined,
        })
      } catch (e) {
        console.warn('[Vexta DB] Error saving outbound message:', e)
      }
    }

    const replySnippet = replyingTo
      ? {
          sender: replyingTo.me ? 'You' : replyingTo.sender || name,
          text: replyingTo.text || replyingTo.attachment?.name || 'Attachment',
        }
      : undefined

    setMessages((prev) => [
      ...prev,
      {
        id: nextId.current++,
        text: text || undefined,
        timestamp: nowTimestamp(),
        rawDate: new Date().toISOString(),
        me: true,
        attachment: attachment || undefined,
        timer: timer || undefined,
        replyTo: replySnippet,
      },
    ])

    setDraft('')
    setAttachment(null)
    setSelectedFileObj(null)
    setReplyingTo(null)
    window.dispatchEvent(new CustomEvent('vexta_messages_updated', { detail: { chatId, name } }))

    const field = fieldRef.current
    if (field) {
      field.style.height = 'auto'
      field.focus()
    }
  }

  // Send Audio Voice Note
  async function handleSendVoiceBlob(audioBlob: Blob) {
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    const voiceUrl = URL.createObjectURL(audioBlob)

    try {
      const fileKey = generateFileKey()
      const { chunks, fileHash } = await sliceFile(audioBlob)
      const transferId = `tf_voice_${Date.now()}`

      bridgeClient.sendFileInit(name, {
        transfer_id: transferId,
        filename: `voice_${Date.now()}.webm`,
        file_size: audioBlob.size,
        chunk_size: 128 * 1024,
        total_chunks: chunks.length,
        file_key: fileKey,
        file_hash: fileHash,
      })

      for (let i = 0; i < chunks.length; i++) {
        const encChunk = await encryptFileChunk(fileKey, chunks[i])
        bridgeClient.sendFileChunk(name, transferId, i, encChunk)
      }

      if (activeUser) {
        const db = new VextaDatabaseManager(activeUser)
        db.saveMessage({
          sender: activeUser,
          recipient: name,
          ciphertext: `🎤 Voice note (${Math.round(audioBlob.size / 1024)} KB)`,
          timestamp: new Date().toISOString(),
          is_read: 1,
        })
      }
    } catch (err) {
      console.warn('[Voice Send Error]', err)
    }

    setMessages((prev) => [
      ...prev,
      {
        id: nextId.current++,
        timestamp: nowTimestamp(),
        rawDate: new Date().toISOString(),
        me: true,
        voiceUrl,
        timer: timer || undefined,
      },
    ])

    setRecording(false)
    window.dispatchEvent(new CustomEvent('vexta_messages_updated', { detail: { chatId, name } }))
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

  function addReaction(msgId: number, emoji: string) {
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser) {
      const db = new VextaDatabaseManager(activeUser)
      db.toggleMessageReaction(msgId, emoji)
    }

    bridgeClient.sendReaction(name, msgId, emoji)

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId) {
          const current = m.reactions || []
          const updated = current.includes(emoji)
            ? current.filter((r) => r !== emoji)
            : [...current, emoji]
          return { ...m, reactions: updated }
        }
        return m
      }),
    )
    setActiveReactionMsgId(null)
  }

  function handlePinMessage(msg: Message) {
    if (!msg.text) return
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && name) {
      const db = new VextaDatabaseManager(activeUser)
      db.setPinnedMessage(name, msg.text)
      setPinnedText(msg.text)
    }
  }

  function handleUnpin() {
    const activeUser = localStorage.getItem('vexta_active_user') || ''
    if (activeUser && name) {
      const db = new VextaDatabaseManager(activeUser)
      db.setPinnedMessage(name, null)
      setPinnedText(null)
    }
  }

  function openMediaLightbox(currentMsg: Message) {
    const items: LightboxItem[] = []
    let initialIdx = 0

    const isImageFile = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp|heic|avif)$/i.test(name)
    const isVideoFile = (name: string) => /\.(mp4|webm|mkv|mov|avi)$/i.test(name)

    messages.forEach((m) => {
      if (m.attachment && (m.attachment.kind === 'photo' || m.attachment.kind === 'video' || isImageFile(m.attachment.name) || isVideoFile(m.attachment.name))) {
        const isTarget = m.id === currentMsg.id
        if (isTarget) initialIdx = items.length
        items.push({
          url: m.attachment.url || '',
          filename: m.attachment.name,
          type: (m.attachment.kind === 'photo' || isImageFile(m.attachment.name)) ? 'image' : 'video',
        })
      }
    })

    if (items.length > 0) {
      setLightboxItems(items)
      setLightboxIndex(initialIdx)
    }
  }

  const filteredMessages = messages.filter((m) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (m.text && m.text.toLowerCase().includes(q)) ||
      (m.attachment && m.attachment.name.toLowerCase().includes(q))
    )
  })

  return (
    <div
      className={`screen-pane chat-view ${isDragging ? 'dragging' : ''}`}
      data-chat-theme={chatTheme}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="chat-main-area">
        <input
          ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-card">
            <AttachIcon size={32} className="accent-icon" />
            <h3>Drop Files Here</h3>
            <p>Files will be encrypted and sent via Vexta Zero-Knowledge Transfer</p>
          </div>
        </div>
      )}

      {/* Reconnection Banner */}
      {bridgeStatus !== 'connected' && (
        <div className="reconnect-banner">
          <span className="reconnect-dot" />
          <span>Reconnecting to Vexta Relay Network...</span>
        </div>
      )}

      {/* Chat Header */}
      <div className="pane-header chat-header">
        <div className="peer-title">
          <h2>{name}</h2>
          <span className="mono-sub">
            <ShieldIcon size={12} /> {subtitle}
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            title="Start Voice Call"
            disabled={isGlobal}
            onClick={() => webrtcManager.initiateCall(name, isGroup(chatId), false)}
          >
            <MicIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Start Video Call"
            disabled={isGlobal}
            onClick={() => webrtcManager.initiateCall(name, isGroup(chatId), true)}
          >
            <VideoIcon size={18} />
          </button>
          <button
            type="button"
            className={`icon-btn ${searchOpen ? 'active' : ''}`}
            title="Search Messages"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <SearchIcon size={18} />
          </button>
          <button
            type="button"
            className={`icon-btn ${infoOpen ? 'active' : ''}`}
            title={infoOpen ? 'Hide channel info' : 'Channel info'}
            onClick={toggleInfo}
          >
            <InfoIcon size={18} />
          </button>
        </div>
      </div>

      {/* Pinned Message Banner */}
      {pinnedText && (
        <div className="pinned-message-bar">
          <div className="pinned-meta">
            <span className="pinned-badge">📌 PINNED</span>
            <span className="pinned-text">{pinnedText}</span>
          </div>
          <button type="button" className="unpin-btn" onClick={handleUnpin} title="Unpin message">
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {/* Search Bar */}
      {searchOpen && (
        <div className="chat-search-bar">
          <input
            type="text"
            className="modal-input"
            placeholder="Search decrypted messages..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setMatchIndex(0)
            }}
            autoFocus
          />
          {searchQuery.trim() && (
            <div className="search-nav-controls">
              <span className="search-count">
                {filteredMessages.length === 0
                  ? 'No matches'
                  : `${matchIndex + 1} of ${filteredMessages.length}`}
              </span>
              <button
                type="button"
                className="icon-btn search-nav-btn"
                disabled={filteredMessages.length === 0}
                onClick={() =>
                  setMatchIndex((prev) => (prev > 0 ? prev - 1 : filteredMessages.length - 1))
                }
              >
                ▲
              </button>
              <button
                type="button"
                className="icon-btn search-nav-btn"
                disabled={filteredMessages.length === 0}
                onClick={() =>
                  setMatchIndex((prev) => (prev < filteredMessages.length - 1 ? prev + 1 : 0))
                }
              >
                ▼
              </button>
            </div>
          )}
          {searchQuery && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSearchQuery('')}
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>
      )}

      <div className="chat-body" ref={listRef}>
        <div className="chat-banner">
          <ShieldIcon size={16} />
          <span>
            {isGlobal
              ? 'Official broadcast channel. Messages are cryptographically signed by Vexta Network.'
              : 'Messages and media are end-to-end encrypted with zero-knowledge keys.'}
          </span>
        </div>

        {filteredMessages.map((m, idx) => {
          const prevMsg = idx > 0 ? filteredMessages[idx - 1] : null
          const showTimeDivider = shouldShowTimeDivider(prevMsg, m)

          return (
            <div key={`msg_${m.id}_${idx}`} className="msg-row-container">
              {/* ⏱️ Messenger-Style Time Gap Divider */}
              {showTimeDivider && (
                <div className="time-divider-row">
                  <span className="time-divider-line" />
                  <span className="time-divider-badge">{formatTimeDivider(m)}</span>
                  <span className="time-divider-line" />
                </div>
              )}

              {m.isSystem ? (
                <div className="system-msg-row">
                  <span className="system-msg-pill">📢 {m.text}</span>
                </div>
              ) : (
                <div
                  className={`msg-row ${m.me ? 'me' : 'them'}`}
                  onMouseLeave={() => {
                    setActiveReactionMsgId(null)
                    setActiveMoreMenuMsgId(null)
                  }}
                >
                  {!m.me && isGroup(chatId) && (
                    <span className="sender-label">{m.sender || 'Peer'}</span>
                  )}

                  {/* Outbound (me) Messenger Action Bar: left side of bubble */}
                  {m.me && (
                    <div className={`messenger-hover-actions ${activeMoreMenuMsgId === m.id || activeReactionMsgId === m.id ? 'active' : ''}`}>
                      <div className="messenger-action-wrap">
                        <button
                          type="button"
                          className="messenger-action-btn"
                          title="More options"
                          onClick={() => setActiveMoreMenuMsgId(activeMoreMenuMsgId === m.id ? null : m.id)}
                        >
                          <ThreeDotsIcon size={18} />
                        </button>

                        {activeMoreMenuMsgId === m.id && (
                          <div className="messenger-popover-menu left">
                            {m.text && (
                              <button
                                type="button"
                                className="messenger-popover-item"
                                onClick={() => {
                                  handlePinMessage(m)
                                  setActiveMoreMenuMsgId(null)
                                }}
                              >
                                <PinIcon size={15} />
                                <span>Pin</span>
                              </button>
                            )}
                            {m.text && (
                              <button
                                type="button"
                                className="messenger-popover-item"
                                onClick={() => {
                                  if (m.text) navigator.clipboard.writeText(m.text)
                                  setActiveMoreMenuMsgId(null)
                                }}
                              >
                                <CheckIcon size={15} />
                                <span>Copy</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="messenger-popover-item danger"
                              onClick={() => {
                                setMessages((prev) => prev.filter((item) => item.id !== m.id))
                                const activeUser = localStorage.getItem('vexta_active_user') || ''
                                if (activeUser) {
                                  new VextaDatabaseManager(activeUser).deleteMessage(m.id)
                                }
                                setActiveMoreMenuMsgId(null)
                              }}
                            >
                              <CloseIcon size={15} />
                              <span>Unsend / Delete</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {(m.voiceUrl || m.attachment?.url || m.attachment) && (
                        <button
                          type="button"
                          className="messenger-action-btn"
                          title="Save to Downloads/Vexta"
                          onClick={() => {
                            const targetUrl = m.voiceUrl || m.attachment?.url || ''
                            const targetName = m.attachment?.name || `voice_${Date.now()}.webm`
                            if (targetUrl) saveMediaToDownloads(targetUrl, targetName)
                          }}
                        >
                          <DownloadIcon size={18} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="messenger-action-btn"
                        title="Reply"
                        onClick={() => setReplyingTo(m)}
                      >
                        <ReplyIcon size={18} />
                      </button>

                      <button
                        type="button"
                        className="messenger-action-btn"
                        title="React"
                        onClick={() => setActiveReactionMsgId(activeReactionMsgId === m.id ? null : m.id)}
                      >
                        <SmileIcon size={18} />
                      </button>
                    </div>
                  )}

                  <div className="bubble-wrapper">
                    <div className={`bubble ${m.me ? 'me' : 'them'}`}>
                      {/* Emoji Reaction Picker Popover */}
                      {activeReactionMsgId === m.id && (
                        <div className="emoji-reaction-picker">
                          {EMOJI_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="emoji-btn"
                              onClick={() => addReaction(m.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Quoted Message Snippet */}
                      {m.replyTo && (
                        <div className="quoted-reply-snippet">
                          <span className="quoted-sender">{m.replyTo.sender}</span>
                          <span className="quoted-text">{m.replyTo.text}</span>
                        </div>
                      )}

                      {/* Call Ended Event Card */}
                      {m.text && m.text.startsWith('CALL_EVENT:') ? (
                        <div className="call-ended-card">
                          <div className="call-ended-icon">
                            <PhoneOffIcon size={18} />
                          </div>
                          <div className="call-ended-meta">
                            <span className="call-ended-title">
                              {m.text.replace('CALL_EVENT:', '') || 'Call Ended'}
                            </span>
                            <span className="call-ended-sub">End-to-End Encrypted</span>
                          </div>
                          <button
                            type="button"
                            className="btn-call-back"
                            title="Call back"
                            onClick={() => webrtcManager.initiateCall(name, isGroup(chatId))}
                          >
                            Call Back
                          </button>
                        </div>
                      ) : m.voiceUrl ? (
                        <AudioPlayer src={m.voiceUrl} />
                      ) : (
                        <>
                          {/* Attachments */}
                          {m.attachment && (
                            <div
                              className={`file-card ${m.attachment.url ? 'clickable-media' : ''}`}
                              onClick={() => m.attachment?.url && openMediaLightbox(m)}
                            >
                              {m.attachment.url && m.attachment.kind === 'photo' ? (
                                <div className="photo-thumb-container">
                                  <img
                                    src={m.attachment.url}
                                    alt={m.attachment.name}
                                    className="chat-img-thumb"
                                  />
                                </div>
                              ) : (
                                <>
                                  <span className="file-icon">{attachmentIcon(m.attachment)}</span>
                                  <span className="file-meta">
                                    <b>{m.attachment.name}</b>
                                    <small>
                                      {attachmentLabel(m.attachment)} &middot; {m.attachment.size}
                                    </small>
                                  </span>
                                </>
                              )}
                            </div>
                          )}

                          {/* Markdown Message Content */}
                          {m.text && <MarkdownMessage content={m.text} />}
                        </>
                      )}

                      <span className="meta">
                        {m.me && (
                          <span className={`check ${m.status === 'read' ? 'read' : m.status === 'delivered' ? 'delivered' : 'sent'}`}>
                            {m.status === 'read' || m.status === 'delivered' ? '✓✓' : '✓'}
                          </span>
                        )}
                        {m.timer && <span className="timer">⏱</span>}
                        {m.timestamp}
                      </span>

                      {/* Reaction Badges */}
                      {m.reactions && m.reactions.length > 0 && (
                        <div className="msg-reactions-list">
                          {m.reactions.map((r, idx) => (
                            <span key={idx} className="reaction-badge">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inbound (them) Messenger Action Bar: right side of bubble */}
                  {!m.me && (
                    <div className={`messenger-hover-actions ${activeMoreMenuMsgId === m.id || activeReactionMsgId === m.id ? 'active' : ''}`}>
                      <button
                        type="button"
                        className="messenger-action-btn"
                        title="React"
                        onClick={() => setActiveReactionMsgId(activeReactionMsgId === m.id ? null : m.id)}
                      >
                        <SmileIcon size={18} />
                      </button>

                      <button
                        type="button"
                        className="messenger-action-btn"
                        title="Reply"
                        onClick={() => setReplyingTo(m)}
                      >
                        <ReplyIcon size={18} />
                      </button>

                      {(m.voiceUrl || m.attachment?.url || m.attachment) && (
                        <button
                          type="button"
                          className="messenger-action-btn"
                          title="Save to Downloads/Vexta"
                          onClick={() => {
                            const targetUrl = m.voiceUrl || m.attachment?.url || ''
                            const targetName = m.attachment?.name || `voice_${Date.now()}.webm`
                            if (targetUrl) saveMediaToDownloads(targetUrl, targetName)
                          }}
                        >
                          <DownloadIcon size={18} />
                        </button>
                      )}

                      <div className="messenger-action-wrap">
                        <button
                          type="button"
                          className="messenger-action-btn"
                          title="More options"
                          onClick={() => setActiveMoreMenuMsgId(activeMoreMenuMsgId === m.id ? null : m.id)}
                        >
                          <ThreeDotsIcon size={18} />
                        </button>

                        {activeMoreMenuMsgId === m.id && (
                          <div className="messenger-popover-menu right">
                            {m.text && (
                              <button
                                type="button"
                                className="messenger-popover-item"
                                onClick={() => {
                                  handlePinMessage(m)
                                  setActiveMoreMenuMsgId(null)
                                }}
                              >
                                <PinIcon size={15} />
                                <span>Pin</span>
                              </button>
                            )}
                            {m.text && (
                              <button
                                type="button"
                                className="messenger-popover-item"
                                onClick={() => {
                                  if (m.text) navigator.clipboard.writeText(m.text)
                                  setActiveMoreMenuMsgId(null)
                                }}
                              >
                                <CheckIcon size={15} />
                                <span>Copy</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="messenger-popover-item danger"
                              onClick={() => {
                                setMessages((prev) => prev.filter((item) => item.id !== m.id))
                                const activeUser = localStorage.getItem('vexta_active_user') || ''
                                if (activeUser) {
                                  new VextaDatabaseManager(activeUser).deleteMessage(m.id)
                                }
                                setActiveMoreMenuMsgId(null)
                              }}
                            >
                              <CloseIcon size={15} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="composer-wrap">
        {/* Quoted Reply Bar Above Composer */}
        {replyingTo && (
          <div className="composer-reply-bar">
            <div className="reply-bar-meta">
              <span className="reply-bar-title">
                Replying to <b>{replyingTo.me ? 'yourself' : replyingTo.sender || name}</b>
              </span>
              <span className="reply-bar-snippet">
                {replyingTo.text || replyingTo.attachment?.name || 'Attachment'}
              </span>
            </div>
            <button
              type="button"
              className="attach-chip-x"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
            >
              {'\u00D7'}
            </button>
          </div>
        )}

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
          {recording ? (
            <VoiceRecorder
              onSend={handleSendVoiceBlob}
              onCancel={() => setRecording(false)}
            />
          ) : (
            <>
              <form
                className="chat-input"
                onSubmit={(e) => {
                  e.preventDefault()
                  send()
                }}
              >
                <button
                  type="button"
                  className="icon-btn"
                  title="Attach File"
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
                      : 'Type a message...'
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
              </form>

              <div className="composer-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Record Voice Note"
                  disabled={isGlobal}
                  onClick={() => setRecording(true)}
                >
                  <MicIcon size={18} />
                </button>
                <button
                  type="button"
                  className="send-btn"
                  title="Send message"
                  disabled={isGlobal || (!draft.trim() && !attachment)}
                  onClick={send}
                >
                  <SendIcon size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Attachment Menu */}
        {menu === 'attach' && (
          <div className="popover attach-menu">
            {ATTACH_ITEMS.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={`attach-item ${item.soon ? 'soon' : ''}`}
                disabled={item.soon}
                onClick={() => openPicker(item.kind)}
              >
                <span className="icon">{item.icon}</span>
                <span className="label">{item.label}</span>
                {item.soon && <span className="tag">Soon</span>}
              </button>
            ))}
          </div>
        )}

        {/* Disappearing Messages Timer Menu */}
        {menu === 'timer' && (
          <div className="popover timer-menu">
            <div className="popover-title">Disappearing Messages</div>
            {TIMER_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`timer-item ${timer === opt.value ? 'selected' : ''}`}
                onClick={() => {
                  setTimer(opt.value)
                  setMenu(null)
                  const activeUser = localStorage.getItem('vexta_active_user') || ''
                  if (activeUser && name) {
                    const db = new VextaDatabaseManager(activeUser)
                    db.setChatTimer(name, opt.value)
                  }
                }}
              >
                <span>{opt.label}</span>
                {timer === opt.value && <CheckIcon size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Info View Sidebar Drawer */}
      <aside className={`chat-info-drawer ${infoOpen ? 'open' : ''}`}>
        {infoOpen && <ChatInfoView onClose={toggleInfo} />}
      </aside>

      {/* Full-Screen Media Lightbox Overlay */}
      {lightboxIndex !== null && (
        <MediaLightbox
          items={lightboxItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

export default ChatView
