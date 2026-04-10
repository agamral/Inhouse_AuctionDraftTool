/**
 * Lógica pura do leilão — Copa Inhouse
 * Regras completas definidas em CLAUDE.md
 */

/**
 * Verifica se um capitão pode comprar um player disponível.
 */
export function canBuy(team, player, allPlayers) {
  if (team.moedas < player.preco) return { ok: false, reason: 'Moedas insuficientes' }
  if (team.roster.length >= 7) return { ok: false, reason: 'Time completo (máximo 7)' }
  const inRoster = team.roster.some((p) => p.id === player.id)
  if (inRoster) return { ok: false, reason: 'Jogador já está no seu time' }
  return { ok: true }
}

/**
 * Verifica se um capitão pode roubar um player de outro time.
 */
export function canSteal(team, player, ownerTeam) {
  if (!ownerTeam) return { ok: false, reason: 'Player não pertence a nenhum time' }
  if (ownerTeam.id === team.id) return { ok: false, reason: 'Não pode roubar do próprio time' }
  const stealCost = player.preco + 1
  if (team.moedas < stealCost) return { ok: false, reason: `Moedas insuficientes (precisa ${stealCost})` }
  if (team.roster.length >= 7) return { ok: false, reason: 'Time completo (máximo 7)' }
  const hasCaptain = ownerTeam.roster.find((p) => p.isCaptain)
  if (hasCaptain && hasCaptain.id === player.id) return { ok: false, reason: 'Não pode roubar capitão' }
  return { ok: true, cost: stealCost }
}

/**
 * Verifica se o leilão pode ser encerrado automaticamente.
 * Fecha quando TODOS os times têm mínimo 5 players.
 */
export function shouldClose(teams, minPlayers = 5) {
  return Object.values(teams).every((t) => t.roster.length >= minPlayers)
}

/**
 * Calcula o próximo turno baseado na seed reversa (NBA Draft style).
 * Seed menor = melhor = escolhe por último.
 */
export function nextTurn(teams, currentTeamId, extraTurnTeamId = null) {
  if (extraTurnTeamId) return extraTurnTeamId

  const sorted = Object.entries(teams).sort(([, a], [, b]) => b.seed - a.seed)
  const currentIndex = sorted.findIndex(([id]) => id === currentTeamId)
  const nextIndex = (currentIndex + 1) % sorted.length
  return sorted[nextIndex][0]
}
