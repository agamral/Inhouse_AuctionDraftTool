import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useModules } from '../hooks/useConfig'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import PaginaInativa from '../components/PaginaInativa'
import { teamPath, confrontosPath, draftSessionPath } from '../utils/campeonatoPaths'
import { STATUS_CONFRONTO, TIPO_CONFRONTO } from '../utils/scheduling'
import './Elenco.css'

export default function Elenco() {
  const { idPublico } = useCampeonato()
  const { privacidadeAtiva, campeonatoAtivo, loading: modulesLoading } = useModules()
  const { isAdmin } = useAuth()
  const [teams,      setTeams]      = useState({})
  const [confrontos, setConfrontos] = useState({})
  const [captains,   setCaptains]   = useState({})
  const [busca,      setBusca]      = useState('')

  useEffect(() => onValue(ref(db, teamPath(idPublico)),                    snap => setTeams(snap.val()    ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, confrontosPath(idPublico)),              snap => setConfrontos(snap.val() ?? {})), [idPublico])
  useEffect(() => onValue(ref(db, `${draftSessionPath(idPublico)}/captains`), snap => setCaptains(snap.val() ?? {})), [idPublico])

  // Calcula W/L para cada time (só fase regular e desempate)
  function calcWL(teamId) {
    let v = 0, d = 0
    Object.values(confrontos).forEach(c => {
      if (c.status !== STATUS_CONFRONTO.REALIZADO) return
      if (c.tipo === TIPO_CONFRONTO.QUARTAS   ||
          c.tipo === TIPO_CONFRONTO.SEMI       ||
          c.tipo === TIPO_CONFRONTO.FINAL_UP   ||
          c.tipo === TIPO_CONFRONTO.QUARTAS_LO ||
          c.tipo === TIPO_CONFRONTO.SEMI_LO    ||
          c.tipo === TIPO_CONFRONTO.FINAL_LO   ||
          c.tipo === TIPO_CONFRONTO.GRANDE_FINAL) return
      if (!c.resultado) return

      const souA = c.timeA === teamId
      const souB = c.timeB === teamId
      if (!souA && !souB) return

      const { tipo, timeA: gA, timeB: gB } = c.resultado
      if (tipo === 'wo_a') { souA ? v++ : d++ }
      else if (tipo === 'wo_b') { souB ? v++ : d++ }
      else if (tipo === 'duplo_wo') { /* nenhum */ }
      else if (tipo === 'normal') {
        if (gA > gB) { souA ? v++ : d++ }
        else if (gB > gA) { souB ? v++ : d++ }
      }
    })
    return { v, d }
  }

  if (!modulesLoading && !isAdmin && !campeonatoAtivo) {
    return <PaginaInativa icone="👥" titulo="Elenco em preparação" descricao="Os elencos dos times serão publicados quando o campeonato iniciar." />
  }

  const timesArr = Object.entries(teams)
    .filter(([, t]) => t.fonte !== 'simulacao' || true) // mostra todos por enquanto
    .sort(([, a], [, b]) => {
      // Ordena por vitórias desc, depois nome
      const wlA = calcWL(Object.keys(teams).find(k => teams[k] === a) ?? '')
      const wlB = calcWL(Object.keys(teams).find(k => teams[k] === b) ?? '')
      if (wlB.v !== wlA.v) return wlB.v - wlA.v
      return a.nome.localeCompare(b.nome)
    })

  const buscaLower = busca.toLowerCase().trim()
  const timesVisiveis = buscaLower
    ? timesArr.filter(([, team]) =>
        (team.jogadores ?? []).some(j => j.nome?.toLowerCase().includes(buscaLower))
      )
    : timesArr

  return (
    <div className="elenco-root page">
      <h1 className="page-title">Elenco dos Times</h1>
      <p className="page-subtitle">Copa Inhouse · Temporada 2026</p>

      {timesArr.length > 0 && !privacidadeAtiva && (
        <div style={{ marginBottom: '1.5rem', maxWidth: 320 }}>
          <input
            type="text"
            placeholder="🔍 Buscar jogador..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg2)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '9px 14px',
              color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
              fontSize: 14, outline: 'none',
            }}
          />
          {buscaLower && (
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              {timesVisiveis.length === 0
                ? 'Nenhum time encontrado com esse jogador.'
                : `${timesVisiveis.length} time${timesVisiveis.length !== 1 ? 's' : ''} com "${busca}"`
              }
            </p>
          )}
        </div>
      )}

      {timesArr.length === 0 && (
        <div className="elenco-vazio">
          Os times ainda não foram formados.
        </div>
      )}

      <div className="elenco-grid">
        {timesVisiveis.map(([id, team]) => {
          const { v, d } = calcWL(id)
          const jogadoresAll = team.jogadores ?? []

          // Reservas: combina /teams (isReserva=true) com /draftSession/captains/.../reservas
          // deduplicando por nome. Sem isso, foxdarkness aparece 2x quando ainda está
          // no roster como titular E também no bucket de reservas do leilão.
          const capEntry = Object.values(captains).find(c => c.nome === team.nome)
          const reservasFromDraft = capEntry ? Object.values(capEntry.reservas ?? {}) : []

          const reservas = []
          const reservaNomes = new Set()
          jogadoresAll.filter(j => j.isReserva).forEach(j => {
            if (!reservaNomes.has(j.nome)) { reservas.push({ discord: j.nome }); reservaNomes.add(j.nome) }
          })
          reservasFromDraft.forEach(r => {
            if (!reservaNomes.has(r.discord)) { reservas.push(r); reservaNomes.add(r.discord) }
          })

          // Titulares: jogadores que não estão na lista de reservas
          const jogadores = jogadoresAll.filter(j => !reservaNomes.has(j.nome))

          return (
            <div key={id} className="elenco-card" style={{ '--cor': team.cor ?? 'var(--blue)' }}>
              {/* Header */}
              <div className="elenco-card-header">
                <div className="elenco-card-nome">{team.nome}</div>
                <div className="elenco-card-wl">
                  <span className="elenco-v">{v}V</span>
                  <span className="elenco-sep">·</span>
                  <span className="elenco-d">{d}D</span>
                </div>
              </div>

              {/* Titulares */}
              {jogadores.length > 0 ? (
                <ul className="elenco-roster" style={{ background: 'rgba(201,168,76,0.03)' }}>
                  {jogadores.map((j, i) => {
                    const destaque = !privacidadeAtiva && buscaLower && j.nome?.toLowerCase().includes(buscaLower)
                    return (
                      <li key={i} className="elenco-player" style={destaque ? { background: 'rgba(201,168,76,0.1)', borderRadius: 4, margin: '1px 0' } : {}}>
                        <span className="elenco-player-nome" style={destaque ? { color: 'var(--gold2)', fontWeight: 700 } : {}}>
                          {j.isCaptain && <span className="elenco-captain-star">★ </span>}
                          {privacidadeAtiva ? `Jogador #${i + 1}` : j.nome}
                        </span>
                        <span className="elenco-player-role">{j.role}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="elenco-sem-roster">Roster a definir</p>
              )}

              {/* Reservas */}
              {reservas.length > 0 && (
                <>
                  <div style={{ padding: '3px 12px 2px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
                    Reservas
                  </div>
                  <ul className="elenco-roster" style={{ background: 'rgba(138,134,128,0.04)' }}>
                    {reservas.map((r, i) => (
                      <li key={i} className="elenco-player" style={{ opacity: 0.75 }}>
                        <span className="elenco-player-nome">
                          {privacidadeAtiva ? `Reserva #${i + 1}` : r.discord}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
