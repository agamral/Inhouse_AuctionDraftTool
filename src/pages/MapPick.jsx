import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { mapPickPath } from '../utils/campeonatoPaths'
import { MAPAS } from '../utils/mapPool'

// ── Helpers ───────────────────────────────────────────────────────────────────

function outroTime(time) { return time === 'A' ? 'B' : 'A' }

function getFase(sessao) {
  if (!sessao)                                 return 'loading'
  if (sessao.encerrada)                        return 'encerrado'
  if (!sessao.resultado)                       return 'coin'
  if (!sessao.preferencia)                     return 'escolhendo'
  if ((sessao.bans ?? []).length < 4)          return 'banindo'
  if (!sessao.mapaEscolhido)                  return 'escolhendo_mapa'
  if (!sessao.perdedorProxima)                return 'partida_pronta'
  if (!sessao.proximaPreferencia)             return 'proxima_escolhendo'
  if (!sessao.proximaMapa)                    return 'proxima_escolhendo_mapa'
  return 'proxima_pronta'
}

function getMapTime(sessao) {
  if (!sessao?.preferencia || !sessao?.vencedor) return null
  return sessao.preferencia === 'mapa' ? sessao.vencedor : outroTime(sessao.vencedor)
}

function getTurnoBan(sessao) {
  const bans = sessao?.bans ?? []
  const mapTime = getMapTime(sessao)
  if (!mapTime) return null
  return bans.length % 2 === 0 ? mapTime : outroTime(mapTime)
}

// ── CSS animations ────────────────────────────────────────────────────────────

const CSS = `
@keyframes coinGira {
  0%   { transform: scaleX(1);    }
  25%  { transform: scaleX(0.05); }
  50%  { transform: scaleX(1);    }
  75%  { transform: scaleX(0.05); }
  100% { transform: scaleX(1);    }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pulseGold {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201,168,76,0.4); }
  50%       { box-shadow: 0 0 0 14px rgba(201,168,76,0); }
}
`

// ── Moeda ─────────────────────────────────────────────────────────────────────

