/**
 * Notificações do capitão — agenda pendente e confrontos finalizados.
 *
 * "Lidas" são persistidas em /users/{uid}/notifLidas/{key} (ou localStorage
 * como fallback pra capitães sem Firebase Auth, ex: sessão por PIN) pra que
 * o badge não volte a aparecer depois que o capitão já viu o item.
 */
import { useState, useEffect, useMemo } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase/database'
import { confrontosPath, disponibilidadePath, teamPath } from '../utils/campeonatoPaths'
import { STATUS_CONFRONTO } from '../utils/scheduling'

const LOCAL_KEY = 'notifLidas'

function lerLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) ?? {} } catch { return {} }
}

export function useCaptainNotifications(capitao, user) {
  const campeonatoId = capitao?.campeonatoId
  const teamId       = capitao?.teamId
  const uid          = user?.uid

  const [confrontos, setConfrontos] = useState({})
  const [dispon,     setDispon]     = useState({})
  const [teams,      setTeams]      = useState({})
  const [lidas,      setLidas]      = useState(() => lerLocal())

  useEffect(() => {
    if (!campeonatoId || !teamId) return
    const u1 = onValue(ref(db, confrontosPath(campeonatoId)),      s => setConfrontos(s.val() ?? {}))
    const u2 = onValue(ref(db, disponibilidadePath(campeonatoId)), s => setDispon(s.val() ?? {}))
    const u3 = onValue(ref(db, teamPath(campeonatoId)),            s => setTeams(s.val() ?? {}))
    return () => { u1(); u2(); u3() }
  }, [campeonatoId, teamId])

  useEffect(() => {
    if (!uid) return
    return onValue(ref(db, `/users/${uid}/notifLidas`), s => setLidas(s.val() ?? {}))
  }, [uid])

  const items = useMemo(() => {
    if (!campeonatoId || !teamId) return []
    const out = []

    for (const [id, c] of Object.entries(confrontos)) {
      if (c.timeA !== teamId && c.timeB !== teamId) continue
      const oponenteId = c.timeA === teamId ? c.timeB : c.timeA
      const oponente   = teams[oponenteId]?.nome ?? '?'

      if (c.status === STATUS_CONFRONTO.REALIZADO) {
        const key = `confronto-${id}`
        const placar = c.resultado
          ? `${c.timeA === teamId ? c.resultado.timeA : c.resultado.timeB}–${c.timeA === teamId ? c.resultado.timeB : c.resultado.timeA}`
          : null
        out.push({
          key,
          tipo: 'confronto',
          icone: '🏁',
          titulo: `Confronto finalizado vs ${oponente}${placar ? ` (${placar})` : ''}`,
          link: `/campeonatos/${campeonatoId}/confronto/${id}`,
          lida: !!lidas[key],
          timestamp: c.atualizadoEm ?? c.criadoEm ?? 0,
        })
      } else if ([STATUS_CONFRONTO.PENDENTE, STATUS_CONFRONTO.AGENDANDO].includes(c.status)) {
        const jaMarcou = !!dispon[id]?.[teamId]
        if (jaMarcou) continue
        const key = `agenda-${id}`
        out.push({
          key,
          tipo: 'agenda',
          icone: '📅',
          titulo: `Marque sua disponibilidade vs ${oponente}`,
          link: `/campeonatos/${campeonatoId}/agendamento`,
          lida: !!lidas[key],
          timestamp: c.criadoEm ?? 0,
        })
      }
    }

    return out.sort((a, b) => b.timestamp - a.timestamp)
  }, [confrontos, dispon, teams, lidas, campeonatoId, teamId])

  const unreadCount = items.filter(i => !i.lida).length

  function marcarLida(key) {
    if (uid) {
      update(ref(db, `/users/${uid}/notifLidas`), { [key]: true })
    } else {
      const novo = { ...lerLocal(), [key]: true }
      localStorage.setItem(LOCAL_KEY, JSON.stringify(novo))
      setLidas(novo)
    }
  }

  return { items, unreadCount, marcarLida }
}
