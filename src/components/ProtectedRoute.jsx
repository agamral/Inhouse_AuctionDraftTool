import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()

  if (loading) return null

  if (!user) return <Navigate to="/login" replace />

  if (!isAdmin) return <Navigate to="/login?denied=1" replace />

  return children
}
