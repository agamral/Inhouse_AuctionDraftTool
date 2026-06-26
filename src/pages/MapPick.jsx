import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { mapPickPath } from '../utils/campeonatoPaths'
import { MAPAS } from '../utils/mapPool'

// ── Helpers ───────────────────────────────────────────────────────────────────

function outroTime(time) { return time === 'A' ? 'B' : 'A' }

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

function getFase(sessao) {
  if (!sessao)                              return 'loading'
  if (!sessao.resultado)                    return 'coin'
  if (!sessao.preferencia)                  return 'escolhendo'
  if ((sessao.bans ?? []).length < 4)       return 'banindo'
  if (!sessao.mapaEscolhido)               return 'escolhendo_mapa'
  return 'encerrado'
}

// ── Animação da moeda ─────────────────────────────────────────────────────────

const coinKeyframes = `
@keyframes coinGira {
  0%   { transform: scaleX(1); }
  25%  { transform: scaleX(0.05); }
  50%  { transform: scaleX(1); }
  75%  { transform: scaleX(0.05); }
  100% { transform: scaleX(1); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes pulseGold {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201,168,76,0.4); }
  50%       { box-shadow: 0 0 0 16px rgba(201,168,76,0); }
}
`

function Moeda({ resultado, animando, onEscolha, ehEscolhedor }) {
  const lado = resultado ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <style>{coinKeyframes}</style>

      {/* Coin visual */}
      <div style={{
        width: 120, height: 120, borderRadius: '50%',
        background: animando
          ? 'linear-gradient(135deg, #c9a84c, #f0cc6e)'
          : lado
            ? 'linear-gradient(135deg, #c9a84c, #f0cc6e)'
            : 'linear-gradient(135deg, #3e3c3a, #2a2826)',
        border: '4px solid var(--gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: animando
          ? 'coinGira 0.25s ease-in-out 6'
          : lado
            ? 'pulseGold 2s ease-in-out infinite'
            : 'none',
        transition: 'background 0.5s',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <span style={{
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 900,
          fontSize: 22, letterSpacing: '0.05em',
          color: animando || lado ? '#0a0c10' : 'var(--gold)',
          animation: lado && !animando ? 'fadeIn 0.4s ease-out' : 'none',
        }}>
          {animando ? '?' : lado === 'cara' ? 'CARA' : lado === 'coroa' ? 'COROA' : '?'}
        </span>
      </div>

      {/* Botões de escolha */}
      {!lado && !animando && ehEscolhedor && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', margin: 0 }}>
            Escolha um lado:
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            {['cara', 'coroa'].map(lado => (
              <button key={lado} className="btn primary" onClick={() => onEscolha(lado)} style={{
                fontSize: 16, fontWeight: 700, padding: '12px 32px',
                fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em',
                textTransform: 'uppercase',
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

function MapaGrid({ mapas, bans, mapaEscolhido, meuTurno, onSelect, pendente, onConfirmar, onCancelar }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
      {mapas.map(m => {
        const banIdx = bans.indexOf(m.id)
        const banido = banIdx !== -1
        const isEscolhido = m.id === mapaEscolhido
        const isPendente = m.id === pendente
        const disponivel = !banido && !mapaEscolhido
        const clicavel = meuTurno && disponivel && !pendente

        return (
          <div key={m.id}
            onClick={() => clicavel && onSelect(m.id)}
            style={{
              position: 'relative', borderRadius: 8, overflow: 'hidden',
              cursor: clicavel ? 'pointer' : 'default',
              opacity: banido ? 0.3 : 1,
              filter: banido ? 'grayscale(100%)' : 'none',
              border: isPendente
                ? '2px solid var(--gold)'
                : isEscolhido
                  ? '2px solid var(--green)'
                  : banido
                    ? '2px solid rgba(224,85,85,0.5)'
                    : meuTurno && disponivel
                      ? '2px solid rgba(255,255,255,0.12)'
                      : '2px solid transparent',
              transition: 'all 0.25s',
              boxShadow: isPendente ? '0 0 12px rgba(201,168,76,0.4)' : isEscolhido ? '0 0 12px rgba(76,175,125,0.4)' : 'none',
              transform: (meuTurno && clicavel) || isPendente ? 'scale(1)' : 'scale(1)',
            }}>
            <img src={m.splashUrl} alt={m.nome}
              onError={e => { e.target.style.background = 'var(--bg3)'; e.target.style.minHeight = '80px' }}
              style={{ width: '100%', height: 88, objectFit: 'cover', display: 'block' }} />
            <div style={{
              padding: '6px 8px',
              background: isPendente ? 'rgba(201,168,76,0.15)' : isEscolhido ? 'rgba(76,175,125,0.15)' : banido ? 'rgba(224,85,85,0.08)' : 'var(--bg3)',
              fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              color: isPendente ? 'var(--gold2)' : isEscolhido ? 'var(--green)' : banido ? 'rgba(224,85,85,0.6)' : meuTurno && disponivel ? 'var(--text)' : 'var(--text2)',
              textAlign: 'center',
            }}>
              {m.nome}
            </div>

            {/* Overlay de ban */}
            {banido && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'rgba(224,85,85,0.85)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 900, color: '#fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}>✕</div>
              </div>
            )}

            {/* Overlay de escolhido */}
            {isEscolhido && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(76,175,125,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'rgba(76,175,125,0.9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 900, color: '#fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}>✓</div>
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

// ── Layout de espera ──────────────────────────────────────────────────────────

function Aguardando({ msg, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 36, opacity: 0.5 }}>⏳</div>
      <p style={{ color: 'var(--text)', fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, margin: 0 }}>{msg}</p>
      {sub && <p style={{ color: 'var(--text2)', fontSize: 13, margin: 0 }}>{sub}</p>}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapPick() {
  const [params] = useSearchParams()
  const sessaoId  = params.get('sessao')
  const timeLocal = params.get('time') // 'A' | 'B' | null (espectador)
  const { idPublico } = useCampeonato()

  const [sessao, setSessao]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [animando, setAnimando]     = useState(false)
  const [pendente, setPendente]     = useState(null) // mapa aguardando confirmação
  const [msg, setMsg]               = useState(null)
  const animJaFezRef                = useRef(false)
  const prevResultadoRef            = useRef(null)

  useEffect(() => {
    if (!idPublico || !sessaoId) return
    return onValue(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), snap => {
      const data = snap.val()
      setSessao(data)
      setLoading(false)

      // Dispara animação quando o resultado da moeda chega (só uma vez)
      if (data?.resultado && !prevResultadoRef.current && !animJaFezRef.current) {
        animJaFezRef.current = true
        setAnimando(true)
        setTimeout(() => setAnimando(false), 1600)
      }
      prevResultadoRef.current = data?.resultado ?? null
    })
  }, [idPublico, sessaoId])

  function flash(texto, tipo = 'ok') {
    setMsg({ texto, tipo })
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Ação: escolher cara ou coroa ──────────────────────────────────────────

  async function handleEscolherFace(face) {
    if (!sessao || animando) return
    const resultado = Math.random() < 0.5 ? 'cara' : 'coroa'
    const vencedor  = resultado === face ? sessao.escolhedor : outroTime(sessao.escolhedor)
    try {
      await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), {
        escolha: face,
        resultado,
        vencedor,
      })
    } catch (e) { flash(e.message, 'err') }
  }

  // ── Ação: escolher preferência (mapa ou first pick) ───────────────────────

  async function handleEscolherPreferencia(pref) {
    if (!sessao?.vencedor) return
    const mapTime      = pref === 'mapa' ? sessao.vencedor : outroTime(sessao.vencedor)
    const firstPickTime = outroTime(mapTime)
    try {
      await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), {
        preferencia: pref,
        mapTime,
        firstPickTime,
      })
    } catch (e) { flash(e.message, 'err') }
  }

  // ── Ação: banir mapa ──────────────────────────────────────────────────────

  async function handleBanir(mapaId) {
    if (!sessao) return
    const bans = [...(sessao.bans ?? []), mapaId]
    const updates = { bans }
    if (bans.length === 4) {
      // entra na fase de escolha — não muda mais nada, a UI detecta automaticamente
    }
    try {
      await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), updates)
      setPendente(null)
    } catch (e) { flash(e.message, 'err') }
  }

  // ── Ação: escolher mapa final ─────────────────────────────────────────────

  async function handleEscolherMapa(mapaId) {
    try {
      await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { mapaEscolhido: mapaId })
      setPendente(null)
    } catch (e) { flash(e.message, 'err') }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>Carregando...</div>
  if (!sessao) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>Sessão não encontrada.</div>

  const fase      = getFase(sessao)
  const mapTime   = getMapTime(sessao)
  const turnoBan  = getTurnoBan(sessao)
  const bans      = sessao.bans ?? []
  const pool      = (sessao.pool ?? []).map(id => MAPAS.find(m => m.id === id)).filter(Boolean)
  const mapeados  = pool.filter(m => !bans.includes(m.id) && m.id !== sessao.mapaEscolhido)

  const nomeA    = sessao.timeA?.nome ?? 'Time A'
  const nomeB    = sessao.timeB?.nome ?? 'Time B'
  const corA     = sessao.timeA?.cor ?? 'var(--blue)'
  const corB     = sessao.timeB?.cor ?? 'var(--red)'
  const meuNome  = timeLocal === 'A' ? nomeA : timeLocal === 'B' ? nomeB : null
  const minhaCor = timeLocal === 'A' ? corA : timeLocal === 'B' ? corB : 'var(--text)'
  const ehEspectador = !timeLocal

  const vencedorNome = sessao.vencedor === 'A' ? nomeA : sessao.vencedor === 'B' ? nomeB : null
  const vencedorCor  = sessao.vencedor === 'A' ? corA : corB

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 20px', gap: 32,
    }}>
      <style>{coinKeyframes}</style>

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
      </div>

      {/* Feedback */}
      {msg && (
        <div style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13,
          background: msg.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
          border: `1px solid ${msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>
          {msg.texto}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── FASE: Cara ou Coroa ─────────────────────────────────────────── */}
        {(fase === 'coin' || (animando && fase === 'escolhendo')) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              CARA OU COROA
            </div>

            <Moeda
              resultado={animando ? null : sessao.resultado}
              animando={animando}
              ehEscolhedor={timeLocal === sessao.escolhedor}
              onEscolha={handleEscolherFace}
            />

            {/* Resultado visível */}
            {sessao.resultado && !animando && (
              <div style={{ textAlign: 'center', animation: 'fadeIn 0.4s ease-out', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 28, fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, color: 'var(--gold2)' }}>
                  {sessao.resultado === 'cara' ? '😎 CARA!' : '👑 COROA!'}
                </div>
                <div style={{ fontSize: 15, color: 'var(--text2)' }}>
                  <span style={{ color: vencedorCor, fontWeight: 700 }}>{vencedorNome}</span> ganhou o cara ou coroa!
                </div>
              </div>
            )}

            {!sessao.resultado && !animando && timeLocal !== sessao.escolhedor && !ehEspectador && (
              <Aguardando
                msg={`Aguardando ${sessao.escolhedor === 'A' ? nomeA : nomeB} escolher...`}
                sub="A moeda será lançada em breve."
              />
            )}
            {ehEspectador && !sessao.resultado && !animando && (
              <Aguardando msg="Aguardando o cara ou coroa..." />
            )}
          </div>
        )}

        {/* ── FASE: Escolher preferência ─────────────────────────────────── */}
        {fase === 'escolhendo' && !animando && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            {/* Resultado da moeda (compacto) */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 20px', fontSize: 14, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
              🪙 {sessao.resultado === 'cara' ? 'Cara' : 'Coroa'} · <span style={{ color: vencedorCor, fontWeight: 700 }}>{vencedorNome}</span> ganhou
            </div>

            {timeLocal === sessao.vencedor ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--text)' }}>
                  Você ganhou! O que prefere?
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => handleEscolherPreferencia('mapa')} style={{
                    fontSize: 18, fontWeight: 700, padding: '16px 36px',
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 32 }}>🗺</span>
                    Escolher Mapa
                    <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, fontFamily: "'Barlow Condensed', sans-serif" }}>
                      Você bana e escolhe o mapa
                    </span>
                  </button>
                  <button className="btn" onClick={() => handleEscolherPreferencia('firstpick')} style={{
                    fontSize: 18, fontWeight: 700, padding: '16px 36px',
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
                    borderColor: 'var(--purple)', color: 'var(--purple)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 32 }}>⚡</span>
                    First Pick
                    <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                      Primeiro pick e ban no draft
                    </span>
                  </button>
                </div>
              </div>
            ) : ehEspectador ? (
              <Aguardando msg={`Aguardando ${vencedorNome} escolher...`} sub="Mapa ou First Pick" />
            ) : (
              <Aguardando
                msg={`Aguardando ${vencedorNome} escolher...`}
                sub="Mapa ou First Pick"
              />
            )}
          </div>
        )}

        {/* ── FASES: Banindo / Escolhendo mapa ───────────────────────────── */}
        {(fase === 'banindo' || fase === 'escolhendo_mapa') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Resumo de quem tem o quê */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                🗺 <span style={{ color: mapTime === 'A' ? corA : corB, fontWeight: 700 }}>{mapTime === 'A' ? nomeA : nomeB}</span> — escolhe o mapa
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                ⚡ <span style={{ color: sessao.firstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>{sessao.firstPickTime === 'A' ? nomeA : nomeB}</span> — first pick
              </div>
            </div>

            {/* Progresso dos bans */}
            {fase === 'banindo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                  Bans — {bans.length}/4
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2, 3].map(i => {
                    const esteMapTime = i % 2 === 0 ? mapTime : outroTime(mapTime)
                    const banMapa = bans[i] ? pool.find(m => m.id === bans[i]) : null
                    return (
                      <div key={i} style={{
                        width: 80, borderRadius: 6, overflow: 'hidden',
                        border: `1px solid ${banMapa ? 'rgba(224,85,85,0.4)' : i === bans.length ? 'var(--gold)' : 'var(--border)'}`,
                        background: banMapa ? 'rgba(224,85,85,0.08)' : 'var(--bg3)',
                        opacity: i > bans.length ? 0.35 : 1,
                      }}>
                        <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '3px 6px', color: esteMapTime === 'A' ? corA : corB, borderBottom: '1px solid var(--border)' }}>
                          {esteMapTime === 'A' ? nomeA : nomeB}
                        </div>
                        <div style={{ padding: '4px 6px', fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", color: banMapa ? 'var(--red)' : i === bans.length ? 'var(--gold)' : 'var(--text3)', minHeight: 22 }}>
                          {banMapa ? `✕ ${banMapa.nome}` : i === bans.length ? 'A banir...' : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Indicador de turno */}
                {timeLocal && (
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16,
                    color: timeLocal === turnoBan ? 'var(--gold2)' : 'var(--text3)'
                  }}>
                    {timeLocal === turnoBan ? '⚡ Sua vez de banir' : `Aguardando ${turnoBan === 'A' ? nomeA : nomeB} banir...`}
                  </div>
                )}
                {ehEspectador && (
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, color: turnoBan === 'A' ? corA : corB }}>
                    Vez de {turnoBan === 'A' ? nomeA : nomeB} banir
                  </div>
                )}
              </div>
            )}

            {/* Indicador fase escolha */}
            {fase === 'escolhendo_mapa' && (
              <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18,
                color: timeLocal === mapTime ? 'var(--gold2)' : 'var(--text2)'
              }}>
                {timeLocal === mapTime
                  ? '🗺 Escolha o mapa para jogar!'
                  : `Aguardando ${mapTime === 'A' ? nomeA : nomeB} escolher o mapa...`}
                {ehEspectador && `${mapTime === 'A' ? nomeA : nomeB} está escolhendo o mapa...`}
              </div>
            )}

            {/* Grid de mapas */}
            <MapaGrid
              mapas={pool}
              bans={bans}
              mapaEscolhido={sessao.mapaEscolhido ?? null}
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

        {/* ── FASE: Encerrado ─────────────────────────────────────────────── */}
        {fase === 'encerrado' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              ESCOLHA CONCLUÍDA
            </div>

            {/* Mapa escolhido — destaque */}
            {(() => {
              const mapa = pool.find(m => m.id === sessao.mapaEscolhido)
              return mapa ? (
                <div style={{ maxWidth: 360, width: '100%' }}>
                  <img src={mapa.splashUrl} alt={mapa.nome}
                    onError={e => { e.target.style.display = 'none' }}
                    style={{ width: '100%', borderRadius: 10, border: '2px solid var(--gold)', display: 'block', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} />
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 28, color: 'var(--gold2)', marginTop: 12 }}>
                    {mapa.nome}
                  </div>
                  <div style={{ color: 'var(--text2)', fontSize: 13 }}>Mapa da próxima partida</div>
                </div>
              ) : null
            })()}

            {/* Resumo */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontFamily: "'Barlow Condensed', sans-serif" }}>
                ⚡ First Pick: <span style={{ color: sessao.firstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>
                  {sessao.firstPickTime === 'A' ? nomeA : nomeB}
                </span>
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontFamily: "'Barlow Condensed', sans-serif" }}>
                🗺 Mapa escolhido por: <span style={{ color: mapTime === 'A' ? corA : corB, fontWeight: 700 }}>
                  {mapTime === 'A' ? nomeA : nomeB}
                </span>
              </div>
            </div>

            {/* Mapas banidos */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {bans.map((id, i) => {
                const m = pool.find(x => x.id === id)
                return m ? (
                  <span key={id} style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--red)', background: 'rgba(224,85,85,0.1)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 4, padding: '2px 8px' }}>
                    ✕ {m.nome}
                  </span>
                ) : null
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
