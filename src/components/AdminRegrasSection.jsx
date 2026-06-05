import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove, push } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { regrasPath } from '../utils/campeonatoPaths'
import { REGRAS } from '../data/regras'
import RichTextEditor from './RichTextEditor'
import '../pages/Regras.css'

const IDIOMAS = [
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
]

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

function emptyI18n() { return { pt: '', es: '', en: '' } }

// Converte as regras estáticas pra HTML rico (usado na importação)
function converterRegrasEstaticas() {
  const topicos = REGRAS.map((s, idx) => {
    const buildHtml = (lang) => {
      let html = ''
      if (s.tipo === 'intro') {
        html = `<p>${s.texto?.[lang] ?? s.texto?.pt ?? ''}</p>`
      } else if (s.tipo === 'lista') {
        if (s.intro?.[lang] ?? s.intro?.pt) {
          html += `<p><em>${s.intro[lang] ?? s.intro.pt}</em></p>`
        }
        const itens = s.itens?.[lang] ?? s.itens?.pt ?? []
        if (itens.length) {
          html += '<ul>' + itens.map(item => `<li>${item}</li>`).join('') + '</ul>'
        }
      }
      return html
    }

    return {
      titulo:   { pt: s.titulo?.pt ?? s.titulo ?? '', es: s.titulo?.es ?? '', en: s.titulo?.en ?? '' },
      conteudo: { pt: buildHtml('pt'), es: buildHtml('es'), en: buildHtml('en') },
      ordem: idx,
    }
  })

  topicos.push({
    titulo:   { pt: 'Mapas do Campeonato', es: 'Mapas del Campeonato', en: 'Tournament Maps' },
    conteudo: {
      pt: '<p>Os mapas utilizados nesta temporada serão:</p><ul><li>Mapa 1</li><li>Mapa 2</li><li>Mapa 3</li></ul><p><em>A lista será atualizada pela organização antes do início da temporada.</em></p>',
      es: '',
      en: '',
    },
    ordem: topicos.length,
  })

  return topicos
}

// Garante que titulo/conteudo sempre tenham formato {pt,es,en}
function normalizar(t) {
  const norm = (v) => typeof v === 'string' ? { pt: v, es: '', en: '' } : { pt: '', es: '', en: '', ...v }
  return { ...t, titulo: norm(t.titulo), conteudo: norm(t.conteudo) }
}

