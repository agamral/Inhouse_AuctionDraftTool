import { useState, useEffect } from 'react'
import { ref, set, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import { DEFAULT_CONTEUDO } from '../hooks/useConfig'
import SuperAdminSection        from '../components/SuperAdminSection'
import AdminPlayersSection      from '../components/AdminPlayersSection'
import AdminCaptainsSection     from '../components/AdminCaptainsSection'
import AdminDraftControl        from '../components/AdminDraftControl'
import AdminDraftSimulator      from '../components/AdminDraftSimulator'
import AdminHeroDraftSection    from '../components/AdminHeroDraftSection'
import AdminTeamsSection        from '../components/AdminTeamsSection'
import AdminRodadasSection      from '../components/AdminRodadasSection'
import AdminCapitaoAcesso       from '../components/AdminCapitaoAcesso'
import './Admin.css'

const TABS = [
  { id: 'geral',      label: 'Geral'      },
  { id: 'inscricoes', label: 'Inscrições' },
  { id: 'leilao',     label: 'Leilão'     },
  { id: 'times',      label: 'Times'      },
  { id: 'campeonato', label: 'Campeonato' },
  { id: 'sistema',    label: 'Sistema'    },
]

export default function Admin() {
  const { isSuperAdmin } = useAuth()
  const [aba, setAba] = useState('geral')

  const [modules, setModules] = useState({
    inscricaoAberta:   false,
    draftAtivo:        false,  // Leilão ativo
    espectadorAtivo:   false,  // Espectador do leilão
    campeonatoAtivo:   false,  // Campeonato iniciado (agendamento, tabela, chave, elenco)
    heroDraftAtivo:    false,  // Hero Draft disponível
  })

  const [draft, setDraft] = useState({
    moedas:      15,
    minPlayers:  5,
    maxPlayers:  7,
    minCaptains: 2,
    maxCaptains: 8,
    rouboAtivo:  true,
  })

  const [conteudo, setConteudo] = useState(DEFAULT_CONTEUDO)

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    let n = 0
    const done = () => { if (++n === 2) setLoading(false) }
    const u1 = onValue(ref(db, '/config/modules'), s => { if (s.exists()) setModules(p => ({ ...p, ...s.val() })); done() }, { onlyOnce: true })
    const u2 = onValue(ref(db, '/config/draft'),   s => { if (s.exists()) setDraft(p   => ({ ...p, ...s.val() })); done() }, { onlyOnce: true })
    // conteudo carrega independente — não bloqueia o painel
    const u3 = onValue(ref(db, '/config/conteudo'), s => { if (s.exists()) setConteudo(p => ({ ...p, ...s.val() })) }, { onlyOnce: true })
    return () => { u1(); u2(); u3() }
  }, [])

  function setConteudoField(key, val) { setConteudo(p => ({ ...p, [key]: val })); setSaved(false) }

  function toggleModule(key) { setModules(p => ({ ...p, [key]: !p[key] })); setSaved(false) }
  function toggleDraft(key)  { setDraft(p   => ({ ...p, [key]: !p[key] })); setSaved(false) }
  function setDraftNum(key, val) {
    const n = parseInt(val)
    if (!isNaN(n)) setDraft(p => ({ ...p, [key]: n }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all([
        set(ref(db, '/config/modules'),  modules),
        set(ref(db, '/config/draft'),    draft),
        set(ref(db, '/config/conteudo'), conteudo),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>

  return (
    <main className="page admin-dashboard">
      <div className="admin-dash-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Painel Admin</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Copa Inhouse</p>
        </div>
        {/* Status rápido dos módulos */}
        <div className="admin-dash-status">
          {[
            { key: 'inscricaoAberta', label: 'Inscrições' },
            { key: 'draftAtivo',      label: 'Leilão'     },
            { key: 'campeonatoAtivo', label: 'Campeonato' },
            { key: 'heroDraftAtivo',  label: 'Hero Draft' },
          ].map(({ key, label }) => (
            <span key={key} className={`admin-status-pill ${modules[key] ? 'on' : 'off'}`}>
              <span className="admin-status-dot" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Abas ──────────────────────────────────────────────────────────────── */}
      <div className="admin-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`admin-tab${aba === t.id ? ' admin-tab--ativo' : ''}`}
            onClick={() => setAba(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo das abas ─────────────────────────────────────────────────── */}

      {/* GERAL */}
      {aba === 'geral' && (
        <div className="admin-tab-content">
          <div className="admin-grid" style={{ maxWidth: '100%' }}>

            {/* Módulos — o que está visível para os usuários */}
            <section className="admin-section">
              <div className="admin-section-title">Módulos Ativos</div>
              <div className="admin-toggles">
                <ToggleRow
                  label="Inscrições abertas"
                  desc="Exibe o link de inscrição no nav e permite novos envios"
                  checked={modules.inscricaoAberta}
                  onChange={() => toggleModule('inscricaoAberta')}
                />
                <ToggleRow
                  label="Leilão ativo"
                  desc="Libera o acesso ao leilão de times para capitães e admins"
                  checked={modules.draftAtivo}
                  onChange={() => toggleModule('draftAtivo')}
                />
                <ToggleRow
                  label="Espectador do leilão"
                  desc="Libera a tela de espectador do leilão de times"
                  checked={modules.espectadorAtivo}
                  onChange={() => toggleModule('espectadorAtivo')}
                />
                <ToggleRow
                  label="Campeonato ativo"
                  desc="Exibe agendamento, tabela, chave e elenco no nav"
                  checked={modules.campeonatoAtivo}
                  onChange={() => toggleModule('campeonatoAtivo')}
                />
                <ToggleRow
                  label="Hero Draft ativo"
                  desc="Libera as telas de draft de heróis e o espectador"
                  checked={modules.heroDraftAtivo}
                  onChange={() => toggleModule('heroDraftAtivo')}
                />
              </div>
            </section>

            {/* Modo Privacidade */}
            <section className="admin-section">
              <div className="admin-section-title">Transmissão</div>
              <div className="admin-toggles">
                <ToggleRow
                  label="Modo Privacidade"
                  desc="Oculta nomes, BattleTags e dados pessoais em todas as páginas — ideal para live"
                  checked={modules.privacidadeAtiva}
                  onChange={() => toggleModule('privacidadeAtiva')}
                />
              </div>
              {modules.privacidadeAtiva && (
                <div style={{ margin: '0 18px 16px', padding: '10px 14px', borderRadius: 6, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', fontSize: 13, color: 'var(--gold2)' }}>
                  🔒 Modo Privacidade ativo — nomes de jogadores aparecem como "Jogador #N" em todo o site e no bot.
                </div>
              )}
            </section>

            {/* Fase visual do campeonato */}
            <section className="admin-section">
              <div className="admin-section-title">Fase Atual</div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Pré-temporada',    ativo: !modules.inscricaoAberta && !modules.draftAtivo && !modules.campeonatoAtivo, desc: 'Nenhum módulo aberto' },
                  { label: 'Inscrições',        ativo: modules.inscricaoAberta,   desc: 'Players se inscrevendo' },
                  { label: 'Leilão de Times',   ativo: modules.draftAtivo,        desc: 'Capitães montando times' },
                  { label: 'Campeonato',        ativo: modules.campeonatoAtivo,   desc: 'Partidas em andamento' },
                  { label: 'Hero Draft',        ativo: modules.heroDraftAtivo,    desc: 'Draft de heróis ativo' },
                ].map(({ label, ativo, desc }) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 6, background: ativo ? 'rgba(76,175,125,0.08)' : 'var(--bg3)',
                    border: `1px solid ${ativo ? 'rgba(76,175,125,0.3)' : 'var(--border)'}`,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ativo ? 'var(--green)' : 'var(--text3)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, color: ativo ? 'var(--text)' : 'var(--text3)', fontWeight: ativo ? 600 : 400 }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* Conteúdo editável */}
          <section className="admin-section" style={{ maxWidth: '100%' }}>
            <div className="admin-section-title">Conteúdo do Site</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 18px' }}>
              <ContentField label="Nome da copa"        value={conteudo.cupName}           onChange={v => setConteudoField('cupName', v)} />
              <ContentField label="Label de temporada"  value={conteudo.labelSeason}       onChange={v => setConteudoField('labelSeason', v)}       placeholder="Ex: Season 2 · Heroes of the Storm" />
              <ContentField label="Descrição do torneio (Home)" value={conteudo.descricaoTorneio} onChange={v => setConteudoField('descricaoTorneio', v)} placeholder="Breve descrição exibida na Home para novos visitantes" />
              <ContentField label="Próximo evento"      value={conteudo.proximoEvento}     onChange={v => setConteudoField('proximoEvento', v)}     placeholder="Ex: Sábado, 10 de Maio · 20h BRT" />
              <ContentField label="Texto pós-inscrição" value={conteudo.posInscricaoTexto} onChange={v => setConteudoField('posInscricaoTexto', v)} placeholder="Mensagem exibida após o jogador se inscrever" multiline />
              <ContentField label="Prazo de disponibilidade" value={conteudo.prazoDisponibilidade} onChange={v => setConteudoField('prazoDisponibilidade', v)} placeholder="Ex: Marque até quinta-feira" />
            </div>
          </section>

          <SaveBar saving={saving} saved={saved} onSave={handleSave} />
        </div>
      )}

      {/* INSCRIÇÕES */}
      {aba === 'inscricoes' && (
        <div className="admin-tab-content">
          <AdminPlayersSection />
          <AdminCaptainsSection draftConfig={draft} />
        </div>
      )}

      {/* LEILÃO */}
      {aba === 'leilao' && (
        <div className="admin-tab-content">
          <AdminDraftControl draftConfig={draft} />

          {/* Regras */}
          <section className="admin-section">
            <div className="admin-section-title">Regras do Leilão</div>
            <div className="admin-fields">
              <NumberField label="Moedas por capitão"   value={draft.moedas}      min={1}               max={99}             onChange={v => setDraftNum('moedas', v)} />
              <NumberField label="Mínimo de capitães"   value={draft.minCaptains} min={2}               max={draft.maxCaptains} onChange={v => setDraftNum('minCaptains', v)} />
              <NumberField label="Máximo de capitães"   value={draft.maxCaptains} min={draft.minCaptains} max={8}            onChange={v => setDraftNum('maxCaptains', v)} />
              <NumberField label="Mínimo de players"    value={draft.minPlayers}  min={2}               max={draft.maxPlayers} onChange={v => setDraftNum('minPlayers', v)} />
              <NumberField label="Máximo de players"    value={draft.maxPlayers}  min={draft.minPlayers} max={15}           onChange={v => setDraftNum('maxPlayers', v)} />
              <ToggleRow label="Roubo ativo" desc="Capitães podem roubar players já comprados" checked={draft.rouboAtivo} onChange={() => toggleDraft('rouboAtivo')} />
            </div>
          </section>

          {isSuperAdmin && <AdminDraftSimulator />}

          <SaveBar saving={saving} saved={saved} onSave={handleSave} />
        </div>
      )}

      {/* TIMES */}
      {aba === 'times' && (
        <div className="admin-tab-content">
          <AdminTeamsSection />
          <AdminCapitaoAcesso />
        </div>
      )}

      {/* CAMPEONATO */}
      {aba === 'campeonato' && (
        <div className="admin-tab-content">
          <AdminRodadasSection />
          <AdminHeroDraftSection />
        </div>
      )}

      {/* SISTEMA */}
      {aba === 'sistema' && (
        <div className="admin-tab-content">
          {isSuperAdmin && <SuperAdminSection />}
        </div>
      )}

    </main>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function SaveBar({ saving, saved, onSave }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
      <button className="btn primary" style={{ fontSize: 14, padding: '10px 24px' }} onClick={onSave} disabled={saving}>
        {saving ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar configurações'}
      </button>
      {saved && <span style={{ color: 'var(--green)', fontSize: 13 }}>Aplicado em tempo real.</span>}
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <label className="admin-toggle-row">
      <div className="admin-toggle-info">
        <div className="admin-toggle-label">{label}</div>
        {desc && <div className="admin-toggle-desc">{desc}</div>}
      </div>
      <div className={`admin-toggle-switch ${checked ? 'on' : ''}`} onClick={onChange}>
        <div className="admin-toggle-thumb" />
      </div>
    </label>
  )
}

function ContentField({ label, value, onChange, placeholder, multiline }) {
  const style = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
    padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
    fontSize: 13, outline: 'none', resize: 'vertical',
  }
  return (
    <div>
      <div className="admin-toggle-label" style={{ marginBottom: 6 }}>{label}</div>
      {multiline
        ? <textarea rows={3} style={style} value={value} placeholder={placeholder ?? ''} onChange={e => onChange(e.target.value)} />
        : <input style={style} value={value} placeholder={placeholder ?? ''} onChange={e => onChange(e.target.value)} />
      }
    </div>
  )
}

function NumberField({ label, value, min, max, onChange }) {
  return (
    <div className="admin-number-field">
      <div className="admin-toggle-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn" style={{ padding: '4px 10px', fontSize: 16 }} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--gold2)', minWidth: 32, textAlign: 'center' }}>{value}</span>
        <button className="btn" style={{ padding: '4px 10px', fontSize: 16 }} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  )
}
