import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type Mode = 'welcome' | 'create' | 'restore' | 'import'

function SignupScreen() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('welcome')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const start = (next: Mode) => () => setMode(next)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate('/loading')
  }

  return (
    <div className="screen">
      {mode === 'welcome' && (
        <>
          <h1>Welcome to Vexta</h1>
          <button type="button" onClick={start('create')}>
            Create Vault
          </button>
          <button type="button" onClick={start('restore')}>
            Log In & Restore
          </button>
          <button type="button" onClick={start('import')}>
            Import Backup
          </button>
          <Link to="/login">Already have an account? Unlock</Link>
        </>
      )}

      {(mode === 'create' || mode === 'restore') && (
        <form onSubmit={submit}>
          <h1>{mode === 'create' ? 'Create Account' : 'Restore Account'}</h1>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === 'create' && (
            <label>
              Confirm password
              <input type="password" />
            </label>
          )}
          {mode === 'restore' && (
            <label>
              Recovery code
              <input type="password" />
            </label>
          )}
          <button type="submit">{mode === 'create' ? 'Create' : 'Restore'}</button>
          <button type="button" onClick={start('welcome')}>
            Back
          </button>
        </form>
      )}

      {mode === 'import' && (
        <form onSubmit={submit}>
          <h1>Import Backup</h1>
          <label>
            .vxvault file
            <input type="file" accept=".vxvault" />
          </label>
          <label>
            Backup password
            <input type="password" />
          </label>
          <button type="submit">Import</button>
          <button type="button" onClick={start('welcome')}>
            Back
          </button>
        </form>
      )}
    </div>
  )
}

export default SignupScreen