function LangTabs({ ativo, onChange, topico }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
      {IDIOMAS.map(({ code, label }) => {
        const temConteudo = topico?.conteudo?.[code]?.trim() || topico?.titulo?.[code]?.trim()
        const ativado = ativo === code
        return (
          <button
            key={code}
            onClick={() => onChange(code)}
            style={{
              padding: '4px 14px', fontSize: 12, fontWeight: 700,
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em',
              border: `1px solid ${ativado ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: 4, cursor: 'pointer',
              background: ativado ? 'rgba(201,168,76,0.13)' : 'var(--bg)',
              color: ativado ? 'var(--gold2)' : temConteudo ? 'var(--text2)' : 'var(--text3)',
              position: 'relative',
            }}
          >
            {label}
            {!temConteudo && code !== 'pt' && (
              <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text3)' }}>●</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function AdminRegrasSection() {
  const { campeonatoId } = useCampeonato()
  const [topicos,    setTopicos]    = useState({})
  const [editando,   setEditando]   = useState(null)
  const [editForm,   setEditForm]   = useState({ titulo: emptyI18n(), conteudo: emptyI18n() })
  const [editLang,   setEditLang]   = useState('pt')
  const [criando,    setCriando]    = useState(false)
  const [novoForm,   setNovoForm]   = useState({ titulo: emptyI18n(), conteudo: emptyI18n() })
  const [novoLang,   setNovoLang]   = useState('pt')
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
    if (!editando || !editForm.titulo.pt.trim()) return
    setSalvando(true)
    try {
      await update(ref(db, `${regrasPath(campeonatoId)}/${editando}`), {
        titulo:   editForm.titulo,
        conteudo: editForm.conteudo,
      })
      setEditando(null)
      flash('ok', 'Tópico salvo.')
    } catch (e) { flash('erro', e.message) }
    finally { setSalvando(false) }
  }

  async function criarTopico() {
    if (!novoForm.titulo.pt.trim()) return
    setSalvando(true)
    try {
      const id = push(ref(db, regrasPath(campeonatoId))).key
      const maxOrdem = topicosArr.length > 0
        ? Math.max(...topicosArr.map(([, t]) => t.ordem ?? 0)) + 1
        : 0
      await set(ref(db, `${regrasPath(campeonatoId)}/${id}`), {
        titulo:   novoForm.titulo,
        conteudo: novoForm.conteudo,
        ordem:    maxOrdem,
      })
      setNovoForm({ titulo: emptyI18n(), conteudo: emptyI18n() })
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
        {topicosArr.map(([id, t], idx) => {
          const tn = normalizar(t)
          return (
          <div key={id} style={{
            background: editando === id ? 'var(--bg2)' : 'var(--bg3)',
            border: `1px solid ${editando === id ? 'var(--border2)' : 'var(--border)'}`,
            borderRadius: 8, overflow: 'hidden',
          }}>
            {editando === id ? (
              /* ── Modo edição ── */
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <LangTabs ativo={editLang} onChange={setEditLang} topico={editForm} />
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                    Título da aba {editLang !== 'pt' && <span style={{ color: 'var(--text3)', fontWeight: 400, textTransform: 'none' }}>(PT é obrigatório)</span>}
                  </label>
                  <input
                    value={editForm.titulo[editLang] ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, titulo: { ...f.titulo, [editLang]: e.target.value } }))}
                    style={inputStyle}
                    placeholder={editLang !== 'pt' ? `Tradução em ${editLang.toUpperCase()} (opcional)` : ''}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                    Conteúdo
                  </label>
                  <RichTextEditor
                    key={`edit-${editLang}`}
                    value={editForm.conteudo[editLang] ?? ''}
                    onChange={v => setEditForm(f => ({ ...f, conteudo: { ...f.conteudo, [editLang]: v } }))}
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
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tn.titulo.pt || '(sem título)'}
                    <span style={{ display: 'flex', gap: 3 }}>
                      {IDIOMAS.filter(l => l.code !== 'pt').map(({ code, label }) => (
                        <span key={code} style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                          fontFamily: "'Barlow Condensed', sans-serif",
                          background: tn.titulo[code]?.trim() ? 'rgba(76,175,125,0.15)' : 'rgba(255,255,255,0.04)',
                          color: tn.titulo[code]?.trim() ? 'var(--green)' : 'var(--text3)',
                          border: `1px solid ${tn.titulo[code]?.trim() ? 'rgba(76,175,125,0.3)' : 'var(--border)'}`,
                        }}>{label}</span>
                      ))}
                    </span>
                  </div>
                  {tn.conteudo.pt && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                      {tn.conteudo.pt.replace(/<[^>]+>/g, ' ').trim().slice(0, 80)}…
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="ap-btn" onClick={() => { setEditando(id); setEditLang('pt'); setEditForm({ titulo: { ...emptyI18n(), ...tn.titulo }, conteudo: { ...emptyI18n(), ...tn.conteudo } }) }}>
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
          )
        })}

        {/* Criar novo tópico */}
        {!criando ? (
          <button className="btn" style={{ fontSize: 13, padding: '8px 16px', alignSelf: 'flex-start', borderColor: 'var(--green)', color: 'var(--green)' }}
            onClick={() => { setCriando(true); setNovoLang('pt') }}>
            + Novo tópico
          </button>
        ) : (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14 }}>Novo tópico</div>
            <LangTabs ativo={novoLang} onChange={setNovoLang} topico={novoForm} />
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Título da aba
              </label>
              <input
                value={novoForm.titulo[novoLang] ?? ''}
                onChange={e => setNovoForm(f => ({ ...f, titulo: { ...f.titulo, [novoLang]: e.target.value } }))}
                placeholder={novoLang === 'pt' ? 'Ex: Regras Gerais, Mapas, Agendamento…' : `Tradução em ${novoLang.toUpperCase()} (opcional)`}
                style={inputStyle}
                autoFocus={novoLang === 'pt'}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Conteúdo
              </label>
              <RichTextEditor
                key={`novo-${novoLang}`}
                value={novoForm.conteudo[novoLang] ?? ''}
                onChange={v => setNovoForm(f => ({ ...f, conteudo: { ...f.conteudo, [novoLang]: v } }))}
                minHeight={180}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" style={{ fontSize: 13, padding: '7px 16px' }} onClick={criarTopico} disabled={salvando || !novoForm.titulo.pt.trim()}>
                Criar tópico
              </button>
              <button className="btn" style={{ fontSize: 13, padding: '7px 12px' }} onClick={() => { setCriando(false); setNovoForm({ titulo: emptyI18n(), conteudo: emptyI18n() }) }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

      </div>
    </section>
  )
}
