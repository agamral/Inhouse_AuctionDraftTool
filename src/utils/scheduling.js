/**
 * scheduling.js — Lógica pura do sistema de agendamento
 * Copa Inhouse — sem dependências de Firebase ou React
 */

// ── Slots disponíveis ────────────────────────────────────────────────────────
// A ORDEM importa: define preferência ao sugerir slot automaticamente

export const SLOTS = [
  'terca-20h', 'terca-21h', 'terca-22h',
  'quarta-20h', 'quarta-21h', 'quarta-22h',
  'quinta-20h', 'quinta-21h', 'quinta-22h',
  'sabado-17h', 'sabado-18h', 'sabado-19h',
]

export const SLOT_LABEL = {
  'terca-20h':  'Terça 20h',  'terca-21h':  'Terça 21h',  'terca-22h':  'Terça 22h',
  'quarta-20h': 'Quarta 20h', 'quarta-21h': 'Quarta 21h', 'quarta-22h': 'Quarta 22h',
  'quinta-20h': 'Quinta 20h', 'quinta-21h': 'Quinta 21h', 'quinta-22h': 'Quinta 22h',
  'sabado-17h': 'Sábado 17h', 'sabado-18h': 'Sábado 18h', 'sabado-19h': 'Sábado 19h',
}

export const SLOT_DIA = {
  'terca-20h': 'terca',  'terca-21h': 'terca',  'terca-22h': 'terca',
  'quarta-20h': 'quarta','quarta-21h': 'quarta', 'quarta-22h': 'quarta',
  'quinta-20h': 'quinta','quinta-21h': 'quinta', 'quinta-22h': 'quinta',
  'sabado-17h': 'sabado','sabado-18h': 'sabado', 'sabado-19h': 'sabado',
}

export const DIA_LABEL = {
  terca: 'Terça-feira', quarta: 'Quarta-feira',
  quinta: 'Quinta-feira', sabado: 'Sábado',
}

// ── Enums de estado ──────────────────────────────────────────────────────────

export const STATUS_CONFRONTO = {
  PENDENTE:        'pendente',        // criado, ninguém marcou disponibilidade
  AGENDANDO:       'agendando',       // pelo menos um time marcou, aguardando acordo
  CONFIRMADO:      'confirmado',      // slot acordado por ambos
  REALIZADO:       'realizado',       // resultado registrado pelo admin
  WO_PENDENTE:     'wo_pendente',     // sem resolução, admin precisa decidir
  EMPATE_PENDENTE: 'empate_pendente', // série 1-1, aguardando desempate MD3
  ADIADO:          'adiado',          // admin adiou
  CANCELADO:       'cancelado',       // admin cancelou
}

export const TIPO_RESULTADO = {
  NORMAL:   'normal',    // placar normal (ex: 2-0, 1-1)
  WO_A:     'wo_a',      // Time A vence por W.O. (Time B não apareceu)
  WO_B:     'wo_b',      // Time B vence por W.O. (Time A não apareceu)
  DUPLO_WO: 'duplo_wo',  // nenhum time apareceu
  EMPATE:   'empate',    // série 1-1, pendente de desempate
}

export const TIPO_CONFRONTO = {
  REGULAR:   'regular',
  DESEMPATE: 'desempate',   // MD3 regular, não conta pra tabela

  // Chave de Vencedores (Upper Bracket)
  CLASSIFICATORIO: 'classificatorio', // fase anterior às quartas
  QUARTAS:   'quartas',
  SEMI:      'semifinal',
  FINAL_UP:  'final_up',    // Vencedor vai direto pra Grande Final

  // Chave de Perdedores (Lower Bracket)
  QUARTAS_LO:'quartas_lo',
  SEMI_LO:   'semifinal_lo',
  FINAL_LO:  'final_lo',    // Vencedor vai pra Grande Final

  // Grande Final (dupla eliminação — pode ter revanche)
  GRANDE_FINAL: 'grande_final',
}

// Classificatório é exibido separadamente (não entra no algoritmo de bracket)
// O bracket principal começa sempre das quartas (rounds decrescentes)
export const BRACKET_UPPER = ['quartas', 'semifinal', 'final_up']
export const BRACKET_LOWER = ['quartas_lo', 'semifinal_lo', 'final_lo']
export const BRACKET_LABELS = {
  classificatorio: 'Classificatório',
  quartas:         'Quartas de Final',
  semifinal:       'Semifinal',
  final_up:        'Final — Chave A',
  quartas_lo:      'Quartas',
  semifinal_lo:    'Semifinal',
  final_lo:        'Final — Chave B',
  grande_final:    'Grande Final',
}

