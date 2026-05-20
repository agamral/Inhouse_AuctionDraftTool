import { useState, useEffect } from 'react'
import { ref, set, onValue, update } from 'firebase/database'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { DEFAULT_CONTEUDO } from '../hooks/useConfig'
import { configModulesPath, configDraftPath, configConteudoPath } from '../utils/campeonatoPaths'
import SuperAdminSection        from '../components/SuperAdminSection'
import AdminPlayersSection      from '../components/AdminPlayersSection'
import AdminCaptainsSection     from '../components/AdminCaptainsSection'
import AdminDraftControl        from '../components/AdminDraftControl'
import AdminDraftSimulator      from '../components/AdminDraftSimulator'
import AdminHeroDraftSection    from '../components/AdminHeroDraftSection'
import AdminTeamsSection        from '../components/AdminTeamsSection'
import AdminRodadasSection      from '../components/AdminRodadasSection'
import AdminCapitaoAcesso       from '../components/AdminCapitaoAcesso'
import AdminMigracaoSection          from '../components/AdminMigracaoSection'
import AdminProvisionamentoSection   from '../components/AdminProvisionamentoSection'
import AdminEncerramentoSection      from '../components/AdminEncerramentoSection'
import AdminBotSetupSection          from '../components/AdminBotSetupSection'
import './Admin.css'

const ALL_TABS = [
  { id: 'geral',      label: 'Geral'      },
  { id: 'inscricoes', label: 'Inscrições' },
  { id: 'capitaes',   label: 'Capitães'   },
  { id: 'leilao',     label: 'Leilão'     },
  { id: 'times',      label: 'Times'      },
  { id: 'campeonato', label: 'Campeonato' },
  { id: 'sistema',    label: 'Sistema',   superAdminOnly: true },
]