function Moeda({ resultado, animando, onEscolha, ehEscolhedor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div style={{
        width: 120, height: 120, borderRadius: '50%',
        background: resultado && !animando
          ? 'linear-gradient(135deg, #c9a84c, #f0cc6e)'
          : 'linear-gradient(135deg, #3e3c3a, #2a2826)',
        border: '4px solid var(--gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: animando ? 'coinGira 0.25s ease-in-out 6' : resultado ? 'pulseGold 2s ease-in-out infinite' : 'none',
        transition: 'background 0.5s',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <span style={{
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 20,
          letterSpacing: '0.04em',
          color: resultado && !animando ? '#0a0c10' : 'var(--gold)',
        }}>
          {animando ? '?' : resultado === 'cara' ? 'CARA' : resultado === 'coroa' ? 'COROA' : '?'}
        </span>
      </div>

      {!resultado && !animando && ehEscolhedor && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', margin: 0 }}>Escolha um lado:</p>
          <div style={{ display: 'flex', gap: 12 }}>
            {['cara', 'coroa'].map(lado => (
              <button key={lado} className="btn primary" onClick={() => onEscolha(lado)} style={{
                fontSize: 16, fontWeight: 700, padding: '12px 32px',
                fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {lado === 'cara' ? '😎 Cara' : '👑 Coroa'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Grid de mapas ─────────────────────────────────────────────────────────────

function MapaGrid({ mapas, bans, jogados, mapaAtual, meuTurno, onSelect, pendente, onConfirmar, onCancelar }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
      {mapas.map(m => {
        const banido  = bans.includes(m.id)
        const jogado  = jogados.includes(m.id)
        const atual   = m.id === mapaAtual && !jogado  // mapa da partida atual
        const isPend  = m.id === pendente
        const indisponivel = banido || jogado
        const clicavel    = meuTurno && !indisponivel && !atual && !pendente

        let borderColor = 'transparent'
        let bgColor = 'var(--bg3)'
        let textColor = 'var(--text2)'
        if (isPend)   { borderColor = 'var(--gold)';  bgColor = 'rgba(201,168,76,0.08)' }
        else if (atual){ borderColor = 'var(--green)'; bgColor = 'rgba(76,175,125,0.08)' }
        else if (meuTurno && !indisponivel && !pendente) { borderColor = 'rgba(255,255,255,0.1)' }

        return (
          <div key={m.id}
            onClick={() => clicavel && onSelect(m.id)}
            style={{
              position: 'relative', borderRadius: 8, overflow: 'hidden',
              cursor: clicavel ? 'pointer' : 'default',
              opacity: indisponivel ? 0.28 : 1,
              filter: indisponivel ? 'grayscale(100%)' : 'none',
              border: `2px solid ${borderColor}`,
              background: bgColor,
              transition: 'all 0.22s',
              boxShadow: isPend ? '0 0 14px rgba(201,168,76,0.4)' : atual ? '0 0 14px rgba(76,175,125,0.3)' : 'none',
            }}>
            <img src={m.splashUrl} alt={m.nome}
              onError={e => { e.target.style.background = 'var(--bg3)'; e.target.style.minHeight = '80px' }}
              style={{ width: '100%', height: 86, objectFit: 'cover', display: 'block' }} />
            <div style={{
              padding: '5px 8px', fontSize: 11,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              color: isPend ? 'var(--gold2)' : atual ? 'var(--green)' : indisponivel ? 'rgba(150,150,150,0.6)' : textColor,
              textAlign: 'center',
            }}>
              {m.nome}
            </div>

            {/* Ban overlay */}
            {banido && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(224,85,85,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>✕</div>
              </div>
            )}

            {/* Jogado overlay */}
            {jogado && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(201,168,76,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#0a0c10', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>⚔</div>
              </div>
            )}

            {/* Escolhido atual */}
            {atual && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(76,175,125,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>✓</div>
              </div>
            )}
          </div>
        )
      })}

      {/* Confirmação flutuante */}
      {pendente && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg2)', border: '1px solid var(--gold)',
          borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 100,
          animation: 'fadeInUp 0.2s ease-out',
        }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: 'var(--text)' }}>
            {mapas.find(m => m.id === pendente)?.nome}?
          </span>
          <button className="btn primary" onClick={onConfirmar} style={{ fontSize: 13, padding: '6px 16px' }}>Confirmar</button>
          <button className="btn" onClick={onCancelar} style={{ fontSize: 13, padding: '6px 12px' }}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

// ── Bloco de escolha FP / Mapa ────────────────────────────────────────────────

function EscolhaPreferencia({ meuNome, adversarioNome, onEscolher }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--text)' }}>
        O que você prefere?
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn primary" onClick={() => onEscolher('mapa')} style={{
          fontSize: 17, fontWeight: 700, padding: '16px 32px',
          fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 30 }}>🗺</span>
          Escolher Mapa
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, fontFamily: "'Barlow Condensed', sans-serif" }}>
            Você bana e escolhe o mapa
          </span>
        </button>
        <button className="btn" onClick={() => onEscolher('firstpick')} style={{
          fontSize: 17, fontWeight: 700, padding: '16px 32px',
          fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
          borderColor: 'var(--purple)', color: 'var(--purple)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 30 }}>⚡</span>
          First Pick
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
            Primeiro pick e ban no draft
          </span>
        </button>
      </div>
    </div>
  )
}

// ── Aguardando genérico ───────────────────────────────────────────────────────

function Aguardando({ msg, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 32, opacity: 0.4 }}>⏳</div>
      <p style={{ color: 'var(--text)', fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, margin: 0 }}>{msg}</p>
      {sub && <p style={{ color: 'var(--text2)', fontSize: 13, margin: 0 }}>{sub}</p>}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapPick() {
  const [params] = useSearchParams()
  const sessaoId  = params.get('sessao')
  const timeLocal = params.get('time')
  const { idPublico } = useCampeonato()

  const [sessao, setSessao]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [animando, setAnimando] = useState(false)
  const [pendente, setPendente] = useState(null)
  const animJaFezRef            = useRef(false)
  const prevResultadoRef        = useRef(null)

  useEffect(() => {
    if (!idPublico || !sessaoId) return
    return onValue(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), snap => {
      const data = snap.val()
      setSessao(data)
      setLoading(false)
      if (data?.resultado && !prevResultadoRef.current && !animJaFezRef.current) {
        animJaFezRef.current = true
        setAnimando(true)
        setTimeout(() => setAnimando(false), 1600)
      }
      prevResultadoRef.current = data?.resultado ?? null
    })
  }, [idPublico, sessaoId])

  // ── Ações ─────────────────────────────────────────────────────────────────

  async function handleEscolherFace(face) {
    if (!sessao || animando) return
    const resultado = Math.random() < 0.5 ? 'cara' : 'coroa'
    const vencedor  = resultado === face ? sessao.escolhedor : outroTime(sessao.escolhedor)
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { escolha: face, resultado, vencedor })
  }

  async function handleEscolherPreferencia(pref) {
    if (!sessao?.vencedor) return
    const mapTime      = pref === 'mapa' ? sessao.vencedor : outroTime(sessao.vencedor)
    const firstPickTime = outroTime(mapTime)
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { preferencia: pref, mapTime, firstPickTime })
  }

  async function handleBanir(mapaId) {
    const bans = [...(sessao.bans ?? []), mapaId]
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { bans })
    setPendente(null)
  }

  async function handleEscolherMapa(mapaId) {
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { mapaEscolhido: mapaId })
    setPendente(null)
  }

  // Próxima partida: perdedor escolhe FP ou Mapa
  async function handleProximaPreferencia(pref) {
    if (!sessao?.perdedorProxima) return
    const perdedor     = sessao.perdedorProxima
    const mapTime      = pref === 'mapa' ? perdedor : outroTime(perdedor)
    const firstPickTime = outroTime(mapTime)
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), {
      proximaPreferencia:  pref,
      proximaMapTime:      mapTime,
      proximaFirstPickTime: firstPickTime,
    })
  }

  async function handleProximaMapa(mapaId) {
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { proximaMapa: mapaId })
    setPendente(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>Carregando...</div>
  if (!sessao) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>Sessão não encontrada.</div>

  const fase          = getFase(sessao)
  const mapTime       = getMapTime(sessao)
  const turnoBan      = getTurnoBan(sessao)
  const bans          = sessao.bans ?? []
  const jogados       = sessao.jogosJogados ?? []
  const pool          = (sessao.pool ?? []).map(id => MAPAS.find(m => m.id === id)).filter(Boolean)
  const ehEspectador  = !timeLocal

  const nomeA = sessao.timeA?.nome ?? 'Time A'
  const nomeB = sessao.timeB?.nome ?? 'Time B'
  const corA  = sessao.timeA?.cor ?? 'var(--blue)'
  const corB  = sessao.timeB?.cor ?? 'var(--red)'

  const meuNome  = timeLocal === 'A' ? nomeA : timeLocal === 'B' ? nomeB : null
  const minhaCor = timeLocal === 'A' ? corA  : timeLocal === 'B' ? corB  : 'var(--text)'

  const vencedorNome = sessao.vencedor === 'A' ? nomeA : nomeB
  const vencedorCor  = sessao.vencedor === 'A' ? corA  : corB

  // Mapas disponíveis para escolha de próxima partida
  const mapasDisponiveisProxima = pool.filter(m => !bans.includes(m.id) && !jogados.includes(m.id))

  // Quem está fazendo a escolha da próxima partida
  const perdedorNome = sessao.perdedorProxima === 'A' ? nomeA : nomeB
  const perdedorCor  = sessao.perdedorProxima === 'A' ? corA  : corB
  const ehPerdedor   = timeLocal === sessao.perdedorProxima

  const proximaMapTime      = sessao.proximaMapTime
  const proximaFirstPickTime = sessao.proximaFirstPickTime

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 20px', gap: 32,
    }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: corA }}>{nomeA}</span>
          <span style={{ color: 'var(--text3)', fontSize: 14 }}>vs</span>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: corB }}>{nomeB}</span>
        </div>
        {meuNome && (
          <div style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Você: <span style={{ color: minhaCor, fontWeight: 700 }}>{meuNome}</span>
          </div>
        )}
        {/* Mapas jogados */}
        {jogados.length > 0 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {jogados.map((id, i) => {
              const m = pool.find(x => x.id === id)
              return <span key={i} style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4, padding: '2px 8px' }}>⚔ {m?.nome ?? id}</span>
            })}
          </div>
        )}
      </div>

      <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── Cara ou coroa ─────────────────────────────────────────────── */}
        {(fase === 'coin' || (animando && fase === 'escolhendo')) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              CARA OU COROA
            </div>
            <Moeda
              resultado={animando ? null : sessao.resultado}
              animando={animando}
              ehEscolhedor={timeLocal === sessao.escolhedor}
              onEscolha={handleEscolherFace}
            />
            {sessao.resultado && !animando && (
              <div style={{ textAlign: 'center', animation: 'fadeInUp 0.4s ease-out', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 26, fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, color: 'var(--gold2)' }}>
                  {sessao.resultado === 'cara' ? '😎 CARA!' : '👑 COROA!'}
                </div>
                <div style={{ fontSize: 15, color: 'var(--text2)' }}>
                  <span style={{ color: vencedorCor, fontWeight: 700 }}>{vencedorNome}</span> ganhou o cara ou coroa!
                </div>
              </div>
            )}
            {!sessao.resultado && !animando && timeLocal !== sessao.escolhedor && !ehEspectador && (
              <Aguardando msg={`Aguardando ${sessao.escolhedor === 'A' ? nomeA : nomeB} escolher...`} sub="A moeda será lançada em breve." />
            )}
            {ehEspectador && !sessao.resultado && <Aguardando msg="Aguardando o cara ou coroa..." />}
          </div>
        )}

        {/* ── Escolher preferência (1ª partida) ─────────────────────────── */}
        {fase === 'escolhendo' && !animando && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 20px', fontSize: 13, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
              🪙 {sessao.resultado === 'cara' ? 'Cara' : 'Coroa'} · <span style={{ color: vencedorCor, fontWeight: 700 }}>{vencedorNome}</span> ganhou
            </div>
            {timeLocal === sessao.vencedor ? (
              <EscolhaPreferencia onEscolher={handleEscolherPreferencia} />
            ) : (
              <Aguardando msg={`Aguardando ${vencedorNome} escolher...`} sub="Mapa ou First Pick" />
            )}
          </div>
        )}

        {/* ── Fase de bans + escolha de mapa ────────────────────────────── */}
        {(fase === 'banindo' || fase === 'escolhendo_mapa') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Resumo de prioridades */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                🗺 <span style={{ color: mapTime === 'A' ? corA : corB, fontWeight: 700 }}>{mapTime === 'A' ? nomeA : nomeB}</span> escolhe o mapa
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                ⚡ <span style={{ color: sessao.firstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>{sessao.firstPickTime === 'A' ? nomeA : nomeB}</span> first pick
              </div>
            </div>

            {/* Progresso bans */}
            {fase === 'banindo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                  Bans — {bans.length}/4
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2, 3].map(i => {
                    const banTeam = i % 2 === 0 ? mapTime : outroTime(mapTime)
                    const banMapa = bans[i] ? pool.find(m => m.id === bans[i]) : null
                    return (
                      <div key={i} style={{
                        width: 82, borderRadius: 6, overflow: 'hidden',
                        border: `1px solid ${banMapa ? 'rgba(224,85,85,0.4)' : i === bans.length ? 'var(--gold)' : 'var(--border)'}`,
                        background: banMapa ? 'rgba(224,85,85,0.07)' : 'var(--bg3)',
                        opacity: i > bans.length ? 0.35 : 1,
                      }}>
                        <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '3px 6px', color: banTeam === 'A' ? corA : corB, borderBottom: '1px solid var(--border)' }}>
                          {banTeam === 'A' ? nomeA : nomeB}
                        </div>
                        <div style={{ padding: '3px 6px', fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif", color: banMapa ? 'var(--red)' : i === bans.length ? 'var(--gold)' : 'var(--text3)', minHeight: 20 }}>
                          {banMapa ? `✕ ${banMapa.nome}` : i === bans.length ? 'A banir...' : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {timeLocal && (
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: timeLocal === turnoBan ? 'var(--gold2)' : 'var(--text3)' }}>
                    {timeLocal === turnoBan ? '⚡ Sua vez de banir' : `Aguardando ${turnoBan === 'A' ? nomeA : nomeB} banir...`}
                  </div>
                )}
                {ehEspectador && <div style={{ fontSize: 13, color: turnoBan === 'A' ? corA : corB, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>Vez de {turnoBan === 'A' ? nomeA : nomeB} banir</div>}
              </div>
            )}

            {fase === 'escolhendo_mapa' && (
              <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 17 }}>
                {timeLocal === mapTime
                  ? <span style={{ color: 'var(--gold2)' }}>🗺 Escolha o mapa!</span>
                  : <span style={{ color: 'var(--text2)' }}>Aguardando {mapTime === 'A' ? nomeA : nomeB} escolher o mapa...</span>}
                {ehEspectador && <span style={{ color: 'var(--text2)' }}>{mapTime === 'A' ? nomeA : nomeB} está escolhendo o mapa...</span>}
              </div>
            )}

            <MapaGrid
              mapas={pool}
              bans={bans}
              jogados={jogados}
              mapaAtual={sessao.mapaEscolhido ?? null}
              meuTurno={
                (fase === 'banindo' && timeLocal === turnoBan) ||
                (fase === 'escolhendo_mapa' && timeLocal === mapTime)
              }
              onSelect={id => setPendente(id)}
              pendente={pendente}
              onConfirmar={() => fase === 'banindo' ? handleBanir(pendente) : handleEscolherMapa(pendente)}
              onCancelar={() => setPendente(null)}
            />
          </div>
        )}

        {/* ── Partida pronta (aguardando admin registrar resultado) ──────── */}
        {fase === 'partida_pronta' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
            {(() => {
              const m = pool.find(x => x.id === sessao.mapaEscolhido)
              return m ? (
                <div style={{ maxWidth: 320, width: '100%' }}>
                  <img src={m.splashUrl} alt={m.nome} style={{ width: '100%', borderRadius: 10, border: '2px solid var(--green)', display: 'block', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}
                    onError={e => { e.target.style.display = 'none' }} />
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 24, color: 'var(--green)', marginTop: 10 }}>{m.nome}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>⚡ First pick: <strong style={{ color: sessao.firstPickTime === 'A' ? corA : corB }}>{sessao.firstPickTime === 'A' ? nomeA : nomeB}</strong></div>
                </div>
              ) : null
            })()}
            <Aguardando msg="Aguardando administrador registrar o resultado..." sub="O perdedor receberá a escolha para a próxima partida." />
          </div>
        )}

        {/* ── Próxima partida: perdedor escolhe FP ou Mapa ──────────────── */}
        {(fase === 'proxima_escolhendo' || fase === 'proxima_escolhendo_mapa' || fase === 'proxima_pronta') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Banner: quem perdeu e o que está acontecendo */}
            <div style={{ background: 'var(--bg2)', border: `1px solid ${perdedorCor}44`, borderRadius: 8, padding: '10px 18px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                <span style={{ color: perdedorCor, fontWeight: 700 }}>{perdedorNome}</span> perdeu a última partida e escolhe para a próxima
              </span>
              {sessao.bans.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginLeft: 'auto' }}>
                  {mapasDisponiveisProxima.length} mapas disponíveis
                </span>
              )}
            </div>

            {/* Escolha de FP ou Mapa */}
            {fase === 'proxima_escolhendo' && (
              ehPerdedor ? (
                <EscolhaPreferencia onEscolher={handleProximaPreferencia} />
              ) : (
                <Aguardando msg={`Aguardando ${perdedorNome} escolher...`} sub="Mapa ou First Pick" />
              )
            )}

            {/* Resumo da escolha + grid de mapas para próxima */}
            {(fase === 'proxima_escolhendo_mapa' || fase === 'proxima_pronta') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                    🗺 <span style={{ color: proximaMapTime === 'A' ? corA : corB, fontWeight: 700 }}>{proximaMapTime === 'A' ? nomeA : nomeB}</span> escolhe o mapa
                  </div>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                    ⚡ <span style={{ color: proximaFirstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>{proximaFirstPickTime === 'A' ? nomeA : nomeB}</span> first pick
                  </div>
                </div>

                {fase === 'proxima_escolhendo_mapa' && (
                  <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 17 }}>
                    {timeLocal === proximaMapTime
                      ? <span style={{ color: 'var(--gold2)' }}>🗺 Escolha o mapa da próxima partida!</span>
                      : <span style={{ color: 'var(--text2)' }}>Aguardando {proximaMapTime === 'A' ? nomeA : nomeB} escolher...</span>}
                    {ehEspectador && <span style={{ color: 'var(--text2)' }}>{proximaMapTime === 'A' ? nomeA : nomeB} está escolhendo...</span>}
                  </div>
                )}

                {fase === 'proxima_pronta' && (() => {
                  const m = pool.find(x => x.id === sessao.proximaMapa)
                  return m ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <img src={m.splashUrl} alt={m.nome} style={{ maxWidth: 300, width: '100%', borderRadius: 10, border: '2px solid var(--green)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}
                        onError={e => { e.target.style.display = 'none' }} />
                      <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 22, color: 'var(--green)' }}>{m.nome}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)' }}>⚡ First pick: <strong style={{ color: proximaFirstPickTime === 'A' ? corA : corB }}>{proximaFirstPickTime === 'A' ? nomeA : nomeB}</strong></div>
                      <Aguardando msg="Aguardando administrador confirmar..." />
                    </div>
                  ) : null
                })()}

                {/* Grid de mapas (apenas para escolha, não para proxima_pronta) */}
                {fase === 'proxima_escolhendo_mapa' && (
                  <MapaGrid
                    mapas={pool}
                    bans={bans}
                    jogados={jogados}
                    mapaAtual={sessao.proximaMapa ?? null}
                    meuTurno={timeLocal === proximaMapTime}
                    onSelect={id => setPendente(id)}
                    pendente={pendente}
                    onConfirmar={() => handleProximaMapa(pendente)}
                    onCancelar={() => setPendente(null)}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Encerrado ─────────────────────────────────────────────────── */}
        {fase === 'encerrado' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text3)' }}>SÉRIE ENCERRADA</div>
            {jogados.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {jogados.map((id, i) => {
                  const m = pool.find(x => x.id === id)
                  return <span key={i} style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4, padding: '3px 10px' }}>⚔ {m?.nome ?? id}</span>
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
