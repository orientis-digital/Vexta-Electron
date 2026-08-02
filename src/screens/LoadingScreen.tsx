import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function LoadingScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/'), 2500)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="screen">
      <div className="spinner" aria-hidden="true" />
      <h1>Setting up your vault…</h1>
      <p>Generating keys · encrypting · registering</p>
    </div>
  )
}

export default LoadingScreen
