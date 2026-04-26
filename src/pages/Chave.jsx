import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import {
  BRACKET_UPPER, BRACKET_LOWER, BRACKET_LABELS,
  STATUS_CONFRONTO, TIPO_CONFRONTO, SLOT_LABEL,
} from '../utils/scheduling'
import './Chave.css'

// ── Constantes de layout do bracket ───────────────────────────────────────────
const CARD_H   = 74
const CARD_GAP = 24
const COL_W    = 220
const CONN_W   = 52
const COL_STEP = COL_W + CONN_W
const LABEL_H  = 28

function calcPositions(rounds) {
  if (!rounds.length) return []
  const all = []
  const r0 = rounds[0].map((_, i) => i * (CARD_H + CARD_GAP))
  all.push(r0)
  for (let r = 1; r < rounds.length; r++) {
    const prev = all[r - 1]
    const curr = rounds[r].map((_, i) => {
      const yTop = prev[i * 2]      ?? prev[prev.length - 1] ?? 0
      const yBot = prev[i * 2 + 1] ?? yTop
      return (yTop + yBot) / 2
    })
    all.push(curr)
  }
  return all
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function Chave() {
  const [confrontos, setConfrontos] = useState({})
  const [rodadas,    setRodadas]    = useState({})
  const [times,      setTimes]      = useState({})
  const [erroRead,   setErroRead]   = useState(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => onValue(
    ref(db, '/confrontos'),
    snap => { setConfrontos(snap.val() ?? {}); setLoading(false) },
    err  => { setErroRead(err.message);        setLoading(false) },
  ), [])
  useEffect(() => onValue(ref(db, '/rodadas'), snap => setRodadas(snap.val() ?? {})), [])
  useEffect(() => onValue(ref(db, '/teams'),   snap => setTimes(snap.val()   ?? {})), [])

  if (loading) return (
    <div className="chave-root">
      <h1 className="page-title">Chave do Campeonato</h1>
      <div className="chave-vazio">Carregando...</div>
    </div>
  )

  if (erroRead) return (
    <div className="chave-root">
      <h1 className="page-title">Chave do Campeonato</h1>
      <div className="chave-vazio" style={{ color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }}>
        Erro ao ler dados: <code>{erroRead}</code><br />
        Verifique a regra <code>/confrontos: ".read": true</code> no Firebase.
      </div>
    </div>
  )

  // ── Agrupa por tipo ──────────────────────────────────────────────────────────
  const porTipo = {}
  Object.values(confrontos).forEach(c => {
    if (!porTipo[c.tipo]) porTipo[c.tipo] = []
    porTipo[c.tipo].push(c)
  })
  Object.keys(porTipo).forEach(t =>
    porTipo[t].sort((a, b) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))
  )

  // ── Fase regular — agrupa por rodada ─────────────────────────────────────────
  const regularPorRodada = {}
  const tiposRegular = [TIPO_CONFRONTO.REGULAR, TIPO_CONFRONTO.DESEMPATE]
  Object.values(confrontos)
    .filter(c => tiposRegular.includes(c.tipo))
    .forEach(c => {
      const rid = c.rodadaId ?? 'sem-rodada'
      if (!regularPorRodada[rid]) regularPorRodada[rid] = []
      regularPorRodada[rid].push(c)
    })

  const rodadasRegulares = Object.entries(regularPorRodada)
    .map(([rid, matches]) => ({ rid, rodada: rodadas[rid], matches }))
    .filter(r => r.rodada?.numero !== 'P') // exclui rodada de playoffs
    .sort((a, b) => (a.rodada?.numero ?? 0) - (b.rodada?.numero ?? 0))

  // ── Playoffs ─────────────────────────────────────────────────────────────────
  const upperRounds = BRACKET_UPPER.filter(t => porTipo[t]?.length > 0)
  const lowerRounds = BRACKET_LOWER.filter(t => porTipo[t]?.length > 0)
  const temRegular  = rodadasRegulares.length > 0
  const temClassif  = (porTipo[TIPO_CONFRONTO.CLASSIFICATORIO]?.length ?? 0) > 0
  const temUpper    = upperRounds.length > 0
  const temLower    = lowerRounds.length > 0
  const temFinal    = (porTipo[TIPO_CONFRONTO.GRANDE_FINAL]?.length ?? 0) > 0
  const temPlayoff  = temClassif || temUpper || temLower || temFinal

  if (!temRegular && !temPlayoff) {
    return (
      <div className="chave-root">
        <h1 className="page-title">Chave do Campeonato</h1>
        <div className="chave-vazio">
          Nenhuma partida registrada ainda.
        </div>
      </div>
    )
  }

  return (
    <div className="chave-root">
      <h1 className="page-title">Chave do Campeonato</h1>
      <p className="page-subtitle">Copa Inhouse · Temporada 2025</p>

      {/* ── Fase Regular ──────────────────────────────────────────────────── */}
      {temRegular && (
        <div className="chave-secao">
          <div className="chave-secao-titulo" style={{ color: 'var(--text)', borderColor: 'var(--border2)' }}>
            Fase Regular
          </div>
          <div className="chave-regular">
            {rodadasRegulares.map(({ rid, rodada, matches }) => (
              <div key={rid} className="chave-rodada">
                <div className="chave-rodada-label">
                  Rodada {rodada?.numero ?? '?'}
                  {rodada?.semanaJogos && (
                    <span className="chave-rodada-data">{rodada.semanaJogos}</span>
                  )}
                </div>
                <div className="chave-rodada-matches">
                  {matches
                    .sort((a, b) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))
                    .map((m, i) => (
                      <MatchCard key={i} match={m} times={times} small />
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fase Classificatória ──────────────────────────────────────────── */}
      {temClassif && (
        <div className="chave-secao">
          <div className="chave-secao-titulo" style={{ color: 'var(--text2)', borderColor: 'var(--border2)' }}>
            Fase Classificatória
          </div>
          <div className="chave-classif-grid">
            {porTipo[TIPO_CONFRONTO.CLASSIFICATORIO].map((m, i) => (
              <MatchCard key={i} match={m} times={times} />
            ))}
          </div>
          <div className="chave-classif-hint">↓ Vencedores avançam para as Quartas de Final</div>
        </div>
      )}

      {/* ── Chave de Vencedores ───────────────────────────────────────────── */}
      {temUpper && (
        <div className="chave-secao">
          <div className="chave-secao-titulo chave-secao-titulo--upper">Chave de Vencedores</div>
          <div className="chave-secao-bracket-wrap">
            <BracketSide
              rounds={upperRounds.map(t => porTipo[t])}
              labels={upperRounds.map(t => BRACKET_LABELS[t])}
              times={times}
            />
          </div>
        </div>
      )}

      {/* ── Chave de Perdedores ───────────────────────────────────────────── */}
      {temLower && (
        <div className="chave-secao">
          <div className="chave-secao-titulo chave-secao-titulo--lower">Chave de Perdedores</div>
          <div className="chave-secao-bracket-wrap">
            <BracketSide
              rounds={lowerRounds.map(t => porTipo[t])}
              labels={lowerRounds.map(t => BRACKET_LABELS[t])}
              times={times}
            />
          </div>
        </div>
      )}

      {/* ── Grande Final ─────────────────────────────────────────────────── */}
      {temFinal && (
        <div className="chave-secao chave-secao--final">
          <div className="chave-secao-titulo chave-secao-titulo--final">Grande Final</div>
          <div className="chave-grande-final">
            {porTipo[TIPO_CONFRONTO.GRANDE_FINAL].map((m, i) => (
              <MatchCard key={i} match={m} times={times} destaque />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bracket Side ──────────────────────────────────────────────────────────────
function BracketSide({ rounds, labels, times }) {
  const positions = calcPositions(rounds)
  const totalH = rounds[0]
    ? (rounds[0].length - 1) * (CARD_H + CARD_GAP) + CARD_H
    : CARD_H
  const totalW = rounds.length * COL_STEP - CONN_W

  const winnerY = (match, baseY) => {
    const r = match?.resultado
    if (!r) return baseY + LABEL_H + CARD_H / 2
    const topWon = r.tipo === 'wo_a' || (r.tipo === 'normal' && r.timeA > r.timeB)
    const botWon = r.tipo === 'wo_b' || (r.tipo === 'normal' && r.timeB > r.timeA)
    if (topWon) return baseY + LABEL_H + CARD_H / 4
    if (botWon) return baseY + LABEL_H + CARD_H * 3 / 4
    return baseY + LABEL_H + CARD_H / 2
  }

  const svgLines = []
  for (let r = 0; r < rounds.length - 1; r++) {
    const currPos  = positions[r]
    const nextPos  = positions[r + 1]
    const currMtch = rounds[r]
    for (let i = 0; i < nextPos.length; i++) {
      const yTop  = currPos[i * 2]      ?? currPos[currPos.length - 1] ?? 0
      const yBot  = currPos[i * 2 + 1] ?? yTop
      const yNext = nextPos[i]
      const xRight = r * COL_STEP + COL_W
      const xMid   = r * COL_STEP + COL_W + CONN_W / 2
      const xLeft  = (r + 1) * COL_STEP
      const cy1    = winnerY(currMtch[i * 2],     yTop)
      const cy2    = winnerY(currMtch[i * 2 + 1], yBot)
      const cnext  = yNext + LABEL_H + CARD_H / 2
      const yJoin  = (cy1 + cy2) / 2
      svgLines.push(
        <polyline key={`${r}-${i}-t`}  points={`${xRight},${cy1} ${xMid},${cy1} ${xMid},${yJoin}`}    fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />,
        ...(yTop !== yBot ? [<polyline key={`${r}-${i}-b`}  points={`${xRight},${cy2} ${xMid},${cy2} ${xMid},${yJoin}`}    fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />] : []),
        <polyline key={`${r}-${i}-f`}  points={`${xMid},${yJoin} ${xMid},${cnext} ${xLeft},${cnext}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />,
      )
    }
  }

  return (
    <div className="bracket-side" style={{ position: 'relative', width: totalW, height: totalH + LABEL_H + 8, minWidth: totalW }}>
      <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} width={totalW} height={totalH + LABEL_H + 8}>
        {svgLines}
      </svg>
      {labels.map((label, r) => (
        <div key={r} className="bracket-col-label" style={{ left: r * COL_STEP, width: COL_W }}>{label}</div>
      ))}
      {rounds.map((matches, r) =>
        matches.map((match, i) => (
          <div key={`${r}-${i}`} style={{ position: 'absolute', top: (positions[r]?.[i] ?? 0) + LABEL_H, left: r * COL_STEP, width: COL_W }}>
            <MatchCard match={match} times={times} />
          </div>
        ))
      )}
    </div>
  )
}

// ── Match Card ─────────────────────────────────────────────────────────────────
function MatchCard({ match: m, times, destaque = false, small = false }) {
  if (!m) return null
  const tA = times[m.timeA]
  const tB = times[m.timeB]
  // EMPATE_PENDENTE também tem resultado registrado (1-1), trata como realizado para exibição
  const realizado  = m.status === STATUS_CONFRONTO.REALIZADO || m.status === STATUS_CONFRONTO.EMPATE_PENDENTE
  const confirmado = m.status === STATUS_CONFRONTO.CONFIRMADO
  const vencedorId = realizado && m.resultado
    ? (m.resultado.timeA > m.resultado.timeB ? m.timeA
     : m.resultado.timeB > m.resultado.timeA ? m.timeB : null)
    : null
  const tipoRes = m.resultado?.tipo

  return (
    <div className={['match-card', destaque ? 'match-card--destaque' : '', realizado ? 'match-card--realizado' : '', small ? 'match-card--small' : ''].filter(Boolean).join(' ')}
      style={small ? {} : { height: CARD_H }}>
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

function TeamSlot({ time, placar, venceu, perdeu, tipoRes, lado, small }) {
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
