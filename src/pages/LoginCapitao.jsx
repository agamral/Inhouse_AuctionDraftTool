import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ref, update, get } from 'firebase/database'
import { db } from '../firebase/database'
import { loginCapitao, atualizarSenha, emailEhSintetico, enviarResetSenha } from '../firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { useTranslation } from 'react-i18next'

const inputCss = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '10px 14px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Etapa 1: Login ─────────────────────────────────────────────────────────────
function FormLogin({ onSintetico }) {
  const { t } = useTranslation()
  const [email,    setEmail]    = useState('')
  const [senha,    setSenha]    = useState('')
  const [erro,     setErro]     = useState(null)
  const [entrando, setEntrando] = useState(false)

  const [mostraRec, setMostraRec] = useState(false)
  const [emailRec,  setEmailRec]  = useState('')
  const [msgRec,    setMsgRec]    = useState(null)
  const [enviandoRec, setEnviandoRec] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    try {
      const cred = await loginCapitao(email.trim(), senha)
      if (emailEhSintetico(cred.user.email)) {
        onSintetico(cred.user.email)
      }
    } catch (e) {
      const msgs = {
        'auth/user-not-found':     'Acesso não encontrado.',
        'auth/wrong-password':     'Senha incorreta.',
        'auth/invalid-email':      'Email ou chave inválida.',
        'auth/too-many-requests':  'Muitas tentativas. Aguarde alguns minutos.',
        'auth/invalid-credential': 'Credenciais inválidas.',
      }
      setErro(msgs[e.code] ?? 'Erro ao entrar. Verifique seus dados.')
    } finally {
      setEntrando(false)
    }
  }

  async function handleRecuperar(e) {
    e.preventDefault()
    const trimmed = emailRec.trim()
    if (emailEhSintetico(trimmed) || trimmed.endsWith('@copa.inhouse')) {
      setMsgRec({ tipo: 'info', texto: 'Esta conta usa uma chave de acesso interna. Entre em contato com o admin no Discord para redefinir sua senha.' })
      return
    }
    setEnviandoRec(true)
    setMsgRec(null)
    try {
      await enviarResetSenha(trimmed)
      setMsgRec({ tipo: 'ok', texto: 'Email de recuperação enviado! Verifique sua caixa de entrada.' })
    } catch {
      setMsgRec({ tipo: 'err', texto: 'Erro ao enviar. Verifique se o email está correto.' })
    } finally {
      setEnviandoRec(false)
    }
  }

  if (mostraRec) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
          Informe o email da sua conta para receber o link de recuperação.
        </p>
        <form onSubmit={handleRecuperar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="email" placeholder="Seu email"
            value={emailRec} onChange={e => setEmailRec(e.target.value)} required style={inputCss} />
          {msgRec && (
            <p style={{ fontSize: 13, margin: 0, color: msgRec.tipo === 'ok' ? 'var(--green)' : msgRec.tipo === 'err' ? 'var(--red)' : 'var(--gold2)' }}>
              {msgRec.texto}
            </p>
          )}
          <button type="submit" className="btn primary" disabled={enviandoRec}
            style={{ padding: 11, fontSize: 14 }}>
            {enviandoRec ? 'Enviando...' : 'Enviar link de recuperação'}
          </button>
        </form>
        <button onClick={() => { setMostraRec(false); setMsgRec(null) }}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
          ← Voltar ao login
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="email" placeholder={t('captainLogin.email_label')}
        autoComplete="username"
        value={email} onChange={e => setEmail(e.target.value)} required style={inputCss} />
      <input type="password" placeholder={t('captainLogin.password_label')}
        autoComplete="current-password"
        value={senha} onChange={e => setSenha(e.target.value)} required style={inputCss} />
      {erro && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{erro}</p>}
      <button type="submit" className="btn primary" disabled={entrando}
        style={{ padding: 11, fontSize: 14, marginTop: 4 }}>
        {entrando ? t('captainLogin.logging_in') : t('captainLogin.login_btn')}
      </button>
      <button type="button" onClick={() => setMostraRec(true)}
        style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', marginTop: 2 }}>
        Esqueceu a senha?
      </button>
    </form>
  )
}

