/**
 * Lógica pura do draft de heróis — Copa Inhouse
 *
 * O ponto central deste módulo é que a SEQUÊNCIA de picks e bans é um array
 * de passos configurável externamente (vem do Firebase via config do admin).
 * Nada aqui assume uma ordem fixa — o sistema executa o que a config mandar.
 *
 * Timestamps que precisam ser comparáveis entre clientes (turnoIniciadoEm)
 * usam serverTimestamp() do Firebase para evitar drift de relógio local —
 * o servidor resolve o marcador na hora da escrita.
 */
import { serverTimestamp } from 'firebase/database'

// ── Tipos de ação ────────────────────────────────────────────────────────────

export const ACOES = {
  BAN:  'ban',
  PICK: 'pick',
}

export const TIMES = {
  A: 'A',
  B: 'B',
}

// ── Heróis vinculados ────────────────────────────────────────────────────────
//
// Cho'Gall é um único "herói" controlado por dois jogadores — ocupa 2 slots
// do roster. No draft: banir um bane os dois (mas conta como 1 ban); escolher
// um escolhe os dois de uma vez, e só pode acontecer no início de um pick duplo
// (onde os 2 slots consecutivos da sequência ficam preenchidos pelo par).

export const PARES_VINCULADOS = { cho: 'gall', gall: 'cho' }

export function parVinculado(heroiId) {
  return PARES_VINCULADOS[heroiId] ?? null
}

// Agrupa um array de bans em slots lógicos: o par Cho'Gall (2 entradas em
// `bans[]`, pois banir um bane os dois) é exibido em um único slot.
export function bansLogicos(bans = []) {
  const out = []
  for (let i = 0; i < bans.length; i++) {
    const id  = bans[i]
    const par = parVinculado(id)
    if (par && bans[i + 1] === par) {
      out.push({ heroiId: id, parId: par })
      i++
    } else {
      out.push({ heroiId: id, parId: null })
    }
  }
  return out
}

// Verifica se o passo atual é o primeiro de um pick duplo (mesmo time, 2 picks seguidos)
export function ehInicioDePickDuplo(estado) {
  const idx   = estado.passoAtual
  const atual = estado.sequencia[idx]
  const prox  = estado.sequencia[idx + 1]
  return !!atual && atual.acao === ACOES.PICK &&
         !!prox  && prox.acao === ACOES.PICK && prox.time === atual.time
}

