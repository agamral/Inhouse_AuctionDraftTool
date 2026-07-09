import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { mapPickPath } from '../utils/campeonatoPaths'
import { MAPAS } from '../utils/mapPool'

// Mapeia fuso IANA → código de idioma i18n
function fusoParaLang(fuso) {
  if (!fuso) return null
  if (fuso === 'America/Sao_Paulo' || fuso === 'Europe/Lisbon') return 'pt'
  if (fuso === 'America/New_York') return 'en'
  return 'es' // Argentina, Chile, México, Espanha, etc.
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function outroTime(time) { return time === 'A' ? 'B' : 'A' }

export function getFase(sessao) {
  if (!sessao)                                return 'loading'
  if (sessao.encerrada)                       return 'encerrado'
  if (!sessao.resultado)                      return 'coin'
  if (!sessao.preferencia)                    return 'escolhendo'
  if ((sessao.bans ?? []).length < 4)         return 'banindo'
  if (!sessao.mapaEscolhido)                 return 'escolhendo_mapa'
  if (!sessao.perdedorProxima)               return 'partida_pronta'
  if (!sessao.proximaPreferencia)            return 'proxima_escolhendo'
  if (!sessao.proximaMapa)                   return 'proxima_escolhendo_mapa'
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
  const { t } = useTranslation()
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
          {animando ? '?' : resultado === 'cara' ? t('mapPick.cara').toUpperCase() : resultado === 'coroa' ? t('mapPick.coroa').toUpperCase() : '?'}
        </span>
      </div>

      {!resultado && !animando && ehEscolhedor && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', margin: 0 }}>{t('mapPick.choose_side')}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            {['cara', 'coroa'].map(lado => (
              <button key={lado} className="btn primary" onClick={() => onEscolha(lado)} style={{
                fontSize: 16, fontWeight: 700, padding: '12px 32px',
                fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {lado === 'cara' ? `😎 ${t('mapPick.cara')}` : `👑 ${t('mapPick.coroa')}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Botões de confirmação (reutilizados em vários pontos) ─────────────────────

function ConfirmButtons({ onConfirmar, onCancelar }) {
  const { t } = useTranslation()
  return (
    <>
      <button className="btn primary" onClick={onConfirmar} style={{ fontSize: 13, padding: '6px 16px' }}>{t('mapPick.confirm')}</button>
      <button className="btn" onClick={onCancelar} style={{ fontSize: 13, padding: '6px 12px' }}>{t('mapPick.cancel')}</button>
    </>
  )
}

// ── Grid de mapas ─────────────────────────────────────────────────────────────

function MapaGrid({ mapas, bans, jogados, mapaAtual, meuTurno, onSelect, pendente, onConfirmar, onCancelar }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
      {mapas.map(m => {
        const banido      = bans.includes(m.id)
        const jogado      = jogados.includes(m.id)
        const atual       = m.id === mapaAtual && !jogado
        const isPend      = m.id === pendente
        const indisponivel = banido || jogado
        const clicavel    = meuTurno && !indisponivel && !atual && !pendente

        let borderColor = 'transparent'
        if (isPend)  borderColor = 'var(--gold)'
        else if (atual) borderColor = 'var(--green)'
        else if (meuTurno && !indisponivel && !pendente) borderColor = 'rgba(255,255,255,0.1)'

        return (
          <div key={m.id} onClick={() => clicavel && onSelect(m.id)} style={{
            position: 'relative', borderRadius: 8, overflow: 'hidden',
            cursor: clicavel ? 'pointer' : 'default',
            opacity: indisponivel ? 0.28 : 1,
            filter: indisponivel ? 'grayscale(100%)' : 'none',
            border: `2px solid ${borderColor}`,
            background: isPend ? 'rgba(201,168,76,0.08)' : atual ? 'rgba(76,175,125,0.08)' : 'var(--bg3)',
            transition: 'all 0.22s',
            boxShadow: isPend ? '0 0 14px rgba(201,168,76,0.4)' : atual ? '0 0 14px rgba(76,175,125,0.3)' : 'none',
          }}>
            <img src={m.splashUrl} alt={m.nome}
              onError={e => { e.target.style.background = 'var(--bg3)'; e.target.style.minHeight = '80px' }}
              style={{ width: '100%', height: 86, objectFit: 'cover', display: 'block' }} />
            <div style={{
              padding: '5px 8px', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              color: isPend ? 'var(--gold2)' : atual ? 'var(--green)' : indisponivel ? 'rgba(150,150,150,0.5)' : 'var(--text2)',
              textAlign: 'center',
            }}>
              {m.nome}
            </div>

            {banido && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(224,85,85,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff' }}>✕</div>
              </div>
            )}
            {jogado && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(201,168,76,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#0a0c10' }}>⚔</div>
              </div>
            )}
            {atual && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(76,175,125,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff' }}>✓</div>
              </div>
            )}
          </div>
        )
      })}

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
          <ConfirmButtons onConfirmar={onConfirmar} onCancelar={onCancelar} />
        </div>
      )}
    </div>
  )
}

// ── Escolha FP / Mapa ─────────────────────────────────────────────────────────

function EscolhaPreferencia({ onEscolher }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--text)' }}>
        {t('mapPick.your_choice')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn primary" onClick={() => onEscolher('mapa')} style={{
          fontSize: 17, fontWeight: 700, padding: '16px 32px',
          fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 30 }}>🗺</span>
          {t('mapPick.choose_map')}
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {t('mapPick.choose_map_sub')}
          </span>
        </button>
        <button className="btn" onClick={() => onEscolher('firstpick')} style={{
          fontSize: 17, fontWeight: 700, padding: '16px 32px',
          fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
          borderColor: 'var(--purple)', color: 'var(--purple)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 30 }}>⚡</span>
          {t('mapPick.first_pick')}
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
            {t('mapPick.first_pick_sub')}
          </span>
        </button>
      </div>
    </div>
  )
}

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
  const { t, i18n } = useTranslation()

  const [sessao, setSessao]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [animando, setAnimando] = useState(false)
  const [pendente, setPendente] = useState(null)
  const animJaFezRef            = useRef(false)
  const prevResultadoRef        = useRef(null)

  // ── Auto-detecção de idioma pelo fuso do capitão ──────────────────────────

  useEffect(() => {
    if (!sessao || !timeLocal) return
    const time = timeLocal === 'A' ? sessao.timeA : sessao.timeB
    const lang = fusoParaLang(time?.fuso)
    if (lang && lang !== i18n.language?.slice(0, 2)) {
      i18n.changeLanguage(lang)
    }
  }, [sessao?.timeA?.fuso, sessao?.timeB?.fuso, timeLocal]) // eslint-disable-line

  // ── Listener Firebase ─────────────────────────────────────────────────────

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

  // ── Presença — heartbeat a cada 30s, limpa ao sair ───────────────────────

  useEffect(() => {
    if (!timeLocal || !idPublico || !sessaoId) return
    const presRef = ref(db, `${mapPickPath(idPublico)}/${sessaoId}/presence/${timeLocal}`)
    const escrever = () => update(presRef, { onlineEm: Date.now() })
    escrever()
    const hb = setInterval(escrever, 30000)
    const onUnload = () => update(presRef, { onlineEm: null })
    window.addEventListener('beforeunload', onUnload)
    return () => {
      clearInterval(hb)
      update(presRef, { onlineEm: null })
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [idPublico, sessaoId, timeLocal]) // eslint-disable-line

  // ── Ações dos capitães ────────────────────────────────────────────────────

  const ts = () => ({ atualizadoEm: Date.now() })

  async function handleEscolherFace(face) {
    if (!sessao || animando) return
    const resultado = Math.random() < 0.5 ? 'cara' : 'coroa'
    const vencedor  = resultado === face ? sessao.escolhedor : outroTime(sessao.escolhedor)
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { escolha: face, resultado, vencedor, ...ts() })
  }

  async function handleEscolherPreferencia(pref) {
    if (!sessao?.vencedor) return
    const mapTime       = pref === 'mapa' ? sessao.vencedor : outroTime(sessao.vencedor)
    const firstPickTime = outroTime(mapTime)
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { preferencia: pref, mapTime, firstPickTime, ...ts() })
  }

  async function handleBanir(mapaId) {
    const bans = [...(sessao.bans ?? []), mapaId]
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { bans, ...ts() })
    setPendente(null)
  }

  async function handleEscolherMapa(mapaId) {
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { mapaEscolhido: mapaId, ...ts() })
    setPendente(null)
  }

  async function handleProximaPreferencia(pref) {
    if (!sessao?.perdedorProxima) return
    const perdedor      = sessao.perdedorProxima
    const mapTime       = pref === 'mapa' ? perdedor : outroTime(perdedor)
    const firstPickTime = outroTime(mapTime)
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), {
      proximaPreferencia: pref, proximaMapTime: mapTime, proximaFirstPickTime: firstPickTime, ...ts(),
    })
  }

  async function handleProximaMapa(mapaId) {
    await update(ref(db, `${mapPickPath(idPublico)}/${sessaoId}`), { proximaMapa: mapaId, ...ts() })
    setPendente(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>{t('mapPick.loading')}</div>
  if (!sessao) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>{t('mapPick.notFound')}</div>

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

  const perdedorNome = sessao.perdedorProxima === 'A' ? nomeA : nomeB
  const perdedorCor  = sessao.perdedorProxima === 'A' ? corA  : corB
  const ehPerdedor   = timeLocal === sessao.perdedorProxima

  const proximaMapTime       = sessao.proximaMapTime
  const proximaFirstPickTime = sessao.proximaFirstPickTime
  const mapasDisponiveisProxima = pool.filter(m => !bans.includes(m.id) && !jogados.includes(m.id))

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
            {t('mapPick.you_are')} <span style={{ color: minhaCor, fontWeight: 700 }}>{meuNome}</span>
          </div>
        )}
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

        {/* Cara ou coroa */}
        {(fase === 'coin' || (animando && fase === 'escolhendo')) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text3)' }}>{t('mapPick.coin_section')}</div>
            <Moeda resultado={animando ? null : sessao.resultado} animando={animando} ehEscolhedor={timeLocal === sessao.escolhedor} onEscolha={handleEscolherFace} />
            {sessao.resultado && !animando && (
              <div style={{ textAlign: 'center', animation: 'fadeInUp 0.4s ease-out', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 26, fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, color: 'var(--gold2)' }}>
                  {sessao.resultado === 'cara' ? t('mapPick.cara_result') : t('mapPick.coroa_result')}
                </div>
                <div style={{ fontSize: 15, color: 'var(--text2)' }}>
                  <span style={{ color: vencedorCor, fontWeight: 700 }}>{vencedorNome}</span> {t('mapPick.won_coin')}
                </div>
              </div>
            )}
            {!sessao.resultado && !animando && timeLocal !== sessao.escolhedor && !ehEspectador && (
              <Aguardando msg={t('mapPick.waiting_pick', { nome: sessao.escolhedor === 'A' ? nomeA : nomeB })} sub={t('mapPick.coin_soon')} />
            )}
            {ehEspectador && !sessao.resultado && <Aguardando msg={t('mapPick.waiting_coin')} />}
          </div>
        )}

        {/* Escolher preferência (1ª partida) */}
        {fase === 'escolhendo' && !animando && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 20px', fontSize: 13, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
              🪙 {sessao.resultado === 'cara' ? t('mapPick.cara') : t('mapPick.coroa')} · <span style={{ color: vencedorCor, fontWeight: 700 }}>{vencedorNome}</span> {t('mapPick.won_coin')}
            </div>
            {timeLocal === sessao.vencedor ? (
              <EscolhaPreferencia onEscolher={handleEscolherPreferencia} />
            ) : (
              <Aguardando msg={t('mapPick.waiting_pick', { nome: vencedorNome })} sub={t('mapPick.map_pick_sub')} />
            )}
          </div>
        )}

        {/* Bans + escolha de mapa */}
        {(fase === 'banindo' || fase === 'escolhendo_mapa') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                🗺 <span style={{ color: mapTime === 'A' ? corA : corB, fontWeight: 700 }}>{mapTime === 'A' ? nomeA : nomeB}</span> {t('mapPick.is_choosing_map')}
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                ⚡ <span style={{ color: sessao.firstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>{sessao.firstPickTime === 'A' ? nomeA : nomeB}</span> {t('mapPick.first_pick')}
              </div>
            </div>

            {fase === 'banindo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text3)' }}>{t('mapPick.bans_progress', { atual: bans.length })}</div>
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
                          {banMapa ? `✕ ${banMapa.nome}` : i === bans.length ? t('mapPick.banning') : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {timeLocal && <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: timeLocal === turnoBan ? 'var(--gold2)' : 'var(--text3)' }}>{timeLocal === turnoBan ? t('mapPick.your_turn_ban') : t('mapPick.waiting_ban', { nome: turnoBan === 'A' ? nomeA : nomeB })}</div>}
                {ehEspectador && <div style={{ fontSize: 13, color: turnoBan === 'A' ? corA : corB, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{t('mapPick.waiting_ban', { nome: turnoBan === 'A' ? nomeA : nomeB })}</div>}
              </div>
            )}

            {fase === 'escolhendo_mapa' && (
              <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 17 }}>
                {timeLocal === mapTime ? <span style={{ color: 'var(--gold2)' }}>{t('mapPick.choose_map_now')}</span> : <span style={{ color: 'var(--text2)' }}>{t('mapPick.waiting_map', { nome: mapTime === 'A' ? nomeA : nomeB })}</span>}
                {ehEspectador && <span style={{ color: 'var(--text2)' }}>{t('mapPick.choosing', { nome: mapTime === 'A' ? nomeA : nomeB })}</span>}
              </div>
            )}

            <MapaGrid mapas={pool} bans={bans} jogados={jogados} mapaAtual={sessao.mapaEscolhido ?? null}
              meuTurno={(fase === 'banindo' && timeLocal === turnoBan) || (fase === 'escolhendo_mapa' && timeLocal === mapTime)}
              onSelect={id => setPendente(id)} pendente={pendente}
              onConfirmar={() => fase === 'banindo' ? handleBanir(pendente) : handleEscolherMapa(pendente)}
              onCancelar={() => setPendente(null)} />
          </div>
        )}

        {/* Partida pronta */}
        {fase === 'partida_pronta' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
            {(() => {
              const m = pool.find(x => x.id === sessao.mapaEscolhido)
              return m ? (
                <div style={{ maxWidth: 320, width: '100%' }}>
                  <img src={m.splashUrl} alt={m.nome} style={{ width: '100%', borderRadius: 10, border: '2px solid var(--green)', display: 'block', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }} onError={e => { e.target.style.display = 'none' }} />
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 24, color: 'var(--green)', marginTop: 10 }}>{m.nome}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('mapPick.first_pick_label')} <strong style={{ color: sessao.firstPickTime === 'A' ? corA : corB }}>{sessao.firstPickTime === 'A' ? nomeA : nomeB}</strong></div>
                </div>
              ) : null
            })()}
            <Aguardando msg={t('mapPick.waiting_admin')} sub={t('mapPick.loser_chooses')} />
          </div>
        )}

        {/* Próxima partida */}
        {(fase === 'proxima_escolhendo' || fase === 'proxima_escolhendo_mapa' || fase === 'proxima_pronta') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ background: 'var(--bg2)', border: `1px solid ${perdedorCor}44`, borderRadius: 8, padding: '10px 18px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                <span style={{ color: perdedorCor, fontWeight: 700 }}>{perdedorNome}</span> {t('mapPick.loser_next')}
              </span>
              {bans.length > 0 && <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginLeft: 'auto' }}>{t('mapPick.maps_available', { n: mapasDisponiveisProxima.length })}</span>}
            </div>

            {fase === 'proxima_escolhendo' && (
              ehPerdedor ? <EscolhaPreferencia onEscolher={handleProximaPreferencia} /> : <Aguardando msg={t('mapPick.waiting_pick', { nome: perdedorNome })} sub={t('mapPick.map_pick_sub')} />
            )}

            {(fase === 'proxima_escolhendo_mapa' || fase === 'proxima_pronta') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                    🗺 <span style={{ color: proximaMapTime === 'A' ? corA : corB, fontWeight: 700 }}>{proximaMapTime === 'A' ? nomeA : nomeB}</span> {t('mapPick.is_choosing_map')}
                  </div>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                    ⚡ <span style={{ color: proximaFirstPickTime === 'A' ? corA : corB, fontWeight: 700 }}>{proximaFirstPickTime === 'A' ? nomeA : nomeB}</span> {t('mapPick.first_pick')}
                  </div>
                </div>

                {fase === 'proxima_escolhendo_mapa' && (
                  <>
                    <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 17 }}>
                      {timeLocal === proximaMapTime ? <span style={{ color: 'var(--gold2)' }}>{t('mapPick.choose_next_map')}</span> : <span style={{ color: 'var(--text2)' }}>{t('mapPick.waiting_pick', { nome: proximaMapTime === 'A' ? nomeA : nomeB })}</span>}
                      {ehEspectador && <span style={{ color: 'var(--text2)' }}>{t('mapPick.choosing', { nome: proximaMapTime === 'A' ? nomeA : nomeB })}</span>}
                    </div>
                    <MapaGrid mapas={pool} bans={bans} jogados={jogados} mapaAtual={sessao.proximaMapa ?? null}
                      meuTurno={timeLocal === proximaMapTime}
                      onSelect={id => setPendente(id)} pendente={pendente}
                      onConfirmar={() => handleProximaMapa(pendente)}
                      onCancelar={() => setPendente(null)} />
                  </>
                )}

                {fase === 'proxima_pronta' && (() => {
                  const m = pool.find(x => x.id === sessao.proximaMapa)
                  return m ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <img src={m.splashUrl} alt={m.nome} style={{ maxWidth: 300, width: '100%', borderRadius: 10, border: '2px solid var(--green)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }} onError={e => { e.target.style.display = 'none' }} />
                      <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 22, color: 'var(--green)' }}>{m.nome}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('mapPick.first_pick_label')} <strong style={{ color: proximaFirstPickTime === 'A' ? corA : corB }}>{proximaFirstPickTime === 'A' ? nomeA : nomeB}</strong></div>
                      <Aguardando msg={t('mapPick.waiting_admin_confirm')} />
                    </div>
                  ) : null
                })()}
              </div>
            )}
          </div>
        )}

        {/* Encerrado */}
        {fase === 'encerrado' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text3)' }}>{t('mapPick.series_ended')}</div>
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
