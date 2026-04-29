import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useConteudo, useModules } from '../hooks/useConfig'
import './Home.css'

export default function Home() {
  const { t } = useTranslation()
  const conteudo = useConteudo()
  const { inscricaoAberta } = useModules()

  const streams = [1, 2, 3]
    .map(n => ({ nome: conteudo[`stream${n}Nome`], url: conteudo[`stream${n}Url`] }))
    .filter(s => s.nome && s.url)

  const hasCards = true // regras sempre visível + inscrição/streams quando ativos

  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-hero-label">⚡ {conteudo.labelSeason}</div>
        <h1 className="home-hero-title">
          {conteudo.cupName || 'Copa Inhouse'}
        </h1>
        {conteudo.descricaoTorneio
          ? <p className="home-hero-subtitle">{conteudo.descricaoTorneio}</p>
          : <p className="home-hero-subtitle">{t('home.subtitle')}</p>
        }
        {conteudo.proximoEvento && (
          <div className="home-proximo-evento">
            <span className="home-evento-icon">📅</span>
            {conteudo.proximoEvento}
          </div>
        )}
      </section>

      <section className="home-cards">
        {inscricaoAberta && (
          <Link to="/inscricao" className="home-card home-card--gold">
            <div className="home-card-icon">📝</div>
            <div className="home-card-body">
              <div className="home-card-title">{t('home.cards.inscricao')}</div>
              <div className="home-card-desc">{t('home.cards.inscricao_desc')}</div>
            </div>
            <div className="home-card-arrow">→</div>
          </Link>
        )}
        {streams.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="home-card home-card--purple">
            <div className="home-card-icon">📺</div>
            <div className="home-card-body">
              <div className="home-card-title">{s.nome}</div>
              <div className="home-card-desc">{t('home.stream_watch')}</div>
            </div>
            <div className="home-card-arrow">↗</div>
          </a>
        ))}
        <Link to="/regras" className="home-card home-card--blue">
          <div className="home-card-icon">📋</div>
          <div className="home-card-body">
            <div className="home-card-title">{t('home.regras_title')}</div>
            <div className="home-card-desc">{t('home.regras_desc')}</div>
          </div>
          <div className="home-card-arrow">→</div>
        </Link>
      </section>

    </main>
  )
}
