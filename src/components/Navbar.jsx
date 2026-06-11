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
import { useCaptainNotifications } from '../hooks/useCaptainNotifications'
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

// ── UserMenu — dropdown do avatar (perfil + sair) ─────────────────────────────
//
// Antes, clicar no avatar deslogava direto — fácil de acionar sem querer.
// Agora abre um menu com "Meu perfil" e "Sair" como ações explícitas.
function UserMenu({ avatar, nome, email, color, onLogout }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="navbar-avatar"
        onClick={() => setOpen(v => !v)}
        title={nome ?? email}
        style={color ? { background: `${color}22`, borderColor: color } : undefined}
      >
        {avatar}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 999,
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: 6, minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {(nome || email) && (
              <div style={{ padding: '6px 10px 8px', borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
                {nome && (
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                    {nome}
                  </div>
                )}
                {email && (
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--text3)' }}>
                    {email}
                  </div>
                )}
              </div>
            )}

            <Link to="/meu-perfil" onClick={() => setOpen(false)} style={{
              display: 'block', width: '100%', textAlign: 'left', textDecoration: 'none', boxSizing: 'border-box',
              padding: '6px 10px', borderRadius: 5,
              color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
            }}>
              👤 Meu perfil
            </Link>

            <button onClick={() => { setOpen(false); onLogout() }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '6px 10px', borderRadius: 5, cursor: 'pointer', border: 'none', background: 'transparent',
              color: 'var(--red)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
            }}>
              ↪ Sair da conta
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── NotificationBell — agenda pendente e confrontos finalizados (capitão) ────
function NotificationBell({ items, unreadCount, onItemClick }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="navbar-avatar"
        onClick={() => setOpen(v => !v)}
        title="Notificações"
        style={{ position: 'relative' }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, padding: '0 3px',
            borderRadius: 8, background: 'var(--red)', color: '#fff',
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 999,
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: 6, minWidth: 280, maxWidth: 340,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 8px 6px' }}>
              Notificações
            </div>

            {items.length === 0 ? (
              <div style={{ padding: '6px 10px 10px', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12 }}>
                Nenhuma notificação por aqui.
              </div>
            ) : items.map(item => (
              <button
                key={item.key}
                onClick={() => { onItemClick(item); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 5, cursor: 'pointer', border: 'none',
                  background: item.lida ? 'transparent' : 'rgba(201,168,76,0.08)',
                  color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1.3 }}>{item.icone}</span>
                <span style={{ flex: 1, color: item.lida ? 'var(--text2)' : 'var(--text)' }}>{item.titulo}</span>
                {!item.lida && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', marginTop: 4, flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Navbar() {
  const { t, i18n } = useTranslation()
  const { user, isAdmin, isSuperAdmin, adminCampeonatoIds, capitao } = useAuth()
  // realAuth usado direto pra não depender do ciclo async do useEffectiveAuth
  const { capitao: realCapitao, isAdmin: realIsAdmin } = useRealAuth()

  // Capitão via PIN session (link ?cap=ID&pin=PIN) — não usa Firebase Auth
  const pinSession = (() => {
    try { return JSON.parse(sessionStorage.getItem('captainSession')) } catch { return null }
  })()
  // Três formas de ser capitão:
  //   1. capitao/realCapitao: Firebase Auth + time vinculado no DB
  //   2. pinSession: link personalizado (sessionStorage)
  //   3. email @copa.inhouse: conta criada pelo admin, ainda buscando time no DB
  const isCapitao = !!(
    capitao ||
    realCapitao ||
    pinSession?.captainId ||
    (user && user.email?.endsWith('@copa.inhouse'))
  )
  const { viewAs } = useViewAs()
  const modules = useModules()
  const conteudo = useConteudo()
  const navigate = useNavigate()
  const { items: notifItems, unreadCount: notifUnread, marcarLida: marcarNotifLida } = useCaptainNotifications(capitao, user)

  function handleNotifClick(item) {
    if (item.tipo === 'confronto') marcarNotifLida(item.key)
    navigate(item.link)
  }
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
    // Volta pro campeonato atual se estiver dentro de um, senão vai pra home
    navigate(base || '/')
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
            {(isAdmin || isCapitao) && (
              <NavLink to={`${base}/scrim`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Scrims
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
            <UserMenu
              avatar={user.photoURL
                ? <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
                : <span>{user.email[0].toUpperCase()}</span>
              }
              email={user.email}
              onLogout={handleLogout}
            />
          </div>
        ) : capitao ? (
          <div className="navbar-admin-area">
            <span style={{ fontSize: 12, color: capitao.cor ?? 'var(--blue)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
              {capitao.nome}
            </span>
            <NotificationBell items={notifItems} unreadCount={notifUnread} onItemClick={handleNotifClick} />
            <UserMenu
              avatar={<span style={{ color: capitao.cor ?? 'var(--blue)' }}>⚔</span>}
              nome={capitao.nome}
              email={user?.email}
              color={capitao.cor ?? 'var(--blue)'}
              onLogout={handleLogout}
            />
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
