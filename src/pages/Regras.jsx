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

  const topicos = topicosDB && Object.keys(topicosDB).length > 0
    ? Object.entries(topicosDB)
        .sort(([, a], [, b]) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map(([id, t]) => ({ id, titulo: t.titulo, conteudo: t.conteudo ?? '' }))
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
                </button>
              )
            })}
          </nav>

          {/* ── Conteúdo ── */}
          {abaAtual && (
            <div style={{ padding: '4px 0 32px 36px', minHeight: 300 }}>
              <h2 style={{
                fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 24,
                color: 'var(--gold2)', marginTop: 6, marginBottom: 24,
              }}>
                {abaAtual.titulo}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 680 }}>
                {abaAtual.conteudo.split('\n').filter(l => l.trim()).map((linha, i) => {
                  const ehItem = linha.trim().startsWith('-') || linha.trim().startsWith('•')
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}>
                      {ehItem && (
                        <span style={{
                          color: 'var(--gold)', fontWeight: 700, fontSize: 16,
                          flexShrink: 0, marginTop: 1, lineHeight: 1.6,
                        }}>›</span>
                      )}
                      <p style={{
                        margin: 0, fontSize: 15, lineHeight: 1.75,
                        color: ehItem ? 'var(--text)' : 'var(--text)',
                        fontFamily: "'Barlow', sans-serif",
                        fontWeight: ehItem ? 400 : 400,
                      }}>
                        {ehItem ? linha.replace(/^[-•]\s*/, '') : linha}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </main>
  )
}
