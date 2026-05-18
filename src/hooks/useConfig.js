import { useState, useEffect, useContext } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { CampeonatoContext } from '../contexts/CampeonatoContext'

function configPath(campeonatoId, subpath) {
  return campeonatoId
    ? `/campeonatos/${campeonatoId}/config/${subpath}`
    : `/config/${subpath}`
}

/** Retorna o idPublico do contexto de campeonato (sem lançar erro fora do provider) */
function useIdPublico() {
  const ctx = useContext(CampeonatoContext)
  return ctx?.idPublico ?? null
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_MODULES = {
  inscricaoAberta:  false,
  inscritosAbertos: false,
  draftAtivo:       false,
  espectadorAtivo:  false,
  campeonatoAtivo:  false,
  heroDraftAtivo:   false,
  privacidadeAtiva:      false,
  bannerInscritosAtivo:  false,
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
  bannerInscritosTexto: '',
  youtubeUrl:           '',
  instagramUrl:         '',
  discordUrl:           '',
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
 * Lê os módulos ativos.
 * - Sem parâmetro: auto-detecta o campeonato principal via contexto
 * - Com campeonatoId explícito: usa esse ID (útil no admin para o campeonato selecionado)
 * - Com null explícito: usa path legado /config/modules
 */
export function useModules(campeonatoId = undefined) {
  const idPublico = useIdPublico()
  const id = campeonatoId === undefined ? idPublico : campeonatoId
  const [modules, setModules] = useState(DEFAULT_MODULES)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const path = configPath(id, 'modules')
    const unsub = onValue(ref(db, path), (snap) => {
      if (snap.exists()) setModules({ ...DEFAULT_MODULES, ...snap.val() })
      else setModules(DEFAULT_MODULES)
      setLoading(false)
    })
    return unsub
  }, [id])

  return { ...modules, loading }
}

/**
 * Lê o conteúdo editável do site.
 * Auto-detecta o campeonato principal quando chamado sem parâmetro.
 */
export function useConteudo(campeonatoId = undefined) {
  const idPublico = useIdPublico()
  const id = campeonatoId === undefined ? idPublico : campeonatoId
  const [conteudo, setConteudo] = useState(DEFAULT_CONTEUDO)

  useEffect(() => {
    const path = configPath(id, 'conteudo')
    const unsub = onValue(ref(db, path), (snap) => {
      if (snap.exists()) setConteudo({ ...DEFAULT_CONTEUDO, ...snap.val() })
      else setConteudo(DEFAULT_CONTEUDO)
    })
    return unsub
  }, [id])

  return conteudo
}

/**
 * Lê as regras do leilão.
 * Auto-detecta o campeonato principal quando chamado sem parâmetro.
 */
export function useDraftConfig(campeonatoId = undefined) {
  const idPublico = useIdPublico()
  const id = campeonatoId === undefined ? idPublico : campeonatoId
  const [draftConfig, setDraftConfig] = useState(DEFAULT_DRAFT)

  useEffect(() => {
    const path = configPath(id, 'draft')
    const unsub = onValue(ref(db, path), (snap) => {
      if (snap.exists()) setDraftConfig({ ...DEFAULT_DRAFT, ...snap.val() })
      else setDraftConfig(DEFAULT_DRAFT)
    })
    return unsub
  }, [id])

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
