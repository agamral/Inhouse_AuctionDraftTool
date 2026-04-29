import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ref, set, get } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import { useModules, useConteudo } from '../hooks/useConfig'
import { loginWithGoogle } from '../firebase/auth'
import './Inscricao.css'
import '../styles/elo.css'
import RoleIcon from '../components/RoleIcon'
import EloIcon from '../components/EloIcon'

const BATTLETAG_REGEX = /^.+#\d{4,5}$/

const ELOS = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Mestre']
const ROLES = ['Tank', 'Offlane', 'DPS', 'Healer', 'Flex']
const ROLES_SEC = ['Tank', 'Offlane', 'DPS', 'Healer', 'Flex', 'Nenhuma']
const CAPITAO_OPTS = ['Sim', 'SoSeNecessario', 'Nao']
const CAPITAO_LABELS = { Sim: 'Sim', SoSeNecessario: 'Só se necessário', Nao: 'Não' }
const TITULAR_OPTS = ['Titular', 'Reserva']
const LINGUAS = ['pt', 'es', 'en']
const LINGUAS_LABELS = { pt: '🇧🇷 Português', es: '🇪🇸 Español', en: '🇺🇸 English' }

const PAISES = [
  { code: 'BR', flag: '🇧🇷', nome: 'Brasil' },
  { code: 'AR', flag: '🇦🇷', nome: 'Argentina' },
  { code: 'MX', flag: '🇲🇽', nome: 'México' },
  { code: 'CL', flag: '🇨🇱', nome: 'Chile' },
  { code: 'CO', flag: '🇨🇴', nome: 'Colômbia' },
  { code: 'PE', flag: '🇵🇪', nome: 'Peru' },
  { code: 'VE', flag: '🇻🇪', nome: 'Venezuela' },
  { code: 'UY', flag: '🇺🇾', nome: 'Uruguai' },
  { code: 'PY', flag: '🇵🇾', nome: 'Paraguai' },
  { code: 'BO', flag: '🇧🇴', nome: 'Bolívia' },
  { code: 'EC', flag: '🇪🇨', nome: 'Equador' },
  { code: 'US', flag: '🇺🇸', nome: 'Estados Unidos' },
  { code: 'PT', flag: '🇵🇹', nome: 'Portugal' },
  { code: 'ES', flag: '🇪🇸', nome: 'Espanha' },
  { code: 'OTHER', flag: '🌎', nome: 'Outro' },
]

const INITIAL = {
  nomeDiscord: '',
  battletag: '',
  pais: '',
  linguas: [],
  elo: '',
  rolePrimaria: '',
  roleSecundaria: '',
  querCapitao: '',
  titularReserva: '',
  aceitouRegras: false,
}

