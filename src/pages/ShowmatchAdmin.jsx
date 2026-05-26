import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ref, onValue, get, set, update, remove } from 'firebase/database'
import { db } from '../firebase/database'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { useServerTimeOffset } from '../hooks/useServerTimeOffset'
import { criarEstadoInicial, SEQUENCIA_PADRAO, DEFAULT_TIMER_CONFIG } from '../utils/heroDraft'
import { MAPAS } from '../utils/mapPool'
import { HEROES } from '../utils/heroPool'
import { teamPath, confrontosPath } from '../utils/campeonatoPaths'

function gerarSessaoId() {
  return `sm${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 6)}`
}

// Sequências compactas (criarEstadoInicial chama expandirSequencia internamente)
const SEQUENCIAS = {
  0: [
    { acao: 'pick', time: 'A', quantidade: 1 },
    { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 },
    { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 },
    { acao: 'pick', time: 'B', quantidade: 1 },
  ],
  2: [
    { acao: 'ban',  time: 'A', quantidade: 1 },
    { acao: 'ban',  time: 'B', quantidade: 1 },
    { acao: 'ban',  time: 'A', quantidade: 1 },
    { acao: 'ban',  time: 'B', quantidade: 1 },
    { acao: 'pick', time: 'A', quantidade: 1 },
    { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 },
    { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 },
    { acao: 'pick', time: 'B', quantidade: 1 },
  ],
  3: SEQUENCIA_PADRAO,
}

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