export const FORMATO_SERIE = {
  MD2: 'MD2', MD3: 'MD3', MD5: 'MD5', MD7: 'MD7',
}

// ── Pontuação padrão (sobrescrita pelo config do Firebase) ───────────────────

export const PONTUACAO_PADRAO = {
  vitoria:    3,
  empate:     1,
  derrota:    0,
  wo_vitoria: 3,
  wo_derrota: 0,
  duplo_wo:   0,
  // Desempate MD3 tem pontuação reduzida — vencedor ganha apenas o ponto que faltava
  desempate_vitoria: 1,
  desempate_derrota: 0,
}

// ── Lógica de slots ───────────────────────────────────────────────────────────

/**
 * Retorna slots em comum entre dois times na ordem de preferência do campeonato.
 */
export function encontrarSlotsEmComum(slotsA = [], slotsB = []) {
  const setB = new Set(slotsB)
  return SLOTS.filter(s => slotsA.includes(s) && setB.has(s))
}

/**
 * True se dois slots são do mesmo dia.
 */
export function mesmodia(slotA, slotB) {
  return !!slotA && !!slotB && SLOT_DIA[slotA] === SLOT_DIA[slotB]
}

/**
 * True se dois slots são imediatamente consecutivos no mesmo dia.
 * Ex: terca-20h e terca-21h → true
 *     terca-20h e terca-22h → false (há intervalo)
 */
export function slotsConsecutivos(slotA, slotB) {
  if (!mesmodia(slotA, slotB)) return false
  const idxA = SLOTS.indexOf(slotA)
  const idxB = SLOTS.indexOf(slotB)
  return idxA !== -1 && idxB !== -1 && Math.abs(idxA - idxB) === 1
}

/**
 * Retorna os slots já confirmados de um time em uma lista de confrontos.
 */
export function slotsConfirmadosDoTime(teamId, confrontos = []) {
  return confrontos
    .filter(c =>
      (c.timeA === teamId || c.timeB === teamId) &&
      c.slot &&
      c.status === STATUS_CONFRONTO.CONFIRMADO
    )
    .map(c => c.slot)
}

/**
 * Verifica se um slot candidato geraria jogos consecutivos para um time.
 * NÃO bloqueia — apenas informa para o capitão decidir.
 * Retorna true se há risco de back-to-back.
 */
export function avisaBackToBack(teamId, slotCandidato, confrontos = []) {
  const jaConfirmados = slotsConfirmadosDoTime(teamId, confrontos)
  return jaConfirmados.some(s => slotsConsecutivos(s, slotCandidato))
}

/**
 * Dado disponibilidade de dois times e os slots já ocupados da rodada,
 * sugere o melhor slot (primeiro na ordem de preferência que esteja livre).
 * Retorna o slot sugerido ou null se não há sobreposição viável.
 */
export function sugerirSlot(slotsA = [], slotsB = [], slotsOcupados = {}) {
  const emComum = encontrarSlotsEmComum(slotsA, slotsB)
  return emComum.find(s => !slotsOcupados[s]) ?? null
}

/**
 * True se ambos marcaram disponibilidade mas não há nenhum slot em comum.
 * Indica necessidade de intervenção do admin.
 */
export function detectarSemOverlap(slotsA = [], slotsB = []) {
  if (!slotsA.length || !slotsB.length) return false // um ainda não marcou
  return encontrarSlotsEmComum(slotsA, slotsB).length === 0
}

/**
 * Dado que ambos os times acabaram de marcar disponibilidade,
 * retorna o novo status e slot sugerido do confronto.
 */
export function resolverDisponibilidade(slotsA = [], slotsB = [], slotsOcupados = {}) {
  if (!slotsA.length || !slotsB.length) {
    return { status: STATUS_CONFRONTO.AGENDANDO, slot: null, alertas: {} }
  }

  const slot = sugerirSlot(slotsA, slotsB, slotsOcupados)

  if (slot) {
    return {
      status: STATUS_CONFRONTO.CONFIRMADO,
      slot,
      alertas: {},
    }
  }

  return {
    status: STATUS_CONFRONTO.AGENDANDO,
    slot: null,
    alertas: { semOverlap: true },
  }
}

