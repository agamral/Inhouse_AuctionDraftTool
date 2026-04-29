import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useConteudo } from '../hooks/useConfig'
import './Home.css'

const CARDS = [
  {
    key: 'inscricao',
    to: '/inscricao',
    icon: '📝',
    color: 'gold',
  },
  {
    key: 'inscritos',
    to: '/inscritos',
    icon: '👥',
    color: 'blue',
  },
  {
    key: 'espectador',
    to: '/espectador',
    icon: '📺',
    color: 'purple',
  },
]

export default function Home() {
  const { t } = useTranslation()
  const conteudo = useConteudo()

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
        {CARDS.map((card) => (
          <Link key={card.key} to={card.to} className={`home-card home-card--${card.color}`}>
            <div className="home-card-icon">{card.icon}</div>
            <div className="home-card-body">
              <div className="home-card-title">{t(`home.cards.${card.key}`)}</div>
              <div className="home-card-desc">{t(`home.cards.${card.key}_desc`)}</div>
            </div>
            <div className="home-card-arrow">→</div>
          </Link>
        ))}
      </section>

      <section className="home-info">
        <div className="home-info-card">
          <div className="home-info-label">{t('home.format')}</div>
          <div className="home-info-value">{t('home.format_value')}</div>
        </div>
        <div className="home-info-card">
          <div className="home-info-label">{t('home.roles')}</div>
          <div className="home-info-value">{t('home.roles_value')}</div>
        </div>
      </section>
    </main>
  )
}
