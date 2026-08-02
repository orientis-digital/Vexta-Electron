import { useState } from 'react'

type Tab = 'active' | 'pending' | 'add'

function FriendsView() {
  const [tab, setTab] = useState<Tab>('active')
  const [username, setUsername] = useState('')

  return (
    <div className="screen-pane">
      <h1>Friends</h1>
      <div className="tabs">
        <button
          type="button"
          className={tab === 'active' ? 'active' : ''}
          onClick={() => setTab('active')}
        >
          Active Friends
        </button>
        <button
          type="button"
          className={tab === 'pending' ? 'active' : ''}
          onClick={() => setTab('pending')}
        >
          Pending Requests
        </button>
        <button
          type="button"
          className={tab === 'add' ? 'active' : ''}
          onClick={() => setTab('add')}
        >
          Add Friend
        </button>
      </div>

      {tab === 'active' && <p className="muted">No friends yet.</p>}
      {tab === 'pending' && <p className="muted">No pending requests.</p>}
      {tab === 'add' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setUsername('')
          }}
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Add by username or identity string"
          />
          <button type="submit">Add</button>
        </form>
      )}
    </div>
  )
}

export default FriendsView
