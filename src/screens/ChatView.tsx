import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

function ChatView() {
  const { chatId } = useParams()
  const [draft, setDraft] = useState('')

  return (
    <div className="chat">
      <header className="chat-header">
        <span>{chatId}</span>
        <Link to={`/chat/${chatId}/info`}>Info</Link>
      </header>
      <div className="messages">
        <p className="muted">Messages will appear here.</p>
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          setDraft('')
        }}
      >
        <button type="button" aria-label="Attach file">
          +
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}

export default ChatView
