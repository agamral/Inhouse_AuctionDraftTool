import { createContext, useContext, useState, useCallback } from 'react'

/**
 * ViewAsContext — permite ao admin simular a perspectiva de outro usuário.
 *
 * Modos:
 *   null          → visão real do admin (padrão)
 *   'publico'     → sem login, sem capitão, sem admin
 *   'capitao'     → como capitão de um time específico
 */
const ViewAsContext = createContext(null)

export function ViewAsProvider({ children }) {
  const [viewAs, setViewAsState] = useState(null)
  // viewAs shape: null | { modo: 'publico' } | { modo: 'capitao', teamId, teamData }

  const ativar = useCallback((modo, extra = {}) => {
    setViewAsState({ modo, ...extra })
  }, [])

  const sair = useCallback(() => {
    setViewAsState(null)
  }, [])

  return (
    <ViewAsContext.Provider value={{ viewAs, ativar, sair }}>
      {children}
    </ViewAsContext.Provider>
  )
}

export function useViewAs() {
  const ctx = useContext(ViewAsContext)
  if (!ctx) throw new Error('useViewAs deve ser usado dentro de ViewAsProvider')
  return ctx
}
