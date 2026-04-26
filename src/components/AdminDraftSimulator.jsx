import { useState, useEffect } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase/database'

const DEFAULT_STATE  = { status: 'aguardando', turnoAtual: null, turnoExtra: null, rodada: 1 }
const DEFAULT_CONFIG = { moedas: 15, minPlayers: 5, maxPlayers: 7, rouboAtivo: true }

function proximoCom(sortedCaptains, captains, currentId, myNewSize, maxPlayers) {
  const idx = sortedCaptains.findIndex(([id]) => id === currentId)
  for (let i = 1; i <= sortedCaptains.length; i++) {
    const nextIdx     = (idx + i) % sortedCaptains.length
    const [nId, nCap] = sortedCaptains[nextIdx]
    const size = nId === currentId
      ? myNewSize
      : Object.keys(nCap.roster ?? {}).length + 1
    if (size < maxPlayers) return { id: nId, novaRodada: nextIdx <= idx }
  }
  return null
}

export default function AdminDraftSimulator() {
  const [captains,    setCaptains]    = useState({})
  const [draftState,  setDraftState]  = useState(DEFAULT_STATE)
  const [playerState, setPlayerState] = useState({})
  const [draftConfig, setDraftConfig] = useState(DEFAULT_CONFIG)
  const [overrides,   setOverrides]   = useState({})
  const [players,     setPlayers]     = useState([])

  const [actingAs,   setActingAs]   = useState('')   // captainId
  const [tab,        setTab]        = useState('buy') // 'buy' | 'steal'
  const [loading,    setLoading]    = useState(false)
  const [log,        setLog]        = useState([])
  const [expanded,   setExpanded]   = useState(false)

  useEffect(() => {
    const u1 = onValue(ref(db, '/draftSession/captains'),    s => setCaptains(s.val() ?? {}))
    const u2 = onValue(ref(db, '/draftSession/state'),       s => setDraftState(s.exists() ? { ...DEFAULT_STATE, ...s.val() } : DEFAULT_STATE))
    const u3 = onValue(ref(db, '/draftSession/playerState'), s => setPlayerState(s.val() ?? {}))
    const u4 = onValue(ref(db, '/playerOverrides'),          s => setOverrides(s.val() ?? {}))
    const u5 = onValue(ref(db, '/config/draft'),             s => { if (s.exists()) setDraftConfig(c => ({ ...c, ...s.val() })) })
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [])

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then(r => r.json())
      .then(data => { if (data.ok) setPlayers(data.players) })
      .catch(() => {})
  }, [])

  // Auto-select active turn team when it changes and no selection yet
  useEffect(() => {
    const active = draftState.turnoExtra ?? draftState.turnoAtual
    if (active && !actingAs) setActingAs(active)
  }, [draftState.turnoAtual, draftState.turnoExtra])

  const sortedCaptains   = Object.entries(captains).sort(([, a], [, b]) => a.seed - b.seed)
  const teamCaptainNames = new Set(Object.values(captains).map(c => c.capitaoNome).filter(Boolean))
  const myCap            = captains[actingAs]
  const activeTurnId     = draftState.turnoExtra ?? draftState.turnoAtual
  const isMyTurn         = actingAs === activeTurnId

  const availablePlayers = players.filter(p =>
    !overrides[p.id]?.descartado &&
    !teamCaptainNames.has(p.discord) &&
    !playerState[p.id]?.ownedBy
  )

  const stealablePlayers = players.filter(p => {
    const ps = playerState[p.id]
    return ps?.ownedBy && ps.ownedBy !== actingAs
  })

  function addLog(msg, type = 'ok') {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLog(prev => [{ msg, type, time }, ...prev].slice(0, 30))
  }

  async function simComprar(player) {
    if (!myCap || loading) return
    const preco     = playerState[player.id]?.preco ?? 0
    const rosterSize = Object.keys(myCap.roster ?? {}).length + 1

    if (myCap.moedas < preco) {
      addLog(`${myCap.nome} não tem moedas suficientes (tem ${myCap.moedas}, precisa ${preco})`, 'err')
      return
    }
    if (rosterSize >= draftConfig.maxPlayers) {
      addLog(`${myCap.nome} já está com o time completo`, 'err')
      return
    }

    setLoading(true)
    try {
      const isExtraTurn = draftState.turnoExtra === actingAs
      const updates     = {}

      updates[`/draftSession/captains/${actingAs}/roster/${player.id}`] = { discord: player.discord, preco, isCaptain: false }
      updates[`/draftSession/playerState/${player.id}/preco`]           = preco + 1
      updates[`/draftSession/playerState/${player.id}/ownedBy`]         = actingAs
      updates[`/draftSession/captains/${actingAs}/moedas`]              = myCap.moedas - preco
      updates[`/draftSession/state/lastAction`] = {
        type: 'buy', playerDiscord: player.discord,
        playerElo: player.elo, playerRole: player.rolePrimaria,
        byTeamId: actingAs, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
        preco, ts: Date.now(),
      }

      if (isExtraTurn) {
        updates[`/draftSession/state/turnoExtra`] = null
      } else {
        const myNewSize = rosterSize + 1
        const next = proximoCom(sortedCaptains, captains, actingAs, myNewSize, draftConfig.maxPlayers)
        if (!next) {
          updates[`/draftSession/state/status`] = 'encerrado'
          addLog(`[SIM] ${myCap.nome} comprou ${player.discord} por ${preco}🪙 → leilão encerrado automaticamente`, 'ok')
        } else {
          updates[`/draftSession/state/turnoAtual`] = next.id
          if (next.novaRodada) updates[`/draftSession/state/rodada`] = (draftState.rodada ?? 1) + 1
        }
      }

      await update(ref(db), updates)
      addLog(`[SIM] ${myCap.nome} comprou ${player.discord} por ${preco}🪙${isExtraTurn ? ' (turno extra)' : ''}`)
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setLoading(false)
    }
  }

  async function simRoubar(player) {
    if (!myCap || loading) return
    if (!draftConfig.rouboAtivo) { addLog('Roubo desativado nas configurações', 'err'); return }

    const ps     = playerState[player.id]
    const preco  = ps?.preco ?? 0
    const fromId = ps?.ownedBy
    if (!fromId || fromId === actingAs) { addLog('Jogador não pode ser roubado', 'err'); return }

    const fromCap = captains[fromId]
    if (myCap.moedas < preco) {
      addLog(`${myCap.nome} não tem moedas suficientes (tem ${myCap.moedas}, precisa ${preco})`, 'err')
      return
    }

    const rosterSize = Object.keys(myCap.roster ?? {}).length + 1
    if (rosterSize >= draftConfig.maxPlayers) {
      addLog(`${myCap.nome} já está com o time completo`, 'err')
      return
    }

    setLoading(true)
    try {
      const isExtraTurn = draftState.turnoExtra === actingAs
      const paguei      = fromCap?.roster?.[player.id]?.preco ?? 0
      const updates     = {}

      updates[`/draftSession/captains/${fromId}/roster/${player.id}`]   = null
      updates[`/draftSession/captains/${actingAs}/roster/${player.id}`] = { discord: player.discord, preco, isCaptain: false }
      updates[`/draftSession/playerState/${player.id}/preco`]           = preco + 1
      updates[`/draftSession/playerState/${player.id}/ownedBy`]         = actingAs
      updates[`/draftSession/captains/${actingAs}/moedas`]              = myCap.moedas - preco
      updates[`/draftSession/captains/${fromId}/moedas`]                = (fromCap?.moedas ?? 0) + paguei
      updates[`/draftSession/state/turnoExtra`]                         = fromId
      updates[`/draftSession/state/lastAction`] = {
        type: 'steal', playerDiscord: player.discord,
        playerElo: player.elo, playerRole: player.rolePrimaria,
        byTeamId: actingAs, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
        fromTeamId: fromId, fromTeamNome: fromCap?.nome, fromTeamEmoji: fromCap?.emoji, fromTeamCor: fromCap?.cor,
        preco, ts: Date.now(),
      }

      if (!isExtraTurn) {
        const myNewSize = rosterSize + 1
        const next = proximoCom(sortedCaptains, captains, actingAs, myNewSize, draftConfig.maxPlayers)
        updates[`/draftSession/state/turnoAtual`] = next?.id ?? fromId
        if (next?.novaRodada) updates[`/draftSession/state/rodada`] = (draftState.rodada ?? 1) + 1
      }

      await update(ref(db), updates)
      addLog(`[SIM] ${myCap.nome} ROUBOU ${player.discord} de ${fromCap?.nome} por ${preco}🪙 → ${fromCap?.nome} recebeu ${paguei}🪙 de volta + turno extra`)
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setLoading(false)
    }
  }

  const notRunning = draftState.status !== 'rodando'

  return (
    <div className="admin-section admin-players-section" style={{ marginBottom: '28px', border: '1px solid rgba(155,110,232,0.2)', borderRadius: '8px', overflow: 'visible' }}>

      {/* Header — collapsible */}
      <div
        style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: '16px' }}>🧪</span>
        <div className="admin-section-title" style={{ margin: 0, color: 'var(--purple)', flex: 1 }}>
          Simulador do Leilão
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', fontWeight: 400, marginLeft: '10px', color: 'rgba(155,110,232,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            SuperAdmin · Debug
          </span>
        </div>
        <span style={{ color: 'var(--text2)', fontSize: '14px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {!expanded && (
        <div style={{ padding: '0 18px 14px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: 'var(--text2)', letterSpacing: '0.05em' }}>
          Simule compras e roubos em nome de qualquer time sem precisar de login de capitão.
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: '1px solid rgba(155,110,232,0.15)' }}>

          {notRunning && (
            <div style={{ margin: '14px 18px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--text2)', border: '1px solid var(--border)' }}>
              ⏸ O leilão precisa estar <strong>em andamento</strong> para simular ações.
            </div>
          )}

          {/* Team selector */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
              Agindo como
            </div>
            <select
              value={actingAs}
              onChange={e => setActingAs(e.target.value)}
              disabled={notRunning}
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '14px', background: 'var(--bg3)', color: myCap?.cor ?? 'var(--text)', border: '1px solid var(--border2)', borderRadius: '5px', padding: '5px 10px', cursor: 'pointer' }}
            >
              <option value="">— selecione um time —</option>
              {sortedCaptains.map(([id, cap]) => (
                <option key={id} value={id}>
                  {cap.emoji} {cap.nome} ({cap.capitaoNome || 'sem capitão'}) · 🪙{cap.moedas}
                </option>
              ))}
            </select>

            {myCap && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                {isMyTurn && (
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', padding: '2px 8px', borderRadius: '4px', color: 'var(--green)', background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.25)', letterSpacing: '0.08em' }}>
                    VEZ ATUAL
                  </span>
                )}
                <span style={{ fontFamily: "'Bebas Neue', 'Rajdhani', sans-serif", fontSize: '22px', color: 'var(--gold2)' }}>
                  🪙 {myCap.moedas}
                </span>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: 'var(--text2)' }}>
                  {(Object.keys(myCap.roster ?? {}).length + (myCap.capitaoNome ? 1 : 0))}/{draftConfig.maxPlayers} players
                </span>
              </div>
            )}
          </div>

          {myCap && !notRunning && (
            <>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {[
                  { id: 'buy',   label: `✓ Comprar (${availablePlayers.length})` },
                  { id: 'steal', label: `⚔ Roubar (${stealablePlayers.length})`, disabled: !draftConfig.rouboAtivo },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => !t.disabled && setTab(t.id)}
                    disabled={t.disabled}
                    style={{
                      padding: '9px 18px',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: '13px', letterSpacing: '0.08em',
                      border: 'none', borderBottom: tab === t.id ? '2px solid var(--purple)' : '2px solid transparent',
                      background: 'transparent',
                      color: t.disabled ? 'var(--text3)' : tab === t.id ? 'var(--purple)' : 'var(--text2)',
                      cursor: t.disabled ? 'not-allowed' : 'pointer',
                      transition: 'color 0.15s',
                    }}
                  >
                    {t.label}
                    {t.id === 'steal' && !draftConfig.rouboAtivo && (
                      <span style={{ marginLeft: '5px', fontSize: '10px', opacity: 0.5 }}>(desativado)</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Buy list */}
              {tab === 'buy' && (
                <div style={{ padding: '12px 18px', maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {availablePlayers.length === 0 && (
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--text2)', padding: '12px 0' }}>
                      Nenhum jogador disponível.
                    </div>
                  )}
                  {availablePlayers.map(p => {
                    const preco      = playerState[p.id]?.preco ?? 0
                    const canAfford  = myCap.moedas >= preco
                    const teamFull   = (Object.keys(myCap.roster ?? {}).length + 1) >= draftConfig.maxPlayers
                    const disabled   = loading || !canAfford || teamFull
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '5px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '14px', fontWeight: 600, color: canAfford ? 'var(--text)' : 'var(--text2)' }}>
                            {p.discord}
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', color: 'var(--text2)', display: 'flex', gap: '6px' }}>
                            <span>{p.elo}</span>
                            <span style={{ opacity: 0.4 }}>·</span>
                            <span>{p.rolePrimaria}</span>
                            {overrides[p.id]?.premium && <span style={{ color: 'var(--purple)' }}>★ premium</span>}
                          </div>
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: canAfford ? 'var(--gold)' : 'var(--red)', flexShrink: 0 }}>
                          🪙 {preco}
                        </div>
                        <button
                          className="btn"
                          disabled={disabled}
                          onClick={() => simComprar(p)}
                          style={{ fontSize: '12px', padding: '4px 12px', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--green)', borderColor: 'rgba(76,175,125,0.3)', flexShrink: 0 }}
                        >
                          {teamFull ? 'Time cheio' : !canAfford ? 'Sem moedas' : 'Comprar'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Steal list */}
              {tab === 'steal' && (
                <div style={{ padding: '12px 18px', maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {stealablePlayers.length === 0 && (
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--text2)', padding: '12px 0' }}>
                      Nenhum jogador disponível para roubo.
                    </div>
                  )}
                  {stealablePlayers.map(p => {
                    const ps         = playerState[p.id]
                    const preco      = ps?.preco ?? 0
                    const ownerCap   = captains[ps?.ownedBy]
                    const canAfford  = myCap.moedas >= preco
                    const teamFull   = (Object.keys(myCap.roster ?? {}).length + 1) >= draftConfig.maxPlayers
                    const disabled   = loading || !canAfford || teamFull
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '5px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '14px', fontWeight: 600, color: canAfford ? 'var(--text)' : 'var(--text2)' }}>
                            {p.discord}
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', color: 'var(--text2)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span>{p.elo}</span>
                            <span style={{ opacity: 0.4 }}>·</span>
                            <span>{p.rolePrimaria}</span>
                            <span style={{ opacity: 0.4 }}>·</span>
                            <span style={{ color: ownerCap?.cor }}>
                              {ownerCap?.emoji} {ownerCap?.nome}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: canAfford ? 'var(--gold)' : 'var(--red)', flexShrink: 0 }}>
                          🪙 {preco}
                        </div>
                        <button
                          className="btn"
                          disabled={disabled}
                          onClick={() => simRoubar(p)}
                          style={{ fontSize: '12px', padding: '4px 12px', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)', flexShrink: 0 }}
                        >
                          {teamFull ? 'Time cheio' : !canAfford ? 'Sem moedas' : 'Roubar'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Log */}
          {log.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 18px' }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: '6px' }}>
                Log
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '120px', overflowY: 'auto' }}>
                {log.map((entry, i) => (
                  <div key={i} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: entry.type === 'err' ? 'var(--red)' : 'rgba(76,175,125,0.85)', display: 'flex', gap: '8px' }}>
                    <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{entry.time}</span>
                    {entry.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
