import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, set, update, remove, push } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath, rodadasPath, confrontosPath, disponibilidadePath, heroDraftPath } from '../utils/campeonatoPaths'
import AdminReplayUpload from './AdminReplayUpload'
import { HEROES } from '../utils/heroPool'
import { MAPAS } from '../utils/mapPool'
import {
  SLOTS, SLOT_LABEL, SLOT_DIA, DIA_LABEL,
  STATUS_CONFRONTO, STATUS_LABEL, STATUS_COR,
  TIPO_CONFRONTO, FORMATO_SERIE, BRACKET_LABELS,
  TIPO_RESULTADO, PONTUACAO_PADRAO,
  encontrarSlotsEmComum, calcularPontos, formatarResultado, confrontosComAlertas,
  baseSlotKey, slotSemana,
  semanasRodada, calcularNumSemanas, dataDoDia,
  propagarBracket,
} from '../utils/scheduling'

// Labels legíveis pra tipos de confronto no card admin
const TIPO_LABEL = {
  [TIPO_CONFRONTO.REGULAR]:      'Regular',
  [TIPO_CONFRONTO.DESEMPATE]:    'Desempate',
  [TIPO_CONFRONTO.CLASSIFICATORIO]: 'Classificatório',
  ...Object.fromEntries(
    Object.entries(BRACKET_LABELS).map(([tipo, label]) => [tipo, label])
  ),
}

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AdminRodadasSection() {
  const { campeonatoId } = useCampeonato()
  const navigate = useNavigate()
  const [rodadas, setRodadas]           = useState({})
  const [confrontos, setConfrontos]     = useState({})
  const [disponibilidade, setDisp]      = useState({})
  const [times, setTimes]               = useState({})
  const [rodadaSel, setRodadaSel]       = useState('')
  const [feedback, setFeedback]         = useState(null)

  // Modais
  const [confirmDeleteRodada, setConfirmDeleteRodada] = useState(false)
  const [modalNovaRodada, setModalNovaRodada]         = useState(false)
  const [modalEstenderRodada, setModalEstenderRodada] = useState(false)
  const [modalNovoConfr, setModalNovoConfr]       = useState(false)
  const [modalResultado, setModalResultado]       = useState(null) // confrontoId
  const [modalSlot, setModalSlot]                 = useState(null) // confrontoId
  const [modalEditarTimes, setModalEditarTimes]   = useState(null) // confrontoId (só bracket)
  const [confirmDelete, setConfirmDelete]         = useState(null) // confrontoId
  const [confirmReset, setConfirmReset]           = useState(null) // confrontoId
  const [modalEditarDraft, setModalEditarDraft]   = useState(null) // { confrontoId, partidaNum }

  useEffect(() => onValue(ref(db, rodadasPath(campeonatoId)),         snap => setRodadas(snap.val()    ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, confrontosPath(campeonatoId)),      snap => setConfrontos(snap.val() ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, disponibilidadePath(campeonatoId)), snap => setDisp(snap.val()       ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, teamPath(campeonatoId)),            snap => setTimes(snap.val()      ?? {})), [campeonatoId])

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

  async function criarRodada({ numero, semanaAnuncio, semanaJogos, janelaFechaEm, duasSemanas }) {
    try {
      const id = push(ref(db, rodadasPath(campeonatoId))).key
      await set(ref(db, `${rodadasPath(campeonatoId)}/${id}`), {
        numero, semanaAnuncio, semanaJogos,
        janelaFechaEm: janelaFechaEm || null,
        duasSemanas: !!duasSemanas,
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

  // ── Atualizar campos da rodada (janela de fechamento, duas semanas, etc.) ────

  async function atualizarRodada(rodadaId, campos) {
    try {
      const rodada = rodadas[rodadaId]
      const novaSemana  = 'semanaJogos'   in campos ? campos.semanaJogos   : rodada?.semanaJogos
      const novoTermino = 'janelaFechaEm' in campos ? campos.janelaFechaEm : rodada?.janelaFechaEm
      if (novaSemana && novoTermino) {
        campos = { ...campos, numSemanas: calcularNumSemanas(novaSemana, novoTermino) }
      }
      await update(ref(db, `${rodadasPath(campeonatoId)}/${rodadaId}`), campos)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Estender rodada (prorroga o término sem criar uma nova rodada) ──────────

  async function estenderRodada(rodadaId, novoTermino) {
    try {
      const rodada = rodadas[rodadaId]
      const numSemanas = calcularNumSemanas(rodada?.semanaJogos, novoTermino)
      await update(ref(db, `${rodadasPath(campeonatoId)}/${rodadaId}`), {
        numSemanas,
        janelaFechaEm: novoTermino,
      })
      setModalEstenderRodada(false)
      flash('ok', `Rodada estendida até ${novoTermino} (${numSemanas} semana${numSemanas > 1 ? 's' : ''} de agendamento).`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Criar confronto ──────────────────────────────────────────────────────────

  async function criarConfrontoNaRodada({ timeA, timeB, tipo, formato, madness = 'soft' }) {
    if (!rodadaSel) return
    if (timeA === timeB) return flash('erro', 'Os times precisam ser diferentes.')
    try {
      const id = push(ref(db, confrontosPath(campeonatoId))).key
      await set(ref(db, `${confrontosPath(campeonatoId)}/${id}`), {
        rodadaId: rodadaSel,
        timeA, timeB, tipo, formato, madness,
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

  async function registrarResultado(confrontoId, payload) {
    try {
      const c = confrontos[confrontoId]
      const { resultado, observacoes = null, pontosTabela = null } = payload
      let novoStatus = STATUS_CONFRONTO.REALIZADO

      if (resultado.tipo === TIPO_RESULTADO.EMPATE && c?.formato === FORMATO_SERIE.MD2) {
        novoStatus = STATUS_CONFRONTO.EMPATE_PENDENTE
      }

      const updates = {
        [`${confrontosPath(campeonatoId)}/${confrontoId}/resultado`]:    resultado,
        [`${confrontosPath(campeonatoId)}/${confrontoId}/observacoes`]:  observacoes,
        [`${confrontosPath(campeonatoId)}/${confrontoId}/pontosTabela`]: pontosTabela,
        [`${confrontosPath(campeonatoId)}/${confrontoId}/status`]:       novoStatus,
        [`${confrontosPath(campeonatoId)}/${confrontoId}/alertas`]:      {},
        [`${confrontosPath(campeonatoId)}/${confrontoId}/atualizadoEm`]: Date.now(),
      }

      // ── Auto-propagação do bracket ──────────────────────────────────────
      // Se o confronto faz parte do bracket (tem bracketSlot), propaga o
      // vencedor e o perdedor para os próximos slots automaticamente.
      if (novoStatus === STATUS_CONFRONTO.REALIZADO) {
        Object.assign(updates, propagarBracket(c, resultado, confrontos, confrontosPath(campeonatoId)))
      }

      await update(ref(db), updates)
      setModalResultado(null)
      flash('ok', 'Resultado registrado.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Trocar o modo de madness de um confronto já criado ──────────────────────

  async function atualizarMadness(confrontoId, madness) {
    try {
      await update(ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}`), {
        madness, atualizadoEm: Date.now(),
      })
      flash('ok', `Madness: ${MADNESS_OPCOES.find(o => o.value === madness)?.label ?? madness}.`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Editar times do confronto manualmente (só bracket) ──────────────────────
  async function editarTimesBracket(confrontoId, { timeA, timeB }) {
    try {
      await update(ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}`), {
        timeA: timeA || null,
        timeB: timeB || null,
        atualizadoEm: Date.now(),
      })
      setModalEditarTimes(null)
      flash('ok', 'Times atualizados.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Forçar slot manualmente ──────────────────────────────────────────────────

  async function forcarSlot(confrontoId, slot) {
    try {
      await update(ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}`), {
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

  async function mudarStatusRodada(rodadaId, status) {
    try {
      await update(ref(db, `${rodadasPath(campeonatoId)}/${rodadaId}`), { status })
    } catch (e) {
      flash('erro', e.message)
    }
  }

  async function mudarStatus(confrontoId, status, extras = {}) {
    try {
      await update(ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}`), {
        status, ...extras, atualizadoEm: Date.now(),
      })
      flash('ok', `Status atualizado: ${STATUS_LABEL[status]}`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Resetar agendamento (libera o slot e volta ao estado anterior à escolha) ──

  async function resetarAgendamento(confrontoId) {
    try {
      await remove(ref(db, `${disponibilidadePath(campeonatoId)}/${confrontoId}`))
      await update(ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}`), {
        status: STATUS_CONFRONTO.PENDENTE,
        slot: null,
        alertas: {},
        atualizadoEm: Date.now(),
      })
      flash('ok', 'Agendamento resetado — horário liberado e disponibilidades apagadas.')
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
        await remove(ref(db, `${confrontosPath(campeonatoId)}/${id}`))
        await remove(ref(db, `${disponibilidadePath(campeonatoId)}/${id}`))
      }
      await remove(ref(db, `${rodadasPath(campeonatoId)}/${rodadaId}`))
      setRodadaSel('')
      flash('ok', `Rodada removida (${confsDaRodada.length} confronto(s) apagados).`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Deletar confronto ────────────────────────────────────────────────────────

  async function deletarConfronto(confrontoId) {
    try {
      await remove(ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}`))
      await remove(ref(db, `${disponibilidadePath(campeonatoId)}/${confrontoId}`))
      setConfirmDelete(null)
      flash('ok', 'Confronto apagado.')
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Resetar confronto ────────────────────────────────────────────────────────
  // Remove resultado, partidas e pontos, revertendo ao estado pré-resultado.
  // Mantém slot (volta a 'confirmado') ou, sem slot, volta a 'agendando'.

  async function resetarConfronto(confrontoId) {
    const c = confrontos[confrontoId]
    const novoStatus = c?.slot ? STATUS_CONFRONTO.CONFIRMADO : STATUS_CONFRONTO.AGENDANDO
    const base = `${confrontosPath(campeonatoId)}/${confrontoId}`
    try {
      await update(ref(db), {
        [`${base}/status`]:       novoStatus,
        [`${base}/resultado`]:    null,
        [`${base}/observacoes`]:  null,
        [`${base}/pontosTabela`]: null,
        [`${base}/alertas`]:      {},
        [`${base}/partidas`]:     null,
        [`${base}/atualizadoEm`]: Date.now(),
      })
      setConfirmReset(null)
      flash('ok', `Confronto revertido para ${novoStatus === STATUS_CONFRONTO.CONFIRMADO ? 'agendado (slot mantido)' : 'agendamento'}.`)
    } catch (e) {
      flash('erro', e.message)
    }
  }

  // ── Agendar desempate MD3 ────────────────────────────────────────────────────

  async function agendarDesempate(confrontoOriginalId) {
    const orig = confrontos[confrontoOriginalId]
    if (!orig) return
    try {
      const id = push(ref(db, confrontosPath(campeonatoId))).key
      await set(ref(db, `${confrontosPath(campeonatoId)}/${id}`), {
        rodadaId: orig.rodadaId,
        timeA: orig.timeA,
        timeB: orig.timeB,
        tipo: TIPO_CONFRONTO.DESEMPATE,
        formato: FORMATO_SERIE.MD3,
        madness: orig.madness ?? 'soft',
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
      await update(ref(db, `${confrontosPath(campeonatoId)}/${confrontoOriginalId}`), {
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
            <RodadaHeader rodada={rodadaAtual} rodadaId={rodadaSel} onChange={mudarStatusRodada} onAtualizar={atualizarRodada} onEstender={() => setModalEstenderRodada(true)} />

            {/* Confrontos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {confrontosRodada.map(([id, c]) => (
                <ConfrontoCard
                  key={id}
                  confrontoId={id}
                  confronto={c}
                  campeonatoId={campeonatoId}
                  times={times}
                  disponibilidade={disponibilidade[id] ?? {}}
                  onRegistrarResultado={() => setModalResultado(id)}
                  onForcarSlot={() => setModalSlot(id)}
                  onEditarTimes={c.bracketSlot ? () => setModalEditarTimes(id) : undefined}
                  onMudarStatus={(status, extras) => mudarStatus(id, status, extras)}
                  onResetarAgendamento={() => resetarAgendamento(id)}
                  onAgendarDesempate={() => agendarDesempate(id)}
                  onDeletar={() => setConfirmDelete(id)}
                  confirmandoDelete={confirmDelete === id}
                  onConfirmarDelete={() => deletarConfronto(id)}
                  onCancelarDelete={() => setConfirmDelete(null)}
                  onResetarConfronto={() => setConfirmReset(id)}
                  confirmandoReset={confirmReset === id}
                  onConfirmarReset={() => resetarConfronto(id)}
                  onCancelarReset={() => setConfirmReset(null)}
                  onEditarDraft={(pNum) => setModalEditarDraft({ confrontoId: id, partidaNum: pNum })}
                  onAtualizarMadness={atualizarMadness}
                  onIniciarDraft={() => navigate(`/showmatch?confronto=${id}&campeonato=${campeonatoId}`)}
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
      {modalEstenderRodada && rodadaAtual && (
        <ModalEstenderRodada rodada={rodadaAtual} rodadaId={rodadaSel} onSalvar={estenderRodada} onFechar={() => setModalEstenderRodada(false)} />
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
      {modalEditarTimes && confrontos[modalEditarTimes] && (
        <ModalEditarTimesBracket
          confronto={confrontos[modalEditarTimes]}
          confrontoId={modalEditarTimes}
          times={times}
          onSalvar={editarTimesBracket}
          onFechar={() => setModalEditarTimes(null)}
        />
      )}
      {modalEditarDraft && confrontos[modalEditarDraft.confrontoId] && (
        <ModalEditarDraft
          confronto={confrontos[modalEditarDraft.confrontoId]}
          confrontoId={modalEditarDraft.confrontoId}
          partidaNum={modalEditarDraft.partidaNum}
          times={times}
          campeonatoId={campeonatoId}
          onFechar={() => setModalEditarDraft(null)}
        />
      )}
    </section>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function RodadaHeader({ rodada, rodadaId, onChange, onAtualizar, onEstender }) {
  const STATUS_RODADA = ['configurando', 'agendamento', 'jogando', 'encerrada']
  const semanas = semanasRodada(rodada)
  const terminoAtual = dataDoDia('sabado', semanas[semanas.length - 1]?.ref)
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
          Rodada {rodada.numero}
        </span>
        {rodada.semanaJogos && semanas.length > 1 && (
          <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {semanas.length} semanas · até {terminoAtual}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!rodada.duasSemanas}
            onChange={e => onAtualizar && onAtualizar(rodadaId, { duasSemanas: e.target.checked })}
          />
          Janela de agendamento abrange 2 semanas
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Semana de jogos:
          <input
            type="date"
            value={rodada.semanaJogos ?? ''}
            onChange={e => onAtualizar && onAtualizar(rodadaId, { semanaJogos: e.target.value || null })}
            style={{ ...inputStyle, width: 'auto', padding: '3px 8px', fontSize: 12 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Janela fecha em:
          <input
            type="date"
            value={rodada.janelaFechaEm ?? ''}
            onChange={e => onAtualizar && onAtualizar(rodadaId, { janelaFechaEm: e.target.value || null })}
            style={{ ...inputStyle, width: 'auto', padding: '3px 8px', fontSize: 12 }}
          />
        </label>
        <button
          className="btn"
          style={{ fontSize: 12, padding: '4px 10px', borderColor: 'rgba(201,168,76,0.4)', color: 'var(--gold)', marginLeft: 'auto' }}
          onClick={onEstender}
        >
          ⏳ Estender rodada
        </button>
      </div>
    </div>
  )
}

function ConfrontoCard({ confrontoId, confronto: c, campeonatoId, times, disponibilidade, onRegistrarResultado, onForcarSlot, onEditarTimes, onMudarStatus, onResetarAgendamento, onAgendarDesempate, onDeletar, confirmandoDelete, onConfirmarDelete, onCancelarDelete, onIniciarDraft, onResetarConfronto, confirmandoReset, onConfirmarReset, onCancelarReset, onEditarDraft, onAtualizarMadness }) {
  const tA = times[c.timeA]
  const tB = times[c.timeB]
  const dispA = disponibilidade[c.timeA]?.slots ?? []
  const dispB = disponibilidade[c.timeB]?.slots ?? []
  const emComum = encontrarSlotsEmComum(dispA, dispB)
  const temAlerta = c.alertas?.semOverlap || c.alertas?.prazoAusente?.timeA || c.alertas?.prazoAusente?.timeB

  // Placar e estado das partidas
  const partidasObj  = c.partidas ?? {}
  const partidasArr  = Object.values(partidasObj)
  const winsA        = partidasArr.filter(p => p.vencedor === 'timeA').length
  const winsB        = partidasArr.filter(p => p.vencedor === 'timeB').length
  const concluidas   = partidasArr.filter(p => p.status === 'concluida').length
  const temPartidas  = partidasArr.length > 0
  const emDraftPart  = Object.values(partidasObj).find(p => p.status === 'em_draft')
  const emDraft      = !!emDraftPart
  const maxTotal     = c.formato === 'MD5' ? 5 : c.formato === 'MD2' ? 2 : 1
  const [openDraft, setOpenDraft] = useState({})
  const heroNome = useCallback(id => HEROES.find(h => h.id === id)?.nome ?? id, [])
  const mapaNome = useCallback(id => id ? (MAPAS.find(m => m.id === id)?.nome ?? id) : null, [])

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
        {temPartidas ? (
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text)', padding: '0 4px', background: 'var(--bg2)', borderRadius: 4, border: '1px solid var(--border)' }}>
            {winsA}–{winsB}
          </span>
        ) : (
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>vs</span>
        )}
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, color: tB?.cor ?? 'var(--text)' }}>
          {tB?.nome ?? c.timeB}
        </span>

        <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px' }}>
          {TIPO_LABEL[c.tipo] ?? c.tipo} · {c.formato}
        </span>
        {/* Madness — editável enquanto a série não terminou. Confrontos criados
            antes deste campo existir vêm sem madness; o select deixa corrigir. */}
        {onAtualizarMadness && c.status !== STATUS_CONFRONTO.REALIZADO ? (
          <select
            value={c.madness ?? 'desativado'}
            onChange={e => onAtualizarMadness(confrontoId, e.target.value)}
            title="Modo de bans acumulativos entre partidas"
            style={{
              fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
              color: c.madness && c.madness !== 'desativado' ? 'var(--gold)' : 'var(--text3)',
              background: c.madness && c.madness !== 'desativado' ? 'rgba(201,168,76,0.1)' : 'var(--bg2)',
              border: `1px solid ${c.madness && c.madness !== 'desativado' ? 'rgba(201,168,76,0.3)' : 'var(--border)'}`,
              borderRadius: 3, padding: '1px 4px', outline: 'none',
            }}>
            <option value="desativado">SEM MADNESS</option>
            <option value="soft">⚡ SOFT</option>
            <option value="convencional">⚡ MADNESS</option>
          </select>
        ) : c.madness && c.madness !== 'desativado' && (
          <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 3, padding: '1px 6px' }}>
            ⚡ {c.madness === 'convencional' ? 'MADNESS' : 'SOFT'}
          </span>
        )}

        {emDraft && (
          <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: 'var(--purple)', background: 'rgba(155,110,232,0.12)', border: '1px solid rgba(155,110,232,0.35)', borderRadius: 3, padding: '1px 6px' }}>
            DRAFT ATIVO
          </span>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: STATUS_COR[c.status] }}>
          {STATUS_LABEL[c.status]}
        </span>
      </div>

      {/* Slot e resultado */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 8 }}>
        <span>
          Slot: <strong style={{ color: c.slot ? 'var(--green)' : 'var(--text3)' }}>
            {c.slot ? `${SLOT_LABEL[baseSlotKey(c.slot)] ?? c.slot}${slotSemana(c.slot) > 1 ? ` (semana ${slotSemana(c.slot)})` : ''}` : '—'}
          </strong>
        </span>
        <span>
          Resultado: <strong style={{ color: c.resultado ? 'var(--text)' : 'var(--text3)' }}>
            {formatarResultado(c.resultado)}
          </strong>
        </span>
        {c.pontosTabela && (
          <span title={`Pontos da tabela ajustados manualmente: ${c.pontosTabela.timeA} × ${c.pontosTabela.timeB}`}
            style={{ color: 'var(--purple)', fontWeight: 700, letterSpacing: '0.06em', fontSize: 11 }}>
            ✎ PTS AJUSTADOS ({c.pontosTabela.timeA}×{c.pontosTabela.timeB})
          </span>
        )}
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

      {/* Status das partidas */}
      {(temPartidas || c.status === 'em_jogo') && (
        <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
            Partidas: {concluidas}/{maxTotal}
          </div>
          {Array.from({ length: maxTotal }, (_, i) => {
            const n        = String(i + 1)
            const partida  = partidasObj[n]
            const prevDone = i === 0 || partidasObj[String(i)]?.status === 'concluida'
            const isOpen   = !!openDraft[n]
            let label, cor
            if (!partida) {
              label = prevDone ? 'Aguardando início do draft' : `Aguardando término da Partida ${i}`
              cor   = 'var(--text3)'
            } else if (partida.status === 'em_draft') {
              label = '⚡ Fase de Draft'
              cor   = 'var(--purple)'
            } else if (partida.status === 'concluida') {
              const v = partida.vencedor === 'timeA' ? (tA?.nome ?? 'Time A') : (tB?.nome ?? 'Time B')
              const mapa = mapaNome(partida.mapaId)
              label = `✓ Finalizado — vitória ${v}${mapa ? ` · ${mapa}` : ''}`
              cor   = 'var(--green)'
            }
            const picksA = partida?.picks?.A ?? []
            const picksB = partida?.picks?.B ?? []
            const bansA  = partida?.bans?.A  ?? []
            const bansB  = partida?.bans?.B  ?? []
            const temDraft = partida?.status === 'concluida' && (picksA.length > 0 || picksB.length > 0)
            return (
              <div key={n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text3)', minWidth: 52 }}>Partida {n}:</span>
                  <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: cor, flex: 1 }}>{label}</span>
                  {temDraft && (
                    <>
                      <button
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px', fontSize: 10, color: 'var(--text2)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.05em' }}
                        onClick={() => setOpenDraft(prev => ({ ...prev, [n]: !prev[n] }))}
                      >
                        {isOpen ? '▲' : '▼ picks'}
                      </button>
                      <button
                        style={{ background: 'none', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 4, padding: '1px 7px', fontSize: 10, color: 'var(--gold)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.05em' }}
                        onClick={() => onEditarDraft && onEditarDraft(n)}
                        title="Editar picks e bans desta partida"
                      >
                        ✎ editar
                      </button>
                    </>
                  )}
                </div>
                {isOpen && temDraft && (
                  <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { nome: tA?.nome ?? 'Time A', cor: tA?.cor, picks: picksA, bans: bansA },
                      { nome: tB?.nome ?? 'Time B', cor: tB?.cor, picks: picksB, bans: bansB },
                    ].map(({ nome, cor: corTime, picks, bans }) => (
                      <div key={nome}>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, color: corTime ?? 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{nome}</div>
                        {picks.length > 0 && (
                          <div style={{ marginBottom: 3 }}>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Picks</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {picks.map(id => (
                                <span key={id} style={{ fontFamily: "'Barlow', sans-serif", fontSize: 10, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '1px 5px', color: 'var(--text)' }}>{heroNome(id)}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {bans.length > 0 && (
                          <div>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Bans</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {bans.map(id => (
                                <span key={id} style={{ fontFamily: "'Barlow', sans-serif", fontSize: 10, background: 'rgba(224,85,85,0.06)', border: '1px solid rgba(224,85,85,0.18)', borderRadius: 3, padding: '1px 5px', color: 'var(--text2)', textDecoration: 'line-through' }}>{heroNome(id)}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Ações admin */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {/* Override de times (só confrontos do bracket com times ainda indefinidos) */}
        {onEditarTimes && (!c.timeA || !c.timeB) && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(201,168,76,0.4)', color: 'var(--gold)' }}
            onClick={onEditarTimes}>
            ✎ Definir times
          </button>
        )}
        {onEditarTimes && c.timeA && c.timeB && c.status !== STATUS_CONFRONTO.REALIZADO && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(201,168,76,0.2)', color: 'var(--text3)' }}
            title="Substituir os times deste confronto manualmente"
            onClick={onEditarTimes}>
            ✎ Trocar times
          </button>
        )}
        {/* Botão de draft — aparece em confirmado (iniciar) ou em_jogo (gerenciar) */}
        {(c.status === STATUS_CONFRONTO.CONFIRMADO || c.status === 'em_jogo') && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--purple)', color: 'var(--purple)', fontWeight: 700 }}
            onClick={onIniciarDraft}>
            {emDraft ? '⚡ Gerenciar Draft Ativo' : `▶ Iniciar Draft${concluidas > 0 ? ` P${concluidas + 1}` : ''}`}
          </button>
        )}
        {c.status !== STATUS_CONFRONTO.REALIZADO && c.status !== STATUS_CONFRONTO.CANCELADO && c.status !== STATUS_CONFRONTO.EMPATE_PENDENTE && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--green)', color: 'var(--green)' }}
            onClick={onRegistrarResultado}>
            ✓ Registrar resultado
          </button>
        )}
        {(c.status === STATUS_CONFRONTO.REALIZADO || c.status === STATUS_CONFRONTO.EMPATE_PENDENTE) && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(74,158,218,0.4)', color: 'var(--blue)' }}
            onClick={onRegistrarResultado}>
            ✎ Editar resultado
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
        {(c.status === STATUS_CONFRONTO.CONFIRMADO || c.status === STATUS_CONFRONTO.AGENDANDO || c.status === STATUS_CONFRONTO.WO_PENDENTE) && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(74,158,218,0.4)', color: 'var(--blue)' }}
            title="Libera o horário e apaga as disponibilidades marcadas pelos times, voltando o confronto ao estado anterior ao agendamento"
            onClick={onResetarAgendamento}>
            ↺ Resetar agendamento
          </button>
        )}
        {[STATUS_CONFRONTO.REALIZADO, STATUS_CONFRONTO.EMPATE_PENDENTE, STATUS_CONFRONTO.WO_PENDENTE].includes(c.status) && !confirmandoReset && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'rgba(224,85,85,0.5)', color: 'var(--red)' }}
            title="Remove resultado e partidas, revertendo o confronto para o estado pré-resultado. Slot confirmado é mantido."
            onClick={onResetarConfronto}>
            ↺ Resetar confronto
          </button>
        )}
        {confirmandoReset && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>Remover resultado e reverter?</span>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
              onClick={onConfirmarReset}>
              Confirmar
            </button>
            <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }}
              onClick={onCancelarReset}>
              Cancelar
            </button>
          </>
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

      {/* Seção de replays */}
      <AdminReplayUpload
        confrontoId={confrontoId}
        confronto={c}
        campeonatoId={campeonatoId}
        times={times}
      />
    </div>
  )
}

// ── Modais ─────────────────────────────────────────────────────────────────────

// ── Modal editar draft (picks e bans) ────────────────────────────────────────

function ModalEditarDraft({ confronto: c, confrontoId, partidaNum, times, campeonatoId, onFechar }) {
  const partida = c.partidas?.[partidaNum]
  const tA = times[c.timeA]
  const tB = times[c.timeB]

  const [picks, setPicks] = useState({ A: [...(partida?.picks?.A ?? [])], B: [...(partida?.picks?.B ?? [])] })
  const [bans,  setBans]  = useState({ A: [...(partida?.bans?.A  ?? [])], B: [...(partida?.bans?.B  ?? [])] })
  const [slotEd, setSlotEd] = useState(null) // { time, tipo, index }
  const [busca,  setBusca]  = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState(null)

  const todosUsados = [...picks.A, ...picks.B, ...bans.A, ...bans.B]

  function setLista(time, tipo, index, novoId) {
    if (tipo === 'picks') setPicks(prev => { const l = [...prev[time]]; l[index] = novoId; return { ...prev, [time]: l } })
    else                  setBans (prev => { const l = [...prev[time]]; l[index] = novoId; return { ...prev, [time]: l } })
    setSlotEd(null)
    setBusca('')
  }

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    try {
      const base = `${confrontosPath(campeonatoId)}/${confrontoId}/partidas/${partidaNum}`
      await update(ref(db), { [`${base}/picks`]: picks, [`${base}/bans`]: bans })

      if (partida?.heroDraftId) {
        const hdBase = `${heroDraftPath(campeonatoId)}/${partida.heroDraftId}`
        await update(ref(db, `${hdBase}/timeA`), { picks: picks.A, bans: bans.A })
        await update(ref(db, `${hdBase}/timeB`), { picks: picks.B, bans: bans.B })
      }
      setMsg({ tipo: 'ok', txt: 'Salvo!' })
      setTimeout(onFechar, 900)
    } catch (e) {
      setMsg({ tipo: 'err', txt: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <Modal titulo={`Editar Draft — Partida ${partidaNum}`} onFechar={onFechar}>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 14px' }}>
        Clique em qualquer pick ou ban para substituir o herói.
        {partida?.heroDraftId && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>· Sessão heroDraft vinculada também será atualizada.</span>}
      </p>

      {/* Grid picks/bans por time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {[['A', tA, picks.A, bans.A], ['B', tB, picks.B, bans.B]].map(([t, time, pList, bList]) => (
          <div key={t}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: time?.cor ?? 'var(--text2)', marginBottom: 8 }}>
              {time?.nome ?? `Time ${t}`}
            </div>

            {bList.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Bans</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {bList.map((id, i) => {
                    const h   = HEROES.find(x => x.id === id)
                    const sel = slotEd?.time === t && slotEd?.tipo === 'bans' && slotEd?.index === i
                    return (
                      <button key={i} title={h?.nome ?? id} onClick={() => setSlotEd(sel ? null : { time: t, tipo: 'bans', index: i })}
                        style={{ padding: 0, border: `2px solid ${sel ? 'var(--gold)' : 'rgba(224,85,85,0.5)'}`, borderRadius: 5, background: 'none', cursor: 'pointer', width: 36, height: 36, overflow: 'hidden', flexShrink: 0 }}>
                        <img src={h?.iconeUrl} alt={h?.nome ?? id} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'grayscale(50%)' }} onError={e => { e.target.style.display = 'none' }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {pList.length > 0 && (
              <div>
                <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Picks</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {pList.map((id, i) => {
                    const h   = HEROES.find(x => x.id === id)
                    const sel = slotEd?.time === t && slotEd?.tipo === 'picks' && slotEd?.index === i
                    return (
                      <button key={i} title={h?.nome ?? id} onClick={() => setSlotEd(sel ? null : { time: t, tipo: 'picks', index: i })}
                        style={{ padding: 0, border: `2px solid ${sel ? 'var(--gold)' : (time?.cor ?? 'var(--border2)') + '88'}`, borderRadius: 5, background: 'none', cursor: 'pointer', width: 36, height: 36, overflow: 'hidden', flexShrink: 0 }}>
                        <img src={h?.iconeUrl} alt={h?.nome ?? id} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Painel de substituição */}
      {slotEd && (() => {
        const listaAtual = slotEd.tipo === 'picks' ? picks[slotEd.time] : bans[slotEd.time]
        const heroAtual  = HEROES.find(h => h.id === listaAtual[slotEd.index])
        const timeSel    = slotEd.time === 'A' ? tA : tB
        return (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--gold)', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Substituindo <strong style={{ color: 'var(--gold)' }}>{heroAtual?.nome ?? 'herói'}</strong> ({timeSel?.nome ?? `Time ${slotEd.time}`} · {slotEd.tipo === 'picks' ? 'Pick' : 'Ban'} #{slotEd.index + 1})</span>
              <button onClick={() => { setSlotEd(null); setBusca('') }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar herói..." autoFocus style={inputStyle} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {HEROES.filter(h => !busca || h.nome.toLowerCase().includes(busca.toLowerCase())).map(h => {
                const jaUsado = todosUsados.includes(h.id) && h.id !== listaAtual[slotEd.index]
                return (
                  <button key={h.id} title={h.nome} onClick={() => !jaUsado && setLista(slotEd.time, slotEd.tipo, slotEd.index, h.id)}
                    style={{ padding: 2, border: `1px solid ${jaUsado ? 'var(--border)' : 'var(--border2)'}`, borderRadius: 4, background: 'var(--bg2)', cursor: jaUsado ? 'not-allowed' : 'pointer', opacity: jaUsado ? 0.3 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 48 }}>
                    <img src={h.iconeUrl} alt={h.nome} style={{ width: 36, height: 36, borderRadius: 3, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                    <span style={{ fontSize: 8, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text3)', lineHeight: 1.1, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nome}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {msg && (
        <div style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, marginBottom: 10, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)', background: msg.tipo === 'ok' ? 'rgba(76,175,125,0.1)' : 'rgba(224,85,85,0.1)', border: `1px solid ${msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}` }}>
          {msg.txt}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={salvar} disabled={salvando} style={{ fontSize: 13, padding: '8px 20px' }}>
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
        <button className="btn" onClick={onFechar} style={{ fontSize: 13, padding: '8px 14px' }}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalEditarTimesBracket({ confronto: c, confrontoId, times, onSalvar, onFechar }) {
  const timesArr = Object.entries(times).sort(([,a],[,b]) => a.nome.localeCompare(b.nome))
  const [timeA, setTimeA] = useState(c.timeA ?? '')
  const [timeB, setTimeB] = useState(c.timeB ?? '')

  const selectStyle = {
    background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
    padding: '7px 10px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
    fontSize: 13, outline: 'none', width: '100%',
  }

  return (
    <Modal titulo={`Definir times — ${TIPO_LABEL[c.tipo] ?? c.tipo}`} onFechar={onFechar}>
      <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 14 }}>
        Override manual do bracket. Use com cautela — a propagação automática pode sobrescrever esses valores se um confronto anterior ainda não foi registrado.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>Time A</label>
          <select value={timeA} onChange={e => setTimeA(e.target.value)} style={selectStyle}>
            <option value="">— A definir —</option>
            {timesArr.map(([id, t]) => (
              <option key={id} value={id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>Time B</label>
          <select value={timeB} onChange={e => setTimeB(e.target.value)} style={selectStyle}>
            <option value="">— A definir —</option>
            {timesArr.map(([id, t]) => (
              <option key={id} value={id}>{t.nome}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          disabled={timeA === timeB && timeA !== ''}
          onClick={() => onSalvar(confrontoId, { timeA, timeB })}>
          Salvar
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalEstenderRodada({ rodada, rodadaId, onSalvar, onFechar }) {
  const semanas = semanasRodada(rodada)
  const inicioAtual   = dataDoDia('terca', rodada?.semanaJogos)
  const terminoAtual  = dataDoDia('sabado', semanas[semanas.length - 1]?.ref)
  const [novoTermino, setNovoTermino] = useState(rodada?.janelaFechaEm ?? '')

  const previewValido = novoTermino && calcularNumSemanas(rodada?.semanaJogos, novoTermino)

  return (
    <Modal titulo={`Estender Rodada ${rodada.numero}`} onFechar={onFechar}>
      <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 14 }}>
        Prorroga o prazo da rodada sem criar uma nova. A rodada continua começando em <strong>{inicioAtual}</strong>, mas o grid de agendamento dos capitães passa a exibir semanas até a nova data de término.
      </div>
      <FieldLabel label="Início da rodada" />
      <div style={{ ...inputStyle, marginBottom: 12, color: 'var(--text2)' }}>{inicioAtual ?? '—'}</div>
      <FieldLabel label="Término atual" />
      <div style={{ ...inputStyle, marginBottom: 12, color: 'var(--text2)' }}>{terminoAtual ?? '—'}</div>
      <FieldLabel label="Novo término" hint="data até quando o agendamento deve ficar aberto" />
      <input type="date" value={novoTermino} onChange={e => setNovoTermino(e.target.value)}
        style={{ ...inputStyle, marginBottom: 12 }} />
      {previewValido > 0 && (
        <div style={{ fontSize: 12, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 16 }}>
          A janela passará a abranger {previewValido} semana{previewValido > 1 ? 's' : ''}.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          disabled={!novoTermino}
          onClick={() => onSalvar(rodadaId, novoTermino)}>
          Estender
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalNovaRodada({ onSalvar, onFechar }) {
  const [form, setForm] = useState({ numero: '', semanaAnuncio: '', semanaJogos: '', janelaFechaEm: '', duasSemanas: false })

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
        style={{ ...inputStyle, marginBottom: 12 }} />
      <FieldLabel label="Janela fecha em" hint="opcional — após essa data, capitães não podem mais marcar disponibilidade" />
      <input type="date" value={form.janelaFechaEm} onChange={e => setForm(f => ({ ...f, janelaFechaEm: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 12 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', fontFamily: "'Barlow', sans-serif", marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.duasSemanas} onChange={e => setForm(f => ({ ...f, duasSemanas: e.target.checked }))} />
        Janela de agendamento abrange 2 semanas
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar({
            numero: parseInt(form.numero) || 1,
            semanaAnuncio: form.semanaAnuncio,
            semanaJogos: form.semanaJogos,
            janelaFechaEm: form.janelaFechaEm,
            duasSemanas: form.duasSemanas,
          })}>
          Criar
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

const MADNESS_OPCOES = [
  { value: 'desativado',   label: 'Desativado',           desc: 'Sem restrições entre partidas.' },
  { value: 'convencional', label: 'Madness Convencional',  desc: 'Os 10 heróis da partida anterior ficam banidos na próxima.' },
  { value: 'soft',         label: 'Soft Madness',          desc: 'Só os heróis do time vencedor são banidos (acumulativo).' },
]

function ModalNovoConfronto({ times, onSalvar, onFechar }) {
  const timesArr = Object.entries(times)
  const [form, setForm] = useState({ timeA: '', timeB: '', tipo: TIPO_CONFRONTO.REGULAR, formato: FORMATO_SERIE.MD2, madness: 'soft' })

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
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
      <FieldLabel label="Modo Madness" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {MADNESS_OPCOES.map(opt => (
          <label key={opt.value} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            padding: '8px 10px', borderRadius: 6,
            border: `1px solid ${form.madness === opt.value ? 'var(--gold)' : 'var(--border)'}`,
            background: form.madness === opt.value ? 'rgba(201,168,76,0.07)' : 'var(--bg)',
          }}>
            <input type="radio" name="madness-confronto" value={opt.value}
              checked={form.madness === opt.value}
              onChange={() => setForm(f => ({ ...f, madness: opt.value }))}
              style={{ marginTop: 2, accentColor: 'var(--gold)', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: form.madness === opt.value ? 'var(--gold2)' : 'var(--text)' }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{opt.desc}</div>
            </div>
          </label>
        ))}
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

  // Pré-carrega valores existentes pra permitir edição de resultados já registrados
  const resultadoExistente = confronto.resultado ?? {}
  const ehGrandeFinal = confronto.vantagem === 'A_1_0'
  const VANTAGEM_GF   = 1  // timeA (Upper) começa com 1 vitória já contada

  // Grande Final MD7 — admin entra com vitórias JOGADAS (sem a vantagem).
  // O sistema soma a vantagem ao salvar: totalA = jogadasA + VANTAGEM_GF
  // Isso evita confusão de admin entrar "3×3 jogados" e o sistema salvar
  // como empate quando o real é 4×3 (ScarletC vence pela vantagem).
  const gAInicial = resultadoExistente.tipo === TIPO_RESULTADO.NORMAL
    ? (ehGrandeFinal
        ? Math.max(0, (resultadoExistente.timeA ?? 0) - VANTAGEM_GF)
        : (resultadoExistente.timeA ?? 0))
    : 0
  const gBInicial = resultadoExistente.tipo === TIPO_RESULTADO.NORMAL
    ? (resultadoExistente.timeB ?? 0)
    : 0

  const [tipo, setTipo] = useState(resultadoExistente.tipo ?? TIPO_RESULTADO.NORMAL)
  const [gA, setGA]   = useState(gAInicial)  // vitórias jogadas (sem vantagem na GF)
  const [gB, setGB]   = useState(gBInicial)
  const [obs, setObs] = useState(confronto.observacoes ?? '')

  // Override de pontos pra tabela — pré-carrega se já existe no confronto
  const [overrideAtivo, setOverrideAtivo] = useState(!!confronto.pontosTabela)
  const [pontosOverrideA, setPontosOverrideA] = useState(confronto.pontosTabela?.timeA ?? 0)
  const [pontosOverrideB, setPontosOverrideB] = useState(confronto.pontosTabela?.timeB ?? 0)

  const ehMD2 = confronto.formato === FORMATO_SERIE.MD2

  const opcoes = [
    { valor: TIPO_RESULTADO.NORMAL,   label: 'Placar normal' },
    { valor: TIPO_RESULTADO.WO_A,     label: `W.O. — ${tA?.nome ?? 'Time A'} vence` },
    { valor: TIPO_RESULTADO.WO_B,     label: `W.O. — ${tB?.nome ?? 'Time B'} vence` },
    { valor: TIPO_RESULTADO.DUPLO_WO, label: '0×0 — ambos ausentes' },
    ...(ehMD2 ? [{ valor: TIPO_RESULTADO.EMPATE, label: '1-1 — empate (agenda desempate MD3)' }] : []),
  ]

  // Na GF, totalA = jogadasA + vantagem (1). Nos outros formatos sem vantagem.
  const totalA = ehGrandeFinal ? gA + VANTAGEM_GF : gA
  const totalB = gB

  const resultado =
    tipo === TIPO_RESULTADO.NORMAL  ? { tipo, timeA: totalA, timeB: totalB } :
    tipo === TIPO_RESULTADO.EMPATE  ? { tipo, timeA: 1, timeB: 1 }   : // 1-1, cada time leva 1pt
    tipo === TIPO_RESULTADO.WO_A    ? { tipo, timeA: 1, timeB: 0 }   :
    tipo === TIPO_RESULTADO.WO_B    ? { tipo, timeA: 0, timeB: 1 }   :
    /* DUPLO_WO */                    { tipo, timeA: 0, timeB: 0 }

  // Só REGULAR conta na tabela. Pra DESEMPATE e tipos de playoff o preview
  // mostra 0/0 pra não enganar o admin com pontos que não serão somados.
  const tipoConfronto = confronto.tipo ?? TIPO_CONFRONTO.REGULAR
  const tipoContaNaTabela = tipoConfronto === TIPO_CONFRONTO.REGULAR
  const pontosCalculados = calcularPontos(resultado, PONTUACAO_PADRAO, confronto.tipo)
  const pontosAuto = tipoContaNaTabela ? pontosCalculados : { timeA: 0, timeB: 0 }

  // Quando override desliga, sincroniza inputs com o cálculo automático
  // (útil pra admin ver o que o sistema sugeriria antes de ativar override de novo)
  useEffect(() => {
    if (!overrideAtivo) {
      setPontosOverrideA(pontosAuto.timeA)
      setPontosOverrideB(pontosAuto.timeB)
    }
  }, [pontosAuto.timeA, pontosAuto.timeB, overrideAtivo])

  const pontosFinais = overrideAtivo
    ? { timeA: Number(pontosOverrideA) || 0, timeB: Number(pontosOverrideB) || 0 }
    : pontosAuto

  return (
    <Modal titulo={`Resultado — ${tA?.nome ?? confronto.timeA} vs ${tB?.nome ?? confronto.timeB}`} onFechar={onFechar}>
      {ehGrandeFinal && (
        <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 12, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', fontSize: 12, color: 'var(--gold2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>🏆 <strong>Grande Final MD7</strong> — {tA?.nome ?? 'Time A'} (Upper) tem vantagem de <strong>+1 vitória</strong></div>
          <div style={{ color: 'var(--text2)', fontSize: 11 }}>
            Digite as vitórias <em>jogadas</em> (sem contar a vantagem). O sistema soma automaticamente.
            {tipo === TIPO_RESULTADO.NORMAL && (
              <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 700 }}>
                Total: {totalA}×{totalB} — {totalA > totalB ? `${tA?.nome ?? 'Time A'} vence` : totalB > totalA ? `${tB?.nome ?? 'Time B'} vence` : 'empate (precisa de mais uma partida)'}
              </span>
            )}
          </div>
        </div>
      )}
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
            <FieldLabel label={ehGrandeFinal ? `${tA?.nome ?? 'Time A'} (jogadas)` : (tA?.nome ?? 'Time A')} />
            <input type="number" min={0} max={10} value={gA} onChange={e => setGA(Number(e.target.value))}
              style={{ ...inputStyle, textAlign: 'center' }} />
            {ehGrandeFinal && (
              <div style={{ fontSize: 10, textAlign: 'center', color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 2 }}>
                total: {totalA}
              </div>
            )}
          </div>
          <span style={{ color: 'var(--text3)', fontSize: 18, marginTop: 20 }}>×</span>
          <div>
            <FieldLabel label={tB?.nome ?? 'Time B'} />
            <input type="number" min={0} max={10} value={gB} onChange={e => setGB(Number(e.target.value))}
              style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {/* Pontos pra tabela: preview + toggle de override */}
      <div style={{
        background: overrideAtivo ? 'rgba(155,110,232,0.06)' : 'var(--bg2)',
        border: `1px solid ${overrideAtivo ? 'rgba(155,110,232,0.35)' : 'var(--border)'}`,
        borderRadius: 6, padding: '10px 12px', marginBottom: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 18, fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif" }}>
            <span style={{ color: tA?.cor ?? 'var(--text)' }}>
              {tA?.nome ?? 'Time A'}: <strong>+{pontosFinais.timeA} pts</strong>
            </span>
            <span style={{ color: tB?.cor ?? 'var(--text)' }}>
              {tB?.nome ?? 'Time B'}: <strong>+{pontosFinais.timeB} pts</strong>
            </span>
            {overrideAtivo && (
              <span style={{ color: 'var(--purple)', fontWeight: 700, letterSpacing: '0.06em' }}>
                AJUSTE MANUAL
              </span>
            )}
            {!tipoContaNaTabela && !overrideAtivo && (
              <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>
                ({tipoConfronto === TIPO_CONFRONTO.DESEMPATE ? 'desempate' : 'playoff'} não soma na tabela)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOverrideAtivo(v => !v)}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 4,
              border: `1px solid ${overrideAtivo ? 'rgba(155,110,232,0.4)' : 'var(--border2)'}`,
              background: overrideAtivo ? 'rgba(155,110,232,0.15)' : 'transparent',
              color: overrideAtivo ? 'var(--purple)' : 'var(--text2)',
              cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            }}
          >
            {overrideAtivo ? '↺ Usar automático' : '✎ Ajustar manualmente'}
          </button>
        </div>
        {overrideAtivo && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <FieldLabel label={`Pts ${tA?.nome ?? 'Time A'}`} />
              <input type="number" min={-20} max={20} value={pontosOverrideA}
                onChange={e => setPontosOverrideA(e.target.value)}
                style={{ ...inputStyle, textAlign: 'center' }} />
            </div>
            <div>
              <FieldLabel label={`Pts ${tB?.nome ?? 'Time B'}`} />
              <input type="number" min={-20} max={20} value={pontosOverrideB}
                onChange={e => setPontosOverrideB(e.target.value)}
                style={{ ...inputStyle, textAlign: 'center' }} />
            </div>
          </div>
        )}
      </div>

      <FieldLabel label="Observações" hint="opcional" />
      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Notas sobre a partida..."
        style={{ ...inputStyle, marginBottom: 16 }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar(confrontoId, {
            resultado,
            observacoes: obs || null,
            pontosTabela: overrideAtivo ? { timeA: pontosFinais.timeA, timeB: pontosFinais.timeB } : null,
          })}>
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
