import { useState, useEffect, useCallback } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import {
  SLOTS, SLOT_LABEL, SLOT_DIA, DIA_LABEL,
  STATUS_CONFRONTO, STATUS_LABEL, STATUS_COR,
  resolverDisponibilidade, avisaBackToBack, encontrarSlotsEmComum,
} from '../utils/scheduling'
import './Agendamento.css'

// ── Vista pública: partidas confirmadas por rodada ─────────────────────────────
function AgendaPublica({ teams, confrontos, rodadas }) {
  const confirmedByRodada = {}

  Object.entries(confrontos).forEach(([id, c]) => {
    if (
      c.status !== STATUS_CONFRONTO.CONFIRMADO &&
      c.status !== STATUS_CONFRONTO.REALIZADO &&
      c.status !== STATUS_CONFRONTO.EMPATE_PENDENTE
    ) return
    const rId = c.rodadaId ?? 'sem-rodada'
    if (!confirmedByRodada[rId]) confirmedByRodada[rId] = []
    confirmedByRodada[rId].push({ id, ...c })
  })

  const rodadaEntries = Object.entries(rodadas ?? {})
    .sort(([, a], [, b]) => (a.numero ?? 0) - (b.numero ?? 0))

  const semRodada = confirmedByRodada['sem-rodada']
  const totalConfirmados = Object.values(confirmedByRodada).reduce((s, a) => s + a.length, 0)

  if (totalConfirmados === 0) {
    return (
      <div className="ag-aviso" style={{ marginBottom: '2rem' }}>
        Nenhuma partida confirmada ainda. Os confrontos aparecerão aqui assim que os times acordarem os horários.
      </div>
    )
  }

  return (
    <div className="ag-publica">
      {rodadaEntries.map(([rId, rodada]) => {
        const confrontosRodada = confirmedByRodada[rId]
        if (!confrontosRodada?.length) return null
        return (
          <div key={rId} className="ag-rodada-bloco">
            <div className="ag-rodada-label">Rodada {rodada.numero}</div>
            <div className="ag-partidas-list">
              {confrontosRodada
                .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
                .map(c => (
                  <PartidaCard key={c.id} c={c} teams={teams} />
                ))}
            </div>
          </div>
        )
      })}

      {semRodada?.length > 0 && (
        <div className="ag-rodada-bloco">
          <div className="ag-rodada-label">Outros</div>
          <div className="ag-partidas-list">
            {semRodada.map(c => (
              <PartidaCard key={c.id} c={c} teams={teams} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PartidaCard({ c, teams }) {
  const tA = teams[c.timeA]
  const tB = teams[c.timeB]
  const isRealizado = c.status === STATUS_CONFRONTO.REALIZADO
  const isEmpPend   = c.status === STATUS_CONFRONTO.EMPATE_PENDENTE

  return (
    <div className={`ag-partida-card${isRealizado ? ' ag-partida-card--realizado' : ''}`}>
      <div className="ag-partida-slot">
        {c.slot ? SLOT_LABEL[c.slot] : '—'}
      </div>
      <div className="ag-partida-times">
        <span style={{ color: tA?.cor ?? 'var(--text)', fontWeight: 700 }}>{tA?.nome ?? 'Time A'}</span>
        <span className="ag-partida-vs">vs</span>
        <span style={{ color: tB?.cor ?? 'var(--text)', fontWeight: 700 }}>{tB?.nome ?? 'Time B'}</span>
      </div>
      {isRealizado && c.resultado && (
        <div className="ag-partida-placar">
          <span style={{ color: tA?.cor ?? 'var(--text)' }}>{c.resultado.timeA}</span>
          <span style={{ color: 'var(--text3)' }}>–</span>
          <span style={{ color: tB?.cor ?? 'var(--text)' }}>{c.resultado.timeB}</span>
        </div>
      )}
      {isEmpPend && (
        <div className="ag-partida-placar" style={{ color: 'var(--gold)' }}>1–1 ⚔</div>
      )}
      {!isRealizado && !isEmpPend && (
        <div className="ag-partida-status">Confirmado</div>
      )}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function Agendamento() {
  const { user, isAdmin, capitao } = useAuth()

  const [teams,        setTeams]    = useState({})
  const [confrontos,   setConfrs]   = useState({})
  const [dispon,       setDispon]   = useState({})
  const [rodadas,      setRodadas]  = useState({})
  const [teamSelAdmin, setTeamSelAdmin] = useState('')
  const [selecoes,     setSelecoes] = useState({})
  const [saving,       setSaving]   = useState(null)
  const [feedback,     setFeedback] = useState({})

  const teamSel = isAdmin ? teamSelAdmin : (capitao?.teamId ?? '')

  useEffect(() => onValue(ref(db, '/teams'),         s => setTeams(s.val()  ?? {})), [])
  useEffect(() => onValue(ref(db, '/confrontos'),    s => setConfrs(s.val() ?? {})), [])
  useEffect(() => onValue(ref(db, '/disponibilidade'),s => setDispon(s.val() ?? {})), [])
  useEffect(() => onValue(ref(db, '/rodadas'),       s => setRodadas(s.val() ?? {})), [])

  const confsMeuTime = Object.entries(confrontos).filter(([, c]) =>
    (c.timeA === teamSel || c.timeB === teamSel) &&
    [STATUS_CONFRONTO.PENDENTE, STATUS_CONFRONTO.AGENDANDO, STATUS_CONFRONTO.CONFIRMADO].includes(c.status)
  ).sort(([, a], [, b]) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))

  useEffect(() => {
    if (!teamSel) return
    const init = {}
    confsMeuTime.forEach(([id]) => {
      init[id] = dispon[id]?.[teamSel]?.slots ?? []
    })
    setSelecoes(init)
  }, [teamSel, dispon, confrontos]) // eslint-disable-line

  function toggleSlot(confrontoId, slot) {
    setSelecoes(prev => {
      const atual = prev[confrontoId] ?? []
      const novo  = atual.includes(slot) ? atual.filter(s => s !== slot) : [...atual, slot]
      return { ...prev, [confrontoId]: novo }
    })
  }

  function flash(confrontoId, tipo, msg) {
    setFeedback(f => ({ ...f, [confrontoId]: { tipo, msg } }))
    setTimeout(() => setFeedback(f => ({ ...f, [confrontoId]: null })), 5000)
  }

  function slotsOcupadosNaRodada(confrontoId) {
    const c = confrontos[confrontoId]
    if (!c) return {}
    const ocupados = {}
    Object.entries(confrontos)
      .filter(([id, oc]) =>
        id !== confrontoId &&
        oc.rodadaId === c.rodadaId &&
        oc.status === STATUS_CONFRONTO.CONFIRMADO &&
        (oc.timeA === teamSel || oc.timeB === teamSel) &&
        oc.slot
      )
      .forEach(([, oc]) => { ocupados[oc.slot] = true })
    return ocupados
  }

  const salvar = useCallback(async (confrontoId) => {
    const confronto  = confrontos[confrontoId]
    if (!confronto) return

    const meusSlots = selecoes[confrontoId] ?? []
    const advId     = confronto.timeA === teamSel ? confronto.timeB : confronto.timeA
    const advSlots  = dispon[confrontoId]?.[advId]?.slots ?? []

    setSaving(confrontoId)
    try {
      await set(ref(db, `/disponibilidade/${confrontoId}/${teamSel}`), {
        slots: meusSlots,
        registradoEm: Date.now(),
      })

      if (meusSlots.length > 0 && advSlots.length > 0) {
        const ocupados   = slotsOcupadosNaRodada(confrontoId)
        const resultado  = resolverDisponibilidade(meusSlots, advSlots, ocupados)

        if (resultado.slot) {
          await update(ref(db, `/confrontos/${confrontoId}`), {
            slot:          resultado.slot,
            status:        STATUS_CONFRONTO.CONFIRMADO,
            alertas:       {},
            atualizadoEm:  Date.now(),
          })
          flash(confrontoId, 'ok', `✓ Confirmado automaticamente! ${SLOT_LABEL[resultado.slot]}`)
        } else {
          await update(ref(db, `/confrontos/${confrontoId}`), {
            status:   STATUS_CONFRONTO.AGENDANDO,
            alertas:  { semOverlap: true },
            atualizadoEm: Date.now(),
          })
          flash(confrontoId, 'aviso', 'Nenhum slot em comum com o adversário. O admin foi sinalizado.')
        }
      } else {
        if (confronto.status === STATUS_CONFRONTO.PENDENTE) {
          await update(ref(db, `/confrontos/${confrontoId}`), {
            status:       STATUS_CONFRONTO.AGENDANDO,
            atualizadoEm: Date.now(),
          })
        }
        flash(confrontoId, 'ok', 'Disponibilidade salva. Aguardando o adversário marcar os slots.')
      }
    } catch (e) {
      flash(confrontoId, 'erro', `Erro: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }, [confrontos, selecoes, dispon, teamSel]) // eslint-disable-line

  // ── Render ──────────────────────────────────────────────────────────────────

  const teamsArr = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const meuTime  = teams[teamSel]

  return (
    <div className="ag-root page">
      <h1 className="page-title">Agenda de Partidas</h1>
      <p className="page-subtitle">Partidas confirmadas e disponibilidade por confronto</p>

      {/* ── Partidas confirmadas (visível a todos) ─────────────────────────── */}
      <div className="ag-section-title">Partidas Confirmadas</div>
      <AgendaPublica teams={teams} confrontos={confrontos} rodadas={rodadas} />

      {/* ── Área interativa (capitão / admin) ─────────────────────────────── */}
      {user && (isAdmin || capitao) && (
        <>
          <div className="ag-section-title" style={{ marginTop: '2.5rem' }}>
            {isAdmin ? 'Gerenciar Disponibilidade' : 'Minha Disponibilidade'}
          </div>

          {capitao && !isAdmin && (
            <div className="ag-team-sel">
              <label className="ag-label">Você está jogando como:</label>
              <span className="ag-team-badge" style={{ background: (meuTime?.cor ?? 'var(--blue)') + '22', borderColor: meuTime?.cor ?? 'var(--blue)', color: meuTime?.cor ?? 'var(--blue)' }}>
                {meuTime?.nome ?? capitao.nome}
              </span>
            </div>
          )}

          {isAdmin && (
            <div className="ag-team-sel">
              <label className="ag-label">Visualizando como:</label>
              <select
                className="ag-select"
                value={teamSelAdmin}
                onChange={e => { setTeamSelAdmin(e.target.value); setFeedback({}) }}
              >
                <option value="">— selecionar time —</option>
                {teamsArr.map(([id, t]) => (
                  <option key={id} value={id}>{t.nome}</option>
                ))}
              </select>
              {meuTime && (
                <span className="ag-team-badge" style={{ background: meuTime.cor + '22', borderColor: meuTime.cor, color: meuTime.cor }}>
                  {meuTime.nome}
                </span>
              )}
            </div>
          )}

          {teamSel && confsMeuTime.length === 0 && (
            <div className="ag-aviso">Nenhum confronto pendente para este time.</div>
          )}

          {teamSel && confsMeuTime.map(([id, c]) => {
            const advId    = c.timeA === teamSel ? c.timeB : c.timeA
            const adv      = teams[advId]
            const rodada   = rodadas[c.rodadaId]
            const meusSlots = selecoes[id] ?? []
            const advSlots  = dispon[id]?.[advId]?.slots ?? []
            const emComum   = encontrarSlotsEmComum(meusSlots, advSlots)
            const ocupados  = slotsOcupadosNaRodada(id)
            const fb        = feedback[id]

            return (
              <div key={id} className={`ag-confronto${c.status === STATUS_CONFRONTO.CONFIRMADO ? ' ag-confronto--ok' : ''}`}>

                <div className="ag-confronto-header">
                  <div className="ag-confronto-vs">
                    <span style={{ color: meuTime?.cor ?? 'var(--blue)', fontWeight: 700 }}>{meuTime?.nome ?? 'Seu time'}</span>
                    <span className="ag-vs">vs</span>
                    <span style={{ color: adv?.cor ?? 'var(--red)', fontWeight: 700 }}>{adv?.nome ?? 'A definir'}</span>
                  </div>
                  <div className="ag-confronto-meta">
                    {rodada && <span>Rodada {rodada.numero}</span>}
                    <span>·</span>
                    <span>{c.formato}</span>
                    <span className="ag-status" style={{ color: STATUS_COR[c.status] }}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                </div>

                {c.status === STATUS_CONFRONTO.CONFIRMADO && c.slot && (
                  <div className="ag-confirmado">
                    <span className="ag-confirmado-icon">✓</span>
                    Partida confirmada: <strong>{SLOT_LABEL[c.slot]}</strong>
                  </div>
                )}

                {c.status !== STATUS_CONFRONTO.CONFIRMADO && (
                  <>
                    <div className="ag-legenda">
                      <span className="ag-leg ag-leg--meu" style={{ '--c': meuTime?.cor ?? 'var(--blue)' }}>Minha disponibilidade</span>
                      {advSlots.length > 0 && <span className="ag-leg ag-leg--adv" style={{ '--c': adv?.cor ?? 'var(--red)' }}>Adversário disponível</span>}
                      {emComum.length > 0 && <span className="ag-leg ag-leg--ok">Slots em comum</span>}
                      {advSlots.length === 0 && <span className="ag-leg ag-leg--wait">Aguardando adversário</span>}
                    </div>

                    <div className="ag-grid">
                      {Object.entries(DIA_LABEL).map(([dia, diaLabel]) => {
                        const slotsHoje = SLOTS.filter(s => SLOT_DIA[s] === dia)
                        return (
                          <div key={dia} className="ag-dia">
                            <div className="ag-dia-label">{diaLabel}</div>
                            <div className="ag-dia-slots">
                              {slotsHoje.map(slot => {
                                const euMarcei  = meusSlots.includes(slot)
                                const advMarcou = advSlots.includes(slot)
                                const overlap   = emComum.includes(slot)
                                const ocupado   = !!ocupados[slot]
                                const backToBack = !ocupado && !euMarcei && avisaBackToBack(teamSel, slot,
                                  Object.values(confrontos).filter(cc =>
                                    cc.status === STATUS_CONFRONTO.CONFIRMADO &&
                                    cc.rodadaId === c.rodadaId &&
                                    (cc.timeA === teamSel || cc.timeB === teamSel)
                                  )
                                )

                                return (
                                  <button
                                    key={slot}
                                    className={[
                                      'ag-slot',
                                      euMarcei  ? 'ag-slot--meu'    : '',
                                      advMarcou ? 'ag-slot--adv'    : '',
                                      overlap   ? 'ag-slot--ok'     : '',
                                      ocupado   ? 'ag-slot--ocupado': '',
                                      backToBack? 'ag-slot--warn'   : '',
                                    ].filter(Boolean).join(' ')}
                                    style={{
                                      '--minha-cor': meuTime?.cor ?? 'var(--blue)',
                                      '--adv-cor':   adv?.cor     ?? 'var(--red)',
                                    }}
                                    onClick={() => !ocupado && toggleSlot(id, slot)}
                                    disabled={ocupado}
                                    title={ocupado ? 'Slot ocupado por outra partida confirmada' : backToBack ? '⚠ Back-to-back com outra partida' : SLOT_LABEL[slot]}
                                  >
                                    <span className="ag-slot-hora">{slot.split('-')[1]}</span>
                                    {backToBack && !euMarcei && <span className="ag-slot-warn">!</span>}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="ag-resumo">
                      <span>{meusSlots.length} slot{meusSlots.length !== 1 ? 's' : ''} selecionado{meusSlots.length !== 1 ? 's' : ''}</span>
                      {emComum.length > 0 && (
                        <span className="ag-resumo-ok">
                          {emComum.length} em comum — vai confirmar automaticamente ao salvar
                        </span>
                      )}
                      {advSlots.length > 0 && emComum.length === 0 && (
                        <span className="ag-resumo-warn">Nenhum slot em comum com o adversário</span>
                      )}
                    </div>

                    {fb && (
                      <div className={`ag-fb ag-fb--${fb.tipo}`}>{fb.msg}</div>
                    )}

                    <div className="ag-acoes">
                      <button
                        className="btn primary"
                        onClick={() => salvar(id)}
                        disabled={saving === id || meusSlots.length === 0}
                        style={{ fontSize: 13 }}
                      >
                        {saving === id ? 'Salvando...' : 'Salvar disponibilidade'}
                      </button>
                      {meusSlots.length > 0 && (
                        <button className="btn" style={{ fontSize: 12 }}
                          onClick={() => setSelecoes(s => ({ ...s, [id]: [] }))}>
                          Limpar
                        </button>
                      )}
                      <button
                        className="btn"
                        style={{ fontSize: 12 }}
                        onClick={() => setSelecoes(s => ({ ...s, [id]: SLOTS }))}
                        title="Marcar todos os slots disponíveis"
                      >
                        Disponível sempre
                      </button>
                    </div>
                  </>
                )}

              </div>
            )
          })}
        </>
      )}

      {!user && (
        <div className="ag-aviso" style={{ marginTop: '0.5rem', fontSize: 13 }}>
          <a href="/login-capitao" style={{ color: 'var(--blue)' }}>Faça login como capitão</a> para marcar sua disponibilidade.
        </div>
      )}
    </div>
  )
}
