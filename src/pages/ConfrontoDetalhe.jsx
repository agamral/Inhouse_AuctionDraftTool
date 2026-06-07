import { useState, useEffect, useRef, Fragment, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart, Area, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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

// Busca o herói da pool pelo nome vindo do replay (case-insensitive, remove prefixo "Hero" e pontos)
function findHeroByName(heroName) {
  if (!heroName) return null
  const n = heroName.toLowerCase().replace(/^hero/, '').replace(/\./g, '').replace(/\s+/g, '')
  return HEROES.find(h => {
    const hId   = (h.id   || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, '')
    const hNome = (h.nome || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, '')
    return hId === n || hNome === n
  }) ?? null
}

function heroIconeByName(heroName) {
  return findHeroByName(heroName)?.iconeUrl ?? null
}

// Resolve o nome do herói traduzido (mesmo esquema do Hero Draft: chave i18n
// "heroes.<id>" com fallback para o nome cru do replay quando não encontrado)
function heroNomeReplay(t, hero, heroIcon) {
  const h = findHeroByName(heroIcon) || findHeroByName(hero)
  if (!h) return hero
  return t('heroes.' + h.id, { defaultValue: h.nome })
}

// Monta o código de build no formato usado pelo "Copy Build" do próprio jogo:
// "T<7 dígitos>,<NomeHerói>" — cada dígito é a opção escolhida (1-3) em cada
// tier (Lv1,4,7,10,13,16,20), ou 0 se o talento não foi escolhido.
function buildTalentCode(player) {
  const porTier = {}
  for (const t of player.talents || []) {
    if (t.tier != null && t.choice != null) porTier[t.tier] = t.choice + 1
  }
  const digits = Array.from({ length: 7 }, (_, i) => porTier[i] ?? 0).join('')
  const heroNomeBuild = player.heroIcon || player.hero
  return `[T${digits},${heroNomeBuild}]`
}

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
                  ].map(({ label, val }) => (
                    <div key={label} className="cd-resumo-item">
                      <div className="cd-resumo-label">{label}</div>
                      <div className="cd-resumo-val">{val}</div>
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

// ── XpLeadChart ───────────────────────────────────────────────────────────────

function XpLeadChart({ xpTimeline, corA, corB, timeANome, timeBNome }) {
  const { t } = useTranslation()
  if (!Array.isArray(xpTimeline) || xpTimeline.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, lineHeight: 1.6 }}>
        {t('replay.noXpData')}<br />
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t('replay.uploadForChart')}</span>
      </div>
    )
  }

  // Ponto sintético no t=0 para o gráfico sempre começar na origem
  const origin = { t: 0, tMin: 0, label: '0:00', team1Xp: 0, team2Xp: 0,
                   team1Level: 1, team2Level: 1, xpLead: 0, posLead: 0, negLead: 0 }

  const data = [origin, ...xpTimeline.map(p => {
    const lead = p.team1Xp - p.team2Xp
    // floor para minuto inteiro: posiciona o ponto exatamente sobre o tick da grade
    const tMin = Math.floor(p.t / 60)
    return {
      ...p,
      tMin,
      label: `${tMin}:00`,
      xpLead:  lead,
      posLead: Math.max(0, lead),
      negLead: Math.min(0, lead),
    }
  })]

  // Domínio simétrico: pico máximo da diferença define teto e chão igualmente.
  // Isso garante que o zero fique no centro e o gráfico mostre o lead relativo,
  // não o XP absoluto acumulado dos times.
  const maxAbsLead = Math.max(...data.map(p => Math.abs(p.xpLead)), 200)
  const yRange     = Math.ceil(maxAbsLead * 1.2 / 100) * 100
  const yMin       = -yRange
  const yMax       = yRange
  const maxLead    = Math.max(...data.map(p => p.xpLead), 0)
  const minLead    = Math.min(...data.map(p => p.xpLead), 0)

  const fmtLead = v => {
    const abs = Math.abs(v)
    return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(abs)
  }
  const fmtAxis = v => {
    if (v === 0) return '0'
    return v > 0 ? `+${fmtLead(v)}` : `-${fmtLead(v)}`
  }
  const fmtMin = v => `${Math.floor(v)}:00`

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const lead    = d.xpLead
    const leadCor = lead > 0 ? corA : lead < 0 ? corB : 'var(--text2)'
    const leadNom = lead > 0 ? timeANome : timeBNome
    return (
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6,
        padding: '10px 14px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
        color: 'var(--text)',
      }}>
        <div style={{ marginBottom: 5, color: 'var(--text2)', fontSize: 11 }}>{d.label}</div>
        {lead !== 0
          ? <div style={{ color: leadCor, fontWeight: 700, fontSize: 13 }}>
              {t('replay.leadXp', { team: leadNom, value: fmtLead(lead) })}
            </div>
          : <div style={{ color: 'var(--text2)' }}>{t('replay.tie')}</div>
        }
        <div style={{ color: 'var(--text3)', marginTop: 5, fontSize: 11 }}>
          <span style={{ color: corA }}>Lv {d.team1Level}</span>
          {' · '}
          <span style={{ color: corB }}>Lv {d.team2Level}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <ReferenceLine
            yAxisId="xp" y={0}
            stroke="rgba(255,255,255,0.25)" strokeWidth={1.5}
            label={{ value: '0', position: 'insideLeft', fontSize: 9, fill: 'rgba(255,255,255,0.3)', fontFamily: 'Barlow Condensed' }}
          />
          {/* Labels de quem está na frente — aparecem se houver dados no lado */}
          {maxLead > 50 && (
            <ReferenceLine yAxisId="xp" y={maxLead * 0.6}
              stroke="none"
              label={{ value: `▲ ${timeANome}`, position: 'insideTopRight', fontSize: 9, fill: corA, fontFamily: 'Barlow Condensed', opacity: 0.6 }}
            />
          )}
          {minLead < -50 && (
            <ReferenceLine yAxisId="xp" y={minLead * 0.6}
              stroke="none"
              label={{ value: `▼ ${timeBNome}`, position: 'insideBottomRight', fontSize: 9, fill: corB, fontFamily: 'Barlow Condensed', opacity: 0.6 }}
            />
          )}
          <XAxis
            dataKey="tMin"
            type="number"
            domain={[0, 'dataMax']}
            ticks={Array.from({ length: Math.ceil(Math.max(...data.map(p => p.tMin))) + 1 }, (_, i) => i)}
            tickFormatter={v => `${v}`}
            tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'Barlow Condensed' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            yAxisId="xp"
            orientation="left"
            domain={[yMin, yMax]}
            tickFormatter={fmtAxis}
            tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'Barlow Condensed' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Área Time A — acima do zero */}
          <Area yAxisId="xp" type="linear" dataKey="posLead"
            fill={corA} fillOpacity={0.38} stroke="none" dot={false} legendType="none" baseValue={0} />
          {/* Área Time B — abaixo do zero */}
          <Area yAxisId="xp" type="linear" dataKey="negLead"
            fill={corB} fillOpacity={0.38} stroke="none" dot={false} legendType="none" baseValue={0} />
          {/* Linha de lead */}
          <Line yAxisId="xp" type="linear" dataKey="xpLead"
            stroke="rgba(255,255,255,0.2)" strokeWidth={1} dot={false} legendType="none" />

          <Legend
            content={() => (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, paddingTop: 8 }}>
                {[{ cor: corA, label: timeANome }, { cor: corB, label: timeBNome }].map(({ cor, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 8, background: cor, opacity: 0.55, borderRadius: 2 }} />
                    <span style={{ fontSize: 11, fontFamily: 'Barlow Condensed', color: cor, fontWeight: 700 }}>{label} Lead</span>
                  </div>
                ))}
              </div>
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Helpers compartilhados ────────────────────────────────────────────────────

