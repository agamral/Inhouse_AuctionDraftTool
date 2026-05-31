import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import { useViewAs } from '../contexts/ViewAsContext'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath } from '../utils/campeonatoPaths'

/**
 * ViewAsBar — barra flutuante visível apenas para admins.
 * Permite simular a perspectiva de qualquer capitão ou do público.
 * Aparece no topo da página quando um modo está ativo, ou como botão
 * minimizado quando está inativo.
 */
export default function ViewAsBar() {
  const { isAdmin } = useAuth()
  const { viewAs, ativar, sair } = useViewAs()
  const { idPublico } = useCampeonato()
  const [teams, setTeams] = useState({})
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!idPublico || !isAdmin) return
    return onValue(ref(db, teamPath(idPublico)), snap => setTeams(snap.val() ?? {}))
  }, [idPublico, isAdmin])

  if (!isAdmin) return null

  const timesArr = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const modoAtivo = viewAs !== null

  // Quando não há modo ativo: botão flutuante discreto no canto
  if (!modoAtivo && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ver site como capitão ou público"
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
          padding: '7px 14px', borderRadius: 20,
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        👁 Ver como...
      </button>
    )
  }

  // Quando modo ativo: banner fixo no topo
  const bgCor = viewAs?.modo === 'capitao'
    ? 'rgba(155,110,232,0.95)'
    : viewAs?.modo === 'publico'
    ? 'rgba(74,158,218,0.95)'
    : 'rgba(30,32,42,0.97)'

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: bgCor,
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      fontFamily: "'Barlow Condensed', sans-serif",
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
        👁 Visualizando como:
      </span>

      {/* Selector de modo */}
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Admin (sair do modo) */}
        <button
          onClick={sair}
          style={{
            padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif",
            background: !modoAtivo ? 'rgba(255,255,255,0.25)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
          }}
        >
          Admin
        </button>

        {/* Público */}
        <button
          onClick={() => ativar('publico')}
          style={{
            padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif",
            background: viewAs?.modo === 'publico' ? 'rgba(255,255,255,0.25)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
          }}
        >
          Público
        </button>

        {/* Capitão — dropdown */}
        <div style={{ position: 'relative' }}>
          <select
            value={viewAs?.modo === 'capitao' ? (viewAs?.teamId ?? '') : ''}
            onChange={e => {
              const teamId = e.target.value
              if (!teamId) return
              const t = teams[teamId]
              if (!t) return
              ativar('capitao', {
                teamId,
                teamData: {
                  teamId,
                  nome:        t.nome,
                  cor:         t.cor,
                  capitaoNome: t.capitaoNome ?? t.nome,
                  campeonatoId: idPublico,
                  ...t,
                },
              })
            }}
            style={{
              padding: '4px 28px 4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif",
              background: viewAs?.modo === 'capitao' ? 'rgba(255,255,255,0.25)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', outline: 'none',
              WebkitAppearance: 'none', appearance: 'none',
            }}
          >
            <option value="" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
              {viewAs?.modo === 'capitao' ? `⚑ ${viewAs.teamData?.capitaoNome ?? viewAs.teamData?.nome}` : '⚑ Capitão...'}
            </option>
            {timesArr.map(([id, t]) => (
              <option key={id} value={id} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
                {t.nome}{t.capitaoNome ? ` (${t.capitaoNome})` : ''}
              </option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#fff', fontSize: 10 }}>▾</span>
        </div>
      </div>

      {/* Status atual */}
      {modoAtivo && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginLeft: 4 }}>
          {viewAs.modo === 'publico' && '🌐 Você está vendo o site como um visitante não-logado'}
          {viewAs.modo === 'capitao' && `⚑ Você está vendo o site como capitão do ${viewAs.teamData?.nome ?? 'time'}`}
        </span>
      )}

      <button
        onClick={() => { sair(); setOpen(false) }}
        style={{
          marginLeft: 'auto', padding: '4px 10px', borderRadius: 4, fontSize: 11,
          cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
          color: '#fff',
        }}
      >
        ✕ Sair
      </button>
    </div>
  )
}
