import { useState, useEffect } from 'react'
import { ref, get, set, remove, onValue } from 'firebase/database'
import { db } from '../firebase/database'

export default function SuperAdminSection() {
  const [users,      setUsers]      = useState({})
  const [admins,     setAdmins]     = useState({})
  const [superAdmins, setSuperAdmins] = useState({})
  const [savedMsg,   setSavedMsg]   = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const unsubs = [
      onValue(ref(db, '/users'),              (snap) => setUsers(snap.val() ?? {})),
      onValue(ref(db, '/config/admins'),      (snap) => setAdmins(snap.val() ?? {})),
      onValue(ref(db, '/config/superAdmins'), (snap) => setSuperAdmins(snap.val() ?? {})),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  async function promoteAdmin(uid) {
    await set(ref(db, `/config/admins/${uid}`), true)
    flash('Admin adicionado!')
  }

  async function demoteAdmin(uid) {
    await remove(ref(db, `/config/admins/${uid}`))
    flash('Admin removido!')
  }

  async function deleteUserRecord(uid) {
    await remove(ref(db, `/users/${uid}`))
    setConfirmDelete(null)
    flash('Registro removido.')
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
                    {!isSA && (
                      confirmDelete === uid ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Excluir registro?</span>
                          <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }}
                            onClick={() => deleteUserRecord(uid)}>Sim</button>
                          <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => setConfirmDelete(null)}>Não</button>
                        </div>
                      ) : (
                        <button className="btn" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.25)' }}
                          onClick={() => setConfirmDelete(uid)} title="Excluir registro de login">
                          🗑
                        </button>
                      )
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
