import { useState, useEffect, useCallback } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db } from '../firebase/database'
import {
  criarEstadoInicial,
  executarAcao,
  desfazerUltimaAcao,
  encerrarDraft,
  iniciarDraft,
  SEQUENCIA_PADRAO,
} from '../utils/heroDraft'

const DRAFT_PATH = 'heroDraft'

// Retorna o estado do draft de heróis em tempo real via Firebase.
// sessionId: ID da sessão ativa (ex: 'semifinal-1')
// timeLocal:  'A' | 'B' | 'admin' — quem está usando este hook
export function useHeroDraft(sessionId, timeLocal = null) {
  const [estado, setEstado]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState(null)

  const path = `${DRAFT_PATH}/${sessionId}`

  // ── Listener Firebase ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return

    const draftRef = ref(db, path)
    const unsub = onValue(
      draftRef,
      (snap) => {
        const data = snap.val()
        if (data) {
          // Firebase drops empty arrays — restore them so components don't crash
          data.globalBans = Array.isArray(data.globalBans) ? data.globalBans : []
          data.historico  = Array.isArray(data.historico)  ? data.historico  : []
          data.sequencia  = Array.isArray(data.sequencia)  ? data.sequencia  : []
          if (data.timeA) {
            data.timeA.picks = Array.isArray(data.timeA.picks) ? data.timeA.picks : []
            data.timeA.bans  = Array.isArray(data.timeA.bans)  ? data.timeA.bans  : []
          }
          if (data.timeB) {
            data.timeB.picks = Array.isArray(data.timeB.picks) ? data.timeB.picks : []
            data.timeB.bans  = Array.isArray(data.timeB.bans)  ? data.timeB.bans  : []
          }
        }
        setEstado(data)
        setLoading(false)
      },
      (err) => {
        setErro(err.message)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [sessionId])

  // ── É a vez deste time agir? ───────────────────────────────────────────────
  const ehMinhaTez = useCallback(() => {
    if (!estado || !timeLocal || timeLocal === 'admin') return false
    if (estado.status !== 'rodando') return false
    const passo = estado.sequencia?.[estado.passoAtual]
    return passo?.time === timeLocal
  }, [estado, timeLocal])

  // ── Executar ban ou pick ───────────────────────────────────────────────────
  const agir = useCallback(async (heroiId) => {
    if (!estado) return { ok: false, erro: 'Estado não carregado' }

    const resultado = executarAcao(estado, heroiId)
    if (!resultado.ok) return resultado

    try {
      await set(ref(db, path), resultado.estado)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e.message }
    }
  }, [estado, path])

  // ── Desfazer (só admin) ────────────────────────────────────────────────────
  const desfazer = useCallback(async () => {
    if (!estado) return { ok: false, erro: 'Estado não carregado' }

    const resultado = desfazerUltimaAcao(estado)
    if (!resultado.ok) return resultado

    try {
      await set(ref(db, path), resultado.estado)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e.message }
    }
  }, [estado, path])

  // ── Iniciar draft (admin) ──────────────────────────────────────────────────
  const iniciar = useCallback(async () => {
    if (!estado) return { ok: false, erro: 'Estado não carregado' }

    const resultado = iniciarDraft(estado)
    if (!resultado.ok) return resultado

    try {
      await set(ref(db, path), resultado.estado)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e.message }
    }
  }, [estado, path])

  // ── Encerrar draft (admin) ─────────────────────────────────────────────────
  const encerrar = useCallback(async () => {
    if (!estado) return { ok: false, erro: 'Estado não carregado' }

    const novoEstado = encerrarDraft(estado)

    try {
      await set(ref(db, path), novoEstado)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e.message }
    }
  }, [estado, path])

  // ── Criar nova sessão (admin) ──────────────────────────────────────────────
  const criarSessao = useCallback(async ({ timeA, timeB, sequencia, globalBans }) => {
    const novoEstado = criarEstadoInicial({
      timeA,
      timeB,
      sequencia: sequencia ?? SEQUENCIA_PADRAO,
      globalBans: globalBans ?? [],
    })

    try {
      await set(ref(db, path), novoEstado)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e.message }
    }
  }, [path])

  // ── Atualizar global bans sem resetar o draft (admin) ─────────────────────
  const atualizarGlobalBans = useCallback(async (globalBans) => {
    try {
      await update(ref(db, path), { globalBans })
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e.message }
    }
  }, [path])

  return {
    estado,
    loading,
    erro,
    ehMinhaTez,
    agir,
    desfazer,
    iniciar,
    encerrar,
    criarSessao,
    atualizarGlobalBans,
  }
}
