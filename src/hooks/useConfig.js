import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'

const DEFAULT_MODULES = {
  inscricaoAberta:  false,
  draftAtivo:       false,
  espectadorAtivo:  false,
  campeonatoAtivo:  false,
  heroDraftAtivo:   false,
  privacidadeAtiva: false,
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

export const DEFAULT_CONTEUDO = {
  cupName:              'Copa Inhouse',
  labelSeason:          'Season 1 · Heroes of the Storm',
  descricaoTorneio:     '',
  proximoEvento:        '',
  posInscricaoTexto:    '',
  prazoDisponibilidade: '',
}

export function useConteudo() {
  const [conteudo, setConteudo] = useState(DEFAULT_CONTEUDO)

  useEffect(() => {
    const unsub = onValue(ref(db, '/config/conteudo'), (snap) => {
      if (snap.exists()) setConteudo({ ...DEFAULT_CONTEUDO, ...snap.val() })
    })
    return unsub
  }, [])

  return conteudo
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
