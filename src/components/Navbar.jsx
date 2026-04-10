import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { useModules } from '../hooks/useConfig'
import { logout } from '../firebase/auth'
import './Navbar.css'

const LANGUAGES = [
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
]

export default function Navbar() {
  const { t, i18n } = useTranslation()
  const { user, isAdmin } = useAuth()
  const modules = useModules()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <header className="navbar">
      <div className="navbar-logo">
        <div className="navbar-logo-icon">⚔️</div>
        <div>
          <div className="navbar-logo-text">Copa Inhouse</div>
          <div className="navbar-logo-sub">Heroes of the Storm</div>
        </div>
      </div>

      <nav className="navbar-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          {t('nav.home')}
        </NavLink>
        <NavLink to="/inscritos" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          {t('nav.inscritos')}
        </NavLink>
        <NavLink to="/resultados" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          {t('nav.resultados')}
        </NavLink>
        {modules.inscricaoAberta && (
          <NavLink to="/inscricao" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.inscricao')}
          </NavLink>
        )}
        {modules.espectadorAtivo && (
          <NavLink to="/espectador" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.espectador')}
          </NavLink>
        )}
        {modules.draftAtivo && (
          <NavLink to="/draft" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.draft')}
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
            <NavLink to="/admin" className={({ isActive }) => `nav-link admin-link ${isActive ? 'active' : ''}`}>
              ⚙ Admin
            </NavLink>
            <button className="navbar-avatar" onClick={handleLogout} title={`Sair (${user.email})`}>
              {user.photoURL
                ? <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
                : <span>{user.email[0].toUpperCase()}</span>
              }
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="navbar-login-btn" title="Acesso admin">
            🔒
          </NavLink>
        )}
      </div>
    </header>
  )
}
