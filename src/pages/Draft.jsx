import { useState, useEffect, useRef } from 'react'
import { ref, onValue, update, set } from 'firebase/database'
import { db } from '../firebase/database'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { useConteudo, useModules } from '../hooks/useConfig'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { draftSessionPath, playerOverridesPath, configDraftPath } from '../utils/campeonatoPaths'
import RoleIcon from '../components/RoleIcon'
import EloIcon, { ELO_CONFIG } from '../components/EloIcon'
import CaptainLogin from '../components/CaptainLogin'
import HeroDraftAlerta from '../components/HeroDraftAlerta'
import PaginaInativa from '../components/PaginaInativa'

const DEFAULT_STATE  = { status: 'aguardando', turnoAtual: null, turnoExtra: null, rodada: 1 }
const DEFAULT_CONFIG = { moedas: 15, minPlayers: 5, maxPlayers: 7 }

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

export default function Draft() {
  const { t } = useTranslation()
  const { isAdmin, capitao } = useAuth()
  const conteudo = useConteudo()
  const modules = useModules()
  const { idPublico } = useCampeonato()
  const isMobile = useIsMobile()

  const [captainSession, setCaptainSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('captainSession')) } catch { return null }
  })

  // Lê params do link personalizado UMA vez (antes de URL ser limpa)
  const [captainLink] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return { cap: p.get('cap'), pin: p.get('pin') }
  })
  const hasCaptainLink = !!(captainLink.cap && captainLink.pin)
  const [autoAuthFailed, setAutoAuthFailed] = useState(false)

  const [captains,    setCaptains]    = useState({})
  const [draftState,  setDraftState]  = useState(DEFAULT_STATE)
  const [playerState, setPlayerState] = useState({})
  const [draftConfig, setDraftConfig] = useState(DEFAULT_CONFIG)
  const [overrides,   setOverrides]   = useState({})
  const [players,     setPlayers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [logAcoes,       setLogAcoes]       = useState([])
  const [guiaAberto,     setGuiaAberto]     = useState(false)
  const [tempoRestante,  setTempoRestante]  = useState(null)
  const [audioUnlocked,  setAudioUnlocked]  = useState(false)
  const [turnAlert,      setTurnAlert]      = useState(false)
  const [turnAlertOpacity, setTurnAlertOpacity] = useState(1)
  const [mobilePanel,    setMobilePanel]    = useState(null) // null | 'meuTime' | 'outros' | 'historico'
  const prevTurnAtualRef = useRef(null)
  const lastActionTsRef  = useRef(null)
  const volRef           = useRef(0.8)
  // Atualizado a cada render (antes de qualquer early return) para que os useEffects leiam o valor atual
  volRef.current = (draftConfig.volumeSons ?? 80) / 100
  const autoPickRef      = useRef(null)
  const liveRef          = useRef({})
  const audioRef         = useRef(null)
  const audioTurnRef     = useRef(null)
  const audioPickRef     = useRef(null)
  const audioStealRef    = useRef(null)

  useEffect(() => {
    let n = 0
    const done = () => { if (++n === 4) setLoading(false) }

    const u1 = onValue(ref(db, `${draftSessionPath(idPublico)}/captains`),    s => { setCaptains(s.val() ?? {}); done() })
    const u2 = onValue(ref(db, `${draftSessionPath(idPublico)}/state`),       s => { setDraftState(s.exists() ? { ...DEFAULT_STATE, ...s.val() } : DEFAULT_STATE); done() })
    const u3 = onValue(ref(db, `${draftSessionPath(idPublico)}/playerState`), s => { setPlayerState(s.val() ?? {}); done() })
    const u4 = onValue(ref(db, playerOverridesPath(idPublico)),               s => { setOverrides(s.val() ?? {}); done() })
    const u5 = onValue(ref(db, configDraftPath(idPublico)),                   s => { if (s.exists()) setDraftConfig(c => ({ ...c, ...s.val() })) })

    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [idPublico])

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then(r => r.json())
      .then(data => { if (data.ok) setPlayers(data.players) })
      .catch(() => {})
  }, [])

  // Se capitão está logado via Firebase Auth, identifica automaticamente no draftSession
  useEffect(() => {
    if (!capitao || captainSession || Object.keys(captains).length === 0) return
    const match = Object.entries(captains).find(([, c]) =>
      (c.capitaoNome && c.capitaoNome === capitao.capitaoNome) ||
      c.nome === capitao.nome
    )
    if (match) {
      setCaptainSession({ captainId: match[0], captainName: match[1].capitaoNome, viaAuth: true })
    }
  }, [capitao, captains]) // eslint-disable-line

  // Acumula log local de ações + toca som para todos os clientes
  useEffect(() => {
    const action = draftState.lastAction
    if (!action?.ts || action.ts === lastActionTsRef.current) return
    lastActionTsRef.current = action.ts
    setLogAcoes(prev => [action, ...prev].slice(0, 20))
    if (action.type === 'steal') playStealSound()
    else if (action.type === 'buy') playPickSound()
  }, [draftState.lastAction?.ts]) // eslint-disable-line

  function handleLogin(session)  { setCaptainSession(session) }
  function handleLogout() {
    sessionStorage.removeItem('captainSession')
    setCaptainSession(null)
  }

  // Auto-login via link personalizado (?cap=ID&pin=1234)
  const autoAuthDone = useRef(false)
  useEffect(() => {
    if (autoAuthDone.current || captainSession || !hasCaptainLink) return
    if (Object.keys(captains).length === 0) return

    autoAuthDone.current = true
    const { cap: capId, pin: capPin } = captainLink
    const cap = captains[capId]

    if (!cap || String(cap.pin) !== String(capPin)) {
      setAutoAuthFailed(true)
      return
    }

    const session = {
      captainId:   capId,
      nome:        cap.nome,
      capitaoNome: cap.capitaoNome ?? null,
      emoji:       cap.emoji,
      cor:         cap.cor,
      seed:        cap.seed,
    }
    sessionStorage.setItem('captainSession', JSON.stringify(session))
    setCaptainSession(session)
    window.history.replaceState({}, '', window.location.pathname)
  }, [captains, captainSession, hasCaptainLink, captainLink])

  // Áudio de countdown — tenta MP3 primeiro, fallback para beeps sintéticos
  const audioCtxRef = useRef(null)

  function playCountdownBeeps() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      for (let i = 0; i < 10; i++) {
        const t    = ctx.currentTime + i           // 1 beep por segundo
        const freq = i < 5 ? 660 : 880            // tom mais agudo nos últimos 5
        const dur  = i === 9 ? 0.4 : 0.08         // último beep mais longo
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.35 * volRef.current, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
        osc.start(t)
        osc.stop(t + dur + 0.05)
      }
      setAudioUnlocked(true)
    } catch (e) {
      console.warn('[Draft] AudioContext indisponível:', e)
    }
  }

  useEffect(() => {
    // Countdown MP3 — fallback para beeps sintéticos se falhar
    const mp3 = new Audio('/sounds/ui_bnet_draft_countdownten01.mp3')
    mp3.preload = 'auto'
    mp3.onerror = () => console.info('[Draft] MP3 não encontrado, usando beeps sintéticos')
    mp3.oncanplaythrough = () => { audioRef.current = mp3 }

    // Som de pick/compra (OGG)
    const pick = new Audio('/sounds/ui_bnet_ready02.ogg')
    pick.preload = 'auto'
    pick.oncanplaythrough = () => { audioPickRef.current = pick }

    // Som de roubo (MP3)
    const steal = new Audio('/sounds/ui_ping_careful01.mp3')
    steal.preload = 'auto'
    steal.oncanplaythrough = () => { audioStealRef.current = steal }

    // Desbloqueia na primeira interação (MP3 e AudioContext)
    const unlock = () => {
      try {
        if (!audioCtxRef.current)
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
        audioCtxRef.current.resume().catch(() => {})
      } catch (e) {}
      if (audioRef.current) {
        audioRef.current.play().then(() => { audioRef.current.pause(); audioRef.current.currentTime = 0 }).catch(() => {})
      }
      setAudioUnlocked(true)
    }
    document.addEventListener('click',   unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      mp3.src   = ''
      pick.src  = ''
      steal.src = ''
      document.removeEventListener('click',   unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  // Alerta visual quando chega o turno do capitão
  useEffect(() => {
    const myId = captainSession?.captainId ?? null
    const isNowMyTurn = myId && draftState.turnoAtual === myId && draftState.status === 'rodando'
    const wasMyTurn   = prevTurnAtualRef.current === myId
    if (isNowMyTurn && !wasMyTurn) {
      setTurnAlert(true)
      setTurnAlertOpacity(1)
      const fade = setTimeout(() => setTurnAlertOpacity(0), 1800)
      const hide = setTimeout(() => setTurnAlert(false), 2400)
      return () => { clearTimeout(fade); clearTimeout(hide) }
    }
    prevTurnAtualRef.current = draftState.turnoAtual
  }, [captainSession, draftState.turnoAtual, draftState.status]) // eslint-disable-line

  // ── Timer de turno (deve ficar antes de qualquer return condicional) ─────────
  useEffect(() => {
    const dur = draftConfig.timerDuracao ?? 60
    if (!dur || draftState.status !== 'rodando') {
      setTempoRestante(null)
      return
    }
    // Se turnoIniciadoEm não existe (draft iniciado antes do timer), começa do zero agora
    const ts = draftState.turnoIniciadoEm ?? Date.now()
    const tick = () => {
      const elapsed  = Math.floor((Date.now() - ts) / 1000)
      const restante = Math.max(0, dur - elapsed)
      setTempoRestante(restante)

      // Dispara beeps de countdown quando faltam 10s
      const tsKey = draftState.turnoIniciadoEm ?? draftState.turnoAtual ?? 'now'
      if (restante <= 11 && restante > 0 && audioTurnRef.current !== tsKey) {
        audioTurnRef.current = tsKey
        if (audioRef.current) {
          audioRef.current.volume = volRef.current
          audioRef.current.currentTime = 0
          audioRef.current.play().catch(() => playCountdownBeeps())
        } else {
          playCountdownBeeps()
        }
      }

      if (restante > 0) return
      if (autoPickRef.current === tsKey) return
      autoPickRef.current = tsKey
      liveRef.current.pularTurno?.()
    }
    tick()
    const iv = setInterval(tick, 500)
    return () => {
      clearInterval(iv)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    }
  }, [draftState.turnoIniciadoEm, draftState.status, draftConfig.timerDuracao]) // eslint-disable-line

  // Bloqueio público — bypass se vier de link personalizado (com ou sem draftAtivo)
  if (!modules.loading && !isAdmin && !capitao && !captainSession && !hasCaptainLink && !modules.draftAtivo) {
    return <PaginaInativa icone="⚔️" titulo="Leilão não iniciado" descricao="O leilão de times ainda não foi aberto pelos organizadores." />
  }

  // Link personalizado presente mas auto-auth ainda processando
  if (hasCaptainLink && !captainSession && !isAdmin && !capitao && !autoAuthFailed) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 65px)', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 36 }}>⏳</div>
        <p style={{ color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', fontSize: 15 }}>Verificando acesso...</p>
      </main>
    )
  }

  // Sem sessão e sem link válido → tela de PIN
  if (!captainSession && !isAdmin && !capitao) return <CaptainLogin onLogin={handleLogin} />
  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando draft...</p></main>

  // ── Dados computados ──────────────────────────────────────
  const fase           = draftState.fase ?? 'titulares'
  const privacidade    = modules.privacidadeAtiva
  const sortedCaptains = Object.entries(captains).sort(([, a], [, b]) => a.seed - b.seed)
  const mid            = Math.ceil(sortedCaptains.length / 2)
  const leftTeams      = sortedCaptains.slice(0, mid)
  const rightTeams     = sortedCaptains.slice(mid)
  // No mobile separamos o time do capitão dos demais (UX mais clara)
  const captainSessionId = captainSession?.captainId ?? null
  const myTeamEntry      = captainSessionId ? sortedCaptains.find(([id]) => id === captainSessionId) : null
  const outrosTimes      = captainSessionId ? sortedCaptains.filter(([id]) => id !== captainSessionId) : sortedCaptains

  const teamCaptainNames = new Set(Object.values(captains).map(c => c.capitaoNome).filter(Boolean))

  const myId        = captainSession?.captainId ?? null
  const myCap       = myId ? captains[myId] : null
  const isMyTurn    = myId ? draftState.turnoAtual === myId : false
  const activeTurnId   = draftState.turnoAtual
  const currentTurnCap = captains[activeTurnId]

  // Pool disponível — sem dono e não descartado
  // Na fase titular: exclui jogadores inscritos como Reserva
  const availablePlayers = players.filter(p =>
    !overrides[p.id]?.descartado &&
    !teamCaptainNames.has(p.discord) &&
    !playerState[p.id]?.ownedBy &&
    (fase === 'reservas' || p.titularReserva !== 'Reserva')
  )

  // Roubáveis: dependem da fase
  const stealablePlayers = players.filter(p => {
    const ps = playerState[p.id]
    if (!ps?.ownedBy || ps.ownedBy === myId) return false
    if (overrides[p.id]?.descartado || teamCaptainNames.has(p.discord)) return false
    if (fase === 'reservas') {
      return ps.tipoPosse === 'reserva' && !captains[ps.ownedBy]?.exitou
    }
    return true
  })

  function playPickSound() {
    if (audioPickRef.current) {
      audioPickRef.current.volume = volRef.current
      audioPickRef.current.currentTime = 0
      audioPickRef.current.play().catch(() => {})
    }
  }

  function playStealSound() {
    if (audioStealRef.current) {
      audioStealRef.current.volume = volRef.current
      audioStealRef.current.currentTime = 0
      audioStealRef.current.play().catch(() => {})
    }
  }

  // Pular turno — chamado pelo timer quando tempo esgota
  async function pularTurno() {
    const ses       = draftSessionPath(idPublico)
    const currentId = draftState.turnoAtual
    const currentCap = captains[currentId] ?? {}
    const currentSize = fase === 'reservas'
      ? Object.keys(currentCap.reservas ?? {}).length
      : Object.keys(currentCap.roster  ?? {}).length + 1
    const next = proximoCom(sortedCaptains, captains, currentId, currentSize, draftConfig, fase)
    if (!next) {
      await update(ref(db, `${ses}/state`), { status: fase === 'titulares' ? 'entre_fases' : 'encerrado' })
      return
    }
    await update(ref(db), {
      [`${ses}/state/turnoAtual`]:      next.id,
      [`${ses}/state/turnoExtra`]:      null,
      [`${ses}/state/turnoIniciadoEm`]: Date.now(),
      ...(next.novaRodada ? { [`${ses}/state/rodada`]: (draftState.rodada ?? 1) + 1 } : {}),
    })
  }

  // Ref ao vivo para o auto-pick do timer (evita closure stale)
  liveRef.current = { isMyTurn, myCap, availablePlayers, playerState, draftConfig, fase, comprar, comprarReserva, pularTurno }

  // ── Ação de compra ────────────────────────────────────────
  async function comprar(player) {
    if (!isMyTurn || !myCap) return
    const preco = playerState[player.id]?.preco ?? 0
    if (myCap.moedas < preco) return
    const rosterSize = Object.keys(myCap.roster ?? {}).length + 1
    if (rosterSize >= draftConfig.maxPlayers) return

    const ses = draftSessionPath(idPublico)
    const updates = {}
    updates[`${ses}/captains/${myId}/roster/${player.id}`] = { discord: player.discord, preco, isCaptain: false }
    updates[`${ses}/playerState/${player.id}/preco`]   = preco + 1
    updates[`${ses}/playerState/${player.id}/ownedBy`] = myId
    updates[`${ses}/captains/${myId}/moedas`]          = myCap.moedas - preco
    updates[`${ses}/state/lastAction`] = {
      type: 'buy', playerDiscord: player.discord,
      playerElo: player.elo, playerRole: player.rolePrimaria,
      byTeamId: myId, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
      preco, ts: Date.now(),
    }

    updates[`${ses}/playerState/${player.id}/tipoPosse`] = 'titular'
    const myNewSize = rosterSize + 1
    const next = proximoCom(sortedCaptains, captains, myId, myNewSize, draftConfig, 'titulares')
    if (!next) {
      updates[`${ses}/state/status`]     = 'entre_fases'
      updates[`${ses}/state/turnoAtual`] = null
    } else {
      updates[`${ses}/state/turnoAtual`] = next.id
      if (next.novaRodada) updates[`${ses}/state/rodada`] = (draftState.rodada ?? 1) + 1
    }

    updates[`${ses}/state/turnoIniciadoEm`] = Date.now()
    await update(ref(db), updates)
  }

  // ── Ação de roubo ─────────────────────────────────────────
  async function roubar(player) {
    if (!isMyTurn || !myCap) return
    if (!draftConfig.rouboAtivo) return
    const ps = playerState[player.id]
    if (!ps?.ownedBy || ps.ownedBy === myId) return

    const preco      = ps.preco                           // custo do roubo = preço atual
    if (myCap.moedas < preco) return
    const rosterAtual = Object.keys(myCap.roster ?? {}).length + 1
    if (rosterAtual >= draftConfig.maxPlayers) return

    const fromId  = ps.ownedBy
    const fromCap = captains[fromId]
    const paguei  = fromCap?.roster?.[player.id]?.preco ?? 0 // o que o dono pagou (reembolso)

    const ses = draftSessionPath(idPublico)
    const updates = {}

    // Move o jogador de roster
    updates[`${ses}/captains/${fromId}/roster/${player.id}`] = null
    updates[`${ses}/captains/${myId}/roster/${player.id}`]   = { discord: player.discord, preco, isCaptain: false }

    // Preço sobe +1
    updates[`${ses}/playerState/${player.id}/preco`]   = preco + 1
    updates[`${ses}/playerState/${player.id}/ownedBy`] = myId

    // Transação de moedas
    updates[`${ses}/captains/${myId}/moedas`]   = myCap.moedas - preco
    updates[`${ses}/captains/${fromId}/moedas`] = (fromCap?.moedas ?? 0) + paguei

    updates[`${ses}/state/lastAction`] = {
      type: 'steal', playerDiscord: player.discord,
      playerElo: player.elo, playerRole: player.rolePrimaria,
      byTeamId: myId, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
      fromTeamId: fromId, fromTeamNome: fromCap?.nome, fromTeamEmoji: fromCap?.emoji, fromTeamCor: fromCap?.cor,
      preco, ts: Date.now(),
    }

    const rosterSize = Object.keys(myCap.roster ?? {}).length + 1
    const myNewSize  = rosterSize + 1
    const next = proximoCom(sortedCaptains, captains, myId, myNewSize, draftConfig, 'titulares')
    if (next) {
      updates[`${ses}/state/turnoAtual`] = next.id
      if (next.novaRodada) updates[`${ses}/state/rodada`] = (draftState.rodada ?? 1) + 1
    } else {
      updates[`${ses}/state/status`]     = 'entre_fases'
      updates[`${ses}/state/turnoAtual`] = null
    }

    updates[`${ses}/state/turnoIniciadoEm`] = Date.now()
    await update(ref(db), updates)
  }

  // ── Fase de Reservas: ações ──────────────────────────────
  async function comprarReserva(player) {
    if (!isMyTurn || !myCap) return
    const preco = playerState[player.id]?.preco ?? 0
    if (myCap.moedas < preco) return
    const reservasCount = Object.keys(myCap.reservas ?? {}).length
    if (reservasCount >= 2) return

    const ses = draftSessionPath(idPublico)
    const updates = {}
    updates[`${ses}/captains/${myId}/reservas/${player.id}`] = { discord: player.discord, preco }
    updates[`${ses}/playerState/${player.id}/preco`]         = preco + 1
    updates[`${ses}/playerState/${player.id}/ownedBy`]       = myId
    updates[`${ses}/playerState/${player.id}/tipoPosse`]     = 'reserva'
    updates[`${ses}/captains/${myId}/moedas`]                = myCap.moedas - preco
    updates[`${ses}/state/lastAction`] = {
      type: 'buy', playerDiscord: player.discord,
      playerElo: player.elo, playerRole: player.rolePrimaria,
      byTeamId: myId, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
      preco, ts: Date.now(),
    }

    const myNewReservas = reservasCount + 1
    const next = proximoCom(sortedCaptains, captains, myId, myNewReservas, draftConfig, 'reservas')
    if (!next) {
      updates[`${ses}/state/status`] = 'encerrado'
    } else {
      updates[`${ses}/state/turnoAtual`] = next.id
      if (next.novaRodada) updates[`${ses}/state/rodada`] = (draftState.rodada ?? 1) + 1
    }
    updates[`${ses}/state/turnoIniciadoEm`] = Date.now()
    await update(ref(db), updates)
  }

  async function roubarReserva(player) {
    if (!isMyTurn || !myCap) return
    if (!draftConfig.rouboAtivo) return
    const ps = playerState[player.id]
    if (!ps?.ownedBy || ps.ownedBy === myId || ps.tipoPosse !== 'reserva') return
    const fromId  = ps.ownedBy
    const fromCap = captains[fromId]
    if (fromCap?.exitou) return

    const preco = ps.preco
    if (myCap.moedas < preco) return
    const reservasAtual = Object.keys(myCap.reservas ?? {}).length
    if (reservasAtual >= 2) return

    const paguei = fromCap?.reservas?.[player.id]?.preco ?? 0
    const ses    = draftSessionPath(idPublico)
    const updates = {}
    updates[`${ses}/captains/${fromId}/reservas/${player.id}`] = null
    updates[`${ses}/captains/${myId}/reservas/${player.id}`]   = { discord: player.discord, preco }
    updates[`${ses}/playerState/${player.id}/preco`]     = preco + 1
    updates[`${ses}/playerState/${player.id}/ownedBy`]   = myId
    updates[`${ses}/captains/${myId}/moedas`]            = myCap.moedas - preco
    updates[`${ses}/captains/${fromId}/moedas`]          = (fromCap?.moedas ?? 0) + paguei
    updates[`${ses}/state/lastAction`] = {
      type: 'steal', playerDiscord: player.discord,
      playerElo: player.elo, playerRole: player.rolePrimaria,
      byTeamId: myId, byTeamNome: myCap.nome, byTeamEmoji: myCap.emoji, byTeamCor: myCap.cor,
      fromTeamId: fromId, fromTeamNome: fromCap?.nome, fromTeamEmoji: fromCap?.emoji, fromTeamCor: fromCap?.cor,
      preco, ts: Date.now(),
    }

    const myNewReservas = reservasAtual + 1
    const next = proximoCom(sortedCaptains, captains, myId, myNewReservas, draftConfig, 'reservas')
    if (next) {
      updates[`${ses}/state/turnoAtual`] = next.id
      if (next.novaRodada) updates[`${ses}/state/rodada`] = (draftState.rodada ?? 1) + 1
    } else {
      updates[`${ses}/state/status`] = 'encerrado'
    }
    updates[`${ses}/state/turnoIniciadoEm`] = Date.now()
    await update(ref(db), updates)
  }

  async function sairDraft() {
    if (!isMyTurn || !myCap) return
    const ses = draftSessionPath(idPublico)
    const updates = {}
    updates[`${ses}/captains/${myId}/exitou`] = true

    const next = proximoCom(sortedCaptains, captains, myId, 2, draftConfig, 'reservas')
    if (!next) {
      updates[`${ses}/state/status`] = 'encerrado'
    } else {
      updates[`${ses}/state/turnoAtual`] = next.id
      if (next.novaRodada) updates[`${ses}/state/rodada`] = (draftState.rodada ?? 1) + 1
    }
    updates[`${ses}/state/turnoIniciadoEm`] = Date.now()
    await update(ref(db), updates)
  }

  // ── Entre fases ───────────────────────────────────────────
  if (draftState.status === 'entre_fases') {
    return (
      <div style={{ minHeight: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
        <div style={{ fontSize: 48 }}>🏆</div>
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--gold2)', margin: 0 }}>
          Fase de Titulares Encerrada
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, margin: 0 }}>Todos os times formados. Aguardando início do Leilão de Reservas.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 720, marginTop: 8 }}>
          {sortedCaptains.map(([id, team]) => (
            <div key={id} style={{ border: `1px solid ${team.cor}44`, borderRadius: 10, padding: '12px 20px', background: team.cor + '0a', minWidth: 160 }}>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: team.cor, marginBottom: 6 }}>
                {team.emoji} {team.nome}
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--gold)', marginBottom: 4 }}>
                {team.capitaoNome} ⚑ · 🪙 {team.moedas}
              </div>
              {Object.values(team.roster ?? {}).map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>{r.discord}</div>
              ))}
            </div>
          ))}
        </div>
        {captainSession && <SessionBadge session={captainSession} onLogout={handleLogout} />}
        {isAdmin && <AdminDraftBar draftState={draftState} sortedCaptains={sortedCaptains} captains={captains} draftConfig={draftConfig} idPublico={idPublico} />}
      </div>
    )
  }

  // ── Tela de espera ────────────────────────────────────────
  if (draftState.status === 'aguardando') {
    const nTimes = sortedCaptains.length
    return (
      <div style={{ minHeight: 'calc(100vh - 65px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '24px' }}>
        <div style={{ fontSize: '48px' }}>⏳</div>
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '24px', color: 'var(--text)', margin: 0 }}>
          Leilão ainda não iniciado
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: '14px', margin: 0, textAlign: 'center', maxWidth: 380 }}>
          {captainSession || capitao
            ? 'Você está logado e pronto. Aguarde o admin iniciar o leilão.'
            : 'O admin ainda não iniciou o leilão de times.'
          }
        </p>
        {nTimes > 0 && (
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--text3)', margin: 0 }}>
            {nTimes} time{nTimes !== 1 ? 's' : ''} cadastrado{nTimes !== 1 ? 's' : ''} · aguardando início
          </p>
        )}
        {conteudo.proximoEvento && (
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--gold2)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', padding: '6px 18px', borderRadius: 20 }}>
            📅 {conteudo.proximoEvento}
          </div>
        )}
        {captainSession && <SessionBadge session={captainSession} onLogout={handleLogout} />}
        {isAdmin && <AdminDraftBar draftState={draftState} sortedCaptains={sortedCaptains} captains={captains} draftConfig={draftConfig} idPublico={idPublico} />}
      </div>
    )
  }

  // ── Draft encerrado ───────────────────────────────────────
  if (draftState.status === 'encerrado') {
    const playerByDiscord = Object.fromEntries(players.map(p => [p.discord, p]))
    const myTeam          = myId ? captains[myId] : null
    const otherTeams      = sortedCaptains.filter(([id]) => id !== myId)

    return (
      <div style={{ overflowY: 'auto', minHeight: 'calc(100vh - 65px)', padding: '32px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 44 }}>🏁</div>
            <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--text)', margin: '8px 0 4px' }}>
              Leilão Encerrado
            </h2>
            <p style={{ color: 'var(--text2)', fontSize: 13, margin: 0 }}>Todos os times foram formados.</p>
          </div>

          {/* Meu time em destaque */}
          {myTeam && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>
                Seu Time
              </div>
              <TeamFinalCard team={myTeam} playerByDiscord={playerByDiscord} large />
            </div>
          )}

          {/* Times adversários */}
          {otherTeams.length > 0 && (
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>
                {myTeam ? 'Times Adversários' : 'Times Formados'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {otherTeams.map(([id, team]) => (
                  <TeamFinalCard key={id} team={team} playerByDiscord={playerByDiscord} />
                ))}
              </div>
            </div>
          )}

          {/* Admin sem time — mostra todos */}
          {!myTeam && isAdmin && sortedCaptains.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {sortedCaptains.map(([id, team]) => (
                <TeamFinalCard key={id} team={team} playerByDiscord={playerByDiscord} />
              ))}
            </div>
          )}

          {/* Controles */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
            {captainSession && <SessionBadge session={captainSession} onLogout={handleLogout} />}
            {(capitao || captainSession) && <HeroDraftAlerta capitao={capitao} />}
            {isAdmin && <AdminDraftBar draftState={draftState} sortedCaptains={sortedCaptains} captains={captains} draftConfig={draftConfig} idPublico={idPublico} />}
          </div>

        </div>
      </div>
    )
  }

  // ── Draft ativo ───────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : 'calc(100vh - 65px)', minHeight: 'calc(100vh - 65px)' }}>

      {/* Alerta de turno — só para o capitão da vez */}
      {turnAlert && myCap && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `rgba(0,0,0,${0.65 * turnAlertOpacity})`,
          opacity: turnAlertOpacity, transition: 'opacity 0.6s ease-out',
        }}>
          <div style={{ textAlign: 'center', userSelect: 'none' }}>
            <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 12 }}>{myCap.emoji}</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 52,
              color: myCap.cor, textShadow: `0 0 40px ${myCap.cor}99`,
              letterSpacing: '0.05em',
            }}>
              SUA VEZ!
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18,
              color: 'var(--text2)', marginTop: 8, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              {myCap.nome}
            </div>
          </div>
        </div>
      )}

      {/* Sub-header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: isMobile ? 'center' : 'space-between',
        padding: isMobile ? '8px 12px' : '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
        gap: isMobile ? '8px' : '12px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text2)' }}>
            {t('draft.round')} {draftState.rodada}
          </div>
          {captainSession && <SessionBadge session={captainSession} onLogout={handleLogout} small />}
          {isAdmin && !captainSession && (
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', padding: '3px 8px', borderRadius: '4px', color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
              ADMIN
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', flexShrink: 0 }} />
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: '14px' }}>
            {t('draft.turn')}: {currentTurnCap?.capitaoNome || currentTurnCap?.nome || '—'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {myCap && (
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.25)', padding: '3px 10px', borderRadius: '4px', background: 'var(--gold-dim)' }}>
              🪙 {myCap.moedas} {t('draft.coins')}
            </div>
          )}
          {(draftConfig.timerDuracao ?? 60) > 0 && !audioUnlocked && (
            <button
              onClick={() => {}} // o click em si já dispara o unlock via document listener
              title="Clique para ativar o som do countdown"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, padding: '3px 9px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              🔇 Ativar som
            </button>
          )}
          {(draftConfig.timerDuracao ?? 60) > 0 && audioUnlocked && (
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text3)' }}>🔊</span>
          )}
          {isAdmin && <AdminDraftBar draftState={draftState} sortedCaptains={sortedCaptains} captains={captains} draftConfig={draftConfig} idPublico={idPublico} compact />}
        </div>
      </div>

      {/* Timer bar */}
      {tempoRestante !== null && (draftConfig.timerDuracao ?? 60) > 0 && (() => {
        const dur     = draftConfig.timerDuracao ?? 60
        const pct     = (tempoRestante / dur) * 100
        const urgente = tempoRestante <= 10
        const cor     = tempoRestante > dur * 0.5 ? 'var(--green)' : tempoRestante > dur * 0.2 ? '#f0cc6e' : 'var(--red)'
        return (
          <div style={{ position: 'relative', height: 28, background: 'var(--bg3)', flexShrink: 0, overflow: 'hidden' }}>
            {/* barra de progresso sólida */}
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: cor + '40', transition: 'width 0.5s linear, background 0.5s' }} />
            {/* linha sólida na base */}
            <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${pct}%`, background: cor, transition: 'width 0.5s linear, background 0.5s' }} />
            {/* número centralizado */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              fontSize: 13, letterSpacing: '0.08em', color: cor,
              transition: 'color 0.5s',
              animation: urgente ? 'hd-pulse 0.6s ease-in-out infinite' : 'none',
            }}>
              <span style={{ opacity: 0.6, fontSize: 11 }}>⏱</span>
              <span style={{ fontSize: urgente ? 16 : 13 }}>{tempoRestante}s</span>
            </div>
          </div>
        )
      })()}

      {/* Layout 3 colunas (no mobile só o centro fica; laterais aparecem via botões flutuantes) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '260px 1fr 260px',
        flex: 1,
        overflow: 'hidden',
      }}>

        {/* Coluna esquerda (outros times) — escondida no mobile, conteúdo vai pro drawer */}
        <div style={{
          display: isMobile ? 'none' : 'block',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg2)',
          overflowY: 'auto',
          padding: '12px',
        }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text2)', padding: '4px 6px 12px' }}>
            {t('draft.teams')}
          </div>
          {leftTeams.map(([id, team]) => (
            <TeamCard key={id} id={id} team={team}
              isActive={activeTurnId === id}
              isMyTeam={id === myId}
              minPlayers={draftConfig.minPlayers}
              maxPlayers={draftConfig.maxPlayers}
              fase={fase}
              privacidade={privacidade}
            />
          ))}
        </div>

        {/* Centro — jogadores (única coluna visível no mobile) */}
        <div style={{
          overflowY: 'auto',
          padding: isMobile ? '14px 14px 90px' : '20px 24px', // padding extra no fim para os botões flutuantes não cobrirem
        }}>
          {/* Badge de fase */}
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, fontWeight: 700,
              ...(fase === 'reservas'
                ? { color: 'var(--purple)', background: 'rgba(155,110,232,0.1)', border: '1px solid rgba(155,110,232,0.3)' }
                : { color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)' })
            }}>
              {fase === 'reservas' ? '🛡 Leilão de Reservas' : '⚔ Leilão de Titulares'}
            </span>
          </div>

          {isMyTurn && !myCap?.exitou && (
            <div style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '8px', background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.25)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span>✓ É a sua vez! Escolha um jogador.</span>
              {fase === 'reservas' && (
                <button onClick={sairDraft} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(138,134,128,0.4)', background: 'rgba(138,134,128,0.08)', color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Encerrar participação
                </button>
              )}
            </div>
          )}

          {/* ── Roubáveis — no topo, com destaque vermelho ── */}
          {draftConfig.rouboAtivo && stealablePlayers.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SectionLabel accent="red">⚔ {t('draft.steal')} ({stealablePlayers.length})</SectionLabel>
                <button
                  onClick={() => setGuiaAberto(v => !v)}
                  style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 10, padding: '1px 8px', fontSize: 11, color: 'var(--text2)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  ? regras
                </button>
              </div>
              {guiaAberto && (
                <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 7, background: 'rgba(224,85,85,0.06)', border: '1px solid rgba(224,85,85,0.2)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 3, fontSize: 13 }}>⚔ Como funciona o roubo</div>
                  <div>• Custo = <strong>preço atual</strong> do jogador</div>
                  <div>• Dono anterior recebe de volta o que pagou</div>
                  <div>• A cada roubo o preço sobe +1</div>
                  {fase === 'reservas' && <div>• Apenas reservas podem ser roubadas nesta fase</div>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 148}px, 1fr))`, gap: 8 }}>
                {stealablePlayers.map(p => {
                  const ps       = playerState[p.id]
                  const preco    = ps?.preco ?? 0
                  const owner    = captains[ps?.ownedBy]
                  const rosterOk = fase === 'reservas'
                    ? Object.keys(myCap?.reservas ?? {}).length < 2
                    : Object.keys(myCap?.roster ?? {}).length + 1 < draftConfig.maxPlayers
                  const canSteal = isMyTurn && !myCap?.exitou && (myCap?.moedas ?? 0) >= preco && rosterOk
                  const onSteal  = fase === 'reservas' ? () => roubarReserva(p) : () => roubar(p)
                  return <PlayerCard key={p.id} player={p} preco={preco} canAct={canSteal} onAct={onSteal} isSteal owner={owner} privacidade={privacidade} t={t} />
                })}
              </div>
            </div>
          )}

          {/* ── Disponíveis ── */}
          <SectionLabel>{t('draft.available')} ({availablePlayers.length})</SectionLabel>
          {availablePlayers.length === 0 && players.length === 0 && (
            <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Carregando jogadores...</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 148}px, 1fr))`, gap: 8, marginBottom: 16 }}>
            {availablePlayers.map(p => {
              const preco  = playerState[p.id]?.preco ?? 0
              const canBuy = isMyTurn && !myCap?.exitou &&
                (fase === 'reservas'
                  ? (myCap?.moedas ?? 0) >= preco && Object.keys(myCap?.reservas ?? {}).length < 2
                  : (myCap?.moedas ?? 0) >= preco && Object.keys(myCap?.roster ?? {}).length + 1 < draftConfig.maxPlayers)
              const onAct  = fase === 'reservas' ? () => comprarReserva(p) : () => comprar(p)
              return <PlayerCard key={p.id} player={p} preco={preco} canAct={canBuy} onAct={onAct} privacidade={privacidade} t={t} />
            })}
          </div>
        </div>

        {/* Coluna direita (meu time + log) — escondida no mobile, conteúdo vai pros drawers */}
        <div style={{
          display: isMobile ? 'none' : 'flex',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg2)',
          overflowY: 'auto',
          padding: '12px',
          flexDirection: 'column', gap: 0,
        }}>
          <div style={{ padding: '4px 6px 12px' }}>&nbsp;</div>
          {rightTeams.map(([id, team]) => (
            <TeamCard key={id} id={id} team={team}
              isActive={activeTurnId === id}
              isMyTeam={id === myId}
              minPlayers={draftConfig.minPlayers}
              maxPlayers={draftConfig.maxPlayers}
              fase={fase}
              privacidade={privacidade}
            />
          ))}

          {/* Log de ações */}
          {logAcoes.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ padding: '8px 6px 6px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                Histórico
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {logAcoes.map((a, i) => (
                  <div key={a.ts} style={{ padding: '5px 6px', borderRadius: 5, background: i === 0 ? (a.type === 'steal' ? 'rgba(224,85,85,0.06)' : 'rgba(76,175,125,0.06)') : 'transparent', opacity: i === 0 ? 1 : 0.55 + (0.45 * (1 - i / logAcoes.length)) }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: a.type === 'steal' ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      {a.type === 'steal' ? '⚔' : '✓'} {a.byTeamEmoji} {a.byTeamNome}
                    </div>
                    <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                      {a.playerDiscord}
                      {a.type === 'steal' && a.fromTeamNome && <span style={{ opacity: 0.6 }}> ← {a.fromTeamEmoji} {a.fromTeamNome}</span>}
                      <span style={{ float: 'right', color: 'var(--gold)', fontSize: 10 }}>🪙{a.preco}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Mobile: botões flutuantes + drawer ──────────────────────────────── */}
      {isMobile && (
        <>
          {/* Botões flutuantes (fica em cima do conteúdo) */}
          <div style={{
            position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 50,
            display: 'flex', gap: 8, justifyContent: 'center', pointerEvents: 'none',
          }}>
            {myTeamEntry && (
              <button
                onClick={() => setMobilePanel('meuTime')}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 14px', borderRadius: 22,
                  border: `1px solid ${myTeamEntry[1].cor}66`,
                  background: `${myTeamEntry[1].cor}22`,
                  backdropFilter: 'blur(12px)',
                  color: myTeamEntry[1].cor,
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                }}
              >
                <span style={{ fontSize: 14 }}>{myTeamEntry[1].emoji}</span>
                Meu Time
              </button>
            )}
            <button
              onClick={() => setMobilePanel('outros')}
              style={{
                pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 22,
                border: '1px solid var(--border2)', background: 'var(--bg3)',
                backdropFilter: 'blur(12px)', color: 'var(--text)',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              }}
            >
              👥 Times
            </button>
            <button
              onClick={() => setMobilePanel('historico')}
              style={{
                pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 22,
                border: '1px solid var(--border2)', background: 'var(--bg3)',
                backdropFilter: 'blur(12px)', color: 'var(--text)',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              }}
            >
              📜 Log
            </button>
          </div>

          {/* Drawer / modal */}
          {mobilePanel && (
            <div
              onClick={() => setMobilePanel(null)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'var(--bg2)', borderTop: '1px solid var(--border2)',
                  borderTopLeftRadius: 14, borderTopRightRadius: 14,
                  maxHeight: '80vh', overflowY: 'auto', padding: '14px 14px 24px',
                }}
              >
                {/* Header do drawer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>
                    {mobilePanel === 'meuTime'   && 'Meu Time'}
                    {mobilePanel === 'outros'    && `Outros Times (${outrosTimes.length})`}
                    {mobilePanel === 'historico' && `Histórico (${logAcoes.length})`}
                  </span>
                  <button
                    onClick={() => setMobilePanel(null)}
                    style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 4, padding: '4px 10px', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Conteúdo */}
                {mobilePanel === 'meuTime' && myTeamEntry && (
                  <TeamCard
                    id={myTeamEntry[0]}
                    team={myTeamEntry[1]}
                    isActive={activeTurnId === myTeamEntry[0]}
                    isMyTeam
                    minPlayers={draftConfig.minPlayers}
                    maxPlayers={draftConfig.maxPlayers}
                    fase={fase}
                    privacidade={privacidade}
                  />
                )}
                {mobilePanel === 'outros' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {outrosTimes.map(([id, team]) => (
                      <TeamCard
                        key={id} id={id} team={team}
                        isActive={activeTurnId === id}
                        isMyTeam={false}
                        minPlayers={draftConfig.minPlayers}
                        maxPlayers={draftConfig.maxPlayers}
                        fase={fase}
                        privacidade={privacidade}
                      />
                    ))}
                  </div>
                )}
                {mobilePanel === 'historico' && (
                  logAcoes.length === 0
                    ? <p style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhuma ação registrada ainda.</p>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {logAcoes.map((a, i) => (
                          <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg3)', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: a.type === 'steal' ? 'var(--red)' : 'var(--green)' }}>
                              {a.type === 'steal' ? '✕' : '✓'} <span style={{ color: a.byTeamCor }}>{a.byTeamEmoji} {a.byTeamNome}</span>
                            </div>
                            <div style={{ marginTop: 2, color: 'var(--text2)' }}>
                              {a.playerDiscord}
                              {a.type === 'steal' && a.fromTeamNome && <span style={{ opacity: 0.6 }}> ← {a.fromTeamEmoji} {a.fromTeamNome}</span>}
                              <span style={{ float: 'right', color: 'var(--gold)' }}>🪙{a.preco}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Lógica de turno ──────────────────────────────────────────
// fase 'titulares': pula capitão com >= minPlayers no roster (inclui capitão)
// fase 'reservas':  pula capitão que saiu ou já tem 2 reservas
// myNewSize: contagem do capitão atual APÓS a ação (evita usar state desatualizado)
function proximoCom(sortedCaptains, captains, currentId, myNewSize, config, fase) {
  const { minPlayers = 5 } = config ?? {}
  const idx = sortedCaptains.findIndex(([id]) => id === currentId)
  for (let i = 1; i <= sortedCaptains.length; i++) {
    const nextIdx      = (idx + i) % sortedCaptains.length
    const [nId, nCap]  = sortedCaptains[nextIdx]

    if (fase === 'reservas') {
      if (nCap.exitou) continue
      const count = nId === currentId
        ? myNewSize
        : Object.keys(nCap.reservas ?? {}).length
      if (count >= 2) continue
      return { id: nId, novaRodada: nextIdx <= idx }
    } else {
      const size = nId === currentId
        ? myNewSize
        : Object.keys(nCap.roster ?? {}).length + 1
      if (size < minPlayers) {
        return { id: nId, novaRodada: nextIdx <= idx }
      }
    }
  }
  return null // fase encerrada
}

// ── Componentes auxiliares ────────────────────────────────────

function SessionBadge({ session, onLogout, small }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: small ? '3px 10px' : '8px 16px',
      borderRadius: small ? '5px' : '8px',
      border: `1px solid ${session.cor}44`,
      background: session.cor + '12',
    }}>
      <span style={{ fontSize: small ? '14px' : '18px' }}>{session.emoji}</span>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: small ? '12px' : '14px', fontWeight: 600, color: session.cor }}>
        {session.nome}
      </span>
      {session.capitaoNome && (
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: small ? '11px' : '13px', color: 'var(--text2)' }}>
          ({session.capitaoNome})
        </span>
      )}
      <button onClick={onLogout} title="Sair" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: '12px', padding: '0 0 0 4px', lineHeight: 1 }}>
        ✕
      </button>
    </div>
  )
}

function TeamCard({ id, team, isActive, isMyTeam, minPlayers = 5, maxPlayers = 7, fase = 'titulares', privacidade = false }) {
  const roster    = Object.entries(team.roster ?? {})
  const reservas  = Object.entries(team.reservas ?? {})
  const titTotal  = roster.length + (team.capitaoNome ? 1 : 0)
  const titFull   = titTotal >= minPlayers
  const exitou    = team.exitou

  return (
    <div style={{
      border: `1px solid ${isMyTeam ? team.cor + '88' : isActive ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
      borderRadius: '8px',
      background: isMyTeam ? team.cor + '0a' : 'var(--bg3)',
      overflow: 'hidden',
      marginBottom: '10px',
      opacity: exitou && !isMyTeam ? 0.55 : 1,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: team.cor, flexShrink: 0 }} />
          <span>{team.emoji}</span>
          <span style={{ color: team.cor }}>{team.nome}</span>
          {isMyTeam && !exitou && <span style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", color: team.cor, opacity: 0.7 }}>MEU</span>}
          {exitou && (
            <span style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--green)', background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.3)', padding: '1px 6px', borderRadius: '3px' }}>
              PRONTO
            </span>
          )}
          {!exitou && titFull && fase === 'titulares' && (
            <span style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--green)', background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.3)', padding: '1px 6px', borderRadius: '3px' }}>
              COMPLETO
            </span>
          )}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>
          🪙 {team.moedas}
        </div>
      </div>

      {/* Titulares */}
      <div style={{ padding: '8px 14px', background: 'rgba(201,168,76,0.04)', borderBottom: fase === 'reservas' ? '1px solid var(--border)' : 'none' }}>
        {team.capitaoNome && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '4px', background: 'rgba(201,168,76,0.08)', fontSize: '12px', color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '2px' }}>
            <span>⚑ {team.capitaoNome}</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>CAP</span>
          </div>
        )}
        {roster.map(([pid, entry], idx) => (
          <div key={pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '4px', fontSize: '12px', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            <span>{privacidade ? `Jogador #${idx + 1}` : entry.discord}</span>
            <span style={{ color: 'var(--gold)', fontSize: 11 }}>{entry.preco}🪙</span>
          </div>
        ))}
        {titTotal === 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", padding: '4px 6px', fontStyle: 'italic' }}>
            Sem titulares
          </div>
        )}
      </div>

      {/* Reservas — só exibe na fase de reservas */}
      {fase === 'reservas' && (
        <div style={{ padding: '6px 14px 8px', background: 'rgba(138,134,128,0.05)' }}>
          {reservas.length === 0 && !exitou && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", padding: '4px 6px', fontStyle: 'italic' }}>
              Sem reservas
            </div>
          )}
          {reservas.map(([pid, entry], idx) => (
            <div key={pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '4px', fontSize: '12px', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>
              <span>{privacidade ? `Reserva #${idx + 1}` : entry.discord}</span>
              <span style={{ fontSize: 11 }}>{entry.preco}🪙</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Painel admin inline no draft ─────────────────────────────

function AdminDraftBar({ draftState, sortedCaptains, captains, draftConfig, idPublico, compact }) {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const ses       = draftSessionPath(idPublico)
  const fase      = draftState.fase ?? 'titulares'
  const min       = draftConfig?.minCaptains ?? 2
  const podeIniciar = sortedCaptains.length >= min && draftState.status === 'aguardando'

  async function iniciarDraft() {
    if (!podeIniciar) return
    const primeiro = sortedCaptains[0]?.[0]
    if (!primeiro) return
    await set(ref(db, `${ses}/state`), { status: 'rodando', fase: 'titulares', turnoAtual: primeiro, turnoExtra: null, rodada: 1, turnoIniciadoEm: Date.now() })
  }

  async function iniciarReservas() {
    const updates = {}
    sortedCaptains.forEach(([id, cap]) => {
      updates[`${ses}/captains/${id}/moedas`] = Math.max(cap.moedas ?? 0, 6)
    })
    const primeiro = sortedCaptains[0]?.[0]
    updates[`${ses}/state/status`]         = 'rodando'
    updates[`${ses}/state/fase`]            = 'reservas'
    updates[`${ses}/state/rodada`]          = 1
    updates[`${ses}/state/turnoAtual`]      = primeiro ?? null
    updates[`${ses}/state/turnoExtra`]      = null
    updates[`${ses}/state/turnoIniciadoEm`] = Date.now()
    await update(ref(db), updates)
    setOpen(false)
  }

  async function encerrarDraft() {
    await update(ref(db, `${ses}/state`), { status: 'encerrado' })
  }

  async function retomar() {
    const primeiro = sortedCaptains[0]?.[0]
    await update(ref(db, `${ses}/state`), { status: 'rodando', turnoAtual: primeiro ?? null })
  }

  async function avancarTurno() {
    const currentId  = draftState.turnoAtual
    const currentCap = captains[currentId] ?? {}
    const currentSize = fase === 'reservas'
      ? Object.keys(currentCap.reservas ?? {}).length
      : Object.keys(currentCap.roster ?? {}).length + 1
    const next = proximoCom(sortedCaptains, captains, currentId, currentSize, draftConfig, fase)
    if (!next) {
      await update(ref(db, `${ses}/state`), { status: fase === 'titulares' ? 'entre_fases' : 'encerrado' })
      return
    }
    const updates = {
      [`${ses}/state/turnoAtual`]:      next.id,
      [`${ses}/state/turnoExtra`]:      null,
      [`${ses}/state/turnoIniciadoEm`]: Date.now(),
    }
    if (next.novaRodada) updates[`${ses}/state/rodada`] = (draftState.rodada ?? 1) + 1
    await update(ref(db), updates)
  }

  async function resetarDraft() {
    const updates = {}
    sortedCaptains.forEach(([id]) => {
      updates[`${ses}/captains/${id}/roster`]  = null
      updates[`${ses}/captains/${id}/reservas`] = null
      updates[`${ses}/captains/${id}/exitou`]   = null
      updates[`${ses}/captains/${id}/moedas`]   = draftConfig?.moedas ?? 15
    })
    updates[`${ses}/playerState`] = null
    updates[`${ses}/state`]       = { status: 'aguardando', fase: 'titulares', turnoAtual: null, turnoExtra: null, rodada: 1 }
    await update(ref(db), updates)
    setConfirmReset(false)
    setOpen(false)
  }

  const btnBase = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '5px', border: '1px solid var(--border2)', background: 'none', cursor: 'pointer', color: 'var(--text2)', transition: 'all 0.15s', whiteSpace: 'nowrap' }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ ...btnBase, color: open ? 'var(--gold)' : 'var(--text2)', borderColor: open ? 'rgba(201,168,76,0.4)' : 'var(--border2)', background: open ? 'rgba(201,168,76,0.08)' : 'none' }}
      >
        ⚙ Admin {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
          background: 'var(--bg2)', border: '1px solid rgba(201,168,76,0.25)',
          borderRadius: '10px', padding: '14px', minWidth: '260px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>
            Controle do Draft
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {draftState.status === 'aguardando' && (
              <button style={{ ...btnBase, color: podeIniciar ? 'var(--green)' : 'var(--text2)', borderColor: podeIniciar ? 'rgba(76,175,125,0.4)' : 'var(--border)', opacity: podeIniciar ? 1 : 0.45, width: '100%', padding: '8px' }}
                disabled={!podeIniciar} onClick={iniciarDraft}>
                ▶ Iniciar Leilão de Titulares
              </button>
            )}
            {draftState.status === 'entre_fases' && (
              <button style={{ ...btnBase, color: 'var(--purple)', borderColor: 'rgba(155,110,232,0.4)', width: '100%', padding: '8px' }}
                onClick={iniciarReservas}>
                ▶ Iniciar Leilão de Reservas
              </button>
            )}
            {draftState.status === 'rodando' && (
              <>
                <button style={{ ...btnBase, width: '100%', padding: '8px' }} onClick={avancarTurno}>
                  ⏭ Avançar Turno
                </button>
                <button style={{ ...btnBase, color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)', width: '100%', padding: '8px' }} onClick={encerrarDraft}>
                  ⏹ Encerrar Draft
                </button>
              </>
            )}
            {draftState.status === 'encerrado' && (
              <button style={{ ...btnBase, color: 'var(--green)', borderColor: 'rgba(76,175,125,0.3)', width: '100%', padding: '8px' }} onClick={retomar}>
                ↩ Reabrir Draft
              </button>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '2px' }}>
              {!confirmReset ? (
                <button style={{ ...btnBase, color: 'var(--red)', borderColor: 'rgba(224,85,85,0.25)', width: '100%', padding: '7px' }} onClick={() => setConfirmReset(true)}>
                  🗑 Resetar Draft
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)', textAlign: 'center' }}>Apagar todas as compras?</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={{ ...btnBase, flex: 1, color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }} onClick={resetarDraft}>Confirmar</button>
                    <button style={{ ...btnBase, flex: 1 }} onClick={() => setConfirmReset(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Card de time para tela de encerramento ───────────────────
function TeamFinalCard({ team, playerByDiscord, large = false }) {
  const roster   = Object.entries(team.roster   ?? {})
  const reservas = Object.entries(team.reservas ?? {})

  const titulares = [
    ...(team.capitaoNome ? [{ discord: team.capitaoNome, preco: null, isCaptain: true }] : []),
    ...roster.map(([, e]) => ({ ...e, isCaptain: false })),
  ]

  return (
    <div style={{
      border: `1px solid ${large ? team.cor + '99' : team.cor + '44'}`,
      borderRadius: large ? 12 : 8,
      background: large ? team.cor + '0e' : team.cor + '06',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: large ? '14px 18px' : '10px 14px', borderBottom: `1px solid ${team.cor}33`, background: team.cor + '14', display: 'flex', alignItems: 'center', gap: large ? 12 : 8 }}>
        <span style={{ fontSize: large ? 28 : 20, lineHeight: 1 }}>{team.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: large ? 20 : 15, color: team.cor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {team.nome}
          </div>
          {team.capitaoNome && (
            <div style={{ fontSize: large ? 12 : 10, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 1 }}>
              ⚑ {team.capitaoNome}
            </div>
          )}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: large ? 12 : 11, color: 'var(--gold)', flexShrink: 0 }}>
          {titulares.length}/{reservas.length > 0 ? `${titulares.length}+${reservas.length}` : titulares.length}
        </div>
      </div>

      {/* Titulares */}
      <div style={{ background: 'rgba(201,168,76,0.03)', padding: large ? '8px 0' : '4px 0' }}>
        {titulares.map((entry, i) => {
          const info = playerByDiscord[entry.discord]
          const eloColor = ELO_CONFIG[info?.elo]?.color
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: large ? '5px 18px' : '3px 14px', background: entry.isCaptain ? 'rgba(201,168,76,0.06)' : 'transparent' }}>
              {entry.isCaptain && <span style={{ color: 'var(--gold)', fontSize: large ? 12 : 10, flexShrink: 0 }}>⚑</span>}
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: large ? 14 : 12, color: entry.isCaptain ? 'var(--gold)' : 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.discord}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {info?.rolePrimaria && large && (
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text2)' }}>{info.rolePrimaria}</span>
                )}
                {eloColor && (
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: large ? 11 : 10, padding: '1px 5px', borderRadius: 3, color: eloColor, background: eloColor + '18', border: `1px solid ${eloColor}33` }}>
                    {info.elo}
                  </span>
                )}
                {!entry.isCaptain && entry.preco != null && (
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: large ? 11 : 10, color: 'var(--gold)', opacity: 0.7 }}>
                    {entry.preco}🪙
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Reservas */}
      {reservas.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(138,134,128,0.04)', padding: large ? '6px 0 8px' : '3px 0 5px' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', padding: large ? '0 18px 4px' : '0 14px 2px' }}>
            Reservas
          </div>
          {reservas.map(([, entry], i) => {
            const info = playerByDiscord[entry.discord]
            const eloColor = ELO_CONFIG[info?.elo]?.color
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: large ? '4px 18px' : '2px 14px' }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: large ? 13 : 11, color: 'var(--text2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.discord}
                </span>
                {eloColor && (
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: eloColor }}>{info.elo}</span>
                )}
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: 'var(--text3)' }}>{entry.preco}🪙</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children, accent }) {
  const color = accent === 'red' ? 'var(--red)' : 'var(--text2)'
  return (
    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color, marginBottom: '10px' }}>
      {children}
    </div>
  )
}

