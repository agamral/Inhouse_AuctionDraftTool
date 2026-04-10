import { useState, useEffect, useMemo } from 'react'
import { ref, onValue, set, remove } from 'firebase/database'
import { db } from '../firebase/database'
import RoleIcon from './RoleIcon'
import EloIcon, { ELO_CONFIG } from './EloIcon'

const CAPITAO_LABEL = {
  Sim:            { text: 'Quer cap',   color: 'var(--gold)',  border: 'rgba(201,168,76,0.35)'  },
  SoSeNecessario: { text: 'Se nec.',    color: 'var(--text2)', border: 'var(--border)'           },
  Nao:            { text: null,         color: null,           border: null                       },
}

const FILTERS = ['todos', 'confirmados', 'descartados', 'pendentes', 'capitaes']
const FILTER_LABELS = {
  todos: 'Todos', confirmados: 'Confirmados', descartados: 'Descartados',
  pendentes: 'Pendentes', capitaes: 'Capitães',
}

export default function AdminPlayersSection() {
  const [players, setPlayers]     = useState([])
  const [overrides, setOverrides] = useState({})
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('todos')
  const [search, setSearch]       = useState('')

  // Carrega jogadores do Sheets
  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setPlayers(data.players) })
      .finally(() => setLoading(false))
  }, [])

  // Escuta overrides do Firebase em tempo real
  useEffect(() => {
    const unsub = onValue(ref(db, '/playerOverrides'), (snap) => {
      setOverrides(snap.val() ?? {})
    })
    return unsub
  }, [])

  async function setOverride(playerId, field, value) {
    const current = overrides[playerId] ?? {}
    const updated = { ...current, [field]: value }
    await set(ref(db, `/playerOverrides/${playerId}`), updated)
  }

  async function toggleConfirm(playerId) {
    const ov = overrides[playerId] ?? {}
    if (ov.descartado) {
      await setOverride(playerId, 'descartado', false)
    }
    await setOverride(playerId, 'confirmado', !ov.confirmado)
  }

  async function toggleDiscard(playerId) {
    const ov = overrides[playerId] ?? {}
    if (ov.confirmado) {
      await setOverride(playerId, 'confirmado', false)
    }
    await setOverride(playerId, 'descartado', !ov.descartado)
  }

  async function toggleCapitao(playerId) {
    const ov = overrides[playerId] ?? {}
    await setOverride(playerId, 'capitao', !ov.capitao)
  }

  const filtered = useMemo(() => {
    return players.filter((p) => {
      const ov = overrides[p.id] ?? {}
      const matchFilter =
        filter === 'todos'       ? true :
        filter === 'confirmados' ? ov.confirmado :
        filter === 'descartados' ? ov.descartado :
        filter === 'pendentes'   ? (!ov.confirmado && !ov.descartado) :
        filter === 'capitaes'    ? ov.capitao :
        true
      const matchSearch = !search || p.discord.toLowerCase().includes(search.toLowerCase()) || p.battletag.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
  }, [players, overrides, filter, search])

  const stats = useMemo(() => ({
    total:       players.length,
    confirmados: players.filter((p) => overrides[p.id]?.confirmado).length,
    descartados: players.filter((p) => overrides[p.id]?.descartado).length,
    pendentes:   players.filter((p) => !overrides[p.id]?.confirmado && !overrides[p.id]?.descartado).length,
    capitaes:    players.filter((p) => overrides[p.id]?.capitao).length,
  }), [players, overrides])

  return (
    <div className="admin-section admin-players-section">
      <div className="admin-section-title">Gestão de Jogadores</div>

      {/* Stats */}
      <div className="ap-stats">
        <StatBadge label="Total"       value={stats.total}       />
        <StatBadge label="Confirmados" value={stats.confirmados} color="var(--green)"  />
        <StatBadge label="Pendentes"   value={stats.pendentes}   color="var(--gold)"   />
        <StatBadge label="Descartados" value={stats.descartados} color="var(--red)"    />
        <StatBadge label="Capitães"    value={stats.capitaes}    color="var(--purple)" />
      </div>

      {/* Filtros + busca */}
      <div className="ap-toolbar">
        <div className="ap-filters">
          {FILTERS.map((f) => (
            <button key={f} className={`ap-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <input
          className="sa-input"
          placeholder="Buscar jogador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '200px' }}
        />
      </div>

      {/* Lista */}
      {loading ? (
        <p style={{ padding: '16px 18px', color: 'var(--text2)', fontSize: '13px' }}>Carregando jogadores...</p>
      ) : filtered.length === 0 ? (
        <p style={{ padding: '16px 18px', color: 'var(--text2)', fontSize: '13px' }}>Nenhum jogador encontrado.</p>
      ) : (
        <div className="ap-list">
          {filtered.map((p) => {
            const ov     = overrides[p.id] ?? {}
            const eloCfg = ELO_CONFIG[p.elo] ?? {}
            const capInfo = CAPITAO_LABEL[p.querCapitao]

            return (
              <div key={p.id} className={`ap-row ${ov.confirmado ? 'ap-confirmed' : ov.descartado ? 'ap-discarded' : ''}`}>

                {/* Info */}
                <div className="ap-player-info">
                  <div className="ap-player-name">{p.discord}</div>
                  <div className="ap-player-meta">
                    <span style={{ color: eloCfg.color, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <EloIcon elo={p.elo} size={11} />{p.elo}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text2)', fontSize: '12px' }}>
                      <RoleIcon role={p.rolePrimaria} size={13} />{p.rolePrimaria}
                    </span>
                    {capInfo?.text && (
                      <span style={{ fontSize: '11px', color: capInfo.color, border: `1px solid ${capInfo.border}`, borderRadius: '4px', padding: '1px 6px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.05em' }}>
                        {capInfo.text}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="ap-actions">
                  <button
                    className={`ap-btn ap-btn-cap ${ov.capitao ? 'active' : ''}`}
                    onClick={() => toggleCapitao(p.id)}
                    title={ov.capitao ? 'Remover como capitão' : 'Marcar como capitão'}
                  >
                    ⚑ {ov.capitao ? 'Capitão' : 'Cap?'}
                  </button>
                  <button
                    className={`ap-btn ap-btn-confirm ${ov.confirmado ? 'active' : ''}`}
                    onClick={() => toggleConfirm(p.id)}
                  >
                    {ov.confirmado ? '✓ Confirmado' : 'Confirmar'}
                  </button>
                  <button
                    className={`ap-btn ap-btn-discard ${ov.descartado ? 'active' : ''}`}
                    onClick={() => toggleDiscard(p.id)}
                  >
                    {ov.descartado ? '✗ Descartado' : 'Descartar'}
                  </button>
                </div>

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatBadge({ label, value, color }) {
  return (
    <div className="ap-stat">
      <span className="ap-stat-value" style={{ color: color ?? 'var(--text)' }}>{value}</span>
      <span className="ap-stat-label">{label}</span>
    </div>
  )
}
