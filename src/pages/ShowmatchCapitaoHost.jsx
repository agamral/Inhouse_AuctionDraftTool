/**
 * Showmatch do Capitão — página principal do host
 * Rota: /campeonatos/:id/scrim
 *
 * Permite ao capitão criar sessões de scrim/showmatch entre times,
 * gerenciar as partidas (lobby → hero draft → resultado) e ver o
 * histórico de sessões passadas. Não afeta dados do campeonato real.
 */
import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove } from 'firebase/database'
import { db } from '../firebase/database'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath } from '../utils/campeonatoPaths'
import PaginaInativa from '../components/PaginaInativa'
import { MAPAS } from '../utils/mapPool'
import { HEROES } from '../utils/heroPool'
import { criarEstadoInicial, SEQUENCIA_PADRAO, DEFAULT_TIMER_CONFIG, STATUS_DRAFT } from '../utils/heroDraft'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { useServerTimeOffset } from '../hooks/useServerTimeOffset'

function gerarSessaoId() {
  return `scrim-${Date.now().toString(36).slice(-5)}-${Math.random().toString(36).slice(2, 5)}`
}

const SCRIM_PATH = (uid) => `scrims/${uid}`  // /scrims/{criadorUid}/{sessaoId}

export default function ShowmatchCapitaoHost() {
  const { user, capitao, isAdmin } = useAuth()
  const { idPublico } = useCampeonato()

  const [teams,    setTeams]    = useState({})
  const [sessoes,  setSessoes]  = useState({})
  const [view,     setView]     = useState('lista')   // 'lista' | 'criar' | 'sessao'
  const [sessaoSel, setSessaoSel] = useState(null)    // id da sessão em foco
  const [feedback, setFeedback] = useState(null)
  const [salvando, setSalvando] = useState(false)

  // Formulário de nova sessão
  const [formNome,  setFormNome]  = useState('')
  const [formTimeA, setFormTimeA] = useState('')  // teamId do meu time (A)
  const [formTimeB, setFormTimeB] = useState('')  // teamId do adversário (B)

  const uid = user?.uid

  // Times do campeonato (pra selecionar adversário)
  useEffect(() => {
    if (!idPublico) return
    return onValue(ref(db, teamPath(idPublico)), snap => setTeams(snap.val() ?? {}))
  }, [idPublico])

  // Sessões criadas por este capitão
  useEffect(() => {
    if (!uid) return
    return onValue(ref(db, SCRIM_PATH(uid)), snap => setSessoes(snap.val() ?? {}))
  }, [uid])

  // Pré-seleciona o time do capitão como Time A
  useEffect(() => {
    if (!capitao || Object.keys(teams).length === 0) return
    const meuTimeId = Object.entries(teams).find(([, t]) =>
      t.capitaoNome === capitao.capitaoNome || t.capitaoUid === uid
    )?.[0]
    if (meuTimeId) setFormTimeA(meuTimeId)
  }, [capitao, teams, uid]) // eslint-disable-line

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function criarSessao() {
    if (!formNome.trim()) return flash('erro', 'Dê um nome pra sessão.')
    if (!formTimeA || !formTimeB) return flash('erro', 'Selecione os dois times.')
    if (formTimeA === formTimeB) return flash('erro', 'Os dois times precisam ser diferentes.')

    const tA = teams[formTimeA]
    const tB = teams[formTimeB]

    setSalvando(true)
    try {
      const sessaoId = gerarSessaoId()
      await set(ref(db, `${SCRIM_PATH(uid)}/${sessaoId}`), {
        nome:        formNome.trim(),
        campeonatoId: idPublico,
        criadorUid:  uid,
        criadorNome: capitao?.capitaoNome ?? capitao?.nome ?? '',
        timeA: { teamId: formTimeA, nome: tA?.nome ?? 'Time A', cor: tA?.cor ?? '#4a9eda' },
        timeB: { teamId: formTimeB, nome: tB?.nome ?? 'Time B', cor: tB?.cor ?? '#e05555' },
        status:    'ativa',
        criadoEm:  Date.now(),
        partidas:  {},
      })
      setSessaoSel(sessaoId)
      setView('sessao')
      setFormNome('')
      flash('ok', `Sessão "${formNome.trim()}" criada!`)
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  async function encerrarSessao(sessaoId) {
    await update(ref(db, `${SCRIM_PATH(uid)}/${sessaoId}`), { status: 'encerrada' })
    flash('ok', 'Sessão encerrada.')
  }

  async function deletarSessao(sessaoId) {
    await remove(ref(db, `${SCRIM_PATH(uid)}/${sessaoId}`))
    if (sessaoSel === sessaoId) { setSessaoSel(null); setView('lista') }
    flash('ok', 'Sessão removida.')
  }

  // Guard
  if (!isAdmin && !capitao) {
    return <PaginaInativa icone="⚔️" titulo="Acesso restrito" descricao="Esta área é exclusiva para capitães de times." />
  }

  const sessoesArr = Object.entries(sessoes).sort(([, a], [, b]) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0))
  const timesArr   = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))

  return (
    <main className="page" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Scrims & Showmatches</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Partidas casuais fora do campeonato — resultados não afetam a tabela.
          </p>
        </div>
        {view === 'lista' && (
          <button className="btn primary" style={{ fontSize: 13, padding: '8px 18px' }}
            onClick={() => setView('criar')}>
            + Nova sessão
          </button>
        )}
        {(view === 'criar' || view === 'sessao') && (
          <button className="btn" style={{ fontSize: 13, padding: '8px 14px' }}
            onClick={() => { setView('lista'); setSessaoSel(null) }}>
            ← Voltar
          </button>
        )}
      </div>

      {feedback && (
        <div style={{
          padding: '8px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16,
          background: feedback.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
          border: `1px solid ${feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* ── Criar sessão ──────────────────────────────────────────────────── */}
      {view === 'criar' && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 17 }}>Nova sessão</div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
              Nome da sessão
            </label>
            <input
              value={formNome}
              onChange={e => setFormNome(e.target.value)}
              placeholder="Ex: Scrim vs Exorr — 30/05"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Time A (seu time)
              </label>
              <select value={formTimeA} onChange={e => setFormTimeA(e.target.value)} style={inputStyle}>
                <option value="">— selecionar —</option>
                {timesArr.map(([id, t]) => (
                  <option key={id} value={id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Time B (adversário)
              </label>
              <select value={formTimeB} onChange={e => setFormTimeB(e.target.value)} style={inputStyle}>
                <option value="">— selecionar —</option>
                {timesArr.filter(([id]) => id !== formTimeA).map(([id, t]) => (
                  <option key={id} value={id}>{t.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" style={{ fontSize: 13, padding: '8px 20px' }}
              onClick={criarSessao} disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar sessão'}
            </button>
            <button className="btn" style={{ fontSize: 13, padding: '8px 14px' }}
              onClick={() => setView('lista')}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista de sessões ──────────────────────────────────────────────── */}
      {view === 'lista' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessoesArr.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>
              Nenhuma sessão criada ainda. Clique em "+ Nova sessão" para começar.
            </div>
          )}
          {sessoesArr.map(([id, s]) => {
            const partidasArr = Object.entries(s.partidas ?? {}).sort(([a], [b]) => Number(a) - Number(b))
            const vA = partidasArr.filter(([, p]) => p.vencedor === 'A').length
            const vB = partidasArr.filter(([, p]) => p.vencedor === 'B').length
            const totalJogadas = partidasArr.filter(([, p]) => p.vencedor).length
            return (
              <div key={id} style={{
                background: 'var(--bg3)', border: `1px solid ${s.status === 'ativa' ? 'rgba(76,175,125,0.3)' : 'var(--border)'}`,
                borderRadius: 8, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: s.status === 'ativa' ? 'var(--text)' : 'var(--text2)' }}>
                    {s.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: s.timeA?.cor }}>{s.timeA?.nome ?? 'Time A'}</span>
                    <span>vs</span>
                    <span style={{ color: s.timeB?.cor }}>{s.timeB?.nome ?? 'Time B'}</span>
                    {totalJogadas > 0 && (
                      <span style={{ color: 'var(--text2)' }}>
                        · <strong style={{ color: s.timeA?.cor }}>{vA}</strong>–<strong style={{ color: s.timeB?.cor }}>{vB}</strong> ({totalJogadas} partida{totalJogadas > 1 ? 's' : ''})
                      </span>
                    )}
                    <span>· {new Date(s.criadoEm).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {s.status === 'ativa' && (
                    <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: 'var(--green)', background: 'rgba(76,175,125,0.12)', border: '1px solid var(--green)', borderRadius: 4, padding: '2px 7px' }}>
                      ATIVA
                    </span>
                  )}
                  <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => { setSessaoSel(id); setView('sessao') }}>
                    {s.status === 'ativa' ? 'Gerenciar' : 'Ver histórico'}
                  </button>
                  {s.status === 'ativa' && (
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--text2)', borderColor: 'var(--border)' }}
                      onClick={() => encerrarSessao(id)}>
                      Encerrar
                    </button>
                  )}
                  <button className="btn" style={{ fontSize: 12, padding: '4px 8px', borderColor: 'rgba(224,85,85,0.3)', color: 'var(--text3)' }}
                    onClick={() => deletarSessao(id)}>
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Detalhe da sessão (gerenciar / histórico) ─────────────────────── */}
      {view === 'sessao' && sessaoSel && sessoes[sessaoSel] && (
        <SessaoDetalhe
          sessaoId={sessaoSel}
          sessao={sessoes[sessaoSel]}
          uid={uid}
          campeonatoId={idPublico}
          teams={teams}
          scrimPath={SCRIM_PATH(uid)}
          onFlash={flash}
        />
      )}
    </main>
  )
}

// ── Componente de detalhe da sessão ───────────────────────────────────────────
function SessaoDetalhe({ sessaoId, sessao, uid, campeonatoId, teams, scrimPath, onFlash }) {
  const [criandoPartida, setCriandoPartida] = useState(false)

  const partidasArr = Object.entries(sessao.partidas ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))

  const proximoNum = (Math.max(0, ...partidasArr.map(([n]) => Number(n))) + 1)

  async function criarPartida() {
    setCriandoPartida(true)
    try {
      await update(ref(db, `${scrimPath}/${sessaoId}/partidas/${proximoNum}`), {
        status:    'configurando',
        criadoEm:  Date.now(),
        vencedor:  null,
        mapaId:    null,
        heroDraftId: null,
      })
      onFlash('ok', `Partida ${proximoNum} criada.`)
    } catch (e) {
      onFlash('erro', `Erro: ${e.message}`)
    } finally {
      setCriandoPartida(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header da sessão */}
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
          {sessao.nome}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif', color: 'var(--text2)'" }}>
          <span style={{ color: sessao.timeA?.cor }}>{sessao.timeA?.nome}</span>
          <span style={{ color: 'var(--text3)' }}>vs</span>
          <span style={{ color: sessao.timeB?.cor }}>{sessao.timeB?.nome}</span>
          {(() => {
            const vA = partidasArr.filter(([, p]) => p.vencedor === 'A').length
            const vB = partidasArr.filter(([, p]) => p.vencedor === 'B').length
            if (!vA && !vB) return null
            return <span style={{ color: 'var(--text2)' }}>— <strong style={{ color: sessao.timeA?.cor }}>{vA}</strong>×<strong style={{ color: sessao.timeB?.cor }}>{vB}</strong></span>
          })()}
        </div>
      </div>

      {/* Partidas existentes */}
      {partidasArr.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {partidasArr.map(([num, p]) => (
            <PartidaCard key={num} num={num} partida={p} sessao={sessao} sessaoId={sessaoId} scrimPath={scrimPath} campeonatoId={campeonatoId} onFlash={onFlash} />
          ))}
        </div>
      )}

      {/* Criar próxima partida */}
      {sessao.status === 'ativa' && (
        <button className="btn primary" style={{ fontSize: 14, padding: '10px 0', alignSelf: 'flex-start', minWidth: 200 }}
          onClick={criarPartida} disabled={criandoPartida}>
          {criandoPartida ? 'Criando...' : `+ Partida ${proximoNum}`}
        </button>
      )}
    </div>
  )
}

// Sequências de pick/ban (igual ao ShowmatchAdmin)
const SEQUENCIAS_SCRIM = {
  0: [
    { acao: 'pick', time: 'A', quantidade: 1 }, { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 }, { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 }, { acao: 'pick', time: 'B', quantidade: 1 },
  ],
  2: [
    { acao: 'ban',  time: 'A', quantidade: 1 }, { acao: 'ban',  time: 'B', quantidade: 1 },
    { acao: 'ban',  time: 'A', quantidade: 1 }, { acao: 'ban',  time: 'B', quantidade: 1 },
    { acao: 'pick', time: 'A', quantidade: 1 }, { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 }, { acao: 'pick', time: 'B', quantidade: 2 },
    { acao: 'pick', time: 'A', quantidade: 2 }, { acao: 'pick', time: 'B', quantidade: 1 },
  ],
  3: SEQUENCIA_PADRAO,
}

function gerarHeroDraftId() {
  return `scrim-draft-${Date.now().toString(36).slice(-5)}-${Math.random().toString(36).slice(2, 5)}`
}

// ── Card de partida individual ────────────────────────────────────────────────
function PartidaCard({ num, partida: p, sessao, sessaoId, scrimPath, campeonatoId, onFlash }) {
  const timeOffset = useServerTimeOffset()

  // ── Config da partida (fase 'configurando') ───────────────────────────────
  const [mapaId,       setMapaId]       = useState(p.mapaId ?? '')
  const [numBans,      setNumBans]      = useState(p.config?.numBans ?? 2)
  const [timerBan,     setTimerBan]     = useState(p.config?.timerBan     ?? DEFAULT_TIMER_CONFIG.ban)
  const [timerPick,    setTimerPick]    = useState(p.config?.timerPick    ?? DEFAULT_TIMER_CONFIG.pick)
  const [timerPickD,   setTimerPickD]   = useState(p.config?.timerPickD   ?? DEFAULT_TIMER_CONFIG.pickDuplo)
  const [primeiroTime, setPrimeiroTime] = useState(p.config?.primeiroTime ?? 'A')
  const [globalBans,   setGlobalBans]   = useState(p.config?.globalBans   ?? [])
  const [buscaBan,     setBuscaBan]     = useState('')
  const [criando,      setCriando]      = useState(false)
  const [salvandoVenc, setSalvandoVenc] = useState(false)
  const [copiado,      setCopiado]      = useState(null)

  // Hook do heroDraft (só ativo quando partida tem heroDraftId)
  const heroDraftPath = p.heroDraftId
    ? `campeonatos/${campeonatoId}/heroDraft/${p.heroDraftId}`
    : null
  const { estado: draftEstado, iniciar, iniciarComContagem } = useHeroDraft(
    null, 'admin', heroDraftPath
  )
  const liveDraftRef = { current: { draftEstado, iniciar } }

  const partRef = `${scrimPath}/${sessaoId}/partidas/${num}`
  const urlBase = `${window.location.origin}/campeonatos/${campeonatoId}/hero-draft`
  const urlA    = p.heroDraftId ? `${urlBase}?sessao=${p.heroDraftId}&time=A` : null
  const urlB    = p.heroDraftId ? `${urlBase}?sessao=${p.heroDraftId}&time=B` : null

  // Bloco 3: detecta quando o draft encerrou e salva resumo na partida
  const jaFinalizouRef = { current: false }
  useEffect(() => {
    if (p.status !== 'em_draft') return
    if (draftEstado?.status !== STATUS_DRAFT.ENCERRADO) return
    if (jaFinalizouRef.current) return
    jaFinalizouRef.current = true

    // Extrai resumo leve de picks/bans do historico do draft
    const historico  = draftEstado.historico ?? []
    const bansA      = draftEstado.timeA?.bans ?? []
    const bansB      = draftEstado.timeB?.bans ?? []
    const picksA     = draftEstado.timeA?.picks ?? []
    const picksB     = draftEstado.timeB?.picks ?? []
    const globalBansFinal = draftEstado.globalBans ?? []

    update(ref(db, partRef), {
      status: 'encerrada',
      draft: {
        bansA, bansB, picksA, picksB,
        globalBans: globalBansFinal,
        mapaId:  draftEstado.mapaId ?? null,
        passos:  historico.length,
      },
    }).catch(() => {})
  }, [draftEstado?.status]) // eslint-disable-line

  // Presença dos capitães no lobby
  const presA = draftEstado?.presence?.A?.onlineEm
  const presB = draftEstado?.presence?.B?.onlineEm
  const confA = draftEstado?.presence?.A?.confirmado
  const confB = draftEstado?.presence?.B?.confirmado

  function toggleBan(heroId) {
    setGlobalBans(prev => prev.includes(heroId) ? prev.filter(h => h !== heroId) : [...prev, heroId])
  }

  function copiar(url, key) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(key)
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  async function criarDraft() {
    setCriando(true)
    try {
      const heroDraftId = gerarHeroDraftId()
      const seqBase = SEQUENCIAS_SCRIM[numBans] ?? SEQUENCIAS_SCRIM[2]
      const sequencia = primeiroTime === 'B'
        ? seqBase.map(s => ({ ...s, time: s.time === 'A' ? 'B' : 'A' }))
        : seqBase
      const estado = criarEstadoInicial({
        timeA: { nome: sessao.timeA?.nome ?? 'Time A' },
        timeB: { nome: sessao.timeB?.nome ?? 'Time B' },
        sequencia, globalBans,
        mapaId: mapaId || null,
        timerConfig: {
          ban:       Number(timerBan)  || DEFAULT_TIMER_CONFIG.ban,
          pick:      Number(timerPick) || DEFAULT_TIMER_CONFIG.pick,
          pickDuplo: Number(timerPickD)|| DEFAULT_TIMER_CONFIG.pickDuplo,
        },
      })
      // HeroDraft fica no namespace do campeonato (não no showmatch)
      // pra reutilizar o fluxo de confronto oficial (sala de espera, etc.)
      await set(ref(db, `campeonatos/${campeonatoId}/heroDraft/${heroDraftId}`), estado)
      await update(ref(db, partRef), {
        status:     'lobby',
        heroDraftId,
        mapaId:     mapaId || null,
        config:     { numBans, timerBan, timerPick, timerPickD, primeiroTime, globalBans },
      })
      onFlash('ok', 'Draft criado! Compartilhe os links com os capitães.')
    } catch (e) {
      onFlash('erro', `Erro: ${e.message}`)
    } finally {
      setCriando(false)
    }
  }

  async function iniciarDraft() {
    const r = await iniciarComContagem(5)
    if (!r?.ok) onFlash('erro', `Erro ao iniciar: ${r?.erro}`)
    else await update(ref(db, partRef), { status: 'em_draft' })
  }

  async function encerrarPartida() {
    await update(ref(db, partRef), { status: 'encerrada' })
  }

  async function registrarVencedor(quem) {
    setSalvandoVenc(true)
    try {
      await update(ref(db, partRef), { vencedor: quem, status: 'encerrada' })
      onFlash('ok', `${quem === 'A' ? sessao.timeA?.nome : sessao.timeB?.nome} venceu a partida ${num}!`)
    } catch (e) { onFlash('erro', `Erro: ${e.message}`) }
    finally { setSalvandoVenc(false) }
  }

  const statusCor   = { configurando: 'var(--text3)', lobby: 'var(--gold)', em_draft: 'var(--blue)', encerrada: 'var(--green)' }
  const statusLabel = { configurando: 'Configurando', lobby: 'Aguardando capitães', em_draft: 'Em andamento', encerrada: 'Encerrada' }
  const heroisFiltrados = HEROES.filter(h => !buscaBan || h.nome.toLowerCase().includes(buscaBan.toLowerCase()))

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15 }}>Partida {num}</span>
        {mapaId && <span style={{ fontSize: 11, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif" }}>🗺 {mapaId}</span>}
        <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: statusCor[p.status] ?? 'var(--text3)', fontWeight: 700, letterSpacing: '0.06em' }}>
          {statusLabel[p.status] ?? p.status}
        </span>
        {p.vencedor && (
          <span style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: p.vencedor === 'A' ? sessao.timeA?.cor : sessao.timeB?.cor }}>
            ✓ {p.vencedor === 'A' ? sessao.timeA?.nome : sessao.timeB?.nome} venceu
          </span>
        )}
      </div>

      {/* ── FASE: CONFIGURANDO ──────────────────────────────────────────────── */}
      {p.status === 'configurando' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Mapa */}
            <div>
              <label style={labelStyle}>Mapa</label>
              <select value={mapaId} onChange={e => setMapaId(e.target.value)} style={inputStyle}>
                <option value="">— Nenhum —</option>
                {MAPAS.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            {/* Quem começa */}
            <div>
              <label style={labelStyle}>Quem começa os picks</label>
              <select value={primeiroTime} onChange={e => setPrimeiroTime(e.target.value)} style={inputStyle}>
                <option value="A">{sessao.timeA?.nome} (Time A)</option>
                <option value="B">{sessao.timeB?.nome} (Time B)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Bans por time</label>
              <select value={numBans} onChange={e => setNumBans(Number(e.target.value))} style={inputStyle}>
                <option value={0}>0 bans</option>
                <option value={2}>2 bans</option>
                <option value={3}>3 bans</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Timer ban (s)</label>
              <input type="number" min={0} max={120} value={timerBan} onChange={e => setTimerBan(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Timer pick (s)</label>
              <input type="number" min={0} max={120} value={timerPick} onChange={e => setTimerPick(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Pick duplo (s)</label>
              <input type="number" min={0} max={120} value={timerPickD} onChange={e => setTimerPickD(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Bans globais */}
          <div>
            <label style={labelStyle}>Bans globais ({globalBans.length} heróis)</label>
            <input value={buscaBan} onChange={e => setBuscaBan(e.target.value)} placeholder="Buscar herói..." style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {heroisFiltrados.map(h => (
                <button key={h.id} onClick={() => toggleBan(h.id)}
                  style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
                    background: globalBans.includes(h.id) ? 'rgba(224,85,85,0.18)' : 'var(--bg2)',
                    border: `1px solid ${globalBans.includes(h.id) ? 'rgba(224,85,85,0.5)' : 'var(--border)'}`,
                    color: globalBans.includes(h.id) ? 'var(--red)' : 'var(--text2)',
                  }}
                >
                  {globalBans.includes(h.id) ? '✕ ' : ''}{h.nome}
                </button>
              ))}
            </div>
          </div>

          <button className="btn primary" style={{ fontSize: 13, padding: '8px 20px', alignSelf: 'flex-start' }}
            disabled={criando} onClick={criarDraft}>
            {criando ? 'Criando...' : '⚔ Criar draft e gerar links'}
          </button>
        </div>
      )}

      {/* ── FASE: LOBBY ─────────────────────────────────────────────────────── */}
      {(p.status === 'lobby' || p.status === 'em_draft') && urlA && urlB && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Links pra cada time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[{ url: urlA, time: sessao.timeA, key: 'A' }, { url: urlB, time: sessao.timeB, key: 'B' }].map(({ url, time, key }) => (
              <div key={key} style={{ background: 'var(--bg2)', border: `1px solid ${time?.cor ?? 'var(--border)'}33`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, color: time?.cor ?? 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, marginBottom: 6 }}>
                  ⚑ {time?.nome} (Time {key})
                  {p.status === 'lobby' && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: (key === 'A' ? confA : confB) ? 'var(--green)' : (key === 'A' ? presA : presB) ? 'var(--gold)' : 'var(--text3)' }}>
                      {(key === 'A' ? confA : confB) ? '✓ Pronto' : (key === 'A' ? presA : presB) ? '● Online' : '○ Aguardando'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input readOnly value={url} style={{ ...inputStyle, fontSize: 10, flex: 1, padding: '4px 8px', color: 'var(--text3)' }} onFocus={e => e.target.select()} />
                  <button className="btn" onClick={() => copiar(url, key)}
                    style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0, color: copiado === key ? 'var(--green)' : 'var(--text2)', borderColor: copiado === key ? 'var(--green)' : 'var(--border)' }}>
                    {copiado === key ? '✓' : '⎘'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Botão Iniciar (lobby) */}
          {p.status === 'lobby' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn primary" style={{ fontSize: 13, padding: '7px 18px' }} onClick={iniciarDraft}>
                ▶ Iniciar draft
              </button>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                {(!confA || !confB) && '— aguardando confirmação dos capitães'}
              </span>
            </div>
          )}

          {/* Em draft: link pra gerenciar */}
          {p.status === 'em_draft' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <a href={`${urlBase}?sessao=${p.heroDraftId}&time=admin`} target="_blank" rel="noreferrer"
                className="btn" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none', color: 'var(--blue)', borderColor: 'rgba(74,158,218,0.4)' }}>
                ⚡ Abrir painel do draft ↗
              </a>
              <button className="btn" style={{ fontSize: 12, padding: '6px 12px', color: 'var(--text3)' }}
                onClick={encerrarPartida}>
                Encerrar partida
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── FASE: ENCERRADA sem vencedor ────────────────────────────────────── */}
      {p.status === 'encerrada' && !p.vencedor && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>Quem venceu?</span>
          {[{ key: 'A', time: sessao.timeA }, { key: 'B', time: sessao.timeB }].map(({ key, time }) => (
            <button key={key} className="btn" disabled={salvandoVenc}
              style={{ fontSize: 12, padding: '4px 12px', borderColor: (time?.cor ?? 'var(--border)') + '55', color: time?.cor }}
              onClick={() => registrarVencedor(key)}>
              {time?.nome}
            </button>
          ))}
        </div>
      )}

      {/* ── BLOCO 4: Resumo de picks/bans (encerrada com draft gravado) ─────── */}
      {p.status === 'encerrada' && p.draft && (
        <DraftResumo draft={p.draft} sessao={sessao} />
      )}
    </div>
  )
}

// ── Resumo visual de picks/bans de uma partida ────────────────────────────────
function DraftResumo({ draft, sessao }) {
  const [expandido, setExpandido] = useState(false)
  const heroNome = (id) => HEROES.find(h => h.id === id)?.nome ?? id

  const totalBans  = (draft.bansA?.length ?? 0) + (draft.bansB?.length ?? 0) + (draft.globalBans?.length ?? 0)
  const totalPicks = (draft.picksA?.length ?? 0) + (draft.picksB?.length ?? 0)
  if (!totalBans && !totalPicks) return null

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <button
        onClick={() => setExpandido(v => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
        {expandido ? '▾' : '▸'} Resumo do draft ({totalPicks} picks · {totalBans} bans)
      </button>

      {expandido && (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Time A */}
          <div>
            <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: sessao.timeA?.cor ?? 'var(--text2)', marginBottom: 6 }}>
              {sessao.timeA?.nome}
            </div>
            {draft.bansA?.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Bans</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {draft.bansA.map((id, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.3)', color: 'var(--red)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {heroNome(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {draft.picksA?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Picks</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {draft.picksA.map((id, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: (sessao.timeA?.cor ?? '#4a9eda') + '18', border: `1px solid ${sessao.timeA?.cor ?? '#4a9eda'}44`, color: sessao.timeA?.cor ?? 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {heroNome(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Time B */}
          <div>
            <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: sessao.timeB?.cor ?? 'var(--text2)', marginBottom: 6 }}>
              {sessao.timeB?.nome}
            </div>
            {draft.bansB?.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Bans</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {draft.bansB.map((id, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.3)', color: 'var(--red)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {heroNome(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {draft.picksB?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Picks</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {draft.picksB.map((id, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: (sessao.timeB?.cor ?? '#e05555') + '18', border: `1px solid ${sessao.timeB?.cor ?? '#e05555'}44`, color: sessao.timeB?.cor ?? 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {heroNome(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bans globais */}
          {draft.globalBans?.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Bans Globais</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {draft.globalBans.map((id, i) => (
                  <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(62,60,58,0.5)', border: '1px solid var(--border)', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {heroNome(id)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif",
  display: 'block', marginBottom: 4,
}

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 10px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}