// ── Pontuação ─────────────────────────────────────────────────────────────────

/**
 * Calcula os pontos de cada time a partir de um resultado.
 * tipoConfrontoParam: se for DESEMPATE, usa pontuação reduzida (vitória = +1, não +3).
 * Retorna { timeA: number, timeB: number }
 */
export function calcularPontos(resultado, config = PONTUACAO_PADRAO, tipoConfronto = null) {
  if (!resultado) return { timeA: 0, timeB: 0 }

  const isDesempate = tipoConfronto === TIPO_CONFRONTO.DESEMPATE

  // W.O. e duplo W.O. têm a mesma regra independente do formato
  switch (resultado.tipo) {
    case TIPO_RESULTADO.WO_A:
      return { timeA: config.wo_vitoria, timeB: config.wo_derrota }
    case TIPO_RESULTADO.WO_B:
      return { timeA: config.wo_derrota, timeB: config.wo_vitoria }
    case TIPO_RESULTADO.DUPLO_WO:
      return { timeA: config.duplo_wo, timeB: config.duplo_wo }
    case TIPO_RESULTADO.EMPATE:
      // Empate só ocorre em MD2 regular — não pode acontecer num desempate MD3
      return { timeA: config.empate, timeB: config.empate }
    case TIPO_RESULTADO.NORMAL: {
      const { timeA: gA, timeB: gB } = resultado
      const [v, d] = isDesempate
        ? [config.desempate_vitoria, config.desempate_derrota]
        : [config.vitoria, config.derrota]
      if (gA > gB) return { timeA: v, timeB: d }
      if (gB > gA) return { timeA: d, timeB: v }
      return { timeA: config.empate, timeB: config.empate }
    }
    default:
      return { timeA: 0, timeB: 0 }
  }
}

// ── Classificação ─────────────────────────────────────────────────────────────

/**
 * Calcula a tabela de classificação a partir de confrontos realizados.
 * Ordena por: pontos → saldo → vitórias
 * Confrontos de tipo 'desempate' não entram na tabela.
 */
export function calcularClassificacao(teamIds = [], confrontos = [], config = PONTUACAO_PADRAO) {
  const tabela = {}

  for (const id of teamIds) {
    tabela[id] = { id, pontos: 0, vitorias: 0, derrotas: 0, empates: 0, saldo: 0, jogos: 0 }
  }

  // Confrontos que entram na tabela:
  // - REALIZADO: resultado final registrado
  // - EMPATE_PENDENTE: MD2 1-1 registrado, aguardando desempate — os 1pt de cada time JÁ contam
  const statusContabilizados = new Set([STATUS_CONFRONTO.REALIZADO, STATUS_CONFRONTO.EMPATE_PENDENTE])

  for (const c of confrontos) {
    if (!statusContabilizados.has(c.status) || !c.resultado) continue
    // Playoffs não entram na tabela da fase regular
    if (c.tipo === TIPO_CONFRONTO.QUARTAS ||
        c.tipo === TIPO_CONFRONTO.SEMI    ||
        c.tipo === TIPO_CONFRONTO.FINAL) continue

    const pts = calcularPontos(c.resultado, config, c.tipo)
    const gA  = c.resultado.timeA ?? 0
    const gB  = c.resultado.timeB ?? 0

    const atualizar = (id, pontos, gMarcados, gSofridos) => {
      if (!tabela[id]) return
      tabela[id].pontos += pontos
      tabela[id].jogos  += 1
      tabela[id].saldo  += gMarcados - gSofridos
      if (pontos === config.vitoria || pontos === config.wo_vitoria) tabela[id].vitorias++
      else if (pontos === config.derrota || pontos === config.wo_derrota) tabela[id].derrotas++
      else tabela[id].empates++
    }

    atualizar(c.timeA, pts.timeA, gA, gB)
    atualizar(c.timeB, pts.timeB, gB, gA)
  }

  return Object.values(tabela).sort((a, b) => {
    if (b.pontos   !== a.pontos)   return b.pontos   - a.pontos
    if (b.saldo    !== a.saldo)    return b.saldo    - a.saldo
    return b.vitorias - a.vitorias
  })
}

