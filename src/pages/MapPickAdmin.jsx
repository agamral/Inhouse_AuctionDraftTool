import { useState, useEffect, useCallback } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { mapPickPath, teamPath } from '../utils/campeonatoPaths'
import { MAPAS, POOL_TEMPORADA } from '../utils/mapPool'
import { getFase } from './MapPick'

const CORES_PADRAO = ['#4a9eda', '#e05555', '#4caf7d', '#9b6ee8', '#c9a84c', '#e08a3c']

function gerarId() {
  return `mp${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`
}

const labelStyle = {
  fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text2)', marginBottom: 6, display: 'block',
}
const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}
const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

// ── Label por fase ────────────────────────────────────────────────────────────

function faseLabel(s) {
  const fase = getFase(s)
  const map = {
    encerrado:               { txt: 'Encerrado',               cor: 'var(--text3)'  },
    coin:                    { txt: 'Cara ou coroa',            cor: 'var(--blue)'   },
    escolhendo:              { txt: 'Escolhendo prioridade',    cor: 'var(--gold)'   },
    banindo:                 { txt: `Banindo (${(s?.bans ?? []).length}/4)`, cor: 'var(--red)' },
    escolhendo_mapa:         { txt: 'Escolhendo mapa',          cor: 'var(--purple)' },
    partida_pronta:          { txt: 'Partida pronta',           cor: 'var(--green)'  },
    proxima_escolhendo:      { txt: 'Próxima — escolhendo',     cor: 'var(--gold)'   },
    proxima_escolhendo_mapa: { txt: 'Próxima — mapa',           cor: 'var(--purple)' },
    proxima_pronta:          { txt: 'Próxima pronta',           cor: 'var(--green)'  },
  }
  return map[fase] ?? { txt: fase, cor: 'var(--text2)' }
}

// ── Descrição contextual da fase ──────────────────────────────────────────────

function faseDescricao(sessao, times) {
  const fase = getFase(sessao)
  const nomeA = sessao?.timeA?.nome ?? 'Time A'
  const nomeB = sessao?.timeB?.nome ?? 'Time B'
  const bans = sessao?.bans ?? []
  const mapTime = sessao?.mapTime
  const turnoBan = sessao?.preferencia
    ? (bans.length % 2 === 0 ? mapTime : (mapTime === 'A' ? 'B' : 'A'))
    : null
  const turnoNome = turnoBan === 'A' ? nomeA : nomeB
  const mapTimeNome = mapTime === 'A' ? nomeA : nomeB
  const perdedorNome = sessao?.perdedorProxima === 'A' ? nomeA : nomeB
  const proxMapTimeNome = sessao?.proximaMapTime === 'A' ? nomeA : nomeB
  const escolhedorNome = sessao?.escolhedor === 'A' ? nomeA : nomeB
  const vencedorNome = sessao?.vencedor === 'A' ? nomeA : nomeB

  switch (fase) {
    case 'coin':          return `Aguardando ${escolhedorNome} escolher cara ou coroa`
    case 'escolhendo':    return `${vencedorNome} ganhou — escolhendo entre Mapa e First Pick`
    case 'banindo':       return `${turnoNome} está banindo — mapa ${bans.length + 1} de 4`
    case 'escolhendo_mapa': return `${mapTimeNome} está escolhendo o mapa`
    case 'partida_pronta':  return `Mapa escolhido — aguardando resultado da partida`
    case 'proxima_escolhendo': return `${perdedorNome} perdeu — escolhendo Mapa ou First Pick`
    case 'proxima_escolhendo_mapa': return `${proxMapTimeNome} está escolhendo o mapa da próxima partida`
    case 'proxima_pronta':  return `Próximo mapa definido — aguardando confirmação`
    case 'encerrado':    return 'Série encerrada'
    default: return ''
  }
}

// ── Tempo desde a última ação ─────────────────────────────────────────────────

function useTick(ms = 5000) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

// ── Vista da sessão para o admin ──────────────────────────────────────────────