// ── Etapa 2: Completar perfil (email sintético) ────────────────────────────────
function FormCompletarPerfil({ chaveAtual, onConcluido }) {
  const [emailContato, setEmailContato] = useState('')
  const [novaSenha,    setNovaSenha]    = useState('')
  const [conf,         setConf]         = useState('')
  const [erro,         setErro]         = useState(null)
  const [salvando,     setSalvando]     = useState(false)
  const [mostraSenha,  setMostraSenha]  = useState(false)

  async function handleSalvar(e) {
    e.preventDefault()
    if (novaSenha !== conf)    return setErro('As senhas não coincidem.')
    if (novaSenha.length < 6)  return setErro('A senha precisa ter pelo menos 6 caracteres.')

    setSalvando(true)
    setErro(null)
    try {
      // 1. Muda só a senha no Firebase Auth (sem tocar no email de login)
      await atualizarSenha(novaSenha)

      // 2. Salva email de contato no banco (campo separado do email de login)
      if (emailContato.trim()) {
        const teamsSnap = await get(ref(db, '/teams'))
        const teams = teamsSnap.val() ?? {}
        const entry = Object.entries(teams).find(([, t]) => t.capitaoEmail === chaveAtual)
        if (entry) {
          await update(ref(db, `/teams/${entry[0]}`), {
            capitaoEmailContato: emailContato.trim(),
          })
        }
      }

      onConcluido()
    } catch (e) {
      const msgs = {
        'auth/weak-password':        'Senha fraca. Use pelo menos 6 caracteres.',
        'auth/requires-recent-login':'Por segurança, faça login novamente antes de alterar.',
      }
      setErro(msgs[e.code] ?? `Erro: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid var(--gold)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--gold2)', lineHeight: 1.6 }}>
        Você entrou com uma chave de acesso provisória.<br />
        Defina uma senha pessoal para os próximos acessos.<br />
        <span style={{ opacity: 0.7 }}>Você continuará entrando com a mesma chave de login.</span>
      </div>
      <input type="email" placeholder="Seu email de contato (opcional)"
        autoComplete="off"
        value={emailContato} onChange={e => setEmailContato(e.target.value)} style={inputCss} />
      <div style={{ position: 'relative' }}>
        <input type={mostraSenha ? 'text' : 'password'} placeholder="Nova senha (mín. 6 caracteres)" required
          autoComplete="new-password"
          value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
          style={{ ...inputCss, paddingRight: 40 }} />
        <button type="button" onClick={() => setMostraSenha(v => !v)}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: 0 }}>
          {mostraSenha ? '🙈' : '👁'}
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <input type={mostraSenha ? 'text' : 'password'} placeholder="Confirmar nova senha" required
          autoComplete="new-password"
          value={conf} onChange={e => setConf(e.target.value)}
          style={{ ...inputCss, paddingRight: 40 }} />
      </div>
      {erro && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{erro}</p>}
      <button type="submit" className="btn primary" disabled={salvando}
        style={{ padding: 11, fontSize: 14, marginTop: 4 }}>
        {salvando ? 'Salvando...' : 'Definir senha e continuar'}
      </button>
    </form>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function LoginCapitao() {
  const { t } = useTranslation()
  const { user, capitao, isAdmin, loading } = useAuth()
  const { idPublico } = useCampeonato()
  const navigate = useNavigate()

  const [etapa,        setEtapa]        = useState('login')   // 'login' | 'completar' | 'concluido'
  const [chaveSintetica, setChaveSintetica] = useState(null)

  // Usa o campeonato do time do capitão se disponível, senão usa o da URL
  const destCampeonato = capitao?.campeonatoId || idPublico

  // Redireciona se já estava logado ao abrir a página
  useEffect(() => {
    if (loading) return
    if (isAdmin) { navigate('/admin', { replace: true }); return }
    if (capitao && etapa === 'login') navigate(destCampeonato ? `/campeonatos/${destCampeonato}/agendamento` : '/', { replace: true })
  }, [loading, isAdmin, capitao, etapa, navigate, destCampeonato])

  function handleSintetico(chave) {
    setChaveSintetica(chave)
    setEtapa('completar')
  }

  function handleConcluido() {
    setEtapa('concluido')
    setTimeout(() => navigate(destCampeonato ? `/campeonatos/${destCampeonato}/agendamento` : '/', { replace: true }), 1200)
  }

  if (loading) return null

  const titulo = etapa === 'completar' ? t('captainLogin.complete_title') : t('captainLogin.title')
  const subtitulo = etapa === 'completar'
    ? t('captainLogin.complete_subtitle')
    : t('captainLogin.subtitle')

  return (
    <main className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border2)',
        borderRadius: 12, padding: '48px 40px',
        textAlign: 'center', maxWidth: 380, width: '100%',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚔️</div>
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", color: 'var(--blue)', fontSize: 22, marginBottom: 4 }}>
          {titulo}
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 28 }}>
          {subtitulo}
        </p>

        {etapa === 'login' && (
          <FormLogin onSintetico={handleSintetico} />
        )}

        {etapa === 'completar' && (
          <FormCompletarPerfil chaveAtual={chaveSintetica} onConcluido={handleConcluido} />
        )}

        {etapa === 'concluido' && (
          <div style={{ color: 'var(--green)', fontSize: 14, padding: '16px 0' }}>
            ✓ Perfil atualizado! {t('captainLogin.redirecting')}
          </div>
        )}

        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text3)' }}>
          Admin?{' '}
          <Link to="/login" style={{ color: 'var(--text2)' }}>Login com Google</Link>
        </p>
      </div>
    </main>
  )
}
