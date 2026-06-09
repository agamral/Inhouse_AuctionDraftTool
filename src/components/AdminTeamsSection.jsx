import { useState, useEffect } from 'react'
import { ref, onValue, set, remove, push, update } from 'firebase/database'
import { db } from '../firebase/database'
import { FUSOS, FUSO_PADRAO } from '../utils/scheduling'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath, draftSessionPath } from '../utils/campeonatoPaths'
import TeamIcon from './TeamIcon'

// Alinhado com src/pages/Inscricao.jsx — set canônico de roles do app
const ROLES_LISTA = ['Tank', 'Offlane', 'DPS', 'Healer', 'Flex']

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

const FORM_VAZIO = { nome: '', cor: '#4a9eda', fuso: FUSO_PADRAO, modoAdd: 'manual', jogadores: [] }

// ── Componente principal ─────────────────────────────────────────────────────

export default function AdminTeamsSection() {
  const { campeonatoId } = useCampeonato()
  const [times, setTimes]             = useState({})
  const [inscritos, setInscritos]     = useState([])      // do Google Sheets
  const [capitaes, setCapitaes]       = useState({})      // do leilão (/draftSession/captains)
  const [playerState, setPlayerState] = useState({})      // do leilão — tipoPosse de cada jogador
  const [loadingInscritos, setLoadingInscritos] = useState(false)
  const [reconciliarOpen, setReconciliarOpen] = useState(false)
  const [reconciliarChoices, setReconciliarChoices] = useState({})  // { teamId: { jogadorIdx: bool } }
  const [reconciliarApplying, setReconciliarApplying] = useState(false)

  const [mostraCriar, setMostraCriar] = useState(false)
  const [form, setForm]               = useState(FORM_VAZIO)
  const [buscaPlayer, setBuscaPlayer] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [feedback, setFeedback]       = useState(null)
  const [salvando, setSalvando]       = useState(false)
  const [editando, setEditando]       = useState(null)
  const [editForm, setEditForm]       = useState(null)

  // Times salvos
  useEffect(() => onValue(ref(db, teamPath(campeonatoId)), snap => setTimes(snap.val() ?? {})), [campeonatoId])

  // Times do leilão (draftSession)
  useEffect(() => onValue(ref(db, `${draftSessionPath(campeonatoId)}/captains`), snap => setCapitaes(snap.val() ?? {})), [campeonatoId])

  // PlayerState do leilão — tipoPosse ('titular'|'reserva') por playerId
  useEffect(() => onValue(ref(db, `${draftSessionPath(campeonatoId)}/playerState`), snap => setPlayerState(snap.val() ?? {})), [campeonatoId])

  // Inscritos do Google Sheets
  useEffect(() => {
    const url = import.meta.env.VITE_SHEETS_WEBAPP_URL
    if (!url) return
    setLoadingInscritos(true)
    fetch(url)
      .then(r => r.json())
      .then(data => { if (data.ok) setInscritos(data.players ?? []) })
      .catch(() => {})
      .finally(() => setLoadingInscritos(false))
  }, [])

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 3500)
  }

  // ── Jogadores no form ────────────────────────────────────────────────────────

  function addJogador() {
    setForm(f => ({ ...f, jogadores: [...f.jogadores, { nome: '', role: 'Tank' }] }))
  }

  function updateJogador(i, field, val) {
    setForm(f => {
      const js = [...f.jogadores]
      js[i] = { ...js[i], [field]: val }
      return { ...f, jogadores: js }
    })
  }

  function removeJogador(i) {
    setForm(f => ({ ...f, jogadores: f.jogadores.filter((_, idx) => idx !== i) }))
  }

  function toggleInscrito(p) {
    setForm(f => {
      const jaEsta = f.jogadores.some(j => j.playerId === p.id)
      if (jaEsta) return { ...f, jogadores: f.jogadores.filter(j => j.playerId !== p.id) }
      return { ...f, jogadores: [...f.jogadores, {
        nome:     p.discord ?? '',
        role:     p.rolePrimaria ?? 'Flex',
        playerId: p.id,
      }]}
    })
  }

  // ── Importar time do leilão ──────────────────────────────────────────────────

  async function importarDoLeilao(capId, cap) {
    const jogadores = []

    // Lookup discord → inscrito (pra recuperar role e playerId)
    const porDiscord = new Map(inscritos.map(p => [p.discord, p]))
    const montar = (discord, extra = {}) => {
      const insc = porDiscord.get(discord)
      const out = { nome: discord ?? '', role: insc?.rolePrimaria ?? 'Flex', ...extra }
      if (insc?.id) out.playerId = insc.id // Firebase não aceita undefined
      return out
    }

    // Capitão (sempre titular)
    if (cap.capitaoNome) {
      jogadores.push(montar(cap.capitaoNome, { isCaptain: true, preco: 0 }))
    }

    // Dedup: percorre roster + reservas em uma lista única, ignorando
    // ocorrências repetidas (leilão bugado pode ter o mesmo jogador em
    // ambos os buckets). playerState.tipoPosse é a fonte de verdade pro
    // isReserva — fallback pro bucket de origem se não houver registro.
    const seen = new Set()
    const buckets = [
      ...Object.entries(cap.roster   ?? {}).map(([pid, e]) => ({ pid, entry: e, fromReservas: false })),
      ...Object.entries(cap.reservas ?? {}).map(([pid, e]) => ({ pid, entry: e, fromReservas: true  })),
    ]
    for (const { pid, entry, fromReservas } of buckets) {
      if (entry.isCaptain) continue
      const insc      = porDiscord.get(entry.discord)
      const dedupKey  = insc?.id ?? `nome:${entry.discord}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)
      const tipoPosse = playerState[pid]?.tipoPosse
      const isReserva = tipoPosse ? (tipoPosse === 'reserva') : fromReservas
      const extra = { preco: entry.preco ?? 0 }
      if (isReserva) extra.isReserva = true
      jogadores.push(montar(entry.discord, extra))
    }

    try {
      const id = push(ref(db, teamPath(campeonatoId))).key
      await set(ref(db, `${teamPath(campeonatoId)}/${id}`), {
        nome:        cap.nome,
        capitaoNome: cap.capitaoNome ?? null,   // necessário p/ matching no agendamento via PIN session
        cor:         cap.cor ?? '#4a9eda',
        emoji:       cap.emoji ?? null,
        moedas:      cap.moedas ?? null,        // saldo final do leilão (pra Espectador encerrado)
        seed:        cap.seed ?? null,          // ordem original do leilão
        fonte:       'leilao',
        leilaoCapId: capId,
        jogadores,
        criadoEm:    Date.now(),
      })
      flash('ok', `Time "${cap.nome}" importado do leilão!`)
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    }
  }

  // ── Salvar time manual ───────────────────────────────────────────────────────

  async function handleSalvar() {
    if (!form.nome.trim())         return flash('erro', 'Informe o nome do time.')
    if (form.jogadores.length < 1) return flash('erro', 'Adicione pelo menos 1 jogador.')
    if (form.jogadores.some(j => !j.nome.trim())) return flash('erro', 'Todos os jogadores precisam ter nome.')

    setSalvando(true)
    try {
      const id = push(ref(db, teamPath(campeonatoId))).key
      await set(ref(db, `${teamPath(campeonatoId)}/${id}`), {
        nome:      form.nome.trim(),
        cor:       form.cor,
        fuso:      form.fuso || FUSO_PADRAO,
        fonte:     form.modoAdd === 'inscritos' ? 'planilha' : 'manual',
        jogadores: form.jogadores.map(j => ({
          nome: j.nome.trim(),
          role: j.role,
          ...(j.playerId ? { playerId: j.playerId } : {}),
        })),
        criadoEm: Date.now(),
      })
      setForm(FORM_VAZIO)
      setMostraCriar(false)
      setBuscaPlayer('')
      flash('ok', `Time "${form.nome.trim()}" criado!`)
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  function iniciarEdicao(id, time) {
    setEditando(id)
    setEditForm({
      nome:      time.nome     ?? '',
      cor:       time.cor      ?? '#4a9eda',
      fuso:      time.fuso     ?? FUSO_PADRAO,
      iconUrl:   time.iconUrl  ?? '',
      jogadores: (time.jogadores ?? []).map(j => ({ ...j })),
    })
    setConfirmDelete(null)
  }

  function editAddJogador() {
    setEditForm(f => ({ ...f, jogadores: [...f.jogadores, { nome: '', role: 'Flex' }] }))
  }

  function editUpdateJogador(i, field, val) {
    setEditForm(f => {
      const js = [...f.jogadores]
      js[i] = { ...js[i], [field]: val }
      return { ...f, jogadores: js }
    })
  }

  function editRemoveJogador(i) {
    setEditForm(f => ({ ...f, jogadores: f.jogadores.filter((_, idx) => idx !== i) }))
  }

  async function salvarEdicao(id) {
    if (!editForm.nome.trim())          return flash('erro', 'Informe o nome do time.')
    if (editForm.jogadores.length < 1)  return flash('erro', 'O time precisa ter pelo menos 1 jogador.')
    if (editForm.jogadores.some(j => !j.nome.trim())) return flash('erro', 'Todos os jogadores precisam ter nome.')

    setSalvando(true)
    try {
      await update(ref(db, `${teamPath(campeonatoId)}/${id}`), {
        nome:      editForm.nome.trim(),
        cor:       editForm.cor,
        fuso:      editForm.fuso,
        iconUrl:   editForm.iconUrl?.trim() || null,
        jogadores: editForm.jogadores.map(j => ({
          nome: j.nome.trim(),
          role: j.role,
          ...(j.playerId   ? { playerId:   j.playerId   } : {}),
          ...(j.isCaptain  ? { isCaptain:  true          } : {}),
          ...(typeof j.preco === 'number' ? { preco: j.preco } : {}),
          ...(j.isReserva  ? { isReserva: true           } : {}),
        })),
      })
      setEditando(null)
      setEditForm(null)
      flash('ok', `Time "${editForm.nome.trim()}" atualizado!`)
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  // ── Reconciliar reservas com o leilão ─────────────────────────────────────
  // Analisa cada time importado do leilão e propõe a marcação isReserva
  // correta de cada jogador combinando os sinais disponíveis:
  //   1. playerState.tipoPosse  ─ gravado pelo leilão (alta confiança)
  //   2. cap.reservas bucket   ─ posição no leilão (alta confiança)
  //   3. inscritos.titularReserva = 'Reserva' ─ pref do jogador (média confiança)
  //   4. tipoPosse=titular ou sem sinal ─ pré-marcado como titular
  // Admin pode ajustar cada checkbox antes de aplicar.

  function analisarJogador(j, time) {
    // Sem playerId não dá pra cruzar com leilão — marca como titular sem confiança
    if (j.isCaptain) return { sinal: 'capitao', sugerido: false, currentIsReserva: !!j.isReserva, locked: true }
    if (!j.playerId) return { sinal: 'manual', sugerido: !!j.isReserva, currentIsReserva: !!j.isReserva, locked: false }

    const ps = playerState[j.playerId]
    // Sinal 1: tipoPosse do leilão (mais forte)
    if (ps?.tipoPosse === 'reserva') return { sinal: 'tipoPosse', sugerido: true,  currentIsReserva: !!j.isReserva, locked: false }
    if (ps?.tipoPosse === 'titular') return { sinal: 'tipoPosse', sugerido: false, currentIsReserva: !!j.isReserva, locked: false }

    // Sinal 2: bucket /reservas do dono no leilão
    const ownerCap = ps?.ownedBy ? capitaes[ps.ownedBy] : null
    if (ownerCap?.reservas?.[j.playerId]) {
      return { sinal: 'bucket', sugerido: true, currentIsReserva: !!j.isReserva, locked: false }
    }

    // Sinal 3: preferência do Sheets
    const insc = inscritos.find(p => p.id === j.playerId || p.discord === j.nome)
    if (insc?.titularReserva === 'Reserva') {
      return { sinal: 'pref', sugerido: true, currentIsReserva: !!j.isReserva, locked: false }
    }

    return { sinal: 'nenhum', sugerido: false, currentIsReserva: !!j.isReserva, locked: false }
  }

  function analisarTime(teamId, time) {
    const jogadores = (time.jogadores ?? []).map((j, idx) => ({
      idx,
      jogador: j,
      ...analisarJogador(j, time),
    }))
    const total = jogadores.length
    const naoCapitao = jogadores.filter(j => !j.jogador.isCaptain).length
    const esperadoReservas = Math.max(0, total - 5)
    const sugeridoReservas = jogadores.filter(j => j.sugerido).length
    return { teamId, time, jogadores, total, naoCapitao, esperadoReservas, sugeridoReservas }
  }

  // Estado efetivo do checkbox: usa override do admin se presente, senão sugestão
  function checkboxState(teamId, jogadorIdx, sugerido) {
    const override = reconciliarChoices[teamId]?.[jogadorIdx]
    return override !== undefined ? override : sugerido
  }

  function toggleCheckbox(teamId, jogadorIdx, sugerido) {
    setReconciliarChoices(prev => {
      const atual = checkboxState(teamId, jogadorIdx, sugerido)
      const novoValor = !atual
      const teamChoices = { ...(prev[teamId] ?? {}) }
      // Se voltou pra sugestão, remove override (mantém estado limpo)
      if (novoValor === sugerido) delete teamChoices[jogadorIdx]
      else teamChoices[jogadorIdx] = novoValor
      return { ...prev, [teamId]: teamChoices }
    })
  }

  function abrirReconciliar() {
    setReconciliarChoices({})  // limpa overrides anteriores
    setReconciliarOpen(true)
  }

  async function aplicarReconciliar() {
    setReconciliarApplying(true)
    const updates = {}
    let totalMudancas = 0
    Object.entries(times).forEach(([teamId, time]) => {
      if (time.fonte !== 'leilao') return
      const analise = analisarTime(teamId, time)
      let mudou = false
      const novosJogadores = analise.jogadores.map(({ idx, jogador, sugerido }) => {
        const efetivoIsReserva = checkboxState(teamId, idx, sugerido)
        if (efetivoIsReserva !== !!jogador.isReserva) mudou = true
        const novo = { ...jogador }
        if (efetivoIsReserva) novo.isReserva = true
        else delete novo.isReserva
        return novo
      })
      if (mudou) {
        updates[`${teamPath(campeonatoId)}/${teamId}/jogadores`] = novosJogadores
        totalMudancas += novosJogadores.filter((j, i) => (!!j.isReserva) !== (!!analise.jogadores[i].jogador.isReserva)).length
      }
    })
    if (totalMudancas === 0) {
      setReconciliarApplying(false)
      setReconciliarOpen(false)
      return flash('ok', 'Nenhuma mudança a aplicar.')
    }
    try {
      await update(ref(db), updates)
      flash('ok', `${totalMudancas} jogador(es) atualizados.`)
      setReconciliarOpen(false)
      setReconciliarChoices({})
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    } finally {
      setReconciliarApplying(false)
    }
  }

  // ── Mover jogador entre times (janela de trocas) ─────────────────────────────
  // Preserva preço, role, playerId e isReserva. Capitão não pode ser movido.
  async function moverJogador(sourceTeamId, jogadorIdx, destTeamId) {
    if (sourceTeamId === destTeamId) return
    const source = times[sourceTeamId]
    const dest   = times[destTeamId]
    if (!source || !dest) return flash('erro', 'Time não encontrado')

    const jogador = (source.jogadores ?? [])[jogadorIdx]
    if (!jogador) return flash('erro', 'Jogador não encontrado')
    if (jogador.isCaptain) return flash('erro', 'Capitão não pode trocar de time')

    // Evita duplicar caso já esteja no destino (defensivo)
    const jaNoDestino = (dest.jogadores ?? []).some(j =>
      (jogador.playerId && j.playerId === jogador.playerId) ||
      (!jogador.playerId && j.nome === jogador.nome)
    )
    if (jaNoDestino) return flash('erro', `${jogador.nome} já está em ${dest.nome}`)

    const novoSource = (source.jogadores ?? []).filter((_, i) => i !== jogadorIdx)
    const novoDest   = [...(dest.jogadores ?? []), { ...jogador }]

    try {
      await update(ref(db), {
        [`${teamPath(campeonatoId)}/${sourceTeamId}/jogadores`]: novoSource,
        [`${teamPath(campeonatoId)}/${destTeamId}/jogadores`]:   novoDest,
      })
      flash('ok', `${jogador.nome} movido de "${source.nome}" para "${dest.nome}"`)
    } catch (e) {
      flash('erro', `Erro ao mover: ${e.message}`)
    }
  }

  async function handleDeletar(id) {
    try {
      await remove(ref(db, `${teamPath(campeonatoId)}/${id}`))
      setConfirmDelete(null)
      flash('ok', 'Time removido.')
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    }
  }

  // ── Derivados ────────────────────────────────────────────────────────────────

  const timesArr = Object.entries(times).sort(([, a], [, b]) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))

  const timesJaImportados = new Set(
    timesArr.filter(([, t]) => t.fonte === 'leilao').map(([, t]) => t.leilaoCapId ?? t.nome)
  )

  const capitaesArr = Object.entries(capitaes).filter(([, c]) => c.nome)

  const inscritosVisiveis = inscritos.filter(p =>
    !buscaPlayer || (p.discord ?? '').toLowerCase().includes(buscaPlayer.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <section className="admin-section" style={{ maxWidth: 900, borderColor: 'rgba(76,175,125,0.25)' }}>
      <div className="admin-section-title" style={{ color: 'var(--green)' }}>Times</div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Feedback */}
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

        {/* ── Reconciliar reservas com o leilão ─────────────────────────────── */}
        {(() => {
          const temLeilao = Object.keys(playerState).length > 0
          const timesLeilao = timesArr.filter(([, t]) => t.fonte === 'leilao')
          if (!temLeilao || timesLeilao.length === 0) return null

          const analises = timesLeilao.map(([teamId, time]) => analisarTime(teamId, time))
          const totalMudancasSugeridas = analises.reduce((sum, a) => {
            return sum + a.jogadores.filter(j => {
              const efetivo = checkboxState(a.teamId, j.idx, j.sugerido)
              return efetivo !== !!j.jogador.isReserva
            }).length
          }, 0)

          const sinalLabel = {
            tipoPosse: { texto: '✓ leilão', cor: 'var(--green)',  hint: 'Confirmado pelo registro do leilão (tipoPosse)' },
            bucket:    { texto: '◆ bucket', cor: 'var(--blue)',   hint: 'Estava no bucket /reservas do leilão' },
            pref:      { texto: '~ inscrição', cor: 'var(--gold2)', hint: 'Inscreveu-se como Reserva no formulário' },
            nenhum:    { texto: '', cor: 'var(--text3)', hint: 'Sem sinal automático — decisão manual' },
            manual:    { texto: '', cor: 'var(--text3)', hint: 'Sem playerId vinculado' },
            capitao:   { texto: '⚑ capitão', cor: 'var(--gold)', hint: 'Capitão — sempre titular' },
          }

          return (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--gold2)' }}>
                    Reconciliar reservas com o leilão
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Cruza tipoPosse, bucket do leilão e preferência da inscrição. Revise e ajuste antes de aplicar.
                  </span>
                </div>
                {!reconciliarOpen && (
                  <button className="btn"
                    onClick={abrirReconciliar}
                    style={{ fontSize: 12, padding: '6px 14px', borderColor: 'var(--purple)', color: 'var(--purple)', flexShrink: 0 }}>
                    Abrir reconciliação
                  </button>
                )}
              </div>

              {reconciliarOpen && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Legenda de sinais */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)' }}>
                    <span><span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ leilão</span> = tipoPosse confirmado</span>
                    <span><span style={{ color: 'var(--blue)', fontWeight: 700 }}>◆ bucket</span> = estava em /reservas do leilão</span>
                    <span><span style={{ color: 'var(--gold2)', fontWeight: 700 }}>~ inscrição</span> = pref do formulário</span>
                  </div>

                  {/* Lista de times */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 480, overflowY: 'auto' }}>
                    {analises.map(a => {
                      const efetivoReservas = a.jogadores.filter(j => checkboxState(a.teamId, j.idx, j.sugerido)).length
                      const okCount = efetivoReservas === a.esperadoReservas
                      return (
                        <div key={a.teamId} style={{ border: `1px solid ${a.time.cor ?? 'var(--border)'}33`, borderRadius: 6, padding: '8px 10px', background: 'var(--bg)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, color: a.time.cor }}>{a.time.nome}</span>
                            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>{a.total}p</span>
                            <span style={{ fontSize: 11, color: okCount ? 'var(--green)' : 'var(--red)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                              {efetivoReservas}/{a.esperadoReservas} reservas {okCount ? '✓' : '⚠'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {a.jogadores.map(({ idx, jogador, sinal, sugerido, locked }) => {
                              if (jogador.isCaptain) return null  // capitão não toggleável
                              const checked = checkboxState(a.teamId, idx, sugerido)
                              const sLabel = sinalLabel[sinal]
                              const ehOverride = reconciliarChoices[a.teamId]?.[idx] !== undefined
                              return (
                                <label
                                  key={idx}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                                    background: checked ? 'rgba(155,110,232,0.08)' : 'transparent',
                                    fontFamily: "'Barlow Condensed', sans-serif",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleCheckbox(a.teamId, idx, sugerido)}
                                    disabled={locked}
                                    style={{ cursor: locked ? 'not-allowed' : 'pointer' }}
                                  />
                                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {jogador.nome}
                                  </span>
                                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{jogador.role}</span>
                                  {sLabel.texto && (
                                    <span title={sLabel.hint} style={{ fontSize: 10, color: sLabel.cor, fontWeight: 700 }}>
                                      {sLabel.texto}
                                    </span>
                                  )}
                                  {ehOverride && (
                                    <span title="Você ajustou esta marcação" style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700 }}>↺</span>
                                  )}
                                  {checked && (
                                    <span style={{ fontSize: 9, padding: '0 5px', borderRadius: 2, color: 'var(--purple)', background: 'rgba(155,110,232,0.18)', border: '1px solid rgba(155,110,232,0.4)', fontWeight: 700, letterSpacing: '0.06em' }}>
                                      RESERVA
                                    </span>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <button className="btn primary"
                      onClick={aplicarReconciliar}
                      disabled={reconciliarApplying || totalMudancasSugeridas === 0}
                      style={{ fontSize: 12, padding: '6px 14px', background: 'var(--purple)', borderColor: 'var(--purple)', color: '#fff', opacity: totalMudancasSugeridas === 0 ? 0.5 : 1 }}>
                      {reconciliarApplying ? 'Aplicando...' : `Aplicar ${totalMudancasSugeridas} mudança(s)`}
                    </button>
                    <button className="btn"
                      onClick={() => { setReconciliarOpen(false); setReconciliarChoices({}) }}
                      style={{ fontSize: 12, padding: '6px 12px' }}>
                      Cancelar
                    </button>
                    {Object.keys(reconciliarChoices).length > 0 && (
                      <button className="btn"
                        onClick={() => setReconciliarChoices({})}
                        title="Limpa seus ajustes manuais e volta às sugestões automáticas"
                        style={{ fontSize: 11, padding: '5px 10px', color: 'var(--text2)' }}>
                        ↺ Resetar ajustes
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Importar do leilão ───────────────────────────────────────────── */}
        {capitaesArr.length > 0 && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <FieldLabel label="Times do leilão atual" hint="clique para importar" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {capitaesArr.map(([id, cap]) => {
                const jaImportado = timesJaImportados.has(id)
                const rosterCount = Object.keys(cap.roster ?? {}).length + (cap.capitaoNome ? 1 : 0)
                return (
                  <button
                    key={id}
                    onClick={() => !jaImportado && importarDoLeilao(id, cap)}
                    disabled={jaImportado}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 14px', borderRadius: 6, cursor: jaImportado ? 'default' : 'pointer',
                      border: `1px solid ${jaImportado ? 'var(--border)' : cap.cor ?? 'var(--blue)'}`,
                      background: jaImportado ? 'var(--bg2)' : `${cap.cor ?? '#4a9eda'}18`,
                      color: jaImportado ? 'var(--text3)' : (cap.cor ?? 'var(--blue)'),
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13,
                      opacity: jaImportado ? 0.5 : 1,
                    }}
                  >
                    <span>{cap.emoji ?? '🛡'}</span>
                    <span>{cap.nome}</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{rosterCount} jogadores</span>
                    {jaImportado && <span style={{ fontSize: 10 }}>✓ importado</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Times salvos ─────────────────────────────────────────────────── */}
        {timesArr.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timesArr.map(([id, time]) => editando === id ? (
              /* ── Modo edição inline ── */
              <div key={id} style={{
                background: 'var(--bg3)', border: '1px solid var(--border2)',
                borderLeft: `3px solid ${editForm.cor}`,
                borderRadius: 6, padding: 16,
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                {/* Nome + cor */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <FieldLabel label="Nome do time" />
                    <input value={editForm.nome}
                      onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                      style={inputStyle} />
                  </div>
                  <div>
                    <FieldLabel label="Cor" />
                    <input type="color" value={editForm.cor}
                      onChange={e => setEditForm(f => ({ ...f, cor: e.target.value }))}
                      style={{ width: 38, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                  </div>
                </div>

                {/* Ícone */}
                <div>
                  <FieldLabel label="Ícone do time" hint="cole o link direto da imagem (Postimages, Discord CDN...)" />
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      value={editForm.iconUrl ?? ''}
                      onChange={e => setEditForm(f => ({ ...f, iconUrl: e.target.value }))}
                      placeholder="https://i.postimg.cc/..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <TeamIcon
                      time={{ nome: editForm.nome, cor: editForm.cor, iconUrl: editForm.iconUrl?.trim() || null }}
                      size={48}
                    />
                  </div>
                  {editForm.iconUrl?.trim() && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow', sans-serif", marginTop: 4 }}>
                      Preview ao lado — se aparecer a inicial, a URL não está carregando.
                    </div>
                  )}
                </div>

                {/* Fuso */}
                <div>
                  <FieldLabel label="Fuso horário" />
                  <select value={editForm.fuso}
                    onChange={e => setEditForm(f => ({ ...f, fuso: e.target.value }))}
                    style={{ ...inputStyle }}>
                    {FUSOS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>

                {/* Jogadores */}
                <div>
                  <FieldLabel label="Jogadores" />
                  {(() => {
                    const titulares = editForm.jogadores.filter(j => !j.isReserva).length
                    const reservas  = editForm.jogadores.filter(j => j.isReserva).length
                    const minTit    = 5  // mínimo titulares por time (inclui capitão)
                    return (
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 6 }}>
                        <span>{titulares} titular{titulares === 1 ? '' : 'es'}</span>
                        <span>·</span>
                        <span>{reservas} reserva{reservas === 1 ? '' : 's'}</span>
                        {titulares < minTit && (
                          <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ abaixo do mínimo ({minTit})</span>
                        )}
                      </div>
                    )
                  })()}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {editForm.jogadores.map((j, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {j.isCaptain && <span style={{ color: 'var(--gold)', fontSize: 13, flexShrink: 0 }}>★</span>}
                        <input value={j.nome}
                          onChange={e => editUpdateJogador(i, 'nome', e.target.value)}
                          placeholder="Nome" style={{ ...inputStyle, flex: 1 }} />
                        <select value={j.role}
                          onChange={e => editUpdateJogador(i, 'role', e.target.value)}
                          style={{ ...inputStyle, width: 'auto', flex: 'none' }}>
                          {ROLES_LISTA.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {!j.isCaptain && (
                          <button
                            onClick={() => editUpdateJogador(i, 'isReserva', !j.isReserva)}
                            title={j.isReserva ? 'Marcado como reserva (clique para titular)' : 'Marcar como reserva'}
                            style={{
                              fontSize: 10, padding: '3px 8px', borderRadius: 3, flexShrink: 0,
                              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                              letterSpacing: '0.06em', cursor: 'pointer',
                              border: j.isReserva ? '1px solid rgba(155,110,232,0.55)' : '1px solid var(--border2)',
                              background: j.isReserva ? 'rgba(155,110,232,0.18)' : 'var(--bg)',
                              color: j.isReserva ? 'var(--purple)' : 'var(--text3)',
                            }}
                          >
                            {j.isReserva ? '✓ RESERVA' : 'RESERVA'}
                          </button>
                        )}
                        <button className="btn" onClick={() => editRemoveJogador(i)}
                          style={{ fontSize: 12, padding: '4px 8px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)', flexShrink: 0 }}>
                          ✕
                        </button>
                      </div>
                    ))}
                    <button className="btn"
                      style={{ fontSize: 12, padding: '5px 12px', alignSelf: 'flex-start' }}
                      onClick={editAddJogador}>
                      + Jogador
                    </button>
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary"
                    style={{ fontSize: 13, padding: '7px 18px' }}
                    onClick={() => salvarEdicao(id)} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button className="btn"
                    style={{ fontSize: 13, padding: '7px 14px' }}
                    onClick={() => { setEditando(null); setEditForm(null) }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <TeamCard
                key={id} id={id} time={time}
                confirmando={confirmDelete === id}
                onEditar={() => iniciarEdicao(id, time)}
                onDeletar={() => setConfirmDelete(id)}
                onConfirmar={() => handleDeletar(id)}
                onCancelar={() => setConfirmDelete(null)}
                allTeams={timesArr}
                onMoverJogador={(idx, destId) => moverJogador(id, idx, destId)}
              />
            ))}
          </div>
        )}

        {timesArr.length === 0 && capitaesArr.length === 0 && !mostraCriar && (
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhum time criado ainda.</p>
        )}

        {/* Botão novo time */}
        <button
          className="btn"
          style={{ fontSize: 13, padding: '7px 14px', borderColor: 'var(--green)', color: 'var(--green)', alignSelf: 'flex-start' }}
          onClick={() => { setMostraCriar(v => !v); setFeedback(null) }}
        >
          {mostraCriar ? '✕ Cancelar' : '+ Novo time'}
        </button>

        {/* ── Formulário de criação ─────────────────────────────────────────── */}
        {mostraCriar && (
          <div style={{
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 700 }}>
              Novo Time
            </span>

            {/* Nome + cor */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <FieldLabel label="Nome do time" />
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Team Alpha"
                  style={inputStyle}
                />
              </div>
              <div>
                <FieldLabel label="Cor" />
                <input type="color" value={form.cor}
                  onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                  style={{ width: 38, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                />
              </div>
            </div>

            {/* Fuso horário */}
            <div>
              <FieldLabel label="Fuso horário do time" />
              <select
                value={form.fuso}
                onChange={e => setForm(f => ({ ...f, fuso: e.target.value }))}
                style={{ ...inputStyle }}
              >
                {FUSOS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>

            {/* Toggle modo */}
            <div>
              <FieldLabel label="Como adicionar jogadores" />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[['manual', 'Manual'], ['inscritos', 'Da lista de inscritos']].map(([v, l]) => (
                  <button key={v}
                    onClick={() => setForm(f => ({ ...f, modoAdd: v, jogadores: [] }))}
                    style={{
                      padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      border: `1px solid ${form.modoAdd === v ? 'var(--green)' : 'var(--border2)'}`,
                      background: form.modoAdd === v ? 'rgba(76,175,125,0.12)' : 'var(--bg2)',
                      color: form.modoAdd === v ? 'var(--green)' : 'var(--text2)',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Modo manual */}
              {form.modoAdd === 'manual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.jogadores.map((j, i) => (
                    <PlayerRow key={i} jogador={j}
                      onChange={(field, val) => updateJogador(i, field, val)}
                      onRemove={() => removeJogador(i)}
                    />
                  ))}
                  <button className="btn"
                    style={{ fontSize: 12, padding: '5px 12px', alignSelf: 'flex-start' }}
                    onClick={addJogador}
                  >
                    + Jogador
                  </button>
                </div>
              )}

              {/* Modo inscritos */}
              {form.modoAdd === 'inscritos' && (
                <div>
                  {/* Tags selecionados */}
                  {form.jogadores.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                      {form.jogadores.map((j, i) => (
                        <button key={i} onClick={() => removeJogador(i)}
                          style={{
                            background: 'rgba(76,175,125,0.15)', border: '1px solid var(--green)',
                            color: 'var(--green)', borderRadius: 4, padding: '3px 10px',
                            fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {j.nome} <span style={{ opacity: 0.7 }}>— {j.role}</span>  ✕
                        </button>
                      ))}
                    </div>
                  )}

                  <input value={buscaPlayer} onChange={e => setBuscaPlayer(e.target.value)}
                    placeholder="Buscar inscrito..." style={{ ...inputStyle, marginBottom: 8 }}
                  />

                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4,
                    maxHeight: 180, overflowY: 'auto', padding: 8,
                    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6,
                  }}>
                    {loadingInscritos && (
                      <p style={{ color: 'var(--text2)', fontSize: 12, margin: 0 }}>Carregando inscritos...</p>
                    )}
                    {!loadingInscritos && inscritosVisiveis.length === 0 && (
                      <p style={{ color: 'var(--text2)', fontSize: 12, margin: 0 }}>
                        {inscritos.length === 0 ? 'Nenhum inscrito encontrado.' : 'Nenhum resultado para a busca.'}
                      </p>
                    )}
                    {inscritosVisiveis.map(p => {
                      const selecionado = form.jogadores.some(j => j.playerId === p.id)
                      return (
                        <button key={p.id} onClick={() => toggleInscrito(p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: selecionado ? 'rgba(76,175,125,0.18)' : 'var(--bg3)',
                            border: `1px solid ${selecionado ? 'var(--green)' : 'var(--border)'}`,
                            color: selecionado ? 'var(--green)' : 'var(--text2)',
                            borderRadius: 4, padding: '4px 10px',
                            fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {p.discord}
                          <span style={{ opacity: 0.6, fontSize: 11 }}>— {p.rolePrimaria ?? '?'}</span>
                          {selecionado && <span style={{ marginLeft: 2 }}>✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary"
                style={{ fontSize: 13, padding: '7px 18px' }}
                onClick={handleSalvar} disabled={salvando}
              >
                {salvando ? 'Salvando...' : 'Criar time'}
              </button>
              <button className="btn"
                style={{ fontSize: 13, padding: '7px 14px' }}
                onClick={() => { setMostraCriar(false); setForm(FORM_VAZIO); setBuscaPlayer('') }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function TeamCard({ id, time, confirmando, onEditar, onDeletar, onConfirmar, onCancelar, allTeams, onMoverJogador }) {
  const fonteLabel = { manual: 'Manual', planilha: 'Planilha', leilao: 'Leilão' }
  const [movendoIdx, setMovendoIdx] = useState(null)

  const outrosTimes = (allTeams ?? []).filter(([tid]) => tid !== id)

  return (
    <div style={{
      background: 'var(--bg3)',
      border: `1px solid var(--border)`,
      borderLeft: `3px solid ${time.cor ?? 'var(--border)'}`,
      borderRadius: 6, padding: '10px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <TeamIcon time={time} size={40} style={{ marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: time.cor }}>
            {time.nome}
          </span>
          <span style={{
            fontSize: 10, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif",
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 3, padding: '1px 6px', letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {fonteLabel[time.fonte] ?? 'manual'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {time.jogadores?.length ?? 0} jogadores
          </span>
        </div>

        {time.jogadores?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
            {time.jogadores.map((j, i) => (
              <div key={i} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '3px 8px',
                fontSize: 12, color: 'var(--text2)',
                fontFamily: "'Barlow Condensed', sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {j.isCaptain && <span style={{ color: 'var(--gold)' }} title="Capitão">★</span>}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.nome}
                </span>
                {j.isReserva && (
                  <span style={{
                    fontSize: 9, padding: '0 5px', borderRadius: 2,
                    background: 'rgba(155,110,232,0.15)', border: '1px solid rgba(155,110,232,0.35)',
                    color: 'var(--purple)', letterSpacing: '0.06em', fontWeight: 700,
                  }} title="Pego na fase de substitutos no leilão">RESERVA</span>
                )}
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>{j.role}</span>
                {typeof j.preco === 'number' && (
                  <span style={{ color: 'var(--gold)', fontSize: 11, fontWeight: 700 }}>{j.preco}🪙</span>
                )}
                {!j.isCaptain && outrosTimes.length > 0 && (
                  movendoIdx === i ? (
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={e => {
                          const destId = e.target.value
                          if (destId) {
                            onMoverJogador?.(i, destId)
                            setMovendoIdx(null)
                          }
                        }}
                        style={{
                          fontSize: 11, padding: '1px 4px', background: 'var(--bg)',
                          color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 3,
                        }}
                      >
                        <option value="">→ time...</option>
                        {outrosTimes.map(([tid, t]) => (
                          <option key={tid} value={tid}>{t.nome}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setMovendoIdx(null)}
                        style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, padding: 0 }}
                        title="Cancelar"
                      >✕</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setMovendoIdx(i)}
                      title="Mover para outro time"
                      style={{
                        background: 'rgba(74,158,218,0.1)', border: '1px solid rgba(74,158,218,0.3)',
                        color: 'var(--blue)', cursor: 'pointer', fontSize: 10,
                        padding: '1px 6px', borderRadius: 3,
                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      }}
                    >↔</button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {confirmando ? (
          <>
            <button className="btn" onClick={onConfirmar}
              style={{ fontSize: 11, padding: '3px 10px', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}>
              Confirmar
            </button>
            <button className="btn" onClick={onCancelar}
              style={{ fontSize: 11, padding: '3px 8px' }}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onEditar}
              style={{ fontSize: 11, padding: '3px 8px', color: 'var(--text2)' }}
              title="Editar time">
              ✏️
            </button>
            <button className="btn" onClick={onDeletar}
              style={{ fontSize: 11, padding: '3px 8px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)' }}>
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function PlayerRow({ jogador, onChange, onRemove }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input value={jogador.nome} onChange={e => onChange('nome', e.target.value)}
        placeholder="Nome do jogador" style={{ ...inputStyle, flex: 1 }} />
      <select value={jogador.role} onChange={e => onChange('role', e.target.value)}
        style={{ ...inputStyle, width: 'auto', flex: 'none' }}>
        {ROLES_LISTA.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <button className="btn" onClick={onRemove}
        style={{ fontSize: 12, padding: '4px 8px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)', flexShrink: 0 }}>
        ✕
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
      {hint && <span style={{ fontWeight: 400, marginLeft: 5, textTransform: 'none', fontSize: 11 }}>— {hint}</span>}
    </div>
  )
}
