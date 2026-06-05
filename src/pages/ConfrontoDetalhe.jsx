import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { confrontosPath, teamPath } from '../utils/campeonatoPaths'
import { HEROES } from '../utils/heroPool'
import { MAPAS } from '../utils/mapPool'
import { FORMATO_SERIE } from '../utils/scheduling'
import './ConfrontoDetalhe.css'

// ── Helpers ───────────────────────────────────────────────────────────────────
const HERO_MAP = Object.fromEntries(HEROES.map(h => [h.id, h]))
const MAPA_MAP = Object.fromEntries(MAPAS.map(m => [m.id, m]))

function heroNome(id) {
  return HERO_MAP[id]?.nome ?? id
}

function heroIcone(id) {
  return HERO_MAP[id]?.iconeUrl ?? null
}

function formatarData(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── HeroChip — ícone + nome de um herói ──────────────────────────────────────
function HeroChip({ heroId, variant = 'pick' }) {
  const icone = heroIcone(heroId)
  const nome  = heroNome(heroId)
  return (
    <div className={`cd-hero-chip cd-hero-chip--${variant}`} title={nome}>
      {icone
        ? <img src={icone} alt={nome} className="cd-hero-chip-img" onError={e => { e.target.style.display = 'none' }} />
        : <span className="cd-hero-chip-inicial">{nome[0]}</span>
      }
      <span className="cd-hero-chip-nome">{nome}</span>
    </div>
  )
}

// ── DraftTimeline — sequência completa de picks/bans ─────────────────────────
function DraftTimeline({ historico, timeANome, timeBNome, corA, corB }) {
  if (!historico?.length) {
    return <div className="cd-timeline-vazio">Sequência de draft não disponível para esta partida.</div>
  }

  const passos = [...historico].sort((a, b) => a.passo - b.passo)

  return (
    <div className="cd-timeline">
      {passos.map((p, i) => {
        const ehA      = p.time === 'A'
        const cor      = ehA ? corA : corB
        const nomeTime = ehA ? timeANome : timeBNome
        const ehBan    = p.acao === 'ban'
        const icone    = heroIcone(p.heroiId)
        const nome     = heroNome(p.heroiId)
        return (
          <div key={i} className={`cd-timeline-step cd-timeline-step--${ehA ? 'a' : 'b'} cd-timeline-step--${p.acao}`}>
            <div className="cd-timeline-step-num">{p.passo + 1}</div>
            <div className="cd-timeline-step-acao" style={{ color: ehBan ? 'var(--red)' : 'var(--green)' }}>
              {ehBan ? 'BAN' : 'PICK'}
            </div>
            <div className="cd-timeline-step-time" style={{ color: cor }}>
              {nomeTime}
            </div>
            <div className="cd-timeline-step-heroi">
              {icone && <img src={icone} alt={nome} className="cd-timeline-hero-img" onError={e => { e.target.style.display = 'none' }} />}
              <span>{nome}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── PartidaCard — card de uma partida individual ─────────────────────────────
function PartidaCard({ numero, partida: p, timeANome, timeBNome, corA, corB }) {
  const [aberto, setAberto]    = useState(false)
  const [timeline, setTimeline] = useState(false)

  if (!p) return null

  const concluida  = p.status === 'concluida'
  const picksA     = p.picks?.A ?? []
  const picksB     = p.picks?.B ?? []
  const bansA      = p.bans?.A  ?? []
  const bansB      = p.bans?.B  ?? []
  const globalBans = p.globalBans ?? []
  const historico  = p.historico  ?? []
  const vencedor   = p.vencedor === 'timeA' ? timeANome : p.vencedor === 'timeB' ? timeBNome : null
  const mapaNome   = p.mapaId ? (MAPA_MAP[p.mapaId]?.nome ?? p.mapaId) : null

  const temDraftData = concluida && (picksA.length > 0 || picksB.length > 0 || bansA.length > 0 || bansB.length > 0)

  return (
    <div className={`cd-partida${concluida ? ' cd-partida--concluida' : ''}`}>
      <div className="cd-partida-header" onClick={() => temDraftData && setAberto(v => !v)} style={{ cursor: temDraftData ? 'pointer' : 'default' }}>
        <div className="cd-partida-header-left">
          <span className="cd-partida-num">Partida {numero}</span>
          {mapaNome && <span className="cd-partida-mapa">{mapaNome}</span>}
          {concluida && vencedor && (
            <span className="cd-partida-vencedor" style={{ color: p.vencedor === 'timeA' ? corA : corB }}>
              Vitória: {vencedor}
            </span>
          )}
          {!concluida && (
            <span className="cd-partida-status">
              {p.status === 'em_draft' ? '⚡ Draft em andamento' : 'Aguardando'}
            </span>
          )}
        </div>
        {temDraftData && (
          <span className="cd-partida-toggle">{aberto ? '▲ Fechar' : '▼ Picks & Bans'}</span>
        )}
      </div>

      {aberto && temDraftData && (
        <div className="cd-partida-body">
          {/* Global bans (Madness) */}
          {globalBans.length > 0 && (
            <div className="cd-section">
              <div className="cd-section-label cd-section-label--madness">⚡ Bans globais (Soft Madness)</div>
              <div className="cd-hero-row">
                {globalBans.map(id => <HeroChip key={id} heroId={id} variant="ban" />)}
              </div>
            </div>
          )}

          {/* Picks por time */}
          <div className="cd-dois-times">
            <div className="cd-time-col">
              <div className="cd-time-col-titulo" style={{ color: corA }}>{timeANome}</div>
              {picksA.length > 0 && (
                <div className="cd-section">
                  <div className="cd-section-label">Picks</div>
                  <div className="cd-hero-row">
                    {picksA.map(id => <HeroChip key={id} heroId={id} variant="pick" />)}
                  </div>
                </div>
              )}
              {bansA.length > 0 && (
                <div className="cd-section">
                  <div className="cd-section-label">Bans</div>
                  <div className="cd-hero-row">
                    {bansA.map(id => <HeroChip key={id} heroId={id} variant="ban" />)}
                  </div>
                </div>
              )}
            </div>
            <div className="cd-time-col">
              <div className="cd-time-col-titulo" style={{ color: corB }}>{timeBNome}</div>
              {picksB.length > 0 && (
                <div className="cd-section">
                  <div className="cd-section-label">Picks</div>
                  <div className="cd-hero-row">
                    {picksB.map(id => <HeroChip key={id} heroId={id} variant="pick" />)}
                  </div>
                </div>
              )}
              {bansB.length > 0 && (
                <div className="cd-section">
                  <div className="cd-section-label">Bans</div>
                  <div className="cd-hero-row">
                    {bansB.map(id => <HeroChip key={id} heroId={id} variant="ban" />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sequência completa */}
          {historico.length > 0 && (
            <div className="cd-timeline-wrap">
              <button className="cd-timeline-btn" onClick={() => setTimeline(v => !v)}>
                {timeline ? '▲ Fechar sequência completa' : '▼ Ver sequência de picks/bans'}
              </button>
              {timeline && (
                <DraftTimeline
                  historico={historico}
                  timeANome={timeANome}
                  timeBNome={timeBNome}
                  corA={corA}
                  corB={corB}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ConfrontoDetalhe() {
  const { idPublico } = useCampeonato()
  const { confrontoId } = useParams()

  const [confronto, setConfronto] = useState(null)
  const [times,     setTimes]     = useState({})
  const [loading,   setLoading]   = useState(true)
  const [erro,      setErro]      = useState(null)

  useEffect(() => {
    if (!idPublico || !confrontoId) return
    const unsub = onValue(
      ref(db, `${confrontosPath(idPublico)}/${confrontoId}`),
      snap => { setConfronto(snap.val()); setLoading(false) },
      err  => { setErro(err.message);    setLoading(false) },
    )
    return () => unsub()
  }, [idPublico, confrontoId])

  useEffect(() => {
    if (!idPublico) return
    return onValue(ref(db, teamPath(idPublico)), snap => setTimes(snap.val() ?? {}))
  }, [idPublico])

  if (loading) return (
    <div className="cd-root">
      <div className="cd-loading">Carregando...</div>
    </div>
  )

  if (erro) return (
    <div className="cd-root">
      <div className="cd-erro">Erro ao carregar: {erro}</div>
    </div>
  )

  if (!confronto) return (
    <div className="cd-root">
      <div className="cd-erro">Confronto não encontrado.</div>
    </div>
  )

  const tA = times[confronto.timeA]
  const tB = times[confronto.timeB]
  const corA = tA?.cor ?? 'var(--blue)'
  const corB = tB?.cor ?? 'var(--red)'
  const nomeA = tA?.nome ?? 'Time A'
  const nomeB = tB?.nome ?? 'Time B'

  const partidas = confronto.partidas ?? {}
  const partidasArr = Object.entries(partidas).sort(([a], [b]) => Number(a) - Number(b))

  const winsA = partidasArr.filter(([, p]) => p.vencedor === 'timeA').length
  const winsB = partidasArr.filter(([, p]) => p.vencedor === 'timeB').length

  const temResultado = confronto.resultado?.timeA !== undefined

  const madness = confronto.madness
  const MADNESS_BADGE = {
    soft: { label: '⚡ Soft Madness', cor: 'var(--purple)' },
    convencional: { label: '⚡ Madness', cor: 'var(--gold)' },
  }

  return (
    <div className="cd-root">
      {/* Cabeçalho do confronto */}
      <div className="cd-header">
        <div className="cd-header-times">
          <div className="cd-header-time cd-header-time--a">
            <span className="cd-header-dot" style={{ background: corA }} />
            <span className="cd-header-nome" style={{ color: corA }}>{nomeA}</span>
          </div>

          <div className="cd-header-placar">
            {temResultado ? (
              <>
                <span className="cd-placar-num">{confronto.resultado.timeA}</span>
                <span className="cd-placar-sep">×</span>
                <span className="cd-placar-num">{confronto.resultado.timeB}</span>
              </>
            ) : partidasArr.length > 0 ? (
              <>
                <span className="cd-placar-num">{winsA}</span>
                <span className="cd-placar-sep">×</span>
                <span className="cd-placar-num">{winsB}</span>
              </>
            ) : (
              <span className="cd-placar-vs">VS</span>
            )}
          </div>

          <div className="cd-header-time cd-header-time--b">
            <span className="cd-header-nome" style={{ color: corB }}>{nomeB}</span>
            <span className="cd-header-dot" style={{ background: corB }} />
          </div>
        </div>

        <div className="cd-header-meta">
          {confronto.formato && (
            <span className="cd-badge cd-badge--formato">{confronto.formato}</span>
          )}
          {confronto.tipo && confronto.tipo !== 'regular' && (
            <span className="cd-badge">{confronto.tipo}</span>
          )}
          {madness && madness !== 'desativado' && MADNESS_BADGE[madness] && (
            <span className="cd-badge" style={{ color: MADNESS_BADGE[madness].cor, borderColor: MADNESS_BADGE[madness].cor + '55' }}>
              {MADNESS_BADGE[madness].label}
            </span>
          )}
          {confronto.encerradoEm && (
            <span className="cd-badge cd-badge--data">{formatarData(confronto.encerradoEm)}</span>
          )}
        </div>
      </div>

      {/* Partidas */}
      {partidasArr.length === 0 ? (
        <div className="cd-sem-partidas">Nenhuma partida registrada ainda.</div>
      ) : (
        <div className="cd-partidas">
          <h2 className="cd-secao-titulo">Partidas</h2>
          {partidasArr.map(([n, p]) => (
            <PartidaCard
              key={n}
              numero={n}
              partida={p}
              timeANome={nomeA}
              timeBNome={nomeB}
              corA={corA}
              corB={corB}
            />
          ))}
        </div>
      )}
    </div>
  )
}
