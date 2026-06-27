import { useState, useEffect, useCallback } from 'react'
import { ref, onValue, set, remove } from 'firebase/database'
import { db } from '../firebase/database'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useModules } from '../hooks/useConfig'
import { useCampeonato } from '../contexts/CampeonatoContext'
import PaginaInativa from '../components/PaginaInativa'
import { teamPath, rodadasPath, confrontosPath, tabelaOverridePath } from '../utils/campeonatoPaths'
import TeamIcon from '../components/TeamIcon'
import {
  calcularClassificacao, calcularPontos,
  STATUS_CONFRONTO, TIPO_CONFRONTO,
  SLOT_LABEL, dataDoSlot, formatarResultado, PONTUACAO_PADRAO, baseSlotKey,
} from '../utils/scheduling'
import './Tabela.css'

// Reordena a classificação aplicando posições manuais.
// Times com posicaoManual definida vão pra slot N-1 (1-indexed → 0-indexed);
// os demais preenchem as posições vazias mantendo a ordem calculada.
// Em caso de conflito (2 times pedindo a mesma posição), o que vier primeiro
// fica no slot; o outro cai pra lista de "sem override".
function aplicarOverridesDePosicao(classificacao, overrides) {
  const n = classificacao.length
  if (!n || !overrides || !Object.keys(overrides).length) return classificacao

  const slots = new Array(n).fill(null)
  const semOverride = []

  for (const entry of classificacao) {
    const pos = overrides[entry.id]?.posicaoManual
    if (pos != null && pos >= 1 && pos <= n) {
      const idx = pos - 1
      if (slots[idx] === null) {
        // posicaoManual é uma decisão explícita sobre o empate — limpa a badge pendente
        slots[idx] = { ...entry, posicaoManual: pos, posicaoPendente: false }
      } else {
        semOverride.push(entry)
      }
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

export default function Tabela() {
  const { isAdmin } = useAuth()
  const modules = useModules()
  const { idPublico } = useCampeonato()
  const [rodadas,    setRodadas]    = useState({})
  const [confrontos, setConfrontos] = useState({})
  const [times,      setTimes]      = useState({})
  const [overrides,  setOverrides]  = useState({})
  const [rodadaSel,  setRodadaSel]  = useState('todas')
  const [timeSel,    setTimeSel]    = useState('')

  useEffect(() => onValue(ref(db, rodadasPath(idPublico)),         snap => setRodadas(snap.val()    ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, confrontosPath(idPublico)),      snap => setConfrontos(snap.val() ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, teamPath(idPublico)),            snap => setTimes(snap.val()      ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, tabelaOverridePath(idPublico)),  snap => setOverrides(snap.val()  ?? {})), [idPublico])

  // ── Derivados ──────────────────────────────────────────────────────────────

  const rodadasArr = Object.entries(rodadas).sort(([, a], [, b]) => a.numero - b.numero)

  const confrontosArr = Object.entries(confrontos)
    .filter(([, c]) => rodadaSel === 'todas' || c.rodadaId === rodadaSel)
    .map(([id, c]) => ({ ...c, confrontoId: id }))

  // Para a tabela geral, usamos todos os confrontos realizados (independente da rodada selecionada)
  const todosConfrontos = Object.values(confrontos)

  const teamIds = Object.keys(times)
  const classificacaoBase = calcularClassificacao(teamIds, todosConfrontos)
  const classificacao    = aplicarOverridesDePosicao(classificacaoBase, overrides)

  // Admin grava ou apaga posicaoManual de um time
  const salvarPosicaoManual = useCallback(async (teamId, valor) => {
    const n = parseInt(valor, 10)
    const caminho = `${tabelaOverridePath(idPublico)}/${teamId}`
    if (!valor || Number.isNaN(n) || n < 1) {
      await remove(ref(db, caminho))
    } else {
      await set(ref(db, caminho), { posicaoManual: n })
    }
  }, [idPublico])

  // Confrontos exibidos na seção de partidas (filtrado pela rodada e time selecionados)
  const confrontosExibidos = confrontosArr
    .filter(c => !timeSel || c.timeA === timeSel || c.timeB === timeSel)
    .filter(c =>
      c.status === STATUS_CONFRONTO.REALIZADO   ||
      c.status === STATUS_CONFRONTO.CONFIRMADO  ||
      c.status === STATUS_CONFRONTO.EMPATE_PENDENTE
    )
    .sort((a, b) => {
      const ordem = [STATUS_CONFRONTO.CONFIRMADO, STATUS_CONFRONTO.REALIZADO, STATUS_CONFRONTO.EMPATE_PENDENTE]
      return ordem.indexOf(a.status) - ordem.indexOf(b.status)
    })

  // Últimas 5 partidas por time (para indicador de forma)
  function formaDoTime(teamId) {
    return todosConfrontos
      .filter(c =>
        c.status === STATUS_CONFRONTO.REALIZADO &&
        (c.tipo === TIPO_CONFRONTO.REGULAR || c.tipo === TIPO_CONFRONTO.DESEMPATE) &&
        (c.timeA === teamId || c.timeB === teamId) &&
        c.resultado
      )
      .sort((a, b) => (b.atualizadoEm ?? 0) - (a.atualizadoEm ?? 0))
      .slice(0, 5)
      .map(c => {
        const pts = calcularPontos(c.resultado, PONTUACAO_PADRAO, c.tipo)
        const meuPts = c.timeA === teamId ? pts.timeA : pts.timeB
        const outPts = c.timeA === teamId ? pts.timeB : pts.timeA
        if (meuPts > outPts) return 'V'
        if (meuPts < outPts) return 'D'
        return 'E'
      })
      .reverse() // mais antigo primeiro
  }

  if (!modules.loading && !isAdmin && !modules.campeonatoAtivo) {
    return <PaginaInativa icone="📊" titulo="Classificação em breve" descricao="A tabela de classificação estará disponível quando o campeonato começar." />
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const semDados = classificacao.length === 0

  return (
    <div className="tab-root page">

      <h1 className="page-title">Tabela de Classificação</h1>
      <p className="page-subtitle">Fase regular · Copa Inhouse</p>

      {/* Filtros */}
      <div className="tab-filtros-grupo">
        {rodadasArr.length > 0 && (
          <div className="tab-filtros">
            <button className={`tab-filtro-btn${rodadaSel === 'todas' ? ' ativo' : ''}`} onClick={() => setRodadaSel('todas')}>
              Geral
            </button>
            {rodadasArr.map(([id, r]) => (
              <button key={id} className={`tab-filtro-btn${rodadaSel === id ? ' ativo' : ''}`} onClick={() => setRodadaSel(id)}>
                Rodada {r.numero}
              </button>
            ))}
          </div>
        )}
        {Object.keys(times).length > 0 && (
          <div className="tab-filtros">
            <button className={`tab-filtro-btn${timeSel === '' ? ' ativo' : ''}`} onClick={() => setTimeSel('')}>
              Todos os times
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
      </div>

      {/* Tabela de classificação */}
      {semDados ? (
        <div className="tab-vazio">Nenhuma partida registrada ainda.</div>
      ) : (
        <div className="tab-wrapper">
          <table className="tab-table">
            <thead>
              <tr>
                <th className="tab-th tab-th--pos">#</th>
                <th className="tab-th tab-th--time">Time</th>
                <th className="tab-th tab-th--num" title="Jogos">J</th>
                <th className="tab-th tab-th--num" title="Vitórias">V</th>
                <th className="tab-th tab-th--num" title="Empates">E</th>
                <th className="tab-th tab-th--num" title="Derrotas">D</th>
                <th className="tab-th tab-th--num" title="Saldo">SG</th>
                <th className="tab-th tab-th--pts">Pts</th>
                <th className="tab-th tab-th--forma">Forma</th>
                {isAdmin && <th className="tab-th" style={{ textAlign: 'center', width: 90 }} title="Forçar posição manualmente (override de admin)">Pos. manual</th>}
              </tr>
            </thead>
            <tbody>
              {classificacao.map((entry, idx) => {
                const time = times[entry.id]
                const cor  = time?.cor ?? 'var(--text2)'
                const forma = formaDoTime(entry.id)
                const destaque = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''

                const selecionado = timeSel === entry.id
                return (
                  <tr key={entry.id}
                    className={`tab-tr${destaque ? ` tab-tr--${destaque}` : ''}${selecionado ? ' tab-tr--selecionado' : ''}`}
                    style={selecionado ? { background: (time?.cor ?? 'var(--blue)') + '12', outline: `1px solid ${time?.cor ?? 'var(--blue)'}44` } : {}}
                    onClick={() => setTimeSel(selecionado ? '' : entry.id)}
                  >
                    <td className="tab-td tab-td--pos">
                      <span className={`tab-pos${destaque ? ` tab-pos--${destaque}` : ''}`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="tab-td tab-td--time">
                      <TeamIcon time={time} size={22} style={{ marginRight: 2 }} />
                      <span className="tab-time-nome" style={{ color: cor }}>
                        {time?.nome ?? entry.id}
                      </span>
                      {entry.posicaoPendente && (
                        <span
                          title="Posição pendente — empatado em pontos sem confronto direto resolvido. Desempate MD3 necessário."
                          style={{
                            marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                            padding: '1px 5px', borderRadius: 3,
                            color: 'var(--gold)', background: 'rgba(201,168,76,0.12)',
                            border: '1px solid rgba(201,168,76,0.35)',
                            fontFamily: "'Barlow Condensed', sans-serif",
                          }}
                        >⚖ DESEMPATE</span>
                      )}
                    </td>
                    <td className="tab-td tab-td--num">{entry.jogos}</td>
                    <td className="tab-td tab-td--num tab-td--v">{entry.vitorias}</td>
                    <td className="tab-td tab-td--num">{entry.empates}</td>
                    <td className="tab-td tab-td--num tab-td--d">{entry.derrotas}</td>
                    <td className="tab-td tab-td--num">
                      <span style={{ color: entry.saldo > 0 ? 'var(--green)' : entry.saldo < 0 ? 'var(--red)' : 'var(--text2)' }}>
                        {entry.saldo > 0 ? `+${entry.saldo}` : entry.saldo}
                      </span>
                    </td>
                    <td className="tab-td tab-td--pts">
                      <strong>{entry.pontos}</strong>
                    </td>
                    <td className="tab-td tab-td--forma">
                      <div className="tab-forma">
                        {forma.map((r, i) => (
                          <span key={i} className={`tab-forma-dot tab-forma-dot--${r.toLowerCase()}`} title={r === 'V' ? 'Vitória' : r === 'D' ? 'Derrota' : 'Empate'} />
                        ))}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="tab-td" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          min={1}
                          max={classificacao.length}
                          placeholder="—"
                          defaultValue={overrides[entry.id]?.posicaoManual ?? ''}
                          onBlur={e => salvarPosicaoManual(entry.id, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                          title="Digite uma posição (1-N) e dê Tab/Enter. Vazio = remove o override."
                          style={{
                            width: 50, textAlign: 'center',
                            background: 'var(--bg2)', border: '1px solid var(--border2)',
                            color: 'var(--text)', borderRadius: 4, padding: '3px 6px',
                            fontFamily: "'Barlow', sans-serif", fontSize: 13,
                          }}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Partidas da rodada selecionada */}
      {confrontosExibidos.length > 0 && (
        <div className="tab-partidas">
          <h2 className="tab-partidas-titulo">
            {rodadaSel === 'todas' ? 'Partidas' : `Partidas — Rodada ${rodadas[rodadaSel]?.numero ?? ''}`}
          </h2>
          <div className="tab-partidas-lista">
            {confrontosExibidos.map((c, i) => {
              const tA = times[c.timeA]
              const tB = times[c.timeB]
              const realizado = c.status === STATUS_CONFRONTO.REALIZADO || c.status === STATUS_CONFRONTO.EMPATE_PENDENTE
              const detalheUrl = c.confrontoId ? `/campeonatos/${idPublico}/confronto/${c.confrontoId}` : null
              const dataSlot = c.slot ? dataDoSlot(c.slot, rodadas[c.rodadaId]?.semanaJogos) : null

              return (
                <div key={i}
                  className={`tab-partida${realizado ? ' tab-partida--realizada' : ''}${detalheUrl ? ' tab-partida--clicavel' : ''}`}
                  onClick={detalheUrl ? () => window.open(detalheUrl, '_blank') : undefined}
                  title={detalheUrl ? 'Ver detalhes da partida' : undefined}
                >
                  <div className="tab-partida-time tab-partida-time--a">
                    <TeamIcon time={tA} size={24} style={{ marginRight: 4 }} />
                    <span style={{ color: tA?.cor ?? 'var(--text)' }}>{tA?.nome ?? c.timeA}</span>
                  </div>

                  <div className="tab-partida-centro">
                    {realizado ? (
                      <span className="tab-partida-placar">
                        {c.resultado?.timeA ?? 0}
                        <span className="tab-partida-sep">×</span>
                        {c.resultado?.timeB ?? 0}
                      </span>
                    ) : (
                      <span className="tab-partida-slot">
                        {c.slot ? SLOT_LABEL[baseSlotKey(c.slot)] ?? c.slot : 'A definir'}
                        {dataSlot && <span className="tab-partida-data"> – {dataSlot}</span>}
                      </span>
                    )}
                    <span className="tab-partida-tipo">{c.tipo} · {c.formato}</span>
                    {c.resultado?.tipo && c.resultado.tipo !== 'normal' && (
                      <span className="tab-partida-obs">{formatarResultado(c.resultado, tA?.nome, tB?.nome)}</span>
                    )}
                  </div>

                  <div className="tab-partida-time tab-partida-time--b">
                    <span style={{ color: tB?.cor ?? 'var(--text)' }}>{tB?.nome ?? c.timeB}</span>
                    <TeamIcon time={tB} size={24} style={{ marginLeft: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
