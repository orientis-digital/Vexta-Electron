import { NavLink, Outlet, useNavigate } from 'react-router-dom'

function AppLayout() {
  const navigate = useNavigate()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <input type="search" placeholder="Search" />
        <nav>
          <NavLink to="/friends" className="nav-link">
            Friends
          </NavLink>
          <button type="button">Create Group</button>
        </nav>
        <div className="contacts">
          <p className="muted">Contacts will appear here.</p>
        </div>
        <div className="profile-card">
          <span className="muted">Not signed in</span>
          <button
            type="button"
            onClick={() => {
              navigate('/settings')
            }}
          >
            Settings
          </button>
          <button type="button" onClick={() => navigate('/login')}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
