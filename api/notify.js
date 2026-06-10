// Vercel serverless function — encaminha mensagens de notificação para um
// Discord webhook privado. O DISCORD_WEBHOOK_URL fica só em variável de
// ambiente no Vercel, nunca no bundle do frontend.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    res.status(500).json({ error: 'Webhook não configurado' })
    return
  }

  const { content } = req.body ?? {}
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'content é obrigatório' })
    return
  }

  const body = JSON.stringify({ content: content.slice(0, 2000) })
  const tentativas = 3

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (r.ok) {
        res.status(200).json({ ok: true })
        return
      }
      if (tentativa === tentativas) {
        res.status(502).json({ error: 'Falha ao enviar para o Discord' })
        return
      }
    } catch (e) {
      if (tentativa === tentativas) {
        res.status(500).json({ error: e.message })
        return
      }
    }
    // backoff curto antes de tentar de novo
    await new Promise(resolve => setTimeout(resolve, 300 * tentativa))
  }
}
