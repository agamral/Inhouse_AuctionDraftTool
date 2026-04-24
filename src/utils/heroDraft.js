/**
 * Lógica pura do draft de heróis — Copa Inhouse
 *
 * O ponto central deste módulo é que a SEQUÊNCIA de picks e bans é um array
 * de passos configurável externamente (vem do Firebase via config do admin).
 * Nada aqui assume uma ordem fixa — o sistema executa o que a config mandar.
 */

// ── Tipos de ação ────────────────────────────────────────────────────────────

export const ACOES = {
  BAN:  'ban',
  PICK: 'pick',
}

export const TIMES = {
  A: 'A',
  B: 'B',
}

export const STATUS_DRAFT = {
  AGUARDANDO: 'aguardando',
  RODANDO:    'rodando',
  ENCERRADO:  'encerrado',
}

// ── Sequência padrão HotS (usada como fallback se admin não configurar) ──────
//
// Formato de cada passo:
//   { acao: 'ban'|'pick', time: 'A'|'B', quantidade: 1|2 }
//
// O campo `quantidade` permite que um único passo represente ações consecutivas
// do mesmo time (ex: B pick 2 = B escolhe 2 heróis em sequência).
// O engine expande isso em ações individuais via expandirSequencia().

export const SEQUENCIA_PADRAO = [
  { acao: ACOES.BAN,  time: TIMES.A, quantidade: 1 },
  { acao: ACOES.BAN,  time: TIMES.B, quantidade: 1 },
  { acao: ACOES.BAN,  time: TIMES.A, quantidade: 1 },
  { acao: ACOES.BAN,  time: TIMES.B, quantidade: 1 },
  { acao: ACOES.PICK, time: TIMES.A, quantidade: 1 },
  { acao: ACOES.PICK, time: TIMES.B, quantidade: 2 },
  { acao: ACOES.PICK, time: TIMES.A, quantidade: 2 },
  { acao: ACOES.BAN,  time: TIMES.B, quantidade: 1 },
  { acao: ACOES.BAN,  time: TIMES.A, quantidade: 1 },
  { acao: ACOES.PICK, time: TIMES.B, quantidade: 2 },
  { acao: ACOES.PICK, time: TIMES.A, quantidade: 2 },
  { acao: ACOES.PICK, time: TIMES.B, quantidade: 1 },
]

// ── Engine: expande sequência compacta em lista plana de ações ───────────────
//
// Entrada: array de passos (SEQUENCIA_PADRAO ou qualquer outra config)
// Saída:   array flat onde cada item = uma ação individual
//
// Exemplo:
//   { acao: 'pick', time: 'B', quantidade: 2 }
//   → [ { acao: 'pick', time: 'B', indice: 5 }, { acao: 'pick', time: 'B', indice: 6 } ]

export function expandirSequencia(sequencia) {
  const acoes = []
  sequencia.forEach((passo) => {
    for (let i = 0; i < (passo.quantidade ?? 1); i++) {
      acoes.push({ acao: passo.acao, time: passo.time })
    }
  })
  return acoes
}

// ── Estado inicial do draft ──────────────────────────────────────────────────

export function criarEstadoInicial({ timeA, timeB, sequencia = SEQUENCIA_PADRAO, globalBans = [] }) {
  return {
    status:     STATUS_DRAFT.AGUARDANDO,
    sequencia:  expandirSequencia(sequencia),
    passoAtual: 0,
    globalBans,
    timeA: {
      nome:  timeA.nome,
      cor:   timeA.cor   ?? '#4a9eda',
      picks: [],
      bans:  [],
    },
    timeB: {
      nome:  timeB.nome,
      cor:   timeB.cor   ?? '#e05555',
      picks: [],
      bans:  [],
    },
    historico: [],
  }
}

// ── Consultas de estado ──────────────────────────────────────────────────────

export function passoAtual(estado) {
  return estado.sequencia[estado.passoAtual] ?? null
}

export function isDraftEncerrado(estado) {
  return estado.passoAtual >= estado.sequencia.length || estado.status === STATUS_DRAFT.ENCERRADO
}

export function heroiBloqueado(estado, heroiId) {
  if ((estado.globalBans  ?? []).includes(heroiId)) return true
  if ((estado.timeA.bans  ?? []).includes(heroiId)) return true
  if ((estado.timeB.bans  ?? []).includes(heroiId)) return true
  if ((estado.timeA.picks ?? []).includes(heroiId)) return true
  if ((estado.timeB.picks ?? []).includes(heroiId)) return true
  return false
}

