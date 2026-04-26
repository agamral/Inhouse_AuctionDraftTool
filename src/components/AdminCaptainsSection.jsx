import { useState, useEffect } from 'react'
import { ref, onValue, set, remove, update } from 'firebase/database'
import { db } from '../firebase/database'

const EMOJIS = ['🔥','⚡','🌊','🌿','💀','👑','🐉','⚔️']
const CORES  = ['#e05555','#4a9eda','#4caf7d','#f0cc6e','#9b6ee8','#ff9800','#e91e8c','#00bcd4']

function gerarPin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function gerarId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function AdminCaptainsSection({ draftConfig }) {
  const [captains, setCaptains]       = useState({})
  const [players, setPlayers]         = useState([])
  const [overrides, setOverrides]     = useState({})
  const [novoNome, setNovoNome]       = useState('')
  const [novoCapitao, setNovoCapitao] = useState('')
  const [novoEmoji, setNovoEmoji]     = useState(EMOJIS[0])
  const [novaCor, setNovaCor]         = useState(CORES[0])
  const [msg, setMsg]                 = useState('')

  const max = draftConfig?.maxCaptains ?? 8
  const min = draftConfig?.minCaptains ?? 2

  useEffect(() => {
    const unsub = onValue(ref(db, '/draftSession/captains'), (snap) => {
      setCaptains(snap.val() ?? {})
    })
    return unsub
  }, [])

  useEffect(() => {
    fetch(import.meta.env.VITE_SHEETS_WEBAPP_URL)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setPlayers(data.players) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = onValue(ref(db, '/playerOverrides'), (snap) => {
      setOverrides(snap.val() ?? {})
    })
    return unsub
  }, [])

  const list = Object.entries(captains).sort(([, a], [, b]) => (a.seed ?? 99) - (b.seed ?? 99))

  async function adicionarCapitao() {
    if (!novoNome.trim()) return
    if (list.length >= max) return flash(`Máximo de ${max} capitães atingido.`)

    const id = gerarId()
    await set(ref(db, `/draftSession/captains/${id}`), {
      nome:        novoNome.trim(),
      capitaoNome: novoCapitao.trim(),
      emoji:       novoEmoji,
      cor:         novaCor,
      seed:        list.length + 1,
      pin:         gerarPin(),
      moedas:      draftConfig?.moedas ?? 15,
    })
    setNovoNome('')
    setNovoCapitao('')
    // Avança emoji e cor para o próximo disponível
    const nextIdx = (EMOJIS.indexOf(novoEmoji) + 1) % EMOJIS.length
    setNovoEmoji(EMOJIS[nextIdx])
    setNovaCor(CORES[nextIdx])
    flash('Time adicionado!')
  }

  async function removerCapitao(id) {
    await remove(ref(db, `/draftSession/captains/${id}`))
    flash('Time removido.')
  }

  async function regenerarPin(id) {
    await update(ref(db, `/draftSession/captains/${id}`), { pin: gerarPin() })
    flash('PIN atualizado!')
  }

  async function moverSeed(id, direcao) {
    const idx = list.findIndex(([k]) => k === id)
    const troca = list[idx + direcao]
    if (!troca) return
    const [trocaId, trocaData] = troca
    const [, myData] = list[idx]
    await Promise.all([
      update(ref(db, `/draftSession/captains/${id}`),     { seed: trocaData.seed }),
      update(ref(db, `/draftSession/captains/${trocaId}`), { seed: myData.seed }),
    ])
  }

  async function randomizarSeeds() {
    const ids = list.map(([id]) => id)
    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]]
    }
    const updates = {}
    ids.forEach((id, i) => { updates[`/draftSession/captains/${id}/seed`] = i + 1 })
    await update(ref(db), updates)
    flash('Seeds randomizados!')
  }

  function flash(texto) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div className="admin-section admin-players-section" style={{ marginBottom: '28px' }}>
      <div className="admin-section-title">Capitães do Leilão</div>

      {/* Status */}
      <div className="ap-stats">
        <div className="ap-stat">
          <span className="ap-stat-value" style={{ color: list.length >= min ? 'var(--green)' : 'var(--gold)' }}>
            {list.length}
          </span>
          <span className="ap-stat-label">Times</span>
        </div>
        <div className="ap-stat">
          <span className="ap-stat-value" style={{ color: 'var(--text2)' }}>{min}–{max}</span>
          <span className="ap-stat-label">Limite</span>
        </div>
        {list.length >= min && (
          <div className="ap-stat">
            <span className="ap-stat-value" style={{ color: 'var(--green)', fontSize: '14px' }}>✓ Pronto</span>
            <span className="ap-stat-label">Para o leilão</span>
          </div>
        )}
      </div>

      {/* Lista de capitães */}
      {list.length === 0 ? (
        <p style={{ padding: '14px 18px', color: 'var(--text2)', fontSize: '13px' }}>
          Nenhum time criado ainda.
        </p>
      ) : (
        <div className="cap-list">
          {list.map(([id, cap], idx) => (
            <div key={id} className="cap-row">
              <div className="cap-seed">{cap.seed}</div>
              <div className="cap-emoji" style={{ background: cap.cor + '22', border: `1px solid ${cap.cor}55` }}>
                {cap.emoji}
              </div>
              <div className="cap-info">
                <span className="cap-nome" style={{ color: cap.cor }}>{cap.nome}</span>
                <span className="cap-pin">
                  {cap.capitaoNome
                    ? <><span style={{ color: 'var(--text2)' }}>⚑ {cap.capitaoNome}</span> · PIN: <strong>{cap.pin}</strong></>
                    : <>PIN: <strong>{cap.pin}</strong> · <span style={{ color: 'var(--red)', opacity: 0.7 }}>sem capitão</span></>
                  }
                </span>
              </div>
              <div className="cap-actions">
                <button className="ap-btn" onClick={() => moverSeed(id, -1)} disabled={idx === 0} title="Subir">↑</button>
                <button className="ap-btn" onClick={() => moverSeed(id, 1)} disabled={idx === list.length - 1} title="Descer">↓</button>
                <button className="ap-btn" onClick={() => regenerarPin(id)} title="Novo PIN">🔄 PIN</button>
                <button className="ap-btn ap-btn-discard" onClick={() => removerCapitao(id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Adicionar time */}
      {list.length < max && (
        <div className="cap-add-form">
          <input
            className="sa-input"
            placeholder="Nome do time"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionarCapitao()}
            style={{ flex: 1 }}
          />
          <select
            className="sa-input"
            value={novoCapitao}
            onChange={(e) => setNovoCapitao(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">— Capitão (opcional) —</option>
            {(() => {
              const jaVinculados = new Set(list.map(([, cap]) => cap.capitaoNome).filter(Boolean))
              const disponiveis  = players.filter((p) => !jaVinculados.has(p.discord))

              const tagCap   = disponiveis.filter((p) => overrides[p.id]?.capitao)
              const querSim  = disponiveis.filter((p) => !overrides[p.id]?.capitao && p.querCapitao === 'Sim')
              const querSoSe = disponiveis.filter((p) => !overrides[p.id]?.capitao && p.querCapitao === 'SoSeNecessario')

              return (
                <>
                  {tagCap.length > 0 && (
                    <optgroup label="⚑ Marcados como capitão">
                      {tagCap.map((p) => (
                        <option key={p.id} value={p.discord}>{p.discord}</option>
                      ))}
                    </optgroup>
                  )}
                  {querSim.length > 0 && (
                    <optgroup label="Quer ser capitão">
                      {querSim.map((p) => (
                        <option key={p.id} value={p.discord}>{p.discord}</option>
                      ))}
                    </optgroup>
                  )}
                  {querSoSe.length > 0 && (
                    <optgroup label="Se necessário">
                      {querSoSe.map((p) => (
                        <option key={p.id} value={p.discord}>{p.discord}</option>
                      ))}
                    </optgroup>
                  )}
                </>
              )
            })()}
          </select>
          <div className="cap-emoji-picker">
            {EMOJIS.map((e) => (
              <button key={e} className={`cap-emoji-opt ${novoEmoji === e ? 'active' : ''}`} onClick={() => setNovoEmoji(e)}>{e}</button>
            ))}
          </div>
          <div className="cap-cor-picker">
            {CORES.map((c) => (
              <button key={c} className={`cap-cor-opt ${novaCor === c ? 'active' : ''}`}
                style={{ background: c, borderColor: novaCor === c ? '#fff' : 'transparent' }}
                onClick={() => setNovaCor(c)} />
            ))}
          </div>
          <button className="btn primary" style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }} onClick={adicionarCapitao}>
            + Adicionar
          </button>
        </div>
      )}

      {/* Randomizar + msg */}
      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid var(--border)' }}>
        {list.length >= 2 && (
          <button className="btn" style={{ fontSize: '13px', padding: '7px 16px' }} onClick={randomizarSeeds}>
            🎲 Randomizar ordem
          </button>
        )}
        {msg && <span style={{ color: 'var(--green)', fontSize: '13px' }}>{msg}</span>}
      </div>
    </div>
  )
}
