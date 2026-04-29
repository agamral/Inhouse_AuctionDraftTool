import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useModules } from '../hooks/useConfig'
import RoleIcon from '../components/RoleIcon'
import EloIcon, { ELO_CONFIG } from '../components/EloIcon'
import './Inscritos.css'

const PAISES_FLAG = {
  BR: '🇧🇷', AR: '🇦🇷', MX: '🇲🇽', CL: '🇨🇱', CO: '🇨🇴',
  PE: '🇵🇪', VE: '🇻🇪', UY: '🇺🇾', PY: '🇵🇾', BO: '🇧🇴',
  EC: '🇪🇨', US: '🇺🇸', PT: '🇵🇹', ES: '🇪🇸',
  BRASIL: '🇧🇷', BRAZIL: '🇧🇷', BRASA: '🇧🇷',
  ARGENTINA: '🇦🇷',
  'MÉXICO': '🇲🇽', MEXICO: '🇲🇽',
  CHILE: '🇨🇱',
  'COLÔMBIA': '🇨🇴', COLOMBIA: '🇨🇴',
  PERU: '🇵🇪', 'PERÚ': '🇵🇪',
  VENEZUELA: '🇻🇪',
  URUGUAI: '🇺🇾', URUGUAY: '🇺🇾',
  PARAGUAI: '🇵🇾', PARAGUAY: '🇵🇾',
  'BOLÍVIA': '🇧🇴', BOLIVIA: '🇧🇴',
  EQUADOR: '🇪🇨', ECUADOR: '🇪🇨',
  'ESTADOS UNIDOS': '🇺🇸', USA: '🇺🇸',
  PORTUGAL: '🇵🇹',
  ESPANHA: '🇪🇸', SPAIN: '🇪🇸',
  CONGO: '🇨🇩',
  'CAZAQUISTÃO': '🇰🇿', CAZAQUISTAO: '🇰🇿', KAZAKHSTAN: '🇰🇿',
}

function paisFlag(pais) {
  if (!pais) return '🌎'
  return PAISES_FLAG[pais.toUpperCase()] || '🌎'
}

export default function Inscritos() {
  const { t } = useTranslation()
  const { privacidadeAtiva } = useModules()
  const [players,   setPlayers]   = useState([])
  const [overrides, setOverrides] = useState({})
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPlayers(data.players)
        else setError('Erro ao carregar inscritos.')
      })
      .catch(() => setError('Não foi possível conectar ao servidor.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const unsub = onValue(ref(db, '/playerOverrides'), (snap) => {
      setOverrides(snap.val() ?? {})
    })
    return unsub
  }, [])

  return (
    <main className="page">
      <h1 className="page-title">{t('inscritos.title')}</h1>
      <p className="page-subtitle">{t('inscritos.subtitle')}</p>

      {loading && <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Carregando inscritos...</p>}
      {error   && <p style={{ color: 'var(--red)',   fontSize: '14px' }}>{error}</p>}

      {!loading && !error && (
        <>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '16px' }}>
            {players.length} inscrito{players.length !== 1 ? 's' : ''}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                  {['player', 'elo', 'role', 'pais', 'status', 'captain'].map((col) => (
                    <th key={col} style={{
                      padding: '8px 12px', textAlign: 'left',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: '11px', letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600,
                    }}>
                      {t(`inscritos.table.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, idx) => {
                  const ov     = overrides[p.id] ?? {}
                  const eloCfg = ELO_CONFIG[p.elo] ?? {}
                  const nomeExibido = privacidadeAtiva ? `Jogador #${idx + 1}` : p.discord

                  const rowClass = ov.capitao    ? 'inscrito-row inscrito-capitao'
                                 : ov.confirmado ? 'inscrito-row inscrito-confirmado'
                                 : ov.descartado ? 'inscrito-row inscrito-descartado'
                                 : 'inscrito-row'

                  return (
                    <tr key={p.id} className={rowClass}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '18px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                            {ov.capitao && <span className="inscrito-cap-icon" title="Capitão escolhido">⚑</span>}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{nomeExibido}</div>
                            {!privacidadeAtiva && (
                              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>{p.battletag}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span className="badge" style={{ color: eloCfg.color, borderColor: eloCfg.border, background: eloCfg.bg, gap: '5px' }}>
                          <EloIcon elo={p.elo} size={12} />{p.elo}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <RoleIcon role={p.rolePrimaria} size={18} />{p.rolePrimaria}
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontSize: '20px' }}>{paisFlag(p.pais)}</td>
                      <td style={{ padding: '12px' }}>
                        {p.titularReserva === 'Titular' && <span className="badge" style={{ color: 'var(--green)', borderColor: 'rgba(76,175,125,0.35)', background: 'rgba(76,175,125,0.08)' }}>TITULAR</span>}
                        {p.titularReserva === 'Reserva' && <span className="badge" style={{ color: 'var(--text2)' }}>RESERVA</span>}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {p.querCapitao === 'Sim'            && <span className="badge gold">CAP</span>}
                        {p.querCapitao === 'SoSeNecessario' && <span className="badge">SE NEC.</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