export default function Inscricao() {
  const { t } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  const { inscricaoAberta } = useModules()
  const conteudo = useConteudo()
  const [form, setForm] = useState(INITIAL)
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [jaInscrito, setJaInscrito] = useState(false)
  const [loginError, setLoginError] = useState(null)

  useEffect(() => {
    if (!user) return
    get(ref(db, `/players/${user.uid}`)).then((snap) => {
      if (snap.exists()) setJaInscrito(true)
    })
  }, [user])

  function validate() {
    const e = {}
    if (!form.nomeDiscord.trim()) e.nomeDiscord = 'Obrigatório'
    if (!BATTLETAG_REGEX.test(form.battletag)) e.battletag = 'Formato: Nick#0000'
    if (!form.pais) e.pais = 'Obrigatório'
    if (form.linguas.length === 0) e.linguas = 'Selecione pelo menos um'
    if (!form.elo) e.elo = 'Obrigatório'
    if (!form.rolePrimaria) e.rolePrimaria = 'Obrigatório'
    if (!form.roleSecundaria) e.roleSecundaria = 'Obrigatório'
    if (!form.querCapitao) e.querCapitao = 'Obrigatório'
    if (!form.titularReserva) e.titularReserva = 'Obrigatório'
    if (!form.aceitouRegras) e.aceitouRegras = 'Você precisa aceitar as regras'
    return e
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function toggleLingua(code) {
    setForm((prev) => {
      const has = prev.linguas.includes(code)
      return { ...prev, linguas: has ? prev.linguas.filter((l) => l !== code) : [...prev.linguas, code] }
    })
    if (errors.linguas) setErrors((prev) => ({ ...prev, linguas: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setSubmitting(true)
    const payload = {
      email:          user.email,
      discord:        form.nomeDiscord.trim(),
      battletag:      form.battletag.trim(),
      pais:           form.pais,
      linguas:        form.linguas,
      elo:            form.elo,
      rolePrimaria:   form.rolePrimaria,
      roleSecundaria: form.roleSecundaria,
      querCapitao:    form.querCapitao,
      titularReserva: form.titularReserva,
    }
    try {
      // Salva no Firebase (controle de duplicidade)
      await set(ref(db, `/players/${user.uid}`), {
        ...payload,
        premium: false,
        precoBase: 0,
        confirmado: false,
        inscritoEm: Date.now(),
        origem: 'site',
      })
      // Envia ao Google Sheets (fonte de verdade dos organizadores)
      await fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSubmitted(true)
    } catch (err) {
      setErrors({ submit: 'Erro ao enviar inscrição. Tente novamente.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogin() {
    setLoginError(null)
    try {
      await loginWithGoogle()
    } catch {
      setLoginError('Falha ao fazer login. Tente novamente.')
    }
  }

  if (authLoading) return <main className="page"><div className="inscricao-loading">Carregando...</div></main>

  if (!user) {
    return (
      <main className="page">
        <div className="inscricao-gate">
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎮</div>
          <h2 className="page-title" style={{ fontSize: '22px' }}>{t('form.title')}</h2>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '24px' }}>
            Faça login com sua conta Google para se inscrever.
          </p>
          <button className="btn primary" style={{ padding: '12px 28px', display: 'inline-flex', alignItems: 'center', gap: '8px' }} onClick={handleLogin}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Entrar com Google
          </button>
          {loginError && <p style={{ color: 'var(--red)', fontSize: '13px', marginTop: '12px' }}>{loginError}</p>}
        </div>
      </main>
    )
  }

  if (jaInscrito) {
    return (
      <main className="page">
        <div className="inscricao-success">
          <div className="inscricao-success-icon">✅</div>
          <h2>Você já está inscrito!</h2>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '8px' }}>
            Sua inscrição foi recebida. Aguarde a confirmação dos organizadores.
          </p>
        </div>
      </main>
    )
  }

  if (!inscricaoAberta) {
    return (
      <main className="page">
        <div className="inscricao-success">
          <div className="inscricao-success-icon">🔒</div>
          <h2 style={{ color: 'var(--text)' }}>Inscrições encerradas</h2>
          <p style={{ maxWidth: 420, textAlign: 'center', fontFamily: "'Barlow', sans-serif", fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginTop: 8 }}>
            As inscrições para esta edição estão fechadas no momento.
            {conteudo.proximoEvento
              ? ` Próximo evento: ${conteudo.proximoEvento}.`
              : ' Fique atento ao Discord para novidades sobre a próxima edição.'
            }
          </p>
        </div>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="page">
        <div className="inscricao-success">
          <div className="inscricao-success-icon">✅</div>
          <h2>{t('form.success')}</h2>
          {conteudo.posInscricaoTexto && (
            <p style={{
              marginTop: 16, maxWidth: 480, textAlign: 'center',
              fontFamily: "'Barlow', sans-serif", fontSize: 14,
              color: 'var(--text2)', lineHeight: 1.6,
            }}>
              {conteudo.posInscricaoTexto}
            </p>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <h1 className="page-title">{t('form.title')}</h1>
      <p className="page-subtitle">{t('form.subtitle')}</p>

      <form className="inscricao-form" onSubmit={handleSubmit} noValidate>

        {/* Discord */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.discord')} *</label>
          <input
            className={`form-input ${errors.nomeDiscord ? 'error' : ''}`}
            type="text"
            value={form.nomeDiscord}
            onChange={(e) => handleChange('nomeDiscord', e.target.value)}
            placeholder="SeuNick"
          />
          {errors.nomeDiscord && <span className="form-error">{errors.nomeDiscord}</span>}
        </div>

        {/* Battletag */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.battletag')} *</label>
          <input
            className={`form-input ${errors.battletag ? 'error' : ''}`}
            type="text"
            value={form.battletag}
            onChange={(e) => handleChange('battletag', e.target.value)}
            placeholder={t('form.fields.battletag_placeholder')}
          />
          {errors.battletag && <span className="form-error">{errors.battletag}</span>}
        </div>

        {/* País */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.pais')} *</label>
          <select
            className={`form-select ${errors.pais ? 'error' : ''}`}
            value={form.pais}
            onChange={(e) => handleChange('pais', e.target.value)}
          >
            <option value="">Selecione...</option>
            {PAISES.map((p) => (
              <option key={p.code} value={p.code}>{p.flag} {p.nome}</option>
            ))}
          </select>
          {errors.pais && <span className="form-error">{errors.pais}</span>}
        </div>

        {/* Línguas */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.linguas')} *</label>
          <div className="form-toggle-group">
            {LINGUAS.map((code) => (
              <button
                key={code}
                type="button"
                className={`form-toggle ${form.linguas.includes(code) ? 'active' : ''}`}
                onClick={() => toggleLingua(code)}
              >
                {LINGUAS_LABELS[code]}
              </button>
            ))}
          </div>
          {errors.linguas && <span className="form-error">{errors.linguas}</span>}
        </div>

        {/* Elo */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.elo')} *</label>
          <div className="form-toggle-group">
            {ELOS.map((e) => (
              <button
                key={e}
                type="button"
                className={`form-toggle elo-toggle elo-toggle-${e.toLowerCase()} ${form.elo === e ? 'active' : ''}`}
                onClick={() => handleChange('elo', e)}
              >
                <EloIcon elo={e} size={15} style={{ marginRight: '5px' }} />
                {e}
              </button>
            ))}
          </div>
          {errors.elo && <span className="form-error">{errors.elo}</span>}
        </div>

        {/* Role Primária */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.role_primaria')} *</label>
          <div className="form-toggle-group">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={`form-toggle ${form.rolePrimaria === r ? 'active' : ''}`}
                onClick={() => handleChange('rolePrimaria', r)}
              >
                <RoleIcon role={r} size={16} style={{ marginRight: '6px' }} />
                {r}
              </button>
            ))}
          </div>
          {errors.rolePrimaria && <span className="form-error">{errors.rolePrimaria}</span>}
        </div>

        {/* Role Secundária */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.role_secundaria')} *</label>
          <div className="form-toggle-group">
            {ROLES_SEC.map((r) => (
              <button
                key={r}
                type="button"
                className={`form-toggle ${form.roleSecundaria === r ? 'active' : ''}`}
                onClick={() => handleChange('roleSecundaria', r)}
              >
                <RoleIcon role={r} size={16} style={{ marginRight: '6px' }} />
                {r}
              </button>
            ))}
          </div>
          {errors.roleSecundaria && <span className="form-error">{errors.roleSecundaria}</span>}
        </div>

        {/* Titular / Reserva */}
        <div className="form-group">
          <label className="form-label">Inscrição como *</label>
          <div className="form-toggle-group">
            {TITULAR_OPTS.map((o) => (
              <button
                key={o}
                type="button"
                className={`form-toggle ${form.titularReserva === o ? 'active' : ''}`}
                onClick={() => handleChange('titularReserva', o)}
              >
                {o}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>
            Titular: compromisso de jogar. Reserva: disponível se necessário.
          </div>
          {errors.titularReserva && <span className="form-error">{errors.titularReserva}</span>}
        </div>

        {/* Quer capitão */}
        <div className="form-group">
          <label className="form-label">{t('form.fields.capitar')} *</label>
          <div className="form-toggle-group">
            {CAPITAO_OPTS.map((o) => (
              <button
                key={o}
                type="button"
                className={`form-toggle ${form.querCapitao === o ? 'active' : ''}`}
                onClick={() => handleChange('querCapitao', o)}
              >
                {CAPITAO_LABELS[o]}
              </button>
            ))}
          </div>
          {errors.querCapitao && <span className="form-error">{errors.querCapitao}</span>}
        </div>

        {/* Aceitar regras */}
        <div className="form-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={form.aceitouRegras}
              onChange={(e) => handleChange('aceitouRegras', e.target.checked)}
            />
            <span>{t('form.fields.regras')}</span>
          </label>
          {errors.aceitouRegras && <span className="form-error">{errors.aceitouRegras}</span>}
        </div>

        {errors.submit && <p style={{ color: 'var(--red)', fontSize: '13px' }}>{errors.submit}</p>}

        <button type="submit" className="btn primary inscricao-submit" disabled={submitting}>
          {submitting ? 'Enviando...' : t('form.submit')}
        </button>

      </form>
    </main>
  )
}
