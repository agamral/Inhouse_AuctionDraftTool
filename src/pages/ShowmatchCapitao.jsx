import { useSearchParams } from 'react-router-dom'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { useServerTimeOffset } from '../hooks/useServerTimeOffset'
import { HEROES } from '../utils/heroPool'
import { passoAtual, heroiBloqueado, STATUS_DRAFT } from '../utils/heroDraft'
import { useState, useEffect, useRef } from 'react'
import './HeroDraft.css'

const HERO_DRAFT_PATH = 'showmatch/sessaoAtiva/heroDraft'

export default function ShowmatchCapitao() {
  const [params] = useSearchParams()
  const timeLocal = params.get('time') ?? 'A'

  const { estado, loading, erro, ehMinhaTez, agir } = useHeroDraft(null, timeLocal, HERO_DRAFT_PATH)
  const timeOffset = useServerTimeOffset()

  const [filtroRole, setFiltroRole] = useState('todos')
  const [busca, setBusca]           = useState('')
  const [confirmando, setConfirmando] = useState(null)

  const TEMPO_TURNO = 30
  const [turnoIniciadoEm, setTurnoIniciadoEm] = useState(null)
  const [tempoRestante, setTempoRestante]     = useState(TEMPO_TURNO)
  const prevPassoRef  = useRef(null)
  const autoPickTimer = useRef(null)
  const confirmandoRef = useRef(null)
  useEffect(() => { confirmandoRef.current = confirmando }, [confirmando])

  useEffect(() => {
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO) return
    const ts = estado.turnoIniciadoEm ?? (Date.now() + timeOffset)
    if (estado.passoAtual !== prevPassoRef.current || !turnoIniciadoEm) {
      prevPassoRef.current = estado.passoAtual
      const decorrido = Math.floor((Date.now() + timeOffset - ts) / 1000)
      setTurnoIniciadoEm(ts)
      setTempoRestante(Math.max(0, TEMPO_TURNO - decorrido))
    }
  }, [estado?.passoAtual, estado?.status, estado?.turnoIniciadoEm, timeOffset]) // eslint-disable-line

  useEffect(() => {
    if (!turnoIniciadoEm || estado?.status !== STATUS_DRAFT.RODANDO) return
    const tick = setInterval(() => {
      const decorrido = Math.floor((Date.now() + timeOffset - turnoIniciadoEm) / 1000)
      setTempoRestante(Math.max(0, TEMPO_TURNO - decorrido))
    }, 1000)
    return () => clearInterval(tick)
  }, [turnoIniciadoEm, estado?.status, timeOffset])

  const liveRef = useRef({})
  liveRef.current = { estado, ehMinhaTez, agir }

  useEffect(() => {
    if (autoPickTimer.current) clearTimeout(autoPickTimer.current)
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO || !ehMinhaTez()) return
    const turnoOriginal = estado.passoAtual
    const tsOriginal    = estado.turnoIniciadoEm
    const ts = estado.turnoIniciadoEm ?? (Date.now() + timeOffset)
    const decorrido = Math.floor((Date.now() + timeOffset - ts) / 1000)
    const restante = Math.max(0, TEMPO_TURNO - decorrido)
    autoPickTimer.current = setTimeout(async () => {
      // Aborta se o turno avançou enquanto o timer esperava
      const estLive = liveRef.current.estado
      if (!estLive || estLive.status !== STATUS_DRAFT.RODANDO) return
      if (estLive.passoAtual !== turnoOriginal) return
      if (estLive.turnoIniciadoEm !== tsOriginal) return
      if (!liveRef.current.ehMinhaTez()) return
      if (confirmandoRef.current) return
      const herosLivres = HEROES.filter(h => !heroiBloqueado(estLive, h.id))
      if (herosLivres.length === 0) return
      const h = herosLivres[Math.floor(Math.random() * herosLivres.length)]
      await liveRef.current.agir(h.id)
    }, restante * 1000)
    return () => clearTimeout(autoPickTimer.current)
  }, [estado?.passoAtual, estado?.status, timeOffset]) // eslint-disable-line

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando draft...</p></main>
  if (erro)    return <main className="page"><p style={{ color: 'var(--red)' }}>Erro: {erro}</p></main>
  if (!estado) return <main className="page"><p style={{ color: 'var(--text2)' }}>Aguardando o admin iniciar o Hero Draft...</p></main>

  const passo     = passoAtual(estado)
  const minhaTez  = ehMinhaTez()
  const minhaInfo = timeLocal === 'A' ? estado.timeA : estado.timeB

  const heroesFiltrados = HEROES
    .filter(h => filtroRole === 'todos' || h.roles?.includes(filtroRole))
    .filter(h => !busca || h.nome.toLowerCase().includes(busca.toLowerCase()))

  return (
    <main className="hero-draft-page">
      {/* Showmatch badge */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed'", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)', background: 'rgba(224,85,85,0.1)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 4, padding: '2px 10px' }}>
          &#x26A1; SHOWMATCH &middot; Time {timeLocal}
        </span>
      </div>

      {/* Status */}
      {estado.status === STATUS_DRAFT.AGUARDANDO && (
        <div className="hd-waiting">Aguardando início do draft...</div>
      )}

      {estado.status === STATUS_DRAFT.ENCERRADO && (
        <div className="hd-ended">Draft encerrado!</div>
      )}

      {estado.status === STATUS_DRAFT.RODANDO && (
        <>
          {/* Timer */}
          <div className="hd-timer-bar">
            <div className="hd-timer-fill" style={{ width: `${(tempoRestante / TEMPO_TURNO) * 100}%`, background: tempoRestante <= 5 ? 'var(--red)' : 'var(--gold)' }} />
            <span className="hd-timer-label">{tempoRestante}s</span>
          </div>

          {/* Turn indicator */}
          <div className="hd-turn" style={{ color: minhaTez ? 'var(--gold)' : 'var(--text2)' }}>
            {minhaTez
              ? `${passo?.acao === 'ban' ? 'Banir' : 'Escolher'} um herói`
              : 'Aguardando o adversário...'
            }
          </div>

          {/* Hero grid (only when it's my turn) */}
          {minhaTez && (
            <div className="hd-hero-section">
              <div className="hd-filters">
                <input className="hd-search" placeholder="Buscar herói..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <div className="hd-hero-grid">
                {heroesFiltrados.map(h => {
                  const bloqueado = heroiBloqueado(estado, h.id)
                  return (
                    <div
                      key={h.id}
                      className={`hd-hero-card ${bloqueado ? 'blocked' : ''} ${confirmando === h.id ? 'confirming' : ''}`}
                      onClick={() => !bloqueado && setConfirmando(h.id)}
                    >
                      <div className="hd-hero-name">{h.nome}</div>
                      {confirmando === h.id && (
                        <div className="hd-confirm-overlay" onClick={e => e.stopPropagation()}>
                          <button className="btn primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={async () => { await agir(h.id); setConfirmando(null) }}>
                            Confirmar
                          </button>
                          <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setConfirmando(null)}>&#x2715;</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* My team's picks/bans */}
          <div className="hd-my-team">
            <div className="hd-my-picks">
              {(minhaInfo?.picks ?? []).map((h, i) => (
                <div key={i} className="hd-pick-slot filled">{h}</div>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