export function todosHeroisBloqueados(estado) {
  return [
    ...(estado.timeA.picks ?? []), ...(estado.timeA.bans ?? []),
    ...(estado.timeB.picks ?? []), ...(estado.timeB.bans ?? []),
    ...(estado.globalBans  ?? []),
  ]
}

// ── Ação principal: executar um ban ou pick ──────────────────────────────────
//
// Retorna { ok, estado, erro }
// Nunca muta o estado original — retorna um novo objeto.

export function executarAcao(estado, heroiId) {
  if (isDraftEncerrado(estado)) {
    return { ok: false, erro: 'Draft já encerrado' }
  }

  const passo = passoAtual(estado)
  if (!passo) {
    return { ok: false, erro: 'Nenhum passo disponível' }
  }

  if (heroiBloqueado(estado, heroiId)) {
    return { ok: false, erro: 'Herói já foi escolhido ou banido' }
  }

  const novoEstado = deepClone(estado)
  const time = passo.time === TIMES.A ? novoEstado.timeA : novoEstado.timeB

  if (passo.acao === ACOES.BAN) {
    time.bans.push(heroiId)
  } else {
    time.picks.push(heroiId)
  }

  novoEstado.historico.push({
    passo:   estado.passoAtual,
    acao:    passo.acao,
    time:    passo.time,
    heroiId,
    timestamp: Date.now(),
  })

  novoEstado.passoAtual      += 1
  novoEstado.turnoIniciadoEm  = Date.now()

  if (novoEstado.passoAtual >= novoEstado.sequencia.length) {
    novoEstado.status = STATUS_DRAFT.ENCERRADO
  }

  return { ok: true, estado: novoEstado }
}

// ── Desfazer última ação (útil para admin corrigir erros) ────────────────────

export function desfazerUltimaAcao(estado) {
  if (estado.historico.length === 0) {
    return { ok: false, erro: 'Nenhuma ação para desfazer' }
  }

  const novoEstado  = deepClone(estado)
  const ultimaAcao  = novoEstado.historico.pop()
  const time        = ultimaAcao.time === TIMES.A ? novoEstado.timeA : novoEstado.timeB

  if (ultimaAcao.acao === ACOES.BAN) {
    time.bans = time.bans.filter((id) => id !== ultimaAcao.heroiId)
  } else {
    time.picks = time.picks.filter((id) => id !== ultimaAcao.heroiId)
  }

  novoEstado.passoAtual      = ultimaAcao.passo
  novoEstado.status          = STATUS_DRAFT.RODANDO
  novoEstado.turnoIniciadoEm = Date.now()

  return { ok: true, estado: novoEstado }
}

// ── Encerrar draft manualmente (admin) ──────────────────────────────────────

export function encerrarDraft(estado) {
  return { ...deepClone(estado), status: STATUS_DRAFT.ENCERRADO }
}

// ── Iniciar draft ────────────────────────────────────────────────────────────

export function iniciarDraft(estado) {
  if (estado.status !== STATUS_DRAFT.AGUARDANDO) {
    return { ok: false, erro: 'Draft não está em modo de espera' }
  }
  return { ok: true, estado: { ...deepClone(estado), status: STATUS_DRAFT.RODANDO, turnoIniciadoEm: Date.now() } }
}

// ── Validação de configuração (usada pelo admin antes de salvar no Firebase) ─

export function validarSequencia(sequencia) {
  if (!Array.isArray(sequencia) || sequencia.length === 0) {
    return { ok: false, erro: 'Sequência deve ser um array não vazio' }
  }
  for (const passo of sequencia) {
    if (!Object.values(ACOES).includes(passo.acao)) {
      return { ok: false, erro: `Ação inválida: ${passo.acao}` }
    }
    if (!Object.values(TIMES).includes(passo.time)) {
      return { ok: false, erro: `Time inválido: ${passo.time}` }
    }
    if (typeof passo.quantidade !== 'number' || passo.quantidade < 1) {
      return { ok: false, erro: 'quantidade deve ser um número >= 1' }
    }
  }

  const totalPicks = expandirSequencia(sequencia).filter((a) => a.acao === ACOES.PICK).length
  if (totalPicks < 10) {
    return { ok: false, erro: `Sequência tem apenas ${totalPicks} picks — mínimo 10 para times de 5` }
  }

  return { ok: true }
}

// ── Utilitário ───────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}
