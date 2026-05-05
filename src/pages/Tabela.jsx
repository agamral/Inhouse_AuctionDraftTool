import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import { useModules } from '../hooks/useConfig'
import { useCampeonato } from '../contexts/CampeonatoContext'
import PaginaInativa from '../components/PaginaInativa'
import { teamPath, rodadasPath, confrontosPath } from '../utils/campeonatoPaths'
import {
  calcularClassificacao, calcularPontos,
  STATUS_CONFRONTO, TIPO_CONFRONTO,
  SLOT_LABEL, formatarResultado, PONTUACAO_PADRAO,
} from '../utils/scheduling'
import './Tabela.css'

export default function Tabela() {
  const { isAdmin } = useAuth()
  const modules = useModules()
  const { idPublico } = useCampeonato()
  const [rodadas,    setRodadas]    = useState({})
  const [confrontos, setConfrontos] = useState({})
  const [times,      setTimes]      = useState({})
  const [rodadaSel,  setRodadaSel]  = useState('todas')
  const [timeSel,    setTimeSel]    = useState('')

  useEffect(() => onValue(ref(db, rodadasPath(idPublico)),    snap => setRodadas(snap.val()    ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, confrontosPath(idPublico)), snap => setConfrontos(snap.val() ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, teamPath(idPublico)),       snap => setTimes(snap.val()      ?? {})), [idPublico])

  // ── Derivados ──────────────────────────────────────────────────────────────

  const rodadasArr = Object.entries(rodadas).sort(([, a], [, b]) => a.numero - b.numero)

  const confrontosArr = Object.values(confrontos).filter(c => {
    if (rodadaSel === 'todas') return true
    return c.rodadaId === rodadaSel
  })

  // Para a tabela geral, usamos todos os confrontos realizados (independente da rodada selecionada)
  const todosConfrontos = Object.values(confrontos)

  const teamIds = Object.keys(times)
  const classificacao = calcularClassificacao(teamIds, todosConfrontos)

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

  if (!isAdmin && !modules.campeonatoAtivo) {
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
                      <span className="tab-time-dot" style={{ background: cor }} />
                      <span className="tab-time-nome" style={{ color: cor }}>
                        {time?.nome ?? entry.id}
                      </span>
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

              return (
                <div key={i} className={`tab-partida${realizado ? ' tab-partida--realizada' : ''}`}>
                  <div className="tab-partida-time tab-partida-time--a">
                    <span className="tab-partida-dot" style={{ background: tA?.cor }} />
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
                        {c.slot ? SLOT_LABEL[c.slot] ?? c.slot : 'A definir'}
                      </span>
                    )}
                    <span className="tab-partida-tipo">{c.tipo} · {c.formato}</span>
                    {c.resultado?.tipo && c.resultado.tipo !== 'normal' && (
                      <span className="tab-partida-obs">{formatarResultado(c.resultado)}</span>
                    )}
                  </div>

                  <div className="tab-partida-time tab-partida-time--b">
                    <span style={{ color: tB?.cor ?? 'var(--text)' }}>{tB?.nome ?? c.timeB}</span>
                    <span className="tab-partida-dot" style={{ background: tB?.cor }} />
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
