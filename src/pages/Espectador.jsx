import { useState, useEffect, useRef } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useTranslation } from 'react-i18next'
import { useModules } from '../hooks/useConfig'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { draftSessionPath, playerOverridesPath, configDraftPath } from '../utils/campeonatoPaths'
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
  const [draftConfig, setDraftConfig] = useState({ timerDuracao: 60, volumeSons: 80 })
  const [tempoRestante, setTempoRestante] = useState(null)
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  const cupName = conteudo.cupName || 'Copa Inhouse'

  const prevActionTs   = useRef(null)
  const audioRef       = useRef(null)  // countdown MP3
  const audioPickRef   = useRef(null)
  const audioStealRef  = useRef(null)
  const audioCtxRef    = useRef(null)
  const volRef         = useRef(0.8)
  const audioTurnRef   = useRef(null)

  // Volume sempre atualizado (antes de qualquer early return)
  volRef.current = (draftConfig.volumeSons ?? 80) / 100

  useEffect(() => {
    const u1 = onValue(ref(db, `${draftSessionPath(idPublico)}/captains`),    s => setCaptains(s.val() ?? {}))
    const u2 = onValue(ref(db, `${draftSessionPath(idPublico)}/state`),       s => setDraftState(s.exists() ? { ...DEFAULT_STATE, ...s.val() } : DEFAULT_STATE))
    const u3 = onValue(ref(db, `${draftSessionPath(idPublico)}/playerState`), s => setPlayerState(s.val() ?? {}))
    const u4 = onValue(ref(db, playerOverridesPath(idPublico)),               s => setOverrides(s.val() ?? {}))
    const u5 = onValue(ref(db, configDraftPath(idPublico)),                   s => { if (s.exists()) setDraftConfig(c => ({ ...c, ...s.val() })) })
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [idPublico])

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then(r => r.json())
      .then(data => { if (data.ok) setPlayers(data.players) })
      .catch(() => {})
  }, [])

  // Beeps sintéticos fallback (igual ao Draft)
  function playCountdownBeeps() {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      for (let i = 0; i < 10; i++) {
        const t    = ctx.currentTime + i
        const freq = i < 5 ? 660 : 880
        const dur  = i === 9 ? 0.4 : 0.08
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.35 * volRef.current, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
        osc.start(t); osc.stop(t + dur + 0.05)
      }
    } catch (e) {}
  }

  // Preload dos áudios + unlock na primeira interação
  useEffect(() => {
    const mp3 = new Audio('/sounds/ui_bnet_draft_countdownten01.mp3')
    mp3.preload = 'auto'
    mp3.oncanplaythrough = () => { audioRef.current = mp3 }

    const pick = new Audio('/sounds/ui_bnet_ready02.ogg')
    pick.preload = 'auto'
    pick.oncanplaythrough = () => { audioPickRef.current = pick }

    const steal = new Audio('/sounds/ui_ping_careful01.mp3')
    steal.preload = 'auto'
    steal.oncanplaythrough = () => { audioStealRef.current = steal }

    const unlock = () => {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
        audioCtxRef.current.resume().catch(() => {})
      } catch (e) {}
      if (audioRef.current) audioRef.current.play().then(() => { audioRef.current.pause(); audioRef.current.currentTime = 0 }).catch(() => {})
      setAudioUnlocked(true)
    }
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      mp3.src = ''; pick.src = ''; steal.src = ''
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  // Timer de turno
  useEffect(() => {
    const dur = draftConfig.timerDuracao ?? 60
    if (!dur || draftState.status !== 'rodando') { setTempoRestante(null); return }
    const ts = draftState.turnoIniciadoEm ?? Date.now()
    const tick = () => {
      const elapsed  = Math.floor((Date.now() - ts) / 1000)
      const restante = Math.max(0, dur - elapsed)
      setTempoRestante(restante)
      const tsKey = draftState.turnoIniciadoEm ?? draftState.turnoAtual ?? 'now'
      if (restante <= 11 && restante > 0 && audioTurnRef.current !== tsKey) {
        audioTurnRef.current = tsKey
        if (audioRef.current) {
          audioRef.current.volume = volRef.current
          audioRef.current.currentTime = 0
          audioRef.current.play().catch(() => playCountdownBeeps())
        } else {
          playCountdownBeeps()
        }
      }
    }
    tick()
    const iv = setInterval(tick, 500)
    return () => {
      clearInterval(iv)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    }
  }, [draftState.turnoIniciadoEm, draftState.status, draftConfig.timerDuracao]) // eslint-disable-line

  // Trigger announce overlay + som quando uma nova ação chega
  useEffect(() => {
    const action = draftState.lastAction
    const ts     = action?.ts
    if (ts && ts !== prevActionTs.current) {
      prevActionTs.current = ts
      setAnnounceKey(ts)
      setTimeout(() => setAnnounceKey(null), 3500)
      // Som da ação
      if (action.type === 'steal' && audioStealRef.current) {
        audioStealRef.current.volume = volRef.current
        audioStealRef.current.currentTime = 0
        audioStealRef.current.play().catch(() => {})
      } else if (action.type === 'buy' && audioPickRef.current) {
        audioPickRef.current.volume = volRef.current
        audioPickRef.current.currentTime = 0
        audioPickRef.current.play().catch(() => {})
      }
    }
  }, [draftState.lastAction?.ts]) // eslint-disable-line

  if (!modulesLoading && !isAdmin && !espectadorAtivo) {
    return <PaginaInativa icone="📺" titulo="Espectador indisponível" descricao="O modo espectador será aberto quando o leilão estiver em andamento." />
  }

  const fase           = draftState.fase ?? 'titulares'
  const sortedCaptains = Object.entries(captains).sort(([, a], [, b]) => a.seed - b.seed)
  const mid            = Math.ceil(sortedCaptains.length / 2)
  const leftTeams      = sortedCaptains.slice(0, mid)
  const rightTeams     = sortedCaptains.slice(mid)
  const teamCaptainNames = new Set(Object.values(captains).map(c => c.capitaoNome).filter(Boolean))

  const activeTurnId   = draftState.turnoAtual
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
    const playerByDiscord = Object.fromEntries(players.map(p => [p.discord, p]))
    return (
      <div className="espectador" style={{ overflowY: 'auto' }}>
        <div style={{ padding: '40px 32px', maxWidth: 1280, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 52 }}>🏁</div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 38, color: 'var(--gold2)', marginTop: 8, letterSpacing: '0.04em' }}>
              {t('espectador.ended')}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: 6 }}>
              {cupName}
            </div>
          </div>
          {/* Grid de times */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {sortedCaptains.map(([id, team]) => (
              <SpectatorTeamFinal key={id} team={team} playerByDiscord={playerByDiscord} privacidade={privacidadeAtiva} />
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
          <div className="espectador-turn-display">
            <div className="live-pip" style={{ background: currentTurnCap?.cor ?? 'var(--gold)', boxShadow: `0 0 10px ${currentTurnCap?.cor ?? 'var(--gold)'}` }} />
            <span style={{ color: currentTurnCap?.cor }}>{currentTurnCap?.emoji}</span>
            {t('espectador.turn')} {currentTurnCap?.capitaoNome || currentTurnCap?.nome || '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!audioUnlocked && (draftConfig.timerDuracao ?? 60) > 0 && (
            <button
              onClick={() => {}}
              title="Clique em qualquer lugar para ativar o som"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}
            >
              🔇 Ativar som
            </button>
          )}
          <div className="espectador-live">
            <div className="live-dot" />
            {t('espectador.live')}
          </div>
        </div>
      </div>

      {/* Timer bar (sob o topbar) */}
      {tempoRestante !== null && (draftConfig.timerDuracao ?? 60) > 0 && (() => {
        const dur     = draftConfig.timerDuracao ?? 60
        const pct     = (tempoRestante / dur) * 100
        const urgente = tempoRestante <= 10
        const cor     = tempoRestante > dur * 0.5 ? 'var(--green)' : tempoRestante > dur * 0.2 ? '#f0cc6e' : 'var(--red)'
        return (
          <div style={{ position: 'relative', height: 24, background: 'var(--bg3)', flexShrink: 0, overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: cor + '30', transition: 'width 0.5s linear, background 0.5s' }} />
            <div style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${pct}%`, background: cor, transition: 'width 0.5s linear, background 0.5s' }} />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              fontSize: 12, letterSpacing: '0.08em', color: cor,
              transition: 'color 0.5s',
              animation: urgente ? 'hd-pulse 0.6s ease-in-out infinite' : 'none',
            }}>
              <span style={{ opacity: 0.6, fontSize: 11 }}>⏱</span>
              <span style={{ fontSize: urgente ? 15 : 12 }}>{tempoRestante}s</span>
            </div>
          </div>
        )
      })()}

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
function TurnStrip({ sortedCaptains, activeTurnId, fase }) {
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

// ── Card de time para tela de encerramento (espectador) ───────
function SpectatorTeamFinal({ team, playerByDiscord, privacidade }) {
  const roster   = Object.entries(team.roster   ?? {})
  const reservas = Object.entries(team.reservas ?? {})

  const titulares = [
    ...(team.capitaoNome ? [{ discord: team.capitaoNome, preco: null, isCaptain: true }] : []),
    ...roster.map(([, e]) => ({ ...e, isCaptain: false })),
  ]

  return (
    <div style={{ border: `1px solid ${team.cor}55`, borderRadius: 12, background: team.cor + '0a', overflow: 'hidden' }}>
      {/* Barra de cor */}
      <div style={{ height: 3, background: team.cor }} />

      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${team.cor}33`, background: team.cor + '12', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>{team.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, color: team.cor }}>
            {team.nome}
          </div>
          {team.capitaoNome && (
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--gold)', marginTop: 1 }}>
              ⚑ {privacidade ? 'Capitão' : team.capitaoNome}
            </div>
          )}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text2)', textAlign: 'right' }}>
          <div style={{ color: 'var(--gold)', fontSize: 12 }}>🪙 {team.moedas}</div>
          <div style={{ opacity: 0.5 }}>{titulares.length}p{reservas.length > 0 ? ` +${reservas.length}r` : ''}</div>
        </div>
      </div>

      {/* Titulares */}
      <div style={{ background: 'rgba(201,168,76,0.03)', padding: '8px 0' }}>
        {titulares.map((entry, i) => {
          const info = playerByDiscord[entry.discord]
          const eloColor = ELO_CONFIG[info?.elo]?.color
          const nome = privacidade ? (entry.isCaptain ? 'Capitão' : `Jogador #${i}`) : entry.discord
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 18px', background: entry.isCaptain ? 'rgba(201,168,76,0.07)' : 'transparent' }}>
              {entry.isCaptain && <span style={{ color: 'var(--gold)', fontSize: 11, flexShrink: 0 }}>⚑</span>}
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: entry.isCaptain ? 'var(--gold)' : 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nome}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                {info?.rolePrimaria && (
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text2)' }}>{info.rolePrimaria}</span>
                )}
                {eloColor && (
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, padding: '1px 6px', borderRadius: 3, color: eloColor, background: eloColor + '18', border: `1px solid ${eloColor}33` }}>
                    {info.elo}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Reservas */}
      {reservas.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(138,134,128,0.04)', padding: '6px 0 8px' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', padding: '0 18px 4px' }}>
            Reservas
          </div>
          {reservas.map(([, entry], i) => {
            const info = playerByDiscord[entry.discord]
            const eloColor = ELO_CONFIG[info?.elo]?.color
            const nome = privacidade ? `Reserva #${i + 1}` : entry.discord
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 18px' }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text2)', flex: 1 }}>{nome}</span>
                {eloColor && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: eloColor }}>{info.elo}</span>}
                {info?.rolePrimaria && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: 'var(--text3)' }}>{info.rolePrimaria}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
