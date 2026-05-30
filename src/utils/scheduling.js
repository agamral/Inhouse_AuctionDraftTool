/**
 * scheduling.js — Lógica pura do sistema de agendamento
 * Copa Inhouse — sem dependências de Firebase ou React
 */

// ── Slots disponíveis ────────────────────────────────────────────────────────
// A ORDEM importa: define preferência ao sugerir slot automaticamente

// Slots da fase regular (sem 19h nos dias de semana)
export const SLOTS = [
  'terca-20h', 'terca-21h', 'terca-22h',
  'quarta-20h', 'quarta-21h', 'quarta-22h',
  'quinta-20h', 'quinta-21h', 'quinta-22h',
  'sabado-17h', 'sabado-18h', 'sabado-19h',
]

// Slots do playoff — adiciona 19h nos dias de semana
// Decisão da organização: mais um horário disponível pra acomodar a chave
export const SLOTS_PLAYOFF = [
  'terca-19h', 'terca-20h', 'terca-21h', 'terca-22h',
  'quarta-19h', 'quarta-20h', 'quarta-21h', 'quarta-22h',
  'quinta-19h', 'quinta-20h', 'quinta-21h', 'quinta-22h',
  'sabado-17h', 'sabado-18h', 'sabado-19h',
]

export const SLOT_LABEL = {
  'terca-19h':  'Terça 19h',  'terca-20h':  'Terça 20h',  'terca-21h':  'Terça 21h',  'terca-22h':  'Terça 22h',
  'quarta-19h': 'Quarta 19h', 'quarta-20h': 'Quarta 20h', 'quarta-21h': 'Quarta 21h', 'quarta-22h': 'Quarta 22h',
  'quinta-19h': 'Quinta 19h', 'quinta-20h': 'Quinta 20h', 'quinta-21h': 'Quinta 21h', 'quinta-22h': 'Quinta 22h',
  'sabado-17h': 'Sábado 17h', 'sabado-18h': 'Sábado 18h', 'sabado-19h': 'Sábado 19h',
}

export const SLOT_DIA = {
  'terca-19h': 'terca',  'terca-20h': 'terca',  'terca-21h': 'terca',  'terca-22h': 'terca',
  'quarta-19h': 'quarta','quarta-20h': 'quarta', 'quarta-21h': 'quarta','quarta-22h': 'quarta',
  'quinta-19h': 'quinta','quinta-20h': 'quinta', 'quinta-21h': 'quinta','quinta-22h': 'quinta',
  'sabado-17h': 'sabado','sabado-18h': 'sabado', 'sabado-19h': 'sabado',
}

export const DIA_LABEL = {
  terca: 'Terça-feira', quarta: 'Quarta-feira',
  quinta: 'Quinta-feira', sabado: 'Sábado',
}

// Mapa de adjacência — slots que ficam bloqueados quando um horário é confirmado.
// Usado na fase de playoff pra evitar transmissões consecutivas sem intervalo.
// Regra: se jogo marcado em X, bloqueia X-1h e X+1h no mesmo dia.
export const ADJACENT_SLOTS = {
  'terca-19h':  ['terca-20h'],
  'terca-20h':  ['terca-19h', 'terca-21h'],
  'terca-21h':  ['terca-20h', 'terca-22h'],
  'terca-22h':  ['terca-21h'],
  'quarta-19h': ['quarta-20h'],
  'quarta-20h': ['quarta-19h', 'quarta-21h'],
  'quarta-21h': ['quarta-20h', 'quarta-22h'],
  'quarta-22h': ['quarta-21h'],
  'quinta-19h': ['quinta-20h'],
  'quinta-20h': ['quinta-19h', 'quinta-21h'],
  'quinta-21h': ['quinta-20h', 'quinta-22h'],
  'quinta-22h': ['quinta-21h'],
  'sabado-17h': ['sabado-18h'],
  'sabado-18h': ['sabado-17h', 'sabado-19h'],
  'sabado-19h': ['sabado-18h'],
}

// ── Fuso horário ─────────────────────────────────────────────────────────────
// Todos os slots usam BRT (UTC-3) como referência do torneio

export const FUSO_PADRAO = 'America/Sao_Paulo'

