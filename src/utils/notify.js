/**
 * notify.js — Notificações para o admin via Discord webhook
 *
 * Best-effort: falhas aqui não devem travar o fluxo do usuário (capitão).
 */
export async function notificarDiscord(mensagem) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: mensagem }),
    })
  } catch {
    // silencioso — notificação não é crítica
  }
}
