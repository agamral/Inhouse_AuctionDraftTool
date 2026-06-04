import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove, push } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { regrasPath } from '../utils/campeonatoPaths'
import { REGRAS } from '../data/regras'
import RichTextEditor from './RichTextEditor'
import '../pages/Regras.css'

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// Converte texto puro com \n em HTML para o TipTap
function textoParaHtml(texto) {
  if (!texto) return ''
  return texto.split('\n')
    .filter(l => l.trim())
    .map(l => {
      if (l.trim().startsWith('-') || l.trim().startsWith('•')) {
        return `<li>${l.replace(/^[-•]\s*/, '')}</li>`
      }
      return `<p>${l}</p>`
    })
    .reduce((acc, cur) => {
      if (cur.startsWith('<li>') && acc.endsWith('</li>')) return acc.slice(0, -5) + '</li>' + cur
      if (cur.startsWith('<li>') && !acc.endsWith('</li>')) return acc + '<ul>' + cur
      if (!cur.startsWith('<li>') && acc.endsWith('</li>')) return acc + '</ul>' + cur
      return acc + cur
    }, '')
    .replace(/<\/li>(?!<li>|<\/ul>)/g, '</li></ul>')
}

// Converte as regras estáticas pra formato editável (fallback de importação)
function converterRegrasEstaticas() {
  return REGRAS.map((s, idx) => ({
    titulo: s.titulo?.pt ?? s.titulo ?? '',
    conteudo: textoParaHtml(
      s.tipo === 'lista'
        ? [(s.intro?.pt ?? ''), ...(s.itens?.pt ?? [])].filter(Boolean).join('\n')
        : (s.texto?.pt ?? '')
    ),
    ordem: idx,
  }))
}

