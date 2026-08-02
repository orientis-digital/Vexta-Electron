import { Link, useParams } from 'react-router-dom'

function ChatInfoView() {
  const { chatId } = useParams()

  return (
    <div className="chat-info">
      <Link to={`/chat/${chatId}`}>Back</Link>
      <h1>{chatId}</h1>
      <p className="muted">Fingerprint, members, and settings will appear here.</p>
    </div>
  )
}

export default ChatInfoView
