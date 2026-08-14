import { useState, useEffect } from 'react'
import { ref, onValue, set, push, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath, rodadasPath, confrontosPath, tabelaOverridePath } from '../utils/campeonatoPaths'
import { calcularClassificacao } from '../utils/scheduling'
import { BRACKET_8_DOUBLE_ELIM, BRACKET_PHASES } from '../utils/bracketTemplates'
import { STATUS_CONFRONTO } from '../utils/scheduling'

// aplicarOverridesDePosicao — duplicado aqui pra não criar dependência circular
// com Tabela.jsx (que é uma page, não um util)
function aplicarOverrides(classificacao, overrides) {
  const n = classificacao.length
  if (!n || !overrides || !Object.keys(overrides).length) return classificacao
  const slots = new Array(n).fill(null)
  const semOverride = []
  for (const entry of classificacao) {
    const pos = overrides[entry.id]?.posicaoManual
    if (pos != null && pos >= 1 && pos <= n) {
      const idx = pos - 1
      if (slots[idx] === null) slots[idx] = { ...entry, posicaoManual: pos, posicaoPendente: false }
      else semOverride.push(entry)
    } else {
      semOverride.push(entry)
    }
  }
  let j = 0
  for (let i = 0; i < n; i++) {
    if (slots[i] === null) slots[i] = semOverride[j++]
  }
  return slots.filter(Boolean)
}

