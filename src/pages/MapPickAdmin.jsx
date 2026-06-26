import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, set, push } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { mapPickPath } from '../utils/campeonatoPaths'
import { MAPAS, POOL_TEMPORADA } from '../utils/mapPool'

const CORES_PADRAO = ['#4a9eda', '#e05555', '#4caf7d', '#9b6ee8', '#c9a84c', '#e08a3c']

function gerarId() {
  return `mp${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`
}

const labelStyle = {
  fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text2)', marginBottom: 6, display: 'block',
}
const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Status label ─────────────────────────────────────────────────────────────

function faseLabel(s) {
  if (!s.resultado)       return { txt: 'Cara ou coroa', cor: 'var(--blue)' }
  if (!s.preferencia)     return { txt: 'Escolhendo prioridade', cor: 'var(--gold)' }
  if ((s.bans ?? []).length < 4) return { txt: `Banindo (${(s.bans ?? []).length}/4)`, cor: 'var(--red)' }
  if (!s.mapaEscolhido)   return { txt: 'Escolhendo mapa', cor: 'var(--purple)' }
  return { txt: 'Encerrado', cor: 'var(--green)' }
}

// ── Vista compacta de uma sessão ──────────────────────────────────────────────

function SessaoView({ sessao, sessaoId, campeonatoId }) {
  const navigate = useNavigate()
  const fase = faseLabel(sessao)
  const pool = (sessao.pool ?? POOL_TEMPORADA).map(id => MAPAS.find(m => m.id === id)).filter(Boolean)
  const bans = sessao.bans ?? []
  const baseUrl = window.location.origin

  const linkA = `${baseUrl}/campeonatos/${campeonatoId}/map-pick?sessao=${sessaoId}&time=A`
  const linkB = `${baseUrl}/campeonatos/${campeonatoId}/map-pick?sessao=${sessaoId}&time=B`

  function copiar(url) {
    navigator.clipboard.writeText(url)
  }

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: sessao.timeA?.cor ?? 'var(--blue)' }}>
          {sessao.timeA?.nome ?? 'Time A'}
        </span>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>vs</span>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: sessao.timeB?.cor ?? 'var(--red)' }}>
          {sessao.timeB?.nome ?? 'Time B'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: fase.cor, background: fase.cor + '18', border: `1px solid ${fase.cor}44`, borderRadius: 4, padding: '2px 8px' }}>
          {fase.txt}
        </span>
      </div>

      {/* Links */}
      {['A', 'B'].map(t => {
        const url = t === 'A' ? linkA : linkB
        const time = t === 'A' ? sessao.timeA : sessao.timeB
        return (
          <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", minWidth: 70 }}>
              {time?.nome ?? `Time ${t}`}
            </span>
            <code style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'var(--text2)', wordBreak: 'break-all' }}>
              {url}
            </code>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => copiar(url)}>⎘ Copiar</button>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap', borderColor: 'var(--blue)', color: 'var(--blue)' }} onClick={() => window.open(url, '_blank')}>↗</button>
          </div>
        )
      })}

      {/* Resumo do progresso */}
      {sessao.vencedor && (
        <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: 8, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {sessao.resultado && (
            <span>🪙 {sessao.resultado === 'cara' ? 'Cara' : 'Coroa'} → venceu <strong style={{ color: sessao.vencedor === 'A' ? sessao.timeA?.cor : sessao.timeB?.cor }}>
              {sessao.vencedor === 'A' ? sessao.timeA?.nome : sessao.timeB?.nome}
            </strong></span>
          )}
          {sessao.preferencia && (
            <span>· escolheu <strong>{sessao.preferencia === 'mapa' ? '🗺 Mapa' : '⚡ First Pick'}</strong></span>
          )}
          {sessao.mapaEscolhido && (
            <span>· mapa: <strong style={{ color: 'var(--gold2)' }}>{MAPAS.find(m => m.id === sessao.mapaEscolhido)?.nome ?? sessao.mapaEscolhido}</strong></span>
          )}
          {sessao.firstPickTime && (
            <span>· first pick: <strong style={{ color: sessao.firstPickTime === 'A' ? sessao.timeA?.cor : sessao.timeB?.cor }}>
              {sessao.firstPickTime === 'A' ? sessao.timeA?.nome : sessao.timeB?.nome}
            </strong></span>
          )}
        </div>
      )}

      {/* Mini mapa ban grid */}
      {bans.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {pool.map(m => {
            const banIdx = bans.indexOf(m.id)
            const banido = banIdx !== -1
            const isEscolhido = m.id === sessao.mapaEscolhido
            return (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                borderRadius: 4, fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif",
                background: isEscolhido ? 'rgba(201,168,76,0.15)' : banido ? 'rgba(224,85,85,0.1)' : 'var(--bg2)',
                border: `1px solid ${isEscolhido ? 'var(--gold)' : banido ? 'rgba(224,85,85,0.4)' : 'var(--border)'}`,
                color: isEscolhido ? 'var(--gold2)' : banido ? 'var(--red)' : 'var(--text3)',
              }}>
                {isEscolhido ? '✓' : banido ? `✕${banIdx + 1}` : ''} {m.nome}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapPickAdmin() {
  const { campeonatoId } = useCampeonato()
  const [sessoes, setSessoes] = useState({})
  const [sessaoSel, setSessaoSel] = useState(null)
  const [mostraCriar, setMostraCriar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState(null)

  const [form, setForm] = useState({
    nomeA: '', corA: CORES_PADRAO[0],
    nomeB: '', corB: CORES_PADRAO[1],
    escolhedor: 'A',
    pool: [...POOL_TEMPORADA],
  })

  useEffect(() => {
    if (!campeonatoId) return
    return onValue(ref(db, mapPickPath(campeonatoId)), snap => {
      setSessoes(snap.val() ?? {})
    })
  }, [campeonatoId])

  function flash(texto, tipo = 'ok') {
    setMsg({ texto, tipo })
    setTimeout(() => setMsg(null), 3500)
  }

  async function handleCriar() {
    if (!form.nomeA.trim() || !form.nomeB.trim()) return flash('Informe os nomes dos dois times.', 'err')
    if (form.pool.length < 5) return flash('Selecione pelo menos 5 mapas no pool.', 'err')
    setSalvando(true)
    try {
      const id = gerarId()
      await set(ref(db, `${mapPickPath(campeonatoId)}/${id}`), {
        criadoEm: Date.now(),
        pool: form.pool,
        escolhedor: form.escolhedor,
        timeA: { nome: form.nomeA.trim(), cor: form.corA },
        timeB: { nome: form.nomeB.trim(), cor: form.corB },
      })
      setSessaoSel(id)
      setMostraCriar(false)
      flash(`Sessão criada!`)
    } catch (e) {
      flash(e.message, 'err')
    } finally {
      setSalvando(false)
    }
  }

  function toggleMapa(id) {
    setForm(f => ({
      ...f,
      pool: f.pool.includes(id) ? f.pool.filter(x => x !== id) : [...f.pool, id],
    }))
  }

  const sessaoIds = Object.keys(sessoes).sort((a, b) => (sessoes[b]?.criadoEm ?? 0) - (sessoes[a]?.criadoEm ?? 0))
  const sessaoAtual = sessaoSel ? sessoes[sessaoSel] : null

  return (
    <main className="page">
      <h1 className="page-title">Pick de Mapas</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
        Crie uma sessão de escolha de mapas para um confronto. Compartilhe os links com os capitães.
      </p>

      {msg && (
        <div style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16,
          background: msg.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
          border: `1px solid ${msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>
          {msg.texto}
        </div>
      )}

      {/* Seletor de sessão + botão criar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={sessaoSel ?? ''} onChange={e => { setSessaoSel(e.target.value || null); setMostraCriar(false) }}
          style={{ ...inputStyle, width: 'auto', minWidth: 200 }}>
          <option value="">— selecionar sessão —</option>
          {sessaoIds.map(id => {
            const s = sessoes[id]
            return <option key={id} value={id}>{s?.timeA?.nome ?? 'A'} vs {s?.timeB?.nome ?? 'B'} · {new Date(s?.criadoEm ?? 0).toLocaleDateString('pt-BR')}</option>
          })}
        </select>
        <button className="btn" style={{ fontSize: 13, padding: '7px 16px', borderColor: 'var(--blue)', color: 'var(--blue)', whiteSpace: 'nowrap' }}
          onClick={() => { setMostraCriar(v => !v); setSessaoSel(null) }}>
          {mostraCriar ? '✕ Cancelar' : '+ Nova sessão'}
        </button>
      </div>

      {/* Formulário nova sessão */}
      {mostraCriar && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, padding: 20, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Nova Sessão</div>

          {/* Times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {['A', 'B'].map(t => (
              <div key={t}>
                <label style={labelStyle}>Time {t}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder={t === 'A' ? 'Nome do Time A' : 'Nome do Time B'}
                    value={t === 'A' ? form.nomeA : form.nomeB}
                    onChange={e => setForm(f => t === 'A' ? { ...f, nomeA: e.target.value } : { ...f, nomeB: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }} />
                  <input type="color"
                    value={t === 'A' ? form.corA : form.corB}
                    onChange={e => setForm(f => t === 'A' ? { ...f, corA: e.target.value } : { ...f, corB: e.target.value })}
                    style={{ width: 38, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Quem escolhe cara ou coroa */}
          <div>
            <label style={labelStyle}>Quem escolhe cara ou coroa</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['A', 'B'].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, escolhedor: t }))} style={{
                  padding: '7px 20px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13,
                  border: `1px solid ${form.escolhedor === t ? (t === 'A' ? form.corA : form.corB) : 'var(--border2)'}`,
                  background: form.escolhedor === t ? (t === 'A' ? form.corA : form.corB) + '22' : 'var(--bg)',
                  color: form.escolhedor === t ? (t === 'A' ? form.corA : form.corB) : 'var(--text2)',
                }}>
                  {t === 'A' ? form.nomeA || 'Time A' : form.nomeB || 'Time B'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 5 }}>
              Este capitão verá os botões "Cara" e "Coroa". O outro aguarda.
            </div>
          </div>

          {/* Pool de mapas */}
          <div>
            <label style={labelStyle}>Pool de Mapas ({form.pool.length} selecionados)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
              {MAPAS.map(m => {
                const sel = form.pool.includes(m.id)
                return (
                  <button key={m.id} onClick={() => toggleMapa(m.id)} style={{
                    padding: 0, borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                    border: `2px solid ${sel ? 'var(--gold)' : 'var(--border)'}`,
                    opacity: sel ? 1 : 0.45,
                  }}>
                    <img src={m.splashUrl} alt={m.nome} style={{ width: '100%', height: 48, objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.style.display = 'none' }} />
                    <div style={{ padding: '4px 6px', fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: sel ? 'var(--gold)' : 'var(--text3)', background: 'var(--bg3)', textAlign: 'center' }}>
                      {m.nome}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <button className="btn primary" onClick={handleCriar} disabled={salvando}
            style={{ fontSize: 13, padding: '9px 24px', alignSelf: 'flex-start' }}>
            {salvando ? 'Criando...' : 'Criar sessão'}
          </button>
        </div>
      )}

      {/* Sessão selecionada */}
      {sessaoAtual && sessaoSel && (
        <SessaoView sessao={sessaoAtual} sessaoId={sessaoSel} campeonatoId={campeonatoId} />
      )}

      {!mostraCriar && !sessaoAtual && sessaoIds.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhuma sessão criada. Clique em <strong>+ Nova sessão</strong> para começar.</p>
      )}
    </main>
  )
}
