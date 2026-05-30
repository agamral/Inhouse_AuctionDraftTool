/**
 * Template de bracket para double elimination com 8 times.
 *
 * Topologia (conforme diagrama oficial da Inhouse League):
 *
 *   UPPER (7 confrontos)
 *     Quartas:  M1(1×8) M2(4×5) M3(2×7) M4(3×6)
 *     Semi:     M5(vM1×vM2)  M6(vM3×vM4)
 *     Final UB: M7(vM5×vM6)
 *
 *   LOWER (6 confrontos)
 *     R1: L1(dM1×dM2)  L2(dM3×dM4)
 *     R2: L3(vL1×dM6)  L4(vL2×dM5)   ← crossover anti-rematch
 *     R3: L5(vL3×vL4)
 *     R4: L6(vL5×dM7)
 *
 *   GRANDE FINAL
 *     GF: vM7 × vL6
 *         Formato MD7, vencedor do Upper começa 1×0
 *
 * Cada entrada define:
 *   id:         identificador do slot no bracket
 *   tipo:       valor de TIPO_CONFRONTO pra salvar no confronto Firebase
 *   formato:    MD5 pra todos menos GF (MD7)
 *   seedA/seedB: posições na tabela que alimentam (só quartas UB — 1-indexed)
 *   winnerTo:   slot do próximo confronto pra onde vai o vencedor
 *   loserTo:    slot do próximo confronto pra onde vai o perdedor
 *               (null = eliminado)
 *   slotTime:   'A' ou 'B' — qual timeSlot do próximo confronto recebe
 *               winnerTo/loserTo ('A' = timeA, 'B' = timeB)
 */

export const BRACKET_8_DOUBLE_ELIM = {
  // ── Upper Bracket — Quartas ──────────────────────────────────────────────
  m1: {
    id: 'm1', label: 'Quartas UB (1)', tipo: 'quartas',
    formato: 'MD5',
    seedA: 1, seedB: 8,
    winnerTo: 'm5', winnerSlot: 'A',
    loserTo:  'l1', loserSlot:  'A',
  },
  m2: {
    id: 'm2', label: 'Quartas UB (2)', tipo: 'quartas',
    formato: 'MD5',
    seedA: 4, seedB: 5,
    winnerTo: 'm5', winnerSlot: 'B',
    loserTo:  'l1', loserSlot:  'B',
  },
  m3: {
    id: 'm3', label: 'Quartas UB (3)', tipo: 'quartas',
    formato: 'MD5',
    seedA: 2, seedB: 7,
    winnerTo: 'm6', winnerSlot: 'A',
    loserTo:  'l2', loserSlot:  'A',
  },
  m4: {
    id: 'm4', label: 'Quartas UB (4)', tipo: 'quartas',
    formato: 'MD5',
    seedA: 3, seedB: 6,
    winnerTo: 'm6', winnerSlot: 'B',
    loserTo:  'l2', loserSlot:  'B',
  },

  // ── Upper Bracket — Semi ─────────────────────────────────────────────────
  m5: {
    id: 'm5', label: 'Semi UB (1)', tipo: 'semifinal',
    formato: 'MD5',
    winnerTo: 'm7', winnerSlot: 'A',
    loserTo:  'l4', loserSlot:  'B',   // perdedor da semi vai pra L4 como B (anti-rematch)
  },
  m6: {
    id: 'm6', label: 'Semi UB (2)', tipo: 'semifinal',
    formato: 'MD5',
    winnerTo: 'm7', winnerSlot: 'B',
    loserTo:  'l3', loserSlot:  'B',   // perdedor da semi vai pra L3 como B (anti-rematch)
  },

  // ── Upper Bracket — Final ────────────────────────────────────────────────
  m7: {
    id: 'm7', label: 'Final UB', tipo: 'final_up',
    formato: 'MD5',
    winnerTo: 'gf', winnerSlot: 'A',
    loserTo:  'l6', loserSlot:  'B',
  },

  // ── Lower Bracket — R1 ───────────────────────────────────────────────────
  l1: {
    id: 'l1', label: 'Lower R1 (1)', tipo: 'quartas_lo',
    formato: 'MD5',
    winnerTo: 'l3', winnerSlot: 'A',
    loserTo:  null,                     // eliminado
  },
  l2: {
    id: 'l2', label: 'Lower R1 (2)', tipo: 'quartas_lo',
    formato: 'MD5',
    winnerTo: 'l4', winnerSlot: 'A',
    loserTo:  null,
  },

  // ── Lower Bracket — R2 (crossover anti-rematch) ──────────────────────────
  l3: {
    id: 'l3', label: 'Lower R2 (1)', tipo: 'semifinal_lo',
    formato: 'MD5',
    winnerTo: 'l5', winnerSlot: 'A',
    loserTo:  null,
  },
  l4: {
    id: 'l4', label: 'Lower R2 (2)', tipo: 'semifinal_lo',
    formato: 'MD5',
    winnerTo: 'l5', winnerSlot: 'B',
    loserTo:  null,
  },

  // ── Lower Bracket — R3 ───────────────────────────────────────────────────
  l5: {
    id: 'l5', label: 'Lower R3', tipo: 'round3_lo',
    formato: 'MD5',
    winnerTo: 'l6', winnerSlot: 'A',
    loserTo:  null,
  },

  // ── Lower Bracket — Final ─────────────────────────────────────────────────
  l6: {
    id: 'l6', label: 'Final Lower', tipo: 'final_lo',
    formato: 'MD5',
    winnerTo: 'gf', winnerSlot: 'B',
    loserTo:  null,
  },

  // ── Grande Final ──────────────────────────────────────────────────────────
  gf: {
    id: 'gf', label: 'Grande Final', tipo: 'grande_final',
    formato: 'MD7',
    winnerTo: null,
    loserTo:  null,
    // Vencedor do Upper (timeA = vM7) começa 1×0
    // Primeiro a 4 vitórias vence
    vantagem: 'A_1_0',
  },
}

// Mapa de seed position → nome descritivo (pra placeholders antes do bracket ser gerado)
export const SEED_LABEL = {
  1: '1º lugar', 2: '2º lugar', 3: '3º lugar', 4: '4º lugar',
  5: '5º lugar', 6: '6º lugar', 7: '7º lugar', 8: '8º lugar',
}

// Ordem linear dos slots pra renderização do bracket
export const BRACKET_COLS = {
  upper: [
    ['m1', 'm2', 'm3', 'm4'],  // col 0 — quartas
    ['m5', 'm6'],               // col 1 — semi
    ['m7'],                     // col 2 — final UB
  ],
  lower: [
    ['l1', 'l2'],               // col 0 — R1
    ['l3', 'l4'],               // col 1 — R2
    ['l5'],                     // col 2 — R3
    ['l6'],                     // col 3 — final LB
  ],
  final: ['gf'],
}
