import { useState, useEffect, useCallback } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useConteudo, useModules } from '../hooks/useConfig'
import PaginaInativa from '../components/PaginaInativa'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath, rodadasPath, confrontosPath, disponibilidadePath } from '../utils/campeonatoPaths'
import HeroDraftAlerta from '../components/HeroDraftAlerta'
import {
  SLOTS, SLOTS_PLAYOFF, SLOT_LABEL, SLOT_DIA, DIA_LABEL, ADJACENT_SLOTS,
  STATUS_CONFRONTO, STATUS_LABEL, STATUS_COR,
  FUSO_PADRAO, FUSOS, slotLabelFuso, slotHoraLocal,
  resolverDisponibilidade, avisaBackToBack, encontrarSlotsEmComum,
} from '../utils/scheduling'
import './Agendamento.css'

// ── Vista pública: partidas confirmadas por rodada ─────────────────────────────
function AgendaPublica({ teams, confrontos, rodadas }) {
  const [filtroTime, setFiltroTime] = useState('')

  const teamsOrdenados = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const confirmedByRodada = {}

  Object.entries(confrontos).forEach(([id, c]) => {
    if (
      c.status !== STATUS_CONFRONTO.CONFIRMADO &&
      c.status !== STATUS_CONFRONTO.REALIZADO &&
      c.status !== STATUS_CONFRONTO.EMPATE_PENDENTE
    ) return
    if (filtroTime && c.timeA !== filtroTime && c.timeB !== filtroTime) return
    const rId = c.rodadaId ?? 'sem-rodada'
    if (!confirmedByRodada[rId]) confirmedByRodada[rId] = []
    confirmedByRodada[rId].push({ id, ...c })
  })

  const rodadaEntries = Object.entries(rodadas ?? {})
    .sort(([, a], [, b]) => (a.numero ?? 0) - (b.numero ?? 0))

  const semRodada = confirmedByRodada['sem-rodada']
  const totalConfirmados = Object.values(confirmedByRodada).reduce((s, a) => s + a.length, 0)

  return (
    <div className="ag-publica">
      {/* Filtro por time */}
      {teamsOrdenados.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span className="ag-label">Filtrar por time:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '4px 12px', ...(filtroTime === '' ? { color: 'var(--gold2)', borderColor: 'rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.08)' } : {}) }}
              onClick={() => setFiltroTime('')}
            >
              Todos
            </button>
            {teamsOrdenados.map(([id, t]) => (
              <button
                key={id}
                className="btn"
                style={{ fontSize: 12, padding: '4px 12px', ...(filtroTime === id ? { color: t.cor, borderColor: t.cor + '88', background: t.cor + '14' } : {}) }}
                onClick={() => setFiltroTime(filtroTime === id ? '' : id)}
              >
                {t.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {totalConfirmados === 0 && (
        <div className="ag-aviso" style={{ marginBottom: '1rem' }}>
          {filtroTime
            ? `Nenhuma partida confirmada para ${teams[filtroTime]?.nome ?? 'este time'}.`
            : 'Nenhuma partida confirmada ainda. Os confrontos aparecerão aqui assim que os times acordarem os horários.'
          }
        </div>
      )}
      {rodadaEntries.map(([rId, rodada]) => {
        const confrontosRodada = confirmedByRodada[rId]
        if (!confrontosRodada?.length) return null
        return (
          <div key={rId} className="ag-rodada-bloco">
            <div className="ag-rodada-label">Rodada {rodada.numero}</div>
            <div className="ag-partidas-list">
              {confrontosRodada
                .sort((a, b) => SLOTS_PLAYOFF.indexOf(a.slot) - SLOTS_PLAYOFF.indexOf(b.slot))
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
  const conteudo = useConteudo()
  const modules = useModules()
  const { idPublico } = useCampeonato()

  // Capitão via PIN (sessionStorage do leilão) — fallback quando não tem Firebase Auth
  const pinSession = (() => {
    try { return JSON.parse(sessionStorage.getItem('captainSession')) } catch { return null }
  })()
  const capitaoEfetivo = capitao ?? (pinSession?.captainId ? pinSession : null)

  const [teams,        setTeams]    = useState({})
  const [confrontos,   setConfrs]   = useState({})
  const [dispon,       setDispon]   = useState({})
  const [rodadas,      setRodadas]  = useState({})
  const [teamSelAdmin, setTeamSelAdmin] = useState('')
  const [fusoTeste,    setFusoTeste]    = useState('')   // só admin, sobrescreve fuso de exibição
  const [selecoes,     setSelecoes] = useState({})
  const [saving,       setSaving]   = useState(null)
  const [feedback,     setFeedback] = useState({})

  // Para PIN capitão: encontra o time na tabela por múltiplas chaves
  // (draftSession e /teams têm IDs diferentes — match por nome do time ou capitão)
  const teamIdFromPin = pinSession && !capitao
    ? Object.entries(teams).find(([, t]) => {
        if (t.nome === pinSession.nome) return true
        if (t.capitaoNome && t.capitaoNome === pinSession.capitaoNome) return true
        // Fallback: capitão pode estar nos jogadores com isCaptain=true
        if (pinSession.capitaoNome && (t.jogadores ?? []).some(j => j.isCaptain && j.nome === pinSession.capitaoNome)) return true
        return false
      })?.[0] ?? ''
    : ''

  const teamSel = isAdmin ? teamSelAdmin : (capitao?.teamId ?? teamIdFromPin ?? '')

  useEffect(() => onValue(ref(db, teamPath(idPublico)),            s => setTeams(s.val()  ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, confrontosPath(idPublico)),     s => setConfrs(s.val() ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, disponibilidadePath(idPublico)),s => setDispon(s.val() ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, rodadasPath(idPublico)),        s => setRodadas(s.val() ?? {})), [idPublico])

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

  // Slot é GLOBAL por rodada: só pode 1 confronto por dia+horário em toda
  // a rodada (a equipe da Inhouse organiza um lobby de cada vez).
  // Na fase de playoffs (rodada.numero === 'P'): também bloqueia slots
  // adjacentes (±1h no mesmo dia) pra garantir intervalo entre transmissões.
  function slotsOcupadosNaRodada(confrontoId) {
    const c = confrontos[confrontoId]
    if (!c) return {}
    const rodada    = rodadas[c.rodadaId]
    const ehPlayoff = String(rodada?.numero ?? '').startsWith('P')
    const ocupados  = {}
    Object.entries(confrontos)
      .filter(([id, oc]) =>
        id !== confrontoId &&
        oc.rodadaId === c.rodadaId &&
        oc.status === STATUS_CONFRONTO.CONFIRMADO &&
        oc.slot
      )
      .forEach(([, oc]) => {
        ocupados[oc.slot] = true
        if (ehPlayoff) {
          ADJACENT_SLOTS[oc.slot]?.forEach(adj => { ocupados[adj] = true })
        }
      })
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
      await set(ref(db, `${disponibilidadePath(idPublico)}/${confrontoId}/${teamSel}`), {
        slots: meusSlots,
        registradoEm: Date.now(),
      })

      if (meusSlots.length > 0 && advSlots.length > 0) {
        const ocupados   = slotsOcupadosNaRodada(confrontoId)
        const resultado  = resolverDisponibilidade(meusSlots, advSlots, ocupados)

        if (resultado.slot) {
          await update(ref(db, `${confrontosPath(idPublico)}/${confrontoId}`), {
            slot:          resultado.slot,
            status:        STATUS_CONFRONTO.CONFIRMADO,
            alertas:       {},
            atualizadoEm:  Date.now(),
          })
          flash(confrontoId, 'ok', `✓ Confirmado automaticamente! ${SLOT_LABEL[resultado.slot]}`)
        } else {
          await update(ref(db, `${confrontosPath(idPublico)}/${confrontoId}`), {
            status:   STATUS_CONFRONTO.AGENDANDO,
            alertas:  { semOverlap: true },
            atualizadoEm: Date.now(),
          })
          flash(confrontoId, 'aviso', 'Nenhum slot em comum com o adversário. O admin foi sinalizado.')
        }
      } else {
        if (confronto.status === STATUS_CONFRONTO.PENDENTE) {
          await update(ref(db, `${confrontosPath(idPublico)}/${confrontoId}`), {
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

  if (!modules.loading && !isAdmin && !capitaoEfetivo && !modules.campeonatoAtivo) {
    return <PaginaInativa icone="📅" titulo="Agenda em preparação" descricao="A agenda de partidas estará disponível quando o campeonato começar." />
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const teamsArr     = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const meuTime      = teams[teamSel]
  // Admin pode sobrescrever o fuso de exibição para testes; capitão usa o fuso do time
  const fusoExibicao = fusoTeste || meuTime?.fuso || FUSO_PADRAO

  return (
    <div className="ag-root page">
      <h1 className="page-title">Agenda de Partidas</h1>
      <p className="page-subtitle">Partidas confirmadas e disponibilidade por confronto</p>

      {/* ── Partidas confirmadas (visível a todos) ─────────────────────────── */}
      {conteudo.prazoDisponibilidade && (
        <div className="ag-aviso" style={{ marginBottom: '1.5rem', background: 'rgba(201,168,76,0.06)', borderColor: 'rgba(201,168,76,0.25)', color: 'var(--gold2)', textAlign: 'left' }}>
          📅 {conteudo.prazoDisponibilidade}
        </div>
      )}
      <div className="ag-section-title">Partidas Confirmadas</div>
      <AgendaPublica teams={teams} confrontos={confrontos} rodadas={rodadas} />

      {/* Alerta de hero draft disponível para o capitão */}
      {capitao && (
        <div style={{ marginBottom: '1.5rem' }}>
          <HeroDraftAlerta capitao={capitao} />
        </div>
      )}

      {/* ── Área interativa (capitão / admin) ─────────────────────────────── */}
      {(isAdmin || capitaoEfetivo) && (
        <>
          <div className="ag-section-title" style={{ marginTop: '2.5rem' }}>
            {isAdmin ? 'Gerenciar Disponibilidade' : 'Minha Disponibilidade'}
          </div>

          {capitaoEfetivo && !isAdmin && !meuTime && Object.keys(teams).length > 0 && (
            <div className="ag-aviso" style={{ background: 'rgba(224,85,85,0.08)', borderColor: 'rgba(224,85,85,0.3)', color: 'var(--red)', marginBottom: 16 }}>
              <strong>Seu time ainda não foi vinculado à sua conta.</strong><br />
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>
                Peça ao admin para gerar seu acesso na aba <em>Capitães → Acesso dos Capitães</em>, ou verifique se está logado com o email correto.
              </span>
            </div>
          )}

          {capitaoEfetivo && !isAdmin && (
            <div className="ag-team-sel">
              <label className="ag-label">Você está jogando como:</label>
              <span className="ag-team-badge" style={{ background: (meuTime?.cor ?? 'var(--blue)') + '22', borderColor: meuTime?.cor ?? 'var(--blue)', color: meuTime?.cor ?? 'var(--blue)' }}>
                {meuTime?.nome ?? capitaoEfetivo?.nome ?? capitaoEfetivo?.capitaoNome}
              </span>
              {meuTime?.fuso && (
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  🕐 {FUSOS.find(f => f.id === meuTime.fuso)?.label ?? meuTime.fuso}
                </span>
              )}
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

          {isAdmin && (
            <div className="ag-team-sel" style={{ background: 'rgba(155,110,232,0.06)', borderColor: 'rgba(155,110,232,0.25)' }}>
              <label className="ag-label" style={{ color: 'var(--purple)' }}>🧪 Testar fuso:</label>
              <select
                className="ag-select"
                value={fusoTeste}
                onChange={e => setFusoTeste(e.target.value)}
              >
                <option value="">— fuso do time (padrão) —</option>
                {FUSOS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              {fusoTeste && (
                <>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--purple)' }}>
                    ativo
                  </span>
                  <button
                    className="btn"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => setFusoTeste('')}
                  >
                    Limpar
                  </button>
                </>
              )}
            </div>
          )}

          {teamSel && confsMeuTime.length === 0 && (
            <div className="ag-aviso" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <strong style={{ color: 'var(--text)' }}>Nenhum confronto pendente para este time.</strong>
              <span style={{ fontSize: 13 }}>
                {isAdmin
                  ? 'Crie as rodadas e confrontos na aba Campeonato do painel Admin.'
                  : 'Quando o campeonato começar e suas partidas forem agendadas, elas aparecerão aqui para você marcar sua disponibilidade.'
                }
              </span>
            </div>
          )}

          {teamSel && confsMeuTime.map(([id, c]) => {
            const advId    = c.timeA === teamSel ? c.timeB : c.timeA
            const adv      = teams[advId]
                    const rodada    = rodadas[c.rodadaId]
            const ehPlayoff = String(rodada?.numero ?? '').startsWith('P')
            const slotsRodada = ehPlayoff ? SLOTS_PLAYOFF : SLOTS
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
                    Partida confirmada: <strong>{slotLabelFuso(c.slot, fusoExibicao)}</strong>
                    {adv?.fuso && adv.fuso !== (meuTime?.fuso ?? FUSO_PADRAO) && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text2)' }}>
                        · {slotLabelFuso(c.slot, adv.fuso)} (adversário)
                      </span>
                    )}
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

                    {/* Indicador do fuso ativo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                      <span>🕐 Horários em: <strong style={{ color: 'var(--text)' }}>
                        {fusoExibicao !== FUSO_PADRAO
                          ? (FUSOS.find(f => f.id === fusoExibicao)?.label ?? fusoExibicao)
                          : 'BRT (Horário de Brasília)'}
                      </strong></span>
                      {fusoExibicao !== FUSO_PADRAO && (
                        <span style={{ opacity: 0.6 }}>· horário BRT também exibido</span>
                      )}
                    </div>

                    <div className="ag-grid">
                      {Object.entries(DIA_LABEL).map(([dia, diaLabel]) => {
                        const slotsHoje = slotsRodada.filter(s => SLOT_DIA[s] === dia)
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
                                const horarioLocal = slotHoraLocal(slot, fusoExibicao)
                                const horarioBRT   = slot.split('-')[1].replace(/h$/, '')
                                const mostraBRT    = fusoExibicao !== FUSO_PADRAO

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
                                    title={ocupado ? 'Slot ocupado por outra partida confirmada' : backToBack ? '⚠ Back-to-back com outra partida' : slotLabelFuso(slot, fusoExibicao)}
                                  >
                                    <span className="ag-slot-hora">
                                      {mostraBRT ? `${horarioLocal}h` : `${horarioBRT}h`}
                                    </span>
                                    {mostraBRT && (
                                      <span style={{ fontSize: 9, opacity: 0.55, display: 'block', lineHeight: 1 }}>
                                        {horarioBRT}h BRT
                                      </span>
                                    )}
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
                        <button
                          className="btn"
                          style={{ fontSize: 12, color: 'var(--red)', borderColor: 'rgba(224,85,85,0.35)' }}
                          onClick={() => setSelecoes(s => ({ ...s, [id]: [] }))}
                          title="Remover todos os slots selecionados"
                        >
                          ✕ Limpar seleção
                        </button>
                      )}
                      <button
                        className="btn"
                        style={{ fontSize: 12 }}
                        onClick={() => setSelecoes(s => ({ ...s, [id]: slotsRodada }))}
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

      {!user && !capitaoEfetivo && (
        <div className="ag-aviso" style={{ marginTop: '0.5rem', fontSize: 13 }}>
          <a href={idPublico ? `/campeonatos/${idPublico}/login-capitao` : '/login-capitao'} style={{ color: 'var(--blue)' }}>Faça login como capitão</a> para marcar sua disponibilidade.
        </div>
      )}
    </div>
  )
}
