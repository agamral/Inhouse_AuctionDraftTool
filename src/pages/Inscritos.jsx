import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useModules } from '../hooks/useConfig'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { configConteudoPath } from '../utils/campeonatoPaths'
import RoleIcon from '../components/RoleIcon'
import EloIcon, { ELO_CONFIG } from '../components/EloIcon'
import PaginaInativa from '../components/PaginaInativa'
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

const ELO_ORDEM = { Bronze: 1, Prata: 2, Ouro: 3, Platina: 4, Diamante: 5, Mestre: 6 }
const ROLE_ORDEM = { Tank: 1, Offlane: 2, DPS: 3, Healer: 4, Flex: 5, Nenhuma: 6 }
const STATUS_ORDEM = { Titular: 1, Reserva: 2 }

function paisFlag(pais) {
  if (!pais) return '🌎'
  return PAISES_FLAG[pais.toUpperCase()] || '🌎'
}

function sortKey(col, p) {
  switch (col) {
    case 'player':         return (p.discord ?? '').toLowerCase()
    case 'elo':            return ELO_ORDEM[p.elo] ?? 0
    case 'role':           return ROLE_ORDEM[p.rolePrimaria] ?? 99
    case 'roleSecundaria': return ROLE_ORDEM[p.roleSecundaria] ?? 99
    case 'pais':           return (p.pais ?? '').toLowerCase()
    case 'status':         return STATUS_ORDEM[p.titularReserva] ?? 99
    default:               return ''
  }
}

function sortPlayers(players, col, dir) {
  if (!col) return players
  return [...players].sort((a, b) => {
    const ka = sortKey(col, a)
    const kb = sortKey(col, b)
    const cmp = typeof ka === 'number' ? ka - kb : ka.localeCompare(kb)
    return dir === 'asc' ? cmp : -cmp
  })
}

export default function Inscritos() {
  const { t } = useTranslation()
  const { privacidadeAtiva, inscritosAbertos, bannerInscritosAtivo, loading: modulesLoading } = useModules()
  const { isAdmin, capitao } = useAuth()
  const { idPublico } = useCampeonato()
  const [players,     setPlayers]     = useState([])
  const [overrides,   setOverrides]   = useState({})
  const [bannerTexto, setBannerTexto] = useState('')
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [sortCol,     setSortCol]     = useState('')
  const [sortDir,     setSortDir]     = useState('asc')

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

  useEffect(() => {
    if (!idPublico) return
    const unsub = onValue(ref(db, configConteudoPath(idPublico)), (snap) => {
      setBannerTexto(snap.val()?.bannerInscritosTexto ?? '')
    })
    return unsub
  }, [idPublico])

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  if (!modulesLoading && !isAdmin && !capitao && !inscritosAbertos) {
    return <PaginaInativa icone="📋" titulo="Lista em preparação" descricao="A lista de inscritos será aberta pelos organizadores em breve." />
  }

  const COLS = [
    { key: 'player',         sortable: true  },
    { key: 'elo',            sortable: true  },
    { key: 'role',           sortable: true  },
    { key: 'roleSecundaria', sortable: true  },
    { key: 'pais',           sortable: true  },
    { key: 'status',         sortable: true  },
  ]

  const playersOrdenados = sortPlayers(players, sortCol, sortDir)

  return (
    <main className="page">
      <h1 className="page-title">{t('inscritos.title')}</h1>
      <p className="page-subtitle">{t('inscritos.subtitle')}</p>

      {bannerInscritosAtivo && bannerTexto && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          margin: '8px 0 28px',
          padding: '14px 20px',
          background: 'linear-gradient(95deg, rgba(201,168,76,0.10) 0%, rgba(201,168,76,0.04) 100%)',
          border: '1px solid rgba(201,168,76,0.30)',
          borderLeft: '3px solid var(--gold)',
          borderRadius: 8,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>📢</span>
          <span style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            fontSize: 17, color: 'var(--gold2)', lineHeight: 1.3,
            letterSpacing: '0.01em',
          }}>
            {bannerTexto}
          </span>
        </div>
      )}

      {loading && <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Carregando inscritos...</p>}
      {error   && <p style={{ color: 'var(--red)',   fontSize: '14px' }}>{error}</p>}

      {!loading && !error && (
        <>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '16px' }}>
            {players.length} inscrito{players.length !== 1 ? 's' : ''}
            {sortCol && (
              <span style={{ marginLeft: 10, color: 'var(--text3)' }}>
                · ordenado por {t(`inscritos.table.${sortCol}`)} {sortDir === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                  {COLS.map(({ key, sortable }) => {
                    const active = sortCol === key
                    return (
                      <th key={key}
                        onClick={sortable ? () => handleSort(key) : undefined}
                        style={{
                          padding: '8px 12px', textAlign: 'left',
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: '11px', letterSpacing: '0.12em',
                          textTransform: 'uppercase', fontWeight: 600,
                          color: active ? 'var(--gold)' : 'var(--text2)',
                          cursor: sortable ? 'pointer' : 'default',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}>
                        {t(`inscritos.table.${key}`)}
                        {sortable && (
                          <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
                            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {playersOrdenados.map((p, idx) => {
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
                      <td style={{ padding: '12px', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {p.roleSecundaria && p.roleSecundaria !== 'Nenhuma' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <RoleIcon role={p.roleSecundaria} size={18} />{p.roleSecundaria}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text3)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', fontSize: '20px' }}>{paisFlag(p.pais)}</td>
                      <td style={{ padding: '12px' }}>
                        {p.titularReserva === 'Titular' && <span className="badge" style={{ color: 'var(--green)', borderColor: 'rgba(76,175,125,0.35)', background: 'rgba(76,175,125,0.08)' }}>TITULAR</span>}
                        {p.titularReserva === 'Reserva' && <span className="badge" style={{ color: 'var(--text2)' }}>RESERVA</span>}
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