function SessaoView({ sessao, sessaoId, campeonatoId }) {
  const tick = useTick(5000)  // re-render a cada 5s para atualizar indicadores de tempo/presença

  const fase = getFase(sessao)
  const fl   = faseLabel(sessao)
  const pool = (sessao.pool ?? POOL_TEMPORADA).map(id => MAPAS.find(m => m.id === id)).filter(Boolean)
  const bans        = sessao.bans ?? []
  const jogosJogados = sessao.jogosJogados ?? []
  const baseUrl = window.location.origin

  const nomeA = sessao.timeA?.nome ?? 'Time A'
  const nomeB = sessao.timeB?.nome ?? 'Time B'
  const corA  = sessao.timeA?.cor ?? 'var(--blue)'
  const corB  = sessao.timeB?.cor ?? 'var(--red)'

  const linkA   = `${baseUrl}/campeonatos/${campeonatoId}/map-pick?sessao=${sessaoId}&time=A`
  const linkB   = `${baseUrl}/campeonatos/${campeonatoId}/map-pick?sessao=${sessaoId}&time=B`
  const linkEsp = `${baseUrl}/campeonatos/${campeonatoId}/map-pick-espectador?sessao=${sessaoId}`

  const [confirmReset, setConfirmReset] = useState(false)
  const [adminMapSel, setAdminMapSel]   = useState('')

  // ── Helpers de presença ──────────────────────────────────────────────────

  function isOnline(timeKey) {
    const onlineEm = sessao.presence?.[timeKey]?.onlineEm
    return onlineEm && (Date.now() - onlineEm < 65000)  // 65s = heartbeat 30s + margem
  }

  // ── Última ação ──────────────────────────────────────────────────────────

  function ultimaAcaoLabel() {
    if (!sessao.atualizadoEm) return null
    const seg = Math.floor((Date.now() - sessao.atualizadoEm) / 1000)
    if (seg < 10)  return { txt: 'agora mesmo', cor: 'var(--green)'  }
    if (seg < 60)  return { txt: `${seg}s atrás`, cor: 'var(--text2)' }
    if (seg < 120) return { txt: '~1 min atrás', cor: 'var(--gold)'  }
    return { txt: `${Math.floor(seg / 60)} min atrás`, cor: 'var(--red)' }  // >2min = aviso
  }

  const ultimaAcao = ultimaAcaoLabel()

  // ── Mapas disponíveis para ação admin ────────────────────────────────────

  const mapTime    = sessao.mapTime
  const turnoBan   = mapTime
    ? (bans.length % 2 === 0 ? mapTime : (mapTime === 'A' ? 'B' : 'A'))
    : null

  const mapasLivres = pool.filter(m => !bans.includes(m.id) && !jogosJogados.includes(m.id))

  // ── Ações ────────────────────────────────────────────────────────────────

  const ts = () => ({ atualizadoEm: Date.now() })

  async function adminSetVencedor(vencedor) {
    const resultado = vencedor === sessao.escolhedor ? 'cara' : 'coroa'
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), {
      escolha: resultado, resultado, vencedor, ...ts(),
    })
  }

  async function adminSetPreferencia(pref) {
    const quem = sessao.vencedor
    const mt   = pref === 'mapa' ? quem : (quem === 'A' ? 'B' : 'A')
    const fp   = mt === 'A' ? 'B' : 'A'
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), { preferencia: pref, mapTime: mt, firstPickTime: fp, ...ts() })
  }

  async function adminBanirMapa() {
    if (!adminMapSel) return
    const novoBans = [...bans, adminMapSel]
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), { bans: novoBans, ...ts() })
    setAdminMapSel('')
  }

  async function adminEscolherMapa() {
    if (!adminMapSel) return
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), { mapaEscolhido: adminMapSel, ...ts() })
    setAdminMapSel('')
  }

  async function adminSetProximaPreferencia(pref) {
    const perdedor = sessao.perdedorProxima
    const mt  = pref === 'mapa' ? perdedor : (perdedor === 'A' ? 'B' : 'A')
    const fp  = mt === 'A' ? 'B' : 'A'
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), {
      proximaPreferencia: pref, proximaMapTime: mt, proximaFirstPickTime: fp, ...ts(),
    })
  }

  async function adminEscolherMapaProxima() {
    if (!adminMapSel) return
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), { proximaMapa: adminMapSel, ...ts() })
    setAdminMapSel('')
  }

  async function iniciarProxima(perdedor) {
    const mapaJogado = fase === 'proxima_pronta' ? sessao.proximaMapa : sessao.mapaEscolhido
    const novosJogados = [...jogosJogados, mapaJogado]
    // Registra resultado da partida encerrada incluindo quem escolheu o mapa
    const mapaEscolhidoPor = fase === 'proxima_pronta' ? sessao.proximaMapTime : sessao.mapTime
    const resultados = [...(sessao.resultados ?? []), { perdedor, mapaId: mapaJogado, mapaEscolhidoPor: mapaEscolhidoPor ?? null }]
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), {
      jogosJogados: novosJogados, resultados, perdedorProxima: perdedor,
      proximaPreferencia: null, proximaMapTime: null, proximaFirstPickTime: null, proximaMapa: null,
      ...ts(),
    })
  }

  async function encerrar() {
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), { encerrada: true, ...ts() })
  }

  async function desfazer() {
    let updates = {}
    switch (fase) {
      case 'proxima_pronta':
        updates = { proximaMapa: null }
        break
      case 'proxima_escolhendo_mapa':
        updates = { proximaPreferencia: null, proximaMapTime: null, proximaFirstPickTime: null }
        break
      case 'proxima_escolhendo': {
        const novosJogados = [...jogosJogados]
        novosJogados.pop()
        updates = { jogosJogados: novosJogados, perdedorProxima: null }
        break
      }
      case 'partida_pronta':
        updates = { mapaEscolhido: null }
        break
      case 'escolhendo_mapa':
      case 'banindo':
        if (bans.length > 0) {
          const novosBans = [...bans]; novosBans.pop()
          updates = { bans: novosBans }
        } else {
          updates = { preferencia: null, mapTime: null, firstPickTime: null }
        }
        break
      case 'escolhendo':
        updates = { resultado: null, vencedor: null, escolha: null }
        break
      default:
        return
    }
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), { ...updates, ...ts() })
  }

  async function resetarSessao() {
    await set(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), {
      criadoEm: sessao.criadoEm,
      pool:     sessao.pool,
      escolhedor: sessao.escolhedor,
      timeA:    sessao.timeA,
      timeB:    sessao.timeB,
    })
    setConfirmReset(false)
  }

  // ── Componentes inline ───────────────────────────────────────────────────

  // Select de mapa disponível (reutilizado em várias fases)
  function MapSelect({ mapas, placeholder, onAcao, labelAcao }) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={adminMapSel} onChange={e => setAdminMapSel(e.target.value)}
          style={{ ...selectStyle, flex: 1, minWidth: 180 }}>
          <option value="">{placeholder}</option>
          {mapas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <button className="btn" style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap', borderColor: 'var(--gold)', color: 'var(--gold)' }}
          onClick={onAcao} disabled={!adminMapSel}>
          {labelAcao}
        </button>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ─ Header ─ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: corA }}>{nomeA}</span>
        <span style={{ color: 'var(--text3)', fontSize: 13 }}>vs</span>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: corB }}>{nomeB}</span>
        <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: fl.cor, background: fl.cor + '18', border: `1px solid ${fl.cor}44`, borderRadius: 4, padding: '2px 8px' }}>
          {fl.txt}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {faseDescricao(sessao)}
        </span>
      </div>

      {/* ─ Presença + última ação ─ */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {['A', 'B'].map(t => {
          const online = isOnline(t)
          const nome   = t === 'A' ? nomeA : nomeB
          const cor    = t === 'A' ? corA   : corB
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif" }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: online ? 'var(--green)' : 'var(--text3)', boxShadow: online ? '0 0 6px var(--green)' : 'none', flexShrink: 0 }} />
              <span style={{ color: online ? 'var(--text)' : 'var(--text3)' }}>
                <span style={{ color: cor, fontWeight: 700 }}>{nome}</span>
                {' '}{online ? 'online' : 'offline'}
              </span>
            </div>
          )
        })}
        {ultimaAcao && (
          <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: ultimaAcao.cor, marginLeft: 'auto' }}>
            ⏱ última ação: {ultimaAcao.txt}
          </span>
        )}
      </div>

      {/* ─ Links ─ */}
      {['A', 'B'].map(t => {
        const url  = t === 'A' ? linkA : linkB
        const nome = t === 'A' ? nomeA : nomeB
        return (
          <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", minWidth: 70 }}>{nome}</span>
            <code style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'var(--text2)', wordBreak: 'break-all' }}>{url}</code>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => navigator.clipboard.writeText(url)}>⎘</button>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap', borderColor: 'var(--blue)', color: 'var(--blue)' }} onClick={() => window.open(url, '_blank')}>↗</button>
          </div>
        )
      })}

      {/* ─ Link espectador ─ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", minWidth: 70 }}>Espectador</span>
        <code style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'var(--text2)', wordBreak: 'break-all' }}>{linkEsp}</code>
        <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => navigator.clipboard.writeText(linkEsp)}>⎘</button>
        <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap', borderColor: 'var(--purple)', color: 'var(--purple)' }} onClick={() => window.open(linkEsp, '_blank')}>↗</button>
      </div>

      {/* ─ Mini grid de mapas ─ */}
      {(bans.length > 0 || sessao.mapaEscolhido || sessao.proximaMapa || jogosJogados.length > 0) && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {pool.map(m => {
            const banIdx   = bans.indexOf(m.id)
            const banido   = banIdx !== -1
            const jogado   = jogosJogados.includes(m.id)
            const isAtual  = m.id === sessao.mapaEscolhido && !jogado
            const isProx   = m.id === sessao.proximaMapa
            return (
              <div key={m.id} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10,
                fontFamily: "'Barlow Condensed', sans-serif",
                background: isAtual || isProx ? 'rgba(76,175,125,0.12)' : banido ? 'rgba(224,85,85,0.08)' : jogado ? 'rgba(201,168,76,0.08)' : 'var(--bg2)',
                border: `1px solid ${isAtual || isProx ? 'var(--green)' : banido ? 'rgba(224,85,85,0.4)' : jogado ? 'rgba(201,168,76,0.3)' : 'var(--border)'}`,
                color: isAtual || isProx ? 'var(--green)' : banido ? 'var(--red)' : jogado ? 'var(--gold)' : 'var(--text3)',
              }}>
                {isAtual ? '✓' : isProx ? '▶' : banido ? `✕${banIdx + 1}` : jogado ? '⚔' : '·'} {m.nome}
              </div>
            )
          })}
        </div>
      )}

      {/* ─ Ações por fase ─ */}
      {!sessao.encerrada && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text3)' }}>
            Ações do admin
          </div>

          {/* COIN: pular coin flip e definir vencedor diretamente */}
          {fase === 'coin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>Pular coin flip — definir vencedor manualmente:</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ fontSize: 12, padding: '5px 14px', borderColor: corA, color: corA }} onClick={() => adminSetVencedor('A')}>{nomeA} venceu</button>
                <button className="btn" style={{ fontSize: 12, padding: '5px 14px', borderColor: corB, color: corB }} onClick={() => adminSetVencedor('B')}>{nomeB} venceu</button>
              </div>
            </div>
          )}

          {/* ESCOLHENDO: admin age pelo vencedor */}
          {fase === 'escolhendo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                Agir por <strong style={{ color: sessao.vencedor === 'A' ? corA : corB }}>{sessao.vencedor === 'A' ? nomeA : nomeB}</strong>:
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ fontSize: 12, padding: '5px 14px', borderColor: 'var(--purple)', color: 'var(--purple)' }} onClick={() => adminSetPreferencia('mapa')}>🗺 Mapa</button>
                <button className="btn" style={{ fontSize: 12, padding: '5px 14px', borderColor: 'var(--gold)', color: 'var(--gold)' }} onClick={() => adminSetPreferencia('firstpick')}>⚡ First Pick</button>
              </div>
            </div>
          )}

          {/* BANINDO: admin bane pelo time da vez */}
          {fase === 'banindo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                Banir mapa por <strong style={{ color: turnoBan === 'A' ? corA : corB }}>{turnoBan === 'A' ? nomeA : nomeB}</strong>:
              </div>
              <MapSelect mapas={mapasLivres} placeholder="— selecionar mapa —" onAcao={adminBanirMapa} labelAcao="Banir" />
            </div>
          )}

          {/* ESCOLHENDO_MAPA: admin escolhe pelo mapTime */}
          {fase === 'escolhendo_mapa' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                Escolher mapa por <strong style={{ color: mapTime === 'A' ? corA : corB }}>{mapTime === 'A' ? nomeA : nomeB}</strong>:
              </div>
              <MapSelect mapas={mapasLivres} placeholder="— selecionar mapa —" onAcao={adminEscolherMapa} labelAcao="Escolher" />
            </div>
          )}

          {/* PARTIDA/PROXIMA PRONTA: quem perdeu */}
          {(fase === 'partida_pronta' || fase === 'proxima_pronta') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: 'var(--text2)' }}>
                {fase === 'proxima_pronta'
                  ? `▶ ${MAPAS.find(m => m.id === sessao.proximaMapa)?.nome ?? ''} · FP: ${sessao.proximaFirstPickTime === 'A' ? nomeA : nomeB}`
                  : `▶ ${MAPAS.find(m => m.id === sessao.mapaEscolhido)?.nome ?? ''} · FP: ${sessao.firstPickTime === 'A' ? nomeA : nomeB}`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>Quem perdeu esta partida?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" style={{ fontSize: 12, padding: '6px 14px', borderColor: corA, color: corA }} onClick={() => iniciarProxima('A')}>{nomeA} perdeu → próxima</button>
                <button className="btn" style={{ fontSize: 12, padding: '6px 14px', borderColor: corB, color: corB }} onClick={() => iniciarProxima('B')}>{nomeB} perdeu → próxima</button>
                <button className="btn" style={{ fontSize: 12, padding: '6px 12px', marginLeft: 'auto', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)' }} onClick={encerrar}>Encerrar série</button>
              </div>
            </div>
          )}

          {/* PROXIMA_ESCOLHENDO: admin age pelo perdedor */}
          {fase === 'proxima_escolhendo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                Agir por <strong style={{ color: sessao.perdedorProxima === 'A' ? corA : corB }}>{sessao.perdedorProxima === 'A' ? nomeA : nomeB}</strong>:
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ fontSize: 12, padding: '5px 14px', borderColor: 'var(--purple)', color: 'var(--purple)' }} onClick={() => adminSetProximaPreferencia('mapa')}>🗺 Mapa</button>
                <button className="btn" style={{ fontSize: 12, padding: '5px 14px', borderColor: 'var(--gold)', color: 'var(--gold)' }} onClick={() => adminSetProximaPreferencia('firstpick')}>⚡ First Pick</button>
              </div>
            </div>
          )}

          {/* PROXIMA_ESCOLHENDO_MAPA: admin age pelo proximaMapTime */}
          {fase === 'proxima_escolhendo_mapa' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                Escolher mapa por <strong style={{ color: sessao.proximaMapTime === 'A' ? corA : corB }}>{sessao.proximaMapTime === 'A' ? nomeA : nomeB}</strong>:
              </div>
              <MapSelect mapas={mapasLivres} placeholder="— selecionar mapa —" onAcao={adminEscolherMapaProxima} labelAcao="Escolher" />
            </div>
          )}

          {/* Info enquanto capitão está agindo */}
          {(fase === 'proxima_escolhendo' || fase === 'proxima_escolhendo_mapa') && (
            <div style={{ fontSize: 11, color: 'var(--gold2)', fontFamily: "'Barlow Condensed', sans-serif", background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, padding: '5px 10px' }}>
              {sessao.perdedorProxima === 'A' ? nomeA : nomeB} está escolhendo
              {sessao.proximaPreferencia && ` · ${sessao.proximaPreferencia === 'mapa' ? '🗺 Mapa' : '⚡ First Pick'}`}
            </div>
          )}

          {/* Separador + controles de sessão */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Desfazer */}
            {fase !== 'coin' && fase !== 'partida_pronta' && fase !== 'encerrado' && (
              <button className="btn" style={{ fontSize: 11, padding: '4px 12px', borderColor: 'var(--gold)', color: 'var(--gold)' }} onClick={desfazer}>
                ↩ Desfazer último
              </button>
            )}

            {/* Reset completo */}
            {!confirmReset ? (
              <button className="btn" style={{ fontSize: 11, padding: '4px 12px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)', marginLeft: 'auto' }} onClick={() => setConfirmReset(true)}>
                ⟳ Reset completo
              </button>
            ) : (
              <>
                <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>Resetar sessão (links se mantêm)?</span>
                <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }} onClick={resetarSessao}>Confirmar</button>
                <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setConfirmReset(false)}>Cancelar</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Histórico */}
      {jogosJogados.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)' }}>Jogados:</span>
          {jogosJogados.map((id, i) => {
            const m = MAPAS.find(x => x.id === id)
            return <span key={i} style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--gold)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4, padding: '2px 8px' }}>⚔ {m?.nome ?? id}</span>
          })}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapPickAdmin() {
  const { campeonatoId } = useCampeonato()
  const [sessoes, setSessoes] = useState({})
  const [times, setTimes]     = useState({})
  const [sessaoSel, setSessaoSel] = useState(null)
  const [mostraCriar, setMostraCriar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState(null)

  const [form, setForm] = useState({
    modoTimes: 'campeonato',
    nomeA: '', corA: CORES_PADRAO[0], timeAId: '',
    nomeB: '', corB: CORES_PADRAO[1], timeBId: '',
    escolhedor: 'A',
    pool: [...POOL_TEMPORADA],
  })

  useEffect(() => {
    if (!campeonatoId) return
    return onValue(ref(db, mapPickPath(campeonatoId)), snap => setSessoes(snap.val() ?? {}))
  }, [campeonatoId])

  useEffect(() => {
    if (!campeonatoId) return
    return onValue(ref(db, teamPath(campeonatoId)), snap => setTimes(snap.val() ?? {}))
  }, [campeonatoId])

  function flash(texto, tipo = 'ok') {
    setMsg({ texto, tipo })
    setTimeout(() => setMsg(null), 3500)
  }

  async function handleCriar() {
    let nomeA = form.nomeA.trim(), corA = form.corA, iconUrlA = null, emojiA = null
    let nomeB = form.nomeB.trim(), corB = form.corB, iconUrlB = null, emojiB = null

    if (form.modoTimes === 'campeonato') {
      const tA = times[form.timeAId]
      const tB = times[form.timeBId]
      if (!tA) return flash('Selecione o Time A.', 'err')
      if (!tB) return flash('Selecione o Time B.', 'err')
      if (form.timeAId === form.timeBId) return flash('Os times precisam ser diferentes.', 'err')
      nomeA = tA.nome; corA = tA.cor || CORES_PADRAO[0]
      nomeB = tB.nome; corB = tB.cor || CORES_PADRAO[1]
      if (tA.iconUrl) iconUrlA = tA.iconUrl
      if (tB.iconUrl) iconUrlB = tB.iconUrl
      if (tA.emoji)   emojiA   = tA.emoji
      if (tB.emoji)   emojiB   = tB.emoji
    } else {
      if (!nomeA || !nomeB) return flash('Informe os nomes dos dois times.', 'err')
    }

    if (form.pool.length < 5) return flash('Selecione pelo menos 5 mapas no pool.', 'err')

    setSalvando(true)
    try {
      const id = gerarId()
      await set(ref(db, `${mapPickPath(campeonatoId)}/${id}`), {
        criadoEm: Date.now(),
        pool: form.pool,
        escolhedor: form.escolhedor,
        timeA: { nome: nomeA, cor: corA, ...(iconUrlA ? { iconUrl: iconUrlA } : {}), ...(emojiA ? { emoji: emojiA } : {}) },
        timeB: { nome: nomeB, cor: corB, ...(iconUrlB ? { iconUrl: iconUrlB } : {}), ...(emojiB ? { emoji: emojiB } : {}) },
      })
      setSessaoSel(id)
      setMostraCriar(false)
      flash('Sessão criada!')
    } catch (e) {
      flash(e.message, 'err')
    } finally {
      setSalvando(false)
    }
  }

  function toggleMapa(id) {
    setForm(f => ({ ...f, pool: f.pool.includes(id) ? f.pool.filter(x => x !== id) : [...f.pool, id] }))
  }

  const timesArr = Object.entries(times).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const sessaoIds = Object.keys(sessoes).sort((a, b) => (sessoes[b]?.criadoEm ?? 0) - (sessoes[a]?.criadoEm ?? 0))
  const sessaoAtual = sessaoSel ? sessoes[sessaoSel] : null

  // Preview dos times selecionados no modo campeonato
  const previewA = form.modoTimes === 'campeonato' ? times[form.timeAId] : null
  const previewB = form.modoTimes === 'campeonato' ? times[form.timeBId] : null

  return (
    <main className="page">
      <h1 className="page-title">Pick de Mapas</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
        Crie uma sessão de escolha de mapas. Compartilhe os links com os capitães.
      </p>

      {msg && (
        <div style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16,
          background: msg.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
          border: `1px solid ${msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>
          {msg.texto}
        </div>
      )}

      {/* Seletor + botão criar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={sessaoSel ?? ''} onChange={e => { setSessaoSel(e.target.value || null); setMostraCriar(false) }}
          style={{ ...inputStyle, width: 'auto', minWidth: 220 }}>
          <option value="">— selecionar sessão —</option>
          {sessaoIds.map(id => {
            const s = sessoes[id]
            return <option key={id} value={id}>{s?.timeA?.nome ?? 'A'} vs {s?.timeB?.nome ?? 'B'} · {new Date(s?.criadoEm ?? 0).toLocaleDateString('pt-BR')}</option>
          })}
        </select>
        <button className="btn" style={{ fontSize: 13, padding: '7px 16px', borderColor: 'var(--blue)', color: 'var(--blue)', whiteSpace: 'nowrap' }}
          onClick={() => { setMostraCriar(v => !v); setSessaoSel(null) }}>
          {mostraCriar ? '✕ Cancelar' : '+ Nova sessão'}
        </button>
      </div>

      {/* Formulário nova sessão */}
      {mostraCriar && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, padding: 20, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Nova Sessão</div>

          {/* Toggle modo times */}
          <div>
            <label style={labelStyle}>Times</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[['campeonato', 'Usar times do campeonato'], ['manual', 'Digitar nomes']].map(([v, l]) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, modoTimes: v }))} style={{
                  padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12,
                  border: `1px solid ${form.modoTimes === v ? 'var(--blue)' : 'var(--border2)'}`,
                  background: form.modoTimes === v ? 'rgba(74,158,218,0.12)' : 'var(--bg)',
                  color: form.modoTimes === v ? 'var(--blue)' : 'var(--text2)',
                }}>
                  {l}
                </button>
              ))}
            </div>

            {form.modoTimes === 'campeonato' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['A', 'timeAId', previewA], ['B', 'timeBId', previewB]].map(([t, key, preview]) => (
                  <div key={t}>
                    <label style={labelStyle}>Time {t}</label>
                    <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ ...selectStyle, color: preview ? preview.cor : 'var(--text2)', borderColor: preview ? preview.cor + '66' : 'var(--border2)' }}>
                      <option value="">— selecionar —</option>
                      {timesArr.map(([id, tm]) => <option key={id} value={id}>{tm.nome}</option>)}
                    </select>
                    {preview && (
                      <div style={{ fontSize: 11, color: preview.cor, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>
                        ● {preview.nome}
                      </div>
                    )}
                    {timesArr.length === 0 && (
                      <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Nenhum time cadastrado.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['A', 'nomeA', 'corA'], ['B', 'nomeB', 'corB']].map(([t, nKey, cKey]) => (
                  <div key={t}>
                    <label style={labelStyle}>Time {t}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder={`Nome do Time ${t}`} value={form[nKey]}
                        onChange={e => setForm(f => ({ ...f, [nKey]: e.target.value }))}
                        style={{ ...inputStyle, flex: 1 }} />
                      <input type="color" value={form[cKey]}
                        onChange={e => setForm(f => ({ ...f, [cKey]: e.target.value }))}
                        style={{ width: 38, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quem escolhe cara ou coroa */}
          <div>
            <label style={labelStyle}>Quem escolhe cara ou coroa</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['A', 'B'].map(t => {
                const preview = form.modoTimes === 'campeonato' ? (t === 'A' ? previewA : previewB) : null
                const nome = preview?.nome ?? (t === 'A' ? form.nomeA || 'Time A' : form.nomeB || 'Time B')
                const cor = preview?.cor ?? (t === 'A' ? form.corA : form.corB)
                return (
                  <button key={t} onClick={() => setForm(f => ({ ...f, escolhedor: t }))} style={{
                    padding: '7px 20px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13,
                    border: `1px solid ${form.escolhedor === t ? cor : 'var(--border2)'}`,
                    background: form.escolhedor === t ? cor + '22' : 'var(--bg)',
                    color: form.escolhedor === t ? cor : 'var(--text2)',
                  }}>
                    {nome}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 5 }}>
              Este capitão verá os botões "Cara" e "Coroa". O outro aguarda.
            </div>
          </div>

          {/* Pool de mapas */}
          <div>
            <label style={labelStyle}>Pool de Mapas ({form.pool.length} selecionados)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
              {MAPAS.map(m => {
                const sel = form.pool.includes(m.id)
                return (
                  <button key={m.id} onClick={() => toggleMapa(m.id)} style={{
                    padding: 0, borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                    border: `2px solid ${sel ? 'var(--gold)' : 'var(--border)'}`,
                    opacity: sel ? 1 : 0.4,
                  }}>
                    <img src={m.splashUrl} alt={m.nome} style={{ width: '100%', height: 48, objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.style.display = 'none' }} />
                    <div style={{ padding: '4px 6px', fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: sel ? 'var(--gold)' : 'var(--text3)', background: 'var(--bg3)', textAlign: 'center' }}>
                      {m.nome}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <button className="btn primary" onClick={handleCriar} disabled={salvando}
            style={{ fontSize: 13, padding: '9px 24px', alignSelf: 'flex-start' }}>
            {salvando ? 'Criando...' : 'Criar sessão'}
          </button>
        </div>
      )}

      {/* Sessão selecionada */}
      {sessaoAtual && sessaoSel && (
        <SessaoView sessao={sessaoAtual} sessaoId={sessaoSel} campeonatoId={campeonatoId} />
      )}

      {!mostraCriar && !sessaoAtual && sessaoIds.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhuma sessão criada. Clique em <strong>+ Nova sessão</strong> para começar.</p>
      )}
    </main>
  )
}