export default function AdminBracketSection() {
  const { campeonatoId } = useCampeonato()
  const [times,      setTimes]      = useState({})
  const [confrontos, setConfrontos] = useState({})
  const [rodadas,    setRodadas]    = useState({})
  const [overrides,  setOverrides]  = useState({})
  const [feedback,   setFeedback]   = useState(null)
  const [gerando,    setGerando]    = useState(false)
  const [confirmGerarOpen, setConfirmGerarOpen] = useState(false)

  useEffect(() => onValue(ref(db, teamPath(campeonatoId)),           s => setTimes(s.val()      ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, confrontosPath(campeonatoId)),     s => setConfrontos(s.val() ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, rodadasPath(campeonatoId)),        s => setRodadas(s.val()    ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, tabelaOverridePath(campeonatoId)), s => setOverrides(s.val()  ?? {})), [campeonatoId])

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  // ── Lê a classificação final (mesma lógica do Tabela.jsx) ─────────────────
  const teamIds      = Object.keys(times)
  const todosConfs   = Object.values(confrontos)
  const classificacao = aplicarOverrides(
    calcularClassificacao(teamIds, todosConfs),
    overrides
  )

  // ── Verifica se o bracket já existe ──────────────────────────────────────
  const confrontosBracket = Object.entries(confrontos).filter(([, c]) => c.bracketSlot)
  const bracketExiste = confrontosBracket.length > 0

  // Mapa bracketSlot → id do confronto Firebase
  const slotMap = {}
  confrontosBracket.forEach(([id, c]) => { slotMap[c.bracketSlot] = id })

  // ── Classificação exibida com pendências ──────────────────────────────────
  // Posição manual já resolve o empate do ponto de vista do admin.
  // Só bloqueia se houver times pendentes SEM override manual definido.
  const semPendencia = classificacao.every(e => !e.posicaoPendente || e.posicaoManual != null)
  const totalTimes   = classificacao.length

  // ── Gerar bracket ─────────────────────────────────────────────────────────
  async function gerarBracket() {
    if (totalTimes !== 8) return flash('erro', `Bracket requer exatamente 8 times. Encontrados: ${totalTimes}.`)
    if (!semPendencia) return flash('erro', 'Há posições pendentes na tabela (⚖ DESEMPATE). Resolva antes de gerar o bracket.')

    setGerando(true)
    setConfirmGerarOpen(false)
    try {
      // 1. Cria as 4 rodadas de playoff (uma por semana/fase)
      const faseIds = {}
      for (const [faseKey, fase] of Object.entries(BRACKET_PHASES)) {
        const rId = push(ref(db, rodadasPath(campeonatoId))).key
        await set(ref(db, `${rodadasPath(campeonatoId)}/${rId}`), {
          nome:     fase.nome,
          numero:   faseKey,       // 'P-1', 'P-2', 'P-3', 'P-4'
          status:   'configurando',
          criadoEm: Date.now(),
        })
        faseIds[faseKey] = rId
      }

      // 2. Monta o seeding (posição 1-indexed → teamId)
      const seeds = {}
      classificacao.forEach((entry, idx) => { seeds[idx + 1] = entry.id })

      // 3. Mapa bracketSlot → faseKey (qual rodada recebe cada confronto)
      const slotFase = {}
      for (const [faseKey, fase] of Object.entries(BRACKET_PHASES)) {
        fase.slots.forEach(s => { slotFase[s] = faseKey })
      }

      // 4. Cria todos os 14 confrontos com update atômico
      const updates = {}
      const slotToId = {}

      for (const slot of Object.values(BRACKET_8_DOUBLE_ELIM)) {
        const newId = push(ref(db, confrontosPath(campeonatoId))).key
        slotToId[slot.id] = newId
      }

      for (const slot of Object.values(BRACKET_8_DOUBLE_ELIM)) {
        const id       = slotToId[slot.id]
        const faseKey  = slotFase[slot.id]
        const rodadaId = faseIds[faseKey]
        const timeA    = slot.seedA ? (seeds[slot.seedA] ?? null) : null
        const timeB    = slot.seedB ? (seeds[slot.seedB] ?? null) : null

        updates[`${confrontosPath(campeonatoId)}/${id}`] = {
          rodadaId,
          timeA,
          timeB,
          tipo:        slot.tipo,
          formato:     slot.formato,
          madness:     'soft',
          bracketSlot: slot.id,
          winnerTo:    slot.winnerTo    ?? null,
          winnerSlot:  slot.winnerSlot  ?? null,
          loserTo:     slot.loserTo     ?? null,
          loserSlot:   slot.loserSlot   ?? null,
          ...(slot.vantagem ? { vantagem: slot.vantagem } : {}),
          slot:        null,
          status:      STATUS_CONFRONTO.PENDENTE,
          resultado:   null,
          alertas:     {},
          observacoes: null,
          criadoEm:    Date.now(),
          atualizadoEm: Date.now(),
        }
      }

      await update(ref(db), updates)
      flash('ok', `Bracket gerado! 14 confrontos em 4 rodadas. P-1 Quartas: ${times[seeds[1]]?.nome ?? seeds[1]} vs ${times[seeds[8]]?.nome ?? seeds[8]}, etc.`)
    } catch (e) {
      flash('erro', `Erro ao gerar: ${e.message}`)
    } finally {
      setGerando(false)
    }
  }

  // ── Apagar bracket ────────────────────────────────────────────────────────
  const [confirmApagarOpen, setConfirmApagarOpen] = useState(false)
  const [apagando, setApagando] = useState(false)

  async function apagarBracket() {
    setApagando(true)
    setConfirmApagarOpen(false)
    try {
      const updates = {}
      confrontosBracket.forEach(([id]) => {
        updates[`${confrontosPath(campeonatoId)}/${id}`] = null
      })
      // Apaga também a rodada de Playoffs se existir
      Object.entries(rodadas).forEach(([rid, r]) => {
        if (String(r.numero ?? '').startsWith('P')) updates[`${rodadasPath(campeonatoId)}/${rid}`] = null
      })
      await update(ref(db), updates)
      flash('ok', 'Bracket apagado.')
    } catch (e) {
      flash('erro', `Erro ao apagar: ${e.message}`)
    } finally {
      setApagando(false)
    }
  }

  return (
    <section className="admin-section" style={{ maxWidth: 900 }}>
      <div className="admin-section-title" style={{ color: 'var(--gold)' }}>
        Bracket — Dupla Eliminação
      </div>

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

        {/* ── Tabela de seeding ──────────────────────────────────────────── */}
        <div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--text2)' }}>
            Seeding atual ({totalTimes}/8 times)
          </div>
          {classificacao.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhum time com jogos registrados ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {classificacao.map((entry, idx) => {
                const time = times[entry.id]
                return (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '5px 10px', borderRadius: 5,
                    background: entry.posicaoPendente ? 'rgba(201,168,76,0.06)' : 'var(--bg3)',
                    border: `1px solid ${entry.posicaoPendente ? 'rgba(201,168,76,0.25)' : 'var(--border)'}`,
                    fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif",
                  }}>
                    <span style={{ color: 'var(--text3)', minWidth: 24, textAlign: 'right' }}>
                      {idx + 1}º
                    </span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: time?.cor ?? 'var(--border)', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: time?.cor ?? 'var(--text)', fontWeight: 700 }}>
                      {time?.nome ?? entry.id}
                    </span>
                    <span style={{ color: 'var(--text3)', fontSize: 11 }}>
                      {entry.pontos} pts · {entry.vitorias}V {entry.derrotas}D
                    </span>
                    {entry.posicaoPendente && (
                      <span style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.06em' }}>
                        ⚖ DESEMPATE PENDENTE
                      </span>
                    )}
                    {entry.posicaoManual && (
                      <span style={{ fontSize: 10, color: 'var(--purple)', fontWeight: 700, letterSpacing: '0.06em' }}>
                        ✎ POS. MANUAL
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Pré-visualização do bracket (só quartas) ──────────────────── */}
        {totalTimes === 8 && semPendencia && !bracketExiste && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text2)' }}>
              Pré-visualização das Quartas (seeding auto):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { slot: 'M1', sA: 1, sB: 8 },
                { slot: 'M2', sA: 4, sB: 5 },
                { slot: 'M3', sA: 2, sB: 7 },
                { slot: 'M4', sA: 3, sB: 6 },
              ].map(({ slot, sA, sB }) => {
                const tA = times[classificacao[sA - 1]?.id]
                const tB = times[classificacao[sB - 1]?.id]
                return (
                  <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    <span style={{ color: 'var(--text3)', minWidth: 24 }}>{slot}</span>
                    <span style={{ color: tA?.cor ?? 'var(--text)', fontWeight: 700 }}>{sA}º {tA?.nome ?? '—'}</span>
                    <span style={{ color: 'var(--text3)' }}>vs</span>
                    <span style={{ color: tB?.cor ?? 'var(--text)', fontWeight: 700 }}>{sB}º {tB?.nome ?? '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Status: bracket já existe ──────────────────────────────────── */}
        {bracketExiste && (
          <div style={{ background: 'rgba(76,175,125,0.06)', border: '1px solid rgba(76,175,125,0.25)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>
              ✓ Bracket gerado — {confrontosBracket.length} confrontos de playoffs
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>
              {Object.keys(slotMap).sort().map(s => (
                <span key={s} style={{ marginRight: 8 }}>
                  {s.toUpperCase()}: {(() => {
                    const c = confrontos[slotMap[s]]
                    const nA = c?.timeA ? (times[c.timeA]?.nome ?? c.timeA) : '?'
                    const nB = c?.timeB ? (times[c.timeB]?.nome ?? c.timeB) : '?'
                    return `${nA} × ${nB}`
                  })()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Avisos de bloqueio ─────────────────────────────────────────── */}
        {totalTimes !== 8 && (
          <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, color: 'var(--red)', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            ⚠ O bracket requer exatamente 8 times classificados. Atualmente: {totalTimes}.
          </div>
        )}
        {totalTimes === 8 && !semPendencia && (
          <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, color: 'var(--gold)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            ⚖ Há empates sem desempate resolvido. Resolva as posições pendentes antes de gerar o bracket.
          </div>
        )}

        {/* ── Ações ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!bracketExiste && !confirmGerarOpen && (
            <button
              className="btn primary"
              disabled={totalTimes !== 8 || !semPendencia || gerando}
              onClick={() => setConfirmGerarOpen(true)}
              style={{ fontSize: 13, padding: '7px 18px', opacity: (totalTimes !== 8 || !semPendencia) ? 0.4 : 1 }}
            >
              {gerando ? 'Gerando...' : '🏆 Gerar bracket'}
            </button>
          )}
          {!bracketExiste && confirmGerarOpen && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif', color: 'var(--text)'" }}>
              <span style={{ color: 'var(--gold2)', fontWeight: 700 }}>Criar 14 confrontos de playoff? Esta ação não é reversível facilmente.</span>
              <button className="btn primary" style={{ fontSize: 12, padding: '5px 14px', background: 'var(--gold)', borderColor: 'var(--gold)', color: '#000' }} onClick={gerarBracket} disabled={gerando}>
                Confirmar
              </button>
              <button className="btn" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setConfirmGerarOpen(false)}>
                Cancelar
              </button>
            </div>
          )}
          {bracketExiste && !confirmApagarOpen && (
            <button
              className="btn"
              disabled={apagando}
              onClick={() => setConfirmApagarOpen(true)}
              style={{ fontSize: 13, padding: '7px 14px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--red)' }}
            >
              🗑 Apagar bracket
            </button>
          )}
          {bracketExiste && confirmApagarOpen && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif'" }}>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>Apagar todos os {confrontosBracket.length} confrontos do playoff?</span>
              <button className="btn" style={{ fontSize: 12, padding: '5px 14px', background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} onClick={apagarBracket} disabled={apagando}>
                Confirmar
              </button>
              <button className="btn" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setConfirmApagarOpen(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>

      </div>
    </section>
  )
}
