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
  const { user, isAdmin, capitao } = useAuth()
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
        {/* Inscritos — só capitães e admins */}
        {(isAdmin || capitao) && (
          <NavLink to="/inscritos" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.inscritos')}
          </NavLink>
        )}

        {/* Leilão — renomeado, só durante a fase de leilão */}
        {modules.draftAtivo && (isAdmin || capitao) && (
          <NavLink to="/draft" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.leilao')}
          </NavLink>
        )}

        {/* Inscrição — quando aberta */}
        {modules.inscricaoAberta && (
          <NavLink to="/inscricao" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.inscricao')}
          </NavLink>
        )}

        {/* Resultado do leilão — visível quando campeonato ativo */}
        {(modules.campeonatoAtivo || isAdmin) && (
          <NavLink to="/resultados" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.resultados')}
          </NavLink>
        )}

        {/* Campeonato — elenco, tabela, chave, agendamento */}
        {(modules.campeonatoAtivo || isAdmin) && (
          <NavLink to="/elenco" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.elenco')}
          </NavLink>
        )}
        {(modules.campeonatoAtivo || isAdmin) && (
          <NavLink to="/tabela" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.tabela')}
          </NavLink>
        )}
        {(modules.campeonatoAtivo || isAdmin) && (
          <NavLink to="/chave" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.chave')}
          </NavLink>
        )}
        {(modules.campeonatoAtivo || isAdmin || capitao) && (
          <NavLink to="/agendamento" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.agenda')}
          </NavLink>
        )}

        {/* Espectador do leilão */}
        {modules.espectadorAtivo && (
          <NavLink to="/espectador" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.espectador')}
          </NavLink>
        )}

        {/* Hero Draft — quando ativo */}
        {(modules.heroDraftAtivo || isAdmin) && (
          <NavLink to="/hero-draft/espectador" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {t('nav.heroDraft')}
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
        ) : capitao ? (
          /* Capitão logado */
          <div className="navbar-admin-area">
            <span style={{ fontSize: 12, color: capitao.cor ?? 'var(--blue)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
              {capitao.nome}
            </span>
            <button className="navbar-avatar" onClick={handleLogout} title={`Sair (${user?.email})`}
              style={{ background: `${capitao.cor ?? 'var(--blue)'}22`, borderColor: capitao.cor ?? 'var(--blue)' }}>
              <span style={{ color: capitao.cor ?? 'var(--blue)' }}>⚔</span>
            </button>
          </div>
        ) : (
          /* Visitante — link discreto para login capitão */
          <NavLink to="/login-capitao" className="navbar-login-btn" title="Área do Capitão">
            ⚔
          </NavLink>
        )}
      </div>
    </header>
  )
}
