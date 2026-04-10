import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useTranslation } from 'react-i18next'
import EloIcon, { ELO_CONFIG } from '../components/EloIcon'
import RoleIcon from '../components/RoleIcon'
import './Resultados.css'

export default function Resultados() {
  const { t } = useTranslation()
  const [captains,   setCaptains]   = useState({})
  const [draftState, setDraftState] = useState(null)
  const [players,    setPlayers]    = useState([])
  const [cupName,    setCupName]    = useState('Copa Inhouse')
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    let n = 0
    const done = () => { if (++n === 3) setLoading(false) }
    const u1 = onValue(ref(db, '/draftSession/captains'), s => { setCaptains(s.val() ?? {}); done() })
    const u2 = onValue(ref(db, '/draftSession/state'),   s => { setDraftState(s.val()); done() })
    const u3 = onValue(ref(db, '/config/settings/cupName'), s => { if (s.exists()) setCupName(s.val()); done() })
    return () => { u1(); u2(); u3() }
  }, [])

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then(r => r.json())
      .then(data => { if (data.ok) setPlayers(data.players) })
      .catch(() => {})
  }, [])

  if (loading) return (
    <main className="page">
      <p style={{ color: 'var(--text2)' }}>{t('resultados.loading')}</p>
    </main>
  )

  const sortedCaptains = Object.entries(captains).sort(([, a], [, b]) => a.seed - b.seed)
  const playerByDiscord = Object.fromEntries(players.map(p => [p.discord, p]))
  const isDone = draftState?.status === 'encerrado'

  // Stats globais
  const totalTeams   = sortedCaptains.length
  const totalPlayers = sortedCaptains.reduce((acc, [, cap]) => acc + Object.keys(cap.roster ?? {}).length + (cap.capitaoNome ? 1 : 0), 0)
  const totalMoedas  = sortedCaptains.reduce((acc, [, cap]) => {
    return acc + Object.values(cap.roster ?? {}).reduce((s, e) => s + (e.preco ?? 0), 0)
  }, 0)

  if (!isDone) {
    return (
      <main className="page">
        <h1 className="page-title">{t('resultados.title')}</h1>
        <div className="res-empty">
          <div style={{ fontSize: '48px' }}>⏳</div>
          <p>{t('resultados.empty')}</p>
          <p style={{ fontSize: '13px', color: 'var(--text2)' }}>{t('resultados.empty_sub')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="res-header">
        <div className="res-trophy">🏆</div>
        <div>
          <h1 className="res-title">{cupName}</h1>
          <p className="res-subtitle">{t('resultados.subtitle')}</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="res-stats">
        <div className="res-stat">
          <div className="res-stat-value">{totalTeams}</div>
          <div className="res-stat-label">{t('resultados.stat_teams')}</div>
        </div>
        <div className="res-stat-divider" />
        <div className="res-stat">
          <div className="res-stat-value">{totalPlayers}</div>
          <div className="res-stat-label">{t('resultados.stat_players')}</div>
        </div>
        <div className="res-stat-divider" />
        <div className="res-stat">
          <div className="res-stat-value">{draftState.rodada ?? '—'}</div>
          <div className="res-stat-label">{t('resultados.stat_rounds')}</div>
        </div>
        <div className="res-stat-divider" />
        <div className="res-stat">
          <div className="res-stat-value">🪙 {totalMoedas}</div>
          <div className="res-stat-label">{t('resultados.stat_spent')}</div>
        </div>
      </div>

      {/* Team grid */}
      <div className="res-grid">
        {sortedCaptains.map(([id, cap]) => (
          <TeamResultCard key={id} cap={cap} playerByDiscord={playerByDiscord} t={t} />
        ))}
      </div>
    </main>
  )
}

function TeamResultCard({ cap, playerByDiscord, t }) {
  const roster     = Object.entries(cap.roster ?? {})
  const totalSlots = roster.length + (cap.capitaoNome ? 1 : 0)
  const totalGasto = roster.reduce((acc, [, e]) => acc + (e.preco ?? 0), 0)

  // Contagem de roles para o breakdown
  const roleCounts = {}
  roster.forEach(([, entry]) => {
    const role = playerByDiscord[entry.discord]?.rolePrimaria
    if (role) roleCounts[role] = (roleCounts[role] ?? 0) + 1
  })

  return (
    <div className="res-team-card" style={{ '--team-color': cap.cor }}>
      <div className="res-team-color-bar" style={{ background: cap.cor }} />

      {/* Header */}
      <div className="res-team-head">
        <div className="res-team-emoji">{cap.emoji}</div>
        <div className="res-team-info">
          <div className="res-team-name" style={{ color: cap.cor }}>{cap.nome}</div>
          {cap.capitaoNome && (
            <div className="res-team-cap">⚑ {cap.capitaoNome}</div>
          )}
        </div>
        <div className="res-team-meta">
          <div className="res-team-slots">{t('resultados.players_count', { n: totalSlots })}</div>
          <div className="res-team-spent">🪙 {totalGasto} {t('resultados.spent')}</div>
        </div>
      </div>

      {/* Role breakdown */}
      {Object.keys(roleCounts).length > 0 && (
        <div className="res-role-row">
          {Object.entries(roleCounts).map(([role, count]) => (
            <div key={role} className="res-role-chip">
              <RoleIcon role={role} size={12} />
              <span>{count}× {role}</span>
            </div>
          ))}
        </div>
      )}

      {/* Roster */}
      <div className="res-roster">
        {/* Capitão */}
        {cap.capitaoNome && (
          <div className="res-roster-row captain">
            <div className="res-roster-left">
              <span className="res-cap-badge">CAP</span>
              <span className="res-roster-name">{cap.capitaoNome}</span>
            </div>
            <div className="res-roster-right">
              {(() => {
                const info = playerByDiscord[cap.capitaoNome]
                return info ? (
                  <>
                    {info.elo && <EloIcon elo={info.elo} size={13} />}
                    {info.elo && (
                      <span className="res-elo-label" style={{ color: ELO_CONFIG[info.elo]?.color }}>
                        {info.elo}
                      </span>
                    )}
                    {info.rolePrimaria && (
                      <span className="res-role-label">{info.rolePrimaria}</span>
                    )}
                  </>
                ) : null
              })()}
              <span className="res-price-tag">—</span>
            </div>
          </div>
        )}

        {/* Jogadores comprados */}
        {roster
          .sort(([, a], [, b]) => (b.preco ?? 0) - (a.preco ?? 0))
          .map(([pid, entry]) => {
            const info     = playerByDiscord[entry.discord]
            const eloColor = ELO_CONFIG[info?.elo]?.color
            return (
              <div key={pid} className="res-roster-row">
                <div className="res-roster-left">
                  <span className="res-roster-name">{entry.discord}</span>
                </div>
                <div className="res-roster-right">
                  {info?.elo && <EloIcon elo={info.elo} size={13} />}
                  {info?.elo && (
                    <span className="res-elo-label" style={{ color: eloColor }}>
                      {info.elo}
                    </span>
                  )}
                  {info?.rolePrimaria && (
                    <span className="res-role-label">{info.rolePrimaria}</span>
                  )}
                  <span className="res-price-tag">🪙{entry.preco}</span>
                </div>
              </div>
            )
          })}
      </div>

      {/* Footer — moedas restantes */}
      <div className="res-team-footer">
        <span style={{ color: 'var(--text2)', fontSize: '12px', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {t('resultados.remaining')}
        </span>
        <span style={{ color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', fontWeight: 700 }}>
          🪙 {cap.moedas}
        </span>
      </div>
    </div>
  )
}
