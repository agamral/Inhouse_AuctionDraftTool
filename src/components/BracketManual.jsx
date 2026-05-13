/**
 * Componentes visuais do bracket manual.
 * Compartilhado entre Chave.jsx (público) e ChavesUnificadas.jsx (admin preview).
 */
import { STATUS_CONFRONTO, SLOT_LABEL, TIPO_CONFRONTO } from '../utils/scheduling'

// ── Constantes de layout ───────────────────────────────────────────────────────
export const CARD_H   = 74
export const CARD_GAP = 24
export const COL_W    = 220
export const CONN_W   = 52
export const COL_STEP = COL_W + CONN_W
export const LABEL_H  = 28

// ── ManualBracket ──────────────────────────────────────────────────────────────
// Renderiza um bracket a partir da estrutura /chave/{id}/slots

export function ManualBracket({ slots, confrontos, times, timeSel = '' }) {
  if (!slots || !Object.keys(slots).length) return null

  const byCol = {}
  for (const [id, s] of Object.entries(slots)) {
    const col = s.coluna ?? 0
    if (!byCol[col]) byCol[col] = []
    byCol[col].push({ id, s })
  }
  for (const col of Object.keys(byCol)) {
    byCol[col].sort((a, b) => (a.s.ordem ?? 0) - (b.s.ordem ?? 0))
  }
  const cols = Object.keys(byCol).map(Number).sort((a, b) => a - b)
  if (!cols.length) return null

  // children[parentId] = [childIds que apontam para ele via proximoSlot]
  const children = {}
  for (const [id, s] of Object.entries(slots)) {
    const next = s.proximoSlot
    if (next && slots[next]) {
      if (!children[next]) children[next] = []
      children[next].push(id)
    }
  }

  // Y: primeira coluna evenly spaced; demais derivam do midpoint dos filhos
  const yPos = {}
  byCol[cols[0]].forEach(({ id }, i) => { yPos[id] = i * (CARD_H + CARD_GAP) })
  for (let ci = 1; ci < cols.length; ci++) {
    for (const { id } of byCol[cols[ci]]) {
      const feeders = children[id] ?? []
      yPos[id] = feeders.length > 0
        ? feeders.reduce((s, fid) => s + (yPos[fid] ?? 0), 0) / feeders.length
        : byCol[cols[ci]].findIndex(e => e.id === id) * (CARD_H + CARD_GAP)
    }
  }

  const totalW = cols.length * COL_STEP - CONN_W
  const maxY   = Math.max(...Object.values(yPos))
  const totalH = maxY + CARD_H + LABEL_H + 8

  // SVG connector lines — bracket clássico
  const svgLines = []
  for (let ci = 0; ci < cols.length - 1; ci++) {
    const nextColIdx = cols[ci + 1]
    for (const { id: nextId } of byCol[nextColIdx]) {
      const feeders = (children[nextId] ?? [])
        .filter(fid => (slots[fid]?.coluna ?? 0) === cols[ci])
        .sort((a, b) => (yPos[a] ?? 0) - (yPos[b] ?? 0))
      if (!feeders.length) continue

      const xRight = ci * COL_STEP + COL_W
      const xMid   = ci * COL_STEP + COL_W + CONN_W / 2
      const xLeft  = (ci + 1) * COL_STEP
      const yNext  = (yPos[nextId] ?? 0) + LABEL_H + CARD_H / 2
      const yTop   = (yPos[feeders[0]] ?? 0) + LABEL_H + CARD_H / 2
      const yBot   = (yPos[feeders[feeders.length - 1]] ?? 0) + LABEL_H + CARD_H / 2
      const yJoin  = (yTop + yBot) / 2

      for (const fid of feeders) {
        const yCur = (yPos[fid] ?? 0) + LABEL_H + CARD_H / 2
        svgLines.push(
          <polyline key={`f-${fid}`}
            points={`${xRight},${yCur} ${xMid},${yCur} ${xMid},${yJoin}`}
            fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        )
      }
      svgLines.push(
        <polyline key={`n-${nextId}-${ci}`}
          points={`${xMid},${yJoin} ${xMid},${yNext} ${xLeft},${yNext}`}
          fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
      )
    }
  }

  return (
    <div style={{ position: 'relative', width: totalW, height: totalH, minWidth: totalW }}>
      <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        width={totalW} height={totalH}>
        {svgLines}
      </svg>

      {cols.map((col, ci) => (
        <div key={col} className="bracket-col-label" style={{ left: ci * COL_STEP, width: COL_W }}>
          {byCol[col][0]?.s.label && byCol[col].length === 1
            ? byCol[col][0].s.label
            : `Coluna ${ci + 1}`}
        </div>
      ))}

      {cols.map((col, ci) =>
        byCol[col].map(({ id, s }) => {
          const confronto = confrontos[s.confrontoId]
          return (
            <div key={id} style={{ position: 'absolute', top: (yPos[id] ?? 0) + LABEL_H, left: ci * COL_STEP, width: COL_W }}>
              {confronto
                ? <MatchCard match={confronto} times={times} timeSel={timeSel} />
                : <SlotVazio label={s.label} />
              }
            </div>
          )
        })
      )}
    </div>
  )
}

