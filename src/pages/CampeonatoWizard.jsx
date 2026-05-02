import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, push, set, get, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import {
  DEFAULT_MODULES, DEFAULT_DRAFT, DEFAULT_CONTEUDO,
  DEFAULT_PARTIDAS, DEFAULT_PONTUACAO,
} from '../hooks/useConfig'
import './CampeonatoWizard.css'

const STEPS = [
  { id: 'identidade', label: 'Identidade' },
  { id: 'datas',      label: 'Datas'      },
  { id: 'formato',    label: 'Formato'    },
  { id: 'leilao',     label: 'Leilão'     },
  { id: 'admins',     label: 'Admins'     },
  { id: 'revisao',    label: 'Revisão'    },
]

const VAZIO = {
  nome:         '',
  labelSeason:  '',
  descricao:    '',
  organizador:  '',
  // datas
  inscricaoAbertura:    '',
  inscricaoFechamento:  '',
  leilao:               '',
  inicioFaseRegular:    '',
  inicioPlayoffs:       '',
  granFinal:            '',
  // formato
  formatoFaseRegular: 'MD2',
  formatoPlayoffs:    'MD5',
  formatoGranFinal:   'MD5',
  tipoBracket:        'dupla',
  // leilão
  moedas:          15,
  minCaptains:     2,
  maxCaptains:     8,
  minPlayers:      5,
  maxPlayers:      7,
  rouboAtivo:      true,
  leilaoReservas:  false,
  // pontuação
  vitoria:          3,
  empate:           1,
  derrota:          0,
  woVitoria:        3,
  desempateVitoria: 1,
  // admins
  adminsInput: '',  // emails separados por vírgula
}

