import { NavLink, useNavigate, useMatch, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useEffectiveAuth as useAuth } from '../hooks/useEffectiveAuth'
import { useState as useStateVA, useEffect as useEffectVA } from 'react'
import { ref as refVA, onValue as onValueVA } from 'firebase/database'
import { db as dbVA } from '../firebase/database'
import { useViewAs } from '../contexts/ViewAsContext'
import { useAuth as useRealAuth } from '../hooks/useAuth'
import { useCampeonato as useCampeonatoCtx } from '../contexts/CampeonatoContext'
import { useModules, useConteudo } from '../hooks/useConfig'
import { logout } from '../firebase/auth'
import './Navbar.css'

const LANGUAGES = [
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
]

// ── ViewAsMenu — dropdown de perspectiva (só visível pra admins reais) ────────
function ViewAsMenu() {
  const { viewAs, ativar, sair } = useViewAs()
  const { isAdmin: isRealAdmin } = useRealAuth()
  const { idPublico: campeonatoId } = useCampeonatoCtx()  // URL atual, não o admin selector
  const [teams, setTeams] = useStateVA({})
  const [open,  setOpen]  = useStateVA(false)

  useEffectVA(() => {
    if (!campeonatoId) return
    const unsub = onValueVA(refVA(dbVA, `campeonatos/${campeonatoId}/teams`), snap => setTeams(snap.val() ?? {}))
    return () => unsub()
  }, [campeonatoId])

  // Não mostrar fora de contexto de campeonato ou pra não-admin real
  if (!isRealAdmin || !campeonatoId) return null

  const timesArr = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
  const modoAtivo = viewAs !== null
  const corAtivo  = viewAs?.modo === 'capitao' ? 'var(--purple)' : viewAs?.modo === 'publico' ? 'var(--blue)' : 'var(--text2)'
  const labelAtivo = viewAs?.modo === 'capitao'
    ? `⚑ ${viewAs.teamData?.capitaoNome ?? viewAs.teamData?.nome ?? 'Capitão'}`
    : viewAs?.modo === 'publico' ? '🌐 Público' : '👁 Ver como'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Simular perspectiva de outro usuário"
        style={{
          fontSize: 11, padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          letterSpacing: '0.06em', whiteSpace: 'nowrap',
          background: modoAtivo ? corAtivo + '18' : 'transparent',
          border: `1px solid ${modoAtivo ? corAtivo + '55' : 'var(--border)'}`,
          color: modoAtivo ? corAtivo : 'var(--text3)',
        }}
      >
        {labelAtivo} ▾
      </button>

      {open && (
        <>
          {/* Overlay pra fechar ao clicar fora */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 999,
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: 6, minWidth: 180,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 8px 2px' }}>
              Visualizando como
            </div>

            {/* Admin (real) */}
            <MenuItem label="⚙ Admin (real)" active={!modoAtivo} onClick={() => { sair(); setOpen(false) }} />

            {/* Público */}
            <MenuItem label="🌐 Público (sem login)" active={viewAs?.modo === 'publico'}
              color="var(--blue)"
              onClick={() => { ativar('publico'); setOpen(false) }} />

            {/* Separador */}
            {timesArr.length > 0 && (
              <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 8px 2px', borderTop: '1px solid var(--border)', marginTop: 2 }}>
                Capitão de time
              </div>
            )}

            {timesArr.map(([id, t]) => (
              <MenuItem
                key={id}
                label={`⚑ ${t.nome}${t.capitaoNome ? ` (${t.capitaoNome})` : ''}`}
                active={viewAs?.modo === 'capitao' && viewAs?.teamId === id}
                color={t.cor}
                onClick={() => {
                  ativar('capitao', { teamId: id, teamData: { teamId: id, nome: t.nome, cor: t.cor, capitaoNome: t.capitaoNome ?? t.nome, campeonatoId, ...t } })
                  setOpen(false)
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '6px 10px', borderRadius: 5, cursor: 'pointer', border: 'none',
        background: active ? (color ? color + '18' : 'rgba(201,168,76,0.12)') : 'transparent',
        color: active ? (color ?? 'var(--gold2)') : 'var(--text2)',
        fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: active ? 700 : 400,
      }}
    >
      {label}
      {active && <span style={{ float: 'right', opacity: 0.7 }}>✓</span>}
    </button>
  )
}

export default function Navbar() {
  const { t, i18n } = useTranslation()
  const { user, isAdmin, isSuperAdmin, adminCampeonatoIds, capitao } = useAuth()
  const { isAdmin: realIsAdmin } = useRealAuth()  // pra manter admin area visível no modo viewAs
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

  return (
    <header className="navbar">
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

        {realIsAdmin ? (
          <div className="navbar-admin-area">
            {/* Ver como — dropdown de perspectiva pra admin */}
            <ViewAsMenu />
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
