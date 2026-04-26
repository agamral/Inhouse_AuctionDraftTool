import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ref, update, get } from 'firebase/database'
import { db } from '../firebase/database'
import { loginCapitao, atualizarSenha, emailEhSintetico } from '../firebase/auth'
import { useAuth } from '../hooks/useAuth'

const inputCss = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '10px 14px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Etapa 1: Login ─────────────────────────────────────────────────────────────
function FormLogin({ onSintetico }) {
  const [email,    setEmail]    = useState('')
  const [senha,    setSenha]    = useState('')
  const [erro,     setErro]     = useState(null)
  const [entrando, setEntrando] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    try {
      const cred = await loginCapitao(email.trim(), senha)
      // Se email sintético → prompt de completar perfil
      if (emailEhSintetico(cred.user.email)) {
        onSintetico(cred.user.email)
      }
      // Se email real → useAuth redireciona via useEffect no pai
    } catch (e) {
      const msgs = {
        'auth/user-not-found':   'Acesso não encontrado.',
        'auth/wrong-password':   'Senha incorreta.',
        'auth/invalid-email':    'Email ou chave inválida.',
        'auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos.',
        'auth/invalid-credential': 'Credenciais inválidas.',
      }
      setErro(msgs[e.code] ?? 'Erro ao entrar. Verifique seus dados.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="email" placeholder="Email ou chave de acesso"
        value={email} onChange={e => setEmail(e.target.value)} required style={inputCss} />
      <input type="password" placeholder="Senha"
        value={senha} onChange={e => setSenha(e.target.value)} required style={inputCss} />
      {erro && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{erro}</p>}
      <button type="submit" className="btn primary" disabled={entrando}
        style={{ padding: 11, fontSize: 14, marginTop: 4 }}>
        {entrando ? 'Entrando...' : 'Entrar'}
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
        value={emailContato} onChange={e => setEmailContato(e.target.value)} style={inputCss} />
      <input type="password" placeholder="Nova senha (mín. 6 caracteres)" required
        value={novaSenha} onChange={e => setNovaSenha(e.target.value)} style={inputCss} />
      <input type="password" placeholder="Confirmar nova senha" required
        value={conf} onChange={e => setConf(e.target.value)} style={inputCss} />
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
  const { user, capitao, isAdmin, loading } = useAuth()
  const navigate = useNavigate()

  const [etapa,        setEtapa]        = useState('login')   // 'login' | 'completar' | 'concluido'
  const [chaveSintetica, setChaveSintetica] = useState(null)

  // Redireciona se já estava logado ao abrir a página
  useEffect(() => {
    if (loading) return
    if (isAdmin)  { navigate('/admin',       { replace: true }); return }
    if (capitao && etapa === 'login') navigate('/agendamento', { replace: true })
  }, [loading, isAdmin, capitao, etapa, navigate])

  function handleSintetico(chave) {
    setChaveSintetica(chave)
    setEtapa('completar')
  }

  function handleConcluido() {
    setEtapa('concluido')
    // Redireciona direto após um breve delay para mostrar o feedback
    setTimeout(() => navigate('/agendamento', { replace: true }), 1200)
  }

  if (loading) return null

  const titulo = etapa === 'completar' ? 'Complete seu perfil' : 'Área do Capitão'
  const subtitulo = etapa === 'completar'
    ? 'Defina uma senha pessoal para os próximos acessos'
    : 'Use a chave e a senha fornecidas pelo admin.'

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
            ✓ Perfil atualizado! Redirecionando...
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
