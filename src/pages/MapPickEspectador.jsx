import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { mapPickPath } from '../utils/campeonatoPaths'
import { MAPAS } from '../utils/mapPool'
import { getFase } from './MapPick'
import TeamIcon from '../components/TeamIcon'

// ── Helpers ───────────────────────────────────────────────────────────────────

function outroTime(t) { return t === 'A' ? 'B' : 'A' }

function getMapTime(s) {
  if (!s?.preferencia || !s?.vencedor) return null
  return s.preferencia === 'mapa' ? s.vencedor : outroTime(s.vencedor)
}

function getTurnoBan(s) {
  const bans    = s?.bans ?? []
  const mapTime = getMapTime(s)
  if (!mapTime) return null
  return bans.length % 2 === 0 ? mapTime : outroTime(mapTime)
}

// Retorna os dados do time { nome, cor, iconUrl } que baniu/escolheu o mapa, ou null
function getMapaEquipe(mapaId, sessao) {
  const bans    = sessao?.bans ?? []
  const jogados = sessao?.jogosJogados ?? []
  const mapTime = getMapTime(sessao)

  const timeData = (t) => t === 'A' ? sessao?.timeA : sessao?.timeB

  // Mapa banido — qual time baniu baseado na ordem
  const banIdx = bans.indexOf(mapaId)
  if (banIdx !== -1 && mapTime) {
    const t = banIdx % 2 === 0 ? mapTime : outroTime(mapTime)
    return timeData(t)
  }

  // Mapa escolhido da partida atual
  if (mapaId === sessao?.mapaEscolhido && !jogados.includes(mapaId) && mapTime) {
    return timeData(mapTime)
  }

  // Mapa escolhido da próxima partida
  const pmt = sessao?.proximaMapTime
  if (mapaId === sessao?.proximaMapa && pmt) {
    return timeData(pmt)
  }

  return null
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { overflow: hidden; }

  @keyframes flashBan {
    0%   { box-shadow: 0 0 0 0   rgba(224,85,85,0.9); }
    40%  { box-shadow: 0 0 0 24px rgba(224,85,85,0.4); }
    100% { box-shadow: 0 0 0 0   rgba(224,85,85,0); }
  }
  @keyframes flashChoose {
    0%   { box-shadow: 0 0 0 0   rgba(76,175,125,0.9); }
    40%  { box-shadow: 0 0 0 28px rgba(76,175,125,0.4); }
    100% { box-shadow: 0 0 0 0   rgba(76,175,125,0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes revealMapa {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes coinGira {
    0%   { transform: scaleX(1);    }
    25%  { transform: scaleX(0.05); }
    50%  { transform: scaleX(1);    }
    75%  { transform: scaleX(0.05); }
    100% { transform: scaleX(1);    }
  }
  @keyframes pulseGold {
    0%,100% { box-shadow: 0 0 0 0 rgba(201,168,76,0.5); }
    50%     { box-shadow: 0 0 0 18px rgba(201,168,76,0); }
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.55; }
  }
`

// ── Moeda espectador ──────────────────────────────────────────────────────────

function MoedaSpec({ resultado, animando }) {
  return (
    <div style={{
      width: 140, height: 140, borderRadius: '50%',
      background: resultado && !animando
        ? 'linear-gradient(135deg, #c9a84c, #f0cc6e)'
        : 'linear-gradient(135deg, #2a2826, #1a1816)',
      border: '5px solid var(--gold)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: animando
        ? 'coinGira 0.28s ease-in-out 5'
        : resultado ? 'pulseGold 2.5s ease-in-out infinite' : 'none',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      transition: 'background 0.5s',
    }}>
      <span style={{
        fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 26,
        color: resultado && !animando ? '#0a0c10' : 'var(--gold)',
        letterSpacing: '0.04em',
      }}>
        {animando ? '?' : resultado === 'cara' ? 'CARA' : resultado === 'coroa' ? 'COROA' : '?'}
      </span>
    </div>
  )
}

// ── Card de mapa ──────────────────────────────────────────────────────────────

function MapaCard({ mapa, estado, equipe }) {
  const banido    = estado === 'banido'   || estado === 'flash_ban'
  const jogado    = estado === 'jogado'
  const escolhido = estado === 'escolhido' || estado === 'flash_choose'
  const flash     = estado === 'flash_ban' || estado === 'flash_choose'

  const equipeCor = equipe?.cor ?? (banido ? '#e05555' : '#4caf7d')

  return (
    <div style={{
      position: 'relative', borderRadius: 10, overflow: 'hidden',
      border: escolhido
        ? `3px solid ${equipeCor}`
        : banido
          ? `3px solid ${equipeCor}88`
          : jogado
            ? '3px solid rgba(201,168,76,0.35)'
            : '3px solid transparent',
      animation: flash
        ? (estado === 'flash_ban' ? 'flashBan 1s ease-out' : 'flashChoose 1.2s ease-out')
        : 'none',
      boxShadow: escolhido ? `0 0 30px ${equipeCor}55` : 'none',
      transition: 'border-color 0.4s, box-shadow 0.4s',
    }}>
      {/* Imagem — grayscale só aqui, não afeta os overlays */}
      <img
        src={mapa.splashUrl} alt={mapa.nome}
        onError={e => { e.target.style.background = '#1a1a1a'; e.target.style.minHeight = '100px' }}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          filter: (banido || jogado) ? 'grayscale(100%) brightness(0.55)' : 'none',
          opacity: banido ? 0.6 : jogado ? 0.5 : 1,
          transition: 'filter 0.5s, opacity 0.5s',
        }}
      />

      {/* Nome do mapa */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '20px 10px 8px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.88))',
        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
        fontSize: 'clamp(10px, 1.1vw, 13px)', letterSpacing: '0.04em',
        color: escolhido ? equipeCor : banido ? `${equipeCor}CC` : jogado ? 'rgba(201,168,76,0.8)' : '#fff',
        textAlign: 'center',
      }}>
        {mapa.nome}
      </div>

      {/* Overlay ban — TeamIcon + X no canto */}
      {banido && equipe && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ position: 'relative' }}>
            <TeamIcon
              time={equipe} size={64} radius={32}
              style={{ boxShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 24px ${equipeCor}55`, border: '2px solid rgba(255,255,255,0.2)' }}
            />
            <div style={{
              position: 'absolute', top: -5, right: -5,
              width: 24, height: 24, borderRadius: '50%',
              background: '#0a0c10', border: `2px solid ${equipeCor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 900, color: equipeCor,
              fontFamily: "'Rajdhani', sans-serif",
            }}>✕</div>
          </div>
        </div>
      )}

      {/* Overlay ban sem equipe (fallback) */}
      {banido && !equipe && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e05555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#fff', fontWeight: 900 }}>✕</div>
        </div>
      )}

      {/* Overlay jogado */}
      {jogado && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(201,168,76,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#0a0c10', boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>⚔</div>
        </div>
      )}

      {/* Overlay escolhido — TeamIcon + ✓ */}
      {escolhido && equipe && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `${equipeCor}12`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ position: 'relative' }}>
            <TeamIcon
              time={equipe} size={64} radius={32}
              style={{ boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 30px ${equipeCor}66`, border: '2px solid rgba(255,255,255,0.2)' }}
            />
            <div style={{
              position: 'absolute', top: -5, right: -5,
              width: 24, height: 24, borderRadius: '50%',
              background: '#0a0c10', border: `2px solid ${equipeCor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 900, color: equipeCor,
              fontFamily: "'Rajdhani', sans-serif",
            }}>✓</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Banner de fase ────────────────────────────────────────────────────────────

function FaseBanner({ sessao, nomeA, nomeB, corA, corB }) {
  const fase     = getFase(sessao)
  const bans     = sessao?.bans ?? []
  const mapTime  = getMapTime(sessao)
  const turnoBan = getTurnoBan(sessao)

  const vencedorNome = sessao?.vencedor === 'A' ? nomeA : nomeB
  const vencedorCor  = sessao?.vencedor === 'A' ? corA  : corB
  const turnoNome    = turnoBan === 'A' ? nomeA : nomeB
  const turnoCor     = turnoBan === 'A' ? corA  : corB
  const mapTimeNome  = mapTime  === 'A' ? nomeA : nomeB
  const mapTimeCor   = mapTime  === 'A' ? corA  : corB
  const perdedorNome = sessao?.perdedorProxima === 'A' ? nomeA : nomeB
  const perdedorCor  = sessao?.perdedorProxima === 'A' ? corA  : corB
  const proxMapTimeNome = sessao?.proximaMapTime === 'A' ? nomeA : nomeB
  const proxMapTimeCor  = sessao?.proximaMapTime === 'A' ? corA  : corB

  const base = {
    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
    textAlign: 'center', animation: 'slideDown 0.35s ease-out',
  }

  if (fase === 'coin') {
    const escolhNome = sessao?.escolhedor === 'A' ? nomeA : nomeB
    const escolhCor  = sessao?.escolhedor === 'A' ? corA  : corB
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text3)' }}>CARA OU COROA</div>
        <div style={{ fontSize: 'clamp(16px, 2vw, 22px)', color: 'var(--text2)' }}>
          <span style={{ color: escolhCor }}>{escolhNome}</span> escolhe o lado
        </div>
      </div>
    )
  }

  if (fase === 'escolhendo') {
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text3)' }}>ESCOLHA DE PRIORIDADE</div>
        <div style={{ fontSize: 'clamp(16px, 2vw, 22px)', color: 'var(--text2)' }}>
          <span style={{ color: vencedorCor }}>{vencedorNome}</span> ganhou — escolhendo entre Mapa e First Pick
        </div>
      </div>
    )
  }

  if (fase === 'banindo') {
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text3)' }}>
          BAN {bans.length + 1} DE 4
        </div>
        <div style={{ fontSize: 'clamp(16px, 2vw, 22px)' }}>
          <span style={{ color: turnoCor, animation: 'pulse 1.5s ease-in-out infinite' }}>{turnoNome}</span>
          <span style={{ color: 'var(--text2)' }}> está banindo</span>
        </div>
      </div>
    )
  }

  if (fase === 'escolhendo_mapa') {
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text3)' }}>ESCOLHA DO MAPA</div>
        <div style={{ fontSize: 'clamp(16px, 2vw, 22px)' }}>
          <span style={{ color: mapTimeCor, animation: 'pulse 1.5s ease-in-out infinite' }}>{mapTimeNome}</span>
          <span style={{ color: 'var(--text2)' }}> está escolhendo o mapa</span>
        </div>
      </div>
    )
  }

  if (fase === 'partida_pronta') {
    const mapaAtual = MAPAS.find(m => m.id === sessao?.mapaEscolhido)
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--green)' }}>MAPA DEFINIDO</div>
        {mapaAtual && <div style={{ fontSize: 'clamp(18px, 2.2vw, 26px)', color: 'var(--gold2)', letterSpacing: '0.05em' }}>{mapaAtual.nome}</div>}
        <div style={{ fontSize: 'clamp(13px, 1.4vw, 16px)', color: 'var(--text2)' }}>
          ⚡ First Pick: <span style={{ color: sessao?.firstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>{sessao?.firstPickTime === 'A' ? nomeA : nomeB}</span>
        </div>
      </div>
    )
  }

  if (fase === 'proxima_escolhendo') {
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text3)' }}>PRÓXIMA PARTIDA</div>
        <div style={{ fontSize: 'clamp(16px, 2vw, 22px)', color: 'var(--text2)' }}>
          <span style={{ color: perdedorCor }}>{perdedorNome}</span> escolhe Mapa ou First Pick
        </div>
      </div>
    )
  }

  if (fase === 'proxima_escolhendo_mapa') {
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text3)' }}>ESCOLHA DO MAPA</div>
        <div style={{ fontSize: 'clamp(16px, 2vw, 22px)' }}>
          <span style={{ color: proxMapTimeCor, animation: 'pulse 1.5s ease-in-out infinite' }}>{proxMapTimeNome}</span>
          <span style={{ color: 'var(--text2)' }}> está escolhendo o mapa</span>
        </div>
      </div>
    )
  }

  if (fase === 'proxima_pronta') {
    const proxMapa = MAPAS.find(m => m.id === sessao?.proximaMapa)
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--green)' }}>PRÓXIMO MAPA</div>
        {proxMapa && <div style={{ fontSize: 'clamp(18px, 2.2vw, 26px)', color: 'var(--gold2)', letterSpacing: '0.05em' }}>{proxMapa.nome}</div>}
        <div style={{ fontSize: 'clamp(13px, 1.4vw, 16px)', color: 'var(--text2)' }}>
          ⚡ First Pick: <span style={{ color: sessao?.proximaFirstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>{sessao?.proximaFirstPickTime === 'A' ? nomeA : nomeB}</span>
        </div>
      </div>
    )
  }

  return null
}

// ── Tira de bans ──────────────────────────────────────────────────────────────

function BanTira({ sessao, pool, nomeA, nomeB, corA, corB }) {
  const bans    = sessao?.bans ?? []
  const mapTime = getMapTime(sessao)

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
      {[0, 1, 2, 3].map(i => {
        const banTeam  = i % 2 === 0 ? mapTime : (mapTime === 'A' ? 'B' : 'A')
        const banMapa  = bans[i] ? pool.find(m => m.id === bans[i]) : null
        const ativo    = i === bans.length && bans.length < 4
        return (
          <div key={i} style={{
            borderRadius: 6, overflow: 'hidden',
            border: `1px solid ${banMapa ? 'rgba(224,85,85,0.5)' : ativo ? 'var(--gold)' : 'var(--border)'}`,
            background: banMapa ? 'rgba(224,85,85,0.08)' : 'var(--bg3)',
            minWidth: 130, opacity: i > bans.length ? 0.3 : 1,
            transition: 'all 0.3s',
          }}>
            <div style={{
              padding: '3px 10px', fontSize: 9,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: banTeam === 'A' ? corA : corB,
              borderBottom: `1px solid ${banMapa ? 'rgba(224,85,85,0.25)' : 'var(--border)'}`,
            }}>
              {banTeam === 'A' ? nomeA : nomeB}
            </div>
            <div style={{ padding: '5px 10px', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: banMapa ? 'var(--red)' : ativo ? 'var(--gold)' : 'var(--text3)', minHeight: 26 }}>
              {banMapa ? `✕ ${banMapa.nome}` : ativo ? '⚡ A banir...' : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapPickEspectador() {
  const [params]  = useSearchParams()
  const sessaoId  = params.get('sessao')
  const { idPublico } = useCampeonato()

  const [sessao, setSessao]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [animCoin, setAnimCoin] = useState(false)
  const [flashMap, setFlashMap] = useState({}) // mapId → 'ban' | 'choose'

  const prevResultadoRef  = useRef(null)
  const prevBansRef       = useRef([])
  const prevMapaRef       = useRef(null)
  const prevProxMapaRef   = useRef(null)
  const animCoinDoneRef   = useRef(false)

  useEffect(() => {
    if (!idPublico || !sessaoId) return
    return onValue(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), snap => {
      const data = snap.val()

      // Coin flip animation
      if (data?.resultado && !prevResultadoRef.current && !animCoinDoneRef.current) {
        animCoinDoneRef.current = true
        setAnimCoin(true)
        setTimeout(() => setAnimCoin(false), 1700)
      }

      // Flash ban animation (novo mapa banido)
      const currBans = data?.bans ?? []
      const prevBans = prevBansRef.current
      if (currBans.length > prevBans.length) {
        const newBan = currBans[currBans.length - 1]
        setFlashMap(prev => ({ ...prev, [newBan]: 'ban' }))
        setTimeout(() => setFlashMap(prev => { const n = { ...prev }; delete n[newBan]; return n }), 1500)
      }

      // Flash choose animation (mapa escolhido)
      if (data?.mapaEscolhido && data.mapaEscolhido !== prevMapaRef.current) {
        const id = data.mapaEscolhido
        setFlashMap(prev => ({ ...prev, [id]: 'choose' }))
        setTimeout(() => setFlashMap(prev => { const n = { ...prev }; delete n[id]; return n }), 2000)
      }
      if (data?.proximaMapa && data.proximaMapa !== prevProxMapaRef.current) {
        const id = data.proximaMapa
        setFlashMap(prev => ({ ...prev, [id]: 'choose' }))
        setTimeout(() => setFlashMap(prev => { const n = { ...prev }; delete n[id]; return n }), 2000)
      }

      prevResultadoRef.current = data?.resultado ?? null
      prevBansRef.current      = currBans
      prevMapaRef.current      = data?.mapaEscolhido ?? null
      prevProxMapaRef.current  = data?.proximaMapa ?? null
      setSessao(data)
      setLoading(false)
    })
  }, [idPublico, sessaoId])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050612', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, letterSpacing: '0.15em' }}>
      CARREGANDO...
    </div>
  )
  if (!sessao) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050612', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13 }}>
      Sessão não encontrada.
    </div>
  )

  const fase    = getFase(sessao)
  const bans    = sessao.bans ?? []
  const jogados = sessao.jogosJogados ?? []
  const pool    = (sessao.pool ?? []).map(id => MAPAS.find(m => m.id === id)).filter(Boolean)

  const nomeA = sessao.timeA?.nome ?? 'Time A'
  const nomeB = sessao.timeB?.nome ?? 'Time B'
  const corA  = sessao.timeA?.cor ?? '#4a9eda'
  const corB  = sessao.timeB?.cor ?? '#e05555'

  // Estado de cada mapa
  function getEstadoMapa(mapaId) {
    if (flashMap[mapaId] === 'ban')    return 'flash_ban'
    if (flashMap[mapaId] === 'choose') return 'flash_choose'
    if (bans.includes(mapaId))         return 'banido'
    if (jogados.includes(mapaId))      return 'jogado'
    const mapaAtual = fase === 'proxima_pronta' || fase === 'proxima_escolhendo_mapa' || fase === 'proxima_escolhendo'
      ? sessao.proximaMapa
      : sessao.mapaEscolhido
    if (mapaId === mapaAtual && !jogados.includes(mapaId)) return 'escolhido'
    return 'normal'
  }

  // Tela de reveal dramático quando encerrado
  if (fase === 'encerrado') {
    const mapaFinal = [...jogados, sessao.mapaEscolhido].filter(Boolean).pop()
    const mapaObj   = pool.find(m => m.id === mapaFinal)
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#050612', display: 'flex', flexDirection: 'column' }}>
        <style>{CSS}</style>
        {mapaObj && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', animation: 'revealMapa 1s ease-out' }}>
            <img src={mapaObj.splashUrl} alt={mapaObj.nome}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.55)' }}
              onError={e => { e.target.style.display = 'none' }} />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            }}>
              <div style={{ fontSize: 'clamp(11px, 1.4vw, 16px)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                SÉRIE ENCERRADA
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 5vw, 64px)', color: '#fff', letterSpacing: '0.06em', textShadow: '0 4px 30px rgba(0,0,0,0.8)', textAlign: 'center' }}>
                {mapaObj.nome}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                {nomeA && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'clamp(14px, 1.8vw, 20px)', color: corA, background: 'rgba(0,0,0,0.5)', padding: '6px 18px', borderRadius: 6, border: `1px solid ${corA}66` }}>{nomeA}</span>}
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'clamp(14px, 1.8vw, 20px)', color: 'rgba(255,255,255,0.4)', alignSelf: 'center' }}>vs</span>
                {nomeB && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'clamp(14px, 1.8vw, 20px)', color: corB, background: 'rgba(0,0,0,0.5)', padding: '6px 18px', borderRadius: 6, border: `1px solid ${corB}66` }}>{nomeB}</span>}
              </div>
            </div>
          </div>
        )}
        {!mapaObj && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontFamily: "'Rajdhani', sans-serif", fontSize: 28, fontWeight: 700 }}>
            SÉRIE ENCERRADA
          </div>
        )}
      </div>
    )
  }

  const isCoin = fase === 'coin' || (animCoin && fase === 'escolhendo')
  const temBans = bans.length > 0 || fase === 'banindo' || fase === 'escolhendo_mapa' || fase.startsWith('proxima') || fase === 'partida_pronta'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#070910',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Barlow Condensed', sans-serif",
    }}>
      <style>{CSS}</style>

      {/* ── Header: times ─── */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {/* Time A */}
        <div style={{
          flex: 1, padding: 'clamp(8px, 1.2vh, 16px) clamp(12px, 2vw, 28px)',
          display: 'flex', alignItems: 'center', gap: 10,
          borderRight: `3px solid ${corA}`,
        }}>
          <div style={{ width: 'clamp(8px, 1vw, 12px)', height: 'clamp(8px, 1vw, 12px)', borderRadius: '50%', background: corA, boxShadow: `0 0 8px ${corA}` }} />
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(16px, 2.2vw, 28px)', color: corA, letterSpacing: '0.04em' }}>{nomeA}</span>
        </div>

        {/* Centro: logo / VS */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 clamp(12px, 2vw, 24px)',
          color: 'rgba(255,255,255,0.2)',
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(14px, 1.6vw, 20px)',
        }}>
          vs
        </div>

        {/* Time B */}
        <div style={{
          flex: 1, padding: 'clamp(8px, 1.2vh, 16px) clamp(12px, 2vw, 28px)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
          borderLeft: `3px solid ${corB}`,
        }}>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(16px, 2.2vw, 28px)', color: corB, letterSpacing: '0.04em' }}>{nomeB}</span>
          <div style={{ width: 'clamp(8px, 1vw, 12px)', height: 'clamp(8px, 1vw, 12px)', borderRadius: '50%', background: corB, boxShadow: `0 0 8px ${corB}` }} />
        </div>
      </div>

      {/* ── Fase banner ─── */}
      <div style={{
        padding: 'clamp(10px, 1.5vh, 20px) 24px',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: isCoin ? 'auto' : 'clamp(60px, 8vh, 100px)',
        flexShrink: 0,
      }}>
        {/* Coin flip */}
        {isCoin ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
            <MoedaSpec resultado={animCoin ? null : sessao.resultado} animando={animCoin} />
            {sessao.resultado && !animCoin && (
              <div style={{ textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(22px, 3vw, 38px)', color: 'var(--gold2)' }}>
                  {sessao.resultado === 'cara' ? '😎 CARA!' : '👑 COROA!'}
                </div>
                {sessao.vencedor && (
                  <div style={{ fontSize: 'clamp(14px, 1.6vw, 18px)', color: 'var(--text2)', marginTop: 6 }}>
                    <span style={{ color: sessao.vencedor === 'A' ? corA : corB, fontWeight: 700 }}>
                      {sessao.vencedor === 'A' ? nomeA : nomeB}
                    </span> ganhou o cara ou coroa!
                  </div>
                )}
              </div>
            )}
            {!sessao.resultado && !animCoin && (
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(16px, 2vw, 22px)', color: 'var(--text2)', animation: 'pulse 1.5s ease-in-out infinite' }}>
                Aguardando escolha...
              </div>
            )}
          </div>
        ) : (
          <FaseBanner sessao={sessao} nomeA={nomeA} nomeB={nomeB} corA={corA} corB={corB} />
        )}
      </div>

      {/* ── Grid de mapas ─── */}
      {!isCoin && (
        <div style={{
          flex: 1, overflow: 'hidden',
          padding: 'clamp(8px, 1.5vh, 18px) clamp(8px, 2vw, 24px)',
          display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1vh, 12px)',
        }}>
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(pool.length, 6)}, 1fr)`,
            gap: 'clamp(5px, 0.8vw, 10px)',
          }}>
            {pool.map(m => (
              <MapaCard
                key={m.id} mapa={m}
                estado={getEstadoMapa(m.id)}
                equipe={getMapaEquipe(m.id, sessao)}
              />
            ))}
          </div>

          {/* Tira de bans */}
          {temBans && sessao.preferencia && (
            <div style={{ flexShrink: 0 }}>
              <BanTira sessao={sessao} pool={pool} nomeA={nomeA} nomeB={nomeB} corA={corA} corB={corB} />
            </div>
          )}
        </div>
      )}

      {/* ── Mapas jogados ─── */}
      {jogados.length > 0 && (
        <div style={{
          flexShrink: 0, padding: '6px 16px',
          display: 'flex', gap: 8, alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>JOGADOS:</span>
          {jogados.map((id, i) => {
            const m = pool.find(x => x.id === id)
            return <span key={i} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(201,168,76,0.7)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 4, padding: '2px 8px' }}>⚔ {m?.nome ?? id}</span>
          })}
        </div>
      )}
    </div>
  )
}
