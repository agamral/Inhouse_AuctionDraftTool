import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'

/**
 * Resolve o path base de configuração de um campeonato.
 * Se campeonatoId for fornecido usa o novo namespace.
 * Se não, usa o path legado (/config) para backward compat durante a migração.
 */
function configPath(campeonatoId, subpath) {
  return campeonatoId
    ? `/campeonatos/${campeonatoId}/config/${subpath}`
    : `/config/${subpath}`
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_MODULES = {
  inscricaoAberta:  false,
  draftAtivo:       false,
  espectadorAtivo:  false,
  campeonatoAtivo:  false,
  heroDraftAtivo:   false,
  privacidadeAtiva: false,
}

export const DEFAULT_DRAFT = {
  moedas:      15,
  minPlayers:  5,
  maxPlayers:  7,
  minCaptains: 2,
  maxCaptains: 8,
  rouboAtivo:  true,
  leilaoReservas: false,
}

export const DEFAULT_CONTEUDO = {
  cupName:              'Copa Inhouse',
  labelSeason:          'Season 1 · Heroes of the Storm',
  descricaoTorneio:     '',
  proximoEvento:        '',
  posInscricaoTexto:    '',
  prazoDisponibilidade: '',
  regrasFormato:        '',
  stream1Nome:          '',
  stream1Url:           '',
  stream2Nome:          '',
  stream2Url:           '',
  stream3Nome:          '',
  stream3Url:           '',
}

export const DEFAULT_PARTIDAS = {
  formatoFaseRegular: 'MD2',
  formatoPlayoffs:    'MD5',
  formatoGranFinal:   'MD5',
  tipoBracket:        'dupla',
}

export const DEFAULT_PONTUACAO = {
  vitoria:           3,
  empate:            1,
  derrota:           0,
  woVitoria:         3,
  desempateVitoria:  1,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Lê os módulos ativos. Aceita campeonatoId para o novo namespace.
 * Sem campeonatoId: lê do path legado /config/modules.
 */
export function useModules(campeonatoId = null) {
  const [modules, setModules] = useState(DEFAULT_MODULES)

  useEffect(() => {
    const path = configPath(campeonatoId, 'modules')
    const unsub = onValue(ref(db, path), (snap) => {
      if (snap.exists()) setModules({ ...DEFAULT_MODULES, ...snap.val() })
      else setModules(DEFAULT_MODULES)
    })
    return unsub
  }, [campeonatoId])

  return modules
}

/**
 * Lê o conteúdo editável do site. Aceita campeonatoId para o novo namespace.
 */
export function useConteudo(campeonatoId = null) {
  const [conteudo, setConteudo] = useState(DEFAULT_CONTEUDO)

  useEffect(() => {
    const path = configPath(campeonatoId, 'conteudo')
    const unsub = onValue(ref(db, path), (snap) => {
      if (snap.exists()) setConteudo({ ...DEFAULT_CONTEUDO, ...snap.val() })
      else setConteudo(DEFAULT_CONTEUDO)
    })
    return unsub
  }, [campeonatoId])

  return conteudo
}

/**
 * Lê as regras do leilão. Aceita campeonatoId para o novo namespace.
 */
export function useDraftConfig(campeonatoId = null) {
  const [draftConfig, setDraftConfig] = useState(DEFAULT_DRAFT)

  useEffect(() => {
    const path = configPath(campeonatoId, 'draft')
    const unsub = onValue(ref(db, path), (snap) => {
      if (snap.exists()) setDraftConfig({ ...DEFAULT_DRAFT, ...snap.val() })
      else setDraftConfig(DEFAULT_DRAFT)
    })
    return unsub
  }, [campeonatoId])

  return draftConfig
}

/**
 * Lê o formato das partidas. Apenas para o novo namespace.
 */
export function useFormatoPartidas(campeonatoId = null) {
  const [formato, setFormato] = useState(DEFAULT_PARTIDAS)

  useEffect(() => {
    if (!campeonatoId) return
    const unsub = onValue(ref(db, `/campeonatos/${campeonatoId}/config/partidas`), (snap) => {
      if (snap.exists()) setFormato({ ...DEFAULT_PARTIDAS, ...snap.val() })
    })
    return unsub
  }, [campeonatoId])

  return formato
}

/**
 * Lê a pontuação customizada. Apenas para o novo namespace.
 */
export function usePontuacao(campeonatoId = null) {
  const [pontuacao, setPontuacao] = useState(DEFAULT_PONTUACAO)

  useEffect(() => {
    if (!campeonatoId) return
    const unsub = onValue(ref(db, `/campeonatos/${campeonatoId}/config/pontuacao`), (snap) => {
      if (snap.exists()) setPontuacao({ ...DEFAULT_PONTUACAO, ...snap.val() })
    })
    return unsub
  }, [campeonatoId])

  return pontuacao
}
