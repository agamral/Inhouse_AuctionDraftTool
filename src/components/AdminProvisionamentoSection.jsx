import { useState, useEffect } from 'react'
import { ref, onValue, set, remove } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'

const sanitize   = (email) => email.toLowerCase().replace(/\./g, ',')
const desanitize = (key)   => key.replace(/,/g, '.')

export default function AdminProvisionamentoSection() {
  const { campeonatoId, campeonato } = useCampeonato()
  const [admins,    setAdmins]    = useState({})
  const [pendentes, setPendentes] = useState({})
  const [users,     setUsers]     = useState({})
  const [email,     setEmail]     = useState('')
  const [msg,       setMsg]       = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)

  useEffect(() => {
    if (!campeonatoId) return
    const u1 = onValue(ref(db, `/campeonatos/${campeonatoId}/admins`),          s => setAdmins(s.val() ?? {}))
    const u2 = onValue(ref(db, `/campeonatos/${campeonatoId}/adminsPendentes`), s => setPendentes(s.val() ?? {}))
    const u3 = onValue(ref(db, '/users'), s => setUsers(s.val() ?? {}))
    return () => { u1(); u2(); u3() }
  }, [campeonatoId])

  function flash(text, tipo = 'ok') {
    setMsg({ text, tipo })
    setTimeout(() => setMsg(null), 3000)
  }

  async function convidar() {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) return flash('Email inválido.', 'err')
    const key = sanitize(e)
    await set(ref(db, `/campeonatos/${campeonatoId}/adminsPendentes/${key}`), {
      email: e,
      adicionadoEm: Date.now(),
    })
    setEmail('')
    flash(`Convite enviado para ${e}. Ela se torna admin ao fazer o primeiro login.`)
  }

  async function removerAdmin(uid) {
    await remove(ref(db, `/campeonatos/${campeonatoId}/admins/${uid}`))
    setConfirmRemove(null)
    flash('Admin removido.')
  }

  async function cancelarConvite(key) {
    await remove(ref(db, `/campeonatos/${campeonatoId}/adminsPendentes/${key}`))
    flash('Convite cancelado.')
  }

  const adminsArr   = Object.entries(admins)
  const pendentesArr = Object.entries(pendentes)
  const campNome = campeonato?.info?.nome ?? campeonatoId

  if (!campeonatoId) {
    return (
      <div className="admin-section">
        <div className="admin-section-title">Admins do Campeonato</div>
        <p style={{ padding: '14px 18px', color: 'var(--text2)', fontSize: 13 }}>Selecione um campeonato no banner acima.</p>
      </div>
    )
  }

  return (
    <div className="admin-section">
      <div className="admin-section-title">Admins — {campNome}</div>

      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Convidar novo admin */}
        <div>
          <div className="admin-toggle-label" style={{ marginBottom: 8 }}>Convidar admin por Gmail</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="sa-input"
              style={{ flex: 1 }}
              placeholder="nome@gmail.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && convidar()}
              type="email"
            />
            <button className="btn primary" style={{ fontSize: 13, padding: '8px 16px', whiteSpace: 'nowrap' }} onClick={convidar}>
              + Convidar
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
            A pessoa se torna admin automaticamente ao fazer o primeiro login com este Gmail.
          </p>
        </div>

        {/* Admins confirmados */}
        <div>
          <div className="admin-toggle-label" style={{ marginBottom: 8 }}>
            Admins confirmados
            {adminsArr.length > 0 && <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>({adminsArr.length})</span>}
          </div>
          {adminsArr.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum admin confirmado ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {adminsArr.map(([uid]) => {
                const u = users[uid]
                return (
                  <div key={uid} className="sa-user-row">
                    <div className="sa-user-info">
                      {u?.photoURL
                        ? <img src={u.photoURL} alt="" referrerPolicy="no-referrer" className="sa-avatar" />
                        : <div className="sa-avatar sa-avatar-fallback">{(u?.name ?? '?')[0].toUpperCase()}</div>
                      }
                      <div>
                        <div className="sa-user-name">{u?.name ?? uid}</div>
                        <div className="sa-user-email">{u?.email ?? uid}</div>
                      </div>
                    </div>
                    <div className="sa-user-actions">
                      <span className="sa-badge sa-badge-admin">Admin</span>
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        title="Copiar link de acesso ao painel"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/campeonatos/${campeonatoId}/login`)
                          flash('Link copiado!')
                        }}
                      >
                        📋 Link
                      </button>
                      {confirmRemove === uid ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Remover?</span>
                          <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }} onClick={() => removerAdmin(uid)}>Sim</button>
                          <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setConfirmRemove(null)}>Não</button>
                        </div>
                      ) : (
                        <button className="btn sa-btn-remove" onClick={() => setConfirmRemove(uid)}>Remover</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Convites pendentes */}
        {pendentesArr.length > 0 && (
          <div>
            <div className="admin-toggle-label" style={{ marginBottom: 8 }}>
              Convites pendentes
              <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>({pendentesArr.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendentesArr.map(([key, val]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{val.email ?? desanitize(key)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Aguardando primeiro login · convidado {new Date(val.adicionadoEm).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed'", color: 'var(--gold)', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 4, padding: '2px 7px' }}>
                    pendente
                  </span>
                  <button className="btn" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.25)' }} onClick={() => cancelarConvite(key)}>
                    Cancelar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mensagem */}
        {msg && (
          <div style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, color: msg.tipo === 'err' ? 'var(--red)' : 'var(--green)', background: msg.tipo === 'err' ? 'rgba(224,85,85,0.08)' : 'rgba(76,175,125,0.08)', border: `1px solid ${msg.tipo === 'err' ? 'rgba(224,85,85,0.25)' : 'rgba(76,175,125,0.25)'}` }}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  )
}
