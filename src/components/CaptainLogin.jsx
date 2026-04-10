import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'

export default function CaptainLogin({ onLogin }) {
  const [captains, setCaptains] = useState({})
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)   // captainId
  const [pin, setPin]           = useState('')
  const [erro, setErro]         = useState('')
  const [tentando, setTentando] = useState(false)

  useEffect(() => {
    const unsub = onValue(ref(db, '/draftSession/captains'), (snap) => {
      setCaptains(snap.val() ?? {})
      setLoading(false)
    })
    return unsub
  }, [])

  const list = Object.entries(captains).sort(([, a], [, b]) => (a.seed ?? 99) - (b.seed ?? 99))

  function handleTeamSelect(id) {
    setSelected(id)
    setPin('')
    setErro('')
  }

  function handlePinChange(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(val)
    setErro('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!selected) return
    const cap = captains[selected]
    if (!cap) return

    setTentando(true)
    setTimeout(() => {
      if (pin === cap.pin) {
        const session = {
          captainId:   selected,
          nome:        cap.nome,
          capitaoNome: cap.capitaoNome ?? null,
          emoji:       cap.emoji,
          cor:         cap.cor,
          seed:        cap.seed,
        }
        sessionStorage.setItem('captainSession', JSON.stringify(session))
        onLogin(session)
      } else {
        setErro('PIN incorreto. Tente novamente.')
        setPin('')
      }
      setTentando(false)
    }, 400)
  }

  const selectedCap = selected ? captains[selected] : null

  return (
    <div style={{
      minHeight: 'calc(100vh - 65px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚔️</div>
          <h1 style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '26px', color: 'var(--text)', marginBottom: '6px' }}>
            Acesso do Capitão
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px' }}>
            Selecione seu time e insira o PIN fornecido pelo admin
          </p>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '14px' }}>Carregando times...</p>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg2)', color: 'var(--text2)', fontSize: '14px' }}>
            Nenhum time cadastrado ainda.
            <br />
            <span style={{ fontSize: '12px', opacity: 0.6 }}>Aguarde o admin configurar os times.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>

            {/* Team grid */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: '10px' }}>
                Seu time
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                {list.map(([id, cap]) => {
                  const isActive = selected === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleTeamSelect(id)}
                      style={{
                        border: `1px solid ${isActive ? cap.cor : 'var(--border)'}`,
                        borderRadius: '8px',
                        background: isActive ? cap.cor + '18' : 'var(--bg2)',
                        padding: '12px 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s',
                        outline: 'none',
                      }}
                    >
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '8px',
                        background: cap.cor + '22', border: `1px solid ${cap.cor}55`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
                      }}>
                        {cap.emoji}
                      </div>
                      <span style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: '13px', fontWeight: 600,
                        color: isActive ? cap.cor : 'var(--text)',
                        textAlign: 'center', lineHeight: 1.2,
                      }}>
                        {cap.nome}
                      </span>
                      {cap.capitaoNome && (
                        <span style={{ fontSize: '11px', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                          ⚑ {cap.capitaoNome}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* PIN input — só aparece após selecionar time */}
            {selectedCap && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: '10px' }}>
                  PIN do time <span style={{ color: selectedCap.cor }}>{selectedCap.nome}</span>
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={handlePinChange}
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--bg3)',
                    border: `1px solid ${erro ? 'var(--red)' : 'var(--border2)'}`,
                    borderRadius: '8px',
                    padding: '14px 16px',
                    color: 'var(--text)',
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: '28px',
                    fontWeight: 700,
                    letterSpacing: '0.4em',
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />
                {erro && (
                  <p style={{ color: 'var(--red)', fontSize: '13px', marginTop: '8px', textAlign: 'center' }}>{erro}</p>
                )}
              </div>
            )}

            {selectedCap && (
              <button
                type="submit"
                className="btn primary"
                disabled={pin.length < 4 || tentando}
                style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600 }}
              >
                {tentando ? 'Verificando...' : `Entrar como ${selectedCap.nome}`}
              </button>
            )}

          </form>
        )}
      </div>
    </div>
  )
}
