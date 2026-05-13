import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import { useModules } from '../hooks/useConfig'
import { useCampeonato } from '../contexts/CampeonatoContext'
import PaginaInativa from '../components/PaginaInativa'
import { teamPath, rodadasPath, confrontosPath, chavePath } from '../utils/campeonatoPaths'
import {
  BRACKET_UPPER, BRACKET_LOWER, BRACKET_LABELS,
  STATUS_CONFRONTO, TIPO_CONFRONTO, SLOT_LABEL,
} from '../utils/scheduling'
import {
  CARD_H, CARD_GAP, COL_W, CONN_W, COL_STEP, LABEL_H,
  ManualBracket, SlotVazio, MatchCard, TeamSlot,
} from '../components/BracketManual'
import './Chave.css'

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
  const { isAdmin } = useAuth()
  const modules = useModules()
  const { idPublico } = useCampeonato()
  const [confrontos, setConfrontos] = useState({})
  const [rodadas,    setRodadas]    = useState({})
  const [times,      setTimes]      = useState({})
  const [chaves,     setChaves]     = useState({})
  const [erroRead,   setErroRead]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [timeSel,    setTimeSel]    = useState('')

  useEffect(() => onValue(
    ref(db, confrontosPath(idPublico)),
    snap => { setConfrontos(snap.val() ?? {}); setLoading(false) },
    err  => { setErroRead(err.message);        setLoading(false) },
  ), [idPublico])
  useEffect(() => onValue(ref(db, rodadasPath(idPublico)), snap => setRodadas(snap.val() ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, teamPath(idPublico)),    snap => setTimes(snap.val()   ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, chavePath(idPublico)),   snap => setChaves(snap.val()  ?? {})), [idPublico])

  if (!modules.loading && !isAdmin && !modules.campeonatoAtivo) {
    return <PaginaInativa icone="🏅" titulo="Chave em preparação" descricao="O bracket do campeonato será publicado quando as partidas começarem." />
  }

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

      {/* Filtro de time */}
      {Object.keys(times).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
          <button
            className={`tab-filtro-btn${timeSel === '' ? ' ativo' : ''}`}
            onClick={() => setTimeSel('')}
          >
            Todos
          </button>
          {Object.entries(times).sort(([,a],[,b]) => a.nome.localeCompare(b.nome)).map(([id, t]) => (
            <button key={id}
              className={`tab-filtro-btn${timeSel === id ? ' ativo' : ''}`}
              style={timeSel === id ? { color: t.cor, borderColor: t.cor + '88', background: t.cor + '14' } : {}}
              onClick={() => setTimeSel(timeSel === id ? '' : id)}
            >
              {t.nome}
            </button>
          ))}
        </div>
      )}

      {/* ── Chaves manuais ───────────────────────────────────────────────── */}
      {Object.entries(chaves)
        .sort(([, a], [, b]) => (a.criadaEm ?? 0) - (b.criadaEm ?? 0))
        .filter(([, c]) => c.slots && Object.keys(c.slots).length > 0)
        .map(([chaveId, chave]) => (
          <div key={chaveId} className="chave-secao">
            <div className="chave-secao-titulo" style={{ color: 'var(--gold2)', borderColor: 'rgba(201,168,76,0.3)' }}>
              {chave.nome}
            </div>
            <div className="chave-secao-bracket-wrap">
              <ManualBracket
                slots={chave.slots}
                confrontos={confrontos}
                times={times}
                timeSel={timeSel}
              />
            </div>
          </div>
        ))
      }

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
                      <MatchCard key={i} match={m} times={times} small timeSel={timeSel} />
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
              <MatchCard key={i} match={m} times={times} timeSel={timeSel} />
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
              timeSel={timeSel}
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
              timeSel={timeSel}
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
              <MatchCard key={i} match={m} times={times} destaque timeSel={timeSel} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bracket Side ──────────────────────────────────────────────────────────────
function BracketSide({ rounds, labels, times, timeSel }) {
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
            <MatchCard match={match} times={times} timeSel={timeSel} />
          </div>
        ))
      )}
    </div>
  )
}

