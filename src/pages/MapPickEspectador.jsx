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

  const getResultados = () => {
    const r = sessao?.resultados
    return Array.isArray(r) ? r : Object.values(r ?? {})
  }

  // Mapa banido — qual time baniu baseado na ordem
  const banIdx = bans.indexOf(mapaId)
  if (banIdx !== -1 && mapTime) {
    const t = banIdx % 2 === 0 ? mapTime : outroTime(mapTime)
    return timeData(t)
  }

  // Mapa jogado (histórico) — quem escolheu guardado em resultados
  if (jogados.includes(mapaId)) {
    const resultado = getResultados().find(r => r.mapaId === mapaId)
    if (resultado?.mapaEscolhidoPor) return timeData(resultado.mapaEscolhidoPor)
    return null
  }

  // Mapa escolhido da partida atual
  if (mapaId === sessao?.mapaEscolhido && mapTime) {
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
  /* Oculta navbar e footer para tela cheia do espectador */
  nav, footer, .navbar { display: none !important; }

  /* Chase lights — 3 setas que pulsam em sequência dando ilusão de movimento */
  @keyframes arrowChase {
    0%, 100% { opacity: 0.08; }
    40%      { opacity: 1; }
  }

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
  @keyframes revealOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes revealArtIn {
    from { opacity: 0; transform: scale(1.04); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes revealInfoIn {
    from { opacity: 0; transform: translateX(48px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes revealTitleIn {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
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
              background: '#e05555', border: '2px solid rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 900, color: '#fff',
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
              background: '#4caf7d', border: '2px solid rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 900, color: '#fff',
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

// ── Tela de vencedor da partida ───────────────────────────────────────────────

function VencedorScreen({ vencedor, onDone }) {
  const [phase, setPhase] = useState('in') // 'in' → 'show' → 'out'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 80)
    const t2 = setTimeout(() => setPhase('out'),  4800)
    const t3 = setTimeout(onDone, 5500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, []) // eslint-disable-line

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#050612',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28,
      opacity: phase === 'show' ? 1 : 0,
      transition: 'opacity 0.55s ease-out',
    }}>
      <style>{CSS}</style>
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
        fontSize: 'clamp(11px, 1.2vw, 14px)', letterSpacing: '0.35em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)',
      }}>
        VENCEDOR DA PARTIDA
      </div>

      <TeamIcon
        time={vencedor.data}
        size={Math.min(window.innerHeight * 0.18, 140)}
        radius={16}
        style={{ boxShadow: `0 0 40px ${vencedor.cor}55`, border: `3px solid ${vencedor.cor}66` }}
      />

      <div style={{
        fontFamily: "'Rajdhani', sans-serif", fontWeight: 900,
        fontSize: 'clamp(42px, 8vw, 96px)',
        color: vencedor.cor, lineHeight: 1,
        textShadow: `0 0 60px ${vencedor.cor}66`,
        letterSpacing: '0.02em',
      }}>
        {vencedor.nome}
      </div>
    </div>
  )
}

// ── Tela de reveal do mapa ────────────────────────────────────────────────────

function MapRevealScreen({ mapa, mapTimeNome, mapTimeCor, mapTimeData, onDismiss }) {
  const [vis, setVis] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVis(true), 40)
    return () => clearTimeout(t)
  }, [])

  return (
    <div onClick={onDismiss} style={{
      position: 'fixed', inset: 0, zIndex: 9999, cursor: 'pointer',
      display: 'flex',
      opacity: vis ? 1 : 0,
      transition: 'opacity 0.5s ease-out',
    }}>
      <style>{CSS}</style>

      {/* Arte do mapa — lado esquerdo (55%) */}
      <div style={{
        flex: '0 0 55%', position: 'relative', overflow: 'hidden',
        animation: vis ? 'revealArtIn 0.9s ease-out' : 'none',
      }}>
        <img
          src={mapa.splashUrl} alt={mapa.nome}
          onError={e => { e.target.style.background = '#0a0c10' }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
        />
        {/* Gradiente blend direita */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 40%, rgba(5,6,18,0.7) 70%, #050612 100%)' }} />
        {/* Gradiente blend inferior — para o overlay do time */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,6,18,0.95) 0%, rgba(5,6,18,0.6) 18%, transparent 35%)' }} />

        {/* Overlay do time no quarto inferior da arte */}
        {mapTimeNome && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '28%',
            display: 'flex', alignItems: 'center',
            padding: '0 clamp(20px, 3vw, 48px)',
            gap: 'clamp(12px, 1.5vw, 20px)',
            animation: vis ? 'revealTitleIn 0.7s ease-out 0.7s both' : 'none',
          }}>
            {/* TeamIcon */}
            {mapTimeData && (
              <TeamIcon
                time={mapTimeData}
                size={Math.round(window.innerHeight * 0.09)}
                radius={8}
                style={{ flexShrink: 0, boxShadow: `0 0 24px ${mapTimeCor}66`, border: `2px solid ${mapTimeCor}66` }}
              />
            )}
            <div>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: 'clamp(9px, 0.85vw, 11px)', letterSpacing: '0.2em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)', marginBottom: 4,
              }}>
                ESCOLHEU O MAPA
              </div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif", fontWeight: 900,
                fontSize: 'clamp(22px, 3.2vw, 48px)',
                color: mapTimeCor, lineHeight: 1,
                textShadow: `0 2px 20px ${mapTimeCor}66`,
              }}>
                {mapTimeNome}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Informações — lado direito (45%) */}
      <div style={{
        flex: 1, background: '#050612',
        display: 'flex', flexDirection: 'column',
        padding: 'clamp(20px,3.5vh,44px) clamp(20px,3vw,44px)',
        animation: vis ? 'revealInfoIn 0.8s ease-out 0.2s both' : 'none',
      }}>

        {/* Texto — altura fixa baseada em conteúdo, não em flex */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(8px,1.3vh,14px)' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            fontSize: 'clamp(9px, 1vw, 11px)', letterSpacing: '0.3em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)',
          }}>
            MAPA SELECIONADO
          </div>

          <div style={{ animation: vis ? 'revealTitleIn 0.7s ease-out 0.3s both' : 'none' }}>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 900,
              fontSize: 'clamp(30px, 5.5vw, 72px)',
              color: '#fff', lineHeight: 0.88, letterSpacing: '-0.01em',
            }}>
              {mapa.nome}
            </div>
          </div>

          {mapa.objetivo && (
            <div style={{ animation: vis ? 'revealTitleIn 0.7s ease-out 0.42s both' : 'none' }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(8px, 0.8vw, 10px)', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
                OBJETIVO
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(17px, 2.2vw, 28px)', color: 'var(--gold2)' }}>
                {mapa.objetivo}
              </div>
            </div>
          )}

          {mapa.descricao && (
            <div style={{ animation: vis ? 'revealTitleIn 0.7s ease-out 0.54s both' : 'none' }}>
              <p style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 1.15vw, 14px)', color: 'rgba(226,221,214,0.65)', lineHeight: 1.55, margin: 0 }}>
                {mapa.descricao}
              </p>
            </div>
          )}
        </div>

        {/* Overhead — altura fixa em vh para ser sempre consistente */}
        {mapa.layoutUrl && (
          <div style={{
            height: '46vh', flexShrink: 0,
            marginTop: 'clamp(10px,1.8vh,20px)',
            animation: vis ? 'revealTitleIn 0.7s ease-out 0.68s both' : 'none',
          }}>
            <img
              src={mapa.layoutUrl} alt={`Layout — ${mapa.nome}`}
              onError={e => { e.target.parentElement.style.display = 'none' }}
              style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom left', borderRadius: 10, opacity: 0.92, display: 'block' }}
            />
          </div>
        )}

        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em', marginTop: 'auto', paddingTop: 8 }}>
          Clique para fechar
        </div>
      </div>
    </div>
  )
}

