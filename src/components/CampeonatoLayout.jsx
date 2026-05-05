import { useEffect } from 'react'
import { useParams, Outlet, Navigate } from 'react-router-dom'
import { useCampeonato } from '../contexts/CampeonatoContext'

export default function CampeonatoLayout() {
  const { campeonatoId } = useParams()
  const { setIdPublicoOverride, campeonatos, loading } = useCampeonato()

  useEffect(() => {
    setIdPublicoOverride(campeonatoId)
    return () => setIdPublicoOverride(null)
  }, [campeonatoId]) // eslint-disable-line

  if (!loading && campeonatos && Object.keys(campeonatos).length > 0 && !campeonatos[campeonatoId]) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
