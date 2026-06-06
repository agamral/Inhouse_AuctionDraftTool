import { useState, useEffect, Fragment } from 'react'
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

// ── DraftTimeline — linha do tempo horizontal ────────────────────────────────
function HeroStep({ passo: p, corTime, nomeTime, isBan }) {
  const icone = heroIcone(p.heroiId)
  const nome  = heroNome(p.heroiId)
  const cor   = isBan ? 'var(--red)' : 'var(--green)'
  return (
    <div className="cd-tl-step" style={{ '--step-cor': cor }}>
      <div className="cd-tl-circle">
        <span className="cd-tl-num">{p.passo + 1}</span>
      </div>
      <span className="cd-tl-acao" style={{ color: cor }}>{isBan ? 'BAN' : 'PICK'}</span>
      <div className="cd-tl-hero-wrap">
        {icone
          ? <img src={icone} alt={nome} className="cd-tl-hero-img" onError={e => { e.target.style.display = 'none' }} />
          : <div className="cd-tl-hero-placeholder">{nome[0]}</div>
        }
      </div>
      <span className="cd-tl-hero-nome">{nome}</span>
      <span className="cd-tl-time-nome" style={{ color: corTime }}>{nomeTime}</span>
    </div>
  )
}

function DraftTimeline({ historico, timeANome, timeBNome, corA, corB }) {
  const [porTime, setPorTime] = useState(false)

  if (!historico?.length) {
    return <div className="cd-timeline-vazio">Sequência de draft não disponível para esta partida.</div>
  }

  const passos = [...historico].sort((a, b) => a.passo - b.passo)

  return (
    <div className="cd-tl-container">
      <div className="cd-tl-header">
        <span className="cd-tl-titulo">Ordem do Draft</span>
        <button className="cd-tl-toggle-btn" onClick={() => setPorTime(v => !v)}>
          ⇄ {porTime ? 'Ver linear' : 'Ver por time'}
        </button>
      </div>

      {!porTime ? (
        /* Vista linear */
        <div className="cd-tl-track">
          {passos.map((p, i) => (
            <HeroStep key={i} passo={p}
              isBan={p.acao === 'ban'}
              corTime={p.time === 'A' ? corA : corB}
              nomeTime={p.time === 'A' ? timeANome : timeBNome}
            />
          ))}
        </div>
      ) : (
        /* Vista por time */
        <div className="cd-tl-byteam">
          {[
            { lado: 'A', nome: timeANome, cor: corA },
            { lado: 'B', nome: timeBNome, cor: corB },
          ].map(({ lado, nome, cor }) => {
            const doTime = passos.filter(p => p.time === lado)
            return (
              <div key={lado} className="cd-tl-byteam-row">
                <div className="cd-tl-byteam-label" style={{ color: cor }}>{nome}</div>
                <div className="cd-tl-track cd-tl-track--compact">
                  {doTime.map((p, i) => (
                    <HeroStep key={i} passo={p}
                      isBan={p.acao === 'ban'}
                      corTime={cor}
                      nomeTime={nome}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── PartidaCard ───────────────────────────────────────────────────────────────
function PartidaCard({ numero, partida: p, tA, tB, corA, corB, timeANome, timeBNome, replayGame }) {
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

            {/* Resumo */}
            <div className="cd-info-panel cd-info-panel--resumo">
              <div className="cd-info-panel-label">Resumo da Partida</div>
              {replayGame?.match ? (
                <div className="cd-resumo-grid">
                  {[
                    { label: 'Duração',    val: replayGame.match.duration ?? '--:--' },
                    { label: 'Nível Máx',  val: (() => {
                      const ps = replayGame.players ? Object.values(replayGame.players) : []
                      const lvA = Math.max(0, ...ps.filter(x => x.team === 1).map(x => x.level || 0))
                      const lvB = Math.max(0, ...ps.filter(x => x.team === 2).map(x => x.level || 0))
                      return lvA && lvB ? `${lvA} × ${lvB}` : '--'
                    })() },
                    { label: 'Takedowns',  val: (() => {
                      const t1 = replayGame.teams?.team1?.takedowns ?? '--'
                      const t2 = replayGame.teams?.team2?.takedowns ?? '--'
                      return `${t1} × ${t2}`
                    })() },
                    { label: 'Modo',       val: replayGame.match.game_mode ?? '?' },
                  ].map(({ label, val }) => (
                    <div key={label} className="cd-resumo-item">
                      <div className="cd-resumo-label">{label}</div>
                      <div className="cd-resumo-val" style={{ fontSize: label === 'Modo' ? 12 : undefined }}>{val}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="cd-resumo-grid">
                    {[
                      { label: 'Duração', val: '--:--' },
                      { label: 'Nível Final', val: '-- × --' },
                      { label: 'Abates', val: '-- × --' },
                    ].map(({ label, val }) => (
                      <div key={label} className="cd-resumo-item">
                        <div className="cd-resumo-label">{label}</div>
                        <div className="cd-resumo-val">{val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="cd-resumo-hint">Em breve via replay</div>
                </>
              )}
            </div>

            {/* VOD — placeholder */}
            <div className="cd-info-panel cd-info-panel--vod">
              <div className="cd-info-panel-label">VOD</div>
              <button className="cd-vod-btn" disabled>▶ Assistir Partida</button>
              <div className="cd-resumo-hint">Disponível em breve</div>
            </div>
          </div>

          {/* Linha do tempo */}
          {historico.length > 0 && (
            <div className="cd-timeline-wrap">
              <button className="cd-timeline-btn" onClick={e => { e.stopPropagation(); setTimeline(v => !v) }}>
                {timeline ? '▲ Fechar sequência de picks/bans' : '▼ Ver sequência de picks/bans'}
              </button>
              {timeline && (
                <DraftTimeline historico={historico} timeANome={timeANome} timeBNome={timeBNome} corA={corA} corB={corB} />
              )}
            </div>
          )}

          {/* Stats de replay */}
          {replayGame?.players && (
            <ReplayStatsSection
              replayGame={replayGame}
              corA={corA}
              corB={corB}
              timeANome={timeANome}
              timeBNome={timeBNome}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers de stats ─────────────────────────────────────────────────────────

function fmtNum(n) {
  if (!n) return '0'
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

// ── ReplayStatsSection ────────────────────────────────────────────────────────

function ReplayStatsSection({ replayGame, corA, corB, timeANome, timeBNome }) {
  const [talentsOpen, setTalentsOpen] = useState({})

  const players = replayGame.players ? Object.values(replayGame.players)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)) : []

  const team1 = players.filter(p => p.team === 1)
  const team2 = players.filter(p => p.team === 2)

  const teamCfg = [
    { players: team1, result: replayGame.teams?.team1?.result, tds: replayGame.teams?.team1?.takedowns, nome: timeANome, cor: corA, key: 'team1' },
    { players: team2, result: replayGame.teams?.team2?.result, tds: replayGame.teams?.team2?.takedowns, nome: timeBNome, cor: corB, key: 'team2' },
  ]

  return (
    <div className="cd-replay-section">
      <div className="cd-replay-section-title">Estatísticas do Replay</div>

      {teamCfg.map(({ players: tp, result, tds, nome, cor, key }) => (
        <div key={key} className="cd-replay-team-block">
          <div className="cd-replay-team-header">
            <span className="cd-replay-team-nome" style={{ color: cor }}>{nome}</span>
            <span className={`cd-replay-result-badge ${result === 'win' ? 'cd-replay-result-badge--win' : 'cd-replay-result-badge--loss'}`}>
              {result === 'win' ? 'VITÓRIA' : result === 'loss' ? 'DERROTA' : '?'}
            </span>
            <span className="cd-replay-td-total">{tds ?? 0} TD</span>
          </div>

          <div className="cd-replay-table-wrap">
            <table className="cd-replay-table">
              <thead>
                <tr>
                  <th>Herói</th>
                  <th>Jogador</th>
                  <th>K/D/A</th>
                  <th>TD</th>
                  <th>Dano</th>
                  <th>Cura</th>
                  <th>Nível</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tp.map((p, idx) => {
                  const slotKey  = `${key}_${p.slot ?? idx}`
                  const open     = !!talentsOpen[slotKey]
                  const hasTalents = (p.talents?.length ?? 0) > 0
                  return (
                    <Fragment key={slotKey}>
                      <tr className="cd-replay-row">
                        <td className="cd-replay-hero">{p.hero}</td>
                        <td className="cd-replay-btag">{p.battletag}</td>
                        <td className="cd-replay-kda">
                          <span style={{ color: 'var(--green)' }}>{p.kills ?? 0}</span>
                          <span style={{ color: 'var(--text3)' }}>/</span>
                          <span style={{ color: 'var(--red)' }}>{p.deaths ?? 0}</span>
                          <span style={{ color: 'var(--text3)' }}>/</span>
                          <span style={{ color: 'var(--blue)' }}>{p.assists ?? 0}</span>
                        </td>
                        <td className="cd-replay-td-cell">{p.takedowns ?? 0}</td>
                        <td className="cd-replay-num">{fmtNum(p.hero_damage)}</td>
                        <td className="cd-replay-num">{fmtNum((p.healing || 0) + (p.self_healing || 0))}</td>
                        <td className="cd-replay-num">{p.level ?? '—'}</td>
                        <td>
                          {hasTalents && (
                            <button
                              className="cd-replay-expand-btn"
                              onClick={() => setTalentsOpen(prev => ({ ...prev, [slotKey]: !prev[slotKey] }))}
                            >
                              {open ? '▲' : '▼ build'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && hasTalents && (
                        <tr className="cd-replay-talents-row">
                          <td colSpan={8}>
                            <div className="cd-replay-talents">
                              {p.talents.map((t, ti) => (
                                <div key={ti} className="cd-replay-talent-badge">
                                  <span className="cd-replay-talent-level">Lv{t.level}</span>
                                  <span className="cd-replay-talent-name">{t.name ?? `idx ${t.absolute_index}`}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
  const replayData  = confronto.replays ?? {}

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
              replayGame={replayData[`game${n}`] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
