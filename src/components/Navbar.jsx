import { NavLink, useNavigate, useMatch, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useViewAs } from '../contexts/ViewAsContext'
import { useModules, useConteudo } from '../hooks/useConfig'
import { logout } from '../firebase/auth'
import './Navbar.css'

const LANGUAGES = [
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
]

export default function Navbar() {
  const { t, i18n } = useTranslation()
  const { user, isAdmin, isSuperAdmin, adminCampeonatoIds, capitao } = useAuth()
  const { viewAs } = useViewAs()
  const modules = useModules()
  const conteudo = useConteudo()
  const navigate = useNavigate()
  const inCampeonato = useMatch('/campeonatos/:campeonatoId/*')
  const base = inCampeonato ? `/campeonatos/${inCampeonato.params.campeonatoId}` : ''
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Fecha o menu sempre que a rota muda
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    if (conteudo.cupName) document.title = conteudo.cupName
  }, [conteudo.cupName])

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  // Páginas de transmissão/overlay não devem mostrar navbar (precisamos do espaço todo)
  const isFullscreenView = location.pathname.endsWith('/espectador')
    || location.pathname.includes('/hero-draft/overlay')
    || location.pathname.includes('/hero-draft/espectador')
    || location.pathname.endsWith('/showmatch/espectador')
  if (isFullscreenView) return null

  // Quando ViewAsBar está ativa no topo, empurra o navbar pra baixo
  const viewAsBarHeight = viewAs !== null ? 40 : 0

  return (
    <header className="navbar" style={viewAsBarHeight ? { top: viewAsBarHeight } : undefined}>
      <button
        className="navbar-hamburger"
        onClick={() => setMenuOpen(o => !o)}
        aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={menuOpen}
      >
        <span className={`navbar-hamburger-icon${menuOpen ? ' open' : ''}`}>
          <span /><span /><span />
        </span>
      </button>
      <div className="navbar-logo">
        <div className="navbar-logo-icon">⚔️</div>
        <div>
          <div className="navbar-logo-text">
            {inCampeonato
              ? (conteudo.cupName || 'Copa Inhouse')
              : 'Copa Inhouse'
            }
          </div>
          <div className="navbar-logo-sub">Heroes of the Storm</div>
        </div>
      </div>

      <nav className={`navbar-nav${menuOpen ? ' navbar-nav--open' : ''}`}>
        {inCampeonato ? (
          <>
            <Link to="/" className="nav-link" style={{ fontSize: 11, opacity: 0.6 }}>← Todos</Link>
            <NavLink to={base} end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              {t('nav.home')}
            </NavLink>
            {(isAdmin || capitao || modules.inscritosAbertos) && (
              <NavLink to={`${base}/inscritos`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.inscritos')}
              </NavLink>
            )}
            {modules.draftAtivo && (isAdmin || capitao) && (
              <NavLink to={`${base}/draft`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.leilao')}
              </NavLink>
            )}
            {modules.inscricaoAberta && (
              <NavLink to={`${base}/inscricao`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.inscricao')}
              </NavLink>
            )}
            {(modules.campeonatoAtivo || isAdmin) && (
              <NavLink to={`${base}/resultados`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.resultados')}
              </NavLink>
            )}
            {(modules.campeonatoAtivo || isAdmin) && (
              <NavLink to={`${base}/elenco`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.elenco')}
              </NavLink>
            )}
            {(modules.campeonatoAtivo || isAdmin) && (
              <NavLink to={`${base}/tabela`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.tabela')}
              </NavLink>
            )}
            {(modules.campeonatoAtivo || isAdmin) && (
              <NavLink to={`${base}/chave`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.chave')}
              </NavLink>
            )}
            {(modules.campeonatoAtivo || isAdmin || capitao) && (
              <NavLink to={`${base}/agendamento`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.agenda')}
              </NavLink>
            )}
            {modules.espectadorAtivo && (
              <NavLink to={`${base}/espectador`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.espectador')}
              </NavLink>
            )}
            {(modules.heroDraftAtivo || isAdmin) && (
              <NavLink to={`${base}/hero-draft/espectador`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('nav.heroDraft')}
              </NavLink>
            )}
          </>
        ) : (
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.home')}
          </NavLink>
        )}
      </nav>

      <div className="navbar-right">
        <div className="lang-switcher">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`lang-btn ${i18n.language === lang.code ? 'active' : ''}`}
              onClick={() => i18n.changeLanguage(lang.code)}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {isAdmin ? (
          <div className="navbar-admin-area">
            <NavLink
              to={isSuperAdmin ? '/admin' : inCampeonato ? `${base}/admin` : `/campeonatos/${adminCampeonatoIds?.[0]}/admin`}
              className={({ isActive }) => `nav-link admin-link ${isActive ? 'active' : ''}`}
            >
              ⚙ Admin
            </NavLink>
            <button className="navbar-avatar" onClick={handleLogout} title={`Sair (${user.email})`}>
              {user.photoURL
                ? <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
                : <span>{user.email[0].toUpperCase()}</span>
              }
            </button>
          </div>
        ) : capitao ? (
          <div className="navbar-admin-area">
            <span style={{ fontSize: 12, color: capitao.cor ?? 'var(--blue)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
              {capitao.nome}
            </span>
            <button className="navbar-avatar" onClick={handleLogout} title={`Sair (${user?.email})`}
              style={{ background: `${capitao.cor ?? 'var(--blue)'}22`, borderColor: capitao.cor ?? 'var(--blue)' }}>
              <span style={{ color: capitao.cor ?? 'var(--blue)' }}>⚔</span>
            </button>
          </div>
        ) : user ? (
          <NavLink to="/meu-perfil" className="navbar-avatar" title={user.email}>
            {user.photoURL
              ? <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
              : <span>{user.email[0].toUpperCase()}</span>
            }
          </NavLink>
        ) : null}
      </div>
    </header>
  )
}
