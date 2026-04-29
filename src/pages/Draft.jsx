import { useState, useEffect, useRef } from 'react'
import { ref, onValue, update, set } from 'firebase/database'
import { db } from '../firebase/database'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { useConteudo } from '../hooks/useConfig'
import RoleIcon from '../components/RoleIcon'
import EloIcon, { ELO_CONFIG } from '../components/EloIcon'
import CaptainLogin from '../components/CaptainLogin'
import HeroDraftAlerta from '../components/HeroDraftAlerta'

const DEFAULT_STATE  = { status: 'aguardando', turnoAtual: null, turnoExtra: null, rodada: 1 }
const DEFAULT_CONFIG = { moedas: 15, minPlayers: 5, maxPlayers: 7 }

export default function Draft() {
  const { t } = useTranslation()
  const { isAdmin, capitao } = useAuth()
  const conteudo = useConteudo()

  const [captainSession, setCaptainSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('captainSession')) } catch { return null }
  })

  const [captains,    setCaptains]    = useState({})
  const [draftState,  setDraftState]  = useState(DEFAULT_STATE)
  const [playerState, setPlayerState] = useState({})
  const [draftConfig, setDraftConfig] = useState(DEFAULT_CONFIG)
  const [overrides,   setOverrides]   = useState({})
  const [players,     setPlayers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [logAcoes,    setLogAcoes]    = useState([])
  const [guiaAberto,  setGuiaAberto]  = useState(false)
  const lastActionTsRef = useRef(null)

  useEffect(() => {
    let n = 0
    const done = () => { if (++n === 4) setLoading(false) }

    const u1 = onValue(ref(db, '/draftSession/captains'),   s => { setCaptains(s.val() ?? {}); done() })
    const u2 = onValue(ref(db, '/draftSession/state'),      s => { setDraftState(s.exists() ? { ...DEFAULT_STATE, ...s.val() } : DEFAULT_STATE); done() })
    const u3 = onValue(ref(db, '/draftSession/playerState'),s => { setPlayerState(s.val() ?? {}); done() })
    const u4 = onValue(ref(db, '/playerOverrides'),         s => { setOverrides(s.val() ?? {}); done() })
    const u5 = onValue(ref(db, '/config/draft'),            s => { if (s.exists()) setDraftConfig(c => ({ ...c, ...s.val() })) })

    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [])

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then(r => r.json())
      .then(data => { if (data.ok) setPlayers(data.players) })
      .catch(() => {})
  }, [])

  // Se capitão está logado via Firebase Auth, identifica automaticamente no draftSession
  useEffect(() => {
    if (!capitao || captainSession || Object.keys(captains).length === 0) return
    const match = Object.entries(captains).find(([, c]) => c.nome === capitao.nome)
    if (match) {
      setCaptainSession({ captainId: match[0], captainName: match[1].capitaoNome, viaAuth: true })
    }
  }, [capitao, captains]) // eslint-disable-line

  // Acumula log local de ações
  useEffect(() => {
    const action = draftState.lastAction
    if (!action?.ts || action.ts === lastActionTsRef.current) return
    lastActionTsRef.current = action.ts
    setLogAcoes(prev => [action, ...prev].slice(0, 20))
  }, [draftState.lastAction?.ts]) // eslint-disable-line

  function handleLogin(session)  { setCaptainSession(session) }
  function handleLogout() {
    sessionStorage.removeItem('captainSession')
    setCaptainSession(null)
  }

  // Só mostra tela de PIN se não está logado via Firebase Auth nem como admin
  if (!captainSession && !isAdmin && !capitao) return <CaptainLogin onLogin={handleLogin} />
  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando draft...</p></main>

  // ── Dados computados ──────────────────────────────────────
  const sortedCaptains = Object.entries(captains).sort(([, a], [, b]) => a.seed - b.seed)
  const mid = Math.ceil(sortedCaptains.length / 2)
  const leftTeams  = sortedCaptains.slice(0, mid)
  const rightTeams = sortedCaptains.slice(mid)

  const teamCaptainNames = new Set(Object.values(captains).map(c => c.capitaoNome).filter(Boolean))

  const availablePlayers = players.filter(p =>
    !overrides[p.id]?.descartado &&
    !teamCaptainNames.has(p.discord) &&
    !playerState[p.id]?.ownedBy
  )

  const myId        = captainSession?.captainId ?? null
  const myCap       = myId ? captains[myId] : null
  const isExtraTurn = myId ? draftState.turnoExtra === myId : false
  const isMyTurn    = myId ? (draftState.turnoAtual === myId || isExtraTurn) : false
  const activeTurnId   = draftState.turnoExtra ?? draftState.turnoAtual
  const currentTurnCap = captains[activeTurnId]

  // ── Ação de compra ────────────────────────────────────────
  async function comprar(player) {
    if (!isMyTurn || !myCap) return
    const preco = playerState[player.id]?.preco ?? 0
    if (myCap.moedas < preco) return
    const rosterSize = Object.keys(myCap.roster ?? {}).length + 1
    if (rosterSize >= draftConfig.maxPlayers) return

    const updates = {}
    updates[`/draftSession/captains/${myId}/roster/${player.id}`] = { discord: player.discord, preco, isCaptain: false }
    updates[`/draftSession/playerState/${player.id}/preco`]   = preco + 1
    updates[`/draftSession/playerState/${player.id}/ownedBy`] = myId
    updates[`/draftSession/captains/${myId}/moedas`]          = myCap.moedas - preco
    updates[`/draftSession/state/lastAction`] = {
      type: 'buy', playerDiscord: player.discord,
      playerElo: player.elo, playerRole: player.rolePrimaria,
      byTeamId: myId, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
      preco, ts: Date.now(),
    }

    if (isExtraTurn) {
      updates[`/draftSession/state/turnoExtra`] = null
    } else {
      const myNewSize = rosterSize + 1
      const next = proximoCom(sortedCaptains, captains, myId, myNewSize, draftConfig.maxPlayers)
      if (!next) {
        updates[`/draftSession/state/status`] = 'encerrado'
      } else {
        updates[`/draftSession/state/turnoAtual`] = next.id
        if (next.novaRodada) updates[`/draftSession/state/rodada`] = (draftState.rodada ?? 1) + 1
      }
    }

    await update(ref(db), updates)
  }

  // ── Ação de roubo ─────────────────────────────────────────
  async function roubar(player) {
    if (!isMyTurn || !myCap) return
    if (!draftConfig.rouboAtivo) return
    const ps = playerState[player.id]
    if (!ps?.ownedBy || ps.ownedBy === myId) return

    const preco   = ps.preco                              // custo do roubo = preço atual
    if (myCap.moedas < preco) return

    const fromId  = ps.ownedBy
    const fromCap = captains[fromId]
    const paguei  = fromCap?.roster?.[player.id]?.preco ?? 0 // o que o dono pagou (reembolso)

    const updates = {}

    // Move o jogador de roster
    updates[`/draftSession/captains/${fromId}/roster/${player.id}`] = null
    updates[`/draftSession/captains/${myId}/roster/${player.id}`]   = { discord: player.discord, preco, isCaptain: false }

    // Preço sobe +1
    updates[`/draftSession/playerState/${player.id}/preco`]   = preco + 1
    updates[`/draftSession/playerState/${player.id}/ownedBy`] = myId

    // Transação de moedas
    updates[`/draftSession/captains/${myId}/moedas`]   = myCap.moedas - preco
    updates[`/draftSession/captains/${fromId}/moedas`] = (fromCap?.moedas ?? 0) + paguei

    // Turno extra para o capitão roubado
    updates[`/draftSession/state/turnoExtra`] = fromId
    updates[`/draftSession/state/lastAction`] = {
      type: 'steal', playerDiscord: player.discord,
      playerElo: player.elo, playerRole: player.rolePrimaria,
      byTeamId: myId, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
      fromTeamId: fromId, fromTeamNome: fromCap?.nome, fromTeamEmoji: fromCap?.emoji, fromTeamCor: fromCap?.cor,
      preco, ts: Date.now(),
    }

    if (isExtraTurn) {
      // Já era turno extra meu — turnoAtual fica, apenas atualiza turnoExtra
    } else {
      const rosterSize = Object.keys(myCap.roster ?? {}).length + 1
      const myNewSize  = rosterSize + 1
      const next = proximoCom(sortedCaptains, captains, myId, myNewSize, draftConfig.maxPlayers)
      // Mesmo sem próximo "normal", o turnoExtra garante continuidade
      updates[`/draftSession/state/turnoAtual`] = next?.id ?? fromId
      if (next?.novaRodada) updates[`/draftSession/state/rodada`] = (draftState.rodada ?? 1) + 1
    }

    await update(ref(db), updates)
  }

  // ── Tela de espera ────────────────────────────────────────
  if (draftState.status === 'aguardando') {
    const nTimes = sortedCaptains.length
    return (
      <div style={{ minHeight: 'calc(100vh - 65px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '24px' }}>
        <div style={{ fontSize: '48px' }}>⏳</div>
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '24px', color: 'var(--text)', margin: 0 }}>
          Leilão ainda não iniciado
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: '14px', margin: 0, textAlign: 'center', maxWidth: 380 }}>
          {captainSession || capitao
            ? 'Você está logado e pronto. Aguarde o admin iniciar o leilão.'
            : 'O admin ainda não iniciou o leilão de times.'
          }
        </p>
        {nTimes > 0 && (
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--text3)', margin: 0 }}>
            {nTimes} time{nTimes !== 1 ? 's' : ''} cadastrado{nTimes !== 1 ? 's' : ''} · aguardando início
          </p>
        )}
        {conteudo.proximoEvento && (
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--gold2)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', padding: '6px 18px', borderRadius: 20 }}>
            📅 {conteudo.proximoEvento}
          </div>
        )}
        {captainSession && <SessionBadge session={captainSession} onLogout={handleLogout} />}
        {isAdmin && <AdminDraftBar draftState={draftState} sortedCaptains={sortedCaptains} captains={captains} draftConfig={draftConfig} />}
      </div>
    )
  }

  // ── Draft encerrado ───────────────────────────────────────
  if (draftState.status === 'encerrado') {
    return (
      <div style={{ minHeight: 'calc(100vh - 65px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '24px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: '48px' }}>🏁</div>
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '22px', color: 'var(--text)', margin: 0 }}>
          Leilão encerrado!
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: '14px', margin: 0 }}>Todos os times foram formados.</p>
        {(capitao || captainSession) && (
          <div style={{ width: '100%', marginTop: 8 }}>
            <HeroDraftAlerta capitao={capitao} />
          </div>
        )}
        {captainSession && <SessionBadge session={captainSession} onLogout={handleLogout} />}
        {isAdmin && <AdminDraftBar draftState={draftState} sortedCaptains={sortedCaptains} captains={captains} draftConfig={draftConfig} />}
      </div>
    )
  }

  // ── Draft ativo ───────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 65px)' }}>

      {/* Sub-header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', gap: '12px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text2)' }}>
            {t('draft.round')} {draftState.rodada}
          </div>
          {captainSession && <SessionBadge session={captainSession} onLogout={handleLogout} small />}
          {isAdmin && !captainSession && (
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', padding: '3px 8px', borderRadius: '4px', color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
              ADMIN
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {draftState.turnoExtra && (
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', color: 'var(--red)', border: '1px solid rgba(224,85,85,0.3)', padding: '2px 8px', borderRadius: '4px', background: 'rgba(224,85,85,0.08)' }}>
              TURNO EXTRA
            </span>
          )}
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', flexShrink: 0 }} />
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: '14px' }}>
            {t('draft.turn')}: {currentTurnCap?.capitaoNome || currentTurnCap?.nome || '—'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {myCap && (
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.25)', padding: '3px 10px', borderRadius: '4px', background: 'var(--gold-dim)' }}>
              🪙 {myCap.moedas} {t('draft.coins')}
            </div>
          )}
          {isAdmin && <AdminDraftBar draftState={draftState} sortedCaptains={sortedCaptains} captains={captains} draftConfig={draftConfig} compact />}
        </div>
      </div>

      {/* Layout 3 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 260px', flex: 1, overflow: 'hidden' }}>

        {/* Coluna esquerda */}
        <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: '12px' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text2)', padding: '4px 6px 12px' }}>
            {t('draft.teams')}
          </div>
          {leftTeams.map(([id, team]) => (
            <TeamCard key={id} id={id} team={team}
              isActive={activeTurnId === id}
              isMyTeam={id === myId}
              maxPlayers={draftConfig.maxPlayers}
            />
          ))}
        </div>

        {/* Centro — jogadores */}
        <div style={{ overflowY: 'auto', padding: '20px 24px' }}>
          {isMyTurn && (
            <div style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '8px', background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.25)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isExtraTurn ? '⚔️ Turno extra! Você foi roubado — escolha um jogador.' : '✓ É a sua vez! Escolha um jogador.'}
            </div>
          )}

          {/* Disponíveis */}
          <SectionLabel>{t('draft.available')} ({availablePlayers.length})</SectionLabel>
          {availablePlayers.length === 0 && players.length === 0 && (
            <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Carregando jogadores...</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {availablePlayers.map((p) => {
              const preco  = playerState[p.id]?.preco ?? 0
              const canBuy = isMyTurn &&
                             (myCap?.moedas ?? 0) >= preco &&
                             Object.keys(myCap?.roster ?? {}).length + 1 < draftConfig.maxPlayers
              return <PlayerRow key={p.id} player={p} preco={preco} canAct={canBuy} onAct={() => comprar(p)} t={t} />
            })}
          </div>

          {/* Em times (roubáveis) */}
          {draftConfig.rouboAtivo && (() => {
            const ownedPlayers = players.filter(p =>
              playerState[p.id]?.ownedBy &&
              playerState[p.id]?.ownedBy !== myId &&
              !teamCaptainNames.has(p.discord) &&
              !overrides[p.id]?.descartado
            )
            if (ownedPlayers.length === 0) return null
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <SectionLabel accent="red">{t('draft.steal')} ({ownedPlayers.length})</SectionLabel>
                  <button
                    onClick={() => setGuiaAberto(v => !v)}
                    style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 10, padding: '1px 8px', fontSize: 11, color: 'var(--text2)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}
                    title="Como funciona o roubo?"
                  >
                    ? regras
                  </button>
                </div>
                {guiaAberto && (
                  <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 7, background: 'rgba(224,85,85,0.06)', border: '1px solid rgba(224,85,85,0.2)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                    <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>⚔ Como funciona o roubo</div>
                    <div>• Custo do roubo = <strong>preço atual</strong> do jogador</div>
                    <div>• O dono anterior recebe de volta o que pagou originalmente</div>
                    <div>• O dono anterior ganha um <strong>turno extra</strong> imediatamente</div>
                    <div>• A cada roubo, o preço do jogador sobe +1</div>
                    <div>• No turno extra: pode comprar, roubar de volta ou roubar outro</div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ownedPlayers.map((p) => {
                    const ps       = playerState[p.id]
                    const preco    = ps?.preco ?? 0
                    const owner    = captains[ps?.ownedBy]
                    const canSteal = isMyTurn && (myCap?.moedas ?? 0) >= preco
                    return (
                      <PlayerRow
                        key={p.id} player={p} preco={preco}
                        canAct={canSteal} onAct={() => roubar(p)}
                        isSteal owner={owner} t={t}
                      />
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>

        {/* Coluna direita */}
        <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ padding: '4px 6px 12px' }}>&nbsp;</div>
          {rightTeams.map(([id, team]) => (
            <TeamCard key={id} id={id} team={team}
              isActive={activeTurnId === id}
              isMyTeam={id === myId}
              maxPlayers={draftConfig.maxPlayers}
            />
          ))}

          {/* Log de ações */}
          {logAcoes.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '8px 6px 6px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                Histórico
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {logAcoes.map((a, i) => (
                  <div key={a.ts} style={{ padding: '5px 6px', borderRadius: 5, background: i === 0 ? (a.type === 'steal' ? 'rgba(224,85,85,0.06)' : 'rgba(76,175,125,0.06)') : 'transparent', opacity: i === 0 ? 1 : 0.55 + (0.45 * (1 - i / logAcoes.length)) }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: a.type === 'steal' ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      {a.type === 'steal' ? '⚔' : '✓'} {a.byTeamEmoji} {a.byTeamNome}
                    </div>
                    <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                      {a.playerDiscord}
                      {a.type === 'steal' && a.fromTeamNome && <span style={{ opacity: 0.6 }}> ← {a.fromTeamEmoji} {a.fromTeamNome}</span>}
                      <span style={{ float: 'right', color: 'var(--gold)', fontSize: 10 }}>🪙{a.preco}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Lógica de turno ──────────────────────────────────────────
// Retorna o próximo capitão que ainda tem vaga, ou null se todos estão completos.
// myNewSize: tamanho do time atual APÓS a compra que acabou de acontecer.
function proximoCom(sortedCaptains, captains, currentId, myNewSize, maxPlayers) {
  const idx = sortedCaptains.findIndex(([id]) => id === currentId)
  for (let i = 1; i <= sortedCaptains.length; i++) {
    const nextIdx   = (idx + i) % sortedCaptains.length
    const [nId, nCap] = sortedCaptains[nextIdx]
    const size = nId === currentId
      ? myNewSize
      : Object.keys(nCap.roster ?? {}).length + 1
    if (size < maxPlayers) {
      return { id: nId, novaRodada: nextIdx <= idx }
    }
  }
  return null // todos completos
}

// ── Componentes auxiliares ────────────────────────────────────

function SessionBadge({ session, onLogout, small }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: small ? '3px 10px' : '8px 16px',
      borderRadius: small ? '5px' : '8px',
      border: `1px solid ${session.cor}44`,
      background: session.cor + '12',
    }}>
      <span style={{ fontSize: small ? '14px' : '18px' }}>{session.emoji}</span>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: small ? '12px' : '14px', fontWeight: 600, color: session.cor }}>
        {session.nome}
      </span>
      {session.capitaoNome && (
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: small ? '11px' : '13px', color: 'var(--text2)' }}>
          ({session.capitaoNome})
        </span>
      )}
      <button onClick={onLogout} title="Sair" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: '12px', padding: '0 0 0 4px', lineHeight: 1 }}>
        ✕
      </button>
    </div>
  )
}

function TeamCard({ id, team, isActive, isMyTeam, maxPlayers = 7 }) {
  const roster     = Object.entries(team.roster ?? {})
  const totalSlots = roster.length + (team.capitaoNome ? 1 : 0)
  const isFull     = totalSlots >= maxPlayers

  return (
    <div style={{
      border: `1px solid ${isMyTeam ? team.cor + '88' : isActive ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
      borderRadius: '8px',
      background: isMyTeam ? team.cor + '0a' : 'var(--bg3)',
      overflow: 'hidden',
      marginBottom: '10px',
      opacity: isFull && !isMyTeam ? 0.7 : 1,
    }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: team.cor, flexShrink: 0 }} />
          <span>{team.emoji}</span>
          <span style={{ color: team.cor }}>{team.nome}</span>
          {isMyTeam && !isFull && <span style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", color: team.cor, opacity: 0.7 }}>MEU</span>}
          {isFull && (
            <span style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--green)', background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.3)', padding: '1px 6px', borderRadius: '3px' }}>
              COMPLETO
            </span>
          )}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>
          🪙 {team.moedas}
        </div>
      </div>
      <div style={{ padding: '8px 14px' }}>
        {team.capitaoNome && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '4px', background: 'rgba(201,168,76,0.08)', fontSize: '12px', color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '2px' }}>
            <span>⚑ {team.capitaoNome}</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>CAP</span>
          </div>
        )}
        {roster.map(([pid, entry]) => (
          <div key={pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '4px', fontSize: '12px', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            <span>{entry.discord}</span>
            <span>{entry.preco}🪙</span>
          </div>
        ))}
        {totalSlots === 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", padding: '4px 6px', fontStyle: 'italic' }}>
            Sem jogadores
          </div>
        )}
      </div>
    </div>
  )
}

// ── Painel admin inline no draft ─────────────────────────────

function AdminDraftBar({ draftState, sortedCaptains, captains, draftConfig, compact }) {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const min = draftConfig?.minCaptains ?? 2
  const podeIniciar = sortedCaptains.length >= min && draftState.status === 'aguardando'

  async function iniciarDraft() {
    if (!podeIniciar) return
    const primeiro = sortedCaptains[0]?.[0]
    if (!primeiro) return
    await set(ref(db, '/draftSession/state'), { status: 'rodando', turnoAtual: primeiro, turnoExtra: null, rodada: 1 })
  }

  async function encerrarDraft() {
    await update(ref(db, '/draftSession/state'), { status: 'encerrado' })
  }

  async function retomar() {
    await update(ref(db, '/draftSession/state'), { status: 'rodando' })
  }

  async function avancarTurno() {
    const currentId  = draftState.turnoExtra ?? draftState.turnoAtual
    const currentCap = captains[currentId] ?? {}
    const currentSize = Object.keys(currentCap.roster ?? {}).length + 1
    const next = proximoCom(sortedCaptains, captains, currentId, currentSize, draftConfig?.maxPlayers ?? 7)
    if (!next) {
      await update(ref(db, '/draftSession/state'), { status: 'encerrado' })
      return
    }
    const updates = {
      '/draftSession/state/turnoAtual': next.id,
      '/draftSession/state/turnoExtra': null,
    }
    if (next.novaRodada) updates['/draftSession/state/rodada'] = (draftState.rodada ?? 1) + 1
    await update(ref(db), updates)
  }

  async function resetarDraft() {
    const updates = {}
    sortedCaptains.forEach(([id]) => {
      updates[`/draftSession/captains/${id}/roster`] = null
      updates[`/draftSession/captains/${id}/moedas`] = draftConfig?.moedas ?? 15
    })
    updates['/draftSession/playerState'] = null
    updates['/draftSession/state']       = { status: 'aguardando', turnoAtual: null, turnoExtra: null, rodada: 1 }
    await update(ref(db), updates)
    setConfirmReset(false)
    setOpen(false)
  }

  const btnBase = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '5px', border: '1px solid var(--border2)', background: 'none', cursor: 'pointer', color: 'var(--text2)', transition: 'all 0.15s', whiteSpace: 'nowrap' }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ ...btnBase, color: open ? 'var(--gold)' : 'var(--text2)', borderColor: open ? 'rgba(201,168,76,0.4)' : 'var(--border2)', background: open ? 'rgba(201,168,76,0.08)' : 'none' }}
      >
        ⚙ Admin {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
          background: 'var(--bg2)', border: '1px solid rgba(201,168,76,0.25)',
          borderRadius: '10px', padding: '14px', minWidth: '260px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>
            Controle do Draft
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {draftState.status === 'aguardando' && (
              <button style={{ ...btnBase, color: podeIniciar ? 'var(--green)' : 'var(--text2)', borderColor: podeIniciar ? 'rgba(76,175,125,0.4)' : 'var(--border)', opacity: podeIniciar ? 1 : 0.45, width: '100%', padding: '8px' }}
                disabled={!podeIniciar} onClick={iniciarDraft}>
                ▶ Iniciar Draft
              </button>
            )}
            {draftState.status === 'rodando' && (
              <>
                <button style={{ ...btnBase, width: '100%', padding: '8px' }} onClick={avancarTurno}>
                  ⏭ Avançar Turno
                </button>
                <button style={{ ...btnBase, color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)', width: '100%', padding: '8px' }} onClick={encerrarDraft}>
                  ⏹ Encerrar Draft
                </button>
              </>
            )}
            {draftState.status === 'encerrado' && (
              <button style={{ ...btnBase, color: 'var(--green)', borderColor: 'rgba(76,175,125,0.3)', width: '100%', padding: '8px' }} onClick={retomar}>
                ↩ Reabrir Draft
              </button>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '2px' }}>
              {!confirmReset ? (
                <button style={{ ...btnBase, color: 'var(--red)', borderColor: 'rgba(224,85,85,0.25)', width: '100%', padding: '7px' }} onClick={() => setConfirmReset(true)}>
                  🗑 Resetar Draft
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)', textAlign: 'center' }}>Apagar todas as compras?</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={{ ...btnBase, flex: 1, color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }} onClick={resetarDraft}>Confirmar</button>
                    <button style={{ ...btnBase, flex: 1 }} onClick={() => setConfirmReset(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children, accent }) {
  const color = accent === 'red' ? 'var(--red)' : 'var(--text2)'
  return (
    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color, marginBottom: '10px' }}>
      {children}
    </div>
  )
}

function PlayerRow({ player, preco, canAct, onAct, isSteal, owner, t }) {
  const borderColor = isSteal ? `${owner?.cor ?? 'var(--border)'}55` : 'var(--border)'
  const bgColor     = isSteal ? `${owner?.cor ?? 'transparent'}08`   : 'var(--bg2)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '6px', border: `1px solid ${borderColor}`, background: bgColor }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
          👤
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {player.discord}
            {player.premium && (
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                PREMIUM
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
            <EloIcon elo={player.elo} size={13} />
            <span style={{ color: ELO_CONFIG[player.elo]?.color }}>{player.elo}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <RoleIcon role={player.rolePrimaria} size={14} />
            {player.rolePrimaria}
            {isSteal && owner && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: owner.cor }}>{owner.emoji} {owner.nome}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--gold)', fontWeight: 600 }}>
          🪙 {preco}
        </div>
        <button
          className={`btn${isSteal ? '' : ' primary'}`}
          style={{
            padding: '6px 14px', fontSize: '12px',
            opacity: canAct ? 1 : 0.35,
            cursor: canAct ? 'pointer' : 'not-allowed',
            ...(isSteal && canAct ? { color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' } : {}),
          }}
          disabled={!canAct}
          onClick={onAct}
        >
          {isSteal ? t('draft.steal') : t('draft.buy')}
        </button>
      </div>
    </div>
  )
}
