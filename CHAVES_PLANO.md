# Plano — Sistema de Chaves Manual

Branch: `feature/chaves-manuais`  
Discussão: sessão de 2026-05-12  
Status: **em desenvolvimento**

---

## Contexto

O sistema atual de Chaves e Tabela tem lógica automática demais para as necessidades reais da organização. Existem muitas variáveis humanas (desempates subjetivos, partidas extras informais, pontuações atípicas) que quebram qualquer automação. A decisão foi migrar para um sistema **manual com controle total do admin**, mantendo apenas somas automáticas onde faz sentido.

---

## Decisões de design

### 1. Pontuação por confronto — manual

**Score** (ex: 2×1) = quantidade de partidas ganhas em um confronto. Histórico puro.  
**Pontos de tabela** = definidos manualmente pelo admin ao encerrar o confronto.  
- Não tem relação automática com o score.  
- Admin decide: "esse confronto vale 3pts para o vencedor e 0 para o perdedor", ou qualquer outra combinação.  
- Visual: placar em destaque + indicador `+Xpts` discreto ao lado.

### 2. Bracket (Chave) — pré-configurado e manual

- Admin cria a **estrutura completa com antecedência** (todos os slots e conexões).
- Slots começam com `?` até serem preenchidos.
- Cada slot **é** um confronto da rodada (Option A — mesma entidade, sem duplicação).
- Admin preenche os slots conforme os resultados chegam.
- **Avanço manual**: admin decide quem avança, sem automação.

### 3. Partida bônus

- Qualquer confronto pode ter uma partida extra adicionada pelo admin.
- Marcada como `bonus: true` no histórico — é evidência, não decisão.
- Não altera a lógica de pontos (admin ainda decide os pontos ao fechar o confronto).
- Resolve casos de desempate informal sem precisar criar um confronto formal.

### 4. Tabela — soma automática, ordem manual

- Sistema soma os pontos inseridos pelo admin em cada confronto → total por time.
- A **ordem na tabela** pode ser sobrescrita manualmente pelo admin.
- Resolve casos onde dois times têm o mesmo total mas a organização decide posições por critérios externos.

### 5. Interface unificada "Chaves & Confrontos"

- Nova aba no painel admin que junta o gerenciamento de rodadas/confrontos com a visualização do bracket.
- Admin cria rodada → aparece como fase na sidebar E no bracket.
- Admin cria confronto → aparece na lista E como bloco no bracket.
- Mesmos modais atuais (Nova Rodada, Novo Confronto), praticamente sem mudança de campos.
- Campo **Tipo** do confronto pode ser descontinuado — a posição no bracket define o tipo visualmente.

---

## O que muda em relação ao sistema atual

| Área | Antes | Depois |
|---|---|---|
| Pontos por confronto | Calculado automaticamente por `calcularPontos()` | Admin define manualmente ao fechar o confronto |
| Tabela — ordem | Calculada por pontos + saldo + vitórias | Soma automática + override manual de posição |
| Chave — estrutura | Gerada automaticamente | Desenhada pelo admin com antecedência |
| Chave — avanço | Automático por resultado | Admin confirma manualmente |
| Rodadas & Confrontos | Aba separada do Campeonato | Integrada à aba Chaves |
| Confronto x Bracket | Entidades separadas | Mesma entidade (slot do bracket = confronto) |

---

## Estrutura de dados nova

### Confronto (expandido)
```
/campeonatos/{id}/confrontos/{confrontoId}
  ...campos existentes...
  pontosTabela: {
    timeA: number | null   // definido pelo admin ao encerrar
    timeB: number | null
  }
  partidas: {
    '1': { status, vencedor, picks, bans, bonus: false }
    '2': { ..., bonus: false }
    '3': { ..., bonus: true }   // partida extra informal
  }
```

### Bracket slot
```
/campeonatos/{id}/chave/{chaveId}
  nome: string              // "Chave Principal", "Lower Bracket"
  slots: {
    '{slotId}': {
      confrontoId: string | null   // vinculado a um confronto da rodada
      proximoSlot: string | null   // vencedor vai para qual slot
      posicao: { x, y }            // posição visual no builder (futuro)
    }
  }
```

### Time na tabela (override de posição)
```
/campeonatos/{id}/tabelaOverride/{teamId}
  posicaoManual: number | null   // se definido, usa em vez do calculado
```

---

## Fases de implementação

### Fase 1 — Estrutura de dados + pontuação manual ✅ prioridade alta

- [ ] Adicionar `pontosTabela` ao confronto no Firebase
- [ ] Modificar o modal de "Registrar Resultado" para aceitar pontos manuais
- [ ] Modificar `calcularClassificacao` para somar `pontosTabela` em vez de calcular automaticamente
- [ ] Adicionar `posicaoManual` ao time e respeitar na ordenação da tabela
- [ ] UI na Tabela para o admin reordenar times (drag ou input de posição)
- [ ] Adicionar `bonus: true/false` à partida no ShowmatchAdmin

### Fase 2 — Bracket builder ✅ prioridade média

- [ ] Criar estrutura `/chave` no Firebase
- [ ] Componente `BracketBuilder` — admin cria slots e conexões
- [ ] Vincular confronto a slot ao criar (automático pela rodada)
- [ ] Visualização pública da chave a partir da nova estrutura
- [ ] Slot com `?` quando confronto não tem resultado ainda

### Fase 3 — Interface unificada ✅ prioridade média

- [ ] Nova aba "Chaves & Confrontos" no painel admin
- [ ] Sidebar com rodadas/confrontos ao lado do bracket
- [ ] Toggle Admin/Público dentro da mesma tela
- [ ] Migrar modais de Nova Rodada e Novo Confronto para o novo contexto

### Fase 4 — Polimento e migração ✅ prioridade baixa

- [ ] Descontinuar campo `tipo` do confronto (opcional — pode manter para compatibilidade)
- [ ] Migrar dados existentes da Season 2 se necessário
- [ ] Atualizar Chave.jsx e Tabela.jsx públicos para nova estrutura
- [ ] Remover código de `calcularPontos` automático do bot também

---

## O que NÃO muda

- Sistema de rodadas e confrontos (estrutura de dados base)
- Hero Draft integrado ao confronto
- Partidas individuais dentro do confronto (MD2/MD5)
- Agendamento e disponibilidade
- Sistema de notificações do bot

---

## Notas de implementação

- Manter compatibilidade retroativa: se `pontosTabela` for null, sistema usa o cálculo antigo (não quebra a Season 2 atual)
- Começar pela Fase 1 (pontuação manual) pois é independente do bracket builder
- O mockup HTML está em `.misc/mockup-chaves-admin.html` para referência visual
