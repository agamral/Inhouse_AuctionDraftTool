/**
 * Showmatch do Capitão — página principal do host
 * Rota: /campeonatos/:id/scrim
 *
 * Permite ao capitão criar sessões de scrim/showmatch entre times,
 * gerenciar as partidas (lobby → hero draft → resultado) e ver o
 * histórico de sessões passadas. Não afeta dados do campeonato real.
 */
import { useState, useEffect } from 'react'
import { ref, onValue, set, update, remove, push } from 'firebase/database'
import { db } from '../firebase/database'
import { useAuth } from '../hooks/useAuth'
import { useCampeonato } from '../contexts/CampeonatoContext'
import { teamPath } from '../utils/campeonatoPaths'
import PaginaInativa from '../components/PaginaInativa'

function gerarSessaoId() {
  return `scrim-${Date.now().toString(36).slice(-5)}-${Math.random().toString(36).slice(2, 5)}`
}

const SCRIM_PATH = (uid) => `scrims/${uid}`  // /scrims/{criadorUid}/{sessaoId}

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6,
  padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

export default function ShowmatchCapitaoHost() {
  const { user, capitao, isAdmin } = useAuth()
  const { idPublico } = useCampeonato()

  const [teams,    setTeams]    = useState({})
  const [sessoes,  setSessoes]  = useState({})
  const [view,     setView]     = useState('lista')   // 'lista' | 'criar' | 'sessao'
  const [sessaoSel, setSessaoSel] = useState(null)    // id da sessão em foco
  const [feedback, setFeedback] = useState(null)
  const [salvando, setSalvando] = useState(false)

  // Formulário de nova sessão
  const [formNome,  setFormNome]  = useState('')
  const [formTimeA, setFormTimeA] = useState('')  // teamId do meu time (A)
  const [formTimeB, setFormTimeB] = useState('')  // teamId do adversário (B)

  const uid = user?.uid

  // Times do campeonato (pra selecionar adversário)
  useEffect(() => {
    if (!idPublico) return
    return onValue(ref(db, teamPath(idPublico)), snap => setTeams(snap.val() ?? {}))
  }, [idPublico])

  // Sessões criadas por este capitão
  useEffect(() => {
    if (!uid) return
    return onValue(ref(db, SCRIM_PATH(uid)), snap => setSessoes(snap.val() ?? {}))
  }, [uid])

  // Pré-seleciona o time do capitão como Time A
  useEffect(() => {
    if (!capitao || Object.keys(teams).length === 0) return
    const meuTimeId = Object.entries(teams).find(([, t]) =>
      t.capitaoNome === capitao.capitaoNome || t.capitaoUid === uid
    )?.[0]
    if (meuTimeId) setFormTimeA(meuTimeId)
  }, [capitao, teams, uid]) // eslint-disable-line

  function flash(tipo, msg) {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function criarSessao() {
    if (!formNome.trim()) return flash('erro', 'Dê um nome pra sessão.')
    if (!formTimeA || !formTimeB) return flash('erro', 'Selecione os dois times.')
    if (formTimeA === formTimeB) return flash('erro', 'Os dois times precisam ser diferentes.')

    const tA = teams[formTimeA]
    const tB = teams[formTimeB]

    setSalvando(true)
    try {
      const sessaoId = gerarSessaoId()
      await set(ref(db, `${SCRIM_PATH(uid)}/${sessaoId}`), {
        nome:        formNome.trim(),
        campeonatoId: idPublico,
        criadorUid:  uid,
        criadorNome: capitao?.capitaoNome ?? capitao?.nome ?? '',
        timeA: { teamId: formTimeA, nome: tA?.nome ?? 'Time A', cor: tA?.cor ?? '#4a9eda' },
        timeB: { teamId: formTimeB, nome: tB?.nome ?? 'Time B', cor: tB?.cor ?? '#e05555' },
        status:    'ativa',
        criadoEm:  Date.now(),
        partidas:  {},
      })
      setSessaoSel(sessaoId)
      setView('sessao')
      setFormNome('')
      flash('ok', `Sessão "${formNome.trim()}" criada!`)
    } catch (e) {
      flash('erro', `Erro: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  async function encerrarSessao(sessaoId) {
    await update(ref(db, `${SCRIM_PATH(uid)}/${sessaoId}`), { status: 'encerrada' })
    flash('ok', 'Sessão encerrada.')
  }

  async function deletarSessao(sessaoId) {
    await remove(ref(db, `${SCRIM_PATH(uid)}/${sessaoId}`))
    if (sessaoSel === sessaoId) { setSessaoSel(null); setView('lista') }
    flash('ok', 'Sessão removida.')
  }

  // Guard
  if (!isAdmin && !capitao) {
    return <PaginaInativa icone="⚔️" titulo="Acesso restrito" descricao="Esta área é exclusiva para capitães de times." />
  }

  const sessoesArr = Object.entries(sessoes).sort(([, a], [, b]) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0))
  const timesArr   = Object.entries(teams).sort(([, a], [, b]) => a.nome.localeCompare(b.nome))

  return (
    <main className="page" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Scrims & Showmatches</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Partidas casuais fora do campeonato — resultados não afetam a tabela.
          </p>
        </div>
        {view === 'lista' && (
          <button className="btn primary" style={{ fontSize: 13, padding: '8px 18px' }}
            onClick={() => setView('criar')}>
            + Nova sessão
          </button>
        )}
        {(view === 'criar' || view === 'sessao') && (
          <button className="btn" style={{ fontSize: 13, padding: '8px 14px' }}
            onClick={() => { setView('lista'); setSessaoSel(null) }}>
            ← Voltar
          </button>
        )}
      </div>

      {feedback && (
        <div style={{
          padding: '8px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16,
          background: feedback.tipo === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,85,85,0.12)',
          border: `1px solid ${feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: feedback.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* ── Criar sessão ──────────────────────────────────────────────────── */}
      {view === 'criar' && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 17 }}>Nova sessão</div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
              Nome da sessão
            </label>
            <input
              value={formNome}
              onChange={e => setFormNome(e.target.value)}
              placeholder="Ex: Scrim vs Exorr — 30/05"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Time A (seu time)
              </label>
              <select value={formTimeA} onChange={e => setFormTimeA(e.target.value)} style={inputStyle}>
                <option value="">— selecionar —</option>
                {timesArr.map(([id, t]) => (
                  <option key={id} value={id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", display: 'block', marginBottom: 4 }}>
                Time B (adversário)
              </label>
              <select value={formTimeB} onChange={e => setFormTimeB(e.target.value)} style={inputStyle}>
                <option value="">— selecionar —</option>
                {timesArr.filter(([id]) => id !== formTimeA).map(([id, t]) => (
                  <option key={id} value={id}>{t.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" style={{ fontSize: 13, padding: '8px 20px' }}
              onClick={criarSessao} disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar sessão'}
            </button>
            <button className="btn" style={{ fontSize: 13, padding: '8px 14px' }}
              onClick={() => setView('lista')}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista de sessões ──────────────────────────────────────────────── */}
      {view === 'lista' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessoesArr.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>
              Nenhuma sessão criada ainda. Clique em "+ Nova sessão" para começar.
            </div>
          )}
          {sessoesArr.map(([id, s]) => {
            const partidasArr = Object.entries(s.partidas ?? {}).sort(([a], [b]) => Number(a) - Number(b))
            const vA = partidasArr.filter(([, p]) => p.vencedor === 'A').length
            const vB = partidasArr.filter(([, p]) => p.vencedor === 'B').length
            const totalJogadas = partidasArr.filter(([, p]) => p.vencedor).length
            return (
              <div key={id} style={{
                background: 'var(--bg3)', border: `1px solid ${s.status === 'ativa' ? 'rgba(76,175,125,0.3)' : 'var(--border)'}`,
                borderRadius: 8, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: s.status === 'ativa' ? 'var(--text)' : 'var(--text2)' }}>
                    {s.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: s.timeA?.cor }}>{s.timeA?.nome ?? 'Time A'}</span>
                    <span>vs</span>
                    <span style={{ color: s.timeB?.cor }}>{s.timeB?.nome ?? 'Time B'}</span>
                    {totalJogadas > 0 && (
                      <span style={{ color: 'var(--text2)' }}>
                        · <strong style={{ color: s.timeA?.cor }}>{vA}</strong>–<strong style={{ color: s.timeB?.cor }}>{vB}</strong> ({totalJogadas} partida{totalJogadas > 1 ? 's' : ''})
                      </span>
                    )}
                    <span>· {new Date(s.criadoEm).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {s.status === 'ativa' && (
                    <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: 'var(--green)', background: 'rgba(76,175,125,0.12)', border: '1px solid var(--green)', borderRadius: 4, padding: '2px 7px' }}>
                      ATIVA
                    </span>
                  )}
                  <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => { setSessaoSel(id); setView('sessao') }}>
                    {s.status === 'ativa' ? 'Gerenciar' : 'Ver histórico'}
                  </button>
                  {s.status === 'ativa' && (
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--text2)', borderColor: 'var(--border)' }}
                      onClick={() => encerrarSessao(id)}>
                      Encerrar
                    </button>
                  )}
                  <button className="btn" style={{ fontSize: 12, padding: '4px 8px', borderColor: 'rgba(224,85,85,0.3)', color: 'var(--text3)' }}
                    onClick={() => deletarSessao(id)}>
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Detalhe da sessão (gerenciar / histórico) ─────────────────────── */}
      {view === 'sessao' && sessaoSel && sessoes[sessaoSel] && (
        <SessaoDetalhe
          sessaoId={sessaoSel}
          sessao={sessoes[sessaoSel]}
          uid={uid}
          campeonatoId={idPublico}
          teams={teams}
          scrimPath={SCRIM_PATH(uid)}
          onFlash={flash}
        />
      )}
    </main>
  )
}

// ── Componente de detalhe da sessão ───────────────────────────────────────────
function SessaoDetalhe({ sessaoId, sessao, uid, campeonatoId, teams, scrimPath, onFlash }) {
  const [criandoPartida, setCriandoPartida] = useState(false)

  const partidasArr = Object.entries(sessao.partidas ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))

  const proximoNum = (Math.max(0, ...partidasArr.map(([n]) => Number(n))) + 1)

  async function criarPartida() {
    setCriandoPartida(true)
    try {
      await update(ref(db, `${scrimPath}/${sessaoId}/partidas/${proximoNum}`), {
        status:    'configurando',
        criadoEm:  Date.now(),
        vencedor:  null,
        mapaId:    null,
        heroDraftId: null,
      })
      onFlash('ok', `Partida ${proximoNum} criada.`)
    } catch (e) {
      onFlash('erro', `Erro: ${e.message}`)
    } finally {
      setCriandoPartida(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header da sessão */}
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
          {sessao.nome}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif', color: 'var(--text2)'" }}>
          <span style={{ color: sessao.timeA?.cor }}>{sessao.timeA?.nome}</span>
          <span style={{ color: 'var(--text3)' }}>vs</span>
          <span style={{ color: sessao.timeB?.cor }}>{sessao.timeB?.nome}</span>
          {(() => {
            const vA = partidasArr.filter(([, p]) => p.vencedor === 'A').length
            const vB = partidasArr.filter(([, p]) => p.vencedor === 'B').length
            if (!vA && !vB) return null
            return <span style={{ color: 'var(--text2)' }}>— <strong style={{ color: sessao.timeA?.cor }}>{vA}</strong>×<strong style={{ color: sessao.timeB?.cor }}>{vB}</strong></span>
          })()}
        </div>
      </div>

      {/* Partidas existentes */}
      {partidasArr.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {partidasArr.map(([num, p]) => (
            <PartidaCard key={num} num={num} partida={p} sessao={sessao} sessaoId={sessaoId} scrimPath={scrimPath} campeonatoId={campeonatoId} onFlash={onFlash} />
          ))}
        </div>
      )}

      {/* Criar próxima partida */}
      {sessao.status === 'ativa' && (
        <button className="btn primary" style={{ fontSize: 14, padding: '10px 0', alignSelf: 'flex-start', minWidth: 200 }}
          onClick={criarPartida} disabled={criandoPartida}>
          {criandoPartida ? 'Criando...' : `+ Partida ${proximoNum}`}
        </button>
      )}
    </div>
  )
}

// ── Card de partida individual ────────────────────────────────────────────────
function PartidaCard({ num, partida: p, sessao, sessaoId, scrimPath, campeonatoId, onFlash }) {
  const MAPAS_LISTA = ['Alterac Pass', 'Battlefield of Eternity', 'Braxis Holdout', 'Cursed Hollow', 'Dragon Shire', 'Garden of Terror', 'Hanamura Temple', 'Infernal Shrines', 'Sky Temple', 'Tomb of the Spider Queen', 'Towers of Doom', 'Volskaya Foundry', 'Warhead Junction']
  const [salvandoVencedor, setSalvandoVencedor] = useState(false)

  const sessaoRef = `${scrimPath}/${sessaoId}/partidas/${num}`

  async function registrarVencedor(quem) {
    setSalvandoVencedor(true)
    try {
      await update(ref(db, sessaoRef), { vencedor: quem, status: 'encerrada' })
      onFlash('ok', `${quem === 'A' ? sessao.timeA?.nome : sessao.timeB?.nome} venceu a partida ${num}!`)
    } catch (e) {
      onFlash('erro', `Erro: ${e.message}`)
    } finally {
      setSalvandoVencedor(false)
    }
  }

  const statusCor  = { configurando: 'var(--text3)', em_draft: 'var(--blue)', encerrada: 'var(--green)' }
  const statusLabel = { configurando: 'Configurando', em_draft: 'Em andamento', encerrada: 'Encerrada' }
  const heroDraftUrl = p.heroDraftId
    ? `${window.location.origin}/campeonatos/${campeonatoId}/hero-draft?sessao=${p.heroDraftId}`
    : null
  const heroDraftUrlB = p.heroDraftId
    ? `${heroDraftUrl}&time=B`
    : null
  const heroDraftUrlA = p.heroDraftId
    ? `${heroDraftUrl}&time=A`
    : null

  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header da partida */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15 }}>
          Partida {num}
        </span>
        {p.mapaId && (
          <span style={{ fontSize: 11, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            🗺 {p.mapaId}
          </span>
        )}
        <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", color: statusCor[p.status] ?? 'var(--text3)', fontWeight: 700, letterSpacing: '0.06em' }}>
          {statusLabel[p.status] ?? p.status}
        </span>
        {p.vencedor && (
          <span style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            color: p.vencedor === 'A' ? sessao.timeA?.cor : sessao.timeB?.cor }}>
            ✓ {p.vencedor === 'A' ? sessao.timeA?.nome : sessao.timeB?.nome} venceu
          </span>
        )}
      </div>

      {/* Links do hero draft */}
      {heroDraftUrl && p.status !== 'encerrada' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={heroDraftUrlA} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: `1px solid ${sessao.timeA?.cor ?? 'var(--border)'}44`, color: sessao.timeA?.cor ?? 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textDecoration: 'none', background: (sessao.timeA?.cor ?? '#4a9eda') + '14' }}>
            Link {sessao.timeA?.nome} ↗
          </a>
          <a href={heroDraftUrlB} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: `1px solid ${sessao.timeB?.cor ?? 'var(--border)'}44`, color: sessao.timeB?.cor ?? 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textDecoration: 'none', background: (sessao.timeB?.cor ?? '#e05555') + '14' }}>
            Link {sessao.timeB?.nome} ↗
          </a>
        </div>
      )}

      {/* Ações: configurar e registrar resultado */}
      {p.status === 'encerrada' && !p.vencedor && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif" }}>Quem venceu?</span>
          <button className="btn" style={{ fontSize: 12, padding: '4px 12px', borderColor: sessao.timeA?.cor + '55', color: sessao.timeA?.cor }}
            disabled={salvandoVencedor} onClick={() => registrarVencedor('A')}>
            {sessao.timeA?.nome}
          </button>
          <button className="btn" style={{ fontSize: 12, padding: '4px 12px', borderColor: sessao.timeB?.cor + '55', color: sessao.timeB?.cor }}
            disabled={salvandoVencedor} onClick={() => registrarVencedor('B')}>
            {sessao.timeB?.nome}
          </button>
        </div>
      )}
    </div>
  )
}
