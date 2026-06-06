import { useState, useEffect, useRef } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import { confrontosPath, playersPath } from '../utils/campeonatoPaths'

const PARSER_URL = (import.meta.env.VITE_REPLAY_PARSER_URL || '').replace(/\/$/, '')

const FORMAT_MAX_GAMES = { MD2: 2, MD3: 3, MD5: 5, MD7: 7 }

// Compara só o nickname (parte antes do #), case-insensitive
function normalizeTag(tag) {
  return (tag || '').split('#')[0].toLowerCase().trim()
}

function findPlayerUid(players, replayBattletag) {
  const norm = normalizeTag(replayBattletag)
  if (!norm) return null
  for (const [uid, p] of Object.entries(players)) {
    if (normalizeTag(p.battletag) === norm) return uid
  }
  return null
}

// Converte array de jogadores para objeto { slot0: ..., slot1: ... }
function playersToObj(playersArr) {
  const obj = {}
  playersArr.forEach((p, i) => {
    obj[`slot${p.slot ?? i}`] = p
  })
  return obj
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AdminReplayUpload({ confrontoId, confronto, campeonatoId }) {
  const [open, setOpen]           = useState(false)
  const [players, setPlayers]     = useState({})
  const [activeGame, setActiveGame] = useState(1)
  const [status, setStatus]       = useState({})   // { game1: 'idle'|'uploading'|'error' }
  const [errors, setErrors]       = useState({})
  const [jsonMode, setJsonMode]   = useState({})   // { game1: boolean }
  const [jsonInput, setJsonInput] = useState({})   // { game1: string }
  const [overrides, setOverrides] = useState({})   // { game1: { slot0: uid|null } }
  const [savingOv, setSavingOv]   = useState({})   // { game1: boolean }

  const replays   = confronto.replays ?? {}
  const maxGames  = FORMAT_MAX_GAMES[confronto.formato] ?? 1
  const gameNums  = Array.from({ length: maxGames }, (_, i) => i + 1)
  const parsedCount = gameNums.filter(n => !!replays[`game${n}`]?.parsed).length

  // Carrega players apenas quando a seção é aberta
  useEffect(() => {
    if (!open || !campeonatoId) return
    return onValue(ref(db, playersPath(campeonatoId)), snap => setPlayers(snap.val() ?? {}))
  }, [open, campeonatoId])

  function getUnidentified(gameKey) {
    const game = replays[gameKey]
    if (!game?.players) return []
    return Object.entries(game.players)
      .filter(([slot]) => !game.playerLinks?.[slot])
      .map(([slot, p]) => ({ slot, battletag: p.battletag, hero: p.hero }))
  }

  function setGameStatus(gameKey, s) { setStatus(prev => ({ ...prev, [gameKey]: s })) }
  function setGameError(gameKey, e)  { setErrors(prev  => ({ ...prev, [gameKey]: e })) }

  async function saveReplayData(gameKey, data) {
    const playersArr = Array.isArray(data.players)
      ? data.players
      : Object.values(data.players)

    const playersObj   = playersToObj(playersArr)
    const playerLinks  = {}

    playersArr.forEach((p, i) => {
      const slot = `slot${p.slot ?? i}`
      const uid  = findPlayerUid(players, p.battletag)
      if (uid) playerLinks[slot] = uid
    })

    const path = `${confrontosPath(campeonatoId)}/${confrontoId}/replays/${gameKey}`
    await set(ref(db, path), {
      parsed:      true,
      uploadedAt:  Date.now(),
      match:       data.match   ?? null,
      teams:       data.teams   ?? null,
      players:     playersObj,
      playerLinks: playerLinks,
    })
  }

  async function handleFileUpload(gameNum, file) {
    const gameKey = `game${gameNum}`
    if (!file) return

    if (!PARSER_URL) {
      setGameError(gameKey, 'VITE_REPLAY_PARSER_URL não configurado — use o modo JSON.')
      setGameStatus(gameKey, 'error')
      return
    }

    setGameStatus(gameKey, 'uploading')
    setGameError(gameKey, null)

    try {
      const form = new FormData()
      form.append('file', file)
      const resp = await fetch(`${PARSER_URL}/parse`, { method: 'POST', body: form })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: resp.statusText }))
        throw new Error(body.error || resp.statusText)
      }
      const data = await resp.json()
      await saveReplayData(gameKey, data)
      setGameStatus(gameKey, 'idle')
    } catch (e) {
      setGameError(gameKey, e.message)
      setGameStatus(gameKey, 'error')
    }
  }

  async function handleJsonSave(gameNum) {
    const gameKey = `game${gameNum}`
    const raw = (jsonInput[gameKey] || '').trim()
    if (!raw) return

    setGameStatus(gameKey, 'uploading')
    setGameError(gameKey, null)

    try {
      const data = JSON.parse(raw)
      await saveReplayData(gameKey, data)
      setJsonInput(prev => ({ ...prev, [gameKey]: '' }))
      setJsonMode(prev  => ({ ...prev, [gameKey]: false }))
      setGameStatus(gameKey, 'idle')
    } catch (e) {
      setGameError(gameKey, `JSON inválido: ${e.message}`)
      setGameStatus(gameKey, 'error')
    }
  }

  async function handleSaveOverrides(gameNum) {
    const gameKey = `game${gameNum}`
    const pending = overrides[gameKey] ?? {}
    const nonNull = Object.entries(pending).filter(([, uid]) => uid)
    if (!nonNull.length) return

    setSavingOv(prev => ({ ...prev, [gameKey]: true }))
    try {
      const updates = {}
      nonNull.forEach(([slot, uid]) => {
        updates[`${confrontosPath(campeonatoId)}/${confrontoId}/replays/${gameKey}/playerLinks/${slot}`] = uid
      })
      await update(ref(db), updates)
      setOverrides(prev => ({ ...prev, [gameKey]: {} }))
    } finally {
      setSavingOv(prev => ({ ...prev, [gameKey]: false }))
    }
  }

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      {/* Header colapsável */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11,
          fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text2)',
        }}
      >
        <span style={{ color: 'var(--blue)' }}>▶ REPLAYS</span>
        {parsedCount > 0 && (
          <span style={{ color: 'var(--green)' }}>{parsedCount}/{maxGames} parseados</span>
        )}
        {parsedCount === 0 && (
          <span style={{ color: 'var(--text3)' }}>sem upload</span>
        )}
        <span style={{ color: 'var(--text3)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Tabs de game quando há mais de 1 */}
          {maxGames > 1 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {gameNums.map(n => {
                const parsed = !!replays[`game${n}`]?.parsed
                const active = activeGame === n
                return (
                  <button key={n}
                    onClick={() => setActiveGame(n)}
                    style={{
                      padding: '4px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                      background: active ? 'rgba(74,158,218,0.1)' : 'var(--bg2)',
                      color: active ? 'var(--blue)' : parsed ? 'var(--green)' : 'var(--text3)',
                    }}
                  >
                    Game {n}{parsed ? ' ✓' : ''}
                  </button>
                )
              })}
            </div>
          )}

          {/* Painel do game ativo */}
          {gameNums.map(n => activeGame === n && (
            <GamePanel
              key={n}
              gameNum={n}
              gameData={replays[`game${n}`] ?? null}
              status={status[`game${n}`] ?? 'idle'}
              error={errors[`game${n}`] ?? null}
              isJsonMode={!!jsonMode[`game${n}`]}
              jsonInput={jsonInput[`game${n}`] ?? ''}
              unidentified={getUnidentified(`game${n}`)}
              pendingOverrides={overrides[`game${n}`] ?? {}}
              players={players}
              savingOverrides={!!savingOv[`game${n}`]}
              parserAvailable={!!PARSER_URL}
              onFileUpload={file => handleFileUpload(n, file)}
              onToggleJsonMode={() => setJsonMode(prev => ({ ...prev, [`game${n}`]: !prev[`game${n}`] }))}
              onJsonInput={val => setJsonInput(prev => ({ ...prev, [`game${n}`]: val }))}
              onJsonSave={() => handleJsonSave(n)}
              onSetOverride={(slot, uid) => setOverrides(prev => ({
                ...prev,
                [`game${n}`]: { ...(prev[`game${n}`] ?? {}), [slot]: uid },
              }))}
              onSaveOverrides={() => handleSaveOverrides(n)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── GamePanel ─────────────────────────────────────────────────────────────────

function GamePanel({
  gameNum, gameData, status, error, isJsonMode, jsonInput, unidentified,
  pendingOverrides, players, savingOverrides, parserAvailable,
  onFileUpload, onToggleJsonMode, onJsonInput, onJsonSave, onSetOverride, onSaveOverrides,
}) {
  const fileInputRef = useRef(null)
  const parsed       = !!gameData?.parsed
  const uploading    = status === 'uploading'

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      {/* Status header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Game {gameNum}
        </span>
        {parsed && !uploading && (
          <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
            ✓ PARSEADO
          </span>
        )}
        {uploading && (
          <span style={{ fontSize: 11, color: 'var(--blue)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            ⏳ Processando...
          </span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
            ✗ Erro
          </span>
        )}

        {/* Resumo rápido quando parsed */}
        {parsed && gameData?.match && (
          <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", marginLeft: 4 }}>
            · {gameData.match.map} · {gameData.match.duration}
            {gameData.teams && (
              <>
                {' · '}
                <span style={{ color: gameData.teams.team1?.result === 'win' ? 'var(--green)' : 'var(--text3)' }}>
                  T1:{gameData.teams.team1?.takedowns ?? '?'}
                </span>
                {' '}
                <span style={{ color: gameData.teams.team2?.result === 'win' ? 'var(--green)' : 'var(--text3)' }}>
                  T2:{gameData.teams.team2?.takedowns ?? '?'}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Erro */}
      {error && (
        <div style={{
          fontSize: 11, color: 'var(--red)', marginBottom: 10,
          background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.2)',
          borderRadius: 4, padding: '6px 10px', wordBreak: 'break-all',
          fontFamily: "'Barlow', sans-serif",
        }}>
          {error}
        </div>
      )}

      {/* Seletor de modo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          disabled={!parserAvailable || uploading}
          onClick={() => isJsonMode && onToggleJsonMode()}
          title={!parserAvailable ? 'VITE_REPLAY_PARSER_URL não configurado' : undefined}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: parserAvailable ? 'pointer' : 'not-allowed',
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            border: `1px solid ${!isJsonMode ? 'var(--blue)' : 'var(--border)'}`,
            background: !isJsonMode ? 'rgba(74,158,218,0.1)' : 'transparent',
            color: !isJsonMode ? 'var(--blue)' : 'var(--text2)',
            opacity: parserAvailable ? 1 : 0.45,
          }}
        >
          📁 Upload .StormReplay
        </button>
        <button
          disabled={uploading}
          onClick={() => !isJsonMode && onToggleJsonMode()}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            border: `1px solid ${isJsonMode ? 'var(--gold)' : 'var(--border)'}`,
            background: isJsonMode ? 'rgba(201,168,76,0.1)' : 'transparent',
            color: isJsonMode ? 'var(--gold)' : 'var(--text2)',
          }}
        >
          {'{ }'} Colar JSON
        </button>
      </div>

      {/* Upload de arquivo */}
      {!isJsonMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".StormReplay,.stormreplay"
            disabled={!parserAvailable || uploading}
            onChange={e => {
              const f = e.target.files[0]
              if (f) onFileUpload(f)
              e.target.value = ''
            }}
            style={{
              fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow', sans-serif",
              background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4,
              padding: '5px 8px', cursor: parserAvailable && !uploading ? 'pointer' : 'not-allowed',
              maxWidth: 260,
            }}
          />
          {!parserAvailable && (
            <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: "'Barlow Condensed', sans-serif" }}>
              (VITE_REPLAY_PARSER_URL não definido)
            </span>
          )}
        </div>
      )}

      {/* JSON paste */}
      {isJsonMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={jsonInput}
            disabled={uploading}
            onChange={e => onJsonInput(e.target.value)}
            placeholder="Cole o JSON do resultado.json aqui..."
            rows={5}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4,
              padding: '8px 10px', color: 'var(--text)', fontFamily: 'monospace', fontSize: 11,
              outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box',
            }}
          />
          <button
            className="btn"
            disabled={!jsonInput.trim() || uploading}
            onClick={onJsonSave}
            style={{ fontSize: 12, padding: '5px 14px', borderColor: 'var(--gold)', color: 'var(--gold)', alignSelf: 'flex-start' }}
          >
            Salvar JSON
          </button>
        </div>
      )}

      {/* Jogadores não identificados */}
      {parsed && unidentified.length > 0 && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.25)',
          borderRadius: 6,
        }}>
          <div style={{
            fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
          }}>
            ⚠ {unidentified.length} jogador{unidentified.length > 1 ? 'es' : ''} não identificado{unidentified.length > 1 ? 's' : ''}
          </div>

          {unidentified.map(({ slot, battletag, hero }) => (
            <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", minWidth: 140 }}>
                {hero} <span style={{ color: 'var(--text3)' }}>({battletag})</span>
              </span>
              <select
                value={pendingOverrides[slot] ?? ''}
                onChange={e => onSetOverride(slot, e.target.value || null)}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4,
                  padding: '4px 8px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
                  fontSize: 11, flex: 1, minWidth: 160, outline: 'none',
                }}
              >
                <option value="">— não identificado —</option>
                {Object.entries(players)
                  .sort(([, a], [, b]) => (a.nomeDiscord ?? '').localeCompare(b.nomeDiscord ?? ''))
                  .map(([uid, p]) => (
                    <option key={uid} value={uid}>
                      {p.nomeDiscord ?? p.battletag ?? uid}
                    </option>
                  ))
                }
              </select>
            </div>
          ))}

          <button
            className="btn"
            disabled={savingOverrides || !Object.values(pendingOverrides).some(v => v)}
            onClick={onSaveOverrides}
            style={{ fontSize: 11, padding: '4px 12px', borderColor: 'var(--gold)', color: 'var(--gold)', marginTop: 4 }}
          >
            {savingOverrides ? 'Salvando...' : 'Salvar vínculos'}
          </button>
        </div>
      )}

      {/* Todos identificados */}
      {parsed && unidentified.length === 0 && Object.keys(gameData?.players ?? {}).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          ✓ Todos os jogadores identificados
        </div>
      )}
    </div>
  )
}
