import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { HEROES, getHeroesByRole, ROLES } from '../utils/heroPool'
import { passoAtual, heroiBloqueado, ACOES, STATUS_DRAFT } from '../utils/heroDraft'
import { getMapaById } from '../utils/mapPool'
import './HeroDraft.css'

// URL: /hero-draft?sessao=semifinal-1&time=A
export default function HeroDraft() {
  const [params]      = useSearchParams()
  const sessaoId      = params.get('sessao') ?? 'default'
  const timeLocal     = params.get('time')   ?? null   // 'A' | 'B' | null (espectador)

  const { estado, loading, erro, ehMinhaTez, agir } = useHeroDraft(sessaoId, timeLocal)

  const [filtroRole, setFiltroRole]     = useState('todos')
  const [busca, setBusca]               = useState('')
  const [confirmando, setConfirmando]   = useState(null)

  // ── Timer sincronizado com Firebase ──────────────────────────────────────
  const TEMPO_TURNO   = 30
  const [turnoIniciadoEm, setTurnoIniciadoEm] = useState(null)
  const [tempoRestante, setTempoRestante]     = useState(TEMPO_TURNO)
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

  // Auto-pick: setTimeout preciso disparado quando o turno começa
  useEffect(() => {
    if (autoPickTimer.current) clearTimeout(autoPickTimer.current)
    if (!estado || estado.status !== STATUS_DRAFT.RODANDO || !ehMinhaTez()) return

    autoPickedRef.current = false
    const ts          = estado.turnoIniciadoEm ?? Date.now()
    const remainingMs = Math.max(0, TEMPO_TURNO * 1000 - (Date.now() - ts))
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
      if (Date.now() - ts < TEMPO_TURNO * 1000 || autoPickedRef.current) return
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
  if (loading) return <div className="hd-loading">Carregando draft...</div>
  if (erro)    return <div className="hd-erro">Erro: {erro}</div>
  if (!estado) return <div className="hd-loading">Sessão não encontrada.</div>

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
        <div className="hd-aviso">Aguardando o admin iniciar o draft...</div>
      )}
      {estado.status === STATUS_DRAFT.ENCERRADO && (
        <div className="hd-aviso hd-aviso--fim">Draft encerrado!</div>
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
  const heroi = HEROES.find((h) => h.id === heroiId)
  if (!heroi) return null

  const acaoLabel = acao === ACOES.BAN ? 'BANIR' : 'ESCOLHER'
  const acaoClass = acao === ACOES.BAN ? 'ban' : 'pick'

  return (
    <div className="hd-confirmar-backdrop" onClick={onCancelar}>
      <div className="hd-confirmar-modal" onClick={(e) => e.stopPropagation()}>
        <img src={heroi.iconeUrl} alt={heroi.nome} className="hd-confirmar-img"
          onError={(e) => { e.target.src = '/heroes/placeholder.png' }} />
        <h3 className="hd-confirmar-nome">{heroi.nome}</h3>
        <p className="hd-confirmar-acao" data-acao={acaoClass}>
          Confirmar {acaoLabel}?
        </p>
        <div className="hd-confirmar-btns">
          <button className="hd-btn hd-btn--confirmar" onClick={onConfirmar}>Confirmar</button>
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
