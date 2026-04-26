import { useState, useEffect } from 'react'
import { ref, onValue, update, remove, set } from 'firebase/database'
import { db } from '../firebase/database'

const DEFAULT_STATE = { status: 'aguardando', turnoAtual: null, turnoExtra: null, rodada: 1 }

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

export default function AdminDraftControl({ draftConfig }) {
  const [captains,    setCaptains]    = useState({})
  const [draftState,  setDraftState]  = useState(DEFAULT_STATE)
  const [playerState, setPlayerState] = useState({})
  const [msg,         setMsg]         = useState({ text: '', type: 'ok' })
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    const u1 = onValue(ref(db, '/draftSession/captains'),    s => setCaptains(s.val() ?? {}))
    const u2 = onValue(ref(db, '/draftSession/state'),       s => setDraftState(s.exists() ? { ...DEFAULT_STATE, ...s.val() } : DEFAULT_STATE))
    const u3 = onValue(ref(db, '/draftSession/playerState'), s => setPlayerState(s.val() ?? {}))
    return () => { u1(); u2(); u3() }
  }, [])

  const sortedCaptains = Object.entries(captains).sort(([, a], [, b]) => a.seed - b.seed)
  const min = draftConfig?.minCaptains ?? 2
  const semCapitao = sortedCaptains.filter(([, c]) => !c.capitaoNome)
  const podeIniciar = sortedCaptains.length >= min && draftState.status === 'aguardando'

  function flash(text, type = 'ok') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: 'ok' }), 3000)
  }

  async function iniciarDraft() {
    if (!podeIniciar) return
    const primeiro = sortedCaptains[0]?.[0]
    if (!primeiro) return
    await set(ref(db, '/draftSession/state'), {
      status:     'rodando',
      turnoAtual: primeiro,
      turnoExtra: null,
      rodada:     1,
    })
    flash('Leilão iniciado!')
  }

  async function encerrarDraft() {
    await update(ref(db, '/draftSession/state'), { status: 'encerrado' })
    flash('Leilão encerrado.')
  }

  async function retomar() {
    await update(ref(db, '/draftSession/state'), { status: 'rodando' })
    flash('Leilão retomado.')
  }

  async function avancarTurno() {
    const currentId   = draftState.turnoExtra ?? draftState.turnoAtual
    const currentCap  = captains[currentId] ?? {}
    const currentSize = Object.keys(currentCap.roster ?? {}).length + 1
    const maxPlayers  = draftConfig?.maxPlayers ?? 7
    const next = proximoCom(sortedCaptains, captains, currentId, currentSize, maxPlayers)
    if (!next) {
      await update(ref(db, '/draftSession/state'), { status: 'encerrado' })
      flash('Todos os times estão completos. Leilão encerrado.')
      return
    }
    const updates = {
      '/draftSession/state/turnoAtual': next.id,
      '/draftSession/state/turnoExtra': null,
    }
    if (next.novaRodada) updates['/draftSession/state/rodada'] = (draftState.rodada ?? 1) + 1
    await update(ref(db), updates)
    flash('Turno avançado.')
  }

  async function resetarDraft() {
    // Limpa rosters e playerState mas mantém os times cadastrados
    const updates = {}
    sortedCaptains.forEach(([id, cap]) => {
      updates[`/draftSession/captains/${id}/roster`]  = null
      updates[`/draftSession/captains/${id}/moedas`]  = draftConfig?.moedas ?? 15
    })
    updates['/draftSession/playerState'] = null
    updates['/draftSession/state']       = DEFAULT_STATE
    await update(ref(db), updates)
    setConfirmReset(false)
    flash('Leilão resetado. Times mantidos, compras apagadas.')
  }

  // ── Status display ────────────────────────────────────────
  const statusLabel = {
    aguardando: { text: 'Aguardando',  color: 'var(--gold)',  bg: 'rgba(201,168,76,0.1)',   border: 'rgba(201,168,76,0.3)'  },
    rodando:    { text: 'Em andamento',color: 'var(--green)', bg: 'rgba(76,175,125,0.1)',   border: 'rgba(76,175,125,0.3)'  },
    encerrado:  { text: 'Encerrado',   color: 'var(--text2)', bg: 'rgba(255,255,255,0.04)', border: 'var(--border)'         },
  }[draftState.status] ?? {}

  const currentTurnCap = captains[draftState.turnoExtra ?? draftState.turnoAtual]

  // Contar jogadores por time
  function rosterCount(cap) {
    return Object.keys(cap.roster ?? {}).length + (cap.capitaoNome ? 1 : 0)
  }

  return (
    <div className="admin-section admin-players-section" style={{ marginBottom: '28px' }}>
      <div className="admin-section-title">Controle do Leilão</div>

      {/* Status geral */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>Status</span>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '5px', color: statusLabel.color, background: statusLabel.bg, border: `1px solid ${statusLabel.border}` }}>
            {statusLabel.text}
          </span>
        </div>
        {draftState.status === 'rodando' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text2)', fontSize: '13px', fontFamily: "'Barlow Condensed', sans-serif" }}>
              <span>Rodada {draftState.rodada}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--text)' }}>
                Vez de: <strong style={{ color: currentTurnCap?.cor }}>{currentTurnCap?.capitaoNome || currentTurnCap?.nome || '—'}</strong>
                {draftState.turnoExtra && <span style={{ marginLeft: '6px', color: 'var(--red)', fontSize: '11px' }}>(TURNO EXTRA)</span>}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Times e progresso */}
      {sortedCaptains.length > 0 && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: '10px' }}>
            Times ({sortedCaptains.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sortedCaptains.map(([id, cap]) => {
              const count  = rosterCount(cap)
              const min_p  = draftConfig?.minPlayers ?? 5
              const max_p  = draftConfig?.maxPlayers ?? 7
              const isVez  = (draftState.turnoAtual === id || draftState.turnoExtra === id) && draftState.status === 'rodando'
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', background: isVez ? cap.cor + '10' : 'var(--bg3)', border: `1px solid ${isVez ? cap.cor + '44' : 'var(--border)'}` }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{cap.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', fontWeight: 600, color: cap.cor }}>{cap.nome}</div>
                    {cap.capitaoNome
                      ? <div style={{ fontSize: '11px', color: 'var(--text2)' }}>⚑ {cap.capitaoNome}</div>
                      : <div style={{ fontSize: '11px', color: 'var(--red)', opacity: 0.7 }}>sem capitão</div>
                    }
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: 'var(--gold)' }}>🪙 {cap.moedas}</span>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: count >= min_p ? 'var(--green)' : 'var(--text2)' }}>
                      {count}/{max_p} players{count >= min_p ? ' ✓' : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Alertas */}
      {semCapitao.length > 0 && draftState.status === 'aguardando' && (
        <div style={{ margin: '0 18px', marginTop: '12px', padding: '8px 14px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: '6px', fontSize: '13px', color: 'var(--red)' }}>
          ⚠ {semCapitao.length} time{semCapitao.length > 1 ? 's' : ''} sem capitão vinculado: {semCapitao.map(([, c]) => c.nome).join(', ')}
        </div>
      )}
      {sortedCaptains.length < min && draftState.status === 'aguardando' && (
        <div style={{ margin: '0 18px', marginTop: '12px', padding: '8px 14px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: '6px', fontSize: '13px', color: 'var(--red)' }}>
          ⚠ Mínimo de {min} times necessário. Cadastre mais times na seção acima.
        </div>
      )}

      {/* Botões de controle */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

        {draftState.status === 'aguardando' && (
          <button
            className="btn primary"
            style={{ fontSize: '13px', padding: '8px 18px', opacity: podeIniciar ? 1 : 0.45, cursor: podeIniciar ? 'pointer' : 'not-allowed' }}
            disabled={!podeIniciar}
            onClick={iniciarDraft}
          >
            ▶ Iniciar Leilão
          </button>
        )}

        {draftState.status === 'rodando' && (
          <>
            <button className="btn" style={{ fontSize: '13px', padding: '8px 18px' }} onClick={avancarTurno}>
              ⏭ Avançar Turno
            </button>
            <button className="btn" style={{ fontSize: '13px', padding: '8px 18px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }} onClick={encerrarDraft}>
              ⏹ Encerrar Leilão
            </button>
          </>
        )}

        {draftState.status === 'encerrado' && (
          <button className="btn primary" style={{ fontSize: '13px', padding: '8px 18px' }} onClick={retomar}>
            ↩ Reabrir Leilão
          </button>
        )}

        {/* Reset — sempre disponível, com confirmação */}
        {!confirmReset ? (
          <button
            className="btn"
            style={{ fontSize: '13px', padding: '8px 18px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)', marginLeft: 'auto' }}
            onClick={() => setConfirmReset(true)}
          >
            🗑 Resetar Leilão
          </button>
        ) : (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Apagar todas as compras?</span>
            <button className="btn" style={{ fontSize: '13px', padding: '6px 14px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }} onClick={resetarDraft}>
              Confirmar
            </button>
            <button className="btn" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => setConfirmReset(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {msg.text && (
        <div style={{ margin: '0 18px 14px', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', color: msg.type === 'err' ? 'var(--red)' : 'var(--green)', background: msg.type === 'err' ? 'rgba(224,85,85,0.08)' : 'rgba(76,175,125,0.08)', border: `1px solid ${msg.type === 'err' ? 'rgba(224,85,85,0.25)' : 'rgba(76,175,125,0.25)'}` }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
