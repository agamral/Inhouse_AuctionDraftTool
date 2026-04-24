import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove } from 'firebase/database'
import { db } from '../firebase/database'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { HEROES } from '../utils/heroPool'
import { criarEstadoInicial, expandirSequencia, SEQUENCIA_PADRAO } from '../utils/heroDraft'
import { MAPAS } from '../utils/mapPool'

// ── Sequências predefinidas por nº de bans por time ─────────────────────────

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

const STATUS_LABEL = { aguardando: 'Aguardando', rodando: 'Em andamento', encerrado: 'Encerrado' }
const STATUS_COR   = { aguardando: 'var(--text2)', rodando: 'var(--green)', encerrado: 'var(--red)' }

// ── Helpers de estilo ────────────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AdminHeroDraftSection() {
  const [sessoes, setSessoes]           = useState({})
  const [times, setTimes]               = useState({})
  const [sessaoId, setSessaoId]         = useState('')
  const [mostraCriar, setMostraCriar]   = useState(false)
  const [feedback, setFeedback]         = useState(null)
  const [confirmAcao, setConfirmAcao]   = useState(null)

  const [form, setForm] = useState({
    novoId: '', modoTimes: 'manual',
    nomeA: '', corA: '#4a9eda', timeAId: '',
    nomeB: '', corB: '#e05555', timeBId: '',
    globalBans: [], bansPerTeam: 3, mapaId: '',
  })
  const [buscaBan, setBuscaBan] = useState('')
  const [salvando, setSalvando] = useState(false)

  const { estado, loading, iniciar, encerrar, desfazer } =
    useHeroDraft(sessaoId || '__none__', 'admin')

  useEffect(() => onValue(ref(db, '/heroDraft'), snap => setSessoes(snap.val() ?? {})), [])

  // Listener com retry automático caso o read falhe por regras desatualizadas
  useEffect(() => {
    let unsub = null
    let retryId = null

    const conectar = () => {
      unsub = onValue(
        ref(db, '/teams'),
        snap => { setTimes(snap.val() ?? {}); retryId && clearTimeout(retryId) },
        () => { retryId = setTimeout(conectar, 3000) }, // retry em 3s se negar
      )
    }

    conectar()
    return () => { unsub?.(); retryId && clearTimeout(retryId) }
  }, [])

  // ── feedback ───────────────────────────────────────────────────────────────

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 3500)
  }

  // ── criar sessão ──────────────────────────────────────────────────────────

  async function handleCriar() {
    const { novoId, modoTimes, nomeA, corA, nomeB, corB, timeAId, timeBId, globalBans, bansPerTeam, mapaId } = form

    if (!novoId.trim()) return flash('erro', 'Informe um ID para a sessão.')
    if (sessoes[novoId.trim()]) return flash('erro', `Já existe uma sessão "${novoId}".`)

    // Resolve nome/cor de acordo com o modo
    let resolvedNomeA = nomeA, resolvedCorA = corA
    let resolvedNomeB = nomeB, resolvedCorB = corB

    if (modoTimes === 'campeonato') {
      const tA = times[timeAId], tB = times[timeBId]
      if (!tA) return flash('erro', 'Selecione o Time A.')
      if (!tB) return flash('erro', 'Selecione o Time B.')
      if (timeAId === timeBId) return flash('erro', 'Os dois times precisam ser diferentes.')
      resolvedNomeA = tA.nome; resolvedCorA = tA.cor
      resolvedNomeB = tB.nome; resolvedCorB = tB.cor
    } else {
      if (!nomeA.trim()) return flash('erro', 'Informe o nome do Time A.')
      if (!nomeB.trim()) return flash('erro', 'Informe o nome do Time B.')
    }

    setSalvando(true)
    try {
      const sequencia = SEQUENCIAS[bansPerTeam] ?? SEQUENCIA_PADRAO
      const estadoInicial = criarEstadoInicial({
        timeA: { nome: resolvedNomeA.trim(), cor: resolvedCorA },
        timeB: { nome: resolvedNomeB.trim(), cor: resolvedCorB },
        sequencia,
        globalBans,
        mapaId: mapaId || null,
      })
      await set(ref(db, `/heroDraft/${novoId.trim()}`), estadoInicial)
      setSessaoId(novoId.trim())
      setMostraCriar(false)
      setForm({ novoId: '', modoTimes: 'manual', nomeA: '', corA: '#4a9eda', timeAId: '', nomeB: '', corB: '#e05555', timeBId: '', globalBans: [], bansPerTeam: 3, mapaId: '' })
      setBuscaBan('')
      flash('ok', `Sessão "${novoId.trim()}" criada.`)
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  // ── ações de controle ─────────────────────────────────────────────────────

  async function handleIniciar() {
    const r = await iniciar()
    r.ok ? flash('ok', 'Draft iniciado!') : flash('erro', r.erro)
  }

  async function handleDesfazer() {
    const r = await desfazer()
    r.ok ? flash('ok', 'Última ação desfeita.') : flash('erro', r.erro)
  }

  async function handleEncerrar() {
    setConfirmAcao(null)
    const r = await encerrar()
    r.ok ? flash('ok', 'Draft encerrado.') : flash('erro', r.erro)
  }

  async function handleReabrir() {
    setConfirmAcao(null)
    try {
      await update(ref(db, `/heroDraft/${sessaoId}`), { status: 'rodando' })
      flash('ok', 'Draft reaberto.')
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    }
  }

  async function handleResetar() {
    setConfirmAcao(null)
    if (!estado) return
    try {
      const seq = estado.sequencia?.length > 0 ? estado.sequencia : expandirSequencia(SEQUENCIA_PADRAO)
      const novo = criarEstadoInicial({
        timeA: { nome: estado.timeA.nome, cor: estado.timeA.cor },
        timeB: { nome: estado.timeB.nome, cor: estado.timeB.cor },
        sequencia: seq,
        globalBans: estado.globalBans ?? [],
      })
      await set(ref(db, `/heroDraft/${sessaoId}`), novo)
      flash('ok', 'Draft resetado para o estado inicial.')
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    }
  }

  async function handleDeletar() {
    setConfirmAcao(null)
    try {
      await remove(ref(db, `/heroDraft/${sessaoId}`))
      setSessaoId('')
      flash('ok', 'Sessão deletada.')
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const heroisFiltrados = HEROES.filter(h =>
    !buscaBan || h.nome.toLowerCase().includes(buscaBan.toLowerCase())
  )
  const sessaoIds = Object.keys(sessoes).sort()

  const bansPerTeamAtual = estado?.sequencia?.length > 0
    ? estado.sequencia.filter(s => s.acao === 'ban' && s.time === 'A').length
    : 0

  return (
    <section className="admin-section" style={{ maxWidth: 900, borderColor: 'rgba(56,168,255,0.25)' }}>
      <div className="admin-section-title" style={{ color: 'var(--blue)' }}>
        Draft de Heróis
      </div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* feedback */}
        {feedback && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13,
            background: feedback.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
            border: `1px solid ${feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
            color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {feedback.msg}
          </div>
        )}

        {/* seletor + botão nova sessão */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={sessaoId}
            onChange={e => { setSessaoId(e.target.value); setConfirmAcao(null) }}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)',
              borderRadius: 6, padding: '7px 12px',
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, minWidth: 200,
            }}
          >
            <option value="">— selecionar sessão —</option>
            {sessaoIds.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <button
            className="btn"
            style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--blue)', color: 'var(--blue)', whiteSpace: 'nowrap' }}
            onClick={() => { setMostraCriar(v => !v); setFeedback(null); setConfirmAcao(null) }}
          >
            {mostraCriar ? '✕ Cancelar' : '+ Nova sessão'}
          </button>
        </div>

        {/* ── formulário nova sessão ─────────────────────────────────────── */}
        {mostraCriar && (
          <div style={{
            background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8,
            padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Nova Sessão
            </div>

            {/* ID */}
            <div>
              <FieldLabel label="ID da sessão" hint="sem espaços, ex: semifinal-1" />
              <input
                value={form.novoId}
                onChange={e => setForm(f => ({ ...f, novoId: e.target.value.replace(/\s/g, '-') }))}
                placeholder="semifinal-1"
                style={inputStyle}
              />
            </div>

            {/* Times — toggle modo */}
            <div>
              <FieldLabel label="Times" />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[['manual', 'Criar times'], ['campeonato', 'Usar times do campeonato']].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setForm(f => ({ ...f, modoTimes: v, timeAId: '', timeBId: '' }))}
                    style={{
                      padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      border: `1px solid ${form.modoTimes === v ? 'var(--blue)' : 'var(--border2)'}`,
                      background: form.modoTimes === v ? 'rgba(56,168,255,0.12)' : 'var(--bg2)',
                      color: form.modoTimes === v ? 'var(--blue)' : 'var(--text2)',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {form.modoTimes === 'manual' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel label="Time A" />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={form.nomeA} onChange={e => setForm(f => ({ ...f, nomeA: e.target.value }))}
                        placeholder="Team Alpha" style={{ ...inputStyle, flex: 1 }} />
                      <input type="color" value={form.corA} onChange={e => setForm(f => ({ ...f, corA: e.target.value }))}
                        style={{ width: 38, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel label="Time B" />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={form.nomeB} onChange={e => setForm(f => ({ ...f, nomeB: e.target.value }))}
                        placeholder="Team Bravo" style={{ ...inputStyle, flex: 1 }} />
                      <input type="color" value={form.corB} onChange={e => setForm(f => ({ ...f, corB: e.target.value }))}
                        style={{ width: 38, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
                    </div>
                  </div>
                </div>
              ) : (
                /* Modo campeonato: dois dropdowns com preview */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['A', 'timeAId'], ['B', 'timeBId']].map(([lado, key]) => {
                    const timesArr = Object.entries(times)
                    const selecionado = times[form[key]]
                    return (
                      <div key={lado}>
                        <FieldLabel label={`Time ${lado}`} />
                        <select
                          value={form[key]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          style={{
                            ...inputStyle,
                            color: selecionado ? selecionado.cor : 'var(--text2)',
                            borderColor: selecionado ? selecionado.cor + '66' : 'var(--border2)',
                          }}
                        >
                          <option value="">— selecionar time —</option>
                          {timesArr.map(([id, t]) => (
                            <option key={id} value={id}>{t.nome}</option>
                          ))}
                        </select>
                        {selecionado && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)',
                            fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {selecionado.jogadores?.length ?? 0} jogadores
                            {selecionado.jogadores?.slice(0, 3).map((j, i) => (
                              <span key={i} style={{ marginLeft: 6, color: selecionado.cor }}>
                                {j.nome}
                              </span>
                            ))}
                            {(selecionado.jogadores?.length ?? 0) > 3 && (
                              <span style={{ marginLeft: 4 }}>+{selecionado.jogadores.length - 3}</span>
                            )}
                          </div>
                        )}
                        {timesArr.length === 0 && (
                          <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                            Nenhum time cadastrado. Crie times na seção <strong>Times</strong>.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Bans por time */}
            <div>
              <FieldLabel label="Bans por time" />
              <div style={{ display: 'flex', gap: 8 }}>
                {[0, 2, 3].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm(f => ({ ...f, bansPerTeam: n }))}
                    style={{
                      padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      border: `1px solid ${form.bansPerTeam === n ? 'var(--blue)' : 'var(--border2)'}`,
                      background: form.bansPerTeam === n ? 'rgba(56,168,255,0.12)' : 'var(--bg2)',
                      color: form.bansPerTeam === n ? 'var(--blue)' : 'var(--text2)',
                    }}
                  >
                    {n === 0 ? 'Sem bans' : `${n} por time`}
                  </button>
                ))}
              </div>
            </div>

            {/* Mapa */}
            <div>
              <FieldLabel label="Mapa" hint="opcional" />
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: 6, maxHeight: 200, overflowY: 'auto',
                padding: 8, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6,
              }}>
                <button
                  onClick={() => setForm(f => ({ ...f, mapaId: '' }))}
                  style={{
                    padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
                    border: `1px solid ${!form.mapaId ? 'var(--blue)' : 'var(--border)'}`,
                    background: !form.mapaId ? 'rgba(56,168,255,0.12)' : 'var(--bg3)',
                    color: !form.mapaId ? 'var(--blue)' : 'var(--text2)',
                  }}
                >
                  — Sem mapa
                </button>
                {MAPAS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setForm(f => ({ ...f, mapaId: m.id }))}
                    style={{
                      padding: 0, borderRadius: 4, cursor: 'pointer', overflow: 'hidden',
                      border: `1px solid ${form.mapaId === m.id ? 'var(--gold)' : 'var(--border)'}`,
                      background: 'var(--bg3)', position: 'relative',
                      boxShadow: form.mapaId === m.id ? '0 0 8px rgba(201,168,76,0.4)' : 'none',
                    }}
                  >
                    <img
                      src={m.splashUrl} alt={m.nome}
                      onError={e => { e.target.style.display = 'none' }}
                      style={{ width: '100%', height: 50, objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{
                      padding: '4px 6px', fontSize: 10, textAlign: 'center',
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      color: form.mapaId === m.id ? 'var(--gold)' : 'var(--text2)',
                      lineHeight: 1.2,
                    }}>
                      {m.nome}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Global bans */}
            <div>
              <FieldLabel
                label={`Global Bans${form.globalBans.length ? ` (${form.globalBans.length})` : ''}`}
                hint="bloqueados antes do draft"
              />
              <input value={buscaBan} onChange={e => setBuscaBan(e.target.value)}
                placeholder="Buscar herói..." style={{ ...inputStyle, marginBottom: 8 }} />
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4,
                maxHeight: 150, overflowY: 'auto', padding: 8,
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6,
              }}>
                {heroisFiltrados.map(h => {
                  const sel = form.globalBans.includes(h.id)
                  return (
                    <button
                      key={h.id}
                      onClick={() => setForm(f => ({
                        ...f,
                        globalBans: sel ? f.globalBans.filter(id => id !== h.id) : [...f.globalBans, h.id],
                      }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: sel ? 'rgba(224,85,85,0.18)' : 'var(--bg3)',
                        border: `1px solid ${sel ? 'var(--red)' : 'var(--border)'}`,
                        color: sel ? 'var(--red)' : 'var(--text2)',
                        borderRadius: 4, padding: '3px 8px', fontSize: 12,
                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      <img src={h.iconeUrl} alt="" style={{ width: 16, height: 16, borderRadius: 2, objectFit: 'cover' }}
                        onError={e => { e.target.style.display = 'none' }} />
                      {h.nome}{sel && ' ✕'}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" style={{ fontSize: 13, padding: '7px 18px' }}
                onClick={handleCriar} disabled={salvando}>
                {salvando ? 'Criando...' : 'Criar sessão'}
              </button>
              <button className="btn" style={{ fontSize: 13, padding: '7px 14px' }}
                onClick={() => setMostraCriar(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── painel da sessão selecionada ───────────────────────────────── */}
        {sessaoId && (
          <>
            {loading ? (
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>Carregando...</p>
            ) : !estado ? (
              <p style={{ color: 'var(--red)', fontSize: 13 }}>Sessão não encontrada.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* status + progresso */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: STATUS_COR[estado.status] ?? 'var(--text2)',
                    background: 'var(--bg3)',
                    border: `1px solid ${STATUS_COR[estado.status] ?? 'var(--border)'}`,
                    borderRadius: 4, padding: '3px 10px',
                  }}>
                    {STATUS_LABEL[estado.status] ?? estado.status}
                  </span>
                  {estado.status === 'rodando' && (
                    <span style={{ color: 'var(--text2)', fontSize: 12 }}>
                      Passo {estado.passoAtual + 1}/{estado.sequencia?.length ?? '?'}
                      {' · '}
                      {estado.sequencia?.[estado.passoAtual]
                        ? `${estado.sequencia[estado.passoAtual].acao === 'ban' ? 'BAN' : 'PICK'} — Time ${estado.sequencia[estado.passoAtual].time}`
                        : 'Concluído'}
                    </span>
                  )}
                  <span style={{ color: 'var(--text2)', fontSize: 12 }}>
                    {bansPerTeamAtual} ban{bansPerTeamAtual !== 1 ? 's' : ''} por time
                  </span>
                </div>

                {/* times */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <TimeCard time={estado.timeA} label="Time A" />
                  <TimeCard time={estado.timeB} label="Time B" />
                </div>

                {/* global bans */}
                {(estado.globalBans?.length > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 4 }}>
                      Global Bans:
                    </span>
                    {estado.globalBans.map(id => {
                      const h = HEROES.find(x => x.id === id)
                      return (
                        <span key={id} style={{
                          background: 'rgba(224,85,85,0.12)', border: '1px solid var(--red)',
                          color: 'var(--red)', borderRadius: 4, padding: '2px 8px',
                          fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif",
                        }}>{h?.nome ?? id}</span>
                      )
                    })}
                  </div>
                )}

                {/* botões de controle */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {estado.status === 'aguardando' && (
                    <button className="btn primary" style={{ fontSize: 13, padding: '7px 16px' }} onClick={handleIniciar}>
                      ▶ Iniciar
                    </button>
                  )}
                  {estado.status === 'rodando' && (
                    <button className="btn" style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--gold)', color: 'var(--gold)' }}
                      onClick={handleDesfazer} disabled={!estado.historico?.length}>
                      ↩ Desfazer
                    </button>
                  )}
                  {estado.status === 'encerrado' && (
                    <button className="btn" style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--green)', color: 'var(--green)' }}
                      onClick={() => setConfirmAcao('reabrir')}>
                      ↺ Reabrir draft
                    </button>
                  )}
                  {estado.status !== 'aguardando' && (
                    <button className="btn" style={{ fontSize: 13, padding: '7px 14px' }}
                      onClick={() => setConfirmAcao('resetar')}>
                      ⟳ Resetar
                    </button>
                  )}
                  {estado.status === 'rodando' && (
                    <button className="btn" style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--red)', color: 'var(--red)' }}
                      onClick={() => setConfirmAcao('encerrar')}>
                      ■ Encerrar
                    </button>
                  )}
                  <button className="btn" style={{ fontSize: 13, padding: '7px 14px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)', marginLeft: 'auto' }}
                    onClick={() => setConfirmAcao('deletar')}>
                    🗑 Deletar sessão
                  </button>
                </div>

                {/* confirmação inline */}
                {confirmAcao && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)',
                    borderRadius: 6, flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {confirmAcao === 'encerrar' && 'Encerrar o draft permanentemente?'}
                      {confirmAcao === 'deletar'  && 'Deletar a sessão permanentemente?'}
                      {confirmAcao === 'resetar'  && 'Resetar o draft (apaga picks e bans)?'}
                      {confirmAcao === 'reabrir'  && 'Reabrir o draft encerrado?'}
                    </span>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
                      onClick={() => {
                        if (confirmAcao === 'encerrar') handleEncerrar()
                        if (confirmAcao === 'deletar')  handleDeletar()
                        if (confirmAcao === 'resetar')  handleResetar()
                        if (confirmAcao === 'reabrir')  handleReabrir()
                      }}>
                      Confirmar
                    </button>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => setConfirmAcao(null)}>
                      Cancelar
                    </button>
                  </div>
                )}

                {/* links rápidos */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Links da sessão
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <LinkBtn href={`/hero-draft?sessao=${sessaoId}&time=A`} cor={estado.timeA?.cor ?? 'var(--blue)'}   label={`Capitão A — ${estado.timeA?.nome ?? ''}`} />
                    <LinkBtn href={`/hero-draft?sessao=${sessaoId}&time=B`} cor={estado.timeB?.cor ?? 'var(--red)'}    label={`Capitão B — ${estado.timeB?.nome ?? ''}`} />
                    <LinkBtn href={`/hero-draft/espectador?sessao=${sessaoId}`} cor="var(--text2)"  label="Espectador" />
                    <LinkBtn href={`/hero-draft/overlay?sessao=${sessaoId}`}    cor="var(--purple)" label="Overlay OBS" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {sessaoIds.length === 0 && !mostraCriar && (
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>
            Nenhuma sessão criada. Clique em <strong>+ Nova sessão</strong> para começar.
          </p>
        )}

      </div>
    </section>
  )
}

// ── subcomponentes ─────────────────────────────────────────────────────────────

function TimeCard({ time, label }) {
  if (!time) return null
  const picks = time.picks?.length ?? 0
  const bans  = time.bans?.length  ?? 0
  return (
    <div style={{
      background: 'var(--bg3)', border: `1px solid ${time.cor ?? 'var(--border)'}22`,
      borderLeft: `3px solid ${time.cor ?? 'var(--border)'}`,
      borderRadius: 6, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14,
          color: time.cor ?? 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {time.nome}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
        <span>Picks: <strong style={{ color: 'var(--green)' }}>{picks}</strong></span>
        <span>Bans: <strong style={{ color: 'var(--red)' }}>{bans}</strong></span>
      </div>
    </div>
  )
}

function LinkBtn({ href, cor, label }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = (e) => {
    e.preventDefault()
    const url = window.location.origin + href
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    })
  }

  return (
    <div style={{ display: 'flex', borderRadius: 5, overflow: 'hidden', border: `1px solid ${cor}` }}>
      <a href={href} target="_blank" rel="noreferrer" style={{
        display: 'inline-block', padding: '5px 12px',
        background: 'var(--bg3)',
        color: cor,
        fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 600,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        ↗ {label}
      </a>
      <button
        onClick={copiar}
        title="Copiar link"
        style={{
          padding: '5px 9px', cursor: 'pointer',
          background: copiado ? cor : 'var(--bg2)',
          color: copiado ? '#000' : cor,
          border: 'none', borderLeft: `1px solid ${cor}`,
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700,
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        {copiado ? '✓' : '⎘'}
      </button>
    </div>
  )
}

function FieldLabel({ label, hint }) {
  return (
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 5,
    }}>
      {label}
      {hint && <span style={{ fontWeight: 400, marginLeft: 5, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— {hint}</span>}
    </div>
  )
}
