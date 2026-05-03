import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { Link } from 'react-router-dom'

export default function Historico() {
  const [historico, setHistorico] = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const unsub = onValue(ref(db, '/historico'), snap => {
      setHistorico(snap.val())
      setLoading(false)
    })
    return unsub
  }, [])

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>

  if (!historico || Object.keys(historico).length === 0) {
    return (
      <main className="page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Link to="/" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>← Início</Link>
        </div>
        <h1 className="page-title">Histórico</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Nenhuma edição arquivada ainda.</p>
      </main>
    )
  }

  const lista = Object.entries(historico)
    .sort(([, a], [, b]) => (b.info?.encerradoEm ?? 0) - (a.info?.encerradoEm ?? 0))

  return (
    <main className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>← Início</Link>
      </div>

      <h1 className="page-title" style={{ marginBottom: 4 }}>Histórico</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 28 }}>
        Todas as edições da Copa Inhouse.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {lista.map(([id, camp]) => {
          const info      = camp.info ?? {}
          const numTimes  = Object.keys(camp.draftResultado ?? {}).length
          const numConf   = Object.keys(camp.confrontos ?? {}).length
          const encerrado = info.encerradoEm
            ? new Date(info.encerradoEm).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
            : null

          return (
            <Link
              key={id}
              to={`/historico/${id}`}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: '20px 22px', borderRadius: 10,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                {info.nome ?? id}
              </div>
              {info.labelSeason && (
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {info.labelSeason}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                {numTimes > 0 && <span>{numTimes} times</span>}
                {numConf  > 0 && <span>{numConf} partidas</span>}
                {encerrado && <span>· {encerrado}</span>}
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                Ver detalhes →
              </div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
