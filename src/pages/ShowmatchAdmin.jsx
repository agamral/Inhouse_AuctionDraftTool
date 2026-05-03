import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove } from 'firebase/database'
import { db } from '../firebase/database'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { criarEstadoInicial, SEQUENCIA_PADRAO } from '../utils/heroDraft'
import { MAPAS } from '../utils/mapPool'

const SHOWMATCH_PATH = 'showmatch/sessaoAtiva'
const HERO_DRAFT_PATH = 'showmatch/sessaoAtiva/heroDraft'

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
  const [sessao,   setSessao]   = useState(undefined) // undefined=loading, null=none, obj=active
  const [msg,      setMsg]      = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(false)

  // Form for creating a showmatch
  const [nomeA,      setNomeA]      = useState('Time A')
  const [nomeB,      setNomeB]      = useState('Time B')
  const [jogadoresA, setJogadoresA] = useState('')
  const [jogadoresB, setJogadoresB] = useState('')

  // Hero Draft config
  const [mapaId,   setMapaId]   = useState(MAPAS[0]?.id ?? '')
  const [numBans,  setNumBans]  = useState(2)
  const [draftCriado, setDraftCriado] = useState(false)

  // Hero Draft hook — uses showmatch path via pathOverride
  const { estado: draftEstado, loading: draftLoading, agir } = useHeroDraft(
    null, 'admin', HERO_DRAFT_PATH
  )

  useEffect(() => {
    const unsub = onValue(ref(db, SHOWMATCH_PATH), (snap) => {
      const val = snap.val()
      // Filter out heroDraft sub-node from session display
      if (val) {
        const { heroDraft: _, ...rest } = val
        setSessao(rest)
      } else {
        setSessao(null)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    setDraftCriado(!!draftEstado)
  }, [draftEstado])

  function flash(text, tipo = 'ok') {
    setMsg({ text, tipo })
    setTimeout(() => setMsg(null), 3000)
  }

  async function criarShowmatch() {
    const listaA = jogadoresA.split('\n').map(s => s.trim()).filter(Boolean)
    const listaB = jogadoresB.split('\n').map(s => s.trim()).filter(Boolean)
    await set(ref(db, SHOWMATCH_PATH), {
      criadoEm: Date.now(),
      status: 'configurando',
      timeA: { nome: nomeA.trim() || 'Time A', jogadores: listaA },
      timeB: { nome: nomeB.trim() || 'Time B', jogadores: listaB },
    })
    flash('Showmatch criado!')
  }

  async function iniciarHeroDraft() {
    if (!sessao) return
    const mapa = MAPAS.find(m => m.id === mapaId) ?? MAPAS[0]
    const sequencia = SEQUENCIAS[numBans] ?? SEQUENCIAS[2]
    const estado = criarEstadoInicial({
      timeA:     { nome: sessao.timeA?.nome ?? 'Time A' },
      timeB:     { nome: sessao.timeB?.nome ?? 'Time B' },
      sequencia,
      mapaId:    mapa.id,
    })
    await set(ref(db, HERO_DRAFT_PATH), estado)
    await update(ref(db, SHOWMATCH_PATH), { status: 'heroDraft' })
    flash('Hero Draft iniciado!')
  }

  async function desfazer() {
    if (!draftEstado?.historico?.length) return
    const hist = [...draftEstado.historico]
    hist.pop()
    await update(ref(db, HERO_DRAFT_PATH), {
      passoAtual: Math.max(0, (draftEstado.passoAtual ?? 1) - 1),
      historico: hist,
    })
  }

  async function encerrarHeroDraft() {
    await update(ref(db, HERO_DRAFT_PATH), { status: 'encerrado' })
    flash('Hero Draft encerrado.')
  }

  async function encerrarShowmatch() {
    await remove(ref(db, SHOWMATCH_PATH))
    setConfirmEnd(false)
    flash('Showmatch encerrado e apagado.')
  }

  const baseUrl = window.location.origin

  if (sessao === undefined) return (
    <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>
  )

  return (
    <main className="page">

      {/* Red SHOWMATCH banner when active */}
      {sessao && (
        <div style={{
          background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.4)',
          borderRadius: 8, padding: '12px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>&#x26A1;</span>
          <div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--red)', letterSpacing: '0.05em' }}>
              SHOWMATCH ATIVO
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Nada aqui afeta dados do campeonato oficial.
            </div>
          </div>
        </div>
      )}

      <h1 className="page-title" style={{ marginBottom: 8 }}>Showmatch</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 28 }}>
        {sessao ? 'Gerencie a sessão ativa.' : 'Crie uma partida casual sem afetar nenhum campeonato.'}
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
                const url = `${baseUrl}/showmatch/draft?time=${t}`
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <code style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 12px', fontSize: 12, color: 'var(--text)' }}>
                    {baseUrl}/showmatch/espectador
                  </code>
                  <button className="btn" style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                    onClick={() => { navigator.clipboard.writeText(`${baseUrl}/showmatch/espectador`); flash('Link espectador copiado!') }}>
                    Copiar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Draft */}
          <div className="admin-section" style={{ maxWidth: 700 }}>
            <div className="admin-section-title">Hero Draft</div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!draftCriado ? (
                <>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div className="admin-toggle-label" style={{ marginBottom: 5 }}>Mapa</div>
                      <select style={{ ...inputStyle }} value={mapaId} onChange={e => setMapaId(e.target.value)}>
                        {MAPAS.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div className="admin-toggle-label" style={{ marginBottom: 5 }}>Bans por time</div>
                      <select style={{ ...inputStyle }} value={numBans} onChange={e => setNumBans(Number(e.target.value))}>
                        <option value={0}>0 bans</option>
                        <option value={2}>2 bans</option>
                        <option value={3}>3 bans</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn primary" style={{ fontSize: 13, padding: '9px 20px', alignSelf: 'flex-start' }} onClick={iniciarHeroDraft}>
                    &#x25B6; Iniciar Hero Draft
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: draftEstado?.status === 'encerrado' ? 'var(--text2)' : 'var(--green)' }}>
                    {draftEstado?.status === 'encerrado' ? '&#x2713; Hero Draft encerrado' : '&#x25CF; Hero Draft em andamento'}
                  </div>
                  {draftEstado?.status !== 'encerrado' && (
                    <>
                      <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={desfazer}
                        disabled={!draftEstado?.historico?.length}>
                        &#x21A9; Desfazer
                      </button>
                      <button className="btn" style={{ fontSize: 12, padding: '6px 12px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }}
                        onClick={encerrarHeroDraft}>
                        &#x23F9; Encerrar Draft
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Encerrar showmatch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!confirmEnd ? (
              <button className="btn" style={{ fontSize: 13, padding: '8px 18px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }}
                onClick={() => setConfirmEnd(true)}>
                Encerrar e apagar showmatch
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
