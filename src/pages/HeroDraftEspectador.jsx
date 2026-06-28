import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { useServerTimeOffset } from '../hooks/useServerTimeOffset'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { heroDraftPath } from '../utils/campeonatoPaths'
import { HEROES } from '../utils/heroPool'
import { getHeroVideoUrl, getHeroImageUrl } from '../utils/heroVideos'
import { passoAtual, getDuracao, ACOES, STATUS_DRAFT, bansLogicos } from '../utils/heroDraft'
import { getMapaById } from '../utils/mapPool'
import TeamIcon from '../components/TeamIcon'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './HeroDraftEspectador.css'

const SHOWMATCH_DRAFT_PATH_LEGACY = 'showmatch/sessaoAtiva/heroDraft'

// ── Tela de resultado dramática ──────────────────────────────────────────────

// Layout por coluna: logo grande → picks em row → bans em row
function ResultadoFinal({ estado, mapa }) {
  const corA  = estado.timeA.cor ?? '#4a9eda'
  const corB  = estado.timeB.cor ?? '#e05555'
  const picksA = estado.timeA.picks ?? []
  const picksB = estado.timeB.picks ?? []
  const bansA  = bansLogicos(estado.timeA.bans ?? [])
  const bansB  = bansLogicos(estado.timeB.bans ?? [])

  const anim = (anim, delay) => ({ animation: `${anim} 0.6s cubic-bezier(0.22,1,0.36,1) both`, animationDelay: `${delay}s` })

  const iconSz    = Math.min(96, Math.max(60, Math.round(window.innerHeight * 0.09)))
  const banSz     = Math.min(52, Math.max(32, Math.round(window.innerHeight * 0.05)))
  const logoSz    = Math.min(260, Math.max(160, Math.round(window.innerHeight * 0.28)))

  const renderPicks = (picks, cor, slideDir, baseDelay) =>
    picks.map((heroId, i) => {
      const h = HEROES.find(x => x.id === heroId)
      return (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, ...anim('hde-res-scale-in', baseDelay + i * 0.12) }}>
          <img src={h?.iconeUrl} alt={h?.nome ?? ''}
            style={{ width: iconSz, height: iconSz, borderRadius: 10, objectFit: 'cover', border: `2px solid ${cor}55`, boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 12px ${cor}33`, display: 'block' }}
            onError={e => { e.target.style.opacity = 0.3 }} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'clamp(9px,1.1vw,13px)', color: 'rgba(255,255,255,0.8)', letterSpacing: '0.04em', maxWidth: iconSz, textAlign: 'center', lineHeight: 1.2 }}>
            {h?.nome ?? heroId}
          </span>
        </div>
      )
    })

  const renderBans = (bans, baseDelay) =>
    bans.map((b, i) => {
      const h = HEROES.find(x => x.id === b.heroiId)
      return (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, ...anim('hde-res-scale-in', baseDelay + i * 0.09) }}>
          <img src={h?.iconeUrl} alt={h?.nome ?? ''}
            style={{ width: banSz, height: banSz, borderRadius: 6, objectFit: 'cover', filter: 'grayscale(65%) brightness(0.5)', border: '1px solid rgba(224,85,85,0.35)', display: 'block' }}
            onError={e => { e.target.style.opacity = 0 }} />
        </div>
      )
    })

  return (
    <div className="hde-resultado">
      {mapa?.splashUrl && <div className="hde-resultado-bg" style={{ backgroundImage: `url(${mapa.splashUrl})` }} />}
      <div className="hde-resultado-glow-a" style={{ background: corA }} />
      <div className="hde-resultado-glow-b" style={{ background: corB }} />

      {/* Label superior */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: 'clamp(10px,1.8vh,22px) 0 0',
        fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(9px,1vw,12px)',
        letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
        ...anim('hde-res-fade-up', 0.1) }}>
        DRAFT ENCERRADO
        {mapa && <span style={{ color: 'var(--gold)', marginLeft: 14 }}>· {mapa.nome}</span>}
      </div>

      {/* Corpo: Time A | divisor | Time B */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── Time A ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(10px,2vh,24px)', padding: 'clamp(10px,2vh,24px) clamp(16px,3vw,48px)' }}>
          {/* Logo + Nome */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, ...anim('hde-res-slide-left', 0.2) }}>
            <TeamIcon time={estado.timeA} size={logoSz} radius={Math.round(logoSz * 0.12)}
              style={{ boxShadow: `0 0 60px ${corA}44`, border: 'none', background: 'transparent' }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(20px,3.2vw,44px)', color: corA, letterSpacing: '0.04em', textShadow: `0 0 28px ${corA}66` }}>
              {estado.timeA.nome}
            </span>
          </div>
          {/* Picks */}
          <div style={{ display: 'flex', gap: 'clamp(6px,0.8vw,14px)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {renderPicks(picksA, corA, 'left', 0.7)}
          </div>
          {/* Bans */}
          {bansA.length > 0 && (
            <div style={{ display: 'flex', gap: 'clamp(4px,0.5vw,8px)', flexWrap: 'wrap', justifyContent: 'center' }}>
              {renderBans(bansA, 1.5)}
            </div>
          )}
        </div>

        {/* Divisor central */}
        <div style={{ width: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.12) 20%, rgba(255,255,255,0.12) 80%, transparent)', flexShrink: 0, ...anim('hde-res-divider', 0.3) }} />

        {/* ── Time B ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(10px,2vh,24px)', padding: 'clamp(10px,2vh,24px) clamp(16px,3vw,48px)' }}>
          {/* Logo + Nome */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, ...anim('hde-res-slide-right', 0.2) }}>
            <TeamIcon time={estado.timeB} size={logoSz} radius={Math.round(logoSz * 0.12)}
              style={{ boxShadow: `0 0 60px ${corB}44`, border: 'none', background: 'transparent' }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(20px,3.2vw,44px)', color: corB, letterSpacing: '0.04em', textShadow: `0 0 28px ${corB}66` }}>
              {estado.timeB.nome}
            </span>
          </div>
          {/* Picks */}
          <div style={{ display: 'flex', gap: 'clamp(6px,0.8vw,14px)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {renderPicks(picksB, corB, 'right', 0.7)}
          </div>
          {/* Bans */}
          {bansB.length > 0 && (
            <div style={{ display: 'flex', gap: 'clamp(4px,0.5vw,8px)', flexWrap: 'wrap', justifyContent: 'center' }}>
              {renderBans(bansB, 1.5)}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// URL: /campeonatos/:id/hero-draft/espectador?sessao=semifinal-1
// URL: /showmatch/espectador?sessao=smXXXXX  (com ID único)
export default function HeroDraftEspectador() {
  const { t } = useTranslation()
  const [params]  = useSearchParams()
  const sessaoId  = params.get('sessao') ?? 'default'
  const { idPublico } = useCampeonato()
  const location      = useLocation()
  const isShowmatch   = location.pathname.startsWith('/showmatch')
  const timeOffset    = useServerTimeOffset()

  const pathOverride = isShowmatch
    ? (sessaoId !== 'default' && sessaoId !== 'showmatch'
        ? `showmatch/sessions/${sessaoId}/heroDraft`
        : SHOWMATCH_DRAFT_PATH_LEGACY)
    : (idPublico ? `${heroDraftPath(idPublico)}/${sessaoId}` : null)

  const { estado, loading, erro } = useHeroDraft(
    isShowmatch ? null : sessaoId, null, pathOverride
  )

  // ── Sessão do showmatch (para lobby do espectador) ────────────────────────
  const [sessaoData, setSessaoData] = useState(null)
  useEffect(() => {
    if (!isShowmatch || !sessaoId || sessaoId === 'default' || sessaoId === 'showmatch') return
    const unsub = onValue(ref(db, `showmatch/sessions/${sessaoId}`), snap => {
      const val = snap.val()
      if (val) { const { heroDraft: _, ...rest } = val; setSessaoData(rest) }
      else setSessaoData(null)
    })
    return unsub
  }, [isShowmatch, sessaoId]) // eslint-disable-line

  // ── Anúncio de picks ─────────────────────────────────────────────────────
  const [anuncioPicks, setAnuncioPicks] = useState([])
  const [anuncioSaindo, setAnuncioSaindo] = useState(false)
  const prevHistLen   = useRef(0)
  const dismissTimer  = useRef(null)
  const saidoTimerRef = useRef(null)

  // ── Anúncio de bans ──────────────────────────────────────────────────────
  const [anuncioBan,       setAnuncioBan]       = useState(null)  // { heroi, timeSide }
  const [anuncioBanSaindo, setAnuncioBanSaindo] = useState(false)
  const banDismissRef = useRef(null)
  const banSaidoRef   = useRef(null)

  const iniciarSaidaBan = () => {
    if (banDismissRef.current) clearTimeout(banDismissRef.current)
    if (banSaidoRef.current)   clearTimeout(banSaidoRef.current)
    setAnuncioBanSaindo(true)
    banSaidoRef.current = setTimeout(() => {
      setAnuncioBan(null)
      setAnuncioBanSaindo(false)
    }, 400)
  }

  // Inicia a animação de saída do overlay de pick e depois limpa
  const iniciarSaida = (delay = 0) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    if (saidoTimerRef.current) clearTimeout(saidoTimerRef.current)
    dismissTimer.current = setTimeout(() => {
      setAnuncioSaindo(true)
      saidoTimerRef.current = setTimeout(() => {
        setAnuncioPicks([])
        setAnuncioSaindo(false)
      }, 420)
    }, delay)
  }

  useEffect(() => {
    if (!estado?.historico || !estado?.sequencia) return
    const hist = estado.historico
    const seq  = estado.sequencia

    if (hist.length <= prevHistLen.current) return

    const novasEntradas = hist.slice(prevHistLen.current)
    prevHistLen.current = hist.length

    let ultimoPick = null

    for (const entry of novasEntradas) {
      if (entry.acao === 'ban') {
        // Fecha overlay de pick imediatamente
        iniciarSaida(0)
        ultimoPick = null
        // Mostra overlay de ban
        const heroi = HEROES.find(h => h.id === entry.heroiId)
        if (heroi) {
          if (banDismissRef.current) clearTimeout(banDismissRef.current)
          if (banSaidoRef.current)   clearTimeout(banSaidoRef.current)
          setAnuncioBanSaindo(false)
          setAnuncioBan({ heroi, timeSide: entry.time })
          banDismissRef.current = setTimeout(iniciarSaidaBan, 2600)
        }
      } else if (entry.acao === 'pick') {
        const heroi = HEROES.find(h => h.id === entry.heroiId)
        if (!heroi) continue
        ultimoPick = entry
        // Cancela qualquer saída em andamento
        if (dismissTimer.current) clearTimeout(dismissTimer.current)
        if (saidoTimerRef.current) clearTimeout(saidoTimerRef.current)
        setAnuncioSaindo(false)
        setAnuncioPicks(prev => {
          // Se o time mudou, recomeça o anúncio
          if (prev.length > 0 && prev[0].timeSide !== entry.time) {
            return [{ heroi, timeSide: entry.time }]
          }
          return [...prev, { heroi, timeSide: entry.time }]
        })
      }
    }

    // Verifica se o grupo de turno terminou → 3s de exibição + fade de saída
    if (ultimoPick) {
      const proximoPasso = seq[estado.passoAtual]
      const grupoContínua =
        proximoPasso &&
        proximoPasso.time === ultimoPick.time &&
        proximoPasso.acao === ultimoPick.acao

      if (!grupoContínua) {
        iniciarSaida(3000)
      }
    }
  }, [estado?.historico?.length, estado?.passoAtual]) // eslint-disable-line

  // ── Tela de resultado final (aparece 1.5s após o draft encerrar) ─────────
  const [mostrarResultado, setMostrarResultado] = useState(false)
  useEffect(() => {
    if (estado?.status !== STATUS_DRAFT.ENCERRADO || mostrarResultado) return
    const t = setTimeout(() => setMostrarResultado(true), 1500)
    return () => clearTimeout(t)
  }, [estado?.status]) // eslint-disable-line

  // ── Background alternante: mapa → logos → mapa → logos ──────────────────
  const [mapaVis, setMapaVis] = useState(false)
  const [logoVis, setLogoVis] = useState(false)
  useEffect(() => {
    const mapa = getMapaById(estado?.mapaId)
    if (!mapa?.splashUrl) return
    let tick = 0
    const PERIOD  = 7000   // intervalo entre fases (escuro = PERIOD - VISIBLE = 2s)
    const VISIBLE = 5000   // duração visível em cada fase

    const run = () => {
      const isMapa = tick % 2 === 0
      if (isMapa) {
        setMapaVis(true);  setLogoVis(false)
        setTimeout(() => setMapaVis(false), VISIBLE)
      } else {
        setLogoVis(true);  setMapaVis(false)
        setTimeout(() => setLogoVis(false), VISIBLE)
      }
      tick++
    }

    run()
    const id = setInterval(run, PERIOD)
    return () => { clearInterval(id); setMapaVis(false); setLogoVis(false) }
  }, [estado?.mapaId]) // eslint-disable-line

  // ── Timer de contagem regressiva por turno ────────────────────────────────
  const [turnoIniciadoEm, setTurnoIniciadoEm] = useState(null)
  const [tempoRestante, setTempoRestante]     = useState(30)
  const prevPassoRef = useRef(null)

  // Sincroniza o timer com o timestamp gravado no Firebase —
  // qualquer espectador que entrar no meio do turno verá o tempo correto.
  useEffect(() => {
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO) return
    const duracao = getDuracao(estado)
    const ts = estado.turnoIniciadoEm ?? (Date.now() + timeOffset)
    if (estado.passoAtual !== prevPassoRef.current || !turnoIniciadoEm) {
      prevPassoRef.current = estado.passoAtual
      const decorrido = Math.floor((Date.now() + timeOffset - ts) / 1000)
      setTurnoIniciadoEm(ts)
      setTempoRestante(Math.max(0, duracao - decorrido))
    }
  }, [estado?.passoAtual, estado?.status, estado?.turnoIniciadoEm, timeOffset]) // eslint-disable-line

  useEffect(() => {
    if (!turnoIniciadoEm || estado?.status !== STATUS_DRAFT.RODANDO) return
    const duracao = getDuracao(estado)
    const tick = setInterval(() => {
      const decorrido = Math.floor((Date.now() + timeOffset - turnoIniciadoEm) / 1000)
      setTempoRestante(Math.max(0, duracao - decorrido))
    }, 1000)
    return () => clearInterval(tick)
  }, [turnoIniciadoEm, estado?.status, timeOffset]) // eslint-disable-line

  // ── Countdown ─────────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(null)
  useEffect(() => {
    if (estado?.status !== STATUS_DRAFT.COUNTDOWN) { setCountdown(null); return }
    const endsAt = estado.countdownStartedAt && estado.countdownSecs
      ? estado.countdownStartedAt + estado.countdownSecs * 1000
      : estado.countdownEndsAt
    if (!endsAt) { setCountdown(null); return }
    const tick = () => setCountdown(Math.max(0, Math.ceil((endsAt - (Date.now() + timeOffset)) / 1000)))
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [estado?.status, estado?.countdownEndsAt, estado?.countdownStartedAt, estado?.countdownSecs, timeOffset])

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loading) return <div className="hde-loading">{t('hero_espectador.connecting')}</div>
  if (erro)    return <div className="hde-loading">Erro: {erro}</div>

  // Showmatch: lobby do espectador enquanto draft não começou
  if (isShowmatch && (!estado || estado.status === STATUS_DRAFT.AGUARDANDO)) {
    return <EspectadorLobby sessaoData={sessaoData} />
  }

  if (!estado) return <div className="hde-loading">{t('hero_espectador.no_draft')}</div>

  // Countdown overlay para o espectador
  if (estado.status === STATUS_DRAFT.COUNTDOWN && countdown !== null) {
    return (
      <div className="hde-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="hde-bg-grid" />
        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
            {t('hero_espectador.countdown_label')}
          </div>
          <div key={countdown} style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 900,
            fontSize: 'clamp(10rem, 28vw, 20rem)', lineHeight: 1,
            color: countdown <= 2 ? '#ff4444' : 'var(--gold2)',
            textShadow: `0 0 80px ${countdown <= 2 ? 'rgba(255,60,60,0.8)' : 'rgba(201,168,76,0.7)'}`,
            animation: 'hde-countdown-pulse 0.15s ease-out',
          }}>
            {countdown || '!'}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginTop: 16, textTransform: 'uppercase' }}>
            {estado.timeA?.nome} <span style={{ color: 'var(--gold)', opacity: 0.6 }}>×</span> {estado.timeB?.nome}
          </div>
        </div>
        <style>{`
          @keyframes hde-countdown-pulse {
            from { transform: scale(1.3); opacity: 0.5; }
            to   { transform: scale(1);   opacity: 1;   }
          }
        `}</style>
      </div>
    )
  }

  const mapa  = getMapaById(estado.mapaId)
  const passo = passoAtual(estado)

  const seq      = estado.sequencia ?? []
  const bansA    = seq.filter(s => s.acao === 'ban'  && s.time === 'A').length || 3
  const bansB    = seq.filter(s => s.acao === 'ban'  && s.time === 'B').length || 3
  const picksA   = seq.filter(s => s.acao === 'pick' && s.time === 'A').length || 5
  const picksB   = seq.filter(s => s.acao === 'pick' && s.time === 'B').length || 5
  const isRunning = estado.status === STATUS_DRAFT.RODANDO

  // Cor do time ativo no anúncio
  const anuncioCor = anuncioPicks.length > 0
    ? (anuncioPicks[0].timeSide === 'A' ? estado.timeA.cor : estado.timeB.cor)
    : '#fff'

  // Timer: urgente quando ≤ 10s
  const timerUrgente = tempoRestante <= 10

  return (
    <div className="hde-root">

      {/* ── Tela de resultado dramática ──────────────────────────────────── */}
      {mostrarResultado && <ResultadoFinal estado={estado} mapa={mapa} />}

      {/* ── Fundo ─────────────────────────────────────────────────────────── */}
      <div className="hde-bg-grid" />
      <div className="hde-glow hde-glow--a" style={{ background: estado.timeA.cor }} />
      <div className="hde-glow hde-glow--b" style={{ background: estado.timeB.cor }} />
      {mapa?.splashUrl && (
        <div
          className={`hde-mapa-bg${mapaVis ? ' hde-mapa-bg--vis' : ''}`}
          style={{ backgroundImage: `url(${mapa.splashUrl})` }}
        />
      )}
      {/* Logos dos times no fundo — sincronizados com o pulso do mapa */}
      <div className={`hde-logo-bg hde-logo-bg--a${logoVis ? ' hde-logo-bg--vis' : ''}`}>
        <TeamIcon time={estado.timeA} size={420} radius={32} style={{ width: '100%', height: '100%' }} />
      </div>
      <div className={`hde-logo-bg hde-logo-bg--b${logoVis ? ' hde-logo-bg--vis' : ''}`}>
        <TeamIcon time={estado.timeB} size={420} radius={32} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="hde-header">

        {/* Time A: bans na borda, nome aponta para o centro */}
        <div className={`hde-team hde-team--a${isRunning && passo?.time === 'A' ? ' hde-team--ativo' : ''}`}>
          <div className="hde-bans-strip">
            {(() => {
              const bans = bansLogicos(estado.timeA.bans)
              return Array.from({ length: bansA }, (_, i) => (
                <HexSlot key={i} heroiId={bans[i]?.heroiId ?? null} parId={bans[i]?.parId} cor={estado.timeA.cor} ban />
              ))
            })()}
          </div>
          <TeamIcon time={estado.timeA} size={28} radius={6} style={{ flexShrink: 0 }} />
          <span className="hde-tnome" style={{ color: estado.timeA.cor }}>
            {estado.timeA.nome}
          </span>
        </div>

        {/* Centro: mapa + timer circular + dots de fases */}
        <div className="hde-header-mid">
          <div className="hde-mapa-nome">{mapa ? t('maps.' + mapa.id, { defaultValue: mapa.nome }) : 'HEROES OF THE STORM'}</div>
          <div className="hde-timer-row">

            {/* Fases concluídas — mais recente mais perto do timer */}
            <div className="hde-fases hde-fases--esq">
              {seq.slice(0, estado.passoAtual).map((p, i) => (
                <FaseDot key={i} passo={p} corA={estado.timeA.cor} corB={estado.timeB.cor} completado />
              ))}
            </div>

            {/* Timer circular */}
            <div className={[
              'hde-timer-circulo',
              timerUrgente && isRunning ? 'hde-timer-circulo--urgente' : '',
              !isRunning ? 'hde-timer-circulo--inativo' : '',
            ].filter(Boolean).join(' ')}>
              {isRunning
                ? tempoRestante
                : estado.status === STATUS_DRAFT.AGUARDANDO ? '⚔' : '✓'}
            </div>

            {/* Fases restantes — próxima mais perto do timer */}
            <div className="hde-fases hde-fases--dir">
              {seq.slice(estado.passoAtual).map((p, i) => (
                <FaseDot key={i} passo={p} corA={estado.timeA.cor} corB={estado.timeB.cor}
                  ativo={i === 0 && isRunning} />
              ))}
            </div>

          </div>
        </div>

        {/* Time B: bans fluindo para o centro + nome */}
        <div className={`hde-team hde-team--b${isRunning && passo?.time === 'B' ? ' hde-team--ativo' : ''}`}>
          <div className="hde-bans-strip hde-bans-strip--rev">
            {(() => {
              const bans = bansLogicos(estado.timeB.bans)
              return Array.from({ length: bansB }, (_, i) => (
                <HexSlot key={i} heroiId={bans[i]?.heroiId ?? null} parId={bans[i]?.parId} cor={estado.timeB.cor} ban />
              ))
            })()}
          </div>
          <span className="hde-tnome" style={{ color: estado.timeB.cor }}>
            {estado.timeB.nome}
          </span>
          <TeamIcon time={estado.timeB} size={28} radius={6} style={{ flexShrink: 0 }} />
        </div>

      </header>

      {/* ── Stage: colunas + centro ───────────────────────────────────────── */}
      <div className="hde-stage">

        {(() => {
          const seq       = estado.sequencia ?? []
          const passoIdx  = estado.passoAtual ?? 0
          const isPickA   = isRunning && passo?.acao === ACOES.PICK && passo?.time === 'A'
          const isPickB   = isRunning && passo?.acao === ACOES.PICK && passo?.time === 'B'
          const nextIdxA  = estado.timeA.picks.length
          const nextIdxB  = estado.timeB.picks.length
          // Pick duplo: próximo passo é pick do mesmo time
          const isDuploA  = isPickA && seq[passoIdx + 1]?.acao === ACOES.PICK && seq[passoIdx + 1]?.time === 'A'
          const isDuploB  = isPickB && seq[passoIdx + 1]?.acao === ACOES.PICK && seq[passoIdx + 1]?.time === 'B'

          const gradA = `linear-gradient(to right, ${estado.timeA.cor}55 0%, transparent 70%)`
          const gradB = `linear-gradient(to left,  ${estado.timeB.cor}55 0%, transparent 70%)`

          return (
            <>
              <div className="hde-col hde-col--a" style={{ position: 'relative' }}>
                {Array.from({ length: picksA }, (_, i) => (
                  <HexSlot key={i} heroiId={estado.timeA.picks[i] ?? null} cor={estado.timeA.cor} large
                    nextPick={isPickA && (i === nextIdxA || (isDuploA && i === nextIdxA + 1))} />
                ))}
                {isPickA && (
                  <div style={{ position: 'absolute', top: -20, bottom: -20, left: -40, right: -8, background: gradA, pointerEvents: 'none', zIndex: -1, transition: 'opacity 0.4s ease', maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)' }} />
                )}
              </div>

              <div className="hde-centro">
          {isRunning && passo ? (
            <>
              <div className={`hde-centro-acao hde-centro-acao--${passo.acao}`}>
                {passo.acao === ACOES.BAN ? t('hero_espectador.action_ban') : t('hero_espectador.action_pick')}
              </div>
              <div
                className="hde-centro-time"
                style={{ color: passo.time === 'A' ? estado.timeA.cor : estado.timeB.cor }}
              >
                {passo.time === 'A' ? estado.timeA.nome : estado.timeB.nome}
              </div>
            </>
          ) : estado.status === STATUS_DRAFT.AGUARDANDO ? (
            <div className="hde-centro-emblema">⚔</div>
          ) : (
            <div className="hde-centro-fim">{t('hero_espectador.draft_ended')}</div>
          )}
        </div>

              <div className="hde-col hde-col--b" style={{ position: 'relative' }}>
                {Array.from({ length: picksB }, (_, i) => (
                  <HexSlot key={i} heroiId={estado.timeB.picks[i] ?? null} cor={estado.timeB.cor} large
                    nextPick={isPickB && (i === nextIdxB || (isDuploB && i === nextIdxB + 1))} />
                ))}
                {isPickB && (
                  <div style={{ position: 'absolute', top: -20, bottom: -20, left: -8, right: -40, background: gradB, pointerEvents: 'none', zIndex: -1, transition: 'opacity 0.4s ease', maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)' }} />
                )}
              </div>
            </>
          )
        })()}

      </div>

      {/* ── Bans globais (rodapé) ────────────────────────────────────────── */}
      {(estado.globalBans?.length > 0) && (
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
          padding: '6px 14px', borderRadius: 8,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
          border: '1px solid rgba(224,85,85,0.2)',
        }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(224,85,85,0.6)', whiteSpace: 'nowrap', marginRight: 2 }}>
            Bans globais
          </span>
          {estado.globalBans.map(id => {
            const h = HEROES.find(h => h.id === id)
            if (!h) return null
            return (
              <div key={id} style={{ position: 'relative', flexShrink: 0 }} title={h.nome}>
                <img src={h.iconeUrl} alt={h.nome}
                  style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', display: 'block', filter: 'grayscale(60%) brightness(0.75)', border: '1px solid rgba(224,85,85,0.35)' }}
                  onError={e => { e.target.style.display = 'none' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 20, height: 1.5, background: 'rgba(224,85,85,0.75)', transform: 'rotate(-45deg)', pointerEvents: 'none' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Overlay de ban ───────────────────────────────────────────────── */}
      {anuncioBan && (
        <AnuncioBanOverlay
          heroi={anuncioBan.heroi}
          timeSide={anuncioBan.timeSide}
          nomeTime={anuncioBan.timeSide === 'A' ? estado.timeA.nome : estado.timeB.nome}
          saindo={anuncioBanSaindo}
        />
      )}

      {/* ── Overlay de anúncio (picks do turno corrente) ─────────────────── */}
      {anuncioPicks.length > 0 && (
        <AnuncioOverlay
          picks={anuncioPicks}
          cor={anuncioCor}
          saindo={anuncioSaindo}
        />
      )}

    </div>
  )
}

// ── Dot de fase (indicador de progresso do draft) ──────────────────────────────

function FaseDot({ passo, corA, corB, completado = false, ativo = false }) {
  const cor   = passo.time === 'A' ? corA : corB
  const isBan = passo.acao === ACOES.BAN
  return (
    <div
      className={[
        'hde-fase-dot',
        isBan      ? 'hde-fase-dot--ban'        : '',
        completado ? 'hde-fase-dot--completado'  : '',
        ativo      ? 'hde-fase-dot--ativo'        : '',
      ].filter(Boolean).join(' ')}
      style={{ '--c': cor }}
    />
  )
}

// ── Slot hexagonal ─────────────────────────────────────────────────────────────

function HexSlot({ heroiId, parId, cor, large = false, ban = false, nextPick = false }) {
  const { t } = useTranslation()
  const heroi = heroiId ? HEROES.find(h => h.id === heroiId) : null
  const par   = parId ? HEROES.find(h => h.id === parId) : null
  const cls = [
    'hde-hex',
    large    ? 'hde-hex--l'         : 'hde-hex--s',
    heroi    ? 'hde-hex--has'       : '',
    ban      ? 'hde-hex--ban'       : '',
    nextPick ? 'hde-hex--next-pick' : '',
    par      ? 'hde-hex--duplo'     : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} style={{ '--c': cor }}>
      <div className="hde-hex-bd" />
      <div className="hde-hex-in">
        {heroi && (
          <>
            <img
              src={heroi.iconeUrl} alt={heroi.nome}
              onError={e => { e.target.src = '/heroes/placeholder.png' }}
            />
            {par && (
              <img
                src={par.iconeUrl} alt={par.nome}
                onError={e => { e.target.src = '/heroes/placeholder.png' }}
              />
            )}
            {ban   && <div className="hde-hex-ban-x">✕</div>}
            {large && <div className="hde-hex-name">{t('heroes.' + heroi.id, { defaultValue: heroi.nome })}</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ── Overlay de anúncio ────────────────────────────────────────────────────────
// Vídeo preenche o overlay inteiro como fundo; nomes ficam sobre ele.
// Para picks duplos: tela dividida ao meio.

function AnuncioOverlay({ picks, cor, saindo }) {
  const { t } = useTranslation()
  return (
    <div className={`hde-anuncio${saindo ? ' hde-anuncio--saindo' : ''}`}>

      {/* Painéis de vídeo em fullscreen (dividem a tela se > 1 pick) */}
      <div className={`hde-anuncio-videos hde-anuncio-videos--${picks.length}`}>
        {picks.map(({ heroi }, idx) => (
          <AnuncioVideoPanel key={`${heroi.id}-${idx}`} heroi={heroi} cor={cor} total={picks.length} />
        ))}
      </div>

      {/* Rais girantes por cima do vídeo */}
      <div className="hde-anuncio-rays" style={{ '--c': cor }} />

      {/* Nomes dos heróis no rodapé */}
      <div className={`hde-anuncio-labels hde-anuncio-labels--${picks.length}`}>
        {picks.map(({ heroi }, idx) => (
          <div key={`${heroi.id}-label-${idx}`} className="hde-anuncio-label">
            <div className="hde-anuncio-nome">{t('heroes.' + heroi.id, { defaultValue: heroi.nome })}</div>
            <div className="hde-anuncio-role">{t('roles.' + heroi.role, { defaultValue: heroi.role })}</div>
          </div>
        ))}
      </div>

    </div>
  )
}

// Painel individual: cascata vídeo → imagem fullsize → hex com ícone
function AnuncioVideoPanel({ heroi, cor }) {
  const videoUrl = getHeroVideoUrl(heroi.id)
  const imageUrl = getHeroImageUrl(heroi.id)
  const [videoFalhou, setVideoFalhou] = useState(false)
  const [imageFalhou, setImageFalhou] = useState(false)

  const usarVideo  = videoUrl && !videoFalhou
  const usarImagem = !usarVideo && imageUrl && !imageFalhou

  return (
    <div className="hde-anuncio-vpanel" style={{ '--c': cor }}>
      {usarVideo ? (
        <video
          src={videoUrl}
          autoPlay muted loop playsInline
          onError={() => setVideoFalhou(true)}
        />
      ) : usarImagem ? (
        /* Fallback 1: imagem fullsize do psionic-storm (mesmo enquadramento do vídeo) */
        <img
          className="hde-anuncio-vpanel-img"
          src={imageUrl}
          alt={heroi.nome}
          onError={() => setImageFalhou(true)}
        />
      ) : (
        /* Fallback 2: hex grande centralizado com ícone local */
        <div className="hde-anuncio-hex-wrap">
          <div className="hde-anuncio-hex" style={{ '--c': cor }}>
            <div className="hde-anuncio-hex-bd" />
            <div className="hde-anuncio-hex-in">
              <img
                src={heroi.iconeUrl} alt={heroi.nome}
                onError={e => { e.target.src = '/heroes/placeholder.png' }}
              />
            </div>
          </div>
        </div>
      )}
      <div className="hde-anuncio-vinheta" />
    </div>
  )
}

// ── Overlay de ban ────────────────────────────────────────────────────────────

function AnuncioBanOverlay({ heroi, timeSide, nomeTime, saindo }) {
  const { t } = useTranslation()
  const videoUrl  = getHeroVideoUrl(heroi.id)
  const imageUrl  = getHeroImageUrl(heroi.id)
  const [videoFalhou, setVideoFalhou] = useState(false)
  const [imageFalhou, setImageFalhou] = useState(false)

  const usarVideo  = videoUrl && !videoFalhou
  const usarImagem = !usarVideo && imageUrl && !imageFalhou

  return (
    <div className={`hde-ban-overlay${saindo ? ' hde-ban-overlay--saindo' : ''}`}>

      {/* Hero em preto e branco como fundo */}
      <div className="hde-ban-midia">
        {usarVideo ? (
          <video src={videoUrl} autoPlay muted loop playsInline className="hde-ban-video"
            onError={() => setVideoFalhou(true)} />
        ) : usarImagem ? (
          <img src={imageUrl} alt={heroi.nome} className="hde-ban-img"
            onError={() => setImageFalhou(true)} />
        ) : (
          <img src={heroi.iconeUrl} alt={heroi.nome} className="hde-ban-img hde-ban-img--icon"
            onError={e => { e.target.src = '/heroes/placeholder.png' }} />
        )}
        {/* Camadas de escurecimento e ruído */}
        <div className="hde-ban-noise" />
        <div className="hde-ban-vinheta" />
      </div>

      {/* Conteúdo central */}
      <div className="hde-ban-conteudo">
        <div className="hde-ban-nome-heroi">{t('heroes.' + heroi.id, { defaultValue: heroi.nome })}</div>
        <div className="hde-ban-stamp">BANIDO</div>
        <div className="hde-ban-sub">{nomeTime} baniu este herói</div>
      </div>

    </div>
  )
}


// ── Lobby do espectador ────────────────────────────────────────────────────────

function EspectadorLobby({ sessaoData }) {
  const { t } = useTranslation()
  const config  = sessaoData?.config ?? {}
  const mapa    = getMapaById(config.mapaId)
  const mapaNome = mapa ? t('maps.' + mapa.id, { defaultValue: mapa.nome }) : null
  const nomeA   = sessaoData?.timeA?.nome ?? 'Time A'
  const nomeB   = sessaoData?.timeB?.nome ?? 'Time B'
  const bans    = (config.globalBans ?? [])
    .map(id => HEROES.find(h => h.id === id))
    .filter(Boolean)

  return (
    <div style={{
      minHeight: '100vh', background: '#050612',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>
      {mapa && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(' + mapa.splashUrl + ')',
          backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: 0.08, filter: 'blur(8px)', transform: 'scale(1.05)',
        }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 700, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.6)' }}>Em breve</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap', textAlign: 'center' }}>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(2rem, 6vw, 3.5rem)', color: '#fff' }}>{nomeA}</span>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'clamp(1rem, 3vw, 1.5rem)', color: 'rgba(201,168,76,0.5)', letterSpacing: '0.1em' }}>VS</span>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 900, fontSize: 'clamp(2rem, 6vw, 3.5rem)', color: '#fff' }}>{nomeB}</span>
        </div>
        {mapa && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <img src={mapa.splashUrl} alt={mapaNome} style={{ width: 280, height: 157, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} onError={e => { e.target.style.display = 'none' }} />
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{mapaNome}</div>
          </div>
        )}
        {bans.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(224,85,85,0.7)' }}>Heróis banidos</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {bans.map(h => (
                <div key={h.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ position: 'relative' }}>
                    <img src={h.iconeUrl} alt={h.nome} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(224,85,85,0.4)', filter: 'grayscale(50%) brightness(0.8)' }} onError={e => { e.target.style.display = 'none' }} />
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'rgba(224,85,85,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 28, height: 1.5, background: 'rgba(224,85,85,0.7)', transform: 'rotate(-45deg)' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif", color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.03em', maxWidth: 48, textAlign: 'center', lineHeight: 1.2 }}>{t('heroes.' + h.id, { defaultValue: h.nome })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {(config.timerBan || config.timerPick) && (
          <div style={{ display: 'flex', gap: 32, opacity: 0.45 }}>
            {[['Ban', config.timerBan], ['Pick', config.timerPick], ['Pick duplo', config.timerPickDuplo]].map(([label, val]) => val ? (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--gold)' }}>{val}s</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</div>
              </div>
            ) : null)}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(201,168,76,0.6)', animation: 'hde-dot-pulse 1.4s ease-in-out ' + (i * 0.2) + 's infinite' }} />
            ))}
          </div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Aguardando início do draft</span>
        </div>
      </div>
      <style>{'@keyframes hde-dot-pulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }'}</style>
    </div>
  )
}
