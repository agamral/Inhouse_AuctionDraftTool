/**
 * notify.js — Notificações para o admin via Discord webhook
 *
 * Best-effort: falhas aqui não devem travar o fluxo do usuário (capitão).
 */
export async function notificarDiscord(mensagem, roles = []) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: mensagem, roles }),
    })
  } catch {
    // silencioso — notificação não é crítica
  }
}

/** Retorna a menção do cargo do Discord (`<@&id>`) se o time tiver `discordRoleId`, senão o nome do time em negrito. */
export function mencaoTime(time, fallback) {
  return time?.discordRoleId
    ? `<@&${time.discordRoleId}>`
    : `**${time?.nome ?? fallback}**`
}
