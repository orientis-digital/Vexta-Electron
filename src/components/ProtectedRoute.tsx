import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { AuthSession } from '../crypto/session'

interface ProtectedRouteProps {
  children?: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!AuthSession.isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  return children ? <>{children}</> : <Outlet />
}

export default ProtectedRoute
