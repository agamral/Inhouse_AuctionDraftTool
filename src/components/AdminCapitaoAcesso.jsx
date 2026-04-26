/**
 * Painel para criar/gerenciar contas de acesso dos capitães.
 * Detecta automaticamente o melhor identificador disponível no time.
 */
import { useState, useEffect } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase/database'
import { criarContaCapitao, gerarEmailSintetico, emailEhSintetico } from '../firebase/auth'

function gerarSenha() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let s = 'Copa@'
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * Detecta o melhor email/identificador disponível no time.
 * Retorna { email, sintetico, fonte } onde fonte descreve de onde veio.
 */
function detectarIdentificador(team) {
  // 1. Email real já definido
  if (team.capitaoEmail && !emailEhSintetico(team.capitaoEmail)) {
    return { email: team.capitaoEmail, sintetico: false, fonte: 'Email cadastrado' }
  }

  // 2. Jogador marcado como capitão
  const capJogador = (team.jogadores ?? []).find(j => j.isCaptain)
  if (capJogador?.nome) {
    return {
      email: gerarEmailSintetico(capJogador.nome),
      sintetico: true,
      fonte: `Nome do capitão: ${capJogador.nome}`,
    }
  }

  // 3. Campo capitaoNome (times do leilão)
  if (team.capitaoNome) {
    return {
      email: gerarEmailSintetico(team.capitaoNome),
      sintetico: true,
      fonte: `Capitão do leilão: ${team.capitaoNome}`,
    }
  }

  // 4. Primeiro jogador da lista
  const primeiro = team.jogadores?.[0]
  if (primeiro?.nome) {
    return {
      email: gerarEmailSintetico(primeiro.nome),
      sintetico: true,
      fonte: `Primeiro jogador: ${primeiro.nome}`,
    }
  }

  // 5. Nome do time como último recurso
  return {
    email: gerarEmailSintetico(team.nome),
    sintetico: true,
    fonte: `Nome do time: ${team.nome}`,
  }
}

export default function AdminCapitaoAcesso() {
  const [teams,    setTeams]    = useState({})
  const [senhas,   setSenhas]   = useState({})
  const [criando,  setCriando]  = useState(null)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => onValue(ref(db, '/teams'), snap => setTeams(snap.val() ?? {})), [])

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 6000)
  }

  async function handleCriarAcesso(teamId, team) {
    const { email, sintetico } = detectarIdentificador(team)
    const senha = gerarSenha()

    setCriando(teamId)
    try {
      const uid = await criarContaCapitao(email, senha)
      await update(ref(db, `/teams/${teamId}`), { capitaoUid: uid, capitaoEmail: email })
      setSenhas(s => ({ ...s, [teamId]: { email, senha, sintetico } }))
      flash('ok', `Conta criada para ${team.nome}.`)
    } catch (e) {
      // Email já em uso no Firebase Auth → tenta com sufixo do time
      if (e.message.includes('EMAIL_EXISTS')) {
        try {
          const emailAlt = gerarEmailSintetico(team.nome + '-' + teamId.slice(-4))
          const uid = await criarContaCapitao(emailAlt, senha)
          await update(ref(db, `/teams/${teamId}`), { capitaoUid: uid, capitaoEmail: emailAlt })
          setSenhas(s => ({ ...s, [teamId]: { email: emailAlt, senha, sintetico: true } }))
          flash('ok', `Conta criada com email alternativo (original já existia).`)
        } catch (e2) {
          flash('erro', `Erro: ${e2.message}`)
        }
      } else {
        flash('erro', `Erro: ${e.message}`)
      }
    } finally {
      setCriando(null)
    }
  }

  async function handleRemoverAcesso(teamId) {
    await update(ref(db, `/teams/${teamId}`), { capitaoUid: null, capitaoEmail: null })
    setSenhas(s => { const n = { ...s }; delete n[teamId]; return n })
    flash('ok', 'Acesso removido.')
  }

  const todosTeams = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))

  return (
    <section className="admin-section" style={{ maxWidth: 860, borderColor: 'rgba(74,158,218,0.25)' }}>
      <div className="admin-section-title" style={{ color: 'var(--blue)' }}>
        Acesso dos Capitães
      </div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {feedback && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13,
            background: feedback.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
            border: `1px solid ${feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
            color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {feedback.msg}
          </div>
        )}

        {todosTeams.length === 0 && (
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhum time cadastrado.</p>
        )}

        {todosTeams.map(([id, team]) => {
          const temUid = !!team.capitaoUid
          const cred   = senhas[id]
          const { email: emailPrev, sintetico: sintPrev, fonte } = detectarIdentificador(team)

          return (
            <div key={id} style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${team.cor ?? 'var(--border)'}`,
              borderRadius: 6, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: team.cor }}>
                    {team.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 3 }}>
                    {temUid ? (
                      emailEhSintetico(team.capitaoEmail)
                        ? <span style={{ color: 'var(--gold)' }}>🔑 Chave: {team.capitaoEmail}</span>
                        : <span>📧 {team.capitaoEmail}</span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>
                        Vai usar: <strong style={{ color: sintPrev ? 'var(--gold)' : 'var(--text2)' }}>{emailPrev}</strong>
                        {' '}({fonte})
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {temUid ? (
                    <>
                      <span style={{
                        fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        background: 'rgba(76,175,125,0.12)', border: '1px solid var(--green)',
                        color: 'var(--green)', borderRadius: 4, padding: '2px 8px',
                      }}>
                        ✓ Ativo
                      </span>
                      <button className="btn"
                        style={{ fontSize: 11, padding: '3px 8px', borderColor: 'rgba(224,85,85,0.4)', color: 'var(--text2)' }}
                        onClick={() => handleRemoverAcesso(id)}>
                        Remover
                      </button>
                    </>
                  ) : (
                    <button className="btn primary"
                      style={{ fontSize: 12, padding: '5px 14px' }}
                      onClick={() => handleCriarAcesso(id, team)}
                      disabled={criando === id}>
                      {criando === id ? 'Criando...' : '+ Criar acesso'}
                    </button>
                  )}
                </div>
              </div>

              {/* Credenciais geradas */}
              {cred && (
                <div style={{
                  background: 'rgba(201,168,76,0.08)', border: '1px solid var(--gold)',
                  borderRadius: 6, padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {cred.sintetico ? '🔑 Chave de acesso (provisória)' : '✉️ Credenciais de acesso'}
                  </div>
                  {[
                    { label: cred.sintetico ? 'Chave' : 'Email', val: cred.email },
                    { label: 'Senha', val: cred.senha },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text3)', minWidth: 44, fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif" }}>{label}</span>
                      <span style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: 13, flex: 1 }}>{val}</span>
                      <button onClick={() => navigator.clipboard.writeText(val)}
                        style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                        title="Copiar">⎘</button>
                    </div>
                  ))}
                  {cred.sintetico && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>
                      O capitão será solicitado a definir email real e senha no primeiro acesso.
                    </div>
                  )}
                  <button onClick={() => setSenhas(s => { const n = { ...s }; delete n[id]; return n })}
                    style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                    Ocultar
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>
          ⚠ As credenciais são exibidas <strong>uma única vez</strong>. Copie antes de fechar.
        </p>
      </div>
    </section>
  )
}
