import { useState, useEffect } from 'react'
import { ref, set, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import SuperAdminSection from '../components/SuperAdminSection'
import AdminPlayersSection from '../components/AdminPlayersSection'
import AdminCaptainsSection from '../components/AdminCaptainsSection'
import AdminDraftControl from '../components/AdminDraftControl'
import AdminDraftSimulator from '../components/AdminDraftSimulator'
import AdminHeroDraftSection from '../components/AdminHeroDraftSection'
import './Admin.css'

export default function Admin() {
  const { isSuperAdmin } = useAuth()

  const [modules, setModules] = useState({
    inscricaoAberta: false,
    draftAtivo: false,
    espectadorAtivo: false,
  })
  const [draft, setDraft] = useState({
    moedas: 15,
    minPlayers: 5,
    maxPlayers: 7,
    minCaptains: 2,
    maxCaptains: 8,
    rouboAtivo: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let loaded = 0
    const done = () => { if (++loaded === 2) setLoading(false) }

    const u1 = onValue(ref(db, '/config/modules'), (snap) => {
      if (snap.exists()) setModules((prev) => ({ ...prev, ...snap.val() }))
      done()
    }, { onlyOnce: true })

    const u2 = onValue(ref(db, '/config/draft'), (snap) => {
      if (snap.exists()) setDraft((prev) => ({ ...prev, ...snap.val() }))
      done()
    }, { onlyOnce: true })

    return () => { u1(); u2() }
  }, [])

  function toggleModule(key) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  function setDraftNum(key, val) {
    const n = parseInt(val)
    if (!isNaN(n)) setDraft((prev) => ({ ...prev, [key]: n }))
    setSaved(false)
  }

  function toggleDraft(key) {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all([
        set(ref(db, '/config/modules'), modules),
        set(ref(db, '/config/draft'), draft),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando configurações...</p></main>

  return (
    <main className="page">
      <h1 className="page-title">Admin</h1>
      <p className="page-subtitle">Painel de controle da Copa Inhouse</p>

      {isSuperAdmin && <SuperAdminSection />}

      <AdminPlayersSection />

      <AdminCaptainsSection draftConfig={draft} />

      <AdminDraftControl draftConfig={draft} />

      {isSuperAdmin && <AdminDraftSimulator />}

      <AdminHeroDraftSection />

      <div className="admin-grid">

        {/* Módulos */}
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
              label="Draft ativo"
              desc="Libera acesso à tela de draft para os capitães"
              checked={modules.draftAtivo}
              onChange={() => toggleModule('draftAtivo')}
            />
            <ToggleRow
              label="Espectador ativo"
              desc="Libera a tela de transmissão ao vivo"
              checked={modules.espectadorAtivo}
              onChange={() => toggleModule('espectadorAtivo')}
            />
          </div>
        </section>

        {/* Regras do leilão */}
        <section className="admin-section">
          <div className="admin-section-title">Regras do Leilão</div>
          <div className="admin-fields">
            <NumberField label="Moedas por capitão" value={draft.moedas} min={1} max={99} onChange={(v) => setDraftNum('moedas', v)} />
            <NumberField label="Mínimo de capitães" value={draft.minCaptains} min={2} max={draft.maxCaptains} onChange={(v) => setDraftNum('minCaptains', v)} />
            <NumberField label="Máximo de capitães" value={draft.maxCaptains} min={draft.minCaptains} max={8} onChange={(v) => setDraftNum('maxCaptains', v)} />
            <NumberField label="Mínimo de players" value={draft.minPlayers} min={2} max={draft.maxPlayers} onChange={(v) => setDraftNum('minPlayers', v)} />
            <NumberField label="Máximo de players" value={draft.maxPlayers} min={draft.minPlayers} max={15} onChange={(v) => setDraftNum('maxPlayers', v)} />
            <ToggleRow
              label="Roubo ativo"
              desc="Permite que capitães roubem players de outros times"
              checked={draft.rouboAtivo}
              onChange={() => toggleDraft('rouboAtivo')}
            />
          </div>
        </section>

      </div>

      <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button className="btn primary" style={{ fontSize: '14px', padding: '10px 24px' }} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : saved ? '✅ Salvo!' : 'Salvar configurações'}
        </button>
        {saved && <span style={{ color: 'var(--green)', fontSize: '13px' }}>Configurações aplicadas em tempo real.</span>}
      </div>

    </main>
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

function NumberField({ label, value, min, max, onChange }) {
  return (
    <div className="admin-number-field">
      <div className="admin-toggle-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button className="btn" style={{ padding: '4px 10px', fontSize: '16px' }} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '20px', fontWeight: 700, color: 'var(--gold2)', minWidth: '32px', textAlign: 'center' }}>{value}</span>
        <button className="btn" style={{ padding: '4px 10px', fontSize: '16px' }} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  )
}
