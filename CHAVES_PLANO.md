# Plano — Sistema de Chaves Manual (v2)

Branch: `feature/sistema-chaves`
Brainstorm com organizador: 2026-05-25/26 (4 batches)
Plano original: `feature/chaves-manuais` (12 mai) — arquivo histórico, não mergeado

---

## Mudanças em relação ao plano original (v1)

| Item | v1 (12 mai) | v2 (atual) |
|---|---|---|
| Pontuação | Admin define manualmente todo confronto | **Automática** (3/1/0 + WO=3); admin pode **override** quando precisa |
| `TIPO_CONFRONTO` | Pode ser descontinuado | **Mantido** — main evoluiu pra double elim com tipos granulares |
| Bracket | Admin desenha todos os slots | **Template fixo de 8 times** auto-popula seeds + pointers; admin override opcional |
| Slot do agendamento | Por time | **Global** (1 confronto por slot global, pra transmissão única) |
| Desempate | Não detalhado | MD3 entre empatados **sem head-to-head**, não conta pontos |

---

## Terminologia (alinhada com organizador)

```
Campeonato
  └─ Rodada      (período no calendário — "Semana 1", "Playoffs", etc.)
       └─ Confronto    (Time A vs Time B — uma série completa)
            └─ Partida     (jogo individual dentro do confronto)
                              MD2 = até 2 partidas
                              MD3 = até 3 partidas
                              MD5 = até 5 partidas
                              MD7 = até 7 partidas
```

---

## Decisões — Pontuação

**Default automático:**
| Resultado | Pontos |
|---|---|
| Vitória MD2 (2×0) | 3 pts vencedor / 0 pts perdedor |
| Empate MD2 (1×1, sem desempate) | 1 pt cada |
| Vitória por WO | 3 pts vencedor / 0 pts ausente |
| MD3 de desempate | Não conta — só ordena posição |
| Confronto de playoff (qualquer) | Não conta — bracket é independente da tabela |

**Override manual** (campo `pontosTabela` no confronto):
- Penalização caso a caso (4.1)
- Anulação por remarcação impossível (4.3)
- Erro de cálculo que admin precisa corrigir

**Modelo de dados:**
```js
confronto.pontosTabela = { timeA: number | null, timeB: number | null }
// null em ambos → usa cálculo automático
// preenchido → usa esses valores (admin override)
```

---

## Decisões — Estrutura da temporada

### Fase Regular: Round Robin Parcial

- 8 times, cada um joga contra **5 outros** (não todos contra todos)
- **20 confrontos** sorteados pelo admin
- Distribuídos em 2 semanas + semana 3 buffer (+ semana 4 raríssima)
- Formato: **MD2**

### Desempate da fase regular

Dispara quando 2+ times empataram em pontos **sem head-to-head** entre eles.
- Formato: **MD3**
- Não conta pontos — só decide posição na tabela
- Sistema **detecta e sugere**; admin cria e agenda

### Playoffs: Double Elimination

Todos os 8 classificam. Seeding vem da tabela final + override admin se necessário.

**Topologia (14 confrontos):**

```
UPPER (7 confrontos)
  Quartas:   M1 (1×8) · M2 (4×5) · M3 (2×7) · M4 (3×6)
  Semi:      M5 (vM1 × vM2) · M6 (vM3 × vM4)
  Final UB:  M7 (vM5 × vM6)

LOWER (6 confrontos)
  R1: L1 (dM1 × dM2) · L2 (dM3 × dM4)
  R2: L3 (vL1 × dM6) · L4 (vL2 × dM5)        ← crossover anti-rematch
  R3: L5 (vL3 × vL4)
  R4: L6 (vL5 × dM7)

GRANDE FINAL (1 confronto)
  GF: vM7 × vL6
      Formato: MD7
      Vantagem: Upper começa 1×0
      Primeiro a 4 vitórias vence
```

**Formato das partidas:**
- Round Robin: MD2
- Desempate fase regular: MD3
- Todo o playoff (upper, lower, finais): MD5
- Grande Final: MD7 com vantagem 1×0

---

## Decisões — Agendamento

**Slots fixos por semana:**
- Ter/Qua/Qui: 20h, 21h, 22h
- Sáb: 17h, 18h, 19h
- **12 slots por semana**

**Regras:**
- 2-3 confrontos por time por semana, sorteados pelo admin
- Capitães escolhem dia/horário dentre os slots disponíveis na sua rodada
- **Slot é GLOBAL** — só 1 confronto por dia+horário em todo o campeonato (transmissão única)
- Ainda em aberto: confirmar se o "global" vale apenas dentro da rodada ou através de rodadas diferentes *(provavelmente por rodada)*

**Implicação no código:**
- Função `slotsOcupadosNaRodada` em `src/pages/Agendamento.jsx:212-226` precisa ser modificada
- Hoje filtra por time (`oc.timeA === teamSel || oc.timeB === teamSel`)
- Mudar pra olhar TODOS os confrontos da mesma rodada (independente do time)

---

## Decisões — Operação

| Situação | Comportamento |
|---|---|
| **Capitães não fecham** | Sistema avisa admin (faltam X dias); admin decide mover pra semana buffer |
| **Adiamento múltiplo** | Semana 3 (12 slots) → semana 4 raríssima; admin decide cada caso |
| **Anular confronto** | Status `ANULADO`; fica visível na timeline; não conta pontos |
| **Reabrir resultado** | Admin pode voltar `REALIZADO` pra `CONFIRMADO`/`AGENDANDO` |
| **Editar resultado** | Sempre permitido pra corrigir typos (sem fluxo de auditoria) |
| **Time desiste** | Confrontos passados ficam. Pendentes admin remarca/anula caso a caso. **Não adiciona time substituto.** |
| **Adicionar time novo** | Não. Substitutos do leilão só fazem fill em times existentes |
| **Atraso até 30 min** | Time pode usar fill com substitutos ou jogar com bot pra evitar WO |
| **Após 30 min sem decisão** | WO automático |
| **Desconexão** | Capitães decidem (rematch com acordo, continuar com bot, ou desistir); admin registra |