export default function ShowmatchAdmin() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const confrontoId  = searchParams.get('confronto')  || null
  const campeonatoId = searchParams.get('campeonato') || null

  const isConfrontoMode = !!(confrontoId && campeonatoId)

  // ID de sessão:
  // - Showmatch: lê do localStorage para sobreviver a reloads; gera novo se não houver
  // - Confronto: começa com um ID temporário; substituído pelo heroDraftId ativo (se existir)
  const [sessaoId, setSessaoId] = useState(() => {
    if (isConfrontoMode) return gerarSessaoId() // será substituído ao carregar o confronto
    return localStorage.getItem('showmatch_sessaoId') || gerarSessaoId()
  })

  // Caminhos dinâmicos — confronto usa heroDraft do campeonato; showmatch usa caminho próprio
  const sessaoPath     = isConfrontoMode ? null                                              : `showmatch/sessions/${sessaoId}`
  const heroDraftPath  = isConfrontoMode ? `campeonatos/${campeonatoId}/heroDraft/${sessaoId}` : `showmatch/sessions/${sessaoId}/heroDraft`

  const [sessao,   setSessao]   = useState(isConfrontoMode ? null : undefined)
  const [msg,      setMsg]      = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [confrontoCtx, setConfrontoCtx] = useState(null)

  // Form for creating a showmatch
  const [nomeA,      setNomeA]      = useState('Time A')
  const [nomeB,      setNomeB]      = useState('Time B')
  const [jogadoresA, setJogadoresA] = useState('')
  const [jogadoresB, setJogadoresB] = useState('')

  // Hero Draft config
  const [mapaId,      setMapaId]      = useState('')
  const [numBans,     setNumBans]     = useState(2)
  const [globalBans,  setGlobalBans]  = useState([])
  const [buscaBan,    setBuscaBan]    = useState('')
  const [draftCriado, setDraftCriado] = useState(false)

  // Timer config
  const [timerBan,       setTimerBan]       = useState(30)
  const [timerPick,      setTimerPick]      = useState(30)
  const [timerPickDuplo, setTimerPickDuplo] = useState(50)

  // Quem começa: 'A' | 'B'
  const [primeiroTime, setPrimeiroTime] = useState('A')

  // Partidas (só confronto mode)
  const [partidas, setPartidas] = useState({})
  const [confirmResultado, setConfirmResultado] = useState(false)

  // Hero Draft hook — usa caminho dinâmico (showmatch ou confronto)
  const { estado: draftEstado, iniciar: _iniciarDraft, iniciarComContagem, encerrar: encerrarDraft, desfazer: desfazerDraft } = useHeroDraft(
    null, 'admin', heroDraftPath
  )
  const timeOffset = useServerTimeOffset()

  // liveRef pra evitar closure stale na auto-transição
  const liveDraftRef = useRef({})
  liveDraftRef.current = { draftEstado, iniciar: _iniciarDraft }

  // Auto-transição countdown → rodando (corrige clock drift com serverTimeOffset)
  useEffect(() => {
    if (draftEstado?.status !== 'countdown') return
    const endsAt = draftEstado.countdownStartedAt && draftEstado.countdownSecs
      ? draftEstado.countdownStartedAt + draftEstado.countdownSecs * 1000
      : draftEstado.countdownEndsAt
    if (!endsAt) return
    const remaining = Math.max(0, endsAt - (Date.now() + timeOffset))
    const t = setTimeout(() => {
      const live = liveDraftRef.current
      if (live.draftEstado?.status !== 'countdown') return
      live.iniciar()
    }, remaining + 100)
    return () => clearTimeout(t)
  }, [draftEstado?.status, draftEstado?.countdownEndsAt, draftEstado?.countdownStartedAt, draftEstado?.countdownSecs, timeOffset]) // eslint-disable-line

  // Listener de sessão — só para showmatch (confronto deriva de confrontoCtx)
  useEffect(() => {
    if (!sessaoPath) return
    const unsub = onValue(ref(db, sessaoPath), (snap) => {
      const val = snap.val()
      if (val) {
        const { heroDraft: _, ...rest } = val
        setSessao(rest)
      } else {
        setSessao(null)
      }
    })
    return unsub
  }, [sessaoPath]) // eslint-disable-line

  useEffect(() => {
    setDraftCriado(!!draftEstado)
  }, [draftEstado])

  // Salva config da sessão em tempo real para o lobby dos capitães ver ao vivo
  useEffect(() => {
    if (!sessaoPath || !sessao) return
    const t = setTimeout(() => {
      update(ref(db, `${sessaoPath}/config`), {
        mapaId:        mapaId || null,
        numBans,
        globalBans,
        timerBan:       Number(timerBan)        || DEFAULT_TIMER_CONFIG.ban,
        timerPick:      Number(timerPick)       || DEFAULT_TIMER_CONFIG.pick,
        timerPickDuplo: Number(timerPickDuplo)  || DEFAULT_TIMER_CONFIG.pickDuplo,
        primeiroTime,
      })
    }, 300)
    return () => clearTimeout(t)
  }, [mapaId, numBans, globalBans, timerBan, timerPick, timerPickDuplo, primeiroTime]) // eslint-disable-line

  // Listener de partidas — só em modo confronto
  useEffect(() => {
    if (!confrontoId || !campeonatoId) return
    const unsub = onValue(
      ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}/partidas`),
      snap => setPartidas(snap.val() ?? {})
    )
    return unsub
  }, [confrontoId, campeonatoId]) // eslint-disable-line

  // Auto-importar times quando vindo de um confronto
  useEffect(() => {
    if (!confrontoId || !campeonatoId) return
    async function carregar() {
      const [confSnap, teamsSnap] = await Promise.all([
        get(ref(db, `${confrontosPath(campeonatoId)}/${confrontoId}`)),
        get(ref(db, teamPath(campeonatoId))),
      ])
      const conf  = confSnap.val()
      const teams = teamsSnap.val() ?? {}
      if (!conf) return
      const tA = teams[conf.timeA] ?? {}
      const tB = teams[conf.timeB] ?? {}
      const nA = tA.nome || 'Time A'
      const nB = tB.nome || 'Time B'
      const rosA = Object.values(tA.roster ?? {}).map(r => r.discord).filter(Boolean)
      const rosB = Object.values(tB.roster ?? {}).map(r => r.discord).filter(Boolean)
      if (tA.capitaoNome) rosA.unshift(tA.capitaoNome)
      if (tB.capitaoNome) rosB.unshift(tB.capitaoNome)

      setConfrontoCtx({ conf, tA, tB })
      setNomeA(nA)
      setNomeB(nB)
      setJogadoresA(rosA.join('\n'))
      setJogadoresB(rosB.join('\n'))
      setSessao({
        timeA: { nome: nA, jogadores: rosA },
        timeB: { nome: nB, jogadores: rosB },
        status: 'configurando',
      })

      // Reconecta ao draft ativo se a página foi recarregada no meio de uma partida
      const partidas = conf.partidas ?? {}
      const emDraft  = Object.values(partidas).find(p => p.status === 'em_draft')
      if (emDraft?.heroDraftId) {
        setSessaoId(emDraft.heroDraftId)
      }
    }
    carregar()
  }, [confrontoId, campeonatoId]) // eslint-disable-line

  function flash(text, tipo = 'ok') {
    setMsg({ text, tipo })
    setTimeout(() => setMsg(null), 3000)
  }

  async function criarShowmatch() {
    const novoId = gerarSessaoId()
    setSessaoId(novoId)
    localStorage.setItem('showmatch_sessaoId', novoId)
    const listaA = jogadoresA.split('\n').map(s => s.trim()).filter(Boolean)
    const listaB = jogadoresB.split('\n').map(s => s.trim()).filter(Boolean)
    await set(ref(db, `showmatch/sessions/${novoId}`), {
      criadoEm: Date.now(),
      status: 'configurando',
      timeA: { nome: nomeA.trim() || 'Time A', jogadores: listaA },
      timeB: { nome: nomeB.trim() || 'Time B', jogadores: listaB },
    })
    flash('Showmatch criado!')
  }

  async function criarHeroDraft() {
    if (!sessao) return
    const seqBase = SEQUENCIAS[numBans] ?? SEQUENCIAS[2]
    const sequencia = primeiroTime === 'B'
      ? seqBase.map(s => ({ ...s, time: s.time === 'A' ? 'B' : 'A' }))
      : seqBase
    const estado = criarEstadoInicial({
      timeA:      { nome: sessao.timeA?.nome ?? 'Time A' },
      timeB:      { nome: sessao.timeB?.nome ?? 'Time B' },
      sequencia,
      globalBans,
      mapaId:     mapaId || null,
      timerConfig: {
        ban:       Number(timerBan)       || DEFAULT_TIMER_CONFIG.ban,
        pick:      Number(timerPick)      || DEFAULT_TIMER_CONFIG.pick,
        pickDuplo: Number(timerPickDuplo) || DEFAULT_TIMER_CONFIG.pickDuplo,
      },
    })
    await set(ref(db, heroDraftPath), estado)
    if (sessaoPath) await update(ref(db, sessaoPath), { status: 'lobby', presenca: null })

    // Registra partida no confronto
    if (isConfrontoMode && confrontoId && campeonatoId) {
      const pNum = String(numAtual)
      const base = `${confrontosPath(campeonatoId)}/${confrontoId}`
      await update(ref(db), {
        [`${base}/status`]:                    'em_jogo',
        [`${base}/partidas/${pNum}/status`]:   'em_draft',
        [`${base}/partidas/${pNum}/heroDraftId`]: sessaoId,
        [`${base}/partidas/${pNum}/criadoEm`]: Date.now(),
      })
    }

    flash('Hero Draft criado — clique em Iniciar para começar.')
  }

  function toggleGlobalBan(heroId) {
    setGlobalBans(prev =>
      prev.includes(heroId) ? prev.filter(id => id !== heroId) : [...prev, heroId]
    )
  }

  async function atualizarConfiguracoes() {
    if (!draftEstado) return
    const novoEstado = {
      ...draftEstado,
      timerConfig: {
        ban:       Number(timerBan)        || DEFAULT_TIMER_CONFIG.ban,
        pick:      Number(timerPick)       || DEFAULT_TIMER_CONFIG.pick,
        pickDuplo: Number(timerPickDuplo)  || DEFAULT_TIMER_CONFIG.pickDuplo,
      },
      globalBans,
      mapaId: mapaId || null,
    }
    await set(ref(db, heroDraftPath), novoEstado)
    flash('Configurações atualizadas!')
  }

  async function handleIniciar() {
    const r = await iniciarComContagem(5)
    r?.ok ? flash('Contagem iniciada!') : flash(`Erro: ${r?.erro}`, 'err')
  }

  async function handleDesfazer() {
    const r = await desfazerDraft()
    if (!r?.ok) flash(`Erro: ${r?.erro}`, 'err')
  }

  async function handleEncerrar() {
    const r = await encerrarDraft()
    r?.ok ? flash('Draft encerrado.') : flash(`Erro: ${r?.erro}`, 'err')
  }

  // ── Partidas (confronto mode) ──────────────────────────────────────────────

  // Derivados de partidas
  const partidasArr  = Object.entries(partidas).sort(([a], [b]) => Number(a) - Number(b))
  const winsA        = partidasArr.filter(([, p]) => p.vencedor === 'timeA').length
  const winsB        = partidasArr.filter(([, p]) => p.vencedor === 'timeB').length
  const concluidas   = partidasArr.filter(([, p]) => p.status === 'concluida').length
  const emDraftEntry = partidasArr.find(([, p]) => p.status === 'em_draft')
  const formato      = confrontoCtx?.conf?.formato ?? 'MD2'
  const maxVit       = formato === 'MD5' ? 3 : 2
  const maxTotal     = formato === 'MD5' ? 5 : 2
  const isDone       = winsA >= maxVit || winsB >= maxVit || concluidas >= maxTotal
  const numAtual     = emDraftEntry ? Number(emDraftEntry[0]) : concluidas + 1

  async function marcarVencedorPartida(time) {
    if (!emDraftEntry) return
    const [pNum] = emDraftEntry
    const picks = { A: draftEstado?.timeA?.picks ?? [], B: draftEstado?.timeB?.picks ?? [] }
    const bans  = { A: draftEstado?.timeA?.bans  ?? [], B: draftEstado?.timeB?.bans  ?? [] }
    const updates = {}
    const base = `${confrontosPath(campeonatoId)}/${confrontoId}`
    updates[`${base}/partidas/${pNum}/status`]      = 'concluida'
    updates[`${base}/partidas/${pNum}/vencedor`]    = time
    updates[`${base}/partidas/${pNum}/picks`]       = picks
    updates[`${base}/partidas/${pNum}/bans`]        = bans
    updates[`${base}/partidas/${pNum}/encerradoEm`] = Date.now()
    await update(ref(db), updates)
    flash(`Partida ${pNum} encerrada!`)
  }

  async function iniciarProximaPartida() {
    const novoId = gerarSessaoId()
    setSessaoId(novoId)
    setDraftCriado(false)
    setGlobalBans([])
    setMapaId('')
    setPrimeiroTime('A')
    flash(`Pronto para configurar a Partida ${concluidas + 1}.`)
    // Garante que a próxima partida também reconecta corretamente em caso de reload
    // (heroDraftId só é gravado quando admin clicar em Criar Hero Draft)
  }

  async function registrarResultadoFinal() {
    const base   = `${confrontosPath(campeonatoId)}/${confrontoId}`
    const isTie  = winsA === winsB
    // resultado sempre necessário — tabela e bot leem c.resultado para pontuar
    const resultado = {
      tipo:  isTie ? 'empate' : 'normal',
      timeA: winsA,
      timeB: winsB,
    }
    await update(ref(db), {
      [`${base}/status`]:    isTie ? 'empate_pendente' : 'realizado',
      [`${base}/resultado`]: resultado,
    })
    setConfirmResultado(false)
    flash(isTie ? 'Empate registrado — desempate pendente.' : 'Resultado registrado!')
  }

  async function encerrarShowmatch() {
    if (sessaoPath) await remove(ref(db, sessaoPath))
    if (isConfrontoMode) await remove(ref(db, heroDraftPath))
    if (!isConfrontoMode) localStorage.removeItem('showmatch_sessaoId')
    setConfirmEnd(false)
    setSessao(isConfrontoMode ? null : null)
    flash(isConfrontoMode ? 'Draft encerrado.' : 'Showmatch encerrado e apagado.')
  }

  const baseUrl = window.location.origin

  if (sessao === undefined) return (
    <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>
  )

  return (
    <main className="page">

      {/* Banner de sessão ativa */}
      {sessao && (
        <div style={{
          background: confrontoCtx ? 'rgba(155,110,232,0.1)' : 'rgba(224,85,85,0.12)',
          border: `1px solid ${confrontoCtx ? 'rgba(155,110,232,0.4)' : 'rgba(224,85,85,0.4)'}`,
          borderRadius: 8, padding: '12px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>{confrontoCtx ? '⚔️' : '⚡'}</span>
          <div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: confrontoCtx ? 'var(--purple)' : 'var(--red)', letterSpacing: '0.05em' }}>
              {confrontoCtx ? 'PARTIDA ATIVA' : 'SHOWMATCH ATIVO'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {confrontoCtx
                ? `${confrontoCtx.tA?.nome ?? 'Time A'} vs ${confrontoCtx.tB?.nome ?? 'Time B'}`
                : 'Nada aqui afeta dados do campeonato oficial.'}
            </div>
          </div>
        </div>
      )}

      {/* Banner de contexto quando vinculado a um confronto */}
      {confrontoCtx && (
        <div style={{
          background: 'rgba(155,110,232,0.08)', border: '1px solid rgba(155,110,232,0.35)',
          borderRadius: 8, padding: '12px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>⚔️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--purple)' }}>
              Draft vinculado ao confronto
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              <span style={{ color: confrontoCtx.tA?.cor }}>{confrontoCtx.tA?.nome ?? 'Time A'}</span>
              {' vs '}
              <span style={{ color: confrontoCtx.tB?.cor }}>{confrontoCtx.tB?.nome ?? 'Time B'}</span>
              {' · Times importados automaticamente'}
            </div>
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}
          >
            ← Voltar ao confronto
          </button>
        </div>
      )}

      <h1 className="page-title" style={{ marginBottom: 8 }}>
        {confrontoCtx ? 'Draft de Heróis' : 'Showmatch'}
      </h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 28 }}>
        {sessao ? 'Gerencie a sessão ativa.' : confrontoCtx ? 'Configure e inicie o draft para este confronto.' : 'Crie uma partida casual sem afetar nenhum campeonato.'}
      </p>

      {/* ── SEM SESSAO: formulário de criação ─────────────────────────── */}
      {!sessao && (
        <div className="admin-section" style={{ maxWidth: 600 }}>
          <div className="admin-section-title">Criar Showmatch</div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div className="admin-toggle-label" style={{ marginBottom: 6 }}>Nome do Time A</div>
                <input style={inputStyle} value={nomeA} onChange={e => setNomeA(e.target.value)} placeholder="Time A" />
                <div className="admin-toggle-label" style={{ marginTop: 10, marginBottom: 6 }}>Jogadores (um por linha)</div>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
                  value={jogadoresA} onChange={e => setJogadoresA(e.target.value)}
                  placeholder={'Jogador1\nJogador2\nJogador3'} />
              </div>
              <div>
                <div className="admin-toggle-label" style={{ marginBottom: 6 }}>Nome do Time B</div>
                <input style={inputStyle} value={nomeB} onChange={e => setNomeB(e.target.value)} placeholder="Time B" />
                <div className="admin-toggle-label" style={{ marginTop: 10, marginBottom: 6 }}>Jogadores (um por linha)</div>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
                  value={jogadoresB} onChange={e => setJogadoresB(e.target.value)}
                  placeholder={'Jogador1\nJogador2\nJogador3'} />
              </div>
            </div>
            <button className="btn primary" style={{ fontSize: 13, padding: '10px 20px', alignSelf: 'flex-start' }} onClick={criarShowmatch}>
              &#x26A1; Criar Showmatch
            </button>
          </div>
        </div>
      )}

      {/* ── SESSAO ATIVA ──────────────────────────────────────────────── */}
      {sessao && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Times */}
          <div className="admin-section" style={{ maxWidth: 700 }}>
            <div className="admin-section-title">Times</div>
            <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {['timeA', 'timeB'].map(t => {
                const time = sessao[t] ?? {}
                return (
                  <div key={t}>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: t === 'timeA' ? 'var(--blue)' : 'var(--gold)', marginBottom: 6 }}>
                      {time.nome ?? t}
                    </div>
                    {(time.jogadores ?? []).map((j, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '2px 0' }}>&middot; {j}</div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Links de capitão */}
          <div className="admin-section" style={{ maxWidth: 700 }}>
            <div className="admin-section-title">Links dos Capitães</div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['A', 'B'].map(t => {
                const url = isConfrontoMode
                  ? `${baseUrl}/campeonatos/${campeonatoId}/hero-draft?sessao=${sessaoId}&time=${t}`
                  : `${baseUrl}/showmatch/draft?time=${t}&sessao=${sessaoId}`
                return (
                  <div key={t}>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                      Capitão {t === 'A' ? (sessao.timeA?.nome ?? 'Time A') : (sessao.timeB?.nome ?? 'Time B')}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <code style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 12px', fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>
                        {url}
                      </code>
                      <button className="btn" style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                        onClick={() => { navigator.clipboard.writeText(url); flash(`Link Time ${t} copiado!`) }}>
                        Copiar
                      </button>
                    </div>
                  </div>
                )
              })}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Espectador (público)</div>
                {(() => {
                  const espUrl = isConfrontoMode
                    ? `${baseUrl}/campeonatos/${campeonatoId}/hero-draft/espectador?sessao=${sessaoId}`
                    : `${baseUrl}/showmatch/espectador?sessao=${sessaoId}`
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <code style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 12px', fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>
                        {espUrl}
                      </code>
                      <button className="btn" style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                        onClick={() => { navigator.clipboard.writeText(espUrl); flash('Link espectador copiado!') }}>
                        Copiar
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Hero Draft */}
          <div className="admin-section" style={{ maxWidth: 700 }}>
            <div className="admin-section-title">Hero Draft</div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!draftCriado ? (
                <>
                  {/* Timer por ação */}
                  <div>
                    <div className="admin-toggle-label" style={{ marginBottom: 8 }}>Timer por ação <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(segundos)</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[
                        { label: 'Ban', value: timerBan, set: setTimerBan },
                        { label: 'Pick Simples', value: timerPick, set: setTimerPick },
                        { label: 'Pick Duplo', value: timerPickDuplo, set: setTimerPickDuplo },
                      ].map(({ label, value, set }) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => set(v => Math.max(5, Number(v) - 5))}
                              style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>−</button>
                            <input type="number" min={5} max={300} value={value}
                              onChange={e => set(Math.max(5, Math.min(300, Number(e.target.value))))}
                              style={{ ...inputStyle, width: 54, textAlign: 'center', padding: '5px 6px' }} />
                            <button onClick={() => set(v => Math.min(300, Number(v) + 5))}
                              style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 6 }}>
                      Pick Duplo = dois picks consecutivos do mesmo time (ex: B escolhe 2 heróis)
                    </div>
                  </div>

                  {/* Quem começa */}
                  <div>
                    <div className="admin-toggle-label" style={{ marginBottom: 8 }}>Quem começa o draft</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['A', 'B']).map(t => {
                        const nome = t === 'A' ? (sessao?.timeA?.nome ?? 'Time A') : (sessao?.timeB?.nome ?? 'Time B')
                        return (
                          <button key={t} onClick={() => setPrimeiroTime(t)} style={{
                            padding: '6px 20px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                            border: `1px solid ${primeiroTime === t ? 'var(--gold)' : 'var(--border2)'}`,
                            background: primeiroTime === t ? 'rgba(201,168,76,0.12)' : 'var(--bg2)',
                            color: primeiroTime === t ? 'var(--gold)' : 'var(--text2)',
                          }}>
                            {nome}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>
                      O primeiro ban e o primeiro pick pertencem ao time selecionado.
                    </div>
                  </div>

                  {/* Bans por time */}
                  <div>
                    <div className="admin-toggle-label" style={{ marginBottom: 8 }}>Bans por time</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[0, 2, 3].map(n => (
                        <button key={n} onClick={() => setNumBans(n)} style={{
                          padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                          border: `1px solid ${numBans === n ? 'var(--blue)' : 'var(--border2)'}`,
                          background: numBans === n ? 'rgba(74,158,218,0.12)' : 'var(--bg2)',
                          color: numBans === n ? 'var(--blue)' : 'var(--text2)',
                        }}>
                          {n === 0 ? 'Sem bans' : `${n} por time`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mapa */}
                  <div>
                    <div className="admin-toggle-label" style={{ marginBottom: 8 }}>Mapa <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6, maxHeight: 180, overflowY: 'auto', padding: 8, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                      <button onClick={() => setMapaId('')} style={{
                        padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
                        border: `1px solid ${!mapaId ? 'var(--blue)' : 'var(--border)'}`,
                        background: !mapaId ? 'rgba(74,158,218,0.12)' : 'var(--bg3)',
                        color: !mapaId ? 'var(--blue)' : 'var(--text2)',
                      }}>
                        — Sem mapa
                      </button>
                      {MAPAS.map(m => (
                        <button key={m.id} onClick={() => setMapaId(m.id)} style={{
                          padding: 0, borderRadius: 4, cursor: 'pointer', overflow: 'hidden',
                          border: `1px solid ${mapaId === m.id ? 'var(--gold)' : 'var(--border)'}`,
                          background: 'var(--bg3)',
                          boxShadow: mapaId === m.id ? '0 0 8px rgba(201,168,76,0.4)' : 'none',
                        }}>
                          <img src={m.splashUrl} alt={m.nome} onError={e => { e.target.style.display = 'none' }}
                            style={{ width: '100%', height: 46, objectFit: 'cover', display: 'block' }} />
                          <div style={{ padding: '3px 6px', fontSize: 10, textAlign: 'center', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: mapaId === m.id ? 'var(--gold)' : 'var(--text2)', lineHeight: 1.2 }}>
                            {m.nome}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Global Bans */}
                  <div>
                    <div className="admin-toggle-label" style={{ marginBottom: 8 }}>
                      Global Bans{globalBans.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>({globalBans.length} selecionados)</span>}
                      <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>bloqueados antes do draft</span>
                    </div>
                    <input value={buscaBan} onChange={e => setBuscaBan(e.target.value)}
                      placeholder="Buscar herói..." style={{ ...inputStyle, marginBottom: 8 }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 160, overflowY: 'auto', padding: 8, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                      {HEROES
                        .filter(h => !buscaBan || h.nome.toLowerCase().includes(buscaBan.toLowerCase()))
                        .map(h => {
                          const sel = globalBans.includes(h.id)
                          return (
                            <button key={h.id} onClick={() => toggleGlobalBan(h.id)} style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              background: sel ? 'rgba(224,85,85,0.18)' : 'var(--bg3)',
                              border: `1px solid ${sel ? 'var(--red)' : 'var(--border)'}`,
                              color: sel ? 'var(--red)' : 'var(--text2)',
                              borderRadius: 4, padding: '3px 8px', fontSize: 12,
                              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, cursor: 'pointer',
                            }}>
                              <img src={h.iconeUrl} alt="" style={{ width: 16, height: 16, borderRadius: 2, objectFit: 'cover' }}
                                onError={e => { e.target.style.display = 'none' }} />
                              {h.nome}{sel && ' ✕'}
                            </button>
                          )
                        })}
                    </div>
                  </div>

                  <button className="btn primary" style={{ fontSize: 13, padding: '9px 20px', alignSelf: 'flex-start' }} onClick={criarHeroDraft}>
                    Criar Hero Draft
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Edição de configurações enquanto aguardando (showmatch) */}
                  {!isConfrontoMode && draftEstado?.status === 'aguardando' && (
                    <ConfigEdicao
                      timerBan={timerBan} setTimerBan={setTimerBan}
                      timerPick={timerPick} setTimerPick={setTimerPick}
                      timerPickDuplo={timerPickDuplo} setTimerPickDuplo={setTimerPickDuplo}
                      primeiroTime={primeiroTime} setPrimeiroTime={setPrimeiroTime}
                      numBans={numBans} setNumBans={setNumBans}
                      mapaId={mapaId} setMapaId={setMapaId}
                      globalBans={globalBans} toggleGlobalBan={toggleGlobalBan}
                      buscaBan={buscaBan} setBuscaBan={setBuscaBan}
                      onAtualizar={atualizarConfiguracoes}
                    />
                  )}

                  {/* Placar + partida atual (confronto mode) */}
                  {isConfrontoMode && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                        {formato} · Partida {numAtual}/{maxTotal}
                      </div>
                      <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, flex: 1, textAlign: 'center' }}>
                        <span style={{ color: winsA > winsB ? 'var(--green)' : 'var(--text2)' }}>{sessao?.timeA?.nome ?? 'Time A'}</span>
                        <span style={{ color: 'var(--text3)', margin: '0 10px' }}>{winsA} – {winsB}</span>
                        <span style={{ color: winsB > winsA ? 'var(--green)' : 'var(--text2)' }}>{sessao?.timeB?.nome ?? 'Time B'}</span>
                      </div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: isDone ? 'var(--gold)' : 'var(--text3)' }}>
                        {isDone ? '🏁 Concluído' : ''}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Draft encerrado — marcar vencedor (confronto) ou exibir status (showmatch) */}
                    {draftEstado?.status === 'encerrado' && (
                      isConfrontoMode && emDraftEntry ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                          <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                            Marcar vencedor da Partida {emDraftEntry[0]}:
                          </span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {[
                              { key: 'timeA', nome: sessao?.timeA?.nome ?? 'Time A' },
                              { key: 'timeB', nome: sessao?.timeB?.nome ?? 'Time B' },
                            ].map(({ key, nome }) => (
                              <button key={key} className="btn primary"
                                style={{ flex: 1, fontSize: 13, padding: '8px 12px' }}
                                onClick={() => marcarVencedorPartida(key)}>
                                🏆 {nome}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>✓ Encerrado</span>
                      )
                    )}

                    {/* Draft encerrado + partida marcada: próxima partida ou registrar resultado */}
                    {draftEstado?.status === 'encerrado' && isConfrontoMode && !emDraftEntry && (
                      isDone ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                          {!confirmResultado ? (
                            <button className="btn primary" style={{ fontSize: 13, padding: '9px 16px', alignSelf: 'flex-start', borderColor: 'var(--gold)', color: 'var(--gold)', background: 'rgba(201,168,76,0.08)' }}
                              onClick={() => setConfirmResultado(true)}>
                              ✓ Registrar Resultado Final
                            </button>
                          ) : (
                            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '12px 16px' }}>
                              <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 10px' }}>
                                Confirmar resultado:{' '}
                                <strong>{sessao?.timeA?.nome ?? 'Time A'} {winsA} × {winsB} {sessao?.timeB?.nome ?? 'Time B'}</strong>?
                                {winsA === winsB && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>(Empate — desempate pendente)</span>}
                              </p>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn primary" style={{ fontSize: 13, padding: '7px 16px' }} onClick={registrarResultadoFinal}>
                                  Confirmar
                                </button>
                                <button className="btn" style={{ fontSize: 13, padding: '7px 12px' }} onClick={() => setConfirmResultado(false)}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button className="btn primary" style={{ fontSize: 13, padding: '9px 16px', borderColor: 'var(--purple)', color: 'var(--purple)', background: 'rgba(155,110,232,0.08)' }}
                          onClick={iniciarProximaPartida}>
                          ▶ Iniciar Partida {concluidas + 1}
                        </button>
                      )
                    )}

                    {draftEstado?.status === 'aguardando' && (
                      <>
                        {/* Confirmação de presença dos capitães */}
                        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 2 }}>
                            Confirmação de presença
                          </div>
                          {['A', 'B'].map(t => {
                            const confirmado = sessao?.presenca?.[t]?.confirmado === true
                            const online     = !!(draftEstado.presence?.[t]?.onlineEm)
                            const nome       = t === 'A' ? sessao?.timeA?.nome : sessao?.timeB?.nome
                            return (
                              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                <div style={{
                                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: confirmado ? 'rgba(76,175,125,0.15)' : online ? 'rgba(201,168,76,0.1)' : 'var(--bg3)',
                                  border: `1px solid ${confirmado ? 'var(--green)' : online ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
                                  fontSize: 11,
                                }}>
                                  {confirmado ? '✓' : online ? '●' : '○'}
                                </div>
                                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", color: confirmado ? 'var(--green)' : online ? 'var(--gold)' : 'var(--text3)' }}>
                                  {nome ?? `Time ${t}`}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginLeft: 'auto' }}>
                                  {confirmado ? 'Confirmado ✓' : online ? 'Na sala — aguardando confirmação' : 'Ainda não entrou'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        {(() => {
                          const ambos = sessao?.presenca?.A?.confirmado && sessao?.presenca?.B?.confirmado
                          return (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button className="btn primary"
                                style={{ fontSize: 12, padding: '6px 14px', opacity: ambos ? 1 : 0.7 }}
                                onClick={handleIniciar}>
                                {ambos ? '▶ Iniciar Draft' : '▶ Iniciar Draft (aguardando confirmações)'}
                              </button>
                              {!ambos && (
                                <button className="btn" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--text3)' }}
                                  onClick={handleIniciar}>
                                  Forçar início
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </>
                    )}
                    {draftEstado?.status === 'countdown' && (
                      <span style={{ fontSize: 13, color: 'var(--gold2)', fontFamily: "'Barlow Condensed'" }}>⏳ Contagem regressiva...</span>
                    )}
                    {draftEstado?.status === 'rodando' && (
                      <>
                        <span style={{ fontSize: 13, color: 'var(--green)' }}>● Em andamento</span>
                        <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleDesfazer}
                          disabled={!draftEstado?.historico?.length}>
                          ↩ Desfazer
                        </button>
                        <button className="btn" style={{ fontSize: 12, padding: '6px 12px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }}
                          onClick={handleEncerrar}>
                          ⏹ Encerrar Draft
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Encerrar showmatch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!confirmEnd ? (
              <button className="btn" style={{ fontSize: 13, padding: '8px 18px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }}
                onClick={() => setConfirmEnd(true)}>
                {isConfrontoMode ? 'Encerrar e apagar draft' : 'Encerrar e apagar showmatch'}
              </button>
            ) : (
              <>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Apagar tudo permanentemente?</span>
                <button className="btn" style={{ fontSize: 13, padding: '7px 14px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }}
                  onClick={encerrarShowmatch}>Confirmar</button>
                <button className="btn" style={{ fontSize: 13, padding: '7px 14px' }}
                  onClick={() => setConfirmEnd(false)}>Cancelar</button>
              </>
            )}
          </div>

        </div>
      )}

      {msg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, padding: '10px 18px', borderRadius: 8, fontSize: 13, background: msg.tipo === 'err' ? 'rgba(224,85,85,0.9)' : 'rgba(76,175,125,0.9)', color: '#fff', zIndex: 999 }}>
          {msg.text}
        </div>
      )}
    </main>
  )
}

// ── ConfigEdicao — configurações editáveis mesmo após criar o draft ────────────

function ConfigEdicao({ timerBan, setTimerBan, timerPick, setTimerPick, timerPickDuplo, setTimerPickDuplo, primeiroTime, setPrimeiroTime, numBans, setNumBans, mapaId, setMapaId, globalBans, toggleGlobalBan, buscaBan, setBuscaBan, onAtualizar }) {
  const [aberto, setAberto] = useState(false)

  const inputStyle = {
    background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
    padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setAberto(a => !a)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        <span>✎ Editar configurações</span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{aberto ? '▲' : '▼'}</span>
      </button>

      {aberto && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Timer */}
          <div>
            <div className="admin-toggle-label" style={{ marginBottom: 8, fontSize: 12 }}>Timer por ação <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(segundos)</span></div>
            <div style={{ display: 'flex', gap: 20 }}>
              {[['Ban', timerBan, setTimerBan], ['Pick Simples', timerPick, setTimerPick], ['Pick Duplo', timerPickDuplo, setTimerPickDuplo]].map(([label, val, set]) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button className="btn" style={{ fontSize: 14, padding: '3px 10px' }} onClick={() => set(v => Math.max(5, Number(v) - 5))}>−</button>
                    <input type="number" value={val} onChange={e => set(e.target.value)}
                      style={{ ...inputStyle, width: 56, textAlign: 'center', padding: '6px 4px' }} />
                    <button className="btn" style={{ fontSize: 14, padding: '3px 10px' }} onClick={() => set(v => Number(v) + 5)}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quem começa */}
          <div>
            <div className="admin-toggle-label" style={{ marginBottom: 8, fontSize: 12 }}>Quem começa o draft</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['A', 'B'].map(t => (
                <button key={t} className={`btn${primeiroTime === t ? ' primary' : ''}`}
                  style={{ fontSize: 12, padding: '5px 18px' }}
                  onClick={() => setPrimeiroTime(t)}>
                  {t === 'A' ? 'Time A' : 'Time B'}
                </button>
              ))}
            </div>
          </div>

          {/* Bans por time */}
          <div>
            <div className="admin-toggle-label" style={{ marginBottom: 8, fontSize: 12 }}>Bans por time</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['Sem bans', 0], ['2 por time', 2], ['3 por time', 3]].map(([label, val]) => (
                <button key={val} className={`btn${numBans === val ? ' primary' : ''}`}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => setNumBans(val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mapa */}
          <div>
            <div className="admin-toggle-label" style={{ marginBottom: 8, fontSize: 12 }}>Mapa <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => setMapaId('')}
                style={{ padding: 0, borderRadius: 4, cursor: 'pointer', overflow: 'hidden', border: `1px solid ${!mapaId ? 'var(--gold)' : 'var(--border)'}`, background: 'var(--bg3)', width: 70 }}>
                <div style={{ width: '100%', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>— Sem mapa</div>
              </button>
              {MAPAS.map(m => (
                <button key={m.id} onClick={() => setMapaId(m.id)}
                  style={{ padding: 0, borderRadius: 4, cursor: 'pointer', overflow: 'hidden', border: `1px solid ${mapaId === m.id ? 'var(--gold)' : 'var(--border)'}`, background: 'var(--bg3)' }}>
                  <img src={m.splashUrl} alt={m.nome} style={{ width: 70, height: 38, objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                </button>
              ))}
            </div>
          </div>

          {/* Global Bans */}
          <div>
            <div className="admin-toggle-label" style={{ marginBottom: 8, fontSize: 12 }}>
              Global Bans{globalBans.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>({globalBans.length})</span>}
            </div>
            <input value={buscaBan} onChange={e => setBuscaBan(e.target.value)} placeholder="Buscar herói..."
              style={{ ...inputStyle, marginBottom: 6 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflowY: 'auto', padding: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
              {HEROES.filter(h => !buscaBan || h.nome.toLowerCase().includes(buscaBan.toLowerCase())).map(h => {
                const sel = globalBans.includes(h.id)
                return (
                  <button key={h.id} onClick={() => toggleGlobalBan(h.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: sel ? 'rgba(224,85,85,0.18)' : 'var(--bg3)', border: `1px solid ${sel ? 'var(--red)' : 'var(--border)'}`, color: sel ? 'var(--red)' : 'var(--text2)', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, cursor: 'pointer' }}>
                    <img src={h.iconeUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                    {h.nome}{sel && ' ✕'}
                  </button>
                )
              })}
            </div>
          </div>

          <button className="btn primary" style={{ fontSize: 13, padding: '8px 18px', alignSelf: 'flex-start' }}
            onClick={onAtualizar}>
            ✓ Aplicar alterações
          </button>
        </div>
      )}
    </div>
  )
}
