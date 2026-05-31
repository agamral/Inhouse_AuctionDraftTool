import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ref, get, update, remove } from 'firebase/database'
import { db } from '../firebase/database'

const PATHS_LEGADOS = [
  { key: 'players',         label: 'Jogadores inscritos',    path: '/players',          tipo: 'colecao' },
  { key: 'playerOverrides', label: 'Marcações de admin',      path: '/playerOverrides',  tipo: 'colecao' },
  { key: 'teams',           label: 'Times',                   path: '/teams',            tipo: 'colecao' },
  { key: 'rodadas',         label: 'Rodadas',                 path: '/rodadas',          tipo: 'colecao' },
  { key: 'confrontos',      label: 'Confrontos',              path: '/confrontos',       tipo: 'colecao' },
  { key: 'disponibilidade', label: 'Disponibilidade',         path: '/disponibilidade',  tipo: 'colecao' },
  { key: 'heroDraft',       label: 'Sessões de Hero Draft',   path: '/heroDraft',        tipo: 'colecao' },
  { key: 'admins',          label: 'Admins',                  path: '/config/admins',    tipo: 'colecao' },
  { key: 'draftSession',    label: 'Sessão de leilão',        path: '/draftSession',     tipo: 'objeto'  },
  { key: 'modules',         label: 'Config de módulos',       path: '/config/modules',   tipo: 'objeto'  },
  { key: 'draft',           label: 'Config do leilão',        path: '/config/draft',     tipo: 'objeto'  },
  { key: 'conteudo',        label: 'Conteúdo do site',        path: '/config/conteudo',  tipo: 'objeto'  },
  { key: 'botConfig',       label: 'Config do Discord',       path: '/botConfig',        tipo: 'objeto'  },
]

function resumo(key, id, val) {
  if (val === null || val === undefined) return '—'
  if (typeof val !== 'object') return String(val)
  switch (key) {
    case 'players':         return [val.discord, val.elo, val.rolePrimaria].filter(Boolean).join(' · ') || id
    case 'playerOverrides': return `capitão: ${val.capitao ? 'sim' : 'não'}${val.precoBase != null ? ` · preço base: ${val.precoBase}` : ''}`
    case 'teams':           return `${val.emoji ?? ''} ${val.nome ?? id}${val.capitaoNome ? ` · cap: ${val.capitaoNome}` : ''}`.trim()
    case 'rodadas':         return `Rodada ${val.numero ?? id}`
    case 'confrontos':      return `${val.time1Nome ?? '?'} × ${val.time2Nome ?? '?'}${val.data ? ` · ${val.data}` : ''}`
    case 'heroDraft':       return id
    case 'disponibilidade': return id
    case 'admins':          return `${id} = ${JSON.stringify(val)}`
    default:                return id
  }
}

