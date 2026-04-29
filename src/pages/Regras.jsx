import { useTranslation } from 'react-i18next'
import { REGRAS } from '../data/regras'
import './Regras.css'

export default function Regras() {
  const { i18n } = useTranslation()
  const lang = ['pt', 'en', 'es'].includes(i18n.language) ? i18n.language : 'pt'

  return (
    <main className="regras-root page">
      <h1 className="page-title">
        {{ pt: 'Regras e Formato', en: 'Rules & Format', es: 'Reglas y Formato' }[lang]}
      </h1>
      <p className="page-subtitle">Copa Inhouse · Heroes of the Storm</p>

      <div className="regras-sections">
        {REGRAS.map((s) => (
          <section key={s.id} className={`regras-section${s.tipo === 'intro' ? ' regras-section--intro' : ''}`}>
            <h2 className="regras-section-titulo">{s.titulo[lang]}</h2>

            {s.tipo === 'intro' && (
              <p className="regras-texto">{s.texto[lang]}</p>
            )}

            {s.tipo === 'lista' && (
              <>
                {s.intro && <p className="regras-intro-texto">{s.intro[lang]}</p>}
                <ul className="regras-lista">
                  {s.itens[lang].map((item, i) => (
                    <li key={i} className="regras-item">{item}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}
      </div>
    </main>
  )
}
