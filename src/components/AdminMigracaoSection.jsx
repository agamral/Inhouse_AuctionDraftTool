import { useState } from 'react'
import { ref, get, set, update } from 'firebase/database'
import { db } from '../firebase/database'

const ETAPAS = ['analise', 'configurar', 'confirmar', 'executando', 'concluido']

// Paths legados que serão migrados
const PATHS_LEGADOS = [
  { key: 'players',         label: 'Jogadores inscritos',       path: '/players'          },
  { key: 'playerOverrides', label: 'Marcações de admin',         path: '/playerOverrides'  },
  { key: 'teams',           label: 'Times',                      path: '/teams'            },
  { key: 'rodadas',         label: 'Rodadas',                    path: '/rodadas'          },
  { key: 'confrontos',      label: 'Confrontos',                 path: '/confrontos'       },
  { key: 'disponibilidade', label: 'Disponibilidade',            path: '/disponibilidade'  },
  { key: 'draftSession',    label: 'Sessão de leilão',           path: '/draftSession'     },
  { key: 'heroDraft',       label: 'Sessões de Hero Draft',      path: '/heroDraft'        },
  { key: 'modules',         label: 'Configuração de módulos',    path: '/config/modules'   },
  { key: 'draft',           label: 'Config do leilão',           path: '/config/draft'     },
  { key: 'conteudo',        label: 'Conteúdo do site',           path: '/config/conteudo'  },
  { key: 'admins',          label: 'Admins',                     path: '/config/admins'    },
  { key: 'botConfig',       label: 'Configuração do Discord',    path: '/botConfig'        },
]