// ── Alertas para o admin ──────────────────────────────────────────────────────

/**
 * Filtra os confrontos que têm alguma pendência que o admin precisa resolver.
 */
export function confrontosComAlertas(confrontos = []) {
  return confrontos.filter(c =>
    c.status === STATUS_CONFRONTO.WO_PENDENTE     ||
    c.status === STATUS_CONFRONTO.EMPATE_PENDENTE ||
    c.alertas?.semOverlap                         ||
    c.alertas?.prazoAusente?.timeA                ||
    c.alertas?.prazoAusente?.timeB
  )
}

// ── Prioridade de transmissão ─────────────────────────────────────────────────
// Pesos soldados no código — alterar aqui se necessário

const PESO_TOPO_TABELA      = 3 // pelo menos um time no top 3
const PESO_DECISIVO         = 2 // diferença de pontos ≤ 2 (confronto decide classificação)
const PESO_ULTIMA_RODADA    = 1 // última rodada da fase regular

/**
 * Calcula score de prioridade de transmissão ao vivo.
 * Quanto maior o score, maior a prioridade.
 */
export function calcularPrioridadeTransmissao(confronto, tabela = [], rodadaAtual, totalRodadas) {
  let score = 0
  const posA = tabela.findIndex(t => t.id === confronto.timeA)
  const posB = tabela.findIndex(t => t.id === confronto.timeB)

  if (posA <= 2 || posB <= 2) score += PESO_TOPO_TABELA

  const ptA = tabela[posA]?.pontos ?? 0
  const ptB = tabela[posB]?.pontos ?? 0
  if (Math.abs(ptA - ptB) <= 2) score += PESO_DECISIVO

  if (rodadaAtual > 0 && rodadaAtual === totalRodadas) score += PESO_ULTIMA_RODADA

  return score
}

// ── Helpers de display ────────────────────────────────────────────────────────

/**
 * Formata o resultado para exibição. Ex: "2-0", "W.O.", "1-1 (empate)"
 */
export function formatarResultado(resultado) {
  if (!resultado) return '—'
  switch (resultado.tipo) {
    case TIPO_RESULTADO.WO_A:     return 'W.O. (Time A venceu)'
    case TIPO_RESULTADO.WO_B:     return 'W.O. (Time B venceu)'
    case TIPO_RESULTADO.DUPLO_WO: return '0×0 (duplo W.O.)'
    case TIPO_RESULTADO.EMPATE:   return `${resultado.timeA ?? 1}-${resultado.timeB ?? 1} (empate)`
    case TIPO_RESULTADO.NORMAL:   return `${resultado.timeA ?? 0}-${resultado.timeB ?? 0}`
    default: return '—'
  }
}

/**
 * Label de status para exibição no painel.
 */
export const STATUS_LABEL = {
  [STATUS_CONFRONTO.PENDENTE]:        'Pendente',
  [STATUS_CONFRONTO.AGENDANDO]:       'Agendando',
  [STATUS_CONFRONTO.CONFIRMADO]:      'Confirmado',
  [STATUS_CONFRONTO.REALIZADO]:       'Realizado',
  [STATUS_CONFRONTO.WO_PENDENTE]:     'W.O. Pendente',
  [STATUS_CONFRONTO.EMPATE_PENDENTE]: 'Empate — Desempate Pendente',
  [STATUS_CONFRONTO.ADIADO]:          'Adiado',
  [STATUS_CONFRONTO.CANCELADO]:       'Cancelado',
}

export const STATUS_COR = {
  [STATUS_CONFRONTO.PENDENTE]:        'var(--text3)',
  [STATUS_CONFRONTO.AGENDANDO]:       'var(--blue)',
  [STATUS_CONFRONTO.CONFIRMADO]:      'var(--green)',
  [STATUS_CONFRONTO.REALIZADO]:       'var(--text2)',
  [STATUS_CONFRONTO.WO_PENDENTE]:     'var(--red)',
  [STATUS_CONFRONTO.EMPATE_PENDENTE]: 'var(--gold)',
  [STATUS_CONFRONTO.ADIADO]:          'var(--purple)',
  [STATUS_CONFRONTO.CANCELADO]:       'var(--text3)',
}
