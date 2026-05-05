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
  const [setupToken,    setSetupToken]    = useState(null)
  const [botCanais,     setBotCanais]     = useState({})   // guildId → { vinculo, canal_leilao, ... }
  const [guildsInfo,    setGuildsInfo]    = useState({})   // guildId → { guildName, campeonatoId, ... }
  const [copiado,       setCopiado]       = useState(false)
  const [confirmDescon, setConfirmDescon] = useState(null) // guildId em confirmação
  const [tick,          setTick]          = useState(0)

  const campNome = campeonato?.info?.nome ?? campeonatoId

  useEffect(() => {
    if (!campeonatoId) return
    const u1 = onValue(ref(db, `/campeonatos/${campeonatoId}/setupToken`),        s => setSetupToken(s.val()))
    const u2 = onValue(ref(db, `/campeonatos/${campeonatoId}/config/botCanais`),  s => setBotCanais(s.val() ?? {}))
    const u3 = onValue(ref(db, `/botGuilds`), s => setGuildsInfo(s.val() ?? {}))
    return () => { u1(); u2(); u3() }
  }, [campeonatoId])

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  async function gerarNovoToken() {
    const token = gerarToken()
    await set(ref(db, `/campeonatos/${campeonatoId}/setupToken`), {
      token,
      criadoEm: Date.now(),
      expiraEm: Date.now() + 24 * 60 * 60 * 1000,
      campNome,
    })
  }

  async function revogarToken() {
    await remove(ref(db, `/campeonatos/${campeonatoId}/setupToken`))
  }

  async function desconectarServidor(guildId) {
    await Promise.all([
      remove(ref(db, `/botGuilds/${guildId}`)),
      remove(ref(db, `/campeonatos/${campeonatoId}/config/botCanais/${guildId}`)),
    ])
    setConfirmDescon(null)
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

  // Servidores vinculados a ESTE campeonato
  const servidoresVinculados = Object.entries(guildsInfo)
    .filter(([gid, info]) => info?.campeonatoId === campeonatoId)

  return (
    <div className="admin-section">
      <div className="admin-section-title">🤖 Setup do Bot Discord</div>

      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Servidores conectados */}
        <div>
          <div className="admin-toggle-label" style={{ marginBottom: 8 }}>
            Servidores conectados
            {servidoresVinculados.length > 0 && (
              <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>({servidoresVinculados.length})</span>
            )}
          </div>

          {servidoresVinculados.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text3)' }} />
              Nenhum servidor conectado ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {servidoresVinculados.map(([gid, info]) => {
                const canais  = botCanais[gid] ?? {}
                const nCanais = Object.keys(canais).filter(k => k.startsWith('canal_')).length
                return (
                  <div key={gid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 5px var(--green)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                        {info.guildName ?? gid}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {nCanais > 0 ? `${nCanais} canal${nCanais > 1 ? 'is' : ''} configurado${nCanais > 1 ? 's' : ''}` : 'sem canais configurados'}
                        {info.linkedAt && ` · vinculado em ${new Date(info.linkedAt).toLocaleDateString('pt-BR')}`}
                      </div>
                    </div>
                    {confirmDescon === gid ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: 'var(--text2)' }}>Desconectar?</span>
                        <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.4)' }}
                          onClick={() => desconectarServidor(gid)}>Sim</button>
                        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => setConfirmDescon(null)}>Não</button>
                      </div>
                    ) : (
                      <button className="btn" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.25)', flexShrink: 0 }}
                        onClick={() => setConfirmDescon(gid)}
                        title="Desconectar este servidor">
                        Desconectar
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Instruções */}
        <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(74,158,218,0.07)', border: '1px solid rgba(74,158,218,0.2)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>Como vincular um novo servidor:</strong>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Gere um token abaixo</li>
            <li>No Discord: <code style={{ color: 'var(--gold2)', background: 'rgba(201,168,76,0.1)', padding: '1px 5px', borderRadius: 3 }}>/setup token:SEU_TOKEN</code></li>
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
              <button className="btn primary" style={{ fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap' }}
                onClick={() => copiar(setupToken.token)}>
                {copiado ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Uso único — consumido automaticamente após o setup no Discord.
            </div>
          </div>
        )}

        {tokenExpirado && (
          <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(224,85,85,0.07)', border: '1px solid rgba(224,85,85,0.2)', fontSize: 13, color: 'var(--red)' }}>
            Token expirado. Gere um novo.
          </div>
        )}

        <button className="btn primary" style={{ fontSize: 13, padding: '9px 20px', alignSelf: 'flex-start' }}
          onClick={gerarNovoToken}>
          {tokenValido ? '↻ Gerar novo token' : '+ Gerar token de setup'}
        </button>

      </div>
    </div>
  )
}
