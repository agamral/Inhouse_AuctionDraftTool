import { useState, useEffect } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import { confrontosPath, playersPath } from '../utils/campeonatoPaths'

const PARSER_URL = (import.meta.env.VITE_REPLAY_PARSER_URL || '').replace(/\/$/, '')

const FORMAT_MAX_GAMES = { MD2: 2, MD3: 3, MD5: 5, MD7: 7 }

function normalizeTag(tag) {
  return (tag || '').split('#')[0].toLowerCase().trim()
}

// Tenta identificar um player da Copa pelo battletag do replay
function findPlayerUid(rosterOptions, replayBattletag) {
  const norm = normalizeTag(replayBattletag)
  if (!norm) return null
  return rosterOptions.find(p => normalizeTag(p.battletag) === norm)?.uid ?? null
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

export default function AdminReplayUpload({ confrontoId, confronto, campeonatoId, times }) {
  const [open, setOpen]           = useState(false)
  const [players, setPlayers]     = useState({})
  const [activeGame, setActiveGame] = useState(1)
  const [status, setStatus]       = useState({})
  const [errors, setErrors]       = useState({})
  const [jsonMode, setJsonMode]   = useState({})
  const [jsonInput, setJsonInput] = useState({})
  const [overrides, setOverrides] = useState({})   // { game1: { slot0: uid|null } }
  const [savingOv, setSavingOv]   = useState({})

  const replays   = confronto.replays ?? {}
  const maxGames  = FORMAT_MAX_GAMES[confronto.formato] ?? 1
  const gameNums  = Array.from({ length: maxGames }, (_, i) => i + 1)
  const parsedCount = gameNums.filter(n => !!replays[`game${n}`]?.parsed).length

  // Roster de ambos os times — fonte principal para o dropdown
  const tA = times?.[confronto.timeA]
  const tB = times?.[confronto.timeB]

  // Carrega players (para buscar battletag por uid)
  useEffect(() => {
    if (!open || !campeonatoId) return
    return onValue(ref(db, playersPath(campeonatoId)), snap => setPlayers(snap.val() ?? {}))
  }, [open, campeonatoId])

  // Monta lista de jogadores do confronto com nome + battletag
  const rosterOptions = buildRosterOptions(tA, tB, players)

  function getUnidentified(gameKey) {
    const game = replays[gameKey]
    if (!game?.players) return []
    return Object.entries(game.players)
      .filter(([slot]) => !game.playerLinks?.[slot])
      .map(([slot, p]) => ({ slot, battletag: p.battletag, hero: p.hero, replayTeam: p.team }))
      .sort((a, b) => (a.replayTeam - b.replayTeam) || a.slot.localeCompare(b.slot))
  }

  // UIDs já vinculados neste game (para evitar duplicatas no dropdown)
  function getUsedUids(gameKey, excludeSlot) {
    const game     = replays[gameKey]
    const fromDb   = Object.entries(game?.playerLinks ?? {})
      .filter(([s, uid]) => s !== excludeSlot && uid).map(([, uid]) => uid)
    const fromPend = Object.entries(overrides[gameKey] ?? {})
      .filter(([s, uid]) => s !== excludeSlot && uid).map(([, uid]) => uid)
    return new Set([...fromDb, ...fromPend])
  }

  function setGameStatus(gameKey, s) { setStatus(prev => ({ ...prev, [gameKey]: s })) }
  function setGameError(gameKey, e)  { setErrors(prev  => ({ ...prev, [gameKey]: e })) }

  async function saveReplayData(gameKey, data) {
    const playersArr = Array.isArray(data.players)
      ? data.players
      : Object.values(data.players)

    const playersObj  = playersToObj(playersArr)
    const playerLinks = {}
    const playerNames = {}

    playersArr.forEach((p, i) => {
      const slot = `slot${p.slot ?? i}`
      const uid  = findPlayerUid(rosterOptions, p.battletag)
      if (uid) {
        playerLinks[slot] = uid
        const opt = rosterOptions.find(o => o.uid === uid)
        if (opt) playerNames[slot] = opt.nome
      }
    })

    const path = `${confrontosPath(campeonatoId)}/${confrontoId}/replays/${gameKey}`
    await set(ref(db, path), {
      parsed:      true,
      uploadedAt:  Date.now(),
      match:       data.match   ?? null,
      teams:       data.teams   ?? null,
      players:     playersObj,
      playerLinks,
      playerNames,
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
        const opt = rosterOptions.find(o => o.uid === uid)
        if (opt) updates[`${confrontosPath(campeonatoId)}/${confrontoId}/replays/${gameKey}/playerNames/${slot}`] = opt.nome
      })
      await update(ref(db), updates)
      setOverrides(prev => ({ ...prev, [gameKey]: {} }))
    } finally {
      setSavingOv(prev => ({ ...prev, [gameKey]: false }))
    }
  }

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
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
              rosterOptions={rosterOptions}
              getUsedUids={(slot) => getUsedUids(`game${n}`, slot)}
              tA={tA}
              tB={tB}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRosterOptions(tA, tB, players) {
  // Mapas de lookup: discord e battletag → uid (case-insensitive)
  const byDiscord   = {}
  const byBattletag = {}
  Object.entries(players).forEach(([uid, p]) => {
    if (p.discord)   byDiscord[p.discord.toLowerCase()]   = uid
    if (p.battletag) {
      byBattletag[p.battletag.toLowerCase()]                   = uid
      byBattletag[p.battletag.split('#')[0].toLowerCase()]     = uid
    }
  })

  // Tenta resolver UID a partir do nome guardado no time
  const resolveUid = (nome) => {
    const n = (nome || '').toLowerCase()
    return byDiscord[n]
      || byBattletag[n]
      || byBattletag[n.split('#')[0]]
      || null
  }

  const opts = []
  const addRoster = (team, side) => {
    if (!team) return
    // `jogadores` é um array; Firebase pode retornar como objeto { "0": {}, "1": {} }
    const raw = team.jogadores ?? team.roster
    if (!raw) return
    const arr = Array.isArray(raw) ? raw : Object.values(raw)
    arr.forEach((j) => {
      const nome = j.nome ?? j.discord ?? ''
      const uid  = resolveUid(nome) ?? nome  // fallback: usa o nome como identificador
      opts.push({
        uid,
        nome,
        battletag: players[uid]?.battletag ?? '',
        side,
        teamNome:  team.nome ?? side,
        teamCor:   team.cor,
      })
    })
  }
  addRoster(tA, 'A')
  addRoster(tB, 'B')
  return opts
}

// ── GamePanel ─────────────────────────────────────────────────────────────────

function GamePanel({
  gameNum, gameData, status, error, isJsonMode, jsonInput, unidentified,
  pendingOverrides, rosterOptions, getUsedUids, tA, tB,
  savingOverrides, parserAvailable,
  onFileUpload, onToggleJsonMode, onJsonInput, onJsonSave, onSetOverride, onSaveOverrides,
}) {
  const parsed    = !!gameData?.parsed
  const uploading = status === 'uploading'

  // Agrupa não-identificados por time do replay
  const unidTeam1 = unidentified.filter(p => p.replayTeam === 1)
  const unidTeam2 = unidentified.filter(p => p.replayTeam === 2)
  const hasUnidentified = unidentified.length > 0

  const teamGroups = [
    { label: 'Time 1 do replay', slots: unidTeam1, cor: tA?.cor },
    { label: 'Time 2 do replay', slots: unidTeam2, cor: tB?.cor },
  ].filter(g => g.slots.length > 0)

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Game {gameNum}
        </span>
        {parsed && !uploading && (
          <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>✓ PARSEADO</span>
        )}
        {uploading && (
          <span style={{ fontSize: 11, color: 'var(--blue)', fontFamily: "'Barlow Condensed', sans-serif" }}>⏳ Processando...</span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>✗ Erro</span>
        )}
        {parsed && gameData?.match && (
          <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif', marginLeft: 4" }}>
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

      {/* Modo de upload */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          disabled={!parserAvailable || uploading}
          onClick={() => isJsonMode && onToggleJsonMode()}
          title={!parserAvailable ? 'VITE_REPLAY_PARSER_URL não configurado' : undefined}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 4,
            cursor: parserAvailable && !uploading ? 'pointer' : 'not-allowed',
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

      {!isJsonMode && (
        <input
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
            maxWidth: 280,
          }}
        />
      )}

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

      {/* Jogadores não identificados — agrupados por time do replay */}
      {parsed && hasUnidentified && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.25)',
          borderRadius: 6,
        }}>
          <div style={{
            fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
          }}>
            ⚠ {unidentified.length} jogador{unidentified.length > 1 ? 'es' : ''} não identificado{unidentified.length > 1 ? 's' : ''}
          </div>

          {teamGroups.map(({ label, slots, cor }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: cor ?? 'var(--text3)', marginBottom: 6,
              }}>
                {label}
              </div>

              {slots.map(({ slot, battletag, hero }) => {
                const usedUids   = getUsedUids(slot)
                const available  = rosterOptions.filter(p => !usedUids.has(p.uid))
                const currentVal = pendingOverrides[slot] ?? ''

                return (
                  <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Barlow Condensed', sans-serif", minWidth: 150 }}>
                      {hero} <span style={{ color: 'var(--text3)' }}>({battletag})</span>
                    </span>
                    <select
                      value={currentVal}
                      onChange={e => onSetOverride(slot, e.target.value || null)}
                      style={{
                        background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4,
                        padding: '4px 8px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
                        fontSize: 11, flex: 1, minWidth: 180, outline: 'none',
                      }}
                    >
                      <option value="">— não identificado —</option>
                      {/* Agrupa por time A e B no dropdown */}
                      {[
                        { side: 'A', nome: tA?.nome ?? 'Time A', cor: tA?.cor },
                        { side: 'B', nome: tB?.nome ?? 'Time B', cor: tB?.cor },
                      ].map(({ side, nome: teamNome }) => {
                        const group = available.filter(p => p.side === side)
                        if (!group.length) return null
                        return (
                          <optgroup key={side} label={teamNome}>
                            {group.map(p => (
                              <option key={p.uid} value={p.uid}>
                                {p.nome}{p.battletag ? ` (${p.battletag})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )
                      })}
                    </select>
                  </div>
                )
              })}
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

      {parsed && !hasUnidentified && Object.keys(gameData?.players ?? {}).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          ✓ Todos os jogadores identificados
        </div>
      )}
    </div>
  )
}