function normalizeArr(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'object') return Object.values(val)
  return []
}

function fmtTime(t) {
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// Portrait inline reutilizável (tamanho configurável)
// heroIcon: nome canônico em inglês vindo do parser (resolve heróis com m_hero localizado, ex: "Asa da Morte" → "Deathwing")
function HeroPortrait({ hero, heroIcon, cor, victim, size = 28 }) {
  const { t } = useTranslation()
  const [err, setErr] = useState(false)
  const icone  = heroIconeByName(heroIcon) || heroIconeByName(hero)
  const nomeTr = heroNomeReplay(t, hero, heroIcon)
  return (
    <div
      className={`cd-ev-portrait${victim ? ' cd-ev-portrait--victim' : ''}`}
      style={{ '--cor': cor, width: size, height: size, flexShrink: 0 }}
      title={nomeTr || '?'}
    >
      {icone && !err
        ? <img src={icone} alt={nomeTr} className="cd-ev-portrait-img" onError={() => setErr(true)} />
        : <span className="cd-ev-portrait-fb" style={{ fontSize: Math.max(8, size * 0.38) }}>
            {((nomeTr || '?')[0]).toUpperCase()}
          </span>
      }
    </div>
  )
}

// Badge de talento com tooltip customizado (via portal — evita ser cortado por
// containers com overflow:hidden) seguindo o tema visual do site
function TalentBadge({ talent: t }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  const handleEnter = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })
  }
  const handleLeave = () => setPos(null)

  return (
    <div
      ref={ref}
      className="cd-replay-talent-badge"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {t.icon && (
        <img className="cd-replay-talent-icon" src={t.icon} alt="" loading="lazy"
             onError={e => { e.currentTarget.style.display = 'none' }} />
      )}
      <div className="cd-replay-talent-info">
        <span className="cd-replay-talent-level">Lv{t.level}</span>
        <span className="cd-replay-talent-name">{t.name ?? `idx ${t.absolute_index}`}</span>
      </div>
      {t.description && pos && createPortal(
        <div className="cd-replay-talent-tooltip" style={{ top: pos.top, left: pos.left }}>
          <div className="cd-replay-talent-tooltip-name">{t.name}</div>
          <div className="cd-replay-talent-tooltip-desc">{t.description}</div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ── EventTimeline — eixo horizontal com Time A acima e Time B abaixo ──────────

function EventTimeline({ eventTimeline, corA, corB, timeANome, timeBNome }) {
  const { t } = useTranslation()
  const [tooltip, setTooltip] = useState(null)   // { idx, isTop }

  const events = useMemo(() => {
    if (!Array.isArray(eventTimeline) || !eventTimeline.length) return []

    const maxT = Math.max(...eventTimeline.map(e => e.t)) + 60

    // Kill events go on the killer's team side; others on their own team's side
    function side(ev) {
      if (ev.type === 'kill') {
        const killers = normalizeArr(ev.killers)
        return killers[0]?.team ?? (ev.victim?.team === 1 ? 2 : 1)
      }
      return ev.team
    }

    // Assign vertical stack level to avoid overlapping icons
    const OVERLAP = 0.044   // fraction of total width
    const used1 = [], used2 = []

    return eventTimeline.map(ev => {
      const team = side(ev)
      const xPct = ev.t / maxT
      const used = team === 1 ? used1 : used2
      let level = 0
      while (used.some(u => u.level === level && Math.abs(u.xPct - xPct) < OVERLAP)) level++
      used.push({ xPct, level })
      return { ...ev, _team: team, _xPct: xPct, _level: level, _maxT: maxT }
    })
  }, [eventTimeline])

  if (!events.length) {
    return (
      <div className="cd-ev-empty">
        {t('replay.noEventsData')}<br />
        <span>{t('replay.uploadForTimeline')}</span>
      </div>
    )
  }

  const maxT     = events[0]._maxT
  const maxLv1   = Math.max(0, ...events.filter(e => e._team === 1).map(e => e._level))
  const maxLv2   = Math.max(0, ...events.filter(e => e._team === 2).map(e => e._level))
  const ICON     = 28
  const GAP      = 4
  const AXIS_H   = 22
  const SIDE1_H  = Math.max(56, (maxLv1 + 1) * (ICON + GAP) + 10)
  const SIDE2_H  = Math.max(56, (maxLv2 + 1) * (ICON + GAP) + 10)
  const TOTAL_H  = SIDE1_H + AXIS_H + SIDE2_H

  const tickStep = maxT <= 600 ? 60 : maxT <= 1200 ? 120 : 180
  const ticks    = Array.from({ length: Math.floor(maxT / tickStep) + 1 }, (_, i) => i * tickStep)

  function teamCor(team)  { return team === 1 ? corA : corB }
  function teamNome(team) { return team === 1 ? timeANome : timeBNome }

  function TooltipContent({ ev }) {
    const killers = normalizeArr(ev.killers)
    if (ev.type === 'kill') return (
      <div className="cd-htl-tooltip-inner">
        <div className="cd-htl-tooltip-time">{fmtTime(ev.t)}</div>
        <div className="cd-htl-tooltip-row">
          <HeroPortrait hero={ev.victim?.hero} heroIcon={ev.victim?.heroIcon} cor={teamCor(ev.victim?.team)} victim size={20} />
          <span className="cd-htl-tooltip-sep">←</span>
          {killers.slice(0, 3).map((k, ki) => (
            <HeroPortrait key={ki} hero={k.hero} heroIcon={k.heroIcon} cor={teamCor(k.team)} size={20} />
          ))}
          {killers.length > 3 && <span style={{ fontSize: 10, color: 'var(--text3)' }}>+{killers.length - 3}</span>}
        </div>
        <div className="cd-htl-tooltip-label" style={{ color: teamCor(ev._team) }}>
          {t('replay.killedBy', { team: teamNome(ev._team), hero: heroNomeReplay(t, ev.victim?.hero, ev.victim?.heroIcon) })}
        </div>
      </div>
    )
    if (ev.type === 'camp') return (
      <div className="cd-htl-tooltip-inner">
        <div className="cd-htl-tooltip-time">{fmtTime(ev.t)}</div>
        <div className="cd-htl-tooltip-label" style={{ color: teamCor(ev._team) }}>
          {t('replay.captured', { team: teamNome(ev._team), camp: t(`replay.campTypes.${ev.campType}`, { defaultValue: ev.campType }) })}
        </div>
      </div>
    )
    if (ev.type === 'objective') return (
      <div className="cd-htl-tooltip-inner">
        <div className="cd-htl-tooltip-time">{fmtTime(ev.t)}</div>
        <div className="cd-htl-tooltip-label" style={{ color: teamCor(ev._team) }}>
          {t('replay.objectiveCaptured', { team: teamNome(ev._team) })}
        </div>
      </div>
    )
    return null
  }

  return (
    <div className="cd-htl-wrap">
      {/* Team labels flanking the axis */}
      <div className="cd-htl-side-labels">
        <span className="cd-htl-side-label" style={{ color: corA }}>{timeANome}</span>
        <span className="cd-htl-side-label" style={{ color: corB }}>{timeBNome}</span>
      </div>

      {/* Track */}
      <div className="cd-htl-track" style={{ height: TOTAL_H }}>
        {/* Background zones — fundo sutil para cada time */}
        <div className="cd-htl-zone" style={{ top: 0, height: SIDE1_H, background: corA }} />
        <div className="cd-htl-zone" style={{ top: SIDE1_H + AXIS_H, height: SIDE2_H, background: corB }} />

        {/* Axis line */}
        <div className="cd-htl-axis" style={{ top: SIDE1_H }} />

        {/* Time ticks */}
        {ticks.map(t => (
          <div key={t} className="cd-htl-tick" style={{ left: `${(t / maxT) * 100}%`, top: SIDE1_H }}>
            <div className="cd-htl-tick-line" />
            <span className="cd-htl-tick-label">{fmtTime(t)}</span>
          </div>
        ))}

        {/* Events */}
        {events.map((ev, i) => {
          const isTop       = ev._team === 1
          const cor         = teamCor(ev._team)
          const yOff        = ev._level * (ICON + GAP)
          const top         = isTop
            ? SIDE1_H - ICON - yOff - 4    // acima do eixo, cresce para cima
            : SIDE1_H + AXIS_H + yOff + 4  // abaixo do eixo, cresce para baixo
          const connectorH  = yOff + 4     // distância da bolinha até o eixo

          const showTip = tooltip?.idx === i

          let victimHero = null
          let victimHeroIcon = null
          let icon       = null

          if (ev.type === 'kill') {
            victimHero     = ev.victim?.hero
            victimHeroIcon = ev.victim?.heroIcon
          }
          else if (ev.type === 'camp')      icon = '🛡'
          else if (ev.type === 'objective') icon = '⭐'

          return (
            <div
              key={i}
              className={`cd-htl-event${showTip ? ' cd-htl-event--active' : ''}`}
              style={{ left: `${ev._xPct * 100}%`, top, width: ICON, height: ICON, '--cor': cor }}
              onMouseEnter={() => setTooltip({ idx: i, isTop })}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Linha conectora até o eixo */}
              <div
                className={`cd-htl-connector${isTop ? '' : ' cd-htl-connector--bottom'}`}
                style={{ height: connectorH }}
              />

              {victimHero
                ? <HeroPortrait hero={victimHero} heroIcon={victimHeroIcon} cor={cor} victim size={ICON} />
                : <div className="cd-htl-event-ico">{icon}</div>
              }
              {showTip && (
                <div className={`cd-htl-tooltip cd-htl-tooltip--${isTop ? 'top' : 'bottom'}`}>
                  <TooltipContent ev={ev} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ReplayStatsSection ────────────────────────────────────────────────────────

function ReplayStatsSection({ replayGame, corA, corB, timeANome, timeBNome }) {
  const { t } = useTranslation()
  const [talentsOpen, setTalentsOpen] = useState({})
  const [view, setView] = useState('stats')  // 'stats' | 'chart' | 'events'
  const [copiedKey, setCopiedKey] = useState(null)

  const copyBuild = (slotKey, player) => {
    const code = buildTalentCode(player)
    navigator.clipboard?.writeText(code).then(() => {
      setCopiedKey(slotKey)
      setTimeout(() => setCopiedKey(prev => (prev === slotKey ? null : prev)), 1800)
    })
  }

  const players = replayGame.players ? Object.values(replayGame.players)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)) : []

  const team1 = players.filter(p => p.team === 1)
  const team2 = players.filter(p => p.team === 2)

  const teamLevel = (tp) => tp[0]?.level ?? null

  const calcMaxStats = (tp) => tp.reduce((acc, p) => {
    const siege   = (p.structure_damage || 0) + (p.minion_damage || 0)
    const healing = (p.healing || 0) + (p.self_healing || 0)
    return {
      hero_damage: Math.max(acc.hero_damage, p.hero_damage || 0),
      siege:       Math.max(acc.siege,       siege),
      healing:     Math.max(acc.healing,     healing),
    }
  }, { hero_damage: 0, siege: 0, healing: 0 })

  const teamCfg = [
    { players: team1, result: replayGame.teams?.team1?.result, tds: replayGame.teams?.team1?.takedowns, nome: timeANome, cor: corA, key: 'team1', lv: teamLevel(team1), maxStats: calcMaxStats(team1) },
    { players: team2, result: replayGame.teams?.team2?.result, tds: replayGame.teams?.team2?.takedowns, nome: timeBNome, cor: corB, key: 'team2', lv: teamLevel(team2), maxStats: calcMaxStats(team2) },
  ]

  // Firebase converte arrays em objetos {0:{...}, 1:{...}} — normalizar
  function fbNormArr(val) {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'object') return Object.values(val).sort((a, b) => (a?.t ?? 0) - (b?.t ?? 0))
    return []
  }

  const xpArr     = fbNormArr(replayGame.xpTimeline)
  const eventsArr = fbNormArr(replayGame.eventTimeline)

  return (
    <div className="cd-replay-section">
      <div className="cd-replay-section-header">
        <div className="cd-replay-section-title">{t('replay.title')}</div>
        <div className="cd-replay-view-toggle">
          <button
            className={`cd-replay-toggle-btn${view === 'stats' ? ' cd-replay-toggle-btn--active' : ''}`}
            onClick={() => setView('stats')}
          >
            {t('replay.tabs.table')}
          </button>
          <button
            className={`cd-replay-toggle-btn${view === 'chart' ? ' cd-replay-toggle-btn--active' : ''}`}
            onClick={() => setView('chart')}
          >
            {t('replay.tabs.xpLead')}
          </button>
          <button
            className={`cd-replay-toggle-btn${view === 'events' ? ' cd-replay-toggle-btn--active' : ''}`}
            onClick={() => setView('events')}
          >
            {t('replay.tabs.events')}
          </button>
        </div>
      </div>

      {view === 'chart' && (
        <XpLeadChart
          xpTimeline={xpArr}
          corA={corA} corB={corB}
          timeANome={timeANome} timeBNome={timeBNome}
        />
      )}

      {view === 'events' && (
        <EventTimeline
          eventTimeline={eventsArr}
          corA={corA} corB={corB}
          timeANome={timeANome} timeBNome={timeBNome}
        />
      )}

      {view === 'stats' && teamCfg.map(({ players: tp, result, tds, nome, cor, key, lv, maxStats }) => (
        <div key={key} className="cd-replay-team-block">
          <div className="cd-replay-team-header">
            <span className="cd-replay-team-nome" style={{ color: cor }}>{nome}</span>
            <span className={`cd-replay-result-badge ${result === 'win' ? 'cd-replay-result-badge--win' : 'cd-replay-result-badge--loss'}`}>
              {result === 'win' ? t('replay.result.win') : result === 'loss' ? t('replay.result.loss') : '?'}
            </span>
            <span className="cd-replay-td-total">{tds ?? 0} TD</span>
            {lv && <span className="cd-replay-team-lv">Lv {lv}</span>}
          </div>

          <div className="cd-replay-table-wrap">
            <table className="cd-replay-table">
              <thead>
                <tr>
                  <th>{t('replay.table.hero')}</th>
                  <th>{t('replay.table.player')}</th>
                  <th>{t('replay.table.kda')}</th>
                  <th style={{ textAlign: 'center' }}>{t('replay.table.td')}</th>
                  <th style={{ textAlign: 'right' }}>{t('replay.table.heroDmg')}</th>
                  <th style={{ textAlign: 'right' }}>{t('replay.table.siege')}</th>
                  <th style={{ textAlign: 'right' }}>{t('replay.table.healing')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tp.map((p, idx) => {
                  const slotKey    = `${key}_${p.slot ?? idx}`
                  const open       = !!talentsOpen[slotKey]
                  const hasTalents = (p.talents?.length ?? 0) > 0
                  const siege      = (p.structure_damage || 0) + (p.minion_damage || 0)
                  const healing    = (p.healing || 0) + (p.self_healing || 0)
                  const glow = (val, max) => val > 0 && val === max ? ' cd-replay-stat--best' : ''
                  return (
                    <Fragment key={slotKey}>
                      <tr className="cd-replay-row">
                        <td className="cd-replay-hero">{heroNomeReplay(t, p.hero, p.heroIcon)}</td>
                        <td className="cd-replay-btag">
                          {replayGame.playerNames?.[`slot${p.slot}`] ?? p.battletag}
                        </td>
                        <td className="cd-replay-kda">
                          <span style={{ color: 'var(--green)' }}>{p.kills ?? 0}</span>
                          <span style={{ color: 'var(--text3)' }}>/</span>
                          <span style={{ color: 'var(--red)' }}>{p.deaths ?? 0}</span>
                          <span style={{ color: 'var(--text3)' }}>/</span>
                          <span style={{ color: 'var(--blue)' }}>{p.assists ?? 0}</span>
                        </td>
                        <td className="cd-replay-td-cell">{p.takedowns ?? 0}</td>
                        <td className={`cd-replay-num${glow(p.hero_damage, maxStats.hero_damage)}`}>{fmtNum(p.hero_damage)}</td>
                        <td className={`cd-replay-num${glow(siege, maxStats.siege)}`}>{fmtNum(siege)}</td>
                        <td className={`cd-replay-num${glow(healing, maxStats.healing)}`}>{fmtNum(healing)}</td>
                        <td>
                          {hasTalents && (
                            <button
                              className="cd-replay-expand-btn"
                              onClick={() => setTalentsOpen(prev => ({ ...prev, [slotKey]: !prev[slotKey] }))}
                            >
                              {open ? '▲' : `▼ ${t('replay.build')}`}
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && hasTalents && (
                        <tr className="cd-replay-talents-row">
                          <td colSpan={8}>
                            <div className="cd-replay-talents-header">
                              <button
                                className="cd-replay-copy-btn"
                                onClick={() => copyBuild(slotKey, p)}
                                title={t('replay.copyBuildTitle')}
                              >
                                {copiedKey === slotKey ? `✓ ${t('replay.copied')}` : `📋 ${t('replay.copyBuild')}`}
                              </button>
                            </div>
                            <div className="cd-replay-talents">
                              {p.talents.map((t, ti) => <TalentBadge key={ti} talent={t} />)}
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

// ── Página principal ─────────────────────────────────────────────────────────
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
