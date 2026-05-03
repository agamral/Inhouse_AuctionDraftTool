import { useState, useEffect } from 'react'
import { ref, onValue, set, remove } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'

function gerarToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function tempoRestante(expiraEm) {
  const diff = expiraEm - Date.now()
  if (diff <= 0) return 'expirado'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export default function AdminBotSetupSection() {
  const { campeonatoId, campeonato } = useCampeonato()
  const [setupToken,  setSetupToken]  = useState(null)
  const [botVinculo,  setBotVinculo]  = useState(null)
  const [copiado,     setCopiado]     = useState(false)
  const [tick,        setTick]        = useState(0)

  const campNome = campeonato?.info?.nome ?? campeonatoId

  useEffect(() => {
    if (!campeonatoId) return
    const u1 = onValue(ref(db, `/campeonatos/${campeonatoId}/setupToken`), s => setSetupToken(s.val()))
    const u2 = onValue(ref(db, `/campeonatos/${campeonatoId}/config/botCanais`), s => {
      const val = s.val()
      setBotVinculo(val ? Object.keys(val) : null)
    })
    return () => { u1(); u2() }
  }, [campeonatoId])

  // Atualiza o contador de tempo a cada minuto
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  async function gerarNovoToken() {
    const token = gerarToken()
    await set(ref(db, `/campeonatos/${campeonatoId}/setupToken`), {
      token,
      criadoEm:  Date.now(),
      expiraEm:  Date.now() + 24 * 60 * 60 * 1000,
      campNome:  campNome,
    })
  }

  async function revogarToken() {
    await remove(ref(db, `/campeonatos/${campeonatoId}/setupToken`))
  }

  function copiar(texto) {
    navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (!campeonatoId) return (
    <div className="admin-section">
      <div className="admin-section-title">🤖 Setup do Bot Discord</div>
      <p style={{ padding: '14px 18px', color: 'var(--text2)', fontSize: 13 }}>Selecione um campeonato no banner acima.</p>
    </div>
  )

  const tokenExpirado = setupToken && setupToken.expiraEm < Date.now()
  const tokenValido   = setupToken && !tokenExpirado

  return (
    <div className="admin-section">
      <div className="admin-section-title">🤖 Setup do Bot Discord</div>

      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Status do vínculo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: botVinculo?.length ? 'var(--green)' : 'var(--text3)', boxShadow: botVinculo?.length ? '0 0 6px var(--green)' : 'none' }} />
          {botVinculo?.length ? (
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              Bot vinculado em <strong style={{ color: 'var(--green)' }}>{botVinculo.length} servidor{botVinculo.length > 1 ? 'es' : ''}</strong> para <strong>{campNome}</strong>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>Bot não vinculado a este campeonato ainda.</span>
          )}
        </div>

        {/* Instruções */}
        <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(74,158,218,0.07)', border: '1px solid rgba(74,158,218,0.2)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>Como vincular:</strong>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Gere um token abaixo</li>
            <li>No Discord, execute: <code style={{ color: 'var(--gold2)', background: 'rgba(201,168,76,0.1)', padding: '1px 5px', borderRadius: 3 }}>/setup token:SEU_TOKEN</code></li>
            <li>O bot ficará vinculado a <strong>{campNome}</strong> permanentemente</li>
          </ol>
        </div>

        {/* Token atual */}
        {tokenValido && (
          <div style={{ padding: '14px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)' }}>
                Token ativo · expira em {tempoRestante(setupToken.expiraEm)}
              </span>
              <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.3)' }} onClick={revogarToken}>
                Revogar
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <code style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--text)', letterSpacing: '0.05em', wordBreak: 'break-all' }}>
                {setupToken.token}
              </code>
              <button
                className="btn primary"
                style={{ fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap' }}
                onClick={() => copiar(setupToken.token)}
              >
                {copiado ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Uso único — o token é consumido automaticamente após o setup no Discord.
            </div>
          </div>
        )}

        {tokenExpirado && (
          <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(224,85,85,0.07)', border: '1px solid rgba(224,85,85,0.2)', fontSize: 13, color: 'var(--red)' }}>
            Token expirado. Gere um novo.
          </div>
        )}

        {/* Botão gerar */}
        <button
          className="btn primary"
          style={{ fontSize: 13, padding: '9px 20px', alignSelf: 'flex-start' }}
          onClick={gerarNovoToken}
        >
          {tokenValido ? '↻ Gerar novo token' : '+ Gerar token de setup'}
        </button>

      </div>
    </div>
  )
}
