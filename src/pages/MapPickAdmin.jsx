import { useState, useEffect } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { mapPickPath, teamPath } from '../utils/campeonatoPaths'
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
const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

// ── Derivar fase da sessão ────────────────────────────────────────────────────

function getFase(s) {
  if (!s) return 'loading'
  if (s.encerrada)                          return 'encerrado'
  if (!s.resultado)                         return 'coin'
  if (!s.preferencia)                       return 'escolhendo'
  if ((s.bans ?? []).length < 4)            return 'banindo'
  if (!s.mapaEscolhido)                    return 'escolhendo_mapa'
  if (!s.perdedorProxima)                  return 'partida_pronta'
  if (!s.proximaPreferencia)               return 'proxima_escolhendo'
  if (!s.proximaMapa)                      return 'proxima_escolhendo_mapa'
  return 'proxima_pronta'
}

function faseLabel(s) {
  const fase = getFase(s)
  const map = {
    encerrado:              { txt: 'Encerrado',              cor: 'var(--text3)' },
    coin:                   { txt: 'Cara ou coroa',          cor: 'var(--blue)'  },
    escolhendo:             { txt: 'Escolhendo prioridade',  cor: 'var(--gold)'  },
    banindo:                { txt: `Banindo (${(s?.bans ?? []).length}/4)`, cor: 'var(--red)' },
    escolhendo_mapa:        { txt: 'Escolhendo mapa',        cor: 'var(--purple)'},
    partida_pronta:         { txt: 'Partida pronta',         cor: 'var(--green)' },
    proxima_escolhendo:     { txt: 'Próxima — escolhendo',   cor: 'var(--gold)'  },
    proxima_escolhendo_mapa:{ txt: 'Próxima — mapa',         cor: 'var(--purple)'},
    proxima_pronta:         { txt: 'Próxima pronta',         cor: 'var(--green)' },
  }
  return map[fase] ?? { txt: fase, cor: 'var(--text2)' }
}

// ── Vista compacta de uma sessão ──────────────────────────────────────────────

