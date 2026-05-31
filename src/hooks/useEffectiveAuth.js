import { useAuth } from './useAuth'
import { useViewAs } from '../contexts/ViewAsContext'

/**
 * useEffectiveAuth — retorna o estado de autenticação efetivo.
 *
 * Quando admin está no modo "Ver como", sobrescreve isAdmin/capitao/etc.
 * para simular a perspectiva do usuário selecionado. O auth real do
 * Firebase não é alterado — é só uma camada de apresentação.
 *
 * Componentes públicos e de capitão devem usar este hook.
 * Componentes exclusivos de admin (painel, configurações) usam useAuth diretamente.
 */
export function useEffectiveAuth() {
  const realAuth = useAuth()
  const { viewAs } = useViewAs()

  // Sem override ativo ou usuário não é admin: retorna estado real
  if (!viewAs || !realAuth.isAdmin) return realAuth

  if (viewAs.modo === 'publico') {
    return {
      ...realAuth,
      isAdmin:      false,
      isSuperAdmin: false,
      capitao:      null,
    }
  }

  if (viewAs.modo === 'capitao') {
    return {
      ...realAuth,
      isAdmin:      false,
      isSuperAdmin: false,
      capitao:      viewAs.teamData ?? null,
    }
  }

  return realAuth
}
