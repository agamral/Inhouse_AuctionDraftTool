import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useParams, Link } from 'react-router-dom'

export default function HistoricoDetalhe() {
  const { historicId } = useParams()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onValue(ref(db, `/historico/${historicId}`), snap => {
      setData(snap.val())
      setLoading(false)
    })
    return unsub
  }, [historicId])

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>

  if (!data) return (
    <main className="page">
      <Link to="/historico" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>← Histórico</Link>
      <h1 className="page-title" style={{ marginTop: 16 }}>Edição não encontrada</h1>
    </main>
  )

  const info          = data.info ?? {}
  const draftResultado = data.draftResultado ?? {}
  const confrontos    = data.confrontos ?? {}
  const rodadas       = data.rodadas ?? {}
  const encerrado     = info.encerradoEm
    ? new Date(info.encerradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  const times = Object.entries(draftResultado).sort(([, a], [, b]) => (a.seed ?? 99) - (b.seed ?? 99))
  const rodadasArr = Object.entries(rodadas).sort(([, a], [, b]) => (a.numero ?? 0) - (b.numero ?? 0))

  // Agrupa confrontos por rodada
  const confPorRodada = {}
  Object.entries(confrontos).forEach(([id, conf]) => {
    const rid = conf.rodadaId ?? 'sem-rodada'
    if (!confPorRodada[rid]) confPorRodada[rid] = []
    confPorRodada[rid].push({ id, ...conf })
  })

  return (
    <main className="page">
      <Link to="/historico" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>← Histórico</Link>

      {/* Header */}
      <div style={{ margin: '20px 0 32px' }}>
        <h1 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 36, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
          {info.nome ?? historicId}
        </h1>
        {info.labelSeason && (
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
            {info.labelSeason}
          </p>
        )}
        {encerrado && (
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Encerrado em {encerrado}</p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Times e rosters */}
        {times.length > 0 && (
          <section>
            <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              Times
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {times.map(([id, time]) => {
                const roster = Object.values(time.roster ?? {})
                  .sort((a, b) => (b.preco ?? 0) - (a.preco ?? 0))
                return (
                  <div key={id} style={{ background: 'var(--bg2)', border: `1px solid ${time.cor ?? 'var(--border)'}33`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: time.cor ? `${time.cor}22` : 'var(--bg3)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{time.emoji ?? '⚔️'}</span>
                      <div>
                        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: time.cor ?? 'var(--text)' }}>
                          {time.nome}
                        </div>
                        {time.capitaoNome && (
                          <div style={{ fontSize: 11, color: 'var(--text2)' }}>⚑ {time.capitaoNome}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {/* Capitão */}
                      {time.capitaoNome && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--text2)' }}>{time.capitaoNome}</span>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: time.cor ?? 'var(--gold)', background: `${time.cor ?? 'var(--gold)'}18`, border: `1px solid ${time.cor ?? 'var(--gold)'}33`, borderRadius: 3, padding: '1px 5px' }}>CAP</span>
                        </div>
                      )}
                      {/* Roster */}
                      {roster.map((entry, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--text2)' }}>{entry.discord ?? '—'}</span>
                          {entry.preco != null && (
                            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text3)' }}>
                              🪙{entry.preco}
                            </span>
                          )}
                        </div>
                      ))}
                      {roster.length === 0 && !time.capitaoNome && (
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sem roster registrado.</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Resultados de partidas */}
        {Object.keys(confrontos).length > 0 && (
          <section>
            <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              Partidas
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {rodadasArr.length > 0 ? rodadasArr.map(([rid, rodada]) => (
                <div key={rid}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Rodada {rodada.numero ?? rid}
                  </div>
                  <ConfrontosLista confrontos={confPorRodada[rid] ?? []} />
                </div>
              )) : (
                <ConfrontosLista confrontos={Object.entries(confrontos).map(([id, c]) => ({ id, ...c }))} />
              )}
            </div>
          </section>
        )}

        {/* Sem dados */}
        {times.length === 0 && Object.keys(confrontos).length === 0 && (
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>Sem dados detalhados para esta edição.</p>
        )}

      </div>
    </main>
  )
}

function ConfrontosLista({ confrontos }) {
  if (!confrontos.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {confrontos.map(conf => {
        const res = conf.resultado ?? {}
        const vencedor = res.vencedor
        return (
          <div key={conf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
            <span style={{ flex: 1, color: vencedor === conf.time1Id ? 'var(--text)' : 'var(--text2)', fontWeight: vencedor === conf.time1Id ? 600 : 400 }}>
              {conf.time1Nome ?? conf.time1Id ?? '—'}
            </span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text3)', minWidth: 50, textAlign: 'center' }}>
              {res.placar ?? (conf.status === 'wo' ? 'W.O.' : '— × —')}
            </span>
            <span style={{ flex: 1, textAlign: 'right', color: vencedor === conf.time2Id ? 'var(--text)' : 'var(--text2)', fontWeight: vencedor === conf.time2Id ? 600 : 400 }}>
              {conf.time2Nome ?? conf.time2Id ?? '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
