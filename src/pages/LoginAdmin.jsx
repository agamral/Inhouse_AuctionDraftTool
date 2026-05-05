import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginWithGoogle, logout } from '../firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'

export default function LoginAdmin() {
  const { user, isSuperAdmin, adminCampeonatoIds, loading } = useAuth()
  const { campeonatoId, campeonato } = useCampeonato()
  const navigate = useNavigate()
  const [signing,   setSigning]   = useState(false)
  const [error,     setError]     = useState(null)
  const [wrongRole, setWrongRole] = useState(false)

  const campNome = campeonato?.info?.nome ?? campeonatoId

  useEffect(() => {
    if (loading) return
    if (isSuperAdmin) { navigate('/admin', { replace: true }); return }
    if (user && adminCampeonatoIds.includes(campeonatoId)) {
      navigate(`/campeonatos/${campeonatoId}/admin`, { replace: true }); return
    }
    if (user) setWrongRole(true)
  }, [loading, isSuperAdmin, user, adminCampeonatoIds, campeonatoId]) // eslint-disable-line

  async function handleLogin() {
    setSigning(true)
    setError(null)
    setWrongRole(false)
    try {
      await loginWithGoogle()
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') setError('Falha no login. Tente novamente.')
    } finally {
      setSigning(false)
    }
  }

  async function handleLogoutAndRetry() {
    await logout()
    setWrongRole(false)
  }

  if (loading) return null

  if (wrongRole && user) {
    return (
      <main className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: '48px 40px', textAlign: 'center', maxWidth: 380, width: '100%' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontFamily: "'Rajdhani', sans-serif", color: 'var(--red)', fontSize: 20, marginBottom: 8 }}>
            Sem acesso a este campeonato
          </h2>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            A conta <strong style={{ color: 'var(--text)' }}>{user.email}</strong> não é admin de <strong style={{ color: 'var(--gold2)' }}>{campNome}</strong>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a href={`/campeonatos/${campeonatoId}`} className="btn"
              style={{ display: 'block', padding: '10px', fontSize: 13, textDecoration: 'none' }}>
              Ver campeonato como visitante
            </a>
            <button className="btn" style={{ fontSize: 13, padding: '10px' }} onClick={handleLogoutAndRetry}>
              Tentar com outra conta
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: '48px 40px', textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚔️</div>
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", color: 'var(--text)', fontSize: 22, marginBottom: 4 }}>
          {campNome}
        </h2>
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 28 }}>
          Acesso de Administrador
        </p>
        <button
          className="btn primary"
          style={{ width: '100%', padding: 12, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={handleLogin}
          disabled={signing}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {signing ? 'Entrando...' : 'Entrar com Google'}
        </button>
        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 16 }}>{error}</p>}
        <p style={{ marginTop: 24, fontSize: 11, color: 'var(--text3)' }}>
          Acesso restrito a administradores de {campNome}.
        </p>
      </div>
    </main>
  )
}
