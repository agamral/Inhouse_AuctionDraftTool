import { Link, useMatch } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useConteudo, useModules } from '../hooks/useConfig'
import './Home.css'

export default function Home() {
  const { t } = useTranslation()
  const conteudo = useConteudo()
  const { inscricaoAberta } = useModules()
  const inCampeonato = useMatch('/campeonatos/:campeonatoId/*')
  const base = inCampeonato ? `/campeonatos/${inCampeonato.params.campeonatoId}` : ''

  const streams = [1, 2, 3]
    .map(n => ({ nome: conteudo[`stream${n}Nome`], url: conteudo[`stream${n}Url`] }))
    .filter(s => s.nome && s.url)

  const sociais = [
    { key: 'youtube',   url: conteudo.youtubeUrl,   label: 'YouTube',   cor: '#ff4444',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.75 15.5v-7l6.25 3.5-6.25 3.5z"/></svg> },
    { key: 'instagram', url: conteudo.instagramUrl, label: 'Instagram',  cor: '#e1306c',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg> },
    { key: 'discord',   url: conteudo.discordUrl,   label: 'Discord',   cor: '#5865F2',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.054a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg> },
  ].filter(s => s.url)

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
        {sociais.length > 0 && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            {sociais.map(s => (
              <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer"
                title={s.label}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44, borderRadius: '50%',
                  background: `${s.cor}18`,
                  border: `1px solid ${s.cor}55`,
                  color: s.cor,
                  transition: 'background 0.2s, transform 0.2s',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${s.cor}30`; e.currentTarget.style.transform = 'scale(1.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = `${s.cor}18`; e.currentTarget.style.transform = 'scale(1)' }}
              >
                {s.icon}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="home-cards">
        {inscricaoAberta && (
          <Link to={`${base}/inscricao`} className="home-card home-card--gold">
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
        <Link to={`${base}/regras`} className="home-card home-card--blue">
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
