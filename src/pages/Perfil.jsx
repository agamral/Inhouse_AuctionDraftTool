import { useNavigate, useMatch } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { logout } from '../firebase/auth'

export default function Perfil() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const inCampeonato = useMatch('/campeonatos/:campeonatoId/*')
  const base = inCampeonato ? `/campeonatos/${inCampeonato.params.campeonatoId}` : ''

  async function handleLogout() {
    await logout()
    navigate(base || '/')
  }

  if (!user) {
    navigate(base || '/')
    return null
  }

  const inicial = user.displayName?.[0] ?? user.email[0].toUpperCase()

  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <h1 className="page-title">Meu Perfil</h1>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '24px', borderRadius: 10,
        background: 'var(--bg2)', border: '1px solid var(--border2)',
        marginBottom: 24,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
          background: 'var(--bg3)', border: '2px solid var(--border2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, color: 'var(--gold2)', fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700, flexShrink: 0,
        }}>
          {user.photoURL
            ? <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : inicial
          }
        </div>
        <div>
          {user.displayName && (
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {user.displayName}
            </div>
          )}
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--text2)' }}>
            {user.email}
          </div>
          <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--green)', background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.25)', padding: '2px 8px', borderRadius: 4 }}>
            ● Logado
          </div>
        </div>
      </div>

      <button
        className="btn"
        style={{ color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)', fontSize: 14, padding: '10px 24px' }}
        onClick={handleLogout}
      >
        Sair da conta
      </button>
    </main>
  )
}