function SessaoView({ sessao, sessaoId, campeonatoId }) {
  const fase = getFase(sessao)
  const fl = faseLabel(sessao)
  const pool = (sessao.pool ?? POOL_TEMPORADA).map(id => MAPAS.find(m => m.id === id)).filter(Boolean)
  const bans = sessao.bans ?? []
  const jogosJogados = sessao.jogosJogados ?? []
  const baseUrl = window.location.origin
  const nomeA = sessao.timeA?.nome ?? 'Time A'
  const nomeB = sessao.timeB?.nome ?? 'Time B'
  const corA  = sessao.timeA?.cor ?? 'var(--blue)'
  const corB  = sessao.timeB?.cor ?? 'var(--red)'

  const linkA = `${baseUrl}/campeonatos/${campeonatoId}/map-pick?sessao=${sessaoId}&time=A`
  const linkB = `${baseUrl}/campeonatos/${campeonatoId}/map-pick?sessao=${sessaoId}&time=B`

  async function iniciarProxima(perdedor) {
    // Move mapa atual para jogosJogados e configura próxima partida
    const mapaJogado = fase === 'proxima_pronta' ? sessao.proximaMapa : sessao.mapaEscolhido
    const novosJogados = [...jogosJogados, mapaJogado]
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), {
      jogosJogados:       novosJogados,
      perdedorProxima:    perdedor,
      proximaPreferencia: null,
      proximaMapTime:     null,
      proximaFirstPickTime: null,
      proximaMapa:        null,
    })
  }

  async function encerrar() {
    await update(ref(db, `${mapPickPath(campeonatoId)}/${sessaoId}`), { encerrada: true })
  }

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: corA }}>{nomeA}</span>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>vs</span>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: corB }}>{nomeB}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: fl.cor, background: fl.cor + '18', border: `1px solid ${fl.cor}44`, borderRadius: 4, padding: '2px 8px' }}>
          {fl.txt}
        </span>
      </div>

      {/* Links */}
      {['A', 'B'].map(t => {
        const url = t === 'A' ? linkA : linkB
        const nome = t === 'A' ? nomeA : nomeB
        return (
          <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", minWidth: 70 }}>{nome}</span>
            <code style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'var(--text2)', wordBreak: 'break-all' }}>{url}</code>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => navigator.clipboard.writeText(url)}>⎘</button>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap', borderColor: 'var(--blue)', color: 'var(--blue)' }} onClick={() => window.open(url, '_blank')}>↗</button>
          </div>
        )
      })}

      {/* Progresso textual */}
      {sessao.vencedor && (
        <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: 8, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {sessao.resultado && <span>🪙 {sessao.resultado === 'cara' ? 'Cara' : 'Coroa'} → <strong style={{ color: sessao.vencedor === 'A' ? corA : corB }}>{sessao.vencedor === 'A' ? nomeA : nomeB}</strong></span>}
          {sessao.preferencia && <span>· <strong>{sessao.preferencia === 'mapa' ? '🗺 Mapa' : '⚡ First Pick'}</strong></span>}
          {sessao.firstPickTime && <span>· FP: <strong style={{ color: sessao.firstPickTime === 'A' ? corA : corB }}>{sessao.firstPickTime === 'A' ? nomeA : nomeB}</strong></span>}
        </div>
      )}

      {/* Histórico de partidas */}
      {jogosJogados.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)' }}>Jogados:</span>
          {jogosJogados.map((id, i) => {
            const m = MAPAS.find(x => x.id === id)
            return <span key={i} style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>⚔ {m?.nome ?? id}</span>
          })}
        </div>
      )}

      {/* Mini mapa grid */}
      {(bans.length > 0 || sessao.mapaEscolhido || sessao.proximaMapa) && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {pool.map(m => {
            const banIdx = bans.indexOf(m.id)
            const banido = banIdx !== -1
            const jogado = jogosJogados.includes(m.id)
            const isAtual = m.id === sessao.mapaEscolhido && !jogado
            const isProxima = m.id === sessao.proximaMapa
            return (
              <div key={m.id} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10,
                fontFamily: "'Barlow Condensed', sans-serif",
                background: isAtual || isProxima ? 'rgba(76,175,125,0.12)' : banido ? 'rgba(224,85,85,0.08)' : jogado ? 'rgba(201,168,76,0.08)' : 'var(--bg2)',
                border: `1px solid ${isAtual || isProxima ? 'var(--green)' : banido ? 'rgba(224,85,85,0.4)' : jogado ? 'rgba(201,168,76,0.3)' : 'var(--border)'}`,
                color: isAtual || isProxima ? 'var(--green)' : banido ? 'var(--red)' : jogado ? 'var(--gold)' : 'var(--text3)',
              }}>
                {isAtual ? '✓' : isProxima ? '▶' : banido ? `✕${banIdx + 1}` : jogado ? '⚔' : ''} {m.nome}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Ações admin por fase ─────────────────────────────────────────── */}

      {/* Partida pronta: admin registra quem perdeu para iniciar próxima */}
      {(fase === 'partida_pronta' || fase === 'proxima_pronta') && !sessao.encerrada && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text2)' }}>
            {fase === 'proxima_pronta'
              ? `Próximo mapa: ${MAPAS.find(m => m.id === sessao.proximaMapa)?.nome ?? ''} · FP: ${sessao.proximaFirstPickTime === 'A' ? nomeA : nomeB}`
              : `Mapa: ${MAPAS.find(m => m.id === sessao.mapaEscolhido)?.nome ?? ''} · FP: ${sessao.firstPickTime === 'A' ? nomeA : nomeB}`
            }
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            Quem perdeu esta partida?
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" style={{ fontSize: 12, padding: '6px 14px', borderColor: corA, color: corA }} onClick={() => iniciarProxima('A')}>
              {nomeA} perdeu → próxima partida
            </button>
            <button className="btn" style={{ fontSize: 12, padding: '6px 14px', borderColor: corB, color: corB }} onClick={() => iniciarProxima('B')}>
              {nomeB} perdeu → próxima partida
            </button>
            <button className="btn" style={{ fontSize: 12, padding: '6px 12px', marginLeft: 'auto', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)' }} onClick={encerrar}>
              Encerrar série
            </button>
          </div>
        </div>
      )}

      {/* Proxima: mostra quem está escolhendo */}
      {(fase === 'proxima_escolhendo' || fase === 'proxima_escolhendo_mapa') && (
        <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif', color: 'var(--gold2)'" }}>
          ⚡ {sessao.perdedorProxima === 'A' ? nomeA : nomeB} está escolhendo para a próxima partida
          {sessao.proximaPreferencia && <span> · {sessao.proximaPreferencia === 'mapa' ? '🗺 Mapa' : '⚡ First Pick'}</span>}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapPickAdmin() {
  const { campeonatoId } = useCampeonato()
  const [sessoes, setSessoes] = useState({})
  const [times, setTimes]     = useState({})
  const [sessaoSel, setSessaoSel] = useState(null)
  const [mostraCriar, setMostraCriar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState(null)

  const [form, setForm] = useState({
    modoTimes: 'campeonato',
    nomeA: '', corA: CORES_PADRAO[0], timeAId: '',
    nomeB: '', corB: CORES_PADRAO[1], timeBId: '',
    escolhedor: 'A',
    pool: [...POOL_TEMPORADA],
  })

  useEffect(() => {
    if (!campeonatoId) return
    return onValue(ref(db, mapPickPath(campeonatoId)), snap => setSessoes(snap.val() ?? {}))
  }, [campeonatoId])

  useEffect(() => {
    if (!campeonatoId) return
    return onValue(ref(db, teamPath(campeonatoId)), snap => setTimes(snap.val() ?? {}))
  }, [campeonatoId])

  function flash(texto, tipo = 'ok') {
    setMsg({ texto, tipo })
    setTimeout(() => setMsg(null), 3500)
  }

  async function handleCriar() {
    let nomeA = form.nomeA.trim(), corA = form.corA
    let nomeB = form.nomeB.trim(), corB = form.corB

    if (form.modoTimes === 'campeonato') {
      const tA = times[form.timeAId]
      const tB = times[form.timeBId]
      if (!tA) return flash('Selecione o Time A.', 'err')
      if (!tB) return flash('Selecione o Time B.', 'err')
      if (form.timeAId === form.timeBId) return flash('Os times precisam ser diferentes.', 'err')
      nomeA = tA.nome; corA = tA.cor || CORES_PADRAO[0]
      nomeB = tB.nome; corB = tB.cor || CORES_PADRAO[1]
    } else {
      if (!nomeA || !nomeB) return flash('Informe os nomes dos dois times.', 'err')
    }

    if (form.pool.length < 5) return flash('Selecione pelo menos 5 mapas no pool.', 'err')

    setSalvando(true)
    try {
      const id = gerarId()
      await set(ref(db, `${mapPickPath(campeonatoId)}/${id}`), {
        criadoEm: Date.now(),
        pool: form.pool,
        escolhedor: form.escolhedor,
        timeA: { nome: nomeA, cor: corA },
        timeB: { nome: nomeB, cor: corB },
      })
      setSessaoSel(id)
      setMostraCriar(false)
      flash('Sessão criada!')
    } catch (e) {
      flash(e.message, 'err')
    } finally {
      setSalvando(false)
    }
  }

  function toggleMapa(id) {
    setForm(f => ({ ...f, pool: f.pool.includes(id) ? f.pool.filter(x => x !== id) : [...f.pool, id] }))
  }

  const timesArr = Object.entries(times).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const sessaoIds = Object.keys(sessoes).sort((a, b) => (sessoes[b]?.criadoEm ?? 0) - (sessoes[a]?.criadoEm ?? 0))
  const sessaoAtual = sessaoSel ? sessoes[sessaoSel] : null

  // Preview dos times selecionados no modo campeonato
  const previewA = form.modoTimes === 'campeonato' ? times[form.timeAId] : null
  const previewB = form.modoTimes === 'campeonato' ? times[form.timeBId] : null

  return (
    <main className="page">
      <h1 className="page-title">Pick de Mapas</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
        Crie uma sessão de escolha de mapas. Compartilhe os links com os capitães.
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

      {/* Seletor + botão criar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={sessaoSel ?? ''} onChange={e => { setSessaoSel(e.target.value || null); setMostraCriar(false) }}
          style={{ ...inputStyle, width: 'auto', minWidth: 220 }}>
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

          {/* Toggle modo times */}
          <div>
            <label style={labelStyle}>Times</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[['campeonato', 'Usar times do campeonato'], ['manual', 'Digitar nomes']].map(([v, l]) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, modoTimes: v }))} style={{
                  padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12,
                  border: `1px solid ${form.modoTimes === v ? 'var(--blue)' : 'var(--border2)'}`,
                  background: form.modoTimes === v ? 'rgba(74,158,218,0.12)' : 'var(--bg)',
                  color: form.modoTimes === v ? 'var(--blue)' : 'var(--text2)',
                }}>
                  {l}
                </button>
              ))}
            </div>

            {form.modoTimes === 'campeonato' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['A', 'timeAId', previewA], ['B', 'timeBId', previewB]].map(([t, key, preview]) => (
                  <div key={t}>
                    <label style={labelStyle}>Time {t}</label>
                    <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ ...selectStyle, color: preview ? preview.cor : 'var(--text2)', borderColor: preview ? preview.cor + '66' : 'var(--border2)' }}>
                      <option value="">— selecionar —</option>
                      {timesArr.map(([id, tm]) => <option key={id} value={id}>{tm.nome}</option>)}
                    </select>
                    {preview && (
                      <div style={{ fontSize: 11, color: preview.cor, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>
                        ● {preview.nome}
                      </div>
                    )}
                    {timesArr.length === 0 && (
                      <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Nenhum time cadastrado.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['A', 'nomeA', 'corA'], ['B', 'nomeB', 'corB']].map(([t, nKey, cKey]) => (
                  <div key={t}>
                    <label style={labelStyle}>Time {t}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder={`Nome do Time ${t}`} value={form[nKey]}
                        onChange={e => setForm(f => ({ ...f, [nKey]: e.target.value }))}
                        style={{ ...inputStyle, flex: 1 }} />
                      <input type="color" value={form[cKey]}
                        onChange={e => setForm(f => ({ ...f, [cKey]: e.target.value }))}
                        style={{ width: 38, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quem escolhe cara ou coroa */}
          <div>
            <label style={labelStyle}>Quem escolhe cara ou coroa</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['A', 'B'].map(t => {
                const preview = form.modoTimes === 'campeonato' ? (t === 'A' ? previewA : previewB) : null
                const nome = preview?.nome ?? (t === 'A' ? form.nomeA || 'Time A' : form.nomeB || 'Time B')
                const cor = preview?.cor ?? (t === 'A' ? form.corA : form.corB)
                return (
                  <button key={t} onClick={() => setForm(f => ({ ...f, escolhedor: t }))} style={{
                    padding: '7px 20px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13,
                    border: `1px solid ${form.escolhedor === t ? cor : 'var(--border2)'}`,
                    background: form.escolhedor === t ? cor + '22' : 'var(--bg)',
                    color: form.escolhedor === t ? cor : 'var(--text2)',
                  }}>
                    {nome}
                  </button>
                )
              })}
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
                    opacity: sel ? 1 : 0.4,
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