export const FUSOS = [
  { id: 'America/Sao_Paulo',              label: 'Brasil (BRT, UTC-3)',           abrev: 'BRT' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Argentina (ART, UTC-3)',        abrev: 'ART' },
  { id: 'America/Santiago',               label: 'Chile (CLT, UTC-4 / -3 verão)', abrev: 'CLT' },
  { id: 'America/Lima',                   label: 'Peru (PET, UTC-5)',             abrev: 'PET' },
  { id: 'America/Bogota',                 label: 'Colômbia (COT, UTC-5)',         abrev: 'COT' },
  { id: 'America/Caracas',               label: 'Venezuela (VET, UTC-4)',         abrev: 'VET' },
  { id: 'America/Mexico_City',            label: 'México Centro (CST, UTC-6)',    abrev: 'CST' },
  { id: 'America/New_York',               label: 'EUA Leste (EST, UTC-5)',        abrev: 'EST' },
  { id: 'Europe/Lisbon',                  label: 'Portugal (WET, UTC+0)',         abrev: 'WET' },
  { id: 'Europe/Madrid',                  label: 'Espanha (CET, UTC+1)',          abrev: 'CET' },
]

// Hora BRT de cada slot (referência fixa)
const SLOT_BRT_HORA = {
  'terca-20h': 20, 'terca-21h': 21, 'terca-22h': 22,
  'quarta-20h': 20, 'quarta-21h': 21, 'quarta-22h': 22,
  'quinta-20h': 20, 'quinta-21h': 21, 'quinta-22h': 22,
  'sabado-17h': 17, 'sabado-18h': 18, 'sabado-19h': 19,
}

// Diferença em horas entre BRT (UTC-3) e um fuso IANA, considerando DST atual
function offsetVsBRT(fusoId) {
  if (!fusoId || fusoId === FUSO_PADRAO) return 0
  try {
    const agora   = new Date()
    const toBRT   = new Date(agora.toLocaleString('en-US', { timeZone: FUSO_PADRAO }))
    const toDest  = new Date(agora.toLocaleString('en-US', { timeZone: fusoId }))
    return Math.round((toDest - toBRT) / (1000 * 60 * 60))
  } catch { return 0 }
}

/**
 * Retorna a hora local de um slot para um dado fuso.
 * Ex: slotHoraLocal('terca-20h', 'America/Santiago') → 19
 */
export function slotHoraLocal(slot, fusoId) {
  const horaBRT = SLOT_BRT_HORA[slot] ?? 0
  const diff    = offsetVsBRT(fusoId)
  return ((horaBRT + diff) % 24 + 24) % 24
}

/**
 * Retorna label completo de um slot no fuso do time.
 * Se igual ao BRT retorna o label padrão.
 * Ex: "Terça 19h (CLT) · 20h BRT"
 */
export function slotLabelFuso(slot, fusoId) {
  const diff = offsetVsBRT(fusoId)
  if (diff === 0) return SLOT_LABEL[slot]

  const fusoInfo  = FUSOS.find(f => f.id === fusoId)
  const abrev     = fusoInfo?.abrev ?? fusoId
  const horaLocal = slotHoraLocal(slot, fusoId)
  const horaBRT   = SLOT_BRT_HORA[slot]
  const dia       = DIA_LABEL[SLOT_DIA[slot]]?.split('-')[0] ?? ''

  return `${dia} ${horaLocal}h (${abrev}) · ${horaBRT}h BRT`
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
  // 4 rodadas no formato 8-times double elim:
  //   R1 (quartas_lo) → R2 (semifinal_lo) → R3 (round3_lo) → Final (final_lo)
  QUARTAS_LO: 'quartas_lo',
  SEMI_LO:    'semifinal_lo',
  ROUND3_LO:  'round3_lo',  // R3 — L5 (vL3 × vL4)
  FINAL_LO:   'final_lo',   // Final Lower — L6 (vL5 × dM7) → vencedor pra GF

  // Grande Final (dupla eliminação — pode ter revanche)
  GRANDE_FINAL: 'grande_final',
}

// Classificatório é exibido separadamente (não entra no algoritmo de bracket)
// O bracket principal começa sempre das quartas (rounds decrescentes)
export const BRACKET_UPPER = ['quartas', 'semifinal', 'final_up']
export const BRACKET_LOWER = ['quartas_lo', 'semifinal_lo', 'round3_lo', 'final_lo']
export const BRACKET_LABELS = {
  classificatorio: 'Classificatório',
  quartas:         'Quartas de Final',
  semifinal:       'Semifinal',
  final_up:        'Final — Chave A',
  quartas_lo:      'Quartas',
  semifinal_lo:    'Semifinal',
  round3_lo:       'Rodada 3',
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
 *
 * Só conta confrontos de tipo REGULAR. Tudo mais (DESEMPATE, todos os tipos
 * de playoff — classificatorio, quartas, semi, final_up, _lo variants,
 * grande_final) é excluído. Confronto sem `tipo` é tratado como REGULAR
 * pra compatibilidade com dados legados.
 *
 * Quando `confronto.pontosTabela` está preenchido (override do admin),
 * usa esses valores em vez do cálculo automático. Útil pra penalizações,
 * anulações ou correções pontuais.
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
    // Whitelist: só REGULAR conta. Default pra REGULAR se tipo ausente (legado).
    const tipo = c.tipo ?? TIPO_CONFRONTO.REGULAR
    if (tipo !== TIPO_CONFRONTO.REGULAR) continue

    // Admin pode sobrescrever os pontos no confronto (penalização, anulação,
    // correção). pontosTabela = null/ausente → usa cálculo automático.
    const pts = (c.pontosTabela && typeof c.pontosTabela.timeA === 'number')
      ? { timeA: c.pontosTabela.timeA, timeB: c.pontosTabela.timeB ?? 0 }
      : calcularPontos(c.resultado, config, c.tipo)
    const gA  = c.resultado.timeA ?? 0
    const gB  = c.resultado.timeB ?? 0

    // Deriva V/D/E do tipo do resultado (não dos pontos) pra continuar
    // funcionando mesmo com override manual de pontos.
    const statusPorTime = (() => {
      switch (c.resultado.tipo) {
        case TIPO_RESULTADO.WO_A:     return { timeA: 'V', timeB: 'D' }
        case TIPO_RESULTADO.WO_B:     return { timeA: 'D', timeB: 'V' }
        case TIPO_RESULTADO.DUPLO_WO: return { timeA: 'D', timeB: 'D' }
        case TIPO_RESULTADO.EMPATE:   return { timeA: 'E', timeB: 'E' }
        case TIPO_RESULTADO.NORMAL:
          if (gA > gB) return { timeA: 'V', timeB: 'D' }
          if (gB > gA) return { timeA: 'D', timeB: 'V' }
          return { timeA: 'E', timeB: 'E' }
        default: return { timeA: null, timeB: null }
      }
    })()

    const atualizar = (id, pontos, gMarcados, gSofridos, status) => {
      if (!tabela[id]) return
      tabela[id].pontos += pontos
      tabela[id].jogos  += 1
      tabela[id].saldo  += gMarcados - gSofridos
      if (status === 'V')      tabela[id].vitorias++
      else if (status === 'D') tabela[id].derrotas++
      else if (status === 'E') tabela[id].empates++
    }

    atualizar(c.timeA, pts.timeA, gA, gB, statusPorTime.timeA)
    atualizar(c.timeB, pts.timeB, gB, gA, statusPorTime.timeB)
  }

  // Head-to-head: compara 2 times pelo confronto direto entre eles.
  // Retorna -1 se A acima, 1 se B acima, 0 se não resolve (sem h2h, 1-1, etc).
  //
  // Ordem de prioridade:
  //   1. DESEMPATE (MD3) — se existe e resolveu, manda. É a decisão oficial
  //      pra quebrar empate quando regular não decidiu.
  //   2. REGULAR — confronto da fase normal. Se resolveu, usa.
  function compararHeadToHead(idA, idB) {
    const buscarPor = (tipoAlvo) => confrontos.find(c => {
      const tipo = c.tipo ?? TIPO_CONFRONTO.REGULAR
      if (tipo !== tipoAlvo) return false
      if (!statusContabilizados.has(c.status) || !c.resultado) return false
      return (c.timeA === idA && c.timeB === idB) || (c.timeA === idB && c.timeB === idA)
    })

    const resolver = (confronto) => {
      if (!confronto) return 0
      const aEhTimeA = confronto.timeA === idA
      switch (confronto.resultado.tipo) {
        case TIPO_RESULTADO.WO_A:     return aEhTimeA ? -1 : 1
        case TIPO_RESULTADO.WO_B:     return aEhTimeA ? 1 : -1
        case TIPO_RESULTADO.NORMAL: {
          const gMeu  = aEhTimeA ? confronto.resultado.timeA : confronto.resultado.timeB
          const gOut  = aEhTimeA ? confronto.resultado.timeB : confronto.resultado.timeA
          if (gMeu > gOut) return -1
          if (gOut > gMeu) return 1
          return 0
        }
        default: return 0  // duplo_wo ou empate não decide
      }
    }

    // 1. Desempate explícito (MD3) tem prioridade — foi criado justamente
    //    pra resolver esse empate.
    const desempate = resolver(buscarPor(TIPO_CONFRONTO.DESEMPATE))
    if (desempate !== 0) return desempate

    // 2. Confronto regular como fallback.
    return resolver(buscarPor(TIPO_CONFRONTO.REGULAR))
  }

  const sortedTabela = Object.values(tabela).sort((a, b) => {
    if (b.pontos   !== a.pontos)   return b.pontos   - a.pontos
    const h2h = compararHeadToHead(a.id, b.id)
    if (h2h !== 0) return h2h
    if (b.saldo    !== a.saldo)    return b.saldo    - a.saldo
    return b.vitorias - a.vitorias
  })

  // Detecção de "posicaoPendente": pares consecutivos com mesma pontuação
  // onde o head-to-head não resolveu — admin precisa marcar MD3 de desempate.
  // Times sem jogos (jogos=0) são ignorados: ainda não competiram, então não
  // faz sentido falar em desempate com eles.
  for (let i = 0; i < sortedTabela.length - 1; i++) {
    const a = sortedTabela[i]
    const b = sortedTabela[i + 1]
    if (a.jogos === 0 || b.jogos === 0) continue
    if (a.pontos === b.pontos && compararHeadToHead(a.id, b.id) === 0) {
      a.posicaoPendente = true
      b.posicaoPendente = true
    }
  }

  return sortedTabela
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
