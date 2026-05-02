/**
 * Helpers de paths do Firebase por campeonato.
 * Com campeonatoId: usa o novo namespace /campeonatos/{id}/
 * Sem campeonatoId (null/undefined): fallback para paths legados
 *
 * Permite migração gradual — cada página passa a usar esses helpers
 * e automaticamente funciona com ambas as arquiteturas durante a transição.
 */

const c = (id, sub) => id ? `/campeonatos/${id}/${sub}` : `/${sub}`

export const teamPath            = id => c(id, 'teams')
export const rodadasPath         = id => c(id, 'rodadas')
export const confrontosPath      = id => c(id, 'confrontos')
export const disponibilidadePath = id => c(id, 'disponibilidade')
export const playersPath         = id => c(id, 'players')
export const playerOverridesPath = id => c(id, 'playerOverrides')
export const draftSessionPath    = id => c(id, 'draftSession')
export const heroDraftPath       = id => c(id, 'heroDraft')

export const configModulesPath   = id => id ? `/campeonatos/${id}/config/modules`  : '/config/modules'
export const configDraftPath     = id => id ? `/campeonatos/${id}/config/draft`    : '/config/draft'
export const configConteudoPath  = id => id ? `/campeonatos/${id}/config/conteudo` : '/config/conteudo'