export default function AdminMigracaoSection() {
  const [etapa,   setEtapa]   = useState('analise')
  const [dados,   setDados]   = useState({})  // { key: snap.val() }
  const [contagens, setContagens] = useState({})
  const [campId,  setCampId]  = useState('season-2')
  const [campNome, setCampNome] = useState('')
  const [campLabel, setCampLabel] = useState('')
  const [log,     setLog]     = useState([])
  const [erro,    setErro]    = useState(null)

  function addLog(msg, tipo = 'ok') {
    setLog(prev => [...prev, { msg, tipo, ts: new Date().toLocaleTimeString('pt-BR') }])
  }

  // ── 1. Análise dos dados legados ────────────────────────────────────────────
  async function analisar() {
    setErro(null)
    addLog('Analisando dados existentes...')
    const resultados = {}
    const counts = {}

    for (const { key, path } of PATHS_LEGADOS) {
      try {
        const snap = await get(ref(db, path))
        const val = snap.val()
        resultados[key] = val
        if (val && typeof val === 'object') {
          counts[key] = Object.keys(val).length
        } else if (val !== null && val !== undefined) {
          counts[key] = 1
        } else {
          counts[key] = 0
        }
      } catch {
        resultados[key] = null
        counts[key] = 0
      }
    }

    // Pré-preenche nome do campeonato com o que está no conteudo
    const conteudo = resultados.conteudo ?? {}
    setCampNome(prev => prev || conteudo.cupName || 'Copa Inhouse Season 2')
    setCampLabel(prev => prev || conteudo.labelSeason || 'Season 2 · Heroes of the Storm')

    setDados(resultados)
    setContagens(counts)
    setEtapa('configurar')
    addLog(`Análise concluída. ${Object.values(counts).reduce((a, b) => a + b, 0)} registros encontrados.`)
  }

  // ── 2. Execução da migração ────────────────────────────────────────────────
  async function executar() {
    setEtapa('executando')
    setErro(null)
    const cid = campId.trim()
    if (!cid) { setErro('ID do campeonato obrigatório.'); return }

    try {
      const updates = {}

      // ── Info do campeonato ─────────────────────────────────────────────────
      addLog('Criando info do campeonato...')
      updates[`/campeonatos/${cid}/info`] = {
        nome:        campNome.trim() || 'Copa Inhouse Season 2',
        labelSeason: campLabel.trim(),
        tipo:        'campeonato',
        status:      'ativo',
        principal:   true,
        criadoEm:    Date.now(),
        migradoEm:   Date.now(),
        migradoDe:   'legacy-flat-paths',
      }

      // ── Config ─────────────────────────────────────────────────────────────
      if (dados.modules)  { updates[`/campeonatos/${cid}/config/modules`]  = dados.modules;  addLog('modules ✓') }
      if (dados.draft)    { updates[`/campeonatos/${cid}/config/draft`]    = dados.draft;    addLog('draft ✓')   }
      if (dados.conteudo) { updates[`/campeonatos/${cid}/config/conteudo`] = dados.conteudo; addLog('conteudo ✓') }
      if (dados.admins)   { updates[`/campeonatos/${cid}/admins`]          = dados.admins;   addLog('admins ✓')  }

      // ── botConfig → config/botCanais ───────────────────────────────────────
      if (dados.botConfig && typeof dados.botConfig === 'object') {
        updates[`/campeonatos/${cid}/config/botCanais`] = dados.botConfig
        addLog('botConfig → botCanais ✓')
      }

      // ── Dados do campeonato ────────────────────────────────────────────────
      const caminhos = [
        ['players',         'players'],
        ['playerOverrides', 'playerOverrides'],
        ['teams',           'teams'],
        ['rodadas',         'rodadas'],
        ['confrontos',      'confrontos'],
        ['disponibilidade', 'disponibilidade'],
        ['draftSession',    'draftSession'],
        ['heroDraft',       'heroDraft'],
      ]

      for (const [key, dest] of caminhos) {
        if (dados[key] && Object.keys(dados[key] ?? {}).length > 0) {
          updates[`/campeonatos/${cid}/${dest}`] = dados[key]
          addLog(`${key} (${contagens[key]} registros) ✓`)
        } else {
          addLog(`${key} — sem dados, pulando`, 'info')
        }
      }

      // ── Ponteiro do sistema ────────────────────────────────────────────────
      addLog('Configurando ponteiro /system/campeonatoAtivo...')
      updates[`/system/campeonatoAtivo`] = cid

      // ── Executa tudo de uma vez ────────────────────────────────────────────
      addLog('Gravando no Firebase...')
      await update(ref(db), updates)

      addLog(`✓ Migração concluída! Campeonato criado: /campeonatos/${cid}/`, 'ok')
      addLog('Os dados originais foram mantidos nos caminhos legados.', 'info')
      addLog('Após validar tudo, os caminhos legados podem ser removidos.', 'info')
      setEtapa('concluido')

    } catch (e) {
      addLog(`ERRO: ${e.message}`, 'erro')
      setErro(e.message)
      setEtapa('confirmar')
    }
  }

  return (
    <div className="admin-section" style={{ border: '1px solid rgba(155,110,232,0.25)', borderRadius: 8 }}>
      <div className="admin-section-title" style={{ color: 'var(--purple)' }}>
        🔄 Migração para nova arquitetura
      </div>

      <div style={{ padding: '0 18px 18px' }}>

        {/* Aviso */}
        <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)', fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          ⚠️ Esta operação copia os dados do formato legado (caminhos planos) para o novo namespace
          <code style={{ color: 'var(--gold2)', marginLeft: 4 }}>/campeonatos/{'{id}'}/ </code>.
          Os dados originais <strong>não são deletados</strong> — a migração é não-destrutiva.
          Execute apenas uma vez.
        </div>

        {/* ── Etapa: Análise ────────────────────────────────────────────────── */}
        {etapa === 'analise' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Primeiro, vamos verificar quais dados existem nos caminhos legados.
            </p>
            <button className="btn primary" style={{ fontSize: 13 }} onClick={analisar}>
              Analisar dados existentes
            </button>
          </div>
        )}

        {/* ── Etapa: Configurar ─────────────────────────────────────────────── */}
        {etapa === 'configurar' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <div className="admin-toggle-label" style={{ marginBottom: 5 }}>ID do campeonato</div>
                <input
                  value={campId}
                  onChange={e => setCampId(e.target.value.replace(/\s/g,'').toLowerCase())}
                  placeholder="season-2"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: 'monospace', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Será criado em <code>/campeonatos/{campId || '...'}/</code>
                </div>
              </div>
              <div>
                <div className="admin-toggle-label" style={{ marginBottom: 5 }}>Nome do campeonato</div>
                <input value={campNome} onChange={e => setCampNome(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div className="admin-toggle-label" style={{ marginBottom: 5 }}>Label de temporada</div>
                <input value={campLabel} onChange={e => setCampLabel(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Prévia do que será migrado */}
            <div style={{ marginBottom: 20 }}>
              <div className="admin-toggle-label" style={{ marginBottom: 8 }}>O que será migrado</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PATHS_LEGADOS.map(({ key, label, path }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: contagens[key] > 0 ? 'var(--text2)' : 'var(--text3)' }}>
                    <span style={{ width: 16, textAlign: 'center' }}>
                      {contagens[key] > 0 ? '✓' : '—'}
                    </span>
                    <span style={{ flex: 1 }}>{label}</span>
                    <code style={{ color: 'var(--text3)', fontSize: 11 }}>{path}</code>
                    <span style={{ minWidth: 40, textAlign: 'right', color: contagens[key] > 0 ? 'var(--green)' : 'var(--text3)' }}>
                      {contagens[key] > 0 ? `${contagens[key]}` : 'vazio'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn primary" style={{ fontSize: 13 }} onClick={() => setEtapa('confirmar')} disabled={!campId.trim()}>
              Próximo →
            </button>
          </div>
        )}

        {/* ── Etapa: Confirmar ──────────────────────────────────────────────── */}
        {etapa === 'confirmar' && (
          <div>
            <div style={{ padding: '14px 18px', borderRadius: 7, background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: 'var(--red)', fontSize: 14, marginBottom: 6 }}>
                Confirmar migração
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                Será criado <code style={{ color: 'var(--text)' }}>/campeonatos/{campId}/</code> com todos os dados listados.
                O campeonato será marcado como <strong>principal</strong> automaticamente.
                <br />Esta operação <strong>não apaga</strong> os dados originais.
              </div>
            </div>
            {erro && (
              <div style={{ padding: '8px 12px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 6, fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>
                {erro}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ fontSize: 13 }} onClick={() => setEtapa('configurar')}>← Voltar</button>
              <button className="btn primary" style={{ fontSize: 13, background: 'var(--red)', borderColor: 'var(--red)' }} onClick={executar}>
                Executar migração
              </button>
            </div>
          </div>
        )}

        {/* ── Etapa: Concluído ──────────────────────────────────────────────── */}
        {etapa === 'concluido' && (
          <div style={{ padding: '12px 14px', background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 7, fontSize: 13, color: 'var(--green)', marginBottom: 16 }}>
            ✓ Migração concluída com sucesso! Campeonato <strong>{campNome}</strong> criado em{' '}
            <code>/campeonatos/{campId}/</code> e definido como principal.
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="admin-toggle-label" style={{ marginBottom: 6 }}>Log</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {log.map((entry, i) => (
                <div key={i} style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
                  color: entry.tipo === 'erro' ? 'var(--red)' : entry.tipo === 'info' ? 'var(--text3)' : 'var(--green)',
                  display: 'flex', gap: 8,
                }}>
                  <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{entry.ts}</span>
                  {entry.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Regras Firebase necessárias */}
        <details style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text2)' }}>
            Firebase Rules necessárias para executar a migração
          </summary>
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
{`Adicione estes nós às suas Security Rules:

"campeonatos": {
  ".read": "auth != null",
  "$cid": {
    "info":             { ".read": true },
    "config/modules":   { ".read": true },
    "config/conteudo":  { ".read": true },
    "teams":            { ".read": true },
    "rodadas":          { ".read": true },
    "confrontos": {
      ".read": true,
      ".write": "auth != null"
    },
    "disponibilidade": {
      ".read": true,
      ".write": "auth != null"
    },
    "heroDraft":        { ".read": true },
    "players": {
      "$uid": {
        ".read":  "auth.uid == $uid || root.child('config/admins/' + auth.uid).val() === true || root.child('config/superAdmins/' + auth.uid).val() === true",
        ".write": "auth.uid == $uid || root.child('config/admins/' + auth.uid).val() === true || root.child('config/superAdmins/' + auth.uid).val() === true"
      }
    },
    ".write": "root.child('config/admins/' + auth.uid).val() === true || root.child('config/superAdmins/' + auth.uid).val() === true"
  }
},
"system": {
  ".read": true,
  ".write": "root.child('config/superAdmins/' + auth.uid).val() === true"
},`}
          </div>
        </details>

      </div>
    </div>
  )
}
