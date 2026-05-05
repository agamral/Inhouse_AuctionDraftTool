import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'

// /admin — SuperAdmin only
export default function ProtectedRoute({ children }) {
  const { isSuperAdmin, loading } = useAuth()
  if (loading) return null
  if (!isSuperAdmin) return <Navigate to="/" replace />
  return children
}

// /campeonatos/:id/admin — championship admin (or SuperAdmin)
export function CampeonatoAdminRoute({ children }) {
  const { isSuperAdmin, adminCampeonatoIds, loading } = useAuth()
  const { campeonatoId } = useCampeonato()
  if (loading) return null
  if (isSuperAdmin) return children
  if (campeonatoId && adminCampeonatoIds.includes(campeonatoId)) return children
  return <Navigate to={campeonatoId ? `/campeonatos/${campeonatoId}` : '/'} replace />
}
