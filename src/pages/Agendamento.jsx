import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useConteudo, useModules } from '../hooks/useConfig'
import PaginaInativa from '../components/PaginaInativa'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath, rodadasPath, confrontosPath, disponibilidadePath } from '../utils/campeonatoPaths'
import HeroDraftAlerta from '../components/HeroDraftAlerta'
import { notificarDiscord, mencaoTime } from '../utils/notify'
import {
  SLOTS, SLOTS_PLAYOFF, SLOT_LABEL, SLOT_LABEL_ES, SLOT_DIA, DIA_LABEL,
  STATUS_CONFRONTO, STATUS_LABEL, STATUS_COR,
  FUSO_PADRAO, FUSOS, slotLabelFuso, slotHoraLocal, dataDoDia, dataDoDiaEs, diaJaPassou, slotJaFechado, addDias,
  resolverDisponibilidade, avisaBackToBack, encontrarSlotsEmComum,
  baseSlotKey, slotComSemana, slotSemana, slotsAdjacentes,
  ordemSlotsRodada, semanasRodada, semanaJaPassou, dataDoSlot,
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
    // Esconde confrontos de rodadas em configuração
    const rodada = rodadas?.[c.rodadaId]
    if (rodada?.status === 'configurando') return
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
                .sort((a, b) =>
                  (slotSemana(a.slot) - slotSemana(b.slot)) ||
                  (SLOTS_PLAYOFF.indexOf(baseSlotKey(a.slot)) - SLOTS_PLAYOFF.indexOf(baseSlotKey(b.slot)))
                )
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
        {c.slot ? SLOT_LABEL[baseSlotKey(c.slot)] : '—'}
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
  const { t } = useTranslation()
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

  const STATUS_RODADA_VISIVEL = ['agendamento', 'jogando']
  const confsMeuTime = Object.entries(confrontos).filter(([, c]) => {
    if (c.timeA !== teamSel && c.timeB !== teamSel) return false
    const rodada = rodadas[c.rodadaId]
    const sr = rodada?.status
    // Rodada em configuração: oculta para não-admin
    if (!isAdmin && sr === 'configurando') return false
    // Rodada encerrada: inclui todos os confrontos do meu time (incluindo realizados)
    if (sr === 'encerrada') return true
    // Ativo (agendamento/jogando/sem status): só confrontos ativos
    return [STATUS_CONFRONTO.PENDENTE, STATUS_CONFRONTO.AGENDANDO, STATUS_CONFRONTO.CONFIRMADO].includes(c.status)
  }).sort(([, a], [, b]) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))

  // Separa confrontos de rodadas encerradas (colapsáveis) dos ativos
  const confsAtivos      = confsMeuTime.filter(([, c]) => rodadas[c.rodadaId]?.status !== 'encerrada')
  const confsEncerrados  = confsMeuTime.filter(([, c]) => rodadas[c.rodadaId]?.status === 'encerrada')

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
          slotsAdjacentes(oc.slot).forEach(adj => { ocupados[adj] = true })
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
    const slotsAnteriores = dispon[confrontoId]?.[teamSel]?.slots ?? []
    const mudouDisponibilidade = JSON.stringify([...meusSlots].sort()) !== JSON.stringify([...slotsAnteriores].sort())
    const nomeMeu   = teams[teamSel]?.nome ?? teamSel
    const mencaoA   = mencaoTime(teams[confronto.timeA], confronto.timeA)
    const mencaoB   = mencaoTime(teams[confronto.timeB], confronto.timeB)
    const rolesAB   = [teams[confronto.timeA]?.discordRoleId, teams[confronto.timeB]?.discordRoleId].filter(Boolean)
    const rodada    = rodadas[confronto.rodadaId]
    const ehPlayoff = String(rodada?.numero ?? '').startsWith('P')
    const ordemSlots = ordemSlotsRodada(rodada, ehPlayoff)

    // Resolve a "semana de jogos" de referência de um slot — slots de semanas
    // seguintes (sufixo __semN) usam semanaJogos + 7*(N-1) dias.
    const semanaDoSlot = slot => slotSemana(slot) > 1 ? addDias(rodada?.semanaJogos, (slotSemana(slot) - 1) * 7) : rodada?.semanaJogos

    setSaving(confrontoId)
    try {
      await set(ref(db, `${disponibilidadePath(idPublico)}/${confrontoId}/${teamSel}`), {
        slots: meusSlots,
        registradoEm: Date.now(),
      })

      if (meusSlots.length > 0 && mudouDisponibilidade) {
        const slotsTexto = meusSlots
          .map(slot => {
            const base     = baseSlotKey(slot)
            const dataSlot = dataDoDia(SLOT_DIA[base], semanaDoSlot(slot))
            return `${SLOT_LABEL[base] ?? slot}${dataSlot ? ` (${dataSlot})` : ''}`
          })
          .join(', ')
        const slotsTextoEs = meusSlots
          .map(slot => {
            const base       = baseSlotKey(slot)
            const dataSlotEs = dataDoDiaEs(SLOT_DIA[base], semanaDoSlot(slot))
            return `${SLOT_LABEL_ES[base] ?? slot}${dataSlotEs ? ` (${dataSlotEs})` : ''}`
          })
          .join(', ')
        notificarDiscord(
          `🗓️ **${nomeMeu}** marcou disponibilidade — ${mencaoA} vs ${mencaoB}${rodada ? ` (Rodada ${rodada.numero})` : ''}\nDisponível em: ${slotsTexto}\n\n`
          + `🇪🇸\n**${nomeMeu}** tiene disponibilidad marcada — ${mencaoA} vs ${mencaoB}${rodada ? ` (Ronda ${rodada.numero})` : ''}\nDisponible el: ${slotsTextoEs}`,
          rolesAB
        )
      }

      if (meusSlots.length > 0 && advSlots.length > 0) {
        const ocupados   = slotsOcupadosNaRodada(confrontoId)
        const resultado  = resolverDisponibilidade(meusSlots, advSlots, ocupados, ordemSlots)

        if (resultado.slot) {
          const baseResultado = baseSlotKey(resultado.slot)
          const jaConfirmadoNesseSlot = confronto.status === STATUS_CONFRONTO.CONFIRMADO && confronto.slot === resultado.slot
          await update(ref(db, `${confrontosPath(idPublico)}/${confrontoId}`), {
            slot:          resultado.slot,
            status:        STATUS_CONFRONTO.CONFIRMADO,
            alertas:       {},
            atualizadoEm:  Date.now(),
          })
          flash(confrontoId, 'ok', `✓ Confirmado automaticamente! ${SLOT_LABEL[baseResultado]}`)
          if (!jaConfirmadoNesseSlot) {
            const dataSlot   = dataDoDia(SLOT_DIA[baseResultado], semanaDoSlot(resultado.slot))
            const dataSlotEs = dataDoDiaEs(SLOT_DIA[baseResultado], semanaDoSlot(resultado.slot))
            notificarDiscord(
              `✅ **Partida confirmada:** ${mencaoA} vs ${mencaoB} — ${SLOT_LABEL[baseResultado]}${dataSlot ? ` (${dataSlot})` : ''}${rodada ? ` · Rodada ${rodada.numero}` : ''}\n\n`
              + `🇪🇸\n✅ **Partida confirmada:** ${mencaoA} vs ${mencaoB} — ${SLOT_LABEL_ES[baseResultado]}${dataSlotEs ? ` (${dataSlotEs})` : ''}${rodada ? ` · Ronda ${rodada.numero}` : ''}`,
              rolesAB
            )
          }
        } else {
          const jaAlertado = !!confronto.alertas?.semOverlap
          await update(ref(db, `${confrontosPath(idPublico)}/${confrontoId}`), {
            status:   STATUS_CONFRONTO.AGENDANDO,
            alertas:  { semOverlap: true },
            atualizadoEm: Date.now(),
          })
          flash(confrontoId, 'aviso', 'Nenhum slot em comum com o adversário. O admin foi sinalizado.')
          if (!jaAlertado) {
            notificarDiscord(
              `⚠️ **Sem horário em comum:** ${mencaoA} vs ${mencaoB}${rodada ? ` (Rodada ${rodada.numero})` : ''} — os times marcaram disponibilidade mas não há overlap. Intervenção do admin necessária.\n\n`
              + `🇪🇸\n⚠️ **Sin horario en común:** ${mencaoA} vs ${mencaoB}${rodada ? ` (Ronda ${rodada.numero})` : ''} — los equipos marcaron disponibilidad pero no hay coincidencia. Se necesita intervención del admin.`,
              rolesAB
            )
          }
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
  }, [confrontos, selecoes, dispon, teamSel, teams, rodadas]) // eslint-disable-line

  if (!modules.loading && !isAdmin && !capitaoEfetivo && !modules.campeonatoAtivo) {
    return <PaginaInativa icone="📅" titulo="Agenda em preparação" descricao="A agenda de partidas estará disponível quando o campeonato começar." />
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const teamsArr     = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const meuTime      = teams[teamSel]
  // Admin pode sobrescrever o fuso de exibição para testes; capitão usa o fuso do time
  const fusoExibicao = fusoTeste || meuTime?.fuso || FUSO_PADRAO

  // Data de hoje em 'YYYY-MM-DD' — usada para verificar se a janela de
  // agendamento de uma rodada (rodada.janelaFechaEm) já fechou.
  const hojeStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

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

          {teamSel && confsAtivos.length === 0 && confsEncerrados.length === 0 && (
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

          {teamSel && confsAtivos.map(([id, c]) => {
            const advId    = c.timeA === teamSel ? c.timeB : c.timeA
            const adv      = teams[advId]
                    const rodada    = rodadas[c.rodadaId]
            const ehPlayoff = String(rodada?.numero ?? '').startsWith('P')
            const slotsRodada = ehPlayoff ? SLOTS_PLAYOFF : SLOTS
            const ordemSlots = ordemSlotsRodada(rodada, ehPlayoff)
            const meusSlots = selecoes[id] ?? []
            const advSlots  = dispon[id]?.[advId]?.slots ?? []
            const emComum   = encontrarSlotsEmComum(meusSlots, advSlots, ordemSlots)
            const ocupados  = slotsOcupadosNaRodada(id)
            const fb        = feedback[id]
            const janelaFechada = !!(rodada?.janelaFechaEm && rodada.janelaFechaEm < hojeStr)
            // Oculta semanas inteiras já encerradas (todas marcadas pra rodadas
            // estendidas — ex: rodada que começou na semana 1 mas só teve o
            // prazo prorrogado pra uma semana mais à frente).
            const todasSemanas = semanasRodada(rodada)
            const semanasFuturas = todasSemanas.filter(({ ref }) => !semanaJaPassou(ref))
            const semanas = semanasFuturas.length > 0 ? semanasFuturas : todasSemanas.slice(-1)

            return (
              <div key={id} className={`ag-confronto${c.status === STATUS_CONFRONTO.CONFIRMADO ? ' ag-confronto--ok' : ''}`}>

                <div className="ag-confronto-header">
                  <div className="ag-confronto-vs">
                    <span style={{ color: meuTime?.cor ?? 'var(--blue)', fontWeight: 700 }}>{meuTime?.nome ?? 'Seu time'}</span>
                    <span className="ag-vs">vs</span>
                    <span style={{ color: adv?.cor ?? 'var(--red)', fontWeight: 700 }}>{adv?.nome ?? 'A definir'}</span>
                  </div>
                  <div className="ag-confronto-meta">
                    {rodada && <span className="ag-confronto-rodada">Rodada {rodada.numero}</span>}
                    <span className="ag-confronto-formato">{c.formato}</span>
                    <span className="ag-status" style={{ color: STATUS_COR[c.status] }}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  {rodada?.semanaJogos && (
                    <div className="ag-semana-jogos">
                      {t('agendamento.semanaJogos', {
                        de:  dataDoDia('terca', semanas[0]?.ref),
                        ate: dataDoDia('sabado', semanas[semanas.length - 1]?.ref),
                      })}
                    </div>
                  )}
                </div>

                {c.status === STATUS_CONFRONTO.CONFIRMADO && c.slot && (
                  <div className="ag-confirmado">
                    <span className="ag-confirmado-icon">✓</span>
                    Partida confirmada: <strong>
                      {slotLabelFuso(c.slot, fusoExibicao)}
                      {(() => {
                        const dataDia = dataDoSlot(c.slot, rodada?.semanaJogos)
                        return dataDia ? ` – ${dataDia}` : ''
                      })()}
                    </strong>
                    {adv?.fuso && adv.fuso !== (meuTime?.fuso ?? FUSO_PADRAO) && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text2)' }}>
                        · {slotLabelFuso(c.slot, adv.fuso)} (adversário)
                      </span>
                    )}
                  </div>
                )}

                {c.status !== STATUS_CONFRONTO.CONFIRMADO && janelaFechada && (
                  <div className="ag-aviso" style={{ fontSize: 13 }}>
                    {t('agendamento.janelaFechada')}
                  </div>
                )}

                {c.status !== STATUS_CONFRONTO.CONFIRMADO && !janelaFechada && (
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

                    {semanas.map(({ semana, ref: semanaRef }, semIdx) => (
                      <div key={semana}>
                        {semIdx > 0 && (
                          <div className="ag-semana-divisor">
                            <span className="ag-semana-divisor-linha" />
                            <span className="ag-semana-divisor-label">
                              {t('agendamento.semanaSeguinte', { de: dataDoDia('terca', semanaRef) })}
                            </span>
                            <span className="ag-semana-divisor-linha" />
                          </div>
                        )}
                        <div className="ag-grid">
                          {Object.keys(DIA_LABEL).map(dia => {
                            const slotsHoje = slotsRodada.filter(s => SLOT_DIA[s] === dia).map(s => slotComSemana(s, semana))
                            const dataDia   = dataDoDia(dia, semanaRef)
                            const passou    = diaJaPassou(dia, semanaRef)
                            return (
                              <div key={`${semana}-${dia}`} className="ag-dia">
                                <div className="ag-dia-label">
                                  <span>{t(`agendamento.dias.${dia}`)}</span>
                                  {dataDia && <span className="ag-dia-data">{dataDia}</span>}
                                </div>
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
                                    const horarioBRT   = baseSlotKey(slot).split('-')[1].replace(/h$/, '')
                                    const mostraBRT    = fusoExibicao !== FUSO_PADRAO
                                    const fechado      = !passou && slotJaFechado(slot, rodada?.semanaJogos)
                                    const bloqueado    = passou || fechado

                                    return (
                                      <button
                                        key={slot}
                                        className={[
                                          'ag-slot',
                                          euMarcei  ? 'ag-slot--meu'    : '',
                                          advMarcou ? 'ag-slot--adv'    : '',
                                          overlap   ? 'ag-slot--ok'     : '',
                                          ocupado   ? 'ag-slot--ocupado': '',
                                          bloqueado ? 'ag-slot--passado': '',
                                          backToBack? 'ag-slot--warn'   : '',
                                        ].filter(Boolean).join(' ')}
                                        style={{
                                          '--minha-cor': meuTime?.cor ?? 'var(--blue)',
                                          '--adv-cor':   adv?.cor     ?? 'var(--red)',
                                        }}
                                        onClick={() => !ocupado && !bloqueado && toggleSlot(id, slot)}
                                        disabled={ocupado || bloqueado}
                                        title={ocupado ? t('agendamento.tooltipOcupado') : passou ? t('agendamento.tooltipPassou') : fechado ? t('agendamento.tooltipFechado') : backToBack ? t('agendamento.tooltipBackToBack') : slotLabelFuso(slot, fusoExibicao)}
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
                      </div>
                    ))}

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
                          title={t('agendamento.tooltipLimparSelecao')}
                        >
                          ✕ Limpar seleção
                        </button>
                      )}
                      <button
                        className="btn"
                        style={{ fontSize: 12 }}
                        onClick={() => setSelecoes(s => ({ ...s, [id]: ordemSlots.filter(slot => !slotJaFechado(slot, rodada?.semanaJogos)) }))}
                        title={t('agendamento.tooltipDisponivelSempre')}
                      >
                        Disponível sempre
                      </button>
                    </div>
                  </>
                )}

              </div>
            )
          })}

          {/* ── Rodadas encerradas ─────────────────────────────────────── */}
          {teamSel && confsEncerrados.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="ag-section-title" style={{ marginBottom: 10, fontSize: 13, color: 'var(--text3)' }}>
                Rodadas encerradas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {confsEncerrados.map(([id, c]) => {
                  const advId   = c.timeA === teamSel ? c.timeB : c.timeA
                  const adv     = teams[advId]
                  const rodada  = rodadas[c.rodadaId]
                  const realizado = c.status === STATUS_CONFRONTO.REALIZADO || c.status === STATUS_CONFRONTO.EMPATE_PENDENTE
                  const pendente  = !realizado
                  return (
                    <div key={id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px 14px', borderRadius: 8,
                      background: pendente ? 'rgba(224,85,85,0.06)' : 'var(--bg3)',
                      border: `1px solid ${pendente ? 'rgba(224,85,85,0.35)' : 'var(--border)'}`,
                      flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text3)', minWidth: 70 }}>
                        Rodada {rodada?.numero ?? '?'}
                      </span>
                      <span style={{ fontSize: 13, color: meuTime?.cor ?? 'var(--blue)', fontWeight: 700 }}>{meuTime?.nome ?? 'Meu time'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>vs</span>
                      <span style={{ fontSize: 13, color: adv?.cor ?? 'var(--text)', fontWeight: 700 }}>{adv?.nome ?? advId}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        color: pendente ? 'var(--red)' : 'var(--text2)',
                        background: pendente ? 'rgba(224,85,85,0.12)' : 'var(--bg2)',
                        border: `1px solid ${pendente ? 'rgba(224,85,85,0.3)' : 'var(--border)'}`,
                        borderRadius: 4, padding: '2px 8px',
                      }}>
                        {pendente ? '⚠ Pendente' : STATUS_LABEL[c.status]}
                      </span>
                      {c.resultado && (
                        <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                          {c.resultado.timeA ?? 0}–{c.resultado.timeB ?? 0}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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
