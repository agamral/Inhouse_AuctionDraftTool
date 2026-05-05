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

      <div className="hm-grid">
        {lista.map(([id, camp]) => {
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
