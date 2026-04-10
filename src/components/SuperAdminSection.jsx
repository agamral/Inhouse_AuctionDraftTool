import { useState, useEffect } from 'react'
import { ref, get, set, remove, onValue } from 'firebase/database'
import { db } from '../firebase/database'

export default function SuperAdminSection() {
  const [cupName, setCupName] = useState('')
  const [cupNameInput, setCupNameInput] = useState('')
  const [users, setUsers] = useState({})
  const [admins, setAdmins] = useState({})
  const [superAdmins, setSuperAdmins] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    const unsubs = [
      onValue(ref(db, '/config/settings/cupName'), (snap) => {
        const val = snap.val() ?? 'Copa Inhouse'
        setCupName(val)
        setCupNameInput(val)
      }),
      onValue(ref(db, '/users'), (snap) => setUsers(snap.val() ?? {})),
      onValue(ref(db, '/config/admins'), (snap) => setAdmins(snap.val() ?? {})),
      onValue(ref(db, '/config/superAdmins'), (snap) => setSuperAdmins(snap.val() ?? {})),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  async function saveCupName() {
    if (!cupNameInput.trim()) return
    setSaving(true)
    await set(ref(db, '/config/settings/cupName'), cupNameInput.trim())
    setSaving(false)
    flash('Nome salvo!')
  }

  async function promoteAdmin(uid) {
    await set(ref(db, `/config/admins/${uid}`), true)
    flash('Admin adicionado!')
  }

  async function demoteAdmin(uid) {
    await remove(ref(db, `/config/admins/${uid}`))
    flash('Admin removido!')
  }

  function flash(msg) {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(''), 2500)
  }

  const knownUsers = Object.entries(users)
  const adminUids = Object.keys(admins)
  const superAdminUids = Object.keys(superAdmins)

  return (
    <div className="admin-section superadmin-section">
      <div className="admin-section-title superadmin-title">
        ★ Super Admin
      </div>

      {/* Cup Name */}
      <div className="sa-block">
        <div className="admin-toggle-label">Nome da Copa</div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <input
            className="sa-input"
            value={cupNameInput}
            onChange={(e) => setCupNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCupName()}
            placeholder="Ex: Copa Inhouse #3"
          />
          <button className="btn primary" style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontSize: '13px' }}
            onClick={saveCupName} disabled={saving || cupNameInput === cupName}>
            Salvar
          </button>
        </div>
      </div>

      {/* Admins */}
      <div className="sa-block">
        <div className="admin-toggle-label" style={{ marginBottom: '10px' }}>Gerenciar Admins</div>

        {knownUsers.length === 0 ? (
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Nenhum usuário registrou login ainda.</p>
        ) : (
          <div className="sa-user-list">
            {knownUsers.map(([uid, info]) => {
              const isSA = superAdminUids.includes(uid)
              const isAdm = adminUids.includes(uid)
              return (
                <div key={uid} className="sa-user-row">
                  <div className="sa-user-info">
                    {info.photoURL
                      ? <img src={info.photoURL} alt="" referrerPolicy="no-referrer" className="sa-avatar" />
                      : <div className="sa-avatar sa-avatar-fallback">{(info.name ?? '?')[0].toUpperCase()}</div>
                    }
                    <div>
                      <div className="sa-user-name">{info.name}</div>
                      <div className="sa-user-email">{info.email}</div>
                    </div>
                  </div>
                  <div className="sa-user-actions">
                    {isSA && <span className="sa-badge sa-badge-super">Super Admin</span>}
                    {!isSA && isAdm && <span className="sa-badge sa-badge-admin">Admin</span>}
                    {!isSA && !isAdm && <span className="sa-badge">Usuário</span>}
                    {!isSA && (
                      isAdm
                        ? <button className="btn sa-btn-remove" onClick={() => demoteAdmin(uid)}>Remover</button>
                        : <button className="btn primary sa-btn-add" onClick={() => promoteAdmin(uid)}>+ Admin</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {savedMsg && (
        <div className="sa-toast">{savedMsg}</div>
      )}
    </div>
  )
}
