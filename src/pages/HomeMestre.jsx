import { useCampeonato } from '../contexts/CampeonatoContext'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './HomeMestre.css'

export default function HomeMestre() {
  const { campeonatos, loading } = useCampeonato()
  const { t } = useTranslation()

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>

  const lista = Object.entries(campeonatos)
    .filter(([, c]) => c.info?.visivel !== false)
    .sort(([, a], [, b]) => (b.info?.criadoEm ?? 0) - (a.info?.criadoEm ?? 0))

  if (lista.length === 0) {
    return (
      <main className="page">
        <h1 className="page-title">Copa Inhouse</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Nenhum campeonato disponível ainda.</p>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="hm-header">
        <div className="hm-trophy">⚔️</div>
        <div>
          <h1 className="hm-title">Copa Inhouse</h1>
          <p className="hm-sub">Heroes of the Storm</p>
        </div>
      </div>

      <div className="hm-grid">
        {lista.map(([id, camp]) => {
          const info = camp.info ?? {}
          const isPrincipal = info.principal
          const status = camp.config?.modules?.campeonatoAtivo ? 'Em andamento'
                       : camp.config?.modules?.draftAtivo      ? 'Leilão'
                       : camp.config?.modules?.inscricaoAberta ? 'Inscrições abertas'
                       : 'Encerrado'
          const statusColor = camp.config?.modules?.campeonatoAtivo ? 'var(--green)'
                            : camp.config?.modules?.draftAtivo      ? 'var(--gold)'
                            : camp.config?.modules?.inscricaoAberta ? 'var(--blue)'
                            : 'var(--text3)'
          return (
            <Link key={id} to={`/campeonatos/${id}`} className={`hm-card${isPrincipal ? ' principal' : ''}`}>
              <div className="hm-card-top">
                <div className="hm-card-nome">{info.nome ?? id}</div>
                {isPrincipal && <span className="hm-badge">principal</span>}
              </div>
              {info.labelSeason && <div className="hm-card-label">{info.labelSeason}</div>}
              <div className="hm-card-status" style={{ color: statusColor }}>● {status}</div>
              <div className="hm-card-cta">Ver campeonato →</div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