export default function AdminRegrasSection() {
  const { campeonatoId } = useCampeonato()
  const [topicos,    setTopicos]    = useState({})
  const [editando,   setEditando]   = useState(null)  // id do tópico sendo editado
  const [editForm,   setEditForm]   = useState({ titulo: '', conteudo: '' })
  const [criando,    setCriando]    = useState(false)
  const [novoForm,   setNovoForm]   = useState({ titulo: '', conteudo: '' })
  const [feedback,   setFeedback]   = useState(null)
  const [salvando,   setSalvando]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  useEffect(() => {
    if (!campeonatoId) return
    return onValue(ref(db, regrasPath(campeonatoId)), snap => setTopicos(snap.val() ?? {}))
  }, [campeonatoId])

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const topicosArr = Object.entries(topicos)
    .sort(([, a], [, b]) => (a.ordem ?? 0) - (b.ordem ?? 0))

  async function importarPadrao() {
    const padrão = converterRegrasEstaticas()
    const updates = {}
    padrão.forEach((t, i) => {
      const id = push(ref(db, regrasPath(campeonatoId))).key
      updates[`${regrasPath(campeonatoId)}/${id}`] = { ...t, ordem: i }
    })
    await update(ref(db), updates)
    flash('ok', 'Regras padrão importadas com sucesso.')
  }

  async function salvarEdicao() {
    if (!editando || !editForm.titulo.trim()) return
    setSalvando(true)
    try {
      await update(ref(db, `${regrasPath(campeonatoId)}/${editando}`), {
        titulo:   editForm.titulo.trim(),
        conteudo: editForm.conteudo.trim(),
      })
      setEditando(null)
      flash('ok', 'Tópico salvo.')
    } catch (e) { flash('erro', e.message) }
    finally { setSalvando(false) }
  }

  async function criarTopico() {
    if (!novoForm.titulo.trim()) return
    setSalvando(true)
    try {
      const id = push(ref(db, regrasPath(campeonatoId))).key
      const maxOrdem = topicosArr.length > 0
        ? Math.max(...topicosArr.map(([, t]) => t.ordem ?? 0)) + 1
        : 0
      await set(ref(db, `${regrasPath(campeonatoId)}/${id}`), {
        titulo:   novoForm.titulo.trim(),
        conteudo: novoForm.conteudo.trim(),
        ordem:    maxOrdem,
      })
      setNovoForm({ titulo: '', conteudo: '' })
      setCriando(false)
      flash('ok', 'Tópico criado.')
    } catch (e) { flash('erro', e.message) }
    finally { setSalvando(false) }
  }

  async function deletarTopico(id) {
    await remove(ref(db, `${regrasPath(campeonatoId)}/${id}`))
    setConfirmDel(null)
    flash('ok', 'Tópico removido.')
  }

  async function moverTopico(id, direcao) {
    const idx = topicosArr.findIndex(([k]) => k === id)
    const targetIdx = idx + direcao
    if (targetIdx < 0 || targetIdx >= topicosArr.length) return
    const [targetId] = topicosArr[targetIdx]
    const ordemAtual   = topicos[id]?.ordem ?? idx
    const ordemTarget  = topicos[targetId]?.ordem ?? targetIdx
    await update(ref(db), {
      [`${regrasPath(campeonatoId)}/${id}/ordem`]:       ordemTarget,
      [`${regrasPath(campeonatoId)}/${targetId}/ordem`]: ordemAtual,
    })
  }

  return (
    <section className="admin-section" style={{ maxWidth: 900 }}>
      <div className="admin-section-title">Regras do Campeonato</div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {feedback && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13,
            background: feedback.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
            border: `1px solid ${feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
            color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>{feedback.msg}</div>
        )}

        {/* Importar padrão quando vazio */}
        {topicosArr.length === 0 && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
              Nenhum tópico criado ainda. Você pode importar as regras padrão do torneio ou criar do zero.
            </p>
            <button className="btn" style={{ fontSize: 13, padding: '7px 16px', borderColor: 'var(--blue)', color: 'var(--blue)' }}
              onClick={importarPadrao}>
              ↓ Importar regras padrão
            </button>
          </div>
        )}

        {/* Lista de tópicos */}
        {topicosArr.map(([id, t], idx) => (
          <div key={id} style={{
            background: editando === id ? 'var(--bg2)' : 'var(--bg3)',
            border: `1px solid ${editando === id ? 'var(--border2)' : 'var(--border)'}`,
            borderRadius: 8, overflow: 'hidden',
          }}>
            {editando === id ? (
              /* ── Modo edição ── */
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                    Título da aba
                  </label>
                  <input value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                    Conteúdo
                  </label>
                  <RichTextEditor
                    value={editForm.conteudo}
                    onChange={v => setEditForm(f => ({ ...f, conteudo: v }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" style={{ fontSize: 13, padding: '7px 16px' }} onClick={salvarEdicao} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button className="btn" style={{ fontSize: 13, padding: '7px 12px' }} onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              /* ── Modo visualização ── */
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <button className="ap-btn" onClick={() => moverTopico(id, -1)} disabled={idx === 0} title="Subir" style={{ padding: '1px 6px', fontSize: 11 }}>↑</button>
                  <button className="ap-btn" onClick={() => moverTopico(id, 1)} disabled={idx === topicosArr.length - 1} title="Descer" style={{ padding: '1px 6px', fontSize: 11 }}>↓</button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                    {t.titulo}
                  </div>
                  {t.conteudo && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                      {t.conteudo.split('\n')[0]}
                      {t.conteudo.includes('\n') && '…'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="ap-btn" onClick={() => { setEditando(id); setEditForm({ titulo: t.titulo, conteudo: t.conteudo ?? '' }) }}>
                    ✏️ Editar
                  </button>
                  {confirmDel === id ? (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text2)', alignSelf: 'center' }}>Apagar?</span>
                      <button className="btn" style={{ fontSize: 12, padding: '3px 10px', background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} onClick={() => deletarTopico(id)}>Sim</button>
                      <button className="btn" style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => setConfirmDel(null)}>Não</button>
                    </>
                  ) : (
                    <button className="ap-btn ap-btn-discard" onClick={() => setConfirmDel(id)} title="Apagar tópico">✕</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Criar novo tópico */}
        {!criando ? (
          <button className="btn" style={{ fontSize: 13, padding: '8px 16px', alignSelf: 'flex-start', borderColor: 'var(--green)', color: 'var(--green)' }}
            onClick={() => setCriando(true)}>
            + Novo tópico
          </button>
        ) : (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14 }}>Novo tópico</div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Título da aba
              </label>
              <input
                value={novoForm.titulo}
                onChange={e => setNovoForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Regras Gerais, Mapas, Agendamento…"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Conteúdo
              </label>
              <RichTextEditor
                value={novoForm.conteudo}
                onChange={v => setNovoForm(f => ({ ...f, conteudo: v }))}
                minHeight={180}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" style={{ fontSize: 13, padding: '7px 16px' }} onClick={criarTopico} disabled={salvando || !novoForm.titulo.trim()}>
                Criar tópico
              </button>
              <button className="btn" style={{ fontSize: 13, padding: '7px 12px' }} onClick={() => { setCriando(false); setNovoForm({ titulo: '', conteudo: '' }) }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

      </div>
    </section>
  )
}
