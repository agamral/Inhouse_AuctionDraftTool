import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useModules } from '../hooks/useConfig'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { configConteudoPath, playerOverridesPath, teamPath } from '../utils/campeonatoPaths'
import RoleIcon from '../components/RoleIcon'
import EloIcon, { ELO_CONFIG } from '../components/EloIcon'
import PaginaInativa from '../components/PaginaInativa'
import './Inscritos.css'

const LINGUA_ORDER    = { pt: 1, es: 2, en: 3 }
const LINGUA_FLAG_CDN = {
  pt: 'https://flagcdn.com/br.svg',
  es: 'https://flagcdn.com/es.svg',
  en: 'https://flagcdn.com/us.svg',
}

function parseLinguas(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(l => l.trim().toLowerCase()).filter(Boolean)
  return String(raw).split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
}

function LinguasBadge({ linguas }) {
  const list = parseLinguas(linguas)
  if (!list.length) return <span style={{ color: 'var(--text3)' }}>—</span>
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {list.map(l => {
        const src = LINGUA_FLAG_CDN[l]
        return src ? (
          <img key={l} src={src} alt={l.toUpperCase()} title={l.toUpperCase()}
            style={{ width: 22, height: 15, objectFit: 'cover', borderRadius: 2, display: 'block' }}
            onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { textContent: l.toUpperCase(), style: 'font-size:10px;color:var(--text2)' })) }}
          />
        ) : (
          <span key={l} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: 'var(--text2)' }}>
            {l.toUpperCase()}
          </span>
        )
      })}
    </div>
  )
}

const PAISES_CDN = {
  BR: 'br', AR: 'ar', MX: 'mx', CL: 'cl', CO: 'co',
  PE: 'pe', VE: 've', UY: 'uy', PY: 'py', BO: 'bo',
  EC: 'ec', US: 'us', PT: 'pt', ES: 'es',
  BRASIL: 'br', BRAZIL: 'br', BRASA: 'br',
  ARGENTINA: 'ar',
  'MÉXICO': 'mx', MEXICO: 'mx',
  CHILE: 'cl',
  'COLÔMBIA': 'co', COLOMBIA: 'co',
  PERU: 'pe', 'PERÚ': 'pe',
  VENEZUELA: 've',
  URUGUAI: 'uy', URUGUAY: 'uy',
  PARAGUAI: 'py', PARAGUAY: 'py',
  'BOLÍVIA': 'bo', BOLIVIA: 'bo',
  EQUADOR: 'ec', ECUADOR: 'ec',
  'ESTADOS UNIDOS': 'us', USA: 'us',
  PORTUGAL: 'pt',
  ESPANHA: 'es', SPAIN: 'es',
  CONGO: 'cd',
  'CAZAQUISTÃO': 'kz', CAZAQUISTAO: 'kz', KAZAKHSTAN: 'kz',
}

function PaisFlag({ pais }) {
  if (!pais) return <span style={{ color: 'var(--text3)' }}>—</span>
  const code = PAISES_CDN[pais.toUpperCase()]
  if (!code) return <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>{pais}</span>
  return (
    <img src={`https://flagcdn.com/${code}.svg`} alt={pais} title={pais}
      style={{ width: 24, height: 16, objectFit: 'cover', borderRadius: 2, display: 'block' }}
    />
  )
}

const ELO_ORDEM = {
  Bronze: 1, Prata: 2, Ouro: 3, Platina: 4, Diamante: 5, Mestre: 6,
  'Grão Mestre': 7, 'Mestre / Grão Mestre': 7,
}
const ROLE_ORDEM = { Tank: 1, Offlane: 2, DPS: 3, Healer: 4, Flex: 5, Nenhuma: 6 }
const STATUS_ORDEM = { Titular: 1, Reserva: 2 }



