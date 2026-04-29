import { useState, useEffect } from 'react'
import { ref, onValue, set, remove, push } from 'firebase/database'
import { db } from '../firebase/database'
import { FUSOS, FUSO_PADRAO } from '../utils/scheduling'

const ROLES_LISTA = ['Tank', 'Bruiser', 'Melee Assassin', 'Ranged Assassin', 'Healer', 'Support', 'Flex']

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

const FORM_VAZIO = { nome: '', cor: '#4a9eda', fuso: FUSO_PADRAO, modoAdd: 'manual', jogadores: [] }

// ── Componente principal ─────────────────────────────────────────────────────

export default function AdminTeamsSection() {
  const [times, setTimes]             = useState({})
  const [inscritos, setInscritos]     = useState([])      // do Google Sheets
  const [capitaes, setCapitaes]       = useState({})      // do leilão (/draftSession/captains)
  const [loadingInscritos, setLoadingInscritos] = useState(false)

  const [mostraCriar, setMostraCriar] = useState(false)
  const [form, setForm]               = useState(FORM_VAZIO)
  const [buscaPlayer, setBuscaPlayer] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [feedback, setFeedback]       = useState(null)
  const [salvando, setSalvando]       = useState(false)

  // Times salvos
  useEffect(() => onValue(ref(db, '/teams'), snap => setTimes(snap.val() ?? {})), [])

  // Times do leilão (draftSession)
  useEffect(() => onValue(ref(db, '/draftSession/captains'), snap => setCapitaes(snap.val() ?? {})), [])

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

    // Capitão
    if (cap.capitaoNome) {
      jogadores.push({ nome: cap.capitaoNome, role: 'Flex', isCaptain: true })
    }

    // Roster
    Object.entries(cap.roster ?? {}).forEach(([, entry]) => {
      if (!entry.isCaptain) {
        jogadores.push({ nome: entry.discord ?? '', role: 'Flex' })
      }
    })

    try {
      const id = push(ref(db, '/teams')).key
      await set(ref(db, `/teams/${id}`), {
        nome:      cap.nome,
        cor:       cap.cor ?? '#4a9eda',
        fonte:     'leilao',
        jogadores,
        criadoEm: Date.now(),
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
      const id = push(ref(db, '/teams')).key
      await set(ref(db, `/teams/${id}`), {
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

  async function handleDeletar(id) {
    try {
      await remove(ref(db, `/teams/${id}`))
      setConfirmDelete(null)
      flash('ok', 'Time removido.')
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    }
  }

  // ── Derivados ────────────────────────────────────────────────────────────────

  const timesArr = Object.entries(times).sort(([, a], [, b]) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))

  const timesJaImportados = new Set(
    timesArr.filter(([, t]) => t.fonte === 'leilao').map(([, t]) => t.nome)
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

        {/* ── Importar do leilão ───────────────────────────────────────────── */}
        {capitaesArr.length > 0 && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <FieldLabel label="Times do leilão atual" hint="clique para importar" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {capitaesArr.map(([id, cap]) => {
                const jaImportado = timesJaImportados.has(cap.nome)
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
            {timesArr.map(([id, time]) => (
              <TeamCard
                key={id} id={id} time={time}
                confirmando={confirmDelete === id}
                onDeletar={() => setConfirmDelete(id)}
                onConfirmar={() => handleDeletar(id)}
                onCancelar={() => setConfirmDelete(null)}
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

function TeamCard({ time, confirmando, onDeletar, onConfirmar, onCancelar }) {
  const fonteLabel = { manual: 'Manual', planilha: 'Planilha', leilao: 'Leilão' }

  return (
    <div style={{
      background: 'var(--bg3)',
      border: `1px solid var(--border)`,
      borderLeft: `3px solid ${time.cor ?? 'var(--border)'}`,
      borderRadius: 6, padding: '10px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {time.jogadores.map((j, i) => (
              <span key={i} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 3, padding: '2px 7px',
                fontSize: 11, color: 'var(--text2)',
                fontFamily: "'Barlow Condensed', sans-serif",
              }}>
                {j.isCaptain && <span style={{ color: 'var(--gold)', marginRight: 3 }}>★</span>}
                {j.nome}
                <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{j.role}</span>
              </span>
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
          <button className="btn" onClick={onDeletar}
            style={{ fontSize: 11, padding: '3px 8px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)' }}>
            🗑
          </button>
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
