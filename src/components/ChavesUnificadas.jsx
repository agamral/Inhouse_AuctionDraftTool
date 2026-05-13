import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove, push } from 'firebase/database'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath, rodadasPath, confrontosPath, chavePath } from '../utils/campeonatoPaths'
import {
  STATUS_CONFRONTO, STATUS_LABEL, STATUS_COR,
  TIPO_CONFRONTO, FORMATO_SERIE,
} from '../utils/scheduling'
import AdminChaveSection from './AdminChaveSection'
import { ManualBracket } from './BracketManual'

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '7px 10px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function ChavesUnificadas() {
  const { campeonatoId } = useCampeonato()
  const navigate = useNavigate()

  const [rodadas,    setRodadas]    = useState({})
  const [confrontos, setConfrontos] = useState({})
  const [times,      setTimes]      = useState({})
  const [chaves,     setChaves]     = useState({})

  const [modo,           setModo]           = useState('admin')   // 'admin' | 'publico'
  const [rodadaAberta,   setRodadaAberta]   = useState(null)      // rodadaId expandida na sidebar
  const [feedback,       setFeedback]       = useState(null)
  const [modalNovaRodada,    setModalNovaRodada]    = useState(false)
  const [modalNovoConfronto, setModalNovoConfronto] = useState(false)

  useEffect(() => onValue(ref(db, rodadasPath(campeonatoId)),    s => setRodadas(s.val()    ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, confrontosPath(campeonatoId)), s => setConfrontos(s.val() ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, teamPath(campeonatoId)),       s => setTimes(s.val()      ?? {})), [campeonatoId])
  useEffect(() => onValue(ref(db, chavePath(campeonatoId)),      s => setChaves(s.val()     ?? {})), [campeonatoId])

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 3000)
  }

  // ── CRUD rodadas / confrontos ─────────────────────────────────────────────────

  async function criarRodada({ numero, semanaAnuncio, semanaJogos }) {
    try {
      const id = push(ref(db, rodadasPath(campeonatoId))).key
      await set(ref(db, `${rodadasPath(campeonatoId)}/${id}`), {
        numero, semanaAnuncio, semanaJogos,
        status: 'configurando', criadaEm: Date.now(),
      })
      setRodadaAberta(id)
      setModalNovaRodada(false)
      flash('ok', `Rodada ${numero} criada.`)
    } catch (e) { flash('erro', e.message) }
  }

  async function criarConfronto({ timeA, timeB, tipo, formato }) {
    if (!rodadaAberta) return flash('erro', 'Selecione uma rodada na sidebar primeiro.')
    if (timeA === timeB) return flash('erro', 'Os times precisam ser diferentes.')
    try {
      const id = push(ref(db, confrontosPath(campeonatoId))).key
      await set(ref(db, `${confrontosPath(campeonatoId)}/${id}`), {
        rodadaId: rodadaAberta, timeA, timeB, tipo, formato,
        slot: null, status: STATUS_CONFRONTO.PENDENTE,
        resultado: null, alertas: {}, observacoes: null,
        criadoEm: Date.now(), atualizadoEm: Date.now(),
      })
      setModalNovoConfronto(false)
      flash('ok', 'Confronto criado.')
    } catch (e) { flash('erro', e.message) }
  }

  // ── Derivados ─────────────────────────────────────────────────────────────────

  const rodadasArr = Object.entries(rodadas).sort(([, a], [, b]) => a.numero - b.numero)

  const confrontosPorRodada = {}
  for (const [id, c] of Object.entries(confrontos)) {
    const rid = c.rodadaId ?? '__sem_rodada__'
    if (!confrontosPorRodada[rid]) confrontosPorRodada[rid] = []
    confrontosPorRodada[rid].push([id, c])
  }

  const chavesComSlots = Object.entries(chaves)
    .filter(([, c]) => c.slots && Object.keys(c.slots).length > 0)
    .sort(([, a], [, b]) => (a.criadaEm ?? 0) - (b.criadaEm ?? 0))

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 600, background: 'var(--bg2)', borderRadius: 8, border: '1px solid rgba(201,168,76,0.2)', overflow: 'hidden' }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside style={{
        width: 270, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'var(--bg3)',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>
            Rodadas & Confrontos
          </span>
          <button className="btn"
            style={{ fontSize: 11, padding: '3px 9px', borderColor: 'var(--gold)', color: 'var(--gold)', whiteSpace: 'nowrap' }}
            onClick={() => setModalNovaRodada(true)}>
            + Rodada
          </button>
        </div>

        {/* Rodadas list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {rodadasArr.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 14px' }}>Nenhuma rodada ainda.</p>
          )}
          {rodadasArr.map(([rid, rodada]) => {
            const confs = confrontosPorRodada[rid] ?? []
            const isOpen = rodadaAberta === rid
            return (
              <div key={rid}>
                {/* Rodada header */}
                <div
                  onClick={() => setRodadaAberta(isOpen ? null : rid)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer',
                    background: isOpen ? 'rgba(201,168,76,0.07)' : 'transparent',
                    borderLeft: `2px solid ${isOpen ? 'var(--gold)' : 'transparent'}`,
                  }}>
                  <span style={{ fontSize: 10, color: isOpen ? 'var(--gold)' : 'var(--text3)', transition: 'transform 0.15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                  <span style={{ flex: 1, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: isOpen ? 'var(--gold)' : 'var(--text)' }}>
                    Rodada {rodada.numero}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text3)' }}>
                    {confs.length} conf.
                  </span>
                </div>

                {/* Confrontos da rodada */}
                {isOpen && (
                  <div style={{ paddingLeft: 14, paddingBottom: 4 }}>
                    {confs.length === 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0 4px 8px', fontStyle: 'italic' }}>
                        Nenhum confronto.
                      </p>
                    )}
                    {confs
                      .sort(([, a], [, b]) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0))
                      .map(([cid, c]) => {
                        const tA = times[c.timeA]
                        const tB = times[c.timeB]
                        return (
                          <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 4, marginBottom: 2, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: tA?.cor ?? 'var(--border2)', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {tA?.nome ?? '?'} × {tB?.nome ?? '?'}
                            </span>
                            <span style={{ fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: STATUS_COR[c.status] ?? 'var(--text3)', whiteSpace: 'nowrap' }}>
                              {c.status === STATUS_CONFRONTO.REALIZADO ? '✓' : c.status === STATUS_CONFRONTO.CANCELADO ? '✗' : '●'}
                            </span>
                            {(c.status === STATUS_CONFRONTO.CONFIRMADO || c.status === 'em_jogo') && (
                              <button
                                onClick={() => navigate(`/showmatch?confronto=${cid}&campeonato=${campeonatoId}`)}
                                style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer', background: 'rgba(155,110,232,0.12)', border: '1px solid rgba(155,110,232,0.35)', color: 'var(--purple)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                                Draft
                              </button>
                            )}
                          </div>
                        )
                      })}
                    <button className="btn"
                      style={{ fontSize: 11, padding: '4px 10px', marginTop: 4, borderColor: 'var(--blue)', color: 'var(--blue)', width: '100%' }}
                      onClick={() => setModalNovoConfronto(true)}>
                      + Confronto
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── MAIN AREA ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>
            Chave / Bracket
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
            {[{ id: 'admin', label: 'Admin' }, { id: 'publico', label: 'Público' }].map(({ id, label }) => (
              <button key={id} onClick={() => setModo(id)}
                style={{ padding: '4px 14px', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: modo === id ? (id === 'admin' ? 'rgba(201,168,76,0.15)' : 'rgba(74,158,218,0.15)') : 'transparent',
                  color: modo === id ? (id === 'admin' ? 'var(--gold)' : 'var(--blue)') : 'var(--text3)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={{ margin: '10px 16px 0', padding: '7px 12px', borderRadius: 5, fontSize: 12,
            background: feedback.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
            border: `1px solid ${feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
            color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>
            {feedback.msg}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, padding: '14px 16px', overflowX: 'auto' }}>
          {modo === 'admin' ? (
            <AdminChaveSection embedded />
          ) : (
            /* Visualização pública */
            chavesComSlots.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, fontStyle: 'italic', padding: '24px 0' }}>
                Nenhuma chave configurada ainda. Crie e configure slots na aba Admin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {chavesComSlots.map(([id, chave]) => (
                  <div key={id}>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--gold2)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
                      {chave.nome}
                    </div>
                    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
                      <ManualBracket slots={chave.slots} confrontos={confrontos} times={times} />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {modalNovaRodada && (
        <ModalNovaRodada onSalvar={criarRodada} onFechar={() => setModalNovaRodada(false)} />
      )}
      {modalNovoConfronto && (
        <ModalNovoConfronto
          times={times}
          rodada={rodadas[rodadaAberta]}
          onSalvar={criarConfronto}
          onFechar={() => setModalNovoConfronto(false)}
        />
      )}
    </div>
  )
}

// ── Modais ─────────────────────────────────────────────────────────────────────

function Modal({ titulo, onFechar, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onFechar}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, padding: '20px 24px', width: 360, maxWidth: '90vw' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 16 }}>
          {titulo}
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalNovaRodada({ onSalvar, onFechar }) {
  const [form, setForm] = useState({ numero: '', semanaAnuncio: '', semanaJogos: '' })
  return (
    <Modal titulo="Nova Rodada" onFechar={onFechar}>
      <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Número</label>
      <input type="number" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
        placeholder="1" style={{ ...inputStyle, marginBottom: 10 }} />
      <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Semana de jogos</label>
      <input type="date" value={form.semanaJogos} onChange={e => setForm(f => ({ ...f, semanaJogos: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar({ numero: parseInt(form.numero) || 1, semanaAnuncio: form.semanaAnuncio, semanaJogos: form.semanaJogos })}>
          Criar
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalNovoConfronto({ times, rodada, onSalvar, onFechar }) {
  const timesArr = Object.entries(times)
  const [form, setForm] = useState({ timeA: '', timeB: '', tipo: TIPO_CONFRONTO.REGULAR, formato: FORMATO_SERIE.MD2 })
  return (
    <Modal titulo={`Novo Confronto${rodada ? ` — Rodada ${rodada.numero}` : ''}`} onFechar={onFechar}>
      <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Time A</label>
      <select value={form.timeA} onChange={e => setForm(f => ({ ...f, timeA: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 10 }}>
        <option value="">— selecionar —</option>
        {timesArr.map(([id, t]) => <option key={id} value={id}>{t.nome}</option>)}
      </select>
      <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Time B</label>
      <select value={form.timeB} onChange={e => setForm(f => ({ ...f, timeB: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 10 }}>
        <option value="">— selecionar —</option>
        {timesArr.map(([id, t]) => <option key={id} value={id}>{t.nome}</option>)}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Tipo</label>
          <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inputStyle}>
            {Object.values(TIPO_CONFRONTO).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Formato</label>
          <select value={form.formato} onChange={e => setForm(f => ({ ...f, formato: e.target.value }))} style={inputStyle}>
            {Object.values(FORMATO_SERIE).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ fontSize: 13 }}
          onClick={() => onSalvar(form)} disabled={!form.timeA || !form.timeB}>
          Criar confronto
        </button>
        <button className="btn" style={{ fontSize: 13 }} onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  )
}
