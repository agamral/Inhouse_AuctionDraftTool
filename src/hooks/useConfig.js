import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'

const DEFAULT_MODULES = {
  inscricaoAberta: false,
  draftAtivo: false,
  espectadorAtivo: false,
}

const DEFAULT_DRAFT = {
  moedas: 15,
  minPlayers: 5,
  maxPlayers: 7,
  rouboAtivo: true,
}

export function useModules() {
  const [modules, setModules] = useState(DEFAULT_MODULES)

  useEffect(() => {
    const unsub = onValue(ref(db, '/config/modules'), (snap) => {
      if (snap.exists()) setModules({ ...DEFAULT_MODULES, ...snap.val() })
    })
    return unsub
  }, [])

  return modules
}

export function useDraftConfig() {
  const [draftConfig, setDraftConfig] = useState(DEFAULT_DRAFT)

  useEffect(() => {
    const unsub = onValue(ref(db, '/config/draft'), (snap) => {
      if (snap.exists()) setDraftConfig({ ...DEFAULT_DRAFT, ...snap.val() })
    })
    return unsub
  }, [])

  return draftConfig
}