function sortKey(col, p) {
  switch (col) {
    case 'player':         return (p.discord ?? '').toLowerCase()
    case 'elo':            return ELO_ORDEM[p.elo] ?? 0
    case 'role':           return ROLE_ORDEM[p.rolePrimaria] ?? 99
    case 'roleSecundaria': return ROLE_ORDEM[p.roleSecundaria] ?? 99
    case 'pais':           return (p.pais ?? '').toLowerCase()
    case 'linguas':        return LINGUA_ORDER[parseLinguas(p.linguas)[0]] ?? 99
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
  const { privacidadeAtiva, inscritosAbertos, bannerInscritosAtivo, capitaesPublicos, loading: modulesLoading } = useModules()
  const { isAdmin, capitao } = useAuth()
  const { idPublico } = useCampeonato()
  const [players,     setPlayers]     = useState([])
  const [overrides,   setOverrides]   = useState({})
  const [teams,       setTeams]       = useState({})
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
    if (!idPublico) return
    const unsub = onValue(ref(db, playerOverridesPath(idPublico)), (snap) => {
      setOverrides(snap.val() ?? {})
    })
    return unsub
  }, [idPublico])

  useEffect(() => {
    if (!idPublico) return
    const unsub = onValue(ref(db, configConteudoPath(idPublico)), (snap) => {
      setBannerTexto(snap.val()?.bannerInscritosTexto ?? '')
    })
    return unsub
  }, [idPublico])

  useEffect(() => {
    if (!idPublico) return
    const unsub = onValue(ref(db, teamPath(idPublico)), (snap) => setTeams(snap.val() ?? {}))
    return unsub
  }, [idPublico])

  // Lookup: playerId/discord → { teamNome, teamCor, isReserva, isCaptain }
  const playerAssignment = (() => {
    const map = new Map()
    Object.values(teams).forEach(t => {
      (t.jogadores ?? []).forEach(j => {
        const entry = { teamNome: t.nome, teamCor: t.cor, isReserva: !!j.isReserva, isCaptain: !!j.isCaptain }
        if (j.playerId) map.set(`id:${j.playerId}`, entry)
        if (j.nome)     map.set(`nome:${j.nome}`,    entry)
      })
    })
    return (p) => map.get(`id:${p.id}`) ?? map.get(`nome:${p.discord}`) ?? null
  })()

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
    { key: 'linguas',        sortable: true  },
    { key: 'status',         sortable: true  },
  ]

  // Admins veem todos (com estilo riscado); público não vê descartados
  const playersVisiveis  = isAdmin
    ? players
    : players.filter(p => !overrides[p.id]?.descartado)
  const playersOrdenados = sortPlayers(playersVisiveis, sortCol, sortDir)

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
            {playersVisiveis.length} inscrito{playersVisiveis.length !== 1 ? 's' : ''}{isAdmin && playersVisiveis.length !== players.length && <span style={{ color: 'var(--red)', marginLeft: 6 }}>({players.length - playersVisiveis.length} descartado{players.length - playersVisiveis.length !== 1 ? 's' : ''} visível{players.length - playersVisiveis.length !== 1 ? 'eis' : ''} só para admins)</span>}
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

                  const rowClass = (ov.capitao && (isAdmin || capitaesPublicos)) ? 'inscrito-row inscrito-capitao'
                                 : ov.confirmado ? 'inscrito-row inscrito-confirmado'
                                 : ov.descartado ? 'inscrito-row inscrito-descartado'
                                 : 'inscrito-row'

                  return (
                    <tr key={p.id} className={rowClass}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '18px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                            {ov.capitao && (isAdmin || capitaesPublicos) && <span className="inscrito-cap-icon" title="Capitão escolhido">⚑</span>}
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
                      <td style={{ padding: '12px' }}><PaisFlag pais={p.pais} /></td>
                      <td style={{ padding: '12px' }}><LinguasBadge linguas={p.linguas} /></td>
                      <td style={{ padding: '12px' }}>
                        {(() => {
                          const a = playerAssignment(p)
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                              {a ? (
                                <span className="badge" style={{
                                  color: a.teamCor ?? 'var(--text)',
                                  borderColor: (a.teamCor ?? 'var(--border2)') + '55',
                                  background: (a.teamCor ?? 'var(--bg2)') + '14',
                                  display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                  {a.isCaptain && <span style={{ color: 'var(--gold)' }}>★</span>}
                                  {a.teamNome}
                                  {a.isReserva && (
                                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 2, color: 'var(--purple)', background: 'rgba(155,110,232,0.18)', border: '1px solid rgba(155,110,232,0.4)', letterSpacing: '0.06em', fontWeight: 700 }}>RESERVA</span>
                                  )}
                                </span>
                              ) : (
                                <>
                                  {p.titularReserva === 'Titular' && <span className="badge" style={{ color: 'var(--green)', borderColor: 'rgba(76,175,125,0.35)', background: 'rgba(76,175,125,0.08)' }}>TITULAR</span>}
                                  {p.titularReserva === 'Reserva' && <span className="badge" style={{ color: 'var(--text2)' }}>RESERVA</span>}
                                </>
                              )}
                            </div>
                          )
                        })()}
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