export const STATUS_DRAFT = {
  AGUARDANDO: 'aguardando',
  COUNTDOWN:  'countdown',
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

// ── Configuração padrão de timer ─────────────────────────────────────────────

export const DEFAULT_TIMER_CONFIG = {
  ban:       30,
  pick:      30,
  pickDuplo: 50,
}

// Retorna quantos segundos o capitão tem para o passo atual.
// Pick duplo = turns consecutivos do mesmo time (ex: B escolhe 2 heróis).
export function getDuracao(estado) {
  const cfg  = { ...DEFAULT_TIMER_CONFIG, ...(estado?.timerConfig ?? {}) }
  const seq  = estado?.sequencia
  const idx  = estado?.passoAtual ?? 0
  const step = seq?.[idx]
  if (!step) return cfg.pick
  if (step.acao === 'ban') return cfg.ban
  const prev = idx > 0 ? seq[idx - 1] : null
  const next = seq?.[idx + 1]
  const isInDuplo =
    (next?.time === step.time && next?.acao === 'pick') ||
    (prev?.time === step.time && prev?.acao === 'pick')
  return isInDuplo ? cfg.pickDuplo : cfg.pick
}

// ── Estado inicial do draft ──────────────────────────────────────────────────

export function criarEstadoInicial({ timeA, timeB, sequencia = SEQUENCIA_PADRAO, globalBans = [], mapaId = null, timerConfig = null }) {
  return {
    status:      STATUS_DRAFT.AGUARDANDO,
    sequencia:   expandirSequencia(sequencia),
    passoAtual:  0,
    globalBans,
    mapaId,
    timerConfig: { ...DEFAULT_TIMER_CONFIG, ...(timerConfig ?? {}) },
    timeA: {
      nome:  timeA.nome,
      cor:   timeA.cor   ?? '#4a9eda',
      ...(timeA.capitaoUid   ? { capitaoUid:   timeA.capitaoUid }   : {}),
      ...(timeA.capitaoEmail ? { capitaoEmail: timeA.capitaoEmail } : {}),
      picks: [],
      bans:  [],
    },
    timeB: {
      nome:  timeB.nome,
      cor:   timeB.cor   ?? '#e05555',
      ...(timeB.capitaoUid   ? { capitaoUid:   timeB.capitaoUid }   : {}),
      ...(timeB.capitaoEmail ? { capitaoEmail: timeB.capitaoEmail } : {}),
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

  const par = parVinculado(heroiId)

  // Cho'Gall só pode ser ESCOLHIDO no início de um pick duplo (preenche os 2 slots)
  if (passo.acao === ACOES.PICK && par && !ehInicioDePickDuplo(estado)) {
    return { ok: false, erro: "Cho'Gall só pode ser escolhido no início de um pick duplo" }
  }

  const novoEstado = deepClone(estado)
  const time = passo.time === TIMES.A ? novoEstado.timeA : novoEstado.timeB
  const passosConsumidos = par ? (passo.acao === ACOES.BAN ? 1 : 2) : 1

  if (passo.acao === ACOES.BAN) {
    time.bans.push(heroiId)
    if (par) time.bans.push(par)
  } else {
    time.picks.push(heroiId)
    if (par) time.picks.push(par)
  }

  novoEstado.historico.push({
    passo:   estado.passoAtual,
    acao:    passo.acao,
    time:    passo.time,
    heroiId,
    ...(par ? { heroiPar: par } : {}),
    timestamp: Date.now(),
  })

  novoEstado.passoAtual += passosConsumidos

  // Só reseta o timer ao trocar de grupo (time ou tipo de ação diferente)
  const nextPasso = novoEstado.sequencia[novoEstado.passoAtual]
  const grupoContínua = nextPasso && nextPasso.time === passo.time && nextPasso.acao === passo.acao
  if (!grupoContínua) {
    novoEstado.turnoIniciadoEm = serverTimestamp()
  }

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
  const idsRemover  = ultimaAcao.heroiPar ? [ultimaAcao.heroiId, ultimaAcao.heroiPar] : [ultimaAcao.heroiId]

  if (ultimaAcao.acao === ACOES.BAN) {
    time.bans = time.bans.filter((id) => !idsRemover.includes(id))
  } else {
    time.picks = time.picks.filter((id) => !idsRemover.includes(id))
  }

  novoEstado.passoAtual      = ultimaAcao.passo
  novoEstado.status          = STATUS_DRAFT.RODANDO
  novoEstado.turnoIniciadoEm = serverTimestamp()

  return { ok: true, estado: novoEstado }
}

// ── Encerrar draft manualmente (admin) ──────────────────────────────────────

export function encerrarDraft(estado) {
  return { ...deepClone(estado), status: STATUS_DRAFT.ENCERRADO }
}

// ── Reiniciar draft (admin) ──────────────────────────────────────────────────
//
// Volta o draft para 'aguardando', preservando configuração (sequência,
// timer, mapa, global bans, nomes/cores dos times) mas limpando picks, bans,
// histórico e marcadores de turno/contagem — útil quando o admin precisa
// corrigir algo antes de iniciar de novo, sem recriar o Hero Draft inteiro.

export function reiniciarDraft(estado) {
  const clone = deepClone(estado)
  delete clone.countdownEndsAt
  delete clone.countdownStartedAt
  delete clone.countdownSecs
  delete clone.turnoIniciadoEm

  // Exige que os capitães confirmem presença de novo — garante que ainda
  // estão na sala antes do admin iniciar o draft outra vez.
  const presence = clone.presence ?? {}
  for (const t of ['A', 'B']) {
    if (presence[t]) {
      presence[t] = { ...presence[t], confirmado: false }
      delete presence[t].confirmedEm
    }
  }

  return {
    ...clone,
    status:     STATUS_DRAFT.AGUARDANDO,
    passoAtual: 0,
    historico:  [],
    presence,
    timeA: { ...clone.timeA, picks: [], bans: [] },
    timeB: { ...clone.timeB, picks: [], bans: [] },
  }
}

// ── Iniciar draft ────────────────────────────────────────────────────────────

export function iniciarDraft(estado) {
  if (estado.status !== STATUS_DRAFT.AGUARDANDO && estado.status !== STATUS_DRAFT.COUNTDOWN) {
    return { ok: false, erro: 'Draft não está em modo de espera' }
  }
  const clone = deepClone(estado)
  delete clone.countdownEndsAt
  delete clone.countdownStartedAt
  delete clone.countdownSecs
  return { ok: true, estado: { ...clone, status: STATUS_DRAFT.RODANDO, turnoIniciadoEm: serverTimestamp() } }
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
