import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref, set, remove, onValue, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { useAuth } from '../hooks/useAuth'
import { loginCapitao, logout } from '../firebase/auth'
import { useServerTimeOffset } from '../hooks/useServerTimeOffset'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { useDraftConfig } from '../hooks/useConfig'
import { heroDraftPath } from '../utils/campeonatoPaths'
import { HEROES, getHeroesByRole, ROLES } from '../utils/heroPool'
import { passoAtual, heroiBloqueado, getDuracao, ACOES, STATUS_DRAFT, parVinculado, ehInicioDePickDuplo, bansLogicos } from '../utils/heroDraft'
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
  const timeOffset    = useServerTimeOffset()

  const pathOverride = isShowmatch
    ? (sessaoId !== 'default' && sessaoId !== 'showmatch'
        ? `showmatch/sessions/${sessaoId}/heroDraft`
        : SHOWMATCH_DRAFT_PATH_LEGACY)
    : (idPublico ? `${heroDraftPath(idPublico)}/${sessaoId}` : null)

  const { estado, loading, erro, ehMinhaTez, agir, iniciar } = useHeroDraft(
    isShowmatch ? null : sessaoId, timeLocal, pathOverride
  )

  // ── Verificação de identidade do capitão (confronto oficial) ────────────────
  // Garante que quem está acessando ?time=A/B é realmente o capitão daquele
  // time logado na conta correta — evita que um capitão deslogado/com a conta
  // errada trave o draft (writes rejeitados pelas rules viram um loop de
  // ban entrando/saindo na tela).
  const { user: authUser, loading: authLoading, capitao, isAdmin } = useAuth()
  const meuTimeKey   = timeLocal === 'A' ? 'timeA' : timeLocal === 'B' ? 'timeB' : null
  const meuTime      = meuTimeKey ? estado?.[meuTimeKey] : null
  const exigeIdentidade = !isShowmatch && !isAdmin && !!meuTime && (!!meuTime.capitaoUid || !!meuTime.capitaoEmail)
  const identidadeOk = !exigeIdentidade || (!!authUser && (
    (meuTime.capitaoUid   && authUser.uid   === meuTime.capitaoUid) ||
    (meuTime.capitaoEmail && authUser.email === meuTime.capitaoEmail) ||
    // Fallback: credenciais no draft podem estar desatualizadas (conta recriada).
    // Se useAuth confirmou que este usuário é capitão deste campeonato e time,
    // confia nos dados ao vivo do Firebase em vez do snapshot do draft.
    (capitao && capitao.campeonatoId === idPublico && capitao.nome === meuTime.nome)
  ))

  // ── Presença do capitão ────────────────────────────────────────────────────
  // Usa update() em vez de set() pra não sobrescrever a flag `confirmado`
  // (escrita por confirmarPresencaConfronto). Unload limpa só `onlineEm`.
  useEffect(() => {
    if (!pathOverride || !timeLocal || timeLocal === 'admin') return
    const presRef = ref(db, `${pathOverride}/presence/${timeLocal}`)
    update(presRef, { onlineEm: Date.now() })
    const handleUnload = () => update(presRef, { onlineEm: null })
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      update(presRef, { onlineEm: null })
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

  // Confronto oficial: confirmação de presença grava direto no nó do draft,
  // junto com onlineEm. Lida com refresh sem perder a flag.
  async function confirmarPresencaConfronto() {
    if (!pathOverride || !timeLocal) return
    await update(ref(db, `${pathOverride}/presence/${timeLocal}`), {
      confirmado: true, confirmedEm: Date.now(),
    })
  }

  // ── Countdown ────────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(null)
  useEffect(() => {
    if (estado?.status !== STATUS_DRAFT.COUNTDOWN) { setCountdown(null); return }
    // Suporte modelo novo (countdownStartedAt + countdownSecs) e legado (countdownEndsAt)
    const endsAt = estado.countdownStartedAt && estado.countdownSecs
      ? estado.countdownStartedAt + estado.countdownSecs * 1000
      : estado.countdownEndsAt
    if (!endsAt) { setCountdown(null); return }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((endsAt - (Date.now() + timeOffset)) / 1000))
      setCountdown(secs)
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [estado?.status, estado?.countdownEndsAt, estado?.countdownStartedAt, estado?.countdownSecs, timeOffset])

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

  // Ref com snapshot sempre fresco — usada pelo visibilitychange e auto-transição
  const liveRef = useRef({})
  liveRef.current = { estado, ehMinhaTez, agir, timeOffset, iniciar }

  // ── Aviso sonoro de "sua vez" ─────────────────────────────────────────────
  // Toca um ping quando o turno passa a ser do capitão local (borda da subida
  // !minha → minha). Desbloqueia no primeiro clique/tecla, igual ao Draft.jsx.
  const turnoAudioRef    = useRef(null)
  const turnoAudioOkRef  = useRef(false)
  const eraMinhaTezRef   = useRef(false)
  const draftConfig      = useDraftConfig()
  const volumeSuaVez     = (draftConfig.volumeSonsHeroDraft ?? 80) / 100

  useEffect(() => {
    const ping = new Audio('/sounds/ui_bnet_draft_goplayer02.ogg')
    ping.preload = 'auto'
    ping.volume  = volumeSuaVez
    ping.oncanplaythrough = () => { turnoAudioRef.current = ping }

    const unlock = () => { turnoAudioOkRef.current = true }
    document.addEventListener('click',   unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      ping.src = ''
      document.removeEventListener('click',   unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (turnoAudioRef.current) turnoAudioRef.current.volume = volumeSuaVez
  }, [volumeSuaVez])

  useEffect(() => {
    const minhaAgora = estado?.status === STATUS_DRAFT.RODANDO && ehMinhaTez()
    if (minhaAgora && !eraMinhaTezRef.current && turnoAudioOkRef.current && turnoAudioRef.current) {
      turnoAudioRef.current.currentTime = 0
      turnoAudioRef.current.play().catch(() => {})
    }
    eraMinhaTezRef.current = minhaAgora
  }, [estado?.status, estado?.passoAtual])

  // Auto-transição countdown → rodando quando timeLocal === 'admin'.
  // Garante que o draft inicia mesmo se o ShowmatchAdmin / AdminHeroDraftSection
  // não estiver aberto (ex: scrims onde o host abre ?time=admin diretamente).
  useEffect(() => {
    if (timeLocal !== 'admin') return
    if (estado?.status !== STATUS_DRAFT.COUNTDOWN) return
    const endsAt = estado.countdownStartedAt && estado.countdownSecs
      ? estado.countdownStartedAt + estado.countdownSecs * 1000
      : estado.countdownEndsAt
    if (!endsAt) return
    const remaining = Math.max(0, endsAt - (Date.now() + timeOffset))
    const t = setTimeout(() => {
      if (liveRef.current.estado?.status !== STATUS_DRAFT.COUNTDOWN) return
      liveRef.current.iniciar()
    }, remaining + 100)
    return () => clearTimeout(t)
  }, [timeLocal, estado?.status, estado?.countdownEndsAt, estado?.countdownStartedAt, estado?.countdownSecs, timeOffset]) // eslint-disable-line

  // Display: setInterval atualiza o contador visual
  // serverNow = Date.now() + timeOffset corrige clock drift entre clientes
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

  // Auto-pick: setTimeout preciso disparado quando o turno começa.
  // Usa liveRef.current pra acessar estado/agir SEMPRE frescos quando o
  // callback dispara — sem isso, um setTimeout antigo pode chamar agir
  // com estado de turno passado e SOBRESCREVER picks/bans recentes
  // (bug do loop "ban → volta → ban → volta").
  useEffect(() => {
    if (autoPickTimer.current) clearTimeout(autoPickTimer.current)
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO || !ehMinhaTez()) return

    autoPickedRef.current = false
    const turnoOriginal  = estado.passoAtual            // pra abortar se mudou
    const tsOriginal     = estado.turnoIniciadoEm        // idem
    const duracao        = getDuracao(estado)
    const ts             = estado.turnoIniciadoEm ?? (Date.now() + timeOffset)
    const remainingMs    = Math.max(0, duracao * 1000 - (Date.now() + timeOffset - ts))

    autoPickTimer.current = setTimeout(() => {
      if (autoPickedRef.current) return
      // Lê tudo fresco do liveRef — closure pode ter ficado obsoleta
      const { estado: estadoLive, ehMinhaTez: emtLive, agir: agirLive } = liveRef.current
      if (!estadoLive || estadoLive.status !== STATUS_DRAFT.RODANDO) return
      // Aborta se o turno avançou enquanto o timer esperava (outro pick aconteceu)
      if (estadoLive.passoAtual !== turnoOriginal) return
      if (estadoLive.turnoIniciadoEm !== tsOriginal) return
      if (!emtLive()) return

      autoPickedRef.current = true
      const heroiId = confirmandoRef.current
        ?? HEROES.filter(h => !heroiBloqueado(estadoLive, h.id)).sort(() => Math.random() - 0.5)[0]?.id
      if (!heroiId) return
      setConfirmando(null)
      agirLive(heroiId)
    }, remainingMs)

    return () => clearTimeout(autoPickTimer.current)
  }, [estado?.passoAtual, estado?.turnoIniciadoEm, timeOffset]) // eslint-disable-line

  // Backup: ao voltar para a aba, verifica se o timer já expirou
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const { estado: e, ehMinhaTez: emt, agir: ag, timeOffset: off } = liveRef.current
      if (!e || e.status !== STATUS_DRAFT.RODANDO || !emt()) return
      const ts  = e.turnoIniciadoEm ?? (Date.now() + (off ?? 0))
      const now = Date.now() + (off ?? 0)
      if (now - ts < getDuracao(e) * 1000 || autoPickedRef.current) return
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
  // Aparece sempre que o draft ainda não começou — mesmo sem sessaoData carregada
  if (isShowmatch && !sessaoLoading && (!estado || estado.status === STATUS_DRAFT.AGUARDANDO)) {
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

  // Confronto oficial: exige que o capitão esteja logado com a conta correta
  // antes de mostrar a sala de espera ou o draft em si.
  if (exigeIdentidade && authLoading) {
    return <div className="hd-loading">{t('hero_draft.loading')}</div>
  }
  if (exigeIdentidade && !identidadeOk) {
    return (
      <CaptainAccessGate
        nomeTime={meuTime?.nome ?? (timeLocal === 'A' ? 'Time A' : 'Time B')}
        currentUser={authUser}
      />
    )
  }

  // Confronto oficial: mesma sala de espera. Adapta o estado do heroDraft
  // pro shape esperado pelo ShowmatchPreDraft. draftPronto = sempre true
  // (se chegou aqui é porque a sessão foi criada pelo admin).
  if (!isShowmatch && timeLocal && estado && estado.status === STATUS_DRAFT.AGUARDANDO) {
    const sessaoDataCompat = {
      timeA: { nome: estado.timeA?.nome },
      timeB: { nome: estado.timeB?.nome },
      config: {
        mapaId:         estado.mapaId,
        timerBan:       estado.timerConfig?.ban,
        timerPick:      estado.timerConfig?.pick,
        timerPickDuplo: estado.timerConfig?.pickDuplo,
        globalBans:     estado.globalBans ?? [],
      },
    }
    const confirmado  = estado.presence?.[timeLocal]?.confirmado === true
    const outroTime   = timeLocal === 'A' ? 'B' : 'A'
    const outroConf   = estado.presence?.[outroTime]?.confirmado === true
    return (
      <ShowmatchPreDraft
        sessaoData={sessaoDataCompat}
        timeLocal={timeLocal}
        draftPronto={true}
        confirmado={confirmado}
        outroConfirmou={outroConf}
        onConfirmar={confirmarPresencaConfronto}
      />
    )
  }

  if (!estado) return <div className="hd-loading">{t('hero_draft.not_found')}</div>

  // Admin vendo draft encerrado — tela simples com resumo e botão pra fechar
  if (timeLocal === 'admin' && estado.status === STATUS_DRAFT.ENCERRADO) {
    return (
      <main className="hero-draft-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050612', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 40 }}>🏁</div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--gold2)' }}>
          Draft encerrado
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
          {estado.timeA?.nome} × {estado.timeB?.nome}
        </div>
        <button onClick={() => window.close()}
          style={{ marginTop: 8, padding: '10px 28px', borderRadius: 6, fontSize: 14, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}>
          Fechar aba
        </button>
      </main>
    )
  }

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
      className={`hd-root${minha && estado.status === STATUS_DRAFT.RODANDO ? ' hd-root--minha-vez' : ''}`}
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
              <RoleTab label={t('roles.todos')} value="todos" ativo={filtroRole} onClick={setFiltroRole} />
              {Object.values(ROLES).map((r) => (
                <RoleTab key={r} label={t('roles.' + r, { defaultValue: r })} value={r} ativo={filtroRole} onClick={setFiltroRole} />
              ))}
            </div>
          </div>

          <div className="hd-grid">
            {heroisVisiveis.map((heroi) => {
              const restritoChoGall = passo?.acao === ACOES.PICK && parVinculado(heroi.id) && !ehInicioDePickDuplo(estado)
              const bloqueado = heroiBloqueado(estado, heroi.id) || restritoChoGall
              const selecionado = confirmando === heroi.id
              return (
                <HeroCard
                  key={heroi.id}
                  heroi={heroi}
                  bloqueado={bloqueado}
                  motivo={restritoChoGall ? "Cho'Gall só pode ser escolhido no início de um pick duplo" : null}
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
          {(() => {
            const bans = bansLogicos(time.bans)
            return Array.from({ length: maxBans }).map((_, i) => {
              const ban = bans[i]
              return <SlotHeroi key={i} heroiId={ban?.heroiId} parId={ban?.parId} tipo="ban" corTime={corRealce} />
            })
          })()}
        </div>
      </div>
    </div>
  )
}

function TurnStrip({ estado, passo, tempoRestante, mapa }) {
  const { t } = useTranslation()
  const mapaNome = mapa ? t('maps.' + mapa.id, { defaultValue: mapa.nome }) : null
  if (estado.status === STATUS_DRAFT.AGUARDANDO) {
    return (
      <div className="hd-turn-strip hd-turn-strip--aguardando">
        {mapa && <span className="hd-turn-mapa">{mapa.splashUrl && <img src={mapa.splashUrl} alt={mapaNome} onError={e=>{e.target.style.display='none'}} />}{mapaNome}</span>}
        <span>Em breve</span>
      </div>
    )
  }
  if (estado.status === STATUS_DRAFT.ENCERRADO || !passo) {
    return (
      <div className="hd-turn-strip hd-turn-strip--fim">
        {mapa && <span className="hd-turn-mapa">{mapa.splashUrl && <img src={mapa.splashUrl} alt={mapaNome} onError={e=>{e.target.style.display='none'}} />}{mapaNome}</span>}
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
      {mapa && <span className="hd-turn-mapa">{mapaNome}</span>}
      <span className="hd-turn-acao" data-acao={passo.acao}>{acaoLabel}</span>
      <span className="hd-turn-time">{timeLabel}</span>
      <span className={`hd-turn-timer${urgente ? ' hd-turn-timer--urgente' : ''}`}>
        {tempoRestante}
      </span>
      <span className="hd-turn-progresso">{progresso}</span>
    </div>
  )
}

function SlotHeroi({ heroiId, parId, tipo, corTime }) {
  const heroi = heroiId ? HEROES.find((h) => h.id === heroiId) : null
  const par   = parId ? HEROES.find((h) => h.id === parId) : null
  const vazio = !heroi

  return (
    <div
      className={`hd-slot hd-slot--${tipo} ${vazio ? 'hd-slot--vazio' : ''} ${par ? 'hd-slot--duplo' : ''}`}
      style={{ '--cor-time': corTime }}
      title={par ? `${heroi.nome} & ${par.nome}` : heroi?.nome ?? ''}
    >
      {heroi && (
        <>
          <img
            src={heroi.iconeUrl}
            alt={heroi.nome}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          {par && (
            <img
              src={par.iconeUrl}
              alt={par.nome}
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          {tipo === 'ban' && <div className="hd-slot-ban-x">✕</div>}
        </>
      )}
    </div>
  )
}

function HeroCard({ heroi, bloqueado, motivo, selecionado, clicavel, estado, onClick }) {
  const { t } = useTranslation()
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
      title={motivo ?? t('heroes.' + heroi.id, { defaultValue: heroi.nome })}
    >
      <img
        src={heroi.iconeUrl}
        alt={t('heroes.' + heroi.id, { defaultValue: heroi.nome })}
        onError={(e) => { e.target.src = '/heroes/placeholder.png' }}
      />
      <span className="hd-hero-nome">{t('heroes.' + heroi.id, { defaultValue: heroi.nome })}</span>
      <span className="hd-hero-role">{t('roles.' + heroi.role, { defaultValue: heroi.role })}</span>

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
        <img src={heroi.iconeUrl} alt={t('heroes.' + heroi.id, { defaultValue: heroi.nome })} className="hd-confirmar-img"
          onError={(e) => { e.target.src = '/heroes/placeholder.png' }} />
        <h3 className="hd-confirmar-nome">{t('heroes.' + heroi.id, { defaultValue: heroi.nome })}</h3>
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
  const { t } = useTranslation()
  const config  = sessaoData?.config ?? {}
  const mapa    = getMapaById(config.mapaId)
  const mapaNome = mapa ? t('maps.' + mapa.id, { defaultValue: mapa.nome }) : null
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
                <img src={mapa.splashUrl} alt={mapaNome} style={{ width: 80, height: 44, objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)' }} onError={e => { e.target.style.display = 'none' }} />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>{mapaNome}</span>
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
                      {t('heroes.' + h.id, { defaultValue: h.nome })}
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

// ── Verificação de identidade do capitão ──────────────────────────────────────
//
// Bloqueia o acesso ao confronto até o capitão estar autenticado com a conta
// correta. Guia o capitão passo a passo: se a conta logada é de outra pessoa,
// pede para sair e trocar; se ninguém está logado, mostra o login direto na
// tela. Assim que a conta certa for autenticada, o componente desaparece
// automaticamente (useAuth reage à mudança e o fluxo normal continua).

const captainGateInputCss = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '10px 14px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

function CaptainAccessGate({ nomeTime, currentUser }) {
  return (
    <main className="hero-draft-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050612', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
            VERIFICAÇÃO NECESSÁRIA
          </div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 24, color: '#fff' }}>
            Confirme seu acesso como capitão do {nomeTime}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {currentUser ? (
            <CaptainAccessWrongAccount nomeTime={nomeTime} currentUser={currentUser} />
          ) : (
            <CaptainAccessLogin nomeTime={nomeTime} />
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.6 }}>
          Depois de entrar com a conta correta, você voltará automaticamente para a sala de espera.
        </div>
      </div>
    </main>
  )
}

function CaptainAccessWrongAccount({ nomeTime, currentUser }) {
  const [saindo, setSaindo] = useState(false)

  async function handleLogout() {
    setSaindo(true)
    try {
      await logout()
    } finally {
      setSaindo(false)
    }
  }

  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
        Você está logado como <strong style={{ color: 'var(--gold2)' }}>{currentUser.email}</strong>,
        mas esta sala é a do capitão do <strong>{nomeTime}</strong>.
      </p>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.6 }}>
        Saia desta conta e entre novamente com o login do capitão correto para continuar.
      </p>
      <button onClick={handleLogout} disabled={saindo} className="btn primary" style={{ padding: 11, fontSize: 14 }}>
        {saindo ? 'Saindo...' : 'Sair e trocar de conta'}
      </button>
    </>
  )
}

function CaptainAccessLogin({ nomeTime }) {
  const [email,    setEmail]    = useState('')
  const [senha,    setSenha]    = useState('')
  const [erro,     setErro]     = useState(null)
  const [entrando, setEntrando] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    try {
      await loginCapitao(email.trim(), senha)
      // Sucesso: useAuth atualiza authUser automaticamente e a tela
      // volta sozinha para a sala de espera.
    } catch (e) {
      const msgs = {
        'auth/user-not-found':     'Acesso não encontrado.',
        'auth/wrong-password':     'Senha incorreta.',
        'auth/invalid-email':      'Email ou chave inválida.',
        'auth/too-many-requests':  'Muitas tentativas. Aguarde alguns minutos.',
        'auth/invalid-credential': 'Credenciais inválidas.',
      }
      setErro(msgs[e.code] ?? 'Erro ao entrar. Verifique seus dados.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
        Você não está logado. Entre com a conta do capitão do <strong>{nomeTime}</strong> para acessar a sala de espera.
      </p>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" placeholder="Email ou chave de acesso"
          autoComplete="username"
          value={email} onChange={e => setEmail(e.target.value)} required style={captainGateInputCss} />
        <input type="password" placeholder="Senha"
          autoComplete="current-password"
          value={senha} onChange={e => setSenha(e.target.value)} required style={captainGateInputCss} />
        {erro && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{erro}</p>}
        <button type="submit" className="btn primary" disabled={entrando} style={{ padding: 11, fontSize: 14, marginTop: 4 }}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </>
  )
}

// ── (legado — mantido por compatibilidade) ────────────────────────────────────

function ShowmatchLobby({ sessaoData, timeLocal }) {
  const { t } = useTranslation()
  const config = sessaoData?.config ?? {}
  const mapa   = getMapaById(config.mapaId)
  const mapaNome = mapa ? t('maps.' + mapa.id, { defaultValue: mapa.nome }) : null
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
                <img src={mapa.splashUrl} alt={mapaNome} style={{ width: 80, height: 44, objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)' }} onError={e => { e.target.style.display = 'none' }} />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>{mapaNome}</span>
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
                      {t('heroes.' + h.id, { defaultValue: h.nome })}
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
  const { t } = useTranslation()
  const nomeA   = sessaoData?.timeA?.nome ?? 'Time A'
  const nomeB   = sessaoData?.timeB?.nome ?? 'Time B'
  const meuNome = timeLocal === 'A' ? nomeA : nomeB
  const config  = sessaoData?.config ?? {}
  const mapa    = getMapaById(config.mapaId)
  const mapaNome = mapa ? t('maps.' + mapa.id, { defaultValue: mapa.nome }) : null

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
              <img src={mapa.splashUrl} alt={mapaNome} style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} onError={e => { e.target.style.display = 'none' }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: '#fff', fontWeight: 700 }}>{mapaNome}</span>
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
