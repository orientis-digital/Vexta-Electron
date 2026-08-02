import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function LoginScreen() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')

  return (
    <div className="screen">
      <h1>Vexta</h1>
      <p>Unlock your vault to start messaging.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          navigate('/loading')
        }}
      >
        <label>
          Account
          <select name="account" defaultValue="">
            <option value="" disabled>
              Select account
            </option>
          </select>
        </label>
        <label>
          Master password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit">Unlock</button>
      </form>
      <button type="button">Unlock with biometrics</button>
      <button type="button">Forgot password?</button>
      <nav>
        <Link to="/signup">Sign Up</Link>
        <Link to="/signup">Restore Backup</Link>
        <Link to="/signup">Import Backup</Link>
      </nav>
    </div>
  )
}

export default LoginScreen