export default function AdminMigracaoSection() {
  const [etapa,    setEtapa]    = useState('analise')
  const [dados,    setDados]    = useState({})
  const [contagens, setContagens] = useState({})
  const [campId,   setCampId]   = useState('season-2')
  const [campNome, setCampNome] = useState('')
  const [campLabel, setCampLabel] = useState('')
  const [log,      setLog]      = useState([])
  const [erro,     setErro]     = useState(null)

  // Inspetor
  const [modalKey,  setModalKey]  = useState(null)   // key sendo inspecionada
  const [excluidos, setExcluidos] = useState({})     // { key: Set<id> }
  const [deletando, setDeletando] = useState(null)   // id em confirmação de delete

  function addLog(msg, tipo = 'ok') {
    setLog(prev => [...prev, { msg, tipo, ts: new Date().toLocaleTimeString('pt-BR') }])
  }

  // ── Análise ────────────────────────────────────────────────────────────────
  async function analisar() {
    setErro(null)
    addLog('Analisando dados existentes...')
    const resultados = {}
    const counts = {}

    for (const { key, path } of PATHS_LEGADOS) {
      try {
        const snap = await get(ref(db, path))
        const val = snap.val()
        resultados[key] = val
        counts[key] = (val && typeof val === 'object') ? Object.keys(val).length
                    : (val !== null && val !== undefined) ? 1
                    : 0
      } catch {
        resultados[key] = null
        counts[key] = 0
      }
    }

    const conteudo = resultados.conteudo ?? {}
    setCampNome(prev => prev || conteudo.cupName || 'Copa Inhouse Season 2')
    setCampLabel(prev => prev || conteudo.labelSeason || 'Season 2 · Heroes of the Storm')

    setDados(resultados)
    setContagens(counts)
    setEtapa('configurar')
    addLog(`Análise concluída. ${Object.values(counts).reduce((a, b) => a + b, 0)} registros encontrados.`)
  }

  // ── Toggles de exclusão ────────────────────────────────────────────────────
  function toggleExcluido(key, id) {
    setExcluidos(prev => {
      const s = new Set(prev[key] ?? [])
      s.has(id) ? s.delete(id) : s.add(id)
      return { ...prev, [key]: s }
    })
  }

  function excluirTodos(key) {
    const val = dados[key]
    if (!val || typeof val !== 'object') return
    setExcluidos(prev => ({ ...prev, [key]: new Set(Object.keys(val)) }))
  }

  function incluirTodos(key) {
    setExcluidos(prev => ({ ...prev, [key]: new Set() }))
  }

  // ── Delete do Firebase ─────────────────────────────────────────────────────
  async function confirmarDelete(key, id) {
    const def = PATHS_LEGADOS.find(p => p.key === key)
    const caminho = def.tipo === 'colecao' ? `${def.path}/${id}` : def.path
    await remove(ref(db, caminho))

    setDados(prev => {
      const copia = { ...prev }
      if (def.tipo === 'colecao' && prev[key] && typeof prev[key] === 'object') {
        const sub = { ...prev[key] }
        delete sub[id]
        copia[key] = Object.keys(sub).length > 0 ? sub : null
      } else {
        copia[key] = null
      }
      return copia
    })
    setContagens(prev => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 1) - 1) }))
    setDeletando(null)
  }

  // ── Execução ───────────────────────────────────────────────────────────────
  async function executar() {
    setEtapa('executando')
    setErro(null)
    const cid = campId.trim()
    if (!cid) { setErro('ID do campeonato obrigatório.'); return }

    try {
      const updates = {}

      addLog('Criando info do campeonato...')
      updates[`/campeonatos/${cid}/info`] = {
        nome:        campNome.trim() || 'Copa Inhouse Season 2',
        labelSeason: campLabel.trim(),
        tipo:        'campeonato',
        status:      'ativo',
        principal:   true,
        criadoEm:    Date.now(),
        migradoEm:   Date.now(),
        migradoDe:   'legacy-flat-paths',
      }

      // Objetos planos — se não excluídos pelo usuário
      const objetos = [
        ['modules',  `/campeonatos/${cid}/config/modules`],
        ['draft',    `/campeonatos/${cid}/config/draft`],
        ['conteudo', `/campeonatos/${cid}/config/conteudo`],
        ['admins',   `/campeonatos/${cid}/admins`],
      ]
      for (const [key, dest] of objetos) {
        if (dados[key] && !(excluidos[key]?.has('__root__'))) {
          updates[dest] = dados[key]
          addLog(`${key} ✓`)
        }
      }
      if (dados.botConfig && typeof dados.botConfig === 'object' && !excluidos.botConfig?.has('__root__')) {
        updates[`/campeonatos/${cid}/config/botCanais`] = dados.botConfig
        addLog('botConfig → botCanais ✓')
      }
      if (dados.draftSession && !excluidos.draftSession?.has('__root__')) {
        updates[`/campeonatos/${cid}/draftSession`] = dados.draftSession
        addLog('draftSession ✓')
      }

      // Coleções — filtradas pelos excluídos individuais
      const colecoes = ['players', 'playerOverrides', 'teams', 'rodadas', 'confrontos', 'disponibilidade', 'heroDraft']
      for (const key of colecoes) {
        const val = dados[key]
        if (!val || typeof val !== 'object') { addLog(`${key} — vazio, pulando`, 'info'); continue }
        const excl = excluidos[key] ?? new Set()
        const filtrado = Object.fromEntries(Object.entries(val).filter(([id]) => !excl.has(id)))
        if (Object.keys(filtrado).length > 0) {
          updates[`/campeonatos/${cid}/${key}`] = filtrado
          addLog(`${key} (${Object.keys(filtrado).length} registros) ✓`)
        } else {
          addLog(`${key} — todos excluídos, pulando`, 'info')
        }
      }

      addLog('Configurando ponteiro /system/campeonatoAtivo...')
      updates[`/system/campeonatoAtivo`] = cid

      addLog('Gravando no Firebase...')
      await update(ref(db), updates)

      addLog(`✓ Migração concluída! /campeonatos/${cid}/`, 'ok')
      addLog('Dados originais mantidos nos caminhos legados.', 'info')
      setEtapa('concluido')
    } catch (e) {
      addLog(`ERRO: ${e.message}`, 'erro')
      setErro(e.message)
      setEtapa('confirmar')
    }
  }

  // ── Dados do modal ─────────────────────────────────────────────────────────
  const modalDef    = modalKey ? PATHS_LEGADOS.find(p => p.key === modalKey) : null
  const modalDados  = modalKey ? dados[modalKey] : null
  const exclModal   = modalKey ? (excluidos[modalKey] ?? new Set()) : new Set()

  // Conta incluídos respeitando exclusões
  function incluidos(key) {
    const def = PATHS_LEGADOS.find(p => p.key === key)
    if (!def || !dados[key]) return 0
    if (def.tipo === 'objeto') return excluidos[key]?.has('__root__') ? 0 : 1
    const excl = excluidos[key] ?? new Set()
    return Math.max(0, (contagens[key] ?? 0) - excl.size)
  }

  const modal = modalKey && modalDef && createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) { setModalKey(null); setDeletando(null) } }}
    >
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, width: '100%', maxWidth: 700, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                  {modalDef.label}
                </div>
                <code style={{ fontSize: 11, color: 'var(--text3)' }}>{modalDef.path}</code>
              </div>
              {modalDef.tipo === 'colecao' && modalDados && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => incluirTodos(modalKey)}>✓ Incluir todos</button>
                  <button className="btn" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }} onClick={() => excluirTodos(modalKey)}>✕ Excluir todos</button>
                </div>
              )}
              <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => { setModalKey(null); setDeletando(null) }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              {!modalDados ? (
                <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Nenhum dado neste caminho.</p>

              ) : modalDef.tipo === 'objeto' ? (
                // Objeto plano — mostra JSON + opção de excluir da migração
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!exclModal.has('__root__')}
                        onChange={() => toggleExcluido(modalKey, '__root__')}
                        style={{ accentColor: 'var(--green)', cursor: 'pointer' }}
                      />
                      Incluir na migração
                    </label>
                  </div>
                  <pre style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg3)', padding: '12px 14px', borderRadius: 6, overflow: 'auto', margin: 0, maxHeight: 380 }}>
                    {JSON.stringify(modalDados, null, 2)}
                  </pre>
                  <div style={{ marginTop: 12 }}>
                    {deletando === '__root__' ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--red)' }}>Deletar <code>{modalDef.path}</code> do Firebase permanentemente?</span>
                        <button className="btn" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }} onClick={() => confirmarDelete(modalKey, '__root__')}>Confirmar</button>
                        <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setDeletando(null)}>Cancelar</button>
                      </div>
                    ) : (
                      <button className="btn" style={{ fontSize: 11, padding: '4px 12px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }} onClick={() => setDeletando('__root__')}>
                        🗑 Deletar do Firebase
                      </button>
                    )}
                  </div>
                </div>

              ) : (
                // Coleção — uma linha por registro
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {Object.entries(modalDados).map(([id, val]) => {
                    const excluido = exclModal.has(id)
                    const confirmando = deletando === id
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 6, background: excluido ? 'rgba(224,85,85,0.05)' : 'var(--bg3)', border: `1px solid ${excluido ? 'rgba(224,85,85,0.2)' : 'var(--border)'}`, opacity: excluido ? 0.55 : 1 }}>
                        <input
                          type="checkbox"
                          checked={!excluido}
                          onChange={() => toggleExcluido(modalKey, id)}
                          style={{ marginTop: 3, cursor: 'pointer', accentColor: 'var(--green)', flexShrink: 0 }}
                          title={excluido ? 'Incluir na migração' : 'Excluir da migração'}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text3)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</div>
                          <div style={{ fontSize: 12, color: excluido ? 'var(--text3)' : 'var(--text2)' }}>
                            {resumo(modalKey, id, val)}
                          </div>
                          {val && typeof val === 'object' && (
                            <details style={{ marginTop: 4 }}>
                              <summary style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', userSelect: 'none' }}>ver detalhes</summary>
                              <pre style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, background: 'var(--bg)', padding: '6px 8px', borderRadius: 4, overflow: 'auto', maxHeight: 200 }}>
                                {JSON.stringify(val, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        {confirmando ? (
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: 'var(--red)' }}>Deletar?</span>
                            <button className="btn" style={{ fontSize: 10, padding: '2px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }} onClick={() => confirmarDelete(modalKey, id)}>Sim</button>
                            <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setDeletando(null)}>Não</button>
                          </div>
                        ) : (
                          <button className="btn" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.25)', flexShrink: 0 }} onClick={() => setDeletando(id)} title="Deletar do Firebase">🗑</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
              {modalDef.tipo === 'colecao' && modalDados && (
                <>
                  <span style={{ color: 'var(--green)' }}>{Object.keys(modalDados).length - exclModal.size} incluídos na migração</span>
                  {exclModal.size > 0 && <span style={{ color: 'var(--red)' }}>{exclModal.size} excluídos</span>}
                  <span style={{ marginLeft: 'auto' }}>✓ checkbox = migrar · 🗑 = deletar do Firebase agora</span>
                </>
              )}
              {modalDef.tipo === 'objeto' && (
                <span style={{ marginLeft: 'auto' }}>✓ checkbox = incluir na migração · 🗑 = deletar do Firebase agora</span>
              )}
            </div>
          </div>
        </div>,
    document.body
  )

  return (
    <>
      {modal}

      {/* ── Seção principal ─────────────────────────────────────────────────── */}
      <div className="admin-section" style={{ border: '1px solid rgba(155,110,232,0.25)', borderRadius: 8 }}>
        <div className="admin-section-title" style={{ color: 'var(--purple)' }}>
          🔄 Migração para nova arquitetura
        </div>

        <div style={{ padding: '0 18px 18px' }}>

          <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)', fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
            ⚠️ Copia dados do formato legado para o namespace
            <code style={{ color: 'var(--gold2)', marginLeft: 4 }}>/campeonatos/{'{id}'}/ </code>.
            Os dados originais <strong>não são deletados</strong>. Execute apenas uma vez.
          </div>

          {/* ── Etapa: Análise ──────────────────────────────────────────────── */}
          {etapa === 'analise' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                Verifique quais dados existem nos caminhos legados antes de migrar.
              </p>
              <button className="btn primary" style={{ fontSize: 13 }} onClick={analisar}>
                Analisar dados existentes
              </button>
            </div>
          )}

          {/* ── Etapa: Configurar ───────────────────────────────────────────── */}
          {etapa === 'configurar' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div>
                  <div className="admin-toggle-label" style={{ marginBottom: 5 }}>ID do campeonato</div>
                  <input value={campId} onChange={e => setCampId(e.target.value.replace(/\s/g, '').toLowerCase())} placeholder="season-2"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: 'monospace', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    Será criado em <code>/campeonatos/{campId || '...'}/</code>
                  </div>
                </div>
                <div>
                  <div className="admin-toggle-label" style={{ marginBottom: 5 }}>Nome do campeonato</div>
                  <input value={campNome} onChange={e => setCampNome(e.target.value)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div className="admin-toggle-label" style={{ marginBottom: 5 }}>Label de temporada</div>
                  <input value={campLabel} onChange={e => setCampLabel(e.target.value)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Lista de caminhos */}
              <style>{`
                .migracao-row { display:flex; align-items:center; gap:10px; width:100%; padding:7px 10px; border-radius:5px; font-size:12px; text-align:left; background:transparent; border:1px solid transparent; color:var(--text3); cursor:default; }
                .migracao-row.tem-dados { background:var(--bg3); border-color:var(--border); color:var(--text2); cursor:pointer; }
                .migracao-row.tem-dados:hover { background:var(--bg); border-color:var(--border2); color:var(--text); }
                .migracao-row.tem-dados:hover .migracao-row-arrow { color:var(--gold2); }
                .migracao-row.tem-dados:hover .migracao-row-label { color:var(--text); }
              `}</style>
              <div style={{ marginBottom: 20 }}>
                <div className="admin-toggle-label" style={{ marginBottom: 8 }}>
                  O que será migrado
                  <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11, marginLeft: 8 }}>— clique para inspecionar</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {PATHS_LEGADOS.map(({ key, label, path, tipo }) => {
                    const total    = contagens[key] ?? 0
                    const temDados = total > 0
                    const isObjeto = tipo === 'objeto'
                    const exclRoot = excluidos[key]?.has('__root__')
                    const inclCount = isObjeto ? null : incluidos(key)
                    const exclCount = isObjeto ? (exclRoot ? 1 : 0) : (excluidos[key]?.size ?? 0)
                    return (
                      <button
                        key={key}
                        className={`migracao-row${temDados ? ' tem-dados' : ''}`}
                        onClick={() => temDados && setModalKey(key)}
                        disabled={!temDados}
                      >
                        <span style={{ width: 14, textAlign: 'center', flexShrink: 0, color: temDados ? (exclCount === 0 ? 'var(--green)' : 'var(--gold)') : 'var(--text3)' }}>
                          {temDados ? (exclCount === 0 ? '✓' : (isObjeto ? '○' : inclCount > 0 ? '◐' : '○')) : '—'}
                        </span>
                        <span className="migracao-row-label" style={{ flex: 1 }}>{label}</span>
                        <code style={{ color: 'var(--text3)', fontSize: 10 }}>{path}</code>
                        <span style={{ minWidth: 70, textAlign: 'right', display: 'flex', gap: 5, justifyContent: 'flex-end', flexShrink: 0 }}>
                          {temDados && isObjeto && exclCount === 0 && <span style={{ color: 'var(--green)' }}>incluído</span>}
                          {temDados && isObjeto && exclCount > 0  && <span style={{ color: 'var(--red)' }}>excluído</span>}
                          {temDados && !isObjeto && (
                            <>
                              <span style={{ color: 'var(--green)' }}>{inclCount}</span>
                              {exclCount > 0 && <span style={{ color: 'var(--red)' }}>−{exclCount}</span>}
                            </>
                          )}
                          {!temDados && <span style={{ color: 'var(--text3)' }}>vazio</span>}
                        </span>
                        {temDados && <span className="migracao-row-arrow" style={{ color: 'var(--text3)', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}>›</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button className="btn primary" style={{ fontSize: 13 }} onClick={() => setEtapa('confirmar')} disabled={!campId.trim()}>
                Próximo →
              </button>
            </div>
          )}

          {/* ── Etapa: Confirmar ────────────────────────────────────────────── */}
          {etapa === 'confirmar' && (
            <div>
              <div style={{ padding: '14px 18px', borderRadius: 7, background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', marginBottom: 20 }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: 'var(--red)', fontSize: 14, marginBottom: 6 }}>
                  Confirmar migração
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                  Será criado <code style={{ color: 'var(--text)' }}>/campeonatos/{campId}/</code> com os dados selecionados.
                  O campeonato será marcado como <strong>principal</strong> automaticamente.
                  <br />Esta operação <strong>não apaga</strong> os dados originais.
                </div>
              </div>
              {erro && (
                <div style={{ padding: '8px 12px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 6, fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>
                  {erro}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" style={{ fontSize: 13 }} onClick={() => setEtapa('configurar')}>← Voltar</button>
                <button className="btn primary" style={{ fontSize: 13, background: 'var(--red)', borderColor: 'var(--red)' }} onClick={executar}>
                  Executar migração
                </button>
              </div>
            </div>
          )}

          {/* ── Etapa: Concluído ─────────────────────────────────────────────── */}
          {etapa === 'concluido' && (
            <div style={{ padding: '12px 14px', background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 7, fontSize: 13, color: 'var(--green)', marginBottom: 16 }}>
              ✓ Migração concluída! Campeonato <strong>{campNome}</strong> criado em{' '}
              <code>/campeonatos/{campId}/</code> e definido como principal.
            </div>
          )}

          {/* Log */}
          {log.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="admin-toggle-label" style={{ marginBottom: 6 }}>Log</div>
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {log.map((entry, i) => (
                  <div key={i} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, display: 'flex', gap: 8, color: entry.tipo === 'erro' ? 'var(--red)' : entry.tipo === 'info' ? 'var(--text3)' : 'var(--green)' }}>
                    <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{entry.ts}</span>
                    {entry.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Firebase Rules */}
          <details style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text2)' }}>
              Firebase Rules necessárias
            </summary>
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
{`"campeonatos": {
  ".read": "auth != null",
  "$cid": {
    "info":            { ".read": true },
    "config/modules":  { ".read": true },
    "config/conteudo": { ".read": true },
    "teams":           { ".read": true },
    "rodadas":         { ".read": true },
    "confrontos":      { ".read": true, ".write": "auth != null" },
    "disponibilidade": { ".read": true, ".write": "auth != null" },
    "heroDraft":       { ".read": true, ".write": "auth != null" },
    "draftSession":    { ".read": true, ".write": true },
    "playerOverrides": { ".read": true, ".write": "root.child('config/admins/'+auth.uid).val()===true||root.child('config/superAdmins/'+auth.uid).val()===true" },
    "players": {
      "$uid": {
        ".read":  "auth.uid==$uid||root.child('config/admins/'+auth.uid).val()===true||root.child('config/superAdmins/'+auth.uid).val()===true",
        ".write": "auth.uid==$uid||root.child('config/admins/'+auth.uid).val()===true||root.child('config/superAdmins/'+auth.uid).val()===true"
      }
    },
    ".write": "root.child('config/admins/'+auth.uid).val()===true||root.child('config/superAdmins/'+auth.uid).val()===true"
  }
},
"system": {
  ".read": true,
  ".write": "root.child('config/superAdmins/'+auth.uid).val()===true"
},
"scrims": {
  "$uid": {
    ".read":  "auth.uid === $uid || root.child('superAdmins/'+auth.uid).val()===true || root.child('config/superAdmins/'+auth.uid).val()===true",
    ".write": "auth.uid === $uid",
    "historico": {
      ".write": "auth != null"
    }
  }
},
"showmatch": {
  ".read": true,
  "sessions": {
    "$sessaoId": {
      ".write": "auth != null"
    }
  }
}`}
            </div>
          </details>

        </div>
      </div>
    </>
  )
}
