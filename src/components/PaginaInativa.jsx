import { Link } from 'react-router-dom'
import { useCampeonato } from '../contexts/CampeonatoContext'

export default function PaginaInativa({ icone = '🔒', titulo, descricao }) {
  const { idPublico } = useCampeonato()
  const base = idPublico ? `/campeonatos/${idPublico}` : '/'

  return (
    <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{icone}</div>
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {titulo ?? 'Ainda não disponível'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 24 }}>
          {descricao ?? 'Esta página será aberta em breve pelos organizadores. Fique atento ao Discord para novidades.'}
        </p>
        <Link to={base} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--text3)', textDecoration: 'none', letterSpacing: '0.05em' }}>
          ← Voltar ao início
        </Link>
      </div>
    </main>
  )
}