// ── SlotVazio ─────────────────────────────────────────────────────────────────

export function SlotVazio() {
  return (
    <div className="match-card" style={{ height: CARD_H, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border2)', flexShrink: 0 }} />
        <span style={{ color: 'var(--text3)', fontStyle: 'italic', fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif" }}>A definir</span>
      </div>
      <div className="match-card-sep" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border2)', flexShrink: 0 }} />
        <span style={{ color: 'var(--text3)', fontStyle: 'italic', fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif" }}>A definir</span>
      </div>
    </div>
  )
}

// ── MatchCard ─────────────────────────────────────────────────────────────────

export function MatchCard({ match: m, times, destaque = false, small = false, timeSel = '' }) {
  if (!m) return null
  const tA = times[m.timeA]
  const tB = times[m.timeB]
  const highlighted = timeSel && (m.timeA === timeSel || m.timeB === timeSel)
  const dimmed      = timeSel && !highlighted
  const realizado   = m.status === STATUS_CONFRONTO.REALIZADO || m.status === STATUS_CONFRONTO.EMPATE_PENDENTE
  const confirmado  = m.status === STATUS_CONFRONTO.CONFIRMADO
  const vencedorId  = realizado && m.resultado
    ? (m.resultado.timeA > m.resultado.timeB ? m.timeA
     : m.resultado.timeB > m.resultado.timeA ? m.timeB : null)
    : null
  const tipoRes = m.resultado?.tipo
  const highlightCor = highlighted ? (times[timeSel]?.cor ?? 'var(--blue)') : undefined

  return (
    <div className={['match-card', destaque ? 'match-card--destaque' : '', realizado ? 'match-card--realizado' : '', small ? 'match-card--small' : ''].filter(Boolean).join(' ')}
      style={{
        ...(small ? {} : { height: CARD_H }),
        ...(highlighted ? { outline: `2px solid ${highlightCor}`, borderColor: highlightCor } : {}),
        ...(dimmed ? { opacity: 0.35 } : {}),
      }}>
      <TeamSlot time={tA} placar={realizado ? m.resultado?.timeA : null}
        venceu={vencedorId === m.timeA} perdeu={vencedorId !== null && vencedorId !== m.timeA}
        tipoRes={tipoRes} lado="A" small={small} />
      <div className="match-card-sep" />
      <TeamSlot time={tB} placar={realizado ? m.resultado?.timeB : null}
        venceu={vencedorId === m.timeB} perdeu={vencedorId !== null && vencedorId !== m.timeB}
        tipoRes={tipoRes} lado="B" small={small} />
      {confirmado && !realizado && m.slot && (
        <div className="match-card-slot">{SLOT_LABEL[m.slot] ?? m.slot}</div>
      )}
      {m.status === STATUS_CONFRONTO.EMPATE_PENDENTE && (
        <div className="match-card-slot" style={{ color: 'var(--gold)' }}>Empate — Desempate pendente</div>
      )}
      {m.tipo === TIPO_CONFRONTO.DESEMPATE && (
        <div className="match-card-slot" style={{ color: 'var(--gold)' }}>Desempate MD3</div>
      )}
    </div>
  )
}

// ── TeamSlot ─────────────────────────────────────────────────────────────────

export function TeamSlot({ time, placar, venceu, perdeu, tipoRes, lado, small }) {
  const isWoV = (tipoRes === 'wo_a' && lado === 'A') || (tipoRes === 'wo_b' && lado === 'B')
  const isWoL = (tipoRes === 'wo_a' && lado === 'B') || (tipoRes === 'wo_b' && lado === 'A')
  const placarStr = placar !== null && placar !== undefined
    ? (isWoV ? 'W' : isWoL ? 'WO' : tipoRes === 'duplo_wo' ? 'WO' : String(placar))
    : null

  return (
    <div className={['team-slot', !time ? 'team-slot--vazio' : '', venceu ? 'team-slot--venceu' : '', perdeu ? 'team-slot--perdeu' : ''].filter(Boolean).join(' ')}>
      <span className="team-slot-dot" style={{ background: time?.cor ?? 'var(--border)' }} />
      <span className="team-slot-nome" style={{ color: venceu ? (time?.cor ?? 'var(--text)') : undefined, fontSize: small ? 12 : undefined }}>
        {time?.nome ?? 'A definir'}
      </span>
      {placarStr !== null && (
        <span className={`team-slot-placar${venceu ? ' team-slot-placar--venceu' : ''}`}>{placarStr}</span>
      )}
    </div>
  )
}