const LINGUA_FLAG_CDN_DRAFT = {
  pt: 'https://flagcdn.com/br.svg',
  es: 'https://flagcdn.com/es.svg',
  en: 'https://flagcdn.com/us.svg',
}

function parseLinguasDraft(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(l => l.trim().toLowerCase()).filter(Boolean)
  return String(raw).split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
}

function PlayerCard({ player, preco, canAct, onAct, isSteal, owner, privacidade, t }) {
  const nomeExibido = privacidade ? `${player.rolePrimaria ?? 'Jogador'}` : player.discord
  const linguas     = parseLinguasDraft(player.linguas)
  const eloCfg      = ELO_CONFIG[player.elo] ?? {}
  const accentCor   = isSteal ? (owner?.cor ?? '#e05555') : null

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      border: `1px solid ${accentCor ? accentCor + '55' : 'var(--border)'}`,
      background: accentCor ? accentCor + '08' : 'var(--bg2)',
    }}>
      {/* Dono (só roubáveis) */}
      {isSteal && owner && (
        <div style={{
          padding: '3px 8px', background: owner.cor + '20',
          borderBottom: `1px solid ${owner.cor}30`,
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10,
          letterSpacing: '0.06em', color: owner.cor,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {owner.emoji} {owner.nome}
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14,
          color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {nomeExibido}
          {player.premium && <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--gold)' }}>★</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <EloIcon elo={player.elo} size={11} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: eloCfg.color }}>{player.elo}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <RoleIcon role={player.rolePrimaria} size={13} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text2)' }}>{player.rolePrimaria}</span>
        </div>
        {linguas.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
            {linguas.map(l => {
              const src = LINGUA_FLAG_CDN_DRAFT[l]
              return src
                ? <img key={l} src={src} alt={l} style={{ width: 16, height: 11, objectFit: 'cover', borderRadius: 1 }} />
                : <span key={l} style={{ fontSize: 9, color: 'var(--text3)' }}>{l.toUpperCase()}</span>
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '5px 10px', borderTop: `1px solid ${accentCor ? accentCor + '22' : 'var(--border)'}`,
        background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>🪙 {preco}</span>
        <button
          className={`btn${isSteal ? '' : ' primary'}`}
          style={{
            padding: '5px 12px', fontSize: 12, minHeight: 30,
            opacity: canAct ? 1 : 0.35, cursor: canAct ? 'pointer' : 'not-allowed',
            ...(isSteal && canAct ? { color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' } : {}),
          }}
          disabled={!canAct}
          onClick={onAct}
        >
          {isSteal ? t('draft.steal') : t('draft.buy')}
        </button>
      </div>
    </div>
  )
}

function PlayerRow({ player, preco, canAct, onAct, isSteal, owner, privacidade, t }) {
  // mantido para compatibilidade com espectador e outras telas
  const borderColor = isSteal ? `${owner?.cor ?? 'var(--border)'}55` : 'var(--border)'
  const bgColor     = isSteal ? `${owner?.cor ?? 'transparent'}08`   : 'var(--bg2)'
  const nomeExibido = privacidade ? `${player.rolePrimaria ?? 'Jogador'}` : player.discord
  const linguas     = parseLinguasDraft(player.linguas)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '6px', border: `1px solid ${borderColor}`, background: bgColor }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
          👤
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {nomeExibido}
            {player.premium && (
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                PREMIUM
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
            <EloIcon elo={player.elo} size={13} />
            <span style={{ color: ELO_CONFIG[player.elo]?.color }}>{player.elo}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <RoleIcon role={player.rolePrimaria} size={14} />
            {player.rolePrimaria}
            {linguas.length > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                {linguas.map(l => {
                  const src = LINGUA_FLAG_CDN_DRAFT[l]
                  return src ? (
                    <img key={l} src={src} alt={l.toUpperCase()} title={l.toUpperCase()}
                      style={{ width: 18, height: 12, objectFit: 'cover', borderRadius: 2, display: 'inline-block', verticalAlign: 'middle' }}
                    />
                  ) : (
                    <span key={l} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: 'var(--text2)' }}>
                      {l.toUpperCase()}
                    </span>
                  )
                })}
              </>
            )}
            {isSteal && owner && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: owner.cor }}>{owner.emoji} {owner.nome}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--gold)', fontWeight: 600 }}>
          🪙 {preco}
        </div>
        <button
          className={`btn${isSteal ? '' : ' primary'}`}
          style={{
            padding: '6px 14px', fontSize: '12px',
            opacity: canAct ? 1 : 0.35,
            cursor: canAct ? 'pointer' : 'not-allowed',
            ...(isSteal && canAct ? { color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' } : {}),
          }}
          disabled={!canAct}
          onClick={onAct}
        >
          {isSteal ? t('draft.steal') : t('draft.buy')}
        </button>
      </div>
    </div>
  )
}
