import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref, set, remove, onValue, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { heroDraftPath } from '../utils/campeonatoPaths'
import { HEROES, getHeroesByRole, ROLES } from '../utils/heroPool'
import { passoAtual, heroiBloqueado, getDuracao, ACOES, STATUS_DRAFT } from '../utils/heroDraft'
import { getMapaById } from '../utils/mapPool'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './HeroDraft.css'

const SHOWMATCH_DRAFT_PATH_LEGACY = 'showmatch/sessaoAtiva/heroDraft'

// URL: /campeonatos/:id/hero-draft?sessao=semifinal-1&time=A
// URL: /showmatch/draft?time=A&sessao=smXXXXX  (com ID único)
export default function HeroDraft() {
  const { t } = useTranslation()
  const [params]      = useSearchParams()
  const sessaoId      = params.get('sessao') ?? 'default'
  const timeLocal     = params.get('time')   ?? null
  const { idPublico } = useCampeonato()
  const location      = useLocation()
  const isShowmatch   = location.pathname.startsWith('/showmatch')

  const pathOverride = isShowmatch
    ? (sessaoId !== 'default' && sessaoId !== 'showmatch'
        ? `showmatch/sessions/${sessaoId}/heroDraft`
        : SHOWMATCH_DRAFT_PATH_LEGACY)
    : (idPublico ? `${heroDraftPath(idPublico)}/${sessaoId}` : null)

  const { estado, loading, erro, ehMinhaTez, agir } = useHeroDraft(
    isShowmatch ? null : sessaoId, timeLocal, pathOverride
  )

  // ── Presença do capitão ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pathOverride || !timeLocal || timeLocal === 'admin') return
    const presRef = ref(db, `${pathOverride}/presence/${timeLocal}`)
    set(presRef, { onlineEm: Date.now() })
    const handleUnload = () => remove(presRef)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      remove(presRef)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [pathOverride, timeLocal]) // eslint-disable-line

  // ── Sessão do showmatch (lobby + confirmação de presença) ────────────────
  const [sessaoData,    setSessaoData]    = useState(null)
  const [sessaoLoading, setSessaoLoading] = useState(true)
  useEffect(() => {
    if (!isShowmatch || !sessaoId || sessaoId === 'default' || sessaoId === 'showmatch') {
      setSessaoLoading(false)
      return
    }
    const unsub = onValue(ref(db, `showmatch/sessions/${sessaoId}`), snap => {
      const val = snap.val()
      if (val) { const { heroDraft: _, ...rest } = val; setSessaoData(rest) }
      else setSessaoData(null)
      setSessaoLoading(false)
    })
    return unsub
  }, [isShowmatch, sessaoId]) // eslint-disable-line

  async function confirmarPresenca() {
    await update(ref(db, `showmatch/sessions/${sessaoId}/presenca`), {
      [timeLocal]: { confirmado: true, confirmedEm: Date.now() },
    })
  }

  // ── Countdown ────────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(null)
  useEffect(() => {
    if (estado?.status !== STATUS_DRAFT.COUNTDOWN || !estado?.countdownEndsAt) {
      setCountdown(null)
      return
    }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((estado.countdownEndsAt - Date.now()) / 1000))
      setCountdown(secs)
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [estado?.status, estado?.countdownEndsAt])

  const [filtroRole, setFiltroRole]     = useState('todos')
  const [busca, setBusca]               = useState('')
  const [confirmando, setConfirmando]   = useState(null)

  // ── Timer sincronizado com Firebase ──────────────────────────────────────
  const [turnoIniciadoEm, setTurnoIniciadoEm] = useState(null)
  const [tempoRestante, setTempoRestante]     = useState(30)
  const prevPassoRef   = useRef(null)
  const autoPickedRef  = useRef(false)
  const autoPickTimer  = useRef(null)
  const confirmandoRef = useRef(null)

  // Mantém ref em sincronia com estado (evita closure stale no setTimeout)
  useEffect(() => { confirmandoRef.current = confirmando }, [confirmando])

  // Ref com snapshot sempre fresco — usada pelo visibilitychange
  const liveRef = useRef({})
  liveRef.current = { estado, ehMinhaTez, agir }

  // Display: setInterval atualiza o contador visual
  useEffect(() => {
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO) return
    const duracao = getDuracao(estado)
    const ts = estado.turnoIniciadoEm ?? Date.now()
    if (estado.passoAtual !== prevPassoRef.current || !turnoIniciadoEm) {
      prevPassoRef.current = estado.passoAtual
      const decorrido = Math.floor((Date.now() - ts) / 1000)
      setTurnoIniciadoEm(ts)
      setTempoRestante(Math.max(0, duracao - decorrido))
    }
  }, [estado?.passoAtual, estado?.status, estado?.turnoIniciadoEm]) // eslint-disable-line

  useEffect(() => {
    if (!turnoIniciadoEm || estado?.status !== STATUS_DRAFT.RODANDO) return
    const duracao = getDuracao(estado)
    const tick = setInterval(() => {
      const decorrido = Math.floor((Date.now() - turnoIniciadoEm) / 1000)
      setTempoRestante(Math.max(0, duracao - decorrido))
    }, 1000)
    return () => clearInterval(tick)
  }, [turnoIniciadoEm, estado?.status]) // eslint-disable-line

  // Auto-pick: setTimeout preciso disparado quando o turno começa
  useEffect(() => {
    if (autoPickTimer.current) clearTimeout(autoPickTimer.current)
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO || !ehMinhaTez()) return

    autoPickedRef.current = false
    const duracao     = getDuracao(estado)
    const ts          = estado.turnoIniciadoEm ?? Date.now()
    const remainingMs = Math.max(0, duracao * 1000 - (Date.now() - ts))
    const snap        = estado // captura o estado do turno atual

    autoPickTimer.current = setTimeout(() => {
      if (autoPickedRef.current) return
      autoPickedRef.current = true
      const heroiId = confirmandoRef.current
        ?? HEROES.filter(h => !heroiBloqueado(snap, h.id)).sort(() => Math.random() - 0.5)[0]?.id
      if (!heroiId) return
      setConfirmando(null)
      agir(heroiId)
    }, remainingMs)

    return () => clearTimeout(autoPickTimer.current)
  }, [estado?.passoAtual, estado?.turnoIniciadoEm]) // eslint-disable-line

  // Backup: ao voltar para a aba, verifica se o timer já expirou
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const { estado: e, ehMinhaTez: emt, agir: ag } = liveRef.current
      if (!e || e.status !== STATUS_DRAFT.RODANDO || !emt()) return
      const ts = e.turnoIniciadoEm ?? Date.now()
      if (Date.now() - ts < getDuracao(e) * 1000 || autoPickedRef.current) return
      autoPickedRef.current = true
      const heroiId = confirmandoRef.current
        ?? HEROES.filter(h => !heroiBloqueado(e, h.id)).sort(() => Math.random() - 0.5)[0]?.id
      if (!heroiId) return
      setConfirmando(null)
      ag(heroiId)
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, []) // monta uma vez; liveRef garante valores frescos

  // ── Herói selecionado para confirmar antes de agir ────────────────────────
  const selecionarHeroi = (heroiId) => {
    if (!ehMinhaTez()) return
    if (heroiBloqueado(estado, heroiId)) return
    setConfirmando(heroiId)
  }

  const confirmarEscolha = async () => {
    if (!confirmando) return
    await agir(confirmando)
    setConfirmando(null)
  }

  const cancelarEscolha = () => setConfirmando(null)

  // ── Pool de heróis filtrada ───────────────────────────────────────────────
  const heroisVisiveis = useMemo(() => {
    return HEROES.filter((h) => {
      if (filtroRole !== 'todos' && h.role !== filtroRole) return false
      if (busca && !h.nome.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [filtroRole, busca])

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loading || (isShowmatch && sessaoLoading)) {
    return <div className="hd-loading">{t('hero_draft.loading')}</div>
  }
  if (erro) return <div className="hd-erro">Erro: {erro}</div>

  // Showmatch: tela unificada de pré-draft (lobby + confirmação)
  // Aparece sempre que a sessão existe e o draft ainda não começou
  if (isShowmatch && sessaoData && (!estado || estado.status === STATUS_DRAFT.AGUARDANDO)) {
    const draftPronto = !!estado && sessaoData?.status === 'lobby'
    const confirmado  = sessaoData?.presenca?.[timeLocal]?.confirmado === true
    const outroTime   = timeLocal === 'A' ? 'B' : 'A'
    const outroConf   = sessaoData?.presenca?.[outroTime]?.confirmado === true
    return (
      <ShowmatchPreDraft
        sessaoData={sessaoData}
        timeLocal={timeLocal}
        draftPronto={draftPronto}
        confirmado={confirmado}
        outroConfirmou={outroConf}
        onConfirmar={confirmarPresenca}
      />
    )
  }

  if (!estado) return <div className="hd-loading">{t('hero_draft.not_found')}</div>

  // ── Overlay de countdown ──────────────────────────────────────────────────
  if (estado.status === STATUS_DRAFT.COUNTDOWN && countdown !== null) {
    return (
      <main className="hero-draft-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050612' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
            {t('hero_draft.countdown_label')}
          </div>
          <div key={countdown} style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 900,
            fontSize: 'clamp(8rem, 22vw, 15rem)', lineHeight: 1,
            color: countdown <= 2 ? '#ff4444' : 'var(--gold2)',
            textShadow: `0 0 60px ${countdown <= 2 ? 'rgba(255,60,60,0.7)' : 'rgba(201,168,76,0.6)'}`,
            animation: 'hd-countdown-pulse 0.15s ease-out',
          }}>
            {countdown || '!'}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginTop: 16 }}>
            {estado.timeA?.nome} × {estado.timeB?.nome}
          </div>
        </div>
        <style>{`
          @keyframes hd-countdown-pulse {
            from { transform: scale(1.25); opacity: 0.6; }
            to   { transform: scale(1);    opacity: 1;   }
          }
        `}</style>
      </main>
    )
  }

  const mapa    = getMapaById(estado.mapaId)
  const passo   = passoAtual(estado)
  const minha   = ehMinhaTez()
  const seq     = estado.sequencia ?? []
  const maxBansA = seq.filter(s => s.acao === 'ban' && s.time === 'A').length || 3
  const maxBansB = seq.filter(s => s.acao === 'ban' && s.time === 'B').length || 3

  return (
    <div
      className="hd-root"
      style={mapa?.splashUrl ? { '--mapa-splash': `url(${mapa.splashUrl})` } : {}}
    >

      {/* ── Header: status do draft ──────────────────────────────────────── */}
      <header className="hd-header" style={mapa?.splashUrl ? { '--mapa-splash': `url(${mapa.splashUrl})` } : {}}>
        <div className="hd-times">
          <TimePanel time={estado.timeA} lado="A" corRealce={estado.timeA.cor} maxBans={maxBansA} />
          <TurnStrip estado={estado} passo={passo} tempoRestante={tempoRestante} mapa={mapa} />
          <TimePanel time={estado.timeB} lado="B" corRealce={estado.timeB.cor} maxBans={maxBansB} />
        </div>
      </header>

      {/* ── Mensagem de status ───────────────────────────────────────────── */}
      {estado.status === STATUS_DRAFT.AGUARDANDO && (
        <div className="hd-aviso hd-aviso--aguardando">
          <div className="hd-aviso-pulse" />
          <div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
              {t('hero_draft.waiting_admin')}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, opacity: 0.65, letterSpacing: '0.04em' }}>
              {timeLocal
                ? `Você está jogando como Time ${timeLocal} · Fique nesta tela`
                : 'Todos os participantes devem estar com a página aberta'
              }
            </div>
          </div>
        </div>
      )}
      {estado.status === STATUS_DRAFT.ENCERRADO && (
        <div className="hd-aviso hd-aviso--fim">{t('hero_draft.draft_ended')}</div>
      )}

      {/* ── Confirmação de escolha ───────────────────────────────────────── */}
      {confirmando && (
        <ConfirmacaoOverlay
          heroiId={confirmando}
          acao={passo?.acao}
          onConfirmar={confirmarEscolha}
          onCancelar={cancelarEscolha}
        />
      )}

      {/* ── Pool de heróis ───────────────────────────────────────────────── */}
      {estado.status === STATUS_DRAFT.RODANDO && (
        <section className="hd-pool">
          <div className="hd-filtros">
            <input
              className="hd-busca"
              placeholder="Buscar herói..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="hd-role-tabs">
              <RoleTab label="Todos" value="todos" ativo={filtroRole} onClick={setFiltroRole} />
              {Object.values(ROLES).map((r) => (
                <RoleTab key={r} label={r} value={r} ativo={filtroRole} onClick={setFiltroRole} />
              ))}
            </div>
          </div>

          <div className="hd-grid">
            {heroisVisiveis.map((heroi) => {
              const bloqueado = heroiBloqueado(estado, heroi.id)
              const selecionado = confirmando === heroi.id
              return (
                <HeroCard
                  key={heroi.id}
                  heroi={heroi}
                  bloqueado={bloqueado}
                  selecionado={selecionado}
                  clicavel={minha && !bloqueado}
                  estado={estado}
                  onClick={() => selecionarHeroi(heroi.id)}
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function TimePanel({ time, lado, corRealce, maxBans = 3 }) {
  return (
    <div className={`hd-time-panel${lado === 'B' ? ' hd-time-panel--b' : ''}`} style={{ '--cor-time': corRealce }}>
      <h2 className="hd-time-nome">{time.nome}</h2>
      <div className="hd-time-secao">
        <span className="hd-time-label">Picks</span>
        <div className="hd-time-slots">
          {Array.from({ length: 5 }).map((_, i) => {
            const heroiId = time.picks[i]
            return <SlotHeroi key={i} heroiId={heroiId} tipo="pick" corTime={corRealce} />
          })}
        </div>
      </div>
      <div className="hd-time-secao">
        <span className="hd-time-label">Bans</span>
        <div className="hd-time-slots hd-time-slots--bans">
          {Array.from({ length: maxBans }).map((_, i) => {
            const heroiId = time.bans[i]
            return <SlotHeroi key={i} heroiId={heroiId} tipo="ban" corTime={corRealce} />
          })}
        </div>
      </div>
    </div>
  )
}

function TurnStrip({ estado, passo, tempoRestante, mapa }) {
  if (estado.status === STATUS_DRAFT.AGUARDANDO) {
    return (
      <div className="hd-turn-strip hd-turn-strip--aguardando">
        {mapa && <span className="hd-turn-mapa">{mapa.nome}</span>}
        <span>Em breve</span>
      </div>
    )
  }
  if (estado.status === STATUS_DRAFT.ENCERRADO || !passo) {
    return (
      <div className="hd-turn-strip hd-turn-strip--fim">
        {mapa && <span className="hd-turn-mapa">{mapa.nome}</span>}
        <span>FIM</span>
      </div>
    )
  }

  const acaoLabel = passo.acao === ACOES.BAN ? 'BANIR' : 'ESCOLHER'
  const timeLabel = `Time ${passo.time}`
  const progresso = `${estado.passoAtual + 1} / ${estado.sequencia.length}`
  const urgente   = tempoRestante <= 10

  return (
    <div className="hd-turn-strip">
      {mapa && <span className="hd-turn-mapa">{mapa.nome}</span>}
      <span className="hd-turn-acao" data-acao={passo.acao}>{acaoLabel}</span>
      <span className="hd-turn-time">{timeLabel}</span>
      <span className={`hd-turn-timer${urgente ? ' hd-turn-timer--urgente' : ''}`}>
        {tempoRestante}
      </span>
      <span className="hd-turn-progresso">{progresso}</span>
    </div>
  )
}

function SlotHeroi({ heroiId, tipo, corTime }) {
  const heroi = heroiId ? HEROES.find((h) => h.id === heroiId) : null
  const vazio = !heroi

  return (
    <div
      className={`hd-slot hd-slot--${tipo} ${vazio ? 'hd-slot--vazio' : ''}`}
      style={{ '--cor-time': corTime }}
      title={heroi?.nome ?? ''}
    >
      {heroi && (
        <>
          <img
            src={heroi.iconeUrl}
            alt={heroi.nome}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          {tipo === 'ban' && <div className="hd-slot-ban-x">✕</div>}
        </>
      )}
    </div>
  )
}

function HeroCard({ heroi, bloqueado, selecionado, clicavel, estado, onClick }) {
  // Determina se foi banido ou pickado e por quem
  const banidoPorA  = (estado.timeA.bans  ?? []).includes(heroi.id)
  const banidoPorB  = (estado.timeB.bans  ?? []).includes(heroi.id)
  const pickadoPorA = (estado.timeA.picks ?? []).includes(heroi.id)
  const pickadoPorB = (estado.timeB.picks ?? []).includes(heroi.id)
  const globalBan   = (estado.globalBans  ?? []).includes(heroi.id)

  let overlay = null
  if (globalBan)   overlay = 'global-ban'
  else if (banidoPorA || banidoPorB) overlay = 'ban'
  else if (pickadoPorA) overlay = 'pick-a'
  else if (pickadoPorB) overlay = 'pick-b'

  return (
    <button
      className={[
        'hd-hero-card',
        bloqueado   ? 'hd-hero-card--bloqueado' : '',
        selecionado ? 'hd-hero-card--selecionado' : '',
        clicavel    ? 'hd-hero-card--clicavel' : '',
      ].join(' ')}
      onClick={clicavel ? onClick : undefined}
      disabled={bloqueado || !clicavel}
      title={heroi.nome}
    >
      <img
        src={heroi.iconeUrl}
        alt={heroi.nome}
        onError={(e) => { e.target.src = '/heroes/placeholder.png' }}
      />
      <span className="hd-hero-nome">{heroi.nome}</span>
      <span className="hd-hero-role">{heroi.role}</span>

      {overlay && (
        <div className={`hd-hero-overlay hd-hero-overlay--${overlay}`}>
          {(overlay === 'ban' || overlay === 'global-ban') && <span>✕</span>}
        </div>
      )}
    </button>
  )
}

function ConfirmacaoOverlay({ heroiId, acao, onConfirmar, onCancelar }) {
  const { t } = useTranslation()
  const heroi = HEROES.find((h) => h.id === heroiId)
  if (!heroi) return null

  const acaoLabel = acao === ACOES.BAN ? t('hero_draft.turn_ban') : t('hero_draft.turn_pick')
  const acaoClass = acao === ACOES.BAN ? 'ban' : 'pick'

  return (
    <div className="hd-confirmar-backdrop" onClick={onCancelar}>
      <div className="hd-confirmar-modal" onClick={(e) => e.stopPropagation()}>
        <img src={heroi.iconeUrl} alt={heroi.nome} className="hd-confirmar-img"
          onError={(e) => { e.target.src = '/heroes/placeholder.png' }} />
        <h3 className="hd-confirmar-nome">{heroi.nome}</h3>
        <p className="hd-confirmar-acao" data-acao={acaoClass}>
          {acaoLabel}?
        </p>
        <div className="hd-confirmar-btns">
          <button className="hd-btn hd-btn--confirmar" onClick={onConfirmar}>{t('hero_draft.confirm')}</button>
          <button className="hd-btn hd-btn--cancelar"  onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function RoleTab({ label, value, ativo, onClick }) {
  return (
    <button
      className={`hd-role-tab ${ativo === value ? 'hd-role-tab--ativo' : ''}`}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  )
}

// ── Pré-draft unificado: lobby + confirmação de presença ──────────────────────
// Aparece assim que a sessão existe, independente de o draft ter sido criado.
// O estado interno muda conforme o fluxo: configurando → lobby → confirmado

function ShowmatchPreDraft({ sessaoData, timeLocal, draftPronto, confirmado, outroConfirmou, onConfirmar }) {
  const config  = sessaoData?.config ?? {}
  const mapa    = getMapaById(config.mapaId)
  const nomeA   = sessaoData?.timeA?.nome ?? 'Time A'
  const nomeB   = sessaoData?.timeB?.nome ?? 'Time B'
  const meuNome = timeLocal === 'A' ? nomeA : timeLocal === 'B' ? nomeB : null
  const outroTime = timeLocal === 'A' ? 'B' : 'A'
  const outroNome = outroTime === 'A' ? nomeA : nomeB

  return (
    <main className="hero-draft-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050612', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
            {draftPronto ? 'DRAFT PRONTO' : 'SALA DE ESPERA'}
          </div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 28, color: '#fff' }}>
            {nomeA} <span style={{ color: 'rgba(255,255,255,0.25)' }}>×</span> {nomeB}
          </div>
          {meuNome && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
              Você: {meuNome}
            </div>
          )}
        </div>

        {/* Config ao vivo */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Mapa</div>
            {mapa ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={mapa.splashUrl} alt={mapa.nome} style={{ width: 80, height: 44, objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)' }} onError={e => { e.target.style.display = 'none' }} />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>{mapa.nome}</span>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Aguardando seleção...</span>
            )}
          </div>

          <div>
            <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Tempo por ação</div>
            <div style={{ display: 'flex', gap: 20 }}>
              {[['Ban', config.timerBan], ['Pick', config.timerPick], ['Pick duplo', config.timerPickDuplo]].map(([label, val]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: val ? 'var(--gold)' : 'rgba(255,255,255,0.2)' }}>
                    {val ?? '—'}s
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {config.globalBans?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                Bans globais ({config.globalBans.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {config.globalBans.map(id => {
                  const h = HEROES.find(h => h.id === id)
                  return h ? (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'rgba(224,85,85,0.9)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      <img src={h.iconeUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                      {h.nome}
                    </div>
                  ) : null
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ação baseada no estado */}
        {!draftPronto && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em' }}>
            <span style={{ display: 'inline-block', animation: 'hd-pulse 2s ease-in-out infinite' }}>⏳</span>
            {' '}Aguardando admin finalizar configurações...
          </div>
        )}

        {draftPronto && timeLocal && !confirmado && (
          <button
            onClick={onConfirmar}
            style={{
              padding: '16px 24px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(76,175,125,0.12)',
              border: '1px solid rgba(76,175,125,0.5)',
              color: 'var(--green)', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 20, letterSpacing: '0.05em',
              boxShadow: '0 0 20px rgba(76,175,125,0.15)',
            }}
          >
            ✓ Confirmar Presença
          </button>
        )}

        {draftPronto && timeLocal && confirmado && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(76,175,125,0.15)', border: '1px solid var(--green)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</span>
              Presença confirmada!
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: "'Barlow Condensed', sans-serif" }}>
              {outroConfirmou
                ? 'Ambos confirmados — aguardando admin iniciar...'
                : `Aguardando ${outroNome} confirmar...`
              }
            </div>
          </div>
        )}

        <style>{`@keyframes hd-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
      </div>
    </main>
  )
}

// ── (legado — mantido por compatibilidade) ────────────────────────────────────

function ShowmatchLobby({ sessaoData, timeLocal }) {
  const config = sessaoData?.config ?? {}
  const mapa   = getMapaById(config.mapaId)
  const nomeA  = sessaoData?.timeA?.nome ?? 'Time A'
  const nomeB  = sessaoData?.timeB?.nome ?? 'Time B'
  const meuNome = timeLocal === 'A' ? nomeA : timeLocal === 'B' ? nomeB : null

  return (
    <main className="hero-draft-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050612', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
            SALA DE ESPERA
          </div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 28, color: '#fff' }}>
            {nomeA} <span style={{ color: 'rgba(255,255,255,0.25)' }}>×</span> {nomeB}
          </div>
          {meuNome && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
              Você: {meuNome}
            </div>
          )}
        </div>

        {/* Config ao vivo */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Mapa */}
          <div>
            <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Mapa</div>
            {mapa ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={mapa.splashUrl} alt={mapa.nome} style={{ width: 80, height: 44, objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)' }} onError={e => { e.target.style.display = 'none' }} />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>{mapa.nome}</span>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Aguardando admin selecionar...</span>
            )}
          </div>

          {/* Timer */}
          <div>
            <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Tempo por ação</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: 'Ban', val: config.timerBan },
                { label: 'Pick', val: config.timerPick },
                { label: 'Pick duplo', val: config.timerPickDuplo },
              ].map(({ label, val }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: val ? 'var(--gold)' : 'rgba(255,255,255,0.2)' }}>
                    {val ?? '—'}s
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bans globais */}
          {config.globalBans?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                Bans globais ({config.globalBans.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {config.globalBans.map(id => {
                  const h = HEROES.find(h => h.id === id)
                  return h ? (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'rgba(224,85,85,0.9)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      <img src={h.iconeUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                      {h.nome}
                    </div>
                  ) : null
                })}
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif', letterSpacing: '0.06em" }}>
          <span style={{ display: 'inline-block', animation: 'hd-pulse 2s ease-in-out infinite' }}>⏳</span>
          {' '}Aguardando admin finalizar configurações...
        </div>
        <style>{`@keyframes hd-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
      </div>
    </main>
  )
}

// ── Confirmação de presença ────────────────────────────────────────────────────

function ShowmatchConfirmacao({ sessaoData, timeLocal, onConfirmar }) {
  const nomeA   = sessaoData?.timeA?.nome ?? 'Time A'
  const nomeB   = sessaoData?.timeB?.nome ?? 'Time B'
  const meuNome = timeLocal === 'A' ? nomeA : nomeB
  const config  = sessaoData?.config ?? {}
  const mapa    = getMapaById(config.mapaId)

  return (
    <main className="hero-draft-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050612', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>

        <div>
          <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
            DRAFT PRONTO
          </div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 26, color: '#fff' }}>
            {nomeA} <span style={{ color: 'rgba(255,255,255,0.25)' }}>×</span> {nomeB}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
            Você está jogando como {meuNome}
          </div>
        </div>

        {/* Resumo do draft */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
          {mapa && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={mapa.splashUrl} alt={mapa.nome} style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} onError={e => { e.target.style.display = 'none' }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: '#fff', fontWeight: 700 }}>{mapa.nome}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16 }}>
            {[['Ban', config.timerBan], ['Pick', config.timerPick], ['Pick duplo', config.timerPickDuplo]].map(([label, val]) => (
              <div key={label} style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", color: 'rgba(255,255,255,0.5)' }}>
                {label}: <strong style={{ color: 'var(--gold)' }}>{val ?? '—'}s</strong>
              </div>
            ))}
          </div>
          {config.globalBans?.length > 0 && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'Barlow Condensed', sans-serif" }}>
              {config.globalBans.length} herói(s) banido(s) globalmente
            </div>
          )}
        </div>

        <button
          onClick={onConfirmar}
          style={{
            padding: '16px 24px', borderRadius: 8, cursor: 'pointer', border: 'none',
            background: 'linear-gradient(135deg, rgba(76,175,125,0.25), rgba(76,175,125,0.12))',
            border: '1px solid rgba(76,175,125,0.5)',
            color: 'var(--green)', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            fontSize: 20, letterSpacing: '0.05em',
            boxShadow: '0 0 20px rgba(76,175,125,0.15)',
          }}
        >
          ✓ Confirmar Presença
        </button>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          O draft começa quando o admin clicar em Iniciar
        </div>
      </div>
    </main>
  )
}

// ── Aguardando outro capitão confirmar ─────────────────────────────────────────

function ShowmatchAguardando({ sessaoData, timeLocal, outroConfirmou }) {
  const outroTime = timeLocal === 'A' ? 'B' : 'A'
  const outroNome = outroTime === 'A' ? sessaoData?.timeA?.nome : sessaoData?.timeB?.nome

  return (
    <main className="hero-draft-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050612' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(76,175,125,0.15)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          ✓
        </div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--green)' }}>
          Presença confirmada!
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {outroConfirmou
            ? 'Ambos confirmados — aguardando admin iniciar o draft...'
            : `Aguardando ${outroNome ?? `Time ${outroTime}`} confirmar...`
          }
        </div>
        <style>{`@keyframes hd-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
      </div>
    </main>
  )
}