// ── Turno atual (qual time está agindo agora) ─────────────────────────────────

function getTurnoAtual(sessao, fase, turnoBan, mapTime) {
  switch (fase) {
    case 'coin':                   return sessao?.escolhedor ?? null
    case 'escolhendo':             return sessao?.vencedor   ?? null
    case 'banindo':                return turnoBan
    case 'escolhendo_mapa':        return mapTime
    case 'proxima_escolhendo':     return sessao?.perdedorProxima  ?? null
    case 'proxima_escolhendo_mapa':return sessao?.proximaMapTime   ?? null
    default:                       return null
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapPickEspectador() {
  const [params]  = useSearchParams()
  const sessaoId  = params.get('sessao')
  const { idPublico } = useCampeonato()

  const [sessao, setSessao]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [animCoin, setAnimCoin]         = useState(false)
  const [coinResultVisible, setCoinResultVisible] = useState(false)
  const [flashMap, setFlashMap]   = useState({})
  const [reveal, setReveal]       = useState(null) // { mapa, mapTimeNome, mapTimeCor, mapTimeData }
  const [ganhou, setGanhou]       = useState(null) // { nome, cor, data } — vencedor da partida

  const prevResultadoRef  = useRef(null)
  const prevBansRef       = useRef([])
  const prevMapaRef       = useRef(null)
  const prevProxMapaRef   = useRef(null)
  const prevPerdedorRef   = useRef(null)
  const prevJogosLenRef   = useRef(0)
  const animCoinDoneRef   = useRef(false)
  const revealTimerRef    = useRef(null)

  useEffect(() => {
    if (!idPublico || !sessaoId) return
    return onValue(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), snap => {
      const data = snap.val()

      // Coin flip animation
      if (data?.resultado && !prevResultadoRef.current && !animCoinDoneRef.current) {
        animCoinDoneRef.current = true
        setAnimCoin(true)
        setCoinResultVisible(true)
        setTimeout(() => setAnimCoin(false), 1700)
        // Mantém o resultado visível por 4.5s antes de transicionar para a galeria
        setTimeout(() => setCoinResultVisible(false), 4500)
      }

      // Flash ban animation (novo mapa banido)
      const currBans = data?.bans ?? []
      const prevBans = prevBansRef.current
      if (currBans.length > prevBans.length) {
        const newBan = currBans[currBans.length - 1]
        setFlashMap(prev => ({ ...prev, [newBan]: 'ban' }))
        setTimeout(() => setFlashMap(prev => { const n = { ...prev }; delete n[newBan]; return n }), 1500)
      }

      // Flash choose + reveal após 3s
      const triggerReveal = (mapaId, mt) => {
        const mapa = MAPAS.find(m => m.id === mapaId)
        if (!mapa) return
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
        revealTimerRef.current = setTimeout(() => {
          const timeData = mt === 'A' ? data?.timeA : data?.timeB
          setReveal({
            mapa,
            mapTimeNome: timeData?.nome ?? (mt === 'A' ? 'Time A' : 'Time B'),
            mapTimeCor:  timeData?.cor  ?? (mt === 'A' ? '#4a9eda' : '#e05555'),
            mapTimeData: timeData ?? null,
          })
        }, 3000)
      }

      if (data?.mapaEscolhido && data.mapaEscolhido !== prevMapaRef.current) {
        const id = data.mapaEscolhido
        setFlashMap(prev => ({ ...prev, [id]: 'choose' }))
        setTimeout(() => setFlashMap(prev => { const n = { ...prev }; delete n[id]; return n }), 2000)
        const mt = data.preferencia === 'mapa' ? data.vencedor : (data.vencedor === 'A' ? 'B' : 'A')
        triggerReveal(id, mt)
      }
      if (data?.proximaMapa && data.proximaMapa !== prevProxMapaRef.current) {
        const id = data.proximaMapa
        setFlashMap(prev => ({ ...prev, [id]: 'choose' }))
        setTimeout(() => setFlashMap(prev => { const n = { ...prev }; delete n[id]; return n }), 2000)
        triggerReveal(id, data.proximaMapTime)
      }

      // Detecta quando admin define quem perdeu → anuncia vencedor e fecha reveal
      // Condição dupla: valor mudou OU jogosJogados cresceu (mesmo time perdendo de novo)
      const jogosLen = (data?.jogosJogados ?? []).length
      const perdedorMudou = data?.perdedorProxima && (
        data.perdedorProxima !== prevPerdedorRef.current ||
        jogosLen > prevJogosLenRef.current
      )
      if (perdedorMudou) {
        const vencedorTime = data.perdedorProxima === 'A' ? 'B' : 'A'
        const vencedorData = vencedorTime === 'A' ? data?.timeA : data?.timeB
        setGanhou({
          nome: vencedorData?.nome ?? (vencedorTime === 'A' ? 'Time A' : 'Time B'),
          cor:  vencedorData?.cor  ?? '#4a9eda',
          data: vencedorData ?? null,
        })
        setReveal(null) // fecha o reveal do mapa se ainda estiver aberto
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
      }
      // Reseta vencedor quando próxima rodada começa de verdade
      if (!data?.perdedorProxima && prevPerdedorRef.current) {
        setGanhou(null)
      }

      prevResultadoRef.current = data?.resultado ?? null
      prevBansRef.current      = currBans
      prevMapaRef.current      = data?.mapaEscolhido ?? null
      prevProxMapaRef.current  = data?.proximaMapa ?? null
      prevPerdedorRef.current  = data?.perdedorProxima ?? null
      prevJogosLenRef.current  = jogosLen
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

  const fase     = getFase(sessao)
  const bans     = sessao.bans ?? []
  const jogados  = sessao.jogosJogados ?? []
  const pool     = (sessao.pool ?? []).map(id => MAPAS.find(m => m.id === id)).filter(Boolean)
  const mapTime  = getMapTime(sessao)
  const turnoBan = getTurnoBan(sessao)

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

  const isCoin = fase === 'coin' || coinResultVisible
  const temBans = bans.length > 0 || fase === 'banindo' || fase === 'escolhendo_mapa' || fase.startsWith('proxima') || fase === 'partida_pronta'

  return (
    <>
    {ganhou && (
      <VencedorScreen
        vencedor={ganhou}
        onDone={() => setGanhou(null)}
      />
    )}
    {reveal && !ganhou && (
      <MapRevealScreen
        mapa={reveal.mapa}
        mapTimeNome={reveal.mapTimeNome}
        mapTimeCor={reveal.mapTimeCor}
        mapTimeData={reveal.mapTimeData}
        onDismiss={() => setReveal(null)}
      />
    )}
    <div style={{
      position: 'fixed', inset: 0,
      background: '#070910',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Barlow Condensed', sans-serif",
    }}>
      <style>{CSS}</style>

      {/* ── Header: times + placar ─── */}
      {(() => {
        const winsA = sessao.placarA ?? 0
        const winsB = sessao.placarB ?? 0
        const turno = getTurnoAtual(sessao, fase, turnoBan, mapTime)
        const aAtivo = turno === 'A'
        const bAtivo = turno === 'B'

        // Chase lights: 3 setas fixas que pulsam em sequência → ilusão de movimento sem loop visível
        const Arrows = ({ dir, cor }) => {
          const char = dir === 'left' ? '‹' : '›'
          // Para dir='left' a onda vai da direita para esquerda (pulsa 2→1→0)
          // Para dir='right' a onda vai da esquerda para direita (pulsa 0→1→2)
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'clamp(2px, 0.4vw, 5px)',
              alignSelf: 'stretch', padding: '0 4px', flexShrink: 0,
            }}>
              {[0, 1, 2].map(i => {
                const order = dir === 'left' ? 2 - i : i
                return (
                  <span key={i} style={{
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 900,
                    fontSize: 'clamp(13px, 1.6vw, 21px)', color: cor,
                    display: 'inline-block', userSelect: 'none',
                    animation: 'arrowChase 1.2s ease-in-out infinite',
                    animationDelay: `${order * 0.22}s`,
                  }}>
                    {char}
                  </span>
                )
              })}
            </div>
          )
        }

        return (
          <div style={{
            display: 'flex', alignItems: 'stretch',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            {/* Time A — seta na borda direita (perto do centro) apontando para a esquerda (pro nome) */}
            <div style={{
              flex: 1, padding: 'clamp(8px, 1.2vh, 16px) clamp(12px, 2vw, 20px)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderRight: `3px solid ${corA}`,
              background: aAtivo ? `linear-gradient(to right, ${corA}1A 0%, transparent 70%)` : 'transparent',
              transition: 'background 0.4s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 'clamp(7px, 0.9vw, 11px)', height: 'clamp(7px, 0.9vw, 11px)', borderRadius: '50%', background: corA, boxShadow: `0 0 8px ${corA}`, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(15px, 2.1vw, 26px)', color: corA, letterSpacing: '0.04em' }}>{nomeA}</span>
              </div>
              {aAtivo && <Arrows dir="left" cor={corA} />}
            </div>

            {/* Centro: placar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 clamp(10px, 1.5vw, 20px)', minWidth: 'clamp(56px, 6.5vw, 90px)', flexShrink: 0,
            }}>
              {(winsA > 0 || winsB > 0) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(22px, 3vw, 40px)', color: winsA > winsB ? corA : 'rgba(255,255,255,0.45)', lineHeight: 1 }}>{winsA}</span>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(13px, 1.5vw, 20px)', color: 'rgba(255,255,255,0.2)' }}>–</span>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(22px, 3vw, 40px)', color: winsB > winsA ? corB : 'rgba(255,255,255,0.45)', lineHeight: 1 }}>{winsB}</span>
                </div>
              ) : (
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(13px, 1.5vw, 18px)', color: 'rgba(255,255,255,0.2)' }}>vs</span>
              )}
            </div>

            {/* Time B — seta na borda esquerda (perto do centro) apontando para a direita (pro nome) */}
            <div style={{
              flex: 1, padding: 'clamp(8px, 1.2vh, 16px) clamp(12px, 2vw, 20px)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderLeft: `3px solid ${corB}`,
              background: bAtivo ? `linear-gradient(to left, ${corB}1A 0%, transparent 70%)` : 'transparent',
              transition: 'background 0.4s',
            }}>
              {bAtivo && <Arrows dir="right" cor={corB} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 'clamp(15px, 2.1vw, 26px)', color: corB, letterSpacing: '0.04em' }}>{nomeB}</span>
                <div style={{ width: 'clamp(7px, 0.9vw, 11px)', height: 'clamp(7px, 0.9vw, 11px)', borderRadius: '50%', background: corB, boxShadow: `0 0 8px ${corB}`, flexShrink: 0 }} />
              </div>
            </div>
          </div>
        )
      })()}

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
    </>
  )
}
