import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove, push } from 'firebase/database'
import { db } from '../firebase/database'
import {
  SLOTS, SLOT_LABEL, SLOT_DIA, DIA_LABEL,
  STATUS_CONFRONTO, STATUS_LABEL, STATUS_COR,
  TIPO_CONFRONTO, FORMATO_SERIE,
  TIPO_RESULTADO, PONTUACAO_PADRAO,
  encontrarSlotsEmComum, calcularPontos, formatarResultado, confrontosComAlertas,
} from '../utils/scheduling'

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AdminRodadasSection() {
  const [rodadas, setRodadas]           = useState({})
  const [confrontos, setConfrontos]     = useState({})
  const [disponibilidade, setDisp]      = useState({})
  const [times, setTimes]               = useState({})
  const [rodadaSel, setRodadaSel]       = useState('')
  const [feedback, setFeedback]         = useState(null)

  // Modais
  const [confirmDeleteRodada, setConfirmDeleteRodada] = useState(false)
  const [modalNovaRodada, setModalNovaRodada]         = useState(false)
  const [modalNovoConfr, setModalNovoConfr]       = useState(false)
  const [modalResultado, setModalResultado]       = useState(null) // confrontoId
  const [modalSlot, setModalSlot]                 = useState(null) // confrontoId
  const [confirmDelete, setConfirmDelete]         = useState(null) // confrontoId

  useEffect(() => onValue(ref(db, '/rodadas'),         snap => setRodadas(snap.val()    ?? {})), [])
  useEffect(() => onValue(ref(db, '/confrontos'),      snap => setConfrontos(snap.val() ?? {})), [])
  useEffect(() => onValue(ref(db, '/disponibilidade'), snap => setDisp(snap.val()       ?? {})), [])
  useEffect(() => onValue(ref(db, '/teams'),           snap => setTimes(snap.val()      ?? {})), [])

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 3500)
  }

  // ── Confrontos da rodada selecionada ──────────────────────────────────────────

  const confrontosRodada = Object.entries(confrontos)
    .filter(([, c]) => c.rodadaId === rodadaSel)
    .sort(([, a], [, b]) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))

  const alertas = confrontosComAlertas(confrontosRodada.map(([, c]) => c))

  // ── Criar rodada ──────────────────────────────────────────────────────────────

  async function criarRodada({ numero, semanaAnuncio, semanaJogos }) {
    try {
      const id = push(ref(db, '/rodadas')).key
      await set(ref(db, `/rodadas/${id}`), {
        numero, semanaAnuncio, semanaJogos,
        status: 'configurando',
        criadaEm: Date.now(),
      })
      setRodadaSel(id)
      setModalNovaRodada(false)
      flash('ok', `Rodada ${numero} criada.`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Criar confronto ──────────────────────────────────────────────────────────

  async function criarConfrontoNaRodada({ timeA, timeB, tipo, formato }) {
    if (!rodadaSel) return
    if (timeA === timeB) return flash('erro', 'Os times precisam ser diferentes.')
    try {
      const id = push(ref(db, '/confrontos')).key
      await set(ref(db, `/confrontos/${id}`), {
        rodadaId: rodadaSel,
        timeA, timeB, tipo, formato,
        slot: null,
        status: STATUS_CONFRONTO.PENDENTE,
        resultado: null,
        alertas: {},
        observacoes: null,
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      })
      setModalNovoConfr(false)
      flash('ok', 'Confronto criado.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Registrar resultado ──────────────────────────────────────────────────────

  async function registrarResultado(confrontoId, resultado) {
    try {
      const c = confrontos[confrontoId]
      let novoStatus = STATUS_CONFRONTO.REALIZADO

      // Se foi empate numa série MD2 → muda para empate_pendente
      if (resultado.tipo === TIPO_RESULTADO.EMPATE && c?.formato === FORMATO_SERIE.MD2) {
        novoStatus = STATUS_CONFRONTO.EMPATE_PENDENTE
      }

      await update(ref(db, `/confrontos/${confrontoId}`), {
        resultado,
        status: novoStatus,
        alertas: {},
        atualizadoEm: Date.now(),
      })
      setModalResultado(null)
      flash('ok', 'Resultado registrado.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Forçar slot manualmente ──────────────────────────────────────────────────

  async function forcarSlot(confrontoId, slot) {
    try {
      await update(ref(db, `/confrontos/${confrontoId}`), {
        slot,
        status: STATUS_CONFRONTO.CONFIRMADO,
        alertas: {},
        atualizadoEm: Date.now(),
      })
      setModalSlot(null)
      flash('ok', 'Slot definido pelo admin.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Mudar status do confronto ────────────────────────────────────────────────

  async function mudarStatus(confrontoId, status, extras = {}) {
    try {
      await update(ref(db, `/confrontos/${confrontoId}`), {
        status, ...extras, atualizadoEm: Date.now(),
      })
      flash('ok', `Status atualizado: ${STATUS_LABEL[status]}`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Deletar rodada (e todos os confrontos dela) ──────────────────────────────

  async function deletarRodada(rodadaId) {
    try {
      // Remove todos os confrontos da rodada + suas disponibilidades
      const confsDaRodada = Object.entries(confrontos).filter(([, c]) => c.rodadaId === rodadaId)
      for (const [id] of confsDaRodada) {
        await remove(ref(db, `/confrontos/${id}`))
        await remove(ref(db, `/disponibilidade/${id}`))
      }
      await remove(ref(db, `/rodadas/${rodadaId}`))
      setRodadaSel('')
      flash('ok', `Rodada removida (${confsDaRodada.length} confronto(s) apagados).`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Deletar confronto ────────────────────────────────────────────────────────

  async function deletarConfronto(confrontoId) {
    try {
      await remove(ref(db, `/confrontos/${confrontoId}`))
      await remove(ref(db, `/disponibilidade/${confrontoId}`))
      setConfirmDelete(null)
      flash('ok', 'Confronto apagado.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Agendar desempate MD3 ────────────────────────────────────────────────────

  async function agendarDesempate(confrontoOriginalId) {
    const orig = confrontos[confrontoOriginalId]
    if (!orig) return
    try {
      const id = push(ref(db, '/confrontos')).key
      await set(ref(db, `/confrontos/${id}`), {
        rodadaId: orig.rodadaId,
        timeA: orig.timeA,
        timeB: orig.timeB,
        tipo: TIPO_CONFRONTO.DESEMPATE,
        formato: FORMATO_SERIE.MD3,
        slot: null,
        status: STATUS_CONFRONTO.PENDENTE,
        resultado: null,
        alertas: {},
        confrontoOrigem: confrontoOriginalId,
        observacoes: 'Desempate MD3',
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      })
      // Marca o confronto original como realizado (série empatada)
      await update(ref(db, `/confrontos/${confrontoOriginalId}`), {
        status: STATUS_CONFRONTO.REALIZADO,
        atualizadoEm: Date.now(),
      })
      flash('ok', 'Confronto de desempate MD3 criado.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const rodadasArr = Object.entries(rodadas).sort(([, a], [, b]) => a.numero - b.numero)
  const rodadaAtual = rodadas[rodadaSel]

  return (
    <section className="admin-section" style={{ maxWidth: 960, borderColor: 'rgba(201,168,76,0.25)' }}>
      <div className="admin-section-title" style={{ color: 'var(--gold)' }}>Rodadas & Confrontos</div>

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

        {/* Alertas globais */}
        {alertas.length > 0 && (
          <div style={{
            background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)',
            borderRadius: 8, padding: '10px 14px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              ⚠ {alertas.length} confronto{alertas.length > 1 ? 's' : ''} com pendência
            </div>
            {alertas.map(c => (
              <div key={c.rodadaId + c.timeA} style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                • {times[c.timeA]?.nome ?? c.timeA} vs {times[c.timeB]?.nome ?? c.timeB}
                {' — '}{STATUS_LABEL[c.status]}
                {c.alertas?.semOverlap && ' (sem overlap de disponibilidade)'}
              </div>
            ))}
          </div>
        )}

        {/* Seletor de rodada + botões */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={rodadaSel}
            onChange={e => { setRodadaSel(e.target.value); setConfirmDeleteRodada(false) }}
            style={{ ...inputStyle, width: 'auto', minWidth: 200 }}
          >
            <option value="">— selecionar rodada —</option>
            {rodadasArr.map(([id, r]) => (
              <option key={id} value={id}>Rodada {r.numero} — {r.status}</option>
            ))}
          </select>
          <button
            className="btn"
            style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--gold)', color: 'var(--gold)', whiteSpace: 'nowrap' }}
            onClick={() => setModalNovaRodada(true)}
          >
            + Nova rodada
          </button>
          {rodadaSel && !confirmDeleteRodada && (
            <button
              className="btn"
              style={{ fontSize: 13, padding: '7px 12px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)', marginLeft: 'auto' }}
              onClick={() => setConfirmDeleteRodada(true)}
            >
              🗑 Apagar rodada
            </button>
          )}
          {rodadaSel && confirmDeleteRodada && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 'auto' }}>
                Apaga a rodada e todos os confrontos?
              </span>
              <button className="btn" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
                onClick={() => { deletarRodada(rodadaSel); setConfirmDeleteRodada(false) }}>
                Confirmar
              </button>
              <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setConfirmDeleteRodada(false)}>
                Cancelar
              </button>
            </>
          )}
        </div>

        {/* Rodada selecionada */}
        {rodadaAtual && (
          <>
            <RodadaHeader rodada={rodadaAtual} rodadaId={rodadaSel} onChange={mudarStatus} />

            {/* Confrontos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {confrontosRodada.map(([id, c]) => (
                <ConfrontoCard
                  key={id}
                  confrontoId={id}
                  confronto={c}
                  times={times}
                  disponibilidade={disponibilidade[id] ?? {}}
                  onRegistrarResultado={() => setModalResultado(id)}
                  onForcarSlot={() => setModalSlot(id)}
                  onMudarStatus={(status, extras) => mudarStatus(id, status, extras)}
                  onAgendarDesempate={() => agendarDesempate(id)}
                  onDeletar={() => setConfirmDelete(id)}
                  confirmandoDelete={confirmDelete === id}
                  onConfirmarDelete={() => deletarConfronto(id)}
                  onCancelarDelete={() => setConfirmDelete(null)}
                />
              ))}
            </div>

            <button
              className="btn"
              style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--blue)', color: 'var(--blue)', alignSelf: 'flex-start' }}
              onClick={() => setModalNovoConfr(true)}
            >
              + Novo confronto
            </button>
          </>
        )}

        {rodadasArr.length === 0 && (
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhuma rodada criada ainda.</p>
        )}

      </div>

      {/* Modais */}
      {modalNovaRodada && (
        <ModalNovaRodada onSalvar={criarRodada} onFechar={() => setModalNovaRodada(false)} />
      )}
      {modalNovoConfr && (
        <ModalNovoConfronto times={times} onSalvar={criarConfrontoNaRodada} onFechar={() => setModalNovoConfr(false)} />
      )}
      {modalResultado && confrontos[modalResultado] && (
        <ModalResultado
          confronto={confrontos[modalResultado]}
          confrontoId={modalResultado}
          times={times}
          onSalvar={registrarResultado}
          onFechar={() => setModalResultado(null)}
        />
      )}
      {modalSlot && confrontos[modalSlot] && (
        <ModalForcarSlot
          confronto={confrontos[modalSlot]}
          confrontoId={modalSlot}
          disponibilidade={disponibilidade[modalSlot] ?? {}}
          times={times}
          onSalvar={forcarSlot}
          onFechar={() => setModalSlot(null)}
        />
      )}
    </section>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function RodadaHeader({ rodada, rodadaId, onChange }) {
  const STATUS_RODADA = ['configurando', 'agendamento', 'jogando', 'encerrada']
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
        Rodada {rodada.numero}
      </span>
      {rodada.semanaJogos && (
        <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Semana de jogos: {rodada.semanaJogos}
        </span>
      )}
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        {STATUS_RODADA.map(s => (
          <button key={s}
            onClick={() => onChange && onChange(rodadaId, s)}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: 'uppercase',
              border: `1px solid ${rodada.status === s ? 'var(--gold)' : 'var(--border)'}`,
              background: rodada.status === s ? 'rgba(201,168,76,0.12)' : 'transparent',
              color: rodada.status === s ? 'var(--gold)' : 'var(--text3)',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConfrontoCard({ confrontoId, confronto: c, times, disponibilidade, onRegistrarResultado, onForcarSlot, onMudarStatus, onAgendarDesempate, onDeletar, confirmandoDelete, onConfirmarDelete, onCancelarDelete }) {
  const tA = times[c.timeA]
  const tB = times[c.timeB]
  const dispA = disponibilidade[c.timeA]?.slots ?? []
  const dispB = disponibilidade[c.timeB]?.slots ?? []
  const emComum = encontrarSlotsEmComum(dispA, dispB)
  const temAlerta = c.alertas?.semOverlap || c.alertas?.prazoAusente?.timeA || c.alertas?.prazoAusente?.timeB

  return (
    <div style={{
      background: 'var(--bg3)', border: `1px solid ${temAlerta ? 'rgba(224,85,85,0.35)' : 'var(--border)'}`,
      borderRadius: 8, padding: '12px 14px',
    }}>
      {/* Header do confronto */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, color: tA?.cor ?? 'var(--text)' }}>
          {tA?.nome ?? c.timeA}
        </span>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>vs</span>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, color: tB?.cor ?? 'var(--text)' }}>
          {tB?.nome ?? c.timeB}
        </span>

        <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px' }}>
          {c.tipo} · {c.formato}
        </span>

        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: STATUS_COR[c.status] }}>
          {STATUS_LABEL[c.status]}
        </span>
      </div>

      {/* Slot e resultado */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 8 }}>
        <span>
          Slot: <strong style={{ color: c.slot ? 'var(--green)' : 'var(--text3)' }}>
            {c.slot ? SLOT_LABEL[c.slot] ?? c.slot : '—'}
          </strong>
        </span>
        <span>
          Resultado: <strong style={{ color: c.resultado ? 'var(--text)' : 'var(--text3)' }}>
            {formatarResultado(c.resultado)}
          </strong>
        </span>
        {emComum.length > 0 && (
          <span style={{ color: 'var(--blue)' }}>
            {emComum.length} slot{emComum.length > 1 ? 's' : ''} em comum
          </span>
        )}
      </div>

      {/* Disponibilidade dos times */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { id: c.timeA, label: tA?.nome ?? c.timeA, cor: tA?.cor, slots: dispA },
          { id: c.timeB, label: tB?.nome ?? c.timeB, cor: tB?.cor, slots: dispB },
        ].map(({ id, label, cor, slots }) => (
          <div key={id} style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif" }}>
            <span style={{ color: cor ?? 'var(--text2)', fontWeight: 700 }}>{label}: </span>
            {slots.length === 0
              ? <span style={{ color: 'var(--text3)' }}>não marcou</span>
              : slots.length === SLOTS.length
              ? <span style={{ color: 'var(--green)' }}>disponível sempre</span>
              : <span style={{ color: 'var(--text2)' }}>{slots.map(s => SLOT_LABEL[s]).join(', ')}</span>
            }
          </div>
        ))}
      </div>

      {/* Alertas */}
      {temAlerta && (
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {c.alertas?.semOverlap && '⚠ Sem overlap de disponibilidade — intervenção necessária. '}
          {c.alertas?.prazoAusente?.timeA && `⚠ ${tA?.nome ?? c.timeA} não marcou disponibilidade. `}
          {c.alertas?.prazoAusente?.timeB && `⚠ ${tB?.nome ?? c.timeB} não marcou disponibilidade. `}
        </div>
      )}

      {/* Observações */}
      {c.observacoes && (
        <div style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', marginBottom: 8 }}>
          {c.observacoes}
        </div>
      )}

      {/* Ações admin */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {c.status !== STATUS_CONFRONTO.REALIZADO && c.status !== STATUS_CONFRONTO.CANCELADO && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--green)', color: 'var(--green)' }}
            onClick={onRegistrarResultado}>
            ✓ Registrar resultado
          </button>
        )}
        {c.status !== STATUS_CONFRONTO.REALIZADO && c.status !== STATUS_CONFRONTO.CANCELADO && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={onForcarSlot}>
            📅 Definir slot
          </button>
        )}
        {c.status === STATUS_CONFRONTO.EMPATE_PENDENTE && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--gold)', color: 'var(--gold)' }}
            onClick={onAgendarDesempate}>
            ⚔ Agendar desempate MD3
          </button>
        )}
        {c.status !== STATUS_CONFRONTO.CANCELADO && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)' }}
            onClick={() => onMudarStatus(STATUS_CONFRONTO.CANCELADO)}>
            Cancelar
          </button>
        )}
        {confirmandoDelete ? (
          <>
            <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>Apagar confronto?</span>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
              onClick={onConfirmarDelete}>
              Confirmar
            </button>
            <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }}
              onClick={onCancelarDelete}>
              Cancelar
            </button>
          </>
        ) : (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)', marginLeft: 'auto' }}
            onClick={onDeletar}>
            🗑
          </button>
        )}
        {c.status === STATUS_CONFRONTO.AGENDANDO && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--red)', color: 'var(--red)' }}
            onClick={() => onMudarStatus(STATUS_CONFRONTO.WO_PENDENTE)}>
            🚨 Marcar W.O. pendente
          </button>
        )}
      </div>
    </div>
  )
}

// ── Modais ─────────────────────────────────────────────────────────────────────

function ModalNovaRodada({ onSalvar, onFechar }) {
  const [form, setForm] = useState({ numero: '', semanaAnuncio: '', semanaJogos: '' })

  return (
    <Modal titulo="Nova Rodada" onFechar={onFechar}>
      <FieldLabel label="Número da rodada" />
      <input type="number" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
        placeholder="1" style={{ ...inputStyle, marginBottom: 12 }} />
      <FieldLabel label="Semana de anúncio" hint="ex: 2025-05-05" />
      <input type="date" value={form.semanaAnuncio} onChange={e => setForm(f => ({ ...f, semanaAnuncio: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 12 }} />
      <FieldLabel label="Semana de jogos" hint="ex: 2025-05-12" />
      <input type="date" value={form.semanaJogos} onChange={e => setForm(f => ({ ...f, semanaJogos: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar({ numero: parseInt(form.numero) || 1, semanaAnuncio: form.semanaAnuncio, semanaJogos: form.semanaJogos })}>
          Criar
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalNovoConfronto({ times, onSalvar, onFechar }) {
  const timesArr = Object.entries(times)
  const [form, setForm] = useState({ timeA: '', timeB: '', tipo: TIPO_CONFRONTO.REGULAR, formato: FORMATO_SERIE.MD2 })

  return (
    <Modal titulo="Novo Confronto" onFechar={onFechar}>
      <FieldLabel label="Time A" />
      <select value={form.timeA} onChange={e => setForm(f => ({ ...f, timeA: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 10 }}>
        <option value="">— selecionar —</option>
        {timesArr.map(([id, t]) => <option key={id} value={id}>{t.nome}</option>)}
      </select>
      <FieldLabel label="Time B" />
      <select value={form.timeB} onChange={e => setForm(f => ({ ...f, timeB: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 10 }}>
        <option value="">— selecionar —</option>
        {timesArr.map(([id, t]) => <option key={id} value={id}>{t.nome}</option>)}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <FieldLabel label="Tipo" />
          <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
            style={inputStyle}>
            {Object.values(TIPO_CONFRONTO).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="Formato" />
          <select value={form.formato} onChange={e => setForm(f => ({ ...f, formato: e.target.value }))}
            style={inputStyle}>
            {Object.values(FORMATO_SERIE).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar(form)} disabled={!form.timeA || !form.timeB}>
          Criar confronto
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalResultado({ confronto, confrontoId, times, onSalvar, onFechar }) {
  const tA = times[confronto.timeA]
  const tB = times[confronto.timeB]
  const [tipo, setTipo] = useState(TIPO_RESULTADO.NORMAL)
  const [gA, setGA] = useState(0)
  const [gB, setGB] = useState(0)
  const [obs, setObs] = useState(confronto.observacoes ?? '')

  const ehMD2 = confronto.formato === FORMATO_SERIE.MD2

  const opcoes = [
    { valor: TIPO_RESULTADO.NORMAL,   label: 'Placar normal' },
    { valor: TIPO_RESULTADO.WO_A,     label: `W.O. — ${tA?.nome ?? 'Time A'} vence` },
    { valor: TIPO_RESULTADO.WO_B,     label: `W.O. — ${tB?.nome ?? 'Time B'} vence` },
    { valor: TIPO_RESULTADO.DUPLO_WO, label: '0×0 — ambos ausentes' },
    ...(ehMD2 ? [{ valor: TIPO_RESULTADO.EMPATE, label: '1-1 — empate (agenda desempate MD3)' }] : []),
  ]

  const resultado =
    tipo === TIPO_RESULTADO.NORMAL  ? { tipo, timeA: gA, timeB: gB } :
    tipo === TIPO_RESULTADO.EMPATE  ? { tipo, timeA: 1, timeB: 1 }   : // 1-1, cada time leva 1pt
    tipo === TIPO_RESULTADO.WO_A    ? { tipo, timeA: 1, timeB: 0 }   :
    tipo === TIPO_RESULTADO.WO_B    ? { tipo, timeA: 0, timeB: 1 }   :
    /* DUPLO_WO */                    { tipo, timeA: 0, timeB: 0 }

  const pontos = calcularPontos(resultado, PONTUACAO_PADRAO, confronto.tipo)

  return (
    <Modal titulo={`Resultado — ${tA?.nome ?? confronto.timeA} vs ${tB?.nome ?? confronto.timeB}`} onFechar={onFechar}>
      <FieldLabel label="Tipo de resultado" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {opcoes.map(o => (
          <label key={o.valor} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: tipo === o.valor ? 'var(--text)' : 'var(--text2)' }}>
            <input type="radio" value={o.valor} checked={tipo === o.valor} onChange={() => setTipo(o.valor)} />
            {o.label}
          </label>
        ))}
      </div>

      {tipo === TIPO_RESULTADO.NORMAL && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <div>
            <FieldLabel label={tA?.nome ?? 'Time A'} />
            <input type="number" min={0} max={10} value={gA} onChange={e => setGA(Number(e.target.value))}
              style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
          <span style={{ color: 'var(--text3)', fontSize: 18, marginTop: 20 }}>×</span>
          <div>
            <FieldLabel label={tB?.nome ?? 'Time B'} />
            <input type="number" min={0} max={10} value={gB} onChange={e => setGB(Number(e.target.value))}
              style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {/* Preview de pontos */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", display: 'flex', gap: 24 }}>
        <span style={{ color: tA?.cor ?? 'var(--text)' }}>{tA?.nome ?? 'Time A'}: <strong>+{pontos.timeA} pts</strong></span>
        <span style={{ color: tB?.cor ?? 'var(--text)' }}>{tB?.nome ?? 'Time B'}: <strong>+{pontos.timeB} pts</strong></span>
      </div>

      <FieldLabel label="Observações" hint="opcional" />
      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Notas sobre a partida..."
        style={{ ...inputStyle, marginBottom: 16 }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar(confrontoId, { ...resultado, observacoes: obs || null })}>
          Confirmar resultado
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalForcarSlot({ confronto, confrontoId, disponibilidade, times, onSalvar, onFechar }) {
  const tA = times[confronto.timeA]
  const tB = times[confronto.timeB]
  const [slotSel, setSlotSel] = useState(confronto.slot ?? '')
  const dispA = disponibilidade[confronto.timeA]?.slots ?? []
  const dispB = disponibilidade[confronto.timeB]?.slots ?? []
  const emComum = encontrarSlotsEmComum(dispA, dispB)

  const dias = [...new Set(SLOTS.map(s => SLOT_DIA[s]))]

  return (
    <Modal titulo={`Definir slot — ${tA?.nome ?? confronto.timeA} vs ${tB?.nome ?? confronto.timeB}`} onFechar={onFechar}>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
        Selecione o slot manualmente. Slots com ✓ azul são os que ambos os times marcaram disponibilidade.
      </p>
      {dias.map(dia => (
        <div key={dia} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            {DIA_LABEL[dia]}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SLOTS.filter(s => SLOT_DIA[s] === dia).map(s => {
              const emCom = emComum.includes(s)
              const sel = slotSel === s
              return (
                <button key={s} onClick={() => setSlotSel(s)}
                  style={{
                    padding: '5px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
                    border: `1px solid ${sel ? 'var(--gold)' : emCom ? 'var(--blue)' : 'var(--border)'}`,
                    background: sel ? 'rgba(201,168,76,0.15)' : emCom ? 'rgba(56,168,255,0.08)' : 'var(--bg2)',
                    color: sel ? 'var(--gold)' : emCom ? 'var(--blue)' : 'var(--text2)',
                  }}>
                  {SLOT_LABEL[s].split(' ')[1]}
                  {emCom && ' ✓'}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar(confrontoId, slotSel)} disabled={!slotSel}>
          Confirmar slot
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

function Modal({ titulo, onFechar, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      z: 200, zIndex: 200,
    }} onClick={onFechar}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border2)',
        borderRadius: 12, padding: 24, minWidth: 380, maxWidth: 520, width: '90vw',
        maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 16, color: 'var(--text)' }}>
          {titulo}
        </div>
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ label, hint }) {
  return (
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 5,
    }}>
      {label}
      {hint && <span style={{ fontWeight: 400, marginLeft: 5, textTransform: 'none', fontSize: 11 }}>— {hint}</span>}
    </div>
  )
}
