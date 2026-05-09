import { useState, useEffect, useRef } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useTranslation } from 'react-i18next'
import { useModules } from '../hooks/useConfig'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { draftSessionPath, playerOverridesPath } from '../utils/campeonatoPaths'
import { useConteudo } from '../hooks/useConfig'
import EloIcon, { ELO_CONFIG } from '../components/EloIcon'
import RoleIcon from '../components/RoleIcon'
import PaginaInativa from '../components/PaginaInativa'
import './Espectador.css'

const DEFAULT_STATE = { status: 'aguardando', turnoAtual: null, turnoExtra: null, rodada: 1, lastAction: null }

export default function Espectador() {
  const { t } = useTranslation()
  const { privacidadeAtiva, espectadorAtivo, loading: modulesLoading } = useModules()
  const { isAdmin } = useAuth()
  const { idPublico } = useCampeonato()
  const conteudo = useConteudo()

  const [captains,    setCaptains]    = useState({})
  const [draftState,  setDraftState]  = useState(DEFAULT_STATE)
  const [playerState, setPlayerState] = useState({})
  const [overrides,   setOverrides]   = useState({})
  const [players,     setPlayers]     = useState([])
  const [announceKey, setAnnounceKey] = useState(null)

  const cupName = conteudo.cupName || 'Copa Inhouse'

  const prevActionTs = useRef(null)

  useEffect(() => {
    const u1 = onValue(ref(db, `${draftSessionPath(idPublico)}/captains`),    s => setCaptains(s.val() ?? {}))
    const u2 = onValue(ref(db, `${draftSessionPath(idPublico)}/state`),       s => setDraftState(s.exists() ? { ...DEFAULT_STATE, ...s.val() } : DEFAULT_STATE))
    const u3 = onValue(ref(db, `${draftSessionPath(idPublico)}/playerState`), s => setPlayerState(s.val() ?? {}))
    const u4 = onValue(ref(db, playerOverridesPath(idPublico)),               s => setOverrides(s.val() ?? {}))
    return () => { u1(); u2(); u3(); u4() }
  }, [idPublico])

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then(r => r.json())
      .then(data => { if (data.ok) setPlayers(data.players) })
      .catch(() => {})
  }, [])

  // Trigger announce overlay only when a new action arrives; auto-dismiss after animation
  useEffect(() => {
    const ts = draftState.lastAction?.ts
    if (ts && ts !== prevActionTs.current) {
      prevActionTs.current = ts
      setAnnounceKey(ts)
      setTimeout(() => setAnnounceKey(null), 3500)
    }
  }, [draftState.lastAction?.ts])

  if (!modulesLoading && !isAdmin && !espectadorAtivo) {
    return <PaginaInativa icone="📺" titulo="Espectador indisponível" descricao="O modo espectador será aberto quando o leilão estiver em andamento." />
  }

  const fase           = draftState.fase ?? 'titulares'
  const sortedCaptains = Object.entries(captains).sort(([, a], [, b]) => a.seed - b.seed)
  const mid            = Math.ceil(sortedCaptains.length / 2)
  const leftTeams      = sortedCaptains.slice(0, mid)
  const rightTeams     = sortedCaptains.slice(mid)
  const teamCaptainNames = new Set(Object.values(captains).map(c => c.capitaoNome).filter(Boolean))

  const activeTurnId   = draftState.turnoExtra ?? draftState.turnoAtual
  const currentTurnCap = captains[activeTurnId]
  const lastAction     = draftState.lastAction

  // ── Entre fases ───────────────────────────────────────────
  if (draftState.status === 'entre_fases') {
    return (
      <div className="espectador">
        <div className="espectador-waiting" style={{ gap: 24, padding: '40px 24px' }}>
          <div style={{ fontSize: 52 }}>🏆</div>
          <div className="espectador-logo" style={{ fontSize: 28, color: 'var(--gold2)' }}>
            Fase de Titulares Encerrada
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Aguardando início do Leilão de Reservas
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', maxWidth: 800, marginTop: 8 }}>
            {sortedCaptains.map(([id, team]) => (
              <div key={id} style={{ border: `1px solid ${team.cor}44`, borderRadius: 10, minWidth: 160, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: team.cor + '12', borderBottom: `1px solid ${team.cor}33` }}>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: team.cor }}>
                    {team.emoji} {team.nome}
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {team.capitaoNome} · 🪙 {team.moedas}
                  </div>
                </div>
                <div style={{ padding: '8px 16px', background: 'rgba(201,168,76,0.04)' }}>
                  {Object.values(team.roster ?? {}).map((r, i) => (
                    <div key={i} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text2)', padding: '2px 0' }}>
                      {r.discord}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Tela de espera ────────────────────────────────────────
  if (draftState.status === 'aguardando') {
    return (
      <div className="espectador">
        <div className="espectador-waiting">
          <div style={{ fontSize: '48px' }}>⏳</div>
          <div className="espectador-logo" style={{ fontSize: '30px' }}>{cupName}</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            {t('espectador.waiting')}
          </div>
        </div>
      </div>
    )
  }

  // ── Draft encerrado ───────────────────────────────────────
  if (draftState.status === 'encerrado') {
    return (
      <div className="espectador">
        <div className="espectador-waiting">
          <div style={{ fontSize: '56px' }}>🏁</div>
          <div className="espectador-logo" style={{ fontSize: '36px', color: 'var(--gold2)' }}>{t('espectador.ended')}</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '12px' }}>
            {sortedCaptains.map(([id, cap]) => (
              <div key={id} style={{ padding: '8px 20px', borderRadius: '5px', border: `1px solid ${cap.cor}44`, background: cap.cor + '10', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '14px', fontWeight: 700, color: cap.cor, letterSpacing: '0.08em' }}>
                {cap.emoji} {cap.nome}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Draft ativo ───────────────────────────────────────────
  return (
    <div className="espectador">

      {/* Announcement overlay — key forces remount to replay animation */}
      {announceKey && lastAction && (
        <AnnounceOverlay key={announceKey} action={lastAction} />
      )}

      {/* Top bar */}
      <div className="espectador-topbar">
        <div className="espectador-logo">
          ⚔️ <span>{cupName}</span>
        </div>
        <div className="espectador-topbar-center">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="espectador-round">{t('espectador.round')} {draftState.rodada}</div>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 3, fontWeight: 700,
              ...(fase === 'reservas'
                ? { color: 'var(--purple)', background: 'rgba(155,110,232,0.12)', border: '1px solid rgba(155,110,232,0.3)' }
                : { color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' })
            }}>
              {fase === 'reservas' ? '🛡 Reservas' : '⚔ Titulares'}
            </span>
          </div>
          {draftState.turnoExtra && (
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', color: 'var(--red)', border: '1px solid rgba(224,85,85,0.35)', padding: '2px 8px', borderRadius: '4px', background: 'rgba(224,85,85,0.1)', letterSpacing: '0.1em' }}>
              {t('espectador.extra_turn')}
            </div>
          )}
          <div className="espectador-turn-display">
            <div className="live-pip" style={{ background: currentTurnCap?.cor ?? 'var(--gold)', boxShadow: `0 0 10px ${currentTurnCap?.cor ?? 'var(--gold)'}` }} />
            <span style={{ color: currentTurnCap?.cor }}>{currentTurnCap?.emoji}</span>
            {t('espectador.turn')} {currentTurnCap?.capitaoNome || currentTurnCap?.nome || '—'}
          </div>
        </div>
        <div className="espectador-live">
          <div className="live-dot" />
          {t('espectador.live')}
        </div>
      </div>

      {/* Content grid */}
      <div className="espectador-content">

        {/* Left teams */}
        <div className="espectador-panel">
          {leftTeams.map(([id, team]) => (
            <SpectatorTeam key={id} team={team} isActive={activeTurnId === id} players={players} privacidade={privacidadeAtiva} fase={fase} />
          ))}
        </div>

        {/* Center stage */}
        <div className="espectador-center">
          <div className="center-bg" />
          <div className="center-diag" />

          <div className="auction-spotlight">
            {lastAction ? (
              <SpotlightCard action={lastAction} key={lastAction.ts} privacidade={privacidadeAtiva} />
            ) : (
              <div className="spotlight-label" style={{ marginTop: '40px' }}>
                {t('espectador.waiting_pick')}
              </div>
            )}
          </div>

          <TurnStrip
            sortedCaptains={sortedCaptains}
            activeTurnId={activeTurnId}
            turnoExtra={draftState.turnoExtra}
            fase={fase}
          />

          <PlayerPool
            players={players}
            overrides={overrides}
            playerState={playerState}
            teamCaptainNames={teamCaptainNames}
            privacidade={privacidadeAtiva}
            fase={fase}
          />
        </div>

        {/* Right teams */}
        <div className="espectador-panel right">
          {rightTeams.map(([id, team]) => (
            <SpectatorTeam key={id} team={team} isActive={activeTurnId === id} players={players} privacidade={privacidadeAtiva} fase={fase} />
          ))}
        </div>

      </div>
    </div>
  )
}

// ── Announcement overlay ──────────────────────────────────────
function AnnounceOverlay({ action }) {
  const { t } = useTranslation()
  const isSteal   = action.type === 'steal'
  const color     = isSteal ? action.byTeamCor : 'var(--gold2)'
  const typeLabel = isSteal ? `⚔ ${t('espectador.steal_label').toUpperCase()}` : `✓ ${t('espectador.buy_label').toUpperCase()}`

  return (
    <div className="announce-overlay show">
      <div className="announce-bg" />
      <div className="flash-lines">
        <div className="flash-line" style={{ top: '36%' }} />
        <div className="flash-line" style={{ top: '64%', animationDelay: '0.1s' }} />
      </div>
      <div className="announce-content">
        <div className="announce-type" style={{ color }}>{typeLabel}</div>
        <div
          className="announce-headline"
          data-text={action.playerDiscord}
          style={{ color }}
        >
          {action.playerDiscord}
        </div>
        <div className="announce-slash" style={{ color }}>
          <div className="slash-line" />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.55 }}>
            {action.playerRole}
          </span>
          <div className="slash-line right" />
        </div>
        <div className="announce-sub" style={{ color }}>
          {action.byTeamEmoji} {action.byTeamNome}
        </div>
        <div className="announce-detail">
          {isSteal && action.fromTeamNome
            ? `${t('espectador.stolen_from')} ${action.fromTeamEmoji} ${action.fromTeamNome}  ·  `
            : ''
          }
          🪙 {action.preco} {t('espectador.coins')}
        </div>
      </div>
    </div>
  )
}

// ── Spotlight card (center stage) ─────────────────────────────
function SpotlightCard({ action, privacidade }) {
  const { t }    = useTranslation()
  const isSteal  = action.type === 'steal'
  const eloColor = ELO_CONFIG[action.playerElo]?.color ?? 'rgba(255,255,255,0.45)'
  const nomeExibido = privacidade ? 'Jogador' : action.playerDiscord

  return (
    <div style={{ textAlign: 'center', animation: 'spotlightIn 0.4s cubic-bezier(.2,1,.4,1)' }}>
      <div className="spotlight-action-type" style={{ color: isSteal ? 'var(--red)' : 'var(--gold)' }}>
        {isSteal ? `⚔ ${t('espectador.steal_label')}` : `✓ ${t('espectador.buy_label')}`}
      </div>
      <div className="spotlight-name">{nomeExibido}</div>
      <div className="spotlight-meta">
        <span style={{ color: eloColor }}>{action.playerElo}</span>
        <span style={{ opacity: 0.25 }}>·</span>
        <span>{action.playerRole}</span>
      </div>
      <div className="spotlight-price-row">
        <span className="spotlight-price-value">{action.preco}</span>
        <span className="spotlight-price-unit">{t('espectador.coins')}</span>
      </div>
      <div
        className="spotlight-owner-tag"
        style={{ color: action.byTeamCor, borderColor: action.byTeamCor + '44', background: action.byTeamCor + '0e' }}
      >
        {action.byTeamEmoji} {action.byTeamNome}
      </div>
      {isSteal && action.fromTeamNome && (
        <div className="spotlight-steal-from">
          {t('espectador.stolen_from')}{' '}
          <span style={{ color: action.fromTeamCor }}>
            {action.fromTeamEmoji} {action.fromTeamNome}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Turn strip ────────────────────────────────────────────────
function TurnStrip({ sortedCaptains, activeTurnId, turnoExtra, fase }) {
  return (
    <div className="turn-strip">
      {sortedCaptains.map(([id, cap], i) => {
        const isActive = activeTurnId === id
        const pronto   = fase === 'reservas' && cap.exitou
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {i > 0 && <div className="turn-arrow">›</div>}
            <div
              className={`t-pip ${isActive ? 'active' : ''}`}
              style={{
                ...(isActive ? { borderColor: cap.cor + '88', background: cap.cor + '18', color: cap.cor } : {}),
                ...(pronto   ? { opacity: 0.35, textDecoration: 'line-through' } : {}),
              }}
            >
              <div className="t-pip-dot" />
              {cap.emoji} {cap.capitaoNome || cap.nome}
              {turnoExtra === id && (
                <span style={{ fontSize: '9px', marginLeft: '2px', opacity: 0.75 }}>+1</span>
              )}
              {pronto && (
                <span style={{ fontSize: '9px', marginLeft: '3px', color: 'var(--green)', opacity: 1, textDecoration: 'none' }}>✓</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Player pool ───────────────────────────────────────────────
function PlayerPool({ players, overrides, playerState, teamCaptainNames, privacidade, fase }) {
  const { t }   = useTranslation()
  const visible = players.filter(p => !overrides[p.id]?.descartado && !teamCaptainNames.has(p.discord))

  // Na fase de reservas, titulares são "sold" e não voltam para a pool visível
  const available = visible.filter(p => !playerState[p.id]?.ownedBy).length
  const label     = fase === 'reservas' ? 'Pool de Reservas' : t('espectador.available')

  return (
    <div className="player-pool">
      <div className="pool-label">
        {label}: {available}
      </div>
      <div className="pool-chips">
        {visible.map((p, idx) => {
          const ps      = playerState[p.id]
          const sold    = !!ps?.ownedBy
          const premium = !!overrides[p.id]?.premium && !sold
          // Na fase de reservas, titulares ficam ocultos da pool
          if (fase === 'reservas' && sold && ps?.tipoPosse === 'titular') return null
          return (
            <div
              key={p.id}
              className={`pool-chip${sold ? ' sold' : ''}${premium ? ' premium' : ''}`}
            >
              {privacidade ? `#${idx + 1}` : p.discord}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Team card ─────────────────────────────────────────────────
function SpectatorTeam({ team, isActive, players, privacidade, fase = 'titulares' }) {
  const { t } = useTranslation()
  const roster   = Object.entries(team.roster ?? {})
  const reservas = Object.entries(team.reservas ?? {})
  const titTotal = roster.length + (team.capitaoNome ? 1 : 0)
  const exitou   = team.exitou

  const playerByDiscord = Object.fromEntries(players.map(p => [p.discord, p]))

  function RosterEntry({ entry, idx, dimmed }) {
    const info        = playerByDiscord[entry.discord]
    const eloColor    = ELO_CONFIG[info?.elo]?.color ?? 'rgba(255,255,255,0.4)'
    const nomeExibido = privacidade ? `Jogador #${idx + 1}` : entry.discord
    return (
      <div className="spec-roster-entry" style={dimmed ? { opacity: 0.5 } : {}}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nomeExibido}
        </span>
        <div className="spec-roster-right">
          {info?.elo && (
            <span className="spec-elo-badge" style={{ color: eloColor, background: eloColor + '18', border: `1px solid ${eloColor}33` }}>
              {info.elo}
            </span>
          )}
          {info?.rolePrimaria && <span className="spec-role-badge">{info.rolePrimaria}</span>}
          <span className="spec-roster-price">🪙{entry.preco}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`spec-team ${isActive ? 'active' : ''}`}
      style={{ borderColor: isActive ? team.cor + '55' : undefined, opacity: exitou && !isActive ? 0.6 : 1 }}
    >
      <div className="spec-team-color-bar" style={{ background: exitou ? 'var(--text3)' : team.cor }} />
      <div className="spec-team-header">
        <div className="spec-team-emoji">{team.emoji}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="spec-team-name" style={{ color: exitou ? 'var(--text2)' : team.cor }}>{team.nome}</div>
          {exitou && (
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: 'var(--green)', background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.3)', padding: '1px 5px', borderRadius: 3 }}>
              PRONTO
            </span>
          )}
        </div>
        {team.capitaoNome && <div className="spec-team-captain">⚑ {team.capitaoNome}</div>}
        <div className="spec-team-coins-row">
          <div className="spec-team-coins">🪙 {team.moedas}</div>
          <div className="spec-team-slots">{titTotal}/5</div>
        </div>
      </div>

      {/* Barra de progresso dos titulares */}
      <div className="spec-team-progress">
        <div className="spec-team-progress-fill" style={{ width: `${Math.min(titTotal / 5, 1) * 100}%`, background: exitou ? 'var(--text3)' : team.cor }} />
      </div>

      {/* Titulares — fundo dourado */}
      <div className="spec-roster" style={{ background: 'rgba(201,168,76,0.04)', borderBottom: fase === 'reservas' ? '1px solid var(--border)' : 'none' }}>
        {team.capitaoNome && (
          <div className="spec-roster-entry captain">
            <span>⚑ {team.capitaoNome}</span>
            <span className="spec-cap-tag">CAP</span>
          </div>
        )}
        {roster.map(([pid, entry], idx) => <RosterEntry key={pid} entry={entry} idx={idx} />)}
        {titTotal === 0 && <div className="spec-roster-empty">{t('espectador.no_players')}</div>}
      </div>

      {/* Reservas — fundo prata, só na fase de reservas */}
      {fase === 'reservas' && (
        <div className="spec-roster" style={{ background: 'rgba(138,134,128,0.05)' }}>
          {reservas.length === 0
            ? <div className="spec-roster-empty" style={{ opacity: 0.4 }}>{exitou ? '—' : 'Aguardando...'}</div>
            : reservas.map(([pid, entry], idx) => <RosterEntry key={pid} entry={entry} idx={idx} />)
          }
        </div>
      )}
    </div>
  )
}