export default function Admin() {
  const { isSuperAdmin, isAdmin, adminCampeonatoIds, loading: authLoading } = useAuth()
  const { campeonatoId, campeonato, campeonatos, setCampeonatoId, setPrincipal } = useCampeonato()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [aba, setAba] = useState('geral')

  // Championship admins don't belong on /admin — redirect to their championship
  useEffect(() => {
    if (authLoading) return
    if (!isSuperAdmin && isAdmin && adminCampeonatoIds?.length > 0) {
      navigate(`/campeonatos/${adminCampeonatoIds[0]}/admin`, { replace: true })
    }
  }, [authLoading, isSuperAdmin, isAdmin, adminCampeonatoIds]) // eslint-disable-line

  // Se vier com ?campeonato=id na URL (após wizard), seleciona aquele campeonato
  useEffect(() => {
    const paramId = searchParams.get('campeonato')
    if (paramId && campeonatos[paramId]) setCampeonatoId(paramId)
  }, [searchParams, campeonatos]) // eslint-disable-line

  const [modules, setModules] = useState({
    inscricaoAberta:      false,
    inscritosAbertos:     false,  // Lista de inscritos visível publicamente
    draftAtivo:           false,  // Leilão ativo
    espectadorAtivo:      false,  // Espectador do leilão
    campeonatoAtivo:      false,  // Campeonato iniciado (agendamento, tabela, chave, elenco)
    heroDraftAtivo:       false,  // Hero Draft disponível
    bannerInscritosAtivo: false,  // Banner de aviso na página de inscritos
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

  const [configLoading, setConfigLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [showMigracao, setShowMigracao] = useState(false)

  const tabs = ALL_TABS.filter(t => !t.superAdminOnly || isSuperAdmin)

  useEffect(() => {
    let n = 0
    const done = () => { if (++n === 2) setConfigLoading(false) }
    const u1 = onValue(ref(db, configModulesPath(campeonatoId)),  s => { if (s.exists()) setModules(p => ({ ...p, ...s.val() })); done() }, { onlyOnce: true })
    const u2 = onValue(ref(db, configDraftPath(campeonatoId)),    s => { if (s.exists()) setDraft(p   => ({ ...p, ...s.val() })); done() }, { onlyOnce: true })
    const u3 = onValue(ref(db, configConteudoPath(campeonatoId)), s => { if (s.exists()) setConteudo(p => ({ ...p, ...s.val() })) }, { onlyOnce: true })
    return () => { u1(); u2(); u3() }
  }, [campeonatoId])

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
        set(ref(db, configModulesPath(campeonatoId)),  modules),
        set(ref(db, configDraftPath(campeonatoId)),    draft),
        set(ref(db, configConteudoPath(campeonatoId)), conteudo),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || configLoading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>

  const campeonatosArr = Object.entries(campeonatos).sort(([,a],[,b]) => (b.info?.criadoEm ?? 0) - (a.info?.criadoEm ?? 0))

  return (
    <main className="page admin-dashboard">

      {/* ── Banner de contexto ────────────────────────────────────────────── */}
      <div className="admin-contexto-banner">
        <div className="admin-contexto-info">
          <span className="admin-contexto-dot" style={{ background: campeonato?.info?.principal ? 'var(--gold)' : 'var(--blue)' }} />
          <span className="admin-contexto-label">
            {campeonato
              ? <>Operando em: <strong style={{ color: 'var(--text)' }}>{campeonato.info?.nome ?? campeonatoId}</strong>
                  {campeonato.info?.principal && <span className="admin-contexto-badge">principal</span>}
                </>
              : <span style={{ color: 'var(--text3)' }}>Nenhum campeonato selecionado</span>
            }
          </span>
        </div>

        {/* Seletor e ações (SuperAdmin) */}
        {isSuperAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Seletor só aparece quando há campeonatos */}
            {campeonatosArr.length > 0 && (
              <select
                value={campeonatoId ?? ''}
                onChange={e => setCampeonatoId(e.target.value)}
                className="admin-contexto-select"
              >
                {campeonatosArr.map(([id, c]) => (
                  <option key={id} value={id}>{c.info?.nome ?? id}</option>
                ))}
              </select>
            )}
            {campeonato && !campeonato.info?.principal && (
              <button
                className="btn"
                style={{ fontSize: 11, padding: '3px 10px', color: 'var(--gold)', borderColor: 'rgba(201,168,76,0.35)' }}
                onClick={() => setPrincipal(campeonatoId)}
                title="Tornar este o campeonato exibido publicamente"
              >
                Tornar principal
              </button>
            )}
            {campeonato && (
              <button
                className="btn"
                style={{ fontSize: 11, padding: '3px 10px', color: campeonato.info?.visivel !== false ? 'var(--green)' : 'var(--text2)', borderColor: campeonato.info?.visivel !== false ? 'rgba(76,175,125,0.35)' : 'var(--border)' }}
                onClick={() => update(ref(db, `/campeonatos/${campeonatoId}/info`), { visivel: campeonato.info?.visivel === false ? true : false })}
                title={campeonato.info?.visivel !== false ? 'Ocultar da Home Mestre' : 'Exibir na Home Mestre'}
              >
                {campeonato.info?.visivel !== false ? '👁 Visível na home' : '🚫 Oculto da home'}
              </button>
            )}
            <Link to="/showmatch" className="btn" style={{ fontSize: 12, padding: '5px 14px', whiteSpace: 'nowrap', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.35)' }}>
              ⚡ Showmatch
            </Link>
            {/* + Novo sempre visível para SuperAdmin */}
            <Link to="/admin/novo-campeonato" className="btn primary" style={{ fontSize: 12, padding: '5px 14px', whiteSpace: 'nowrap' }}>
              + Novo campeonato
            </Link>
          </div>
        )}
      </div>

      <div className="admin-dash-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>
            {isSuperAdmin ? 'Painel SuperAdmin' : `${campeonato?.info?.nome ?? 'Painel Admin'}`}
          </h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            {isSuperAdmin ? 'Administração global · Copa Inhouse' : 'Administração do campeonato'}
          </p>
        </div>
        {/* Status rápido dos módulos */}
        <div className="admin-dash-status">
          {[
            { key: 'inscricaoAberta',  label: 'Inscrições' },
            { key: 'inscritosAbertos', label: 'Inscritos'  },
            { key: 'draftAtivo',       label: 'Leilão'     },
            { key: 'campeonatoAtivo',  label: 'Campeonato' },
            { key: 'heroDraftAtivo',   label: 'Hero Draft' },
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
        {tabs.map(t => (
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
                  label="Lista de inscritos visível"
                  desc="Libera a página de inscritos para acesso público"
                  checked={modules.inscritosAbertos}
                  onChange={() => toggleModule('inscritosAbertos')}
                />
                <ToggleRow
                  label="Banner na página de inscritos"
                  desc="Exibe aviso personalizado no topo da lista de inscritos"
                  checked={modules.bannerInscritosAtivo}
                  onChange={() => toggleModule('bannerInscritosAtivo')}
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
              <ContentField label="Banner de inscritos (texto)" value={conteudo.bannerInscritosTexto} onChange={v => setConteudoField('bannerInscritosTexto', v)} placeholder="Ex: Capitão será anunciado em breve — fique atento ao Discord!" hint="Ativado/desativado pelo toggle nos Módulos Ativos" />
              <ContentField label="Texto pós-inscrição" value={conteudo.posInscricaoTexto} onChange={v => setConteudoField('posInscricaoTexto', v)} placeholder="Mensagem exibida após o jogador se inscrever" multiline />
              <ContentField label="Prazo de disponibilidade" value={conteudo.prazoDisponibilidade} onChange={v => setConteudoField('prazoDisponibilidade', v)} placeholder="Ex: Marque até quinta-feira" />
              <ContentField label="Regras e Formato (Home)" value={conteudo.regrasFormato} onChange={v => setConteudoField('regrasFormato', v)} placeholder="Descreva o formato e regras do torneio. Aparece na Home quando preenchido." multiline />
              <div>
                <div className="admin-toggle-label" style={{ marginBottom: 8 }}>Canais de Transmissão (Twitch)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[1, 2, 3].map(n => (
                    <div key={n} style={{ display: 'flex', gap: 8 }}>
                      <input
                        style={{ flex: '0 0 160px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 13, outline: 'none' }}
                        placeholder={`Canal ${n} — nome`}
                        value={conteudo[`stream${n}Nome`]}
                        onChange={e => setConteudoField(`stream${n}Nome`, e.target.value)}
                      />
                      <input
                        style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 13, outline: 'none' }}
                        placeholder="https://twitch.tv/..."
                        value={conteudo[`stream${n}Url`]}
                        onChange={e => setConteudoField(`stream${n}Url`, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="admin-toggle-label" style={{ marginBottom: 8 }}>Redes Sociais</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: '▶ YouTube', key: 'youtubeUrl',  placeholder: 'https://youtube.com/@canal' },
                    { label: '📷 Instagram', key: 'instagramUrl', placeholder: 'https://instagram.com/perfil' },
                    { label: '💬 Discord', key: 'discordUrl',  placeholder: 'https://discord.gg/convite' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", minWidth: 90 }}>{label}</span>
                      <input
                        style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 13, outline: 'none' }}
                        placeholder={placeholder}
                        value={conteudo[key]}
                        onChange={e => setConteudoField(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <SaveBar saving={saving} saved={saved} onSave={handleSave} />
        </div>
      )}

      {/* INSCRIÇÕES */}
      {aba === 'inscricoes' && (
        <div className="admin-tab-content">
          <AdminPlayersSection />
        </div>
      )}

      {/* CAPITÃES */}
      {aba === 'capitaes' && (
        <div className="admin-tab-content">

          {/* Visibilidade pública */}
          <section className="admin-section">
            <div className="admin-section-title">Visibilidade Pública</div>
            <div className="admin-fields">
              <ToggleRow
                label="Capitães visíveis ao público"
                desc="Mostra o ⚑ ao lado do nome na lista de inscritos. Deixe desligado até o anúncio oficial."
                checked={modules.capitaesPublicos}
                onChange={() => toggleModule('capitaesPublicos')}
              />
            </div>
            <SaveBar saving={saving} saved={saved} onSave={handleSave} />
          </section>

          <AdminCaptainsSection draftConfig={draft} />
          <AdminCapitaoAcesso />

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
      {aba === 'sistema' && isSuperAdmin && (
        <div className="admin-tab-content">
          <AdminBotSetupSection />
          <AdminProvisionamentoSection />
          <AdminEncerramentoSection />
          <SuperAdminSection />

          {/* Migração — colapsada por ser de uso único */}
          <div className="admin-section" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
            <button
              className="admin-section-title"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text2)' }}
              onClick={() => setShowMigracao(v => !v)}
            >
              <span>🔄 Ferramenta de Migração</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{showMigracao ? '▲ recolher' : '▼ expandir'}</span>
            </button>
            {showMigracao && <AdminMigracaoSection />}
          </div>
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

function ContentField({ label, value, onChange, placeholder, multiline, hint }) {
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
      {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>{hint}</div>}
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
