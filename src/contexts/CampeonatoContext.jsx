import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ref, onValue, update, get } from 'firebase/database'
import { db } from '../firebase/database'

export const CampeonatoContext = createContext(null)

/**
 * Provê o campeonato ativo para todo o app.
 *
 * - Rotas públicas sempre usam o campeonato com principal: true
 * - Admin pode selecionar qualquer campeonato (SuperAdmin) ou é
 *   auto-selecionado para o único campeonato ao qual tem acesso
 */
export function CampeonatoProvider({ children }) {
  const [campeonatos,  setCampeonatos]  = useState({})
  const [idSelecionado, setIdSelecionado] = useState(null)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    const unsub = onValue(ref(db, '/campeonatos'), (snap) => {
      const data = snap.val() ?? {}
      setCampeonatos(data)

      // Se ainda não há seleção, auto-seleciona o principal
      setIdSelecionado(prev => {
        if (prev && data[prev]) return prev
        const entry = Object.entries(data).find(([, c]) => c.info?.principal)
        return entry ? entry[0] : (Object.keys(data)[0] ?? null)
      })

      setLoading(false)
    })
    return unsub
  }, [])

  // Campeonato exibido nas rotas públicas (principal: true, ou override via URL)
  const [idPublicoOverride, setIdPublicoOverride] = useState(null)
  const idPrincipal = Object.entries(campeonatos).find(([, c]) => c.info?.principal)?.[0] ?? null
  const idPublico = idPublicoOverride ?? idPrincipal

  // Ao setar principal em um campeonato, remove dos demais
  const setPrincipal = useCallback(async (campeonatoId) => {
    const updates = {}
    Object.keys(campeonatos).forEach(id => {
      updates[`/campeonatos/${id}/info/principal`] = id === campeonatoId
    })
    await update(ref(db), updates)
  }, [campeonatos])

  const value = {
    // Para rotas públicas
    idPublico,
    campeonatoPublico: idPublico ? campeonatos[idPublico] : null,

    // Para o admin (campeonato em operação)
    campeonatoId:  idSelecionado,
    campeonato:    idSelecionado ? campeonatos[idSelecionado] : null,
    campeonatos,

    // Ações
    setCampeonatoId: setIdSelecionado,
    setPrincipal,
    setIdPublicoOverride,

    loading,
  }

  return (
    <CampeonatoContext.Provider value={value}>
      {children}
    </CampeonatoContext.Provider>
  )
}

export function useCampeonato() {
  const ctx = useContext(CampeonatoContext)
  if (!ctx) throw new Error('useCampeonato deve ser usado dentro de CampeonatoProvider')
  return ctx
}
