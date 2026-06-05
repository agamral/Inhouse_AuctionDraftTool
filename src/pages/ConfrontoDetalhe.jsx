import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { confrontosPath, teamPath } from '../utils/campeonatoPaths'
import { HEROES } from '../utils/heroPool'
import { getMapaById } from '../utils/mapPool'
import TeamIcon from '../components/TeamIcon'
import './ConfrontoDetalhe.css'

// ── Helpers ───────────────────────────────────────────────────────────────────
const HERO_MAP = Object.fromEntries(HEROES.map(h => [h.id, h]))

function heroNome(id)  { return HERO_MAP[id]?.nome     ?? id   }
function heroIcone(id) { return HERO_MAP[id]?.iconeUrl ?? null }

function formatarData(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── HeroCard — portrait grande para picks ────────────────────────────────────
function HeroCard({ heroId }) {
  const nome  = heroNome(heroId)
  const icone = heroIcone(heroId)
  return (
    <div className="cd-hero-card" title={nome}>
      <div className="cd-hero-card-img-wrap">
        {icone
          ? <img src={icone} alt={nome} className="cd-hero-card-img" onError={e => { e.target.style.display = 'none' }} />
          : <div className="cd-hero-card-placeholder">{nome[0]}</div>
        }
      </div>
      <div className="cd-hero-card-nome">{nome}</div>
    </div>
  )
}

// ── BanCard — portrait menor com overlay de proibido ─────────────────────────
function BanCard({ heroId }) {
  const nome  = heroNome(heroId)
  const icone = heroIcone(heroId)
  return (
    <div className="cd-ban-card" title={nome}>
      <div className="cd-ban-card-img-wrap">
        {icone
          ? <img src={icone} alt={nome} className="cd-ban-card-img" onError={e => { e.target.style.display = 'none' }} />
          : <div className="cd-ban-card-placeholder">{nome[0]}</div>
        }
        <div className="cd-ban-card-overlay">⊘</div>
      </div>
      <div className="cd-ban-card-nome">{nome}</div>
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
          <div key={i} className={`cd-timeline-step cd-timeline-step--${p.acao}`}>
            <div className="cd-timeline-step-num">{p.passo + 1}</div>
            <div className="cd-timeline-step-acao" style={{ color: ehBan ? 'var(--red)' : 'var(--green)' }}>
              {ehBan ? 'BAN' : 'PICK'}
            </div>
            <div className="cd-timeline-step-time" style={{ color: cor }}>{nomeTime}</div>
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

// ── PartidaCard ───────────────────────────────────────────────────────────────
function PartidaCard({ numero, partida: p, tA, tB, corA, corB, timeANome, timeBNome }) {
  const temDraftData = p?.status === 'concluida' &&
    ((p.picks?.A?.length ?? 0) + (p.picks?.B?.length ?? 0)) > 0

  const [aberto,   setAberto]   = useState(temDraftData)
  const [timeline, setTimeline] = useState(false)

  if (!p) return null

  const concluida  = p.status === 'concluida'
  const picksA     = p.picks?.A    ?? []
  const picksB     = p.picks?.B    ?? []
  const bansA      = p.bans?.A     ?? []
  const bansB      = p.bans?.B     ?? []
  const globalBans = p.globalBans  ?? []
  const historico  = p.historico   ?? []
  const vencedor   = p.vencedor === 'timeA' ? timeANome : p.vencedor === 'timeB' ? timeBNome : null
  const vencedorLado = p.vencedor
  const mapa       = p.mapaId ? getMapaById(p.mapaId) : null

  return (
    <div className={`cd-partida${concluida ? ' cd-partida--concluida' : ''}`}>
      {/* ── Cabeçalho da partida ── */}
      <div
        className="cd-partida-header"
        onClick={() => temDraftData && setAberto(v => !v)}
        style={{ cursor: temDraftData ? 'pointer' : 'default' }}
      >
        <div className="cd-partida-header-left">
          <span className="cd-partida-num">Partida {numero}</span>

          {mapa && (
            <div className="cd-partida-mapa-badge">
              <img src={mapa.splashUrl} alt={mapa.nome} className="cd-partida-mapa-thumb"
                onError={e => { e.target.style.display = 'none' }} />
              <span>{mapa.nome}</span>
            </div>
          )}

          {concluida && vencedor && (
            <span className="cd-partida-vencedor" style={{ color: vencedorLado === 'timeA' ? corA : corB }}>
              🏆 Vitória: {vencedor}
            </span>
          )}
          {!concluida && (
            <span className="cd-partida-status">
              {p.status === 'em_draft' ? '⚡ Draft em andamento' : 'Aguardando'}
            </span>
          )}
        </div>

        <div className="cd-partida-header-right">
          {p.encerradoEm && <span className="cd-partida-data">{formatarData(p.encerradoEm)}</span>}
          {temDraftData && (
            <span className="cd-partida-toggle">{aberto ? '▲ Fechar' : '▼ Abrir'}</span>
          )}
        </div>
      </div>

      {/* ── Corpo ── */}
      {aberto && temDraftData && (
        <div className="cd-partida-body">

          {/* Bans globais (Madness) */}
          {globalBans.length > 0 && (
            <div className="cd-global-bans">
              <span className="cd-global-bans-label">⚡ Bans Globais (Soft Madness)</span>
              <div className="cd-global-bans-row">
                {globalBans.map(id => <BanCard key={id} heroId={id} />)}
              </div>
            </div>
          )}

          {/* ── Grid de picks — dois times com VS no meio ── */}
          <div className="cd-picks-grid">
            {/* Time A */}
            <div className="cd-picks-side cd-picks-side--a">
              <div className="cd-picks-time-header">
                <TeamIcon time={tA} size={28} />
                <span style={{ color: corA, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {timeANome}
                </span>
              </div>
              <div className="cd-picks-row">
                {picksA.map(id => <HeroCard key={id} heroId={id} />)}
              </div>
              {bansA.length > 0 && (
                <div className="cd-bans-row-side">
                  <span className="cd-bans-label">Bans</span>
                  <div className="cd-bans-row">
                    {bansA.map(id => <BanCard key={id} heroId={id} />)}
                  </div>
                </div>
              )}
            </div>

            {/* VS */}
            <div className="cd-picks-vs">VS</div>

            {/* Time B */}
            <div className="cd-picks-side cd-picks-side--b">
              <div className="cd-picks-time-header cd-picks-time-header--b">
                <span style={{ color: corB, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {timeBNome}
                </span>
                <TeamIcon time={tB} size={28} />
              </div>
              <div className="cd-picks-row cd-picks-row--b">
                {picksB.map(id => <HeroCard key={id} heroId={id} />)}
              </div>
              {bansB.length > 0 && (
                <div className="cd-bans-row-side cd-bans-row-side--b">
                  <span className="cd-bans-label">Bans</span>
                  <div className="cd-bans-row cd-bans-row--b">
                    {bansB.map(id => <BanCard key={id} heroId={id} />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Painel inferior ── */}
          <div className="cd-info-panels">
            {/* Mapa */}
            <div className="cd-info-panel cd-info-panel--mapa">
              <div className="cd-info-panel-label">Mapa</div>
              {mapa ? (
                <>
                  <img src={mapa.splashUrl} alt={mapa.nome} className="cd-mapa-splash"
                    onError={e => { e.target.style.display = 'none' }} />
                  <div className="cd-mapa-nome">{mapa.nome}</div>
                </>
              ) : (
                <div className="cd-info-vazio">—</div>
              )}
            </div>

            {/* Resumo — placeholder */}
            <div className="cd-info-panel cd-info-panel--resumo">
              <div className="cd-info-panel-label">Resumo da Partida</div>
              <div className="cd-resumo-grid">
                {[
                  { label: 'Duração',     val: '--:--' },
                  { label: 'Nível Final', val: '-- × --' },
                  { label: 'Abates',      val: '-- × --' },
                  { label: 'Torres',      val: '-- × --' },
                ].map(({ label, val }) => (
                  <div key={label} className="cd-resumo-item">
                    <div className="cd-resumo-label">{label}</div>
                    <div className="cd-resumo-val">{val}</div>
                  </div>
                ))}
              </div>
              <div className="cd-resumo-hint">Em breve via replay</div>
            </div>

            {/* VOD — placeholder */}
            <div className="cd-info-panel cd-info-panel--vod">
              <div className="cd-info-panel-label">VOD</div>
              <button className="cd-vod-btn" disabled>▶ Assistir Partida</button>
              <div className="cd-resumo-hint">Disponível em breve</div>
            </div>
          </div>

          {/* Sequência completa */}
          {historico.length > 0 && (
            <div className="cd-timeline-wrap">
              <button className="cd-timeline-btn" onClick={e => { e.stopPropagation(); setTimeline(v => !v) }}>
                {timeline ? '▲ Fechar sequência completa' : '▼ Ver sequência de picks/bans'}
              </button>
              {timeline && (
                <DraftTimeline historico={historico} timeANome={timeANome} timeBNome={timeBNome} corA={corA} corB={corB} />
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
  const { idPublico }   = useCampeonato()
  const { confrontoId } = useParams()

  const [confronto, setConfronto] = useState(null)
  const [times,     setTimes]     = useState({})
  const [loading,   setLoading]   = useState(true)
  const [erro,      setErro]      = useState(null)

  useEffect(() => {
    if (!idPublico || !confrontoId) return
    return onValue(
      ref(db, `${confrontosPath(idPublico)}/${confrontoId}`),
      snap => { setConfronto(snap.val()); setLoading(false) },
      err  => { setErro(err.message);    setLoading(false) },
    )
  }, [idPublico, confrontoId])

  useEffect(() => {
    if (!idPublico) return
    return onValue(ref(db, teamPath(idPublico)), snap => setTimes(snap.val() ?? {}))
  }, [idPublico])

  if (loading) return <div className="cd-root"><div className="cd-loading">Carregando...</div></div>
  if (erro)    return <div className="cd-root"><div className="cd-erro">Erro: {erro}</div></div>
  if (!confronto) return <div className="cd-root"><div className="cd-erro">Confronto não encontrado.</div></div>

  const tA   = times[confronto.timeA]
  const tB   = times[confronto.timeB]
  const corA = tA?.cor ?? '#4a9eda'
  const corB = tB?.cor ?? '#e05555'
  const nomeA = tA?.nome ?? 'Time A'
  const nomeB = tB?.nome ?? 'Time B'

  const partidasArr = Object.entries(confronto.partidas ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))

  const winsA = partidasArr.filter(([, p]) => p.vencedor === 'timeA').length
  const winsB = partidasArr.filter(([, p]) => p.vencedor === 'timeB').length

  const temResultado = confronto.resultado?.timeA !== undefined
  const placarA = temResultado ? confronto.resultado.timeA : winsA
  const placarB = temResultado ? confronto.resultado.timeB : winsB

  const madness = confronto.madness
  const MADNESS = {
    soft:         { label: '⚡ SOFT MADNESS',    cor: '#9b6ee8' },
    convencional: { label: '⚡ MADNESS CONVENCIONAL', cor: '#c9a84c' },
  }

  return (
    <div className="cd-root">

      {/* ── Header ── */}
      <div className="cd-header" style={{
        '--corA': corA,
        '--corB': corB,
      }}>
        <div className="cd-header-bg-a" style={{ background: `linear-gradient(to right, ${corA}22, transparent)` }} />
        <div className="cd-header-bg-b" style={{ background: `linear-gradient(to left,  ${corB}22, transparent)` }} />

        <div className="cd-header-main">
          {/* Time A */}
          <div className="cd-header-side cd-header-side--a">
            <TeamIcon time={tA} size={64} radius={10} />
            <span className="cd-header-nome" style={{ color: corA }}>{nomeA}</span>
          </div>

          {/* Placar central */}
          <div className="cd-header-center">
            <div className="cd-header-placar">
              <span className="cd-placar-num" style={{ color: corA }}>{placarA}</span>
              <div className="cd-placar-mid">
                <span className="cd-placar-vs">VS</span>
                {confronto.formato && (
                  <span className="cd-badge cd-badge--formato">{confronto.formato}</span>
                )}
              </div>
              <span className="cd-placar-num" style={{ color: corB }}>{placarB}</span>
            </div>
          </div>

          {/* Time B */}
          <div className="cd-header-side cd-header-side--b">
            <span className="cd-header-nome" style={{ color: corB }}>{nomeB}</span>
            <TeamIcon time={tB} size={64} radius={10} />
          </div>
        </div>

        {/* Madness bar */}
        {madness && madness !== 'desativado' && MADNESS[madness] && (
          <div className="cd-madness-bar" style={{ color: MADNESS[madness].cor, borderColor: MADNESS[madness].cor + '55' }}>
            {MADNESS[madness].label}
          </div>
        )}
      </div>

      {/* ── Partidas ── */}
      {partidasArr.length === 0 ? (
        <div className="cd-sem-partidas">Nenhuma partida registrada ainda.</div>
      ) : (
        <div className="cd-partidas">
          {partidasArr.map(([n, p]) => (
            <PartidaCard
              key={n}
              numero={n}
              partida={p}
              tA={tA}
              tB={tB}
              corA={corA}
              corB={corB}
              timeANome={nomeA}
              timeBNome={nomeB}
            />
          ))}
        </div>
      )}
    </div>
  )
}
