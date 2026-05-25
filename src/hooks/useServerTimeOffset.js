import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'

// Offset entre Date.now() local e o relógio do servidor Firebase.
// Necessário porque relógios de SO podem estar dessincronizados (vimos drift
// de >10 min em teste com jogadores de outros países), o que quebra o timer
// e o auto-skip de turno.
// Uso: serverNow = Date.now() + offset
export function useServerTimeOffset() {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const r = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(r, snap => {
      const v = snap.val()
      if (typeof v === 'number') setOffset(v)
    })
    return () => unsub()
  }, [])
  return offset
}
