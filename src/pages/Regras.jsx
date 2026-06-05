import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { regrasPath } from '../utils/campeonatoPaths'
import { REGRAS } from '../data/regras'
import { useTranslation } from 'react-i18next'
import './Regras.css'

function regrasEstaticasComoAbas(lang) {
  return REGRAS.map((s, idx) => ({
    id: s.id,
    titulo: typeof s.titulo === 'object' ? (s.titulo[lang] ?? s.titulo.pt) : s.titulo,
    conteudo: s.tipo === 'lista'
      ? [(s.intro?.[lang] ?? s.intro?.pt ?? ''), ...(s.itens?.[lang] ?? s.itens?.pt ?? [])].filter(Boolean).join('\n')
      : (s.texto?.[lang] ?? s.texto?.pt ?? ''),
    ordem: idx,
  }))
}

export default function Regras() {
  const { idPublico } = useCampeonato()
  const { i18n } = useTranslation()
  const lang = i18n.language?.slice(0, 2) ?? 'pt'

  const [topicosDB, setTopicosDB] = useState(null)
  const [abaAtiva,  setAbaAtiva]  = useState(null)

  useEffect(() => {
    if (!idPublico) return
    return onValue(ref(db, regrasPath(idPublico)), snap => setTopicosDB(snap.val() ?? {}))
  }, [idPublico])

  // Normaliza tópico para formato i18n {pt,es,en}
  function getI18n(v, fallback = '') {
    if (!v) return { value: fallback, isFallback: false }
    if (typeof v === 'string') return { value: v, isFallback: false }
    const val = v[lang]?.trim()
    if (val) return { value: val, isFallback: false }
    return { value: v.pt ?? fallback, isFallback: true }
  }

  const topicos = topicosDB && Object.keys(topicosDB).length > 0
    ? Object.entries(topicosDB)
        .sort(([, a], [, b]) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map(([id, t]) => {
          const titulo   = getI18n(t.titulo)
          const conteudo = getI18n(t.conteudo)
          return { id, titulo: titulo.value, conteudo: conteudo.value, semTraducao: titulo.isFallback || conteudo.isFallback }
        })
    : topicosDB !== null
      ? regrasEstaticasComoAbas(lang)
      : []

  useEffect(() => {
    if (topicos.length > 0 && !abaAtiva) setAbaAtiva(topicos[0].id)
  }, [topicos.length]) // eslint-disable-line

  const abaAtual = topicos.find(t => t.id === abaAtiva) ?? topicos[0]

  if (topicosDB === null) {
    return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>
  }

  return (
    <main className="page" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          {{ pt: 'Regras do Campeonato', en: 'Tournament Rules', es: 'Reglas del Campeonato' }[lang] ?? 'Regras do Campeonato'}
        </h1>
        <p className="page-subtitle" style={{ margin: 0 }}>Copa Inhouse · Heroes of the Storm</p>
      </div>

      {topicos.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 14 }}>Nenhuma regra publicada ainda.</p>
      )}

      {topicos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 0, alignItems: 'start' }}>

          {/* ── Sidebar de navegação ── */}
          <nav style={{
            position: 'sticky', top: 80,
            borderRight: '1px solid var(--border)',
            paddingRight: 0,
            paddingTop: 4,
          }}>
            {topicos.map(t => {
              const ativa = abaAtiva === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setAbaAtiva(t.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 16px', border: 'none', cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: ativa ? 700 : 400,
                    fontSize: 14, letterSpacing: '0.03em',
                    background: ativa ? 'rgba(201,168,76,0.08)' : 'transparent',
                    color: ativa ? 'var(--gold2)' : 'var(--text2)',
                    borderRight: ativa ? '2px solid var(--gold)' : '2px solid transparent',
                    marginRight: -1,
                    transition: 'all 0.15s',
                    borderRadius: '4px 0 0 4px',
                  }}
                >
                  {t.titulo}
                  {t.semTraducao && (
                    <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text3)', verticalAlign: 'middle' }}>PT</span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* ── Conteúdo ── */}
          {abaAtual && (
            <div style={{ padding: '4px 0 32px 36px', minHeight: 300, maxWidth: 700 }}>
              <h2 style={{
                fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 24,
                color: 'var(--gold2)', marginTop: 6, marginBottom: abaAtual.semTraducao ? 10 : 24,
              }}>
                {abaAtual.titulo}
              </h2>
              {abaAtual.semTraducao && (
                <div style={{
                  fontSize: 12, color: 'var(--text3)', fontFamily: "'Barlow', sans-serif",
                  fontStyle: 'italic', marginBottom: 20, padding: '6px 12px',
                  background: 'rgba(255,255,255,0.03)', borderRadius: 4,
                  border: '1px solid var(--border)',
                }}>
                  {{ pt: '', en: 'This section is only available in Portuguese.', es: 'Esta sección solo está disponible en portugués.' }[lang] ?? ''}
                </div>
              )}
              <div
                className="rich-content"
                dangerouslySetInnerHTML={{ __html: abaAtual.conteudo }}
              />
            </div>
          )}

        </div>
      )}
    </main>
  )
}