export default function CampeonatoWizard() {
  const { isSuperAdmin } = useAuth()
  const navigate = useNavigate()

  const [step,    setStep]    = useState(0)
  const [form,    setForm]    = useState(VAZIO)
  const [saving,  setSaving]  = useState(false)
  const [erro,    setErro]    = useState(null)

  // Carregar defaults da temporada anterior
  useEffect(() => {
    async function loadDefaults() {
      const snap = await get(ref(db, '/campeonatos'))
      const data = snap.val()
      if (!data) return

      const recente = Object.values(data)
        .filter(c => c.info?.criadoEm)
        .sort((a, b) => (b.info.criadoEm ?? 0) - (a.info.criadoEm ?? 0))[0]

      if (!recente) return

      setForm(prev => ({
        ...prev,
        labelSeason:         recente.info?.labelSeason  ?? prev.labelSeason,
        organizador:         recente.info?.organizador  ?? prev.organizador,
        formatoFaseRegular:  recente.config?.partidas?.formatoFaseRegular ?? prev.formatoFaseRegular,
        formatoPlayoffs:     recente.config?.partidas?.formatoPlayoffs     ?? prev.formatoPlayoffs,
        formatoGranFinal:    recente.config?.partidas?.formatoGranFinal    ?? prev.formatoGranFinal,
        tipoBracket:         recente.config?.partidas?.tipoBracket         ?? prev.tipoBracket,
        moedas:              recente.config?.draft?.moedas      ?? prev.moedas,
        minCaptains:         recente.config?.draft?.minCaptains ?? prev.minCaptains,
        maxCaptains:         recente.config?.draft?.maxCaptains ?? prev.maxCaptains,
        minPlayers:          recente.config?.draft?.minPlayers  ?? prev.minPlayers,
        maxPlayers:          recente.config?.draft?.maxPlayers  ?? prev.maxPlayers,
        rouboAtivo:          recente.config?.draft?.rouboAtivo  ?? prev.rouboAtivo,
        vitoria:             recente.config?.pontuacao?.vitoria          ?? prev.vitoria,
        empate:              recente.config?.pontuacao?.empate           ?? prev.empate,
        desempateVitoria:    recente.config?.pontuacao?.desempateVitoria ?? prev.desempateVitoria,
      }))
    }
    loadDefaults()
  }, [])

  if (!isSuperAdmin) return (
    <main className="page">
      <p style={{ color: 'var(--red)' }}>Acesso restrito a SuperAdmins.</p>
    </main>
  )

  function set_(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setErro(null)
  }

  function validarStep() {
    const s = STEPS[step].id
    if (s === 'identidade') {
      if (!form.nome.trim()) return 'Informe o nome do campeonato.'
    }
    if (s === 'datas') {
      if (!form.inscricaoAbertura) return 'Informe a data de abertura das inscrições.'
      if (!form.inicioFaseRegular) return 'Informe a data de início dos jogos.'
    }
    return null
  }

  function avancar() {
    const err = validarStep()
    if (err) { setErro(err); return }
    setStep(s => Math.min(s + 1, STEPS.length - 1))
    setErro(null)
  }

  function voltar() {
    setStep(s => Math.max(s - 1, 0))
    setErro(null)
  }

  async function criar() {
    setSaving(true)
    setErro(null)
    try {
      const id = push(ref(db, '/campeonatos')).key

      const admins = {}
      form.adminsInput.split(',').map(e => e.trim()).filter(Boolean).forEach(email => {
        // Lookup UID por email
        admins[email] = true  // temporário; será substituído por UID real
      })

      await set(ref(db, `/campeonatos/${id}`), {
        info: {
          nome:         form.nome.trim(),
          labelSeason:  form.labelSeason.trim(),
          descricao:    form.descricao.trim(),
          organizador:  form.organizador.trim(),
          tipo:         'campeonato',
          status:       'configurando',
          principal:    false,
          criadoEm:     Date.now(),
        },
        datas: {
          inscricaoAbertura:   form.inscricaoAbertura   || null,
          inscricaoFechamento: form.inscricaoFechamento || null,
          leilao:              form.leilao              || null,
          inicioFaseRegular:   form.inicioFaseRegular   || null,
          inicioPlayoffs:      form.inicioPlayoffs      || null,
          granFinal:           form.granFinal           || null,
        },
        config: {
          modules:   { ...DEFAULT_MODULES },
          draft: {
            moedas:         form.moedas,
            minCaptains:    form.minCaptains,
            maxCaptains:    form.maxCaptains,
            minPlayers:     form.minPlayers,
            maxPlayers:     form.maxPlayers,
            rouboAtivo:     form.rouboAtivo,
            leilaoReservas: form.leilaoReservas,
          },
          partidas: {
            formatoFaseRegular: form.formatoFaseRegular,
            formatoPlayoffs:    form.formatoPlayoffs,
            formatoGranFinal:   form.formatoGranFinal,
            tipoBracket:        form.tipoBracket,
          },
          pontuacao: {
            vitoria:          form.vitoria,
            empate:           form.empate,
            derrota:          form.derrota,
            woVitoria:        form.woVitoria,
            desempateVitoria: form.desempateVitoria,
          },
          conteudo: {
            ...DEFAULT_CONTEUDO,
            cupName:      form.nome.trim(),
            labelSeason:  form.labelSeason.trim(),
            descricao:    form.descricao.trim(),
          },
        },
      })

      navigate(`/admin?campeonato=${id}`)
    } catch (e) {
      setErro(`Erro ao criar campeonato: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const current = STEPS[step].id

  return (
    <main className="page wizard-root">
      <h1 className="page-title">Novo Campeonato</h1>

      {/* Progress bar */}
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={s.id} className={`wizard-step ${i === step ? 'ativo' : ''} ${i < step ? 'concluido' : ''}`}>
            <div className="wizard-step-dot">{i < step ? '✓' : i + 1}</div>
            <div className="wizard-step-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Conteúdo da etapa */}
      <div className="wizard-body">

        {/* ── Identidade ─────────────────────────────────────────────────── */}
        {current === 'identidade' && (
          <div className="wizard-fields">
            <WizardField label="Nome do campeonato *">
              <input value={form.nome} onChange={e => set_('nome', e.target.value)} placeholder="Ex: Copa Inhouse Season 3" />
            </WizardField>
            <WizardField label="Label de temporada" hint="Aparece no header do site">
              <input value={form.labelSeason} onChange={e => set_('labelSeason', e.target.value)} placeholder="Ex: Season 3 · Heroes of the Storm" />
            </WizardField>
            <WizardField label="Descrição pública" hint="Aparece na Home para visitantes">
              <textarea rows={3} value={form.descricao} onChange={e => set_('descricao', e.target.value)} placeholder="Breve descrição do campeonato..." />
            </WizardField>
            <WizardField label="Organizador">
              <input value={form.organizador} onChange={e => set_('organizador', e.target.value)} placeholder="Ex: Inhouse Brasil" />
            </WizardField>
          </div>
        )}

        {/* ── Datas ──────────────────────────────────────────────────────── */}
        {current === 'datas' && (
          <div className="wizard-fields">
            <WizardField label="Abertura das inscrições *">
              <input type="datetime-local" value={form.inscricaoAbertura} onChange={e => set_('inscricaoAbertura', e.target.value)} />
            </WizardField>
            <WizardField label="Fechamento das inscrições">
              <input type="datetime-local" value={form.inscricaoFechamento} onChange={e => set_('inscricaoFechamento', e.target.value)} />
            </WizardField>
            <WizardField label="Data do leilão">
              <input type="datetime-local" value={form.leilao} onChange={e => set_('leilao', e.target.value)} />
            </WizardField>
            <WizardField label="Início dos jogos *">
              <input type="datetime-local" value={form.inicioFaseRegular} onChange={e => set_('inicioFaseRegular', e.target.value)} />
            </WizardField>
            <WizardField label="Início dos playoffs (estimado)">
              <input type="datetime-local" value={form.inicioPlayoffs} onChange={e => set_('inicioPlayoffs', e.target.value)} />
            </WizardField>
            <WizardField label="Grande Final (estimada)">
              <input type="datetime-local" value={form.granFinal} onChange={e => set_('granFinal', e.target.value)} />
            </WizardField>
          </div>
        )}

        {/* ── Formato ────────────────────────────────────────────────────── */}
        {current === 'formato' && (
          <div className="wizard-fields">
            <WizardField label="Fase Regular">
              <ToggleGroup options={['MD2','MD3']} value={form.formatoFaseRegular} onChange={v => set_('formatoFaseRegular', v)} />
            </WizardField>
            <WizardField label="Playoffs">
              <ToggleGroup options={['MD5','MD7']} value={form.formatoPlayoffs} onChange={v => set_('formatoPlayoffs', v)} />
            </WizardField>
            <WizardField label="Grande Final">
              <ToggleGroup options={['MD5','MD7']} value={form.formatoGranFinal} onChange={v => set_('formatoGranFinal', v)} />
            </WizardField>
            <WizardField label="Tipo de bracket">
              <ToggleGroup options={['dupla','simples']} labels={['Dupla eliminação','Chave simples']} value={form.tipoBracket} onChange={v => set_('tipoBracket', v)} />
            </WizardField>
            <div className="wizard-divider">Pontuação</div>
            <div className="wizard-row3">
              <NumberField label="Vitória" value={form.vitoria} min={0} max={10} onChange={v => set_('vitoria', v)} />
              <NumberField label="Empate"  value={form.empate}  min={0} max={10} onChange={v => set_('empate', v)} />
              <NumberField label="Derrota" value={form.derrota} min={0} max={10} onChange={v => set_('derrota', v)} />
              <NumberField label="W.O. vitória"    value={form.woVitoria}        min={0} max={10} onChange={v => set_('woVitoria', v)} />
              <NumberField label="Desempate vitória" value={form.desempateVitoria} min={0} max={10} onChange={v => set_('desempateVitoria', v)} />
            </div>
          </div>
        )}

        {/* ── Leilão ─────────────────────────────────────────────────────── */}
        {current === 'leilao' && (
          <div className="wizard-fields">
            <div className="wizard-row3">
              <NumberField label="Moedas por capitão" value={form.moedas}      min={1}  max={99} onChange={v => set_('moedas', v)} />
              <NumberField label="Mín. capitães"      value={form.minCaptains} min={2}  max={form.maxCaptains} onChange={v => set_('minCaptains', v)} />
              <NumberField label="Máx. capitães"      value={form.maxCaptains} min={form.minCaptains} max={12} onChange={v => set_('maxCaptains', v)} />
              <NumberField label="Mín. players"       value={form.minPlayers}  min={2}  max={form.maxPlayers} onChange={v => set_('minPlayers', v)} />
              <NumberField label="Máx. players"       value={form.maxPlayers}  min={form.minPlayers} max={15} onChange={v => set_('maxPlayers', v)} />
            </div>
            <WizardToggle label="Roubo ativo" desc="Capitães podem roubar jogadores de outros times" checked={form.rouboAtivo} onChange={v => set_('rouboAtivo', v)} />
            <WizardToggle label="Leilão de reservas" desc="Segunda rodada de compras para jogadores reservas" checked={form.leilaoReservas} onChange={v => set_('leilaoReservas', v)} />
          </div>
        )}

        {/* ── Admins ─────────────────────────────────────────────────────── */}
        {current === 'admins' && (
          <div className="wizard-fields">
            <WizardField label="Emails dos admins deste campeonato" hint="Separados por vírgula. Eles precisam ter feito login no site ao menos uma vez.">
              <textarea
                rows={4}
                value={form.adminsInput}
                onChange={e => set_('adminsInput', e.target.value)}
                placeholder="admin1@email.com, admin2@email.com"
              />
            </WizardField>
            <div style={{ padding: '12px 16px', background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              ℹ️ Como SuperAdmin você já terá acesso automaticamente. Outros admins precisam ter uma conta Google cadastrada no sistema.
            </div>
          </div>
        )}

        {/* ── Revisão ────────────────────────────────────────────────────── */}
        {current === 'revisao' && (
          <div className="wizard-revisao">
            <RevisaoItem titulo="Nome"            valor={form.nome || '—'} />
            <RevisaoItem titulo="Label"           valor={form.labelSeason || '—'} />
            <RevisaoItem titulo="Organizador"     valor={form.organizador || '—'} />
            <RevisaoItem titulo="Inscrições"      valor={form.inscricaoAbertura ? new Date(form.inscricaoAbertura).toLocaleString('pt-BR') : '—'} />
            <RevisaoItem titulo="Início dos jogos" valor={form.inicioFaseRegular ? new Date(form.inicioFaseRegular).toLocaleString('pt-BR') : '—'} />
            <RevisaoItem titulo="Formato"         valor={`Fase Regular: ${form.formatoFaseRegular} · Playoffs: ${form.formatoPlayoffs} · GF: ${form.formatoGranFinal}`} />
            <RevisaoItem titulo="Bracket"         valor={form.tipoBracket === 'dupla' ? 'Dupla eliminação' : 'Chave simples'} />
            <RevisaoItem titulo="Leilão"          valor={`${form.moedas} moedas · ${form.minCaptains}–${form.maxCaptains} capitães · ${form.minPlayers}–${form.maxPlayers} players`} />
            <RevisaoItem titulo="Roubo"           valor={form.rouboAtivo ? 'Ativo' : 'Desativado'} />
            <RevisaoItem titulo="Admins"          valor={form.adminsInput || 'Nenhum (só SuperAdmin)'} />
          </div>
        )}

        {/* Erro de validação */}
        {erro && <p className="wizard-erro">{erro}</p>}
      </div>

      {/* Navegação */}
      <div className="wizard-nav">
        {step > 0 && (
          <button className="btn" onClick={voltar}>← Voltar</button>
        )}
        <div style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <button className="btn primary" onClick={avancar}>Próximo →</button>
        ) : (
          <button className="btn primary" onClick={criar} disabled={saving}>
            {saving ? 'Criando...' : '✓ Criar Campeonato'}
          </button>
        )}
      </div>
    </main>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function WizardField({ label, hint, children }) {
  return (
    <div className="wizard-field">
      <div className="wizard-field-label">{label}</div>
      {hint && <div className="wizard-field-hint">{hint}</div>}
      {children}
    </div>
  )
}

function ToggleGroup({ options, labels, value, onChange }) {
  return (
    <div className="wizard-toggle-group">
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          className={`wizard-toggle-btn${value === o ? ' ativo' : ''}`}
          onClick={() => onChange(o)}
        >
          {labels?.[i] ?? o}
        </button>
      ))}
    </div>
  )
}

function WizardToggle({ label, desc, checked, onChange }) {
  return (
    <div className="wizard-toggle-row">
      <div>
        <div className="wizard-field-label">{label}</div>
        {desc && <div className="wizard-field-hint">{desc}</div>}
      </div>
      <div className={`wiz-switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
        <div className="wiz-switch-thumb" />
      </div>
    </div>
  )
}

function NumberField({ label, value, min, max, onChange }) {
  return (
    <div className="wizard-number-field">
      <div className="wizard-field-label">{label}</div>
      <div className="wizard-number-controls">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  )
}

function RevisaoItem({ titulo, valor }) {
  return (
    <div className="wizard-revisao-item">
      <span className="wizard-revisao-titulo">{titulo}</span>
      <span className="wizard-revisao-valor">{valor}</span>
    </div>
  )
}
