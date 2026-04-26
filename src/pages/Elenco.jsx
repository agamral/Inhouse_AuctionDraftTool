import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { STATUS_CONFRONTO, TIPO_CONFRONTO } from '../utils/scheduling'
import './Elenco.css'

export default function Elenco() {
  const [teams,      setTeams]      = useState({})
  const [confrontos, setConfrontos] = useState({})

  useEffect(() => onValue(ref(db, '/teams'),      snap => setTeams(snap.val()      ?? {})), [])
  useEffect(() => onValue(ref(db, '/confrontos'), snap => setConfrontos(snap.val() ?? {})), [])

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

  const timesArr = Object.entries(teams)
    .filter(([, t]) => t.fonte !== 'simulacao' || true) // mostra todos por enquanto
    .sort(([, a], [, b]) => {
      // Ordena por vitórias desc, depois nome
      const wlA = calcWL(Object.keys(teams).find(k => teams[k] === a) ?? '')
      const wlB = calcWL(Object.keys(teams).find(k => teams[k] === b) ?? '')
      if (wlB.v !== wlA.v) return wlB.v - wlA.v
      return a.nome.localeCompare(b.nome)
    })

  return (
    <div className="elenco-root page">
      <h1 className="page-title">Elenco dos Times</h1>
      <p className="page-subtitle">Copa Inhouse · Temporada 2025</p>

      {timesArr.length === 0 && (
        <div className="elenco-vazio">
          Os times ainda não foram formados.
        </div>
      )}

      <div className="elenco-grid">
        {timesArr.map(([id, team]) => {
          const { v, d } = calcWL(id)
          const jogadores = team.jogadores ?? []

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

              {/* Roster */}
              {jogadores.length > 0 ? (
                <ul className="elenco-roster">
                  {jogadores.map((j, i) => (
                    <li key={i} className="elenco-player">
                      <span className="elenco-player-nome">
                        {j.isCaptain && <span className="elenco-captain-star">★ </span>}
                        {j.nome}
                      </span>
                      <span className="elenco-player-role">{j.role}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="elenco-sem-roster">Roster a definir</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
