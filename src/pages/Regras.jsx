import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { regrasPath } from '../utils/campeonatoPaths'
import { REGRAS } from '../data/regras'
import { useTranslation } from 'react-i18next'
import './Regras.css'

// Fallback: converte regras estáticas para formato de abas
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

  const [topicosDB, setTopicosDB] = useState(null)  // null = carregando, {} = vazio
  const [abaAtiva,  setAbaAtiva]  = useState(null)

  useEffect(() => {
    if (!idPublico) return
    return onValue(ref(db, regrasPath(idPublico)), snap => {
      setTopicosDB(snap.val() ?? {})
    })
  }, [idPublico])

  // Decide a fonte: Firebase (se tiver dados) ou estático (fallback)
  const topicos = topicosDB && Object.keys(topicosDB).length > 0
    ? Object.entries(topicosDB)
        .sort(([, a], [, b]) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map(([id, t]) => ({ id, titulo: t.titulo, conteudo: t.conteudo ?? '' }))
    : topicosDB !== null
      ? regrasEstaticasComoAbas(lang)
      : []

  // Inicializa aba ativa na primeira aba disponível
  useEffect(() => {
    if (topicos.length > 0 && !abaAtiva) setAbaAtiva(topicos[0].id)
  }, [topicos.length]) // eslint-disable-line

  const abaAtual = topicos.find(t => t.id === abaAtiva) ?? topicos[0]

  if (topicosDB === null) {
    return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>
  }

  return (
    <main className="regras-root page">
      <h1 className="page-title">{{ pt: 'Regras do Campeonato', en: 'Tournament Rules', es: 'Reglas del Campeonato' }[lang] ?? 'Regras do Campeonato'}</h1>
      <p className="page-subtitle">Copa Inhouse · Heroes of the Storm</p>

      {topicos.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 14, marginTop: 16 }}>Nenhuma regra publicada ainda.</p>
      )}

      {topicos.length > 0 && (
        <>
          {/* Abas de navegação */}
          <div style={{
            display: 'flex', gap: 0, flexWrap: 'wrap',
            borderBottom: '1px solid var(--border)',
            marginBottom: 28, marginTop: 8,
          }}>
            {topicos.map(t => (
              <button
                key={t.id}
                onClick={() => setAbaAtiva(t.id)}
                style={{
                  padding: '10px 20px', border: 'none', cursor: 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: 14, letterSpacing: '0.05em',
                  background: 'transparent',
                  color: abaAtiva === t.id ? 'var(--gold2)' : 'var(--text2)',
                  borderBottom: abaAtiva === t.id ? '2px solid var(--gold)' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'color 0.15s, border-color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.titulo}
              </button>
            ))}
          </div>

          {/* Conteúdo da aba ativa */}
          {abaAtual && (
            <div style={{ maxWidth: 720 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {abaAtual.conteudo.split('\n').filter(linha => linha.trim()).map((linha, i) => {
                  const ehItem = linha.trim().startsWith('-') || linha.trim().startsWith('•')
                  return (
                    <p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: 'var(--text)', fontFamily: "'Barlow', sans-serif" }}>
                      {ehItem
                        ? <><span style={{ color: 'var(--gold)', marginRight: 10, fontWeight: 700 }}>›</span>{linha.replace(/^[-•]\s*/, '')}</>
                        : linha
                      }
                    </p>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
