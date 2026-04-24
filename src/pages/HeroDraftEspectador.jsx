import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { HEROES } from '../utils/heroPool'
import { getHeroVideoUrl, getHeroImageUrl } from '../utils/heroVideos'
import { passoAtual, ACOES, STATUS_DRAFT } from '../utils/heroDraft'
import { getMapaById } from '../utils/mapPool'
import './HeroDraftEspectador.css'

const TEMPO_TURNO = 30 // segundos por ação/turno

// URL: /hero-draft/espectador?sessao=semifinal-1
export default function HeroDraftEspectador() {
  const [params]  = useSearchParams()
  const sessaoId  = params.get('sessao') ?? 'default'
  const { estado, loading, erro } = useHeroDraft(sessaoId)

  // ── Anúncio de picks (suporta múltiplos picks do mesmo turno) ─────────────
  const [anuncioPicks, setAnuncioPicks] = useState([]) // [{heroi, timeSide}]
  const [anuncioSaindo, setAnuncioSaindo] = useState(false)
  const prevHistLen    = useRef(0)
  const dismissTimer   = useRef(null)
  const saidoTimerRef  = useRef(null)

  // Inicia a animação de saída do overlay e depois limpa
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
        // Ban fecha o overlay com fade se havia pick aberto
        iniciarSaida(0)
        ultimoPick = null
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

  // ── Background pulsante do mapa ──────────────────────────────────────────
  const [mapaVis, setMapaVis] = useState(false)
  useEffect(() => {
    const mapa = getMapaById(estado?.mapaId)
    if (!mapa?.splashUrl) return
    const pulse = () => {
      setMapaVis(true)
      setTimeout(() => setMapaVis(false), 5000)
    }
    pulse()
    const id = setInterval(pulse, 25000)
    return () => clearInterval(id)
  }, [estado?.mapaId]) // eslint-disable-line

  // ── Timer de contagem regressiva por turno ────────────────────────────────
  const [turnoIniciadoEm, setTurnoIniciadoEm] = useState(null)
  const [tempoRestante, setTempoRestante]     = useState(TEMPO_TURNO)
  const prevPassoRef = useRef(null)

  // Sincroniza o timer com o timestamp gravado no Firebase —
  // qualquer espectador que entrar no meio do turno verá o tempo correto.
  useEffect(() => {
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO) return
    const ts = estado.turnoIniciadoEm ?? Date.now()
    if (estado.passoAtual !== prevPassoRef.current || !turnoIniciadoEm) {
      prevPassoRef.current = estado.passoAtual
      const decorrido = Math.floor((Date.now() - ts) / 1000)
      setTurnoIniciadoEm(ts)
      setTempoRestante(Math.max(0, TEMPO_TURNO - decorrido))
    }
  }, [estado?.passoAtual, estado?.status, estado?.turnoIniciadoEm]) // eslint-disable-line

  useEffect(() => {
    if (!turnoIniciadoEm || estado?.status !== STATUS_DRAFT.RODANDO) return
    const tick = setInterval(() => {
      const decorrido = Math.floor((Date.now() - turnoIniciadoEm) / 1000)
      setTempoRestante(Math.max(0, TEMPO_TURNO - decorrido))
    }, 1000)
    return () => clearInterval(tick)
  }, [turnoIniciadoEm, estado?.status])

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loading) return <div className="hde-loading">Conectando ao draft...</div>
  if (erro)    return <div className="hde-loading">Erro: {erro}</div>
  if (!estado) return <div className="hde-loading">Nenhum draft ativo.</div>

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

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="hde-header">

        {/* Time A: bans na borda, nome aponta para o centro */}
        <div className={`hde-team hde-team--a${isRunning && passo?.time === 'A' ? ' hde-team--ativo' : ''}`}>
          <div className="hde-bans-strip">
            {Array.from({ length: bansA }, (_, i) => (
              <HexSlot key={i} heroiId={estado.timeA.bans[i] ?? null} cor={estado.timeA.cor} ban />
            ))}
          </div>
          <span className="hde-tnome" style={{ color: estado.timeA.cor }}>
            {estado.timeA.nome}
          </span>
        </div>

        {/* Centro: mapa + timer circular + dots de fases */}
        <div className="hde-header-mid">
          <div className="hde-mapa-nome">{mapa?.nome ?? 'HEROES OF THE STORM'}</div>
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
            {Array.from({ length: bansB }, (_, i) => (
              <HexSlot key={i} heroiId={estado.timeB.bans[i] ?? null} cor={estado.timeB.cor} ban />
            ))}
          </div>
          <span className="hde-tnome" style={{ color: estado.timeB.cor }}>
            {estado.timeB.nome}
          </span>
        </div>

      </header>

      {/* ── Stage: colunas + centro ───────────────────────────────────────── */}
      <div className="hde-stage">

        <div className="hde-col hde-col--a">
          {Array.from({ length: picksA }, (_, i) => (
            <HexSlot key={i} heroiId={estado.timeA.picks[i] ?? null} cor={estado.timeA.cor} large />
          ))}
        </div>

        <div className="hde-centro">
          {isRunning && passo ? (
            <>
              <div className={`hde-centro-acao hde-centro-acao--${passo.acao}`}>
                {passo.acao === ACOES.BAN ? 'BANIR' : 'ESCOLHER'}
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
            <div className="hde-centro-fim">DRAFT<br />ENCERRADO</div>
          )}
        </div>

        <div className="hde-col hde-col--b">
          {Array.from({ length: picksB }, (_, i) => (
            <HexSlot key={i} heroiId={estado.timeB.picks[i] ?? null} cor={estado.timeB.cor} large />
          ))}
        </div>

      </div>

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

function HexSlot({ heroiId, cor, large = false, ban = false }) {
  const heroi = heroiId ? HEROES.find(h => h.id === heroiId) : null
  const cls = [
    'hde-hex',
    large ? 'hde-hex--l' : 'hde-hex--s',
    heroi ? 'hde-hex--has' : '',
    ban   ? 'hde-hex--ban' : '',
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
            {ban   && <div className="hde-hex-ban-x">✕</div>}
            {large && <div className="hde-hex-name">{heroi.nome}</div>}
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
            <div className="hde-anuncio-nome">{heroi.nome}</div>
            <div className="hde-anuncio-role">{heroi.role}</div>
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