---

## Modelo de dados

### Confronto (campos novos)

```
/campeonatos/{id}/confrontos/{confrontoId}
  // existentes (mantidos)
  timeA, timeB, tipo, formato, rodadaId, slot, status, resultado, observacoes, criadoEm, atualizadoEm

  // novos
  pontosTabela: { timeA: number | null, timeB: number | null }  // null = usa cálculo automático
  partidas: {
    '1': { mapaId, picks, bans, vencedor, status, bonus: false }
    '2': { ..., bonus: false }
    '3': { ..., bonus: true }   // partida extra informal (fora do formato)
  }

  // bracket linkage (preenchido pelo template ou pelo admin)
  bracketSlot: string | null     // 'm1', 'l3', 'gf', etc.
  winnerTo: string | null        // próximo slot pra onde vai o vencedor
  loserTo:  string | null        // próximo slot pra onde vai o perdedor (apenas se Upper)
```

### Bracket (template do campeonato)

```
/campeonatos/{id}/bracket
  template: '8_double_elim'  // identificador do template (futuro: outros tamanhos)
  seedingOverride: { '1': teamId | null, '2': teamId | null, ... }  // null = usa tabela
  // confrontos são lidos via /confrontos filtrados por bracketSlot
```

### Tabela override

```
/campeonatos/{id}/tabelaOverride/{teamId}
  posicaoManual: number | null   // se definido, força posição na tabela final
```

### Times — flag de status

```
/campeonatos/{id}/teams/{teamId}
  // existentes
  nome, cor, capitaoNome, jogadores[], ...

  // nova
  ativo: boolean   // default true; false = desistiu (UI mostra dimmed)
```

---

## Fases de implementação

### Fase 1 — Pontuação + tabela ✅ prioridade máxima

**Pra liberar o sistema de tabela com flexibilidade total antes do campeonato começar.**

- [ ] Adicionar `pontosTabela` ao confronto (estrutura no Firebase + UI no modal "Registrar Resultado")
- [ ] `calcularClassificacao` usa `pontosTabela` quando definido, senão usa `calcularPontos` automático
- [ ] **Bug fix**: filtro de tipos ignorados em `calcularClassificacao` desatualizado — adicionar `QUARTAS_LO`, `SEMI_LO`, `FINAL_LO`, `FINAL_UP`, `GRANDE_FINAL`
- [ ] Detecção de empate: head-to-head desempata automático; sem head-to-head sinaliza "POSIÇÃO PENDENTE — desempate necessário"
- [ ] Override manual de posição na tabela (`tabelaOverride`)
- [ ] UI na página `/tabela` (admin) pra ajustar pontos e ordenar manualmente
- [ ] Agendamento: slot global por rodada (modificar `slotsOcupadosNaRodada`)

### Fase 2 — Bracket double elim ✅ prioridade alta

**Pra liberar geração automática do playoff a partir da classificação final.**

- [ ] Template fixo `8_double_elim` em código (`src/utils/bracketTemplates.js`)
- [ ] Função "gerar bracket" — admin clica e sistema cria os 14 confrontos pré-populados com seeds da tabela
- [ ] `winnerTo`/`loserTo` em cada confronto pra propagação automática
- [ ] Quando admin registra resultado: sistema preenche o time vencedor (e o perdedor, se for upper) nos slots seguintes
- [ ] Override de seeding (admin pode trocar quem é seed 1, 2 etc. antes de gerar bracket)
- [ ] Página `/chave` lê os 14 confrontos + renderiza bracket visual (mantém o estilo atual do `Chave.jsx`)

### Fase 3 — Polimento e UX ✅ prioridade média

- [ ] Detecção visual: quando confronto tem `pontosTabela` definido, mostrar indicador (override admin)
- [ ] Painel admin com sugestões: "Empate detectado entre X e Y sem head-to-head — criar desempate?"
- [ ] Aviso de adiamento: "Faltam X dias pra fim da rodada e Confronto Y ainda não fechou — mover pra buffer?"
- [ ] Flag `ativo: false` em times desistentes, visual dimmed na tabela e bracket
- [ ] Confronto `status: ANULADO` com badge visual

### Fase 4 — Migração + cleanup (opcional, depois do campeonato)

- [ ] Re-importar Season 2 com `pontosTabela` automático
- [ ] Considerar deprecação do campo `tipo` se virar redundante com `bracketSlot`
- [ ] Documentar pra organizadores de futuras temporadas

---

## O que NÃO muda

- Sistema de rodadas e confrontos (estrutura base)
- Hero Draft integrado ao confronto
- Partidas individuais MD2/MD5/MD7
- Agendamento por slot (estrutura de disponibilidade)
- Modal "Novo Confronto", "Nova Rodada"

---

## Notas de implementação

- **Compatibilidade retroativa**: `pontosTabela: null` mantém comportamento atual — Season 2 não quebra
- **Trabalhar em `feature/sistema-chaves`**, branch dedicada, main intocado
- **Fase 1 é independente do bracket** — pode shipar isolada e validar com Season 2 logo
- **Audit trail não é necessário** — admin tem confiança total (4.4, 4.8)
- Diagrama oficial do bracket disponível (anexo do brainstorm 2026-05-26)
