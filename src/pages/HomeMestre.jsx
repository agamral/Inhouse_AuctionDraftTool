import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './HomeMestre.css'

export default function HomeMestre() {
  const { campeonatos, loading } = useCampeonato()
  const { t } = useTranslation()
  const [temHistorico, setTemHistorico] = useState(false)

  // Verifica se existe histórico sem carregar tudo
  useEffect(() => {
    const unsub = onValue(ref(db, '/historico'), snap => {
      setTemHistorico(snap.exists() && Object.keys(snap.val() ?? {}).length > 0)
    }, { onlyOnce: true })
    return unsub
  }, [])

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>

  const lista = Object.entries(campeonatos)
    .filter(([, c]) => c.info?.visivel !== false)
    .sort(([, a], [, b]) => (b.info?.criadoEm ?? 0) - (a.info?.criadoEm ?? 0))

  // Próximo evento do campeonato principal
  const principal = Object.values(campeonatos).find(c => c.info?.principal)
  const proximoEvento = principal?.config?.conteudo?.proximoEvento

  // Quando há só UM campeonato em andamento, ele ganha destaque (card maior,
  // mais detalhes e CTA mais óbvio) — os demais (encerrados etc.) seguem no grid normal.
  const ativos = lista.filter(([, c]) => c.info?.status !== 'encerrado')
  const featuredEntry = ativos.length === 1 ? ativos[0] : null
  const restante = featuredEntry ? lista.filter(([id]) => id !== featuredEntry[0]) : lista

  if (lista.length === 0) {
    return (
      <main className="page">
        <h1 className="page-title">Copa Inhouse</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>{t('home_mestre.empty')}</p>
        {temHistorico && (
          <Link to="/historico" className="hm-historico-link">📚 {t('home_mestre.history_link')}</Link>
        )}
      </main>
    )
  }

  // Monta os dados de exibição de um card a partir do campeonato bruto
  const buildCardInfo = (id, camp) => {
    const info       = camp.info ?? {}
    const isPrincipal = info.principal
    const encerrado  = info.status === 'encerrado'
    const status = encerrado
      ? t('home_mestre.status_ended')
      : camp.config?.modules?.campeonatoAtivo ? t('home_mestre.status_running')
      : camp.config?.modules?.draftAtivo      ? t('home_mestre.status_draft')
      : camp.config?.modules?.inscricaoAberta ? t('home_mestre.status_open')
      : t('home_mestre.status_waiting')
    const statusColor = encerrado
      ? 'var(--text3)'
      : camp.config?.modules?.campeonatoAtivo ? 'var(--green)'
      : camp.config?.modules?.draftAtivo      ? 'var(--gold)'
      : camp.config?.modules?.inscricaoAberta ? 'var(--blue)'
      : 'var(--text3)'

    // Encerrados com histórico linkam para /historico/:id
    const linkTo = encerrado ? `/historico/${id}` : `/campeonatos/${id}`

    return { info, isPrincipal, encerrado, status, statusColor, linkTo }
  }

  return (
    <main className="page">
      <div className="hm-header">
        <div className="hm-trophy">⚔️</div>
        <div>
          <h1 className="hm-title">Copa Inhouse</h1>
          <p className="hm-sub">{t('home_mestre.subtitle')}</p>
        </div>
      </div>

      {/* Próximo evento */}
      {proximoEvento && (
        <div className="hm-proximo-evento">
          <span className="hm-proximo-label">{t('home_mestre.next_event')}</span>
          <span className="hm-proximo-data">{proximoEvento}</span>
        </div>
      )}

      {/* Card em destaque — único campeonato em andamento */}
      {featuredEntry && (() => {
        const [id, camp] = featuredEntry
        const { info, status, statusColor, linkTo } = buildCardInfo(id, camp)
        const conteudo = camp.config?.conteudo ?? {}
        const numTimes    = Object.keys(camp.teams ?? {}).length
        const numPlayers  = Object.keys(camp.players ?? {}).length

        return (
          <Link to={linkTo} className="hm-featured">
            <div className="hm-featured-glow" />
            <div className="hm-featured-content">
              <div className="hm-featured-top">
                <span className="hm-featured-status" style={{ color: statusColor }}>● {status}</span>
                {info.labelSeason && <span className="hm-featured-label">{info.labelSeason}</span>}
              </div>
              <h2 className="hm-featured-nome">{conteudo.cupName || info.nome || id}</h2>
              {conteudo.descricaoTorneio && (
                <p className="hm-featured-desc">{conteudo.descricaoTorneio}</p>
              )}
              <div className="hm-featured-meta">
                {conteudo.proximoEvento && (
                  <span className="hm-featured-meta-item">📅 {conteudo.proximoEvento}</span>
                )}
                {numTimes > 0 && (
                  <span className="hm-featured-meta-item">🛡️ {t('home_mestre.featured_teams', { count: numTimes })}</span>
                )}
                {numPlayers > 0 && (
                  <span className="hm-featured-meta-item">👥 {t('home_mestre.featured_players', { count: numPlayers })}</span>
                )}
              </div>
              <div className="hm-featured-cta">
                {t('home_mestre.cta_featured')}
              </div>
            </div>
          </Link>
        )
      })()}

      <div className="hm-grid">
        {restante.map(([id, camp]) => {
          const { info, isPrincipal, encerrado, status, statusColor, linkTo } = buildCardInfo(id, camp)

          return (
            <Link key={id} to={linkTo} className={`hm-card${isPrincipal ? ' principal' : ''}${encerrado ? ' encerrado' : ''}`}>
              <div className="hm-card-top">
                <div className="hm-card-nome">{info.nome ?? id}</div>
                {isPrincipal && <span className="hm-badge">principal</span>}
                {encerrado   && <span className="hm-badge-enc">encerrado</span>}
              </div>
              {info.labelSeason && <div className="hm-card-label">{info.labelSeason}</div>}
              <div className="hm-card-status" style={{ color: statusColor }}>● {status}</div>
              <div className="hm-card-cta">{encerrado ? t('home_mestre.cta_history') : t('home_mestre.cta_view')}</div>
            </Link>
          )
        })}
      </div>

      {/* Link para histórico completo */}
      {temHistorico && (
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <Link to="/historico" className="hm-historico-link">📚 {t('home_mestre.history_link')}</Link>
        </div>
      )}
    </main>
  )
}
