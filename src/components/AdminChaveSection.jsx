import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove, push } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { chavePath, confrontosPath, teamPath, rodadasPath } from '../utils/campeonatoPaths'
import { STATUS_CONFRONTO, FORMATO_SERIE } from '../utils/scheduling'

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 10px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}
const labelStyle = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif",
  display: 'block', marginBottom: 4,
}

// Retorna o teamId vencedor de um confronto, ou null se ainda não determinado
function getWinner(confronto) {
  if (!confronto?.resultado) return null
  const r = confronto.resultado
  if (r.tipo === 'wo_a') return confronto.timeA
  if (r.tipo === 'wo_b') return confronto.timeB
  if (r.tipo === 'normal') {
    if (r.timeA > r.timeB) return confronto.timeA
    if (r.timeB > r.timeA) return confronto.timeB
  }
  return null
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function AdminChaveSection() {
  const { campeonatoId } = useCampeonato()
  const [chaves,     setChaves]     = useState({})
  const [confrontos, setConfrontos] = useState({})
  const [times,      setTimes]      = useState({})
  const [rodadas,    setRodadas]    = useState({})
  const [chaveSel,   setChaveSel]   = useState('')
  const [slotSel,    setSlotSel]    = useState(null)
  const [feedback,   setFeedback]   = useState(null)
  const [formNova,   setFormNova]   = useState(false)
  const [nomeNova,   setNomeNova]   = useState('')
  const [confirmDeleteChave, setConfirmDeleteChave] = useState(false)

  useEffect(() => onValue(ref(db, chavePath(campeonatoId)),      s => setChaves(s.val()     ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, confrontosPath(campeonatoId)), s => setConfrontos(s.val() ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, teamPath(campeonatoId)),       s => setTimes(s.val()      ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, rodadasPath(campeonatoId)),    s => setRodadas(s.val()    ?? {})), [campeonatoId])

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 3500)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async function criarChave() {
    const nome = nomeNova.trim()
    if (!nome) return
    const id = push(ref(db, chavePath(campeonatoId))).key
    await set(ref(db, `${chavePath(campeonatoId)}/${id}`), { nome, criadaEm: Date.now() })
    setChaveSel(id)
    setNomeNova('')
    setFormNova(false)
    flash('ok', `Chave "${nome}" criada.`)
  }

  async function deletarChave() {
    await remove(ref(db, `${chavePath(campeonatoId)}/${chaveSel}`))
    setChaveSel('')
    setSlotSel(null)
    setConfirmDeleteChave(false)
    flash('ok', 'Chave removida.')
  }

  async function adicionarSlot() {
    const slots = chaves[chaveSel]?.slots ?? {}
    const existentes = Object.values(slots)
    const maxOrdem = existentes.length ? Math.max(...existentes.map(s => s.ordem ?? 0)) + 1 : 0
    const id = push(ref(db, `${chavePath(campeonatoId)}/${chaveSel}/slots`)).key
    await set(ref(db, `${chavePath(campeonatoId)}/${chaveSel}/slots/${id}`), {
      label: '', confrontoId: null, proximoSlot: null,
      coluna: 0, ordem: maxOrdem, criadoEm: Date.now(),
    })
    setSlotSel(id)
  }

  async function atualizarSlot(slotId, updates) {
    await update(ref(db, `${chavePath(campeonatoId)}/${chaveSel}/slots/${slotId}`), updates)
  }

  async function deletarSlot(slotId) {
    const slots = chaves[chaveSel]?.slots ?? {}
    const batch = {}
    for (const [id, s] of Object.entries(slots)) {
      if (s.proximoSlot === slotId) {
        batch[`${chavePath(campeonatoId)}/${chaveSel}/slots/${id}/proximoSlot`] = null
      }
    }
    if (Object.keys(batch).length) await update(ref(db), batch)
    await remove(ref(db, `${chavePath(campeonatoId)}/${chaveSel}/slots/${slotId}`))
    if (slotSel === slotId) setSlotSel(null)
  }

  // Cria um confronto novo e vincula ao slot (chamado quando vencedores dos feeders são conhecidos)
  async function criarConfrontoParaSlot(slotId, teamA, teamB, formato) {
    const id = push(ref(db, confrontosPath(campeonatoId))).key
    await set(ref(db, `${confrontosPath(campeonatoId)}/${id}`), {
      timeA: teamA, timeB: teamB,
      tipo: 'playoffs', formato,
      rodadaId: null, slot: null,
      status: STATUS_CONFRONTO.PENDENTE,
      resultado: null, alertas: {}, observacoes: null,
      criadoEm: Date.now(), atualizadoEm: Date.now(),
    })
    await update(ref(db, `${chavePath(campeonatoId)}/${chaveSel}/slots/${slotId}`), { confrontoId: id })
    flash('ok', 'Confronto criado e vinculado ao slot.')
  }

  // ── Derivados ─────────────────────────────────────────────────────────────────

  const chavesArr = Object.entries(chaves).sort(([, a], [, b]) => (a.criadaEm ?? 0) - (b.criadaEm ?? 0))
  const chaveAtual = chaves[chaveSel]
  const slots = chaveAtual?.slots ?? {}

  // feedersMap: slotId → [{ slotId, slot, confronto, winner }]
  // Para cada slot, quais outros slots têm proximoSlot apontando para ele
  const feedersMap = {}
  for (const [id, s] of Object.entries(slots)) {
    const next = s.proximoSlot
    if (next && slots[next]) {
      if (!feedersMap[next]) feedersMap[next] = []
      const confronto = confrontos[s.confrontoId] ?? null
      feedersMap[next].push({ slotId: id, slot: s, confronto, winner: getWinner(confronto) })
    }
  }

  // Group slots by coluna, sorted by ordem
  const porColuna = {}
  for (const [id, s] of Object.entries(slots)) {
    const col = s.coluna ?? 0
    if (!porColuna[col]) porColuna[col] = []
    porColuna[col].push([id, s])
  }
  for (const col of Object.keys(porColuna)) {
    porColuna[col].sort(([, a], [, b]) => (a.ordem ?? 0) - (b.ordem ?? 0))
  }
  const colunas = Object.entries(porColuna).sort(([a], [b]) => Number(a) - Number(b))

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <section className="admin-section" style={{ maxWidth: 'none', borderColor: 'rgba(201,168,76,0.25)' }}>
      <div className="admin-section-title" style={{ color: 'var(--gold)' }}>Chaves (Bracket)</div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {feedback && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13,
            background: feedback.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
            border: `1px solid ${feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
            color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {feedback.msg}
          </div>
        )}

        {/* ── Seletor de chave ── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={chaveSel}
            onChange={e => { setChaveSel(e.target.value); setSlotSel(null); setConfirmDeleteChave(false) }}
            style={{ ...inputStyle, width: 'auto', minWidth: 200 }}>
            <option value="">— selecionar chave —</option>
            {chavesArr.map(([id, c]) => (
              <option key={id} value={id}>{c.nome}</option>
            ))}
          </select>

          {!formNova ? (
            <button className="btn"
              style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--gold)', color: 'var(--gold)', whiteSpace: 'nowrap' }}
              onClick={() => setFormNova(true)}>
              + Nova chave
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={nomeNova} onChange={e => setNomeNova(e.target.value)}
                placeholder="Nome da chave…" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') criarChave(); if (e.key === 'Escape') { setFormNova(false); setNomeNova('') } }}
                style={{ ...inputStyle, width: 200 }} />
              <button className="btn primary" style={{ fontSize: 13, padding: '7px 12px' }} onClick={criarChave}>Criar</button>
              <button className="btn" style={{ fontSize: 13, padding: '7px 10px' }} onClick={() => { setFormNova(false); setNomeNova('') }}>✕</button>
            </div>
          )}

          {chaveSel && !confirmDeleteChave && (
            <button className="btn"
              style={{ fontSize: 12, padding: '5px 10px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)', marginLeft: 'auto' }}
              onClick={() => setConfirmDeleteChave(true)}>
              🗑 Apagar chave
            </button>
          )}
          {chaveSel && confirmDeleteChave && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 'auto' }}>
                Apagar "{chaveAtual?.nome}" e todos os slots?
              </span>
              <button className="btn" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
                onClick={deletarChave}>Confirmar</button>
              <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setConfirmDeleteChave(false)}>Cancelar</button>
            </>
          )}
        </div>

        {/* ── Bracket editor ── */}
        {chaveAtual && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                {chaveAtual.nome}
              </span>
              <button className="btn"
                style={{ fontSize: 12, padding: '5px 14px', borderColor: 'var(--purple)', color: 'var(--purple)' }}
                onClick={adicionarSlot}>
                + Adicionar slot
              </button>
            </div>

            {colunas.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', padding: '8px 0' }}>
                Nenhum slot criado. Clique em "+ Adicionar slot" para começar.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
                {colunas.map(([colIdx, colSlots], ci) => (
                  <div key={colIdx} style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>
                      <div style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif",
                        textAlign: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border)',
                      }}>
                        Coluna {Number(colIdx) + 1}
                        <span style={{ color: 'var(--border2)', marginLeft: 6 }}>
                          ({colSlots.length} slot{colSlots.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      {colSlots.map(([slotId, slot]) => (
                        <SlotCard
                          key={slotId}
                          slotId={slotId}
                          slot={slot}
                          confrontos={confrontos}
                          times={times}
                          rodadas={rodadas}
                          allSlots={slots}
                          feeders={feedersMap[slotId] ?? []}
                          isSelected={slotSel === slotId}
                          onSelect={() => setSlotSel(slotSel === slotId ? null : slotId)}
                          onUpdate={upd => atualizarSlot(slotId, upd)}
                          onDelete={() => deletarSlot(slotId)}
                          onCriarConfronto={(tA, tB, fmt) => criarConfrontoParaSlot(slotId, tA, tB, fmt)}
                        />
                      ))}
                    </div>
                    {ci < colunas.length - 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, alignSelf: 'stretch', flexShrink: 0 }}>
                        <div style={{ width: 1, height: '60%', background: 'var(--border)' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <strong style={{ color: 'var(--text2)' }}>Coluna</strong> = fase (1 = 1ª rodada) ·{' '}
              <strong style={{ color: 'var(--text2)' }}>Ordem</strong> = posição vertical ·{' '}
              <strong style={{ color: 'var(--text2)' }}>Próximo slot</strong> = para onde o vencedor avança
            </p>
          </div>
        )}

        {chavesArr.length === 0 && !formNova && (
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhuma chave criada ainda.</p>
        )}
      </div>
    </section>
  )
}

// ── SlotCard ───────────────────────────────────────────────────────────────────

function SlotCard({ slotId, slot, confrontos, times, rodadas, allSlots, feeders, isSelected, onSelect, onUpdate, onDelete, onCriarConfronto }) {
  const [labelEdit,    setLabelEdit]    = useState(slot.label ?? '')
  const [criarFormato, setCriarFormato] = useState(FORMATO_SERIE.MD2)
  const [confirmCriar, setConfirmCriar] = useState(false)

  // Sync label if Firebase changes from outside
  useEffect(() => { setLabelEdit(slot.label ?? '') }, [slot.label])

  const confronto  = confrontos[slot.confrontoId]
  const tA         = confronto ? times[confronto.timeA] : null
  const tB         = confronto ? times[confronto.timeB] : null
  const realizado  = confronto?.status === STATUS_CONFRONTO.REALIZADO || confronto?.status === STATUS_CONFRONTO.EMPATE_PENDENTE
  const vencedorId = realizado && confronto?.resultado
    ? (confronto.resultado.timeA > confronto.resultado.timeB ? confronto.timeA
     : confronto.resultado.timeB > confronto.resultado.timeA ? confronto.timeB : null)
    : null

  // Times que chegam de slots vinculados via proximoSlot
  const timesEntrando = feeders.map(f => ({
    time: f.winner ? times[f.winner] : null,
    winnerId: f.winner,
    slotLabel: f.slot.label || `Slot col.${f.slot.coluna ?? 0}`,
    pendente: !f.winner,
  }))

  // Dois vencedores definidos e slot sem confronto → pode criar
  const podeGerarConfronto = !slot.confrontoId
    && timesEntrando.length >= 2
    && timesEntrando.filter(t => !t.pendente).length >= 2

  // Pelo menos um vencedor entrando (para mostrar a seção)
  const temEntrada = timesEntrando.length > 0

  const confrontosArr = Object.entries(confrontos)
    .sort(([, a], [, b]) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))

  const outrosSlots = Object.entries(allSlots)
    .filter(([id]) => id !== slotId)
    .sort(([, a], [, b]) => {
      if ((a.coluna ?? 0) !== (b.coluna ?? 0)) return (a.coluna ?? 0) - (b.coluna ?? 0)
      return (a.ordem ?? 0) - (b.ordem ?? 0)
    })

  const proximoConfronto = allSlots[slot.proximoSlot]
    ? confrontos[allSlots[slot.proximoSlot].confrontoId]
    : null

  return (
    <div
      onClick={onSelect}
      style={{
        background: isSelected ? 'rgba(155,110,232,0.06)' : 'var(--bg2)',
        border: `1px solid ${isSelected ? 'rgba(155,110,232,0.4)' : realizado ? 'rgba(76,175,125,0.25)' : podeGerarConfronto ? 'rgba(74,158,218,0.4)' : 'var(--border)'}`,
        borderRadius: 7, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}>

      {/* ── Display ── */}
      <div style={{ padding: '8px 10px' }}>
        {slot.label && (
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 5 }}>
            {slot.label}
          </div>
        )}

        {/* Times do confronto vinculado */}
        {confronto ? (
          <>
            <TeamRow time={tA} placar={realizado ? confronto.resultado?.timeA : null} isWinner={vencedorId === confronto?.timeA} />
            <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
            <TeamRow time={tB} placar={realizado ? confronto.resultado?.timeB : null} isWinner={vencedorId === confronto?.timeB} />
            {confronto?.pontosTabela && realizado && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textAlign: 'right', fontFamily: "'Barlow Condensed', sans-serif" }}>
                +<span style={{ color: 'var(--gold)' }}>{confronto.pontosTabela.timeA}pts</span>
                {' · '}
                +<span style={{ color: 'var(--gold)' }}>{confronto.pontosTabela.timeB}pts</span>
              </div>
            )}
          </>
        ) : (
          /* Slot sem confronto: mostra times entrando (se houver) ou placeholders */
          temEntrada ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {timesEntrando.slice(0, 2).map((entrada, i) => (
                <div key={i}>
                  {i === 1 && <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: entrada.time?.cor ?? 'var(--border2)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: entrada.time ? (entrada.time.cor ?? 'var(--text)') : 'var(--text3)', fontStyle: entrada.time ? 'normal' : 'italic' }}>
                      {entrada.time?.nome ?? (entrada.pendente ? `? (de ${entrada.slotLabel})` : '?')}
                    </span>
                    {entrada.time && (
                      <span style={{ fontSize: 9, color: 'var(--green)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>✓</span>
                    )}
                  </div>
                </div>
              ))}
              {timesEntrando.length > 2 && (
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 2 }}>
                  +{timesEntrando.length - 2} feeder{timesEntrando.length - 2 > 1 ? 's' : ''}...
                </div>
              )}
            </div>
          ) : (
            <>
              <TeamRow time={null} />
              <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
              <TeamRow time={null} />
            </>
          )
        )}

        {/* Gerar confronto automático */}
        {podeGerarConfronto && !confirmCriar && (
          <button
            className="btn"
            onClick={e => { e.stopPropagation(); setConfirmCriar(true) }}
            style={{ marginTop: 8, width: '100%', fontSize: 11, padding: '5px 8px', borderColor: 'var(--blue)', color: 'var(--blue)', background: 'rgba(74,158,218,0.06)' }}>
            ⚡ Gerar confronto
          </button>
        )}

        {podeGerarConfronto && confirmCriar && (
          <div style={{ marginTop: 8, padding: '8px', background: 'rgba(74,158,218,0.08)', border: '1px solid rgba(74,158,218,0.3)', borderRadius: 5 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>
              <strong style={{ color: 'var(--blue)' }}>{times[timesEntrando[0].winnerId]?.nome}</strong>
              {' vs '}
              <strong style={{ color: 'var(--blue)' }}>{times[timesEntrando[1].winnerId]?.nome}</strong>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>Formato:</span>
              {[FORMATO_SERIE.MD2, FORMATO_SERIE.MD3, FORMATO_SERIE.MD5].map(f => (
                <button key={f} onClick={() => setCriarFormato(f)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    border: `1px solid ${criarFormato === f ? 'var(--blue)' : 'var(--border)'}`,
                    background: criarFormato === f ? 'rgba(74,158,218,0.15)' : 'transparent',
                    color: criarFormato === f ? 'var(--blue)' : 'var(--text3)' }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn primary" style={{ fontSize: 11, padding: '4px 10px', flex: 1 }}
                onClick={() => { onCriarConfronto(timesEntrando[0].winnerId, timesEntrando[1].winnerId, criarFormato); setConfirmCriar(false) }}>
                Criar
              </button>
              <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={() => setConfirmCriar(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Próximo slot */}
        {slot.proximoSlot && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>
            → {proximoConfronto
              ? `${times[proximoConfronto.timeA]?.nome ?? '?'} vs ${times[proximoConfronto.timeB]?.nome ?? '?'}`
              : (allSlots[slot.proximoSlot]?.label || 'Próximo slot')}
          </div>
        )}
      </div>

      {/* ── Edit panel ── */}
      {isSelected && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px', display: 'flex', flexDirection: 'column', gap: 10 }}
          onClick={e => e.stopPropagation()}>

          <div>
            <label style={labelStyle}>Label</label>
            <input
              value={labelEdit}
              onChange={e => setLabelEdit(e.target.value)}
              onBlur={e => onUpdate({ label: e.target.value || null })}
              placeholder="ex: Quartas A1"
              style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Confronto vinculado</label>
            <select value={slot.confrontoId ?? ''}
              onChange={e => onUpdate({ confrontoId: e.target.value || null })}
              style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}>
              <option value="">— não vinculado (?)</option>
              {confrontosArr.map(([id, c]) => {
                const a = times[c.timeA]?.nome ?? c.timeA
                const b = times[c.timeB]?.nome ?? c.timeB
                const r = rodadas[c.rodadaId]
                return (
                  <option key={id} value={id}>
                    {r ? `R${r.numero} · ` : ''}{a} vs {b}
                  </option>
                )
              })}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Coluna (fase)</label>
              <input type="number" min={0} value={slot.coluna ?? 0}
                onChange={e => onUpdate({ coluna: Math.max(0, parseInt(e.target.value) || 0) })}
                style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }} />
            </div>
            <div>
              <label style={labelStyle}>Ordem (vertical)</label>
              <input type="number" min={0} value={slot.ordem ?? 0}
                onChange={e => onUpdate({ ordem: Math.max(0, parseInt(e.target.value) || 0) })}
                style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Próximo slot (vencedor avança para)</label>
            <select value={slot.proximoSlot ?? ''}
              onChange={e => onUpdate({ proximoSlot: e.target.value || null })}
              style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}>
              <option value="">— nenhum (slot final) —</option>
              {outrosSlots.map(([id, s]) => {
                const c = confrontos[s.confrontoId]
                const a = c ? times[c.timeA]?.nome : null
                const b = c ? times[c.timeB]?.nome : null
                const lbl = s.label || (a && b ? `${a} vs ${b}` : `Slot col.${s.coluna ?? 0}`)
                return <option key={id} value={id}>{lbl}</option>
              })}
            </select>
          </div>

          <button className="btn"
            style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--red)', alignSelf: 'flex-start' }}
            onClick={onDelete}>
            🗑 Remover slot
          </button>
        </div>
      )}
    </div>
  )
}

function TeamRow({ time, placar, isWinner }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: time?.cor ?? 'var(--border2)', flexShrink: 0 }} />
      <span style={{
        flex: 1, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
        color: isWinner ? (time?.cor ?? 'var(--text)') : time ? 'var(--text2)' : 'var(--text3)',
        fontWeight: isWinner ? 700 : 400,
        fontStyle: !time ? 'italic' : 'normal',
      }}>
        {time?.nome ?? '?'}
      </span>
      {placar !== null && placar !== undefined && (
        <span style={{ fontWeight: 700, fontSize: 13, color: isWinner ? 'var(--green)' : 'var(--text3)', fontFamily: "'Rajdhani', sans-serif" }}>
          {placar}
        </span>
      )}
    </div>
  )
}
