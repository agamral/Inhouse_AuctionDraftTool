import { useState } from 'react'
import { ref, get, set, remove, update } from 'firebase/database'
import { db } from '../firebase/database'
import { useCampeonato } from '../contexts/CampeonatoContext'

const PESSOAIS = ['players', 'playerOverrides', 'draftSession']
const COMPETITIVOS = ['teams', 'confrontos', 'rodadas', 'heroDraft']

export default function AdminEncerramentoSection() {
  const { campeonatoId, campeonato } = useCampeonato()

  const [etapa,    setEtapa]    = useState('idle')  // idle | analise | confirmar | executando | concluido
  const [dados,    setDados]    = useState(null)
  const [log,      setLog]      = useState([])
  const [check1,   setCheck1]   = useState(false)
  const [check2,   setCheck2]   = useState(false)
  const [erro,     setErro]     = useState(null)

  const campNome = campeonato?.info?.nome ?? campeonatoId

  function addLog(msg, tipo = 'ok') {
    setLog(prev => [...prev, { msg, tipo, ts: new Date().toLocaleTimeString('pt-BR') }])
  }

  // ── Análise ────────────────────────────────────────────────────────────────
  async function analisar() {
    if (!campeonatoId) return
    setEtapa('analise')
    setErro(null)
    setLog([])

    const base = `/campeonatos/${campeonatoId}`
    const resultado = { competitivos: {}, pessoais: {} }

    for (const key of COMPETITIVOS) {
      try {
        const snap = await get(ref(db, `${base}/${key}`))
        const val = snap.val()
        resultado.competitivos[key] = val ? Object.keys(val).length : 0
      } catch { resultado.competitivos[key] = 0 }
    }

    // draftSession: contar captains como proxy do resultado do leilão
    try {
      const snap = await get(ref(db, `${base}/draftSession/captains`))
      resultado.competitivos.draftResultado = snap.val() ? Object.keys(snap.val()).length : 0
    } catch { resultado.competitivos.draftResultado = 0 }

    for (const key of PESSOAIS) {
      try {
        const snap = await get(ref(db, `${base}/${key}`))
        const val = snap.val()
        resultado.pessoais[key] = val
          ? (typeof val === 'object' ? Object.keys(val).length : 1)
          : 0
      } catch { resultado.pessoais[key] = 0 }
    }

    setDados(resultado)
    setEtapa('confirmar')
  }

  // ── Execução ───────────────────────────────────────────────────────────────
  async function executar() {
    setEtapa('executando')
    setErro(null)
    const base = `/campeonatos/${campeonatoId}`

    try {
      // 1. Copiar dados competitivos para /historico
      addLog('Criando arquivo histórico...')
      const histBase = `/historico/${campeonatoId}`
      const histUpdates = {}

      // Info do campeonato
      const infoSnap = await get(ref(db, `${base}/info`))
      if (infoSnap.exists()) {
        histUpdates[`${histBase}/info`] = { ...infoSnap.val(), arquivadoEm: Date.now() }
        addLog('info ✓')
      }

      // Dados competitivos
      for (const key of COMPETITIVOS) {
        const snap = await get(ref(db, `${base}/${key}`))
        if (snap.exists() && snap.val()) {
          histUpdates[`${histBase}/${key}`] = snap.val()
          addLog(`${key} (${Object.keys(snap.val()).length} registros) ✓`)
        }
      }

      // Resultado do leilão (rosters sem dados pessoais)
      const captainsSnap = await get(ref(db, `${base}/draftSession/captains`))
      if (captainsSnap.exists()) {
        const captains = captainsSnap.val()
        const rosters = {}
        Object.entries(captains).forEach(([id, cap]) => {
          rosters[id] = {
            nome:        cap.nome,
            emoji:       cap.emoji,
            cor:         cap.cor,
            capitaoNome: cap.capitaoNome,
            seed:        cap.seed,
            roster:      cap.roster ?? {},
          }
        })
        histUpdates[`${histBase}/draftResultado`] = rosters
        addLog(`draftResultado (${Object.keys(rosters).length} times) ✓`)
      }

      // Escreve o histórico de uma vez
      await update(ref(db), histUpdates)
      addLog('Histórico gravado em /historico/' + campeonatoId, 'ok')

      // 2. Deletar dados pessoais
      addLog('Deletando dados pessoais...')
      for (const key of PESSOAIS) {
        try {
          await remove(ref(db, `${base}/${key}`))
          addLog(`${key} deletado ✓`)
        } catch (e) {
          addLog(`${key} — erro ao deletar: ${e.message}`, 'erro')
        }
      }

      // 3. Marcar campeonato como encerrado
      await update(ref(db, `${base}/info`), {
        status:      'encerrado',
        encerradoEm: Date.now(),
      })
      addLog('Status atualizado para encerrado ✓', 'ok')

      addLog('✓ Encerramento concluído com sucesso!', 'ok')
      setEtapa('concluido')
    } catch (e) {
      addLog(`ERRO: ${e.message}`, 'erro')
      setErro(e.message)
      setEtapa('confirmar')
    }
  }

  if (!campeonatoId) return (
    <div className="admin-section" style={{ border: '1px solid rgba(224,85,85,0.2)', borderRadius: 8 }}>
      <div className="admin-section-title" style={{ color: 'var(--red)' }}>🏁 Encerrar Campeonato</div>
      <p style={{ padding: '14px 18px', color: 'var(--text2)', fontSize: 13 }}>Selecione um campeonato no banner acima.</p>
    </div>
  )

  if (campeonato?.info?.status === 'encerrado') return (
    <div className="admin-section" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
      <div className="admin-section-title" style={{ color: 'var(--text2)' }}>🏁 Encerrar Campeonato</div>
      <p style={{ padding: '14px 18px', color: 'var(--text2)', fontSize: 13 }}>
        <strong style={{ color: 'var(--text)' }}>{campNome}</strong> já está encerrado.
        Os dados históricos estão em <code style={{ color: 'var(--text3)' }}>/historico/{campeonatoId}</code>.
      </p>
    </div>
  )

  return (
    <div className="admin-section" style={{ border: '1px solid rgba(224,85,85,0.2)', borderRadius: 8 }}>
      <div className="admin-section-title" style={{ color: 'var(--red)' }}>🏁 Encerrar Campeonato</div>

      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(224,85,85,0.06)', border: '1px solid rgba(224,85,85,0.2)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Esta operação arquiva <strong>{campNome}</strong> em <code style={{ color: 'var(--text3)' }}>/historico/{campeonatoId}</code> e <strong>deleta permanentemente</strong> os dados pessoais dos jogadores. Não pode ser desfeita.
        </div>

        {/* ── Idle ─────────────────────────────────────────────────────── */}
        {etapa === 'idle' && (
          <button className="btn" style={{ fontSize: 13, padding: '8px 18px', alignSelf: 'flex-start', color: 'var(--red)', borderColor: 'rgba(224,85,85,0.35)' }}
            onClick={analisar}>
            Analisar campeonato
          </button>
        )}

        {/* ── Analisando ───────────────────────────────────────────────── */}
        {etapa === 'analise' && (
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Analisando dados...</p>
        )}

        {/* ── Confirmar ────────────────────────────────────────────────── */}
        {(etapa === 'confirmar' || etapa === 'executando') && dados && (
          <>
            {/* O que será preservado */}
            <div>
              <div className="admin-toggle-label" style={{ marginBottom: 8, color: 'var(--green)' }}>
                ✓ Será preservado em /historico/{campeonatoId}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                  { label: 'Info do campeonato', count: 1 },
                  { label: 'Times', count: dados.competitivos.teams },
                  { label: 'Rodadas', count: dados.competitivos.rodadas },
                  { label: 'Confrontos', count: dados.competitivos.confrontos },
                  { label: 'Sessões de Hero Draft', count: dados.competitivos.heroDraft },
                  { label: 'Resultado do leilão (rosters)', count: dados.competitivos.draftResultado },
                ].map(({ label, count }) => (
                  <div key={label} style={{ fontSize: 12, color: count > 0 ? 'var(--text2)' : 'var(--text3)', display: 'flex', gap: 8 }}>
                    <span style={{ color: count > 0 ? 'var(--green)' : 'var(--text3)', width: 12 }}>{count > 0 ? '✓' : '—'}</span>
                    <span style={{ flex: 1 }}>{label}</span>
                    <span style={{ color: 'var(--text3)' }}>{count > 0 ? count : 'vazio'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* O que será deletado */}
            <div>
              <div className="admin-toggle-label" style={{ marginBottom: 8, color: 'var(--red)' }}>
                🗑 Será deletado permanentemente
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                  { label: 'Inscrições de jogadores (dados pessoais)', count: dados.pessoais.players },
                  { label: 'Marcações de admin (playerOverrides)', count: dados.pessoais.playerOverrides },
                  { label: 'Sessão de leilão completa', count: dados.pessoais.draftSession },
                ].map(({ label, count }) => (
                  <div key={label} style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--red)', width: 12 }}>🗑</span>
                    <span style={{ flex: 1 }}>{label}</span>
                    <span style={{ color: 'var(--text3)' }}>{count > 0 ? count + ' registros' : 'vazio'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirmações */}
            {etapa === 'confirmar' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'rgba(224,85,85,0.06)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: 6 }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={check1} onChange={e => setCheck1(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--red)' }} />
                    Entendo que os dados pessoais serão <strong>deletados permanentemente</strong> e não poderão ser recuperados.
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={check2} onChange={e => setCheck2(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--red)' }} />
                    Confirmei que o campeonato <strong>{campNome}</strong> foi encerrado e os resultados estão corretos.
                  </label>
                </div>

                {erro && (
                  <div style={{ padding: '8px 12px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 6, fontSize: 13, color: 'var(--red)' }}>
                    {erro}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn" style={{ fontSize: 13, padding: '8px 16px' }} onClick={() => setEtapa('idle')}>
                    ← Cancelar
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: 13, padding: '8px 18px', background: check1 && check2 ? 'var(--red)' : undefined, borderColor: 'rgba(224,85,85,0.4)', color: check1 && check2 ? '#fff' : 'var(--red)', opacity: check1 && check2 ? 1 : 0.5 }}
                    disabled={!check1 || !check2}
                    onClick={executar}
                  >
                    🏁 Encerrar campeonato definitivamente
                  </button>
                </div>
              </>
            )}

            {etapa === 'executando' && (
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>Executando...</p>
            )}
          </>
        )}

        {/* ── Log ──────────────────────────────────────────────────────── */}
        {log.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="admin-toggle-label" style={{ marginBottom: 6 }}>Log</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {log.map((e, i) => (
                <div key={i} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, display: 'flex', gap: 8, color: e.tipo === 'erro' ? 'var(--red)' : e.tipo === 'ok' ? 'var(--green)' : 'var(--text2)' }}>
                  <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{e.ts}</span>
                  {e.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Concluído: instruções Firebase Auth ──────────────────────── */}
        {etapa === 'concluido' && (
          <div style={{ padding: '14px 16px', background: 'rgba(76,175,125,0.06)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 8 }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--green)', marginBottom: 10 }}>
              ✓ Campeonato encerrado e arquivado
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>Passo final — contas Firebase Auth dos capitães:</strong><br />
              Os dados do Firebase foram limpos, mas as contas de autenticação dos capitães ainda existem no Firebase Auth.
              Para deletá-las em batch:
            </div>
            <ol style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2, marginTop: 8, paddingLeft: 20 }}>
              <li>Acesse <strong style={{ color: 'var(--text)' }}>Firebase Console → Authentication → Users</strong></li>
              <li>Filtre pelo domínio <code style={{ color: 'var(--text3)' }}>@copa.inhouse</code> (contas sintéticas dos capitães)</li>
              <li>Selecione todas e clique em <strong style={{ color: 'var(--text)' }}>Delete accounts</strong></li>
              <li>Repita para contas de jogadores deste campeonato se necessário</li>
            </ol>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
              Esta operação não pode ser feita automaticamente sem Firebase Admin SDK (backend).
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
