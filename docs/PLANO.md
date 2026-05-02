# Copa Inhouse Platform — Plano de Arquitetura e Implementação

> **Branch de desenvolvimento:** `refactor/multi-campeonato`
> **Branch de produção:** `main`
> **Última atualização:** 2026-04-28

---

## Contexto

Esta plataforma é uma ferramenta para organizar campeonatos comunitários de Heroes of the Storm. Não é um produto SaaS genérico — foi construída especificamente para as regras e fluxo da Inhouse League, incluindo um sistema de leilão com roubo e reembolso, hero draft com timer e overlay OBS, e bracket de dupla eliminação.

O objetivo desta documentação é registrar:
1. O estado atual completo do sistema
2. A nova arquitetura multi-campeonato proposta
3. As decisões técnicas e o plano de implementação

---

## Parte 1 — Estado Atual

### Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite |
| Roteamento | React Router v6 |
| Estilo | CSS puro com variáveis (sem Tailwind) |
| i18n | i18next (PT, EN, ES) |
| Banco de dados | Firebase Realtime Database |
| Autenticação | Firebase Auth (Google OAuth + Email/Password) |
| Bot Discord | Python 3.11 + discord.py |
| Deploy frontend | Vercel |
| Deploy bot | Railway |
| Inscrições | Google Sheets via Apps Script Web App |

---

### Rotas e telas

| Rota | Acesso | Descrição |
|---|---|---|
| `/` | Público | Home com cards dinâmicos (inscrição, streams, regras) |
| `/inscricao` | Público (c/ Google login) | Formulário de inscrição |
| `/inscritos` | Capitão / Admin | Lista de jogadores inscritos |
| `/meu-perfil` | Jogador logado | Perfil básico + logout |
| `/regras` | Público | Regras e formato do torneio |
| `/draft` | Capitão / Admin | Tela do leilão de times |
| `/espectador` | Público (quando ativo) | Espectador do leilão ao vivo |
| `/elenco` | Público (quando ativo) | Times e rosters formados |
| `/tabela` | Público (quando ativo) | Classificação com pontos e forma |
| `/chave` | Público (quando ativo) | Bracket completo (fase regular + playoffs) |
| `/agendamento` | Capitão / Admin / Público | Partidas confirmadas + disponibilidade |
| `/resultados` | Público (quando ativo) | Times formados pós-leilão com preços |
| `/login-capitao` | Público | Login do capitão (email+senha Firebase) |
| `/login` | Público | Login do admin (Google OAuth) |
| `/admin` | Admin / SuperAdmin | Painel de administração |
| `/hero-draft` | Capitão (via link) | Tela de pick/ban do Hero Draft |
| `/hero-draft/espectador` | Público (quando ativo) | Espectador do Hero Draft |
| `/hero-draft/overlay` | Interno (OBS) | Overlay para transmissão |
| `/historico` | _(a implementar)_ | Biblioteca de campeonatos passados |

---

### Perfis de usuário

#### Jogador comum (Google login)
- Inscrever-se no torneio via formulário
- Editar a própria inscrição
- Ver elenco, tabela, chave, agenda (quando módulos ativos)
- Ver regras do torneio
- Perfil básico (`/meu-perfil`) com logout

#### Capitão (email@copa.inhouse ou email real)
- Tudo que o jogador pode +
- Ver lista de inscritos com detalhes
- Participar do leilão (comprar e roubar jogadores)
- Marcar disponibilidade de partidas
- Acessar sessão de Hero Draft via link específico
- Receber alerta automático quando Hero Draft está ativo

#### Admin
- Tudo que o capitão pode +
- Painel admin com 6 abas:
  - **Geral**: toggles de módulos, modo privacidade, conteúdo do site
  - **Inscrições**: gestão de players, times e capitães do leilão
  - **Leilão**: controle em tempo real, regras, simulador
  - **Times**: criação de times, importação, acesso de capitão
  - **Campeonato**: rodadas, confrontos, resultados, hero draft
  - **Sistema**: gestão de admins (SuperAdmin)

#### SuperAdmin
- Tudo que o admin pode +
- Gerenciar lista de admins (adicionar/remover)
- Acesso ao simulador de leilão para debug

---

### Fluxo completo de uma temporada

#### Fase 1 — Configuração inicial
1. SuperAdmin ativa toggle "Inscrições abertas" no painel
2. Preenche conteúdo do site: nome da copa, descrição, próximo evento, texto pós-inscrição, prazo de disponibilidade, streams Twitch
3. Configura regras do leilão: moedas, min/max capitães, min/max players, roubo ativo

#### Fase 2 — Inscrições
4. Jogadores acessam o site, fazem login com Google
5. Preenchem formulário: nick Discord, battletag, país, idiomas, elo, função primária/secundária, titular/reserva, quer ser capitão, aceita regras
6. Dados salvos em `/players/{uid}` (Firebase) e espelhados na planilha Google Sheets
7. Admin gerencia inscritos: confirma, descarta, marca como premium, define capitães

#### Fase 3 — Formação dos times (leilão)
8. Admin fecha inscrições
9. Admin cria times na aba Inscrições: nome, emoji, cor, capitão vinculado, seed
10. Admin gera credenciais de acesso para cada capitão (`AdminCapitaoAcesso`)
   - Email sintético: `battletag@copa.inhouse` + senha temporária
   - Credenciais enviadas no Discord
11. Capitões fazem primeiro login → definem senha pessoal + email de contato opcional
12. Admin ativa toggle "Leilão ativo" e inicia o leilão
13. **Leilão de titulares** (rodadas):
    - Cada capitão recebe 15 moedas
    - Por ordem de seed, cada capitão compra 1 jogador por turno
    - Pode comprar da pool (preço base 0, sobe +1 a cada compra)
    - Pode roubar de outro time (custo = preço atual; dono anterior recebe reembolso + turno extra)
    - Encerra quando todos têm o mínimo de players
14. **Leilão de reservas** (opcional): capitães recebem 6 moedas (ou mantém o saldo se maior), compram até 2 reservas
15. Bot Discord anuncia compras, roubos, início e encerramento em tempo real
16. Espectadores acompanham em `/espectador`

#### Fase 4 — Pós-leilão
17. Admin importa times do leilão para `/teams` via painel
18. Times visíveis em `/elenco`
19. Janela de trocas: 48h para capitães trocarem jogadores entre si (titular×titular ou reserva×reserva)
20. Admin desativa "Leilão ativo", ativa "Campeonato ativo"

#### Fase 5 — Fase regular
21. Admin cria rodadas com semana de jogos
22. Admin cria confrontos por rodada (timeA vs timeB, formato MD2/MD3)
23. Capitões marcam disponibilidade em `/agendamento` (grid de slots: ter/qua/qui/sáb)
24. Quando ambos os times marcam um slot em comum → partida auto-confirmada
25. Se nenhum overlap → admin é sinalizado via alerta
26. Admin registra resultado de cada confronto (placar, W.O., empate)
27. Se MD2 termina 1-1 → desempate MD3 gerado automaticamente (+1pt ao vencedor)
28. Tabela e chave atualizam automaticamente
29. Bot Discord anuncia resultados, confirmações, empates e W.O.

#### Fase 6 — Hero Draft (por partida)
30. Admin cria sessão de Hero Draft para um confronto específico
31. Define: timeA, timeB, mapa, formato de draft
32. Gera links individuais para cada capitão (`/hero-draft?sessao=X&time=A|B`)
33. Capitões entram na tela, aguardam início
34. Admin ativa o draft → sequência de picks/bans começa
35. 30 segundos por turno (timer sincronizado via Firebase)
36. Se timer expirar → auto-pick aleatório
37. **Soft Madness**: heróis do time vencedor ficam banidos na próxima partida da série
38. Espectadores acompanham em `/hero-draft/espectador`
39. OBS captura `/hero-draft/overlay`

#### Fase 7 — Playoffs
40. Admin cria rodadas de playoffs: classificatório, quartas, semifinal, final
41. Tipos de confronto: `classificatorio`, `quartas`, `semifinal`, `final_up`, `quartas_lo`, `semifinal_lo`, `final_lo`, `grande_final`
42. Bracket de dupla eliminação renderizado em `/chave` com linhas SVG
43. Times eliminados na chave superior caem para a chave inferior
44. Grande Final pode ter revanche se time da chave inferior vencer

#### Fase 8 — Encerramento
45. Admin desativa toggle "Campeonato ativo"
46. Resultados preservados em tabela e chave
47. _(Novo)_ Fluxo de arquivamento e limpeza de dados pessoais

---

### Paths Firebase atuais (arquitetura flat)

```
/config/
  modules/              → toggles de UI (inscricaoAberta, draftAtivo, etc.)
  draft/                → regras do leilão
  conteudo/             → textos do site (cupName, descrição, streams, etc.)
  admins/{uid}          → admins
  superAdmins/{uid}     → superadmins
/botConfig/{guildId}/   → configuração dos canais Discord
/players/{uid}/         → jogadores inscritos
/playerOverrides/{id}/  → marcações de admin (premium, capitão, descartado)
/draftSession/
  captains/{id}/        → times com rosters e moedas
  state/                → status, turnoAtual, turnoExtra, rodada, lastAction
  playerState/{id}/     → preço e dono de cada jogador
/teams/{id}/            → times do campeonato
/rodadas/{id}/          → rodadas
/confrontos/{id}/       → partidas
/disponibilidade/{confrontoId}/{teamId}/ → slots de disponibilidade
/heroDraft/sessions/{id}/ → sessões de hero draft
```

---

### Bot Discord — comandos e funcionalidades atuais

**Configuração de canais (setup automático):**
- `/setup-all [cargo]` — cria todos os canais de uma vez
- `/setup-leilao [cargo]` — canal de notificações do leilão
- `/setup-campeonato [cargo]` — canal de resultados e partidas
- `/setup-tabela [cargo]` — mensagem ao vivo que é editada a cada resultado
- `/setup-agenda [cargo]` — canal de partidas confirmadas

**Comandos de consulta:**
- `/status` — estado do bot e do leilão
- `/leilao` — estado atual do leilão
- `/inscritos` — lista de jogadores (via Sheets)

**Notificações automáticas (listeners Firebase):**
- Compras e roubos no leilão
- Início e encerramento do leilão com roster completo
- Partidas confirmadas (vai para canal de agenda E campeonato)
- Resultados registrados
- Empates pendentes de desempate
- W.O. pendentes
- Tabela ao vivo (edita uma mensagem única a cada resultado)

---

## Parte 2 — Nova Arquitetura Multi-Campeonato

### Motivação

O sistema atual não distingue entre dados que pertencem ao campeonato oficial e dados criados para fins independentes. Times criados para testar um Hero Draft aparecem no `/elenco`; confrontos de teste são contados na tabela. Não existe o conceito de "este dado pertence ao campeonato X".

### Princípios da nova arquitetura

1. **Campeonato é o container.** Tudo que existe, existe porque um campeonato existe. Jogadores, times, partidas, configurações — tudo é por campeonato.
2. **Showmatch é efêmero.** Sessões independentes não salvam dados permanentes e não afetam nenhum campeonato.
3. **Privacidade por design.** Dados pessoais (emails, senhas) são deletados ao arquivar um campeonato. Dados de partida são preservados no histórico.
4. **Isolamento entre organizações.** Dois grupos diferentes podem usar a mesma ferramenta em contextos completamente separados, sem interferência.

---

### Estrutura Firebase proposta

```
/superAdmins/{uid}: true
  → Único dado verdadeiramente permanente além dos históricos

/system/
  campeonatoAtivo: "{campeonatoId}"
  → Ponteiro que o bot e o frontend usam para saber qual campeonato servir

/campeonatos/{campeonatoId}/
  info/
    nome:             string      (ex: "Copa Inhouse Season 3")
    labelSeason:      string      (ex: "Season 3 · Heroes of the Storm")
    descricao:        string
    organizador:      string
    tipo:             "campeonato"
    status:           "configurando" | "inscricoes" | "leilao" | "fase_regular" | "playoffs" | "encerrado"
    principal:        boolean     → TRUE = campeonato exibido nas rotas públicas
    criadoEm:         timestamp
    criadoPor:        uid
    validoDesdeRegras: timestamp  → data de vigência das regras desta temporada

  datas/
    inscricaoAbertura:    timestamp
    inscricaoFechamento:  timestamp
    leilao:               timestamp
    inicioFaseRegular:    timestamp
    inicioPlayoffs:       timestamp
    granFinal:            timestamp

  config/
    modules/
      inscricaoAberta:   boolean
      draftAtivo:        boolean
      espectadorAtivo:   boolean
      campeonatoAtivo:   boolean
      heroDraftAtivo:    boolean
      privacidadeAtiva:  boolean
    draft/
      moedas:            number (15)
      minPlayers:        number (5)
      maxPlayers:        number (7)
      minCaptains:       number (2)
      maxCaptains:       number (8)
      rouboAtivo:        boolean
      leilaoReservas:    boolean
    partidas/
      formatoFaseRegular:  "MD2" | "MD3"
      formatoPlayoffs:     "MD5" | "MD7"
      formatoGranFinal:    "MD5" | "MD7"
      tipoBracket:         "dupla" | "simples"
    pontuacao/
      vitoria:             number (3)
      empate:              number (1)
      derrota:             number (0)
      woVitoria:           number (3)
      desempateVitoria:    number (1)
    slots/
      diasAtivos:          ["terca","quarta","quinta","sabado"]
      horariosAtivos:      ["20h","21h","22h","17h","18h","19h"]
    conteudo/
      posInscricaoTexto:   string
      prazoDisponibilidade: string
      streams:             [{nome, url}]
      proximoEvento:       string
    botCanais/{guildId}/
      canal_leilao:        channelId
      canal_campeonato:    channelId
      canal_tabela:        channelId
      canal_agenda:        channelId
      tabela_msg_id:       messageId

  admins/{uid}: true
    → Admins com acesso a ESTE campeonato específico

  players/{uid}/
    discord, battletag, pais, linguas, elo,
    rolePrimaria, roleSecundaria, querCapitao,
    titularReserva, premium, precoBase, confirmado,
    inscritoEm, origem

  playerOverrides/{playerId}/
    capitao, confirmado, descartado, premium

  draftSession/
    captains/{id}/   → igual ao atual
    state/           → igual ao atual
    playerState/{id}/→ igual ao atual

  teams/{id}/
    nome, cor, fuso, fonte, jogadores[],
    capitaoUid, capitaoEmail, criadoEm

  rodadas/{id}/
    numero, semanaJogos, criadoEm

  confrontos/{id}/
    timeA, timeB, rodadaId, tipo, formato,
    status, slot, resultado, criadoEm, atualizadoEm

  disponibilidade/{confrontoId}/{teamId}/
    slots[], registradoEm

  heroDraft/sessions/{id}/
    status, timeA{}, timeB{}, mapaId,
    sequencia[], picks[], bans[], criadoEm

/historico/{campeonatoId}/
  info/           → cópia de campeonatos/{id}/info
  resultado/
    campeao:      teamId
    classificacao: [{pos, teamId, nome, pontos}]
  times/{id}/     → rosters finais (sem dados pessoais)
  confrontos/     → todas as partidas e resultados
  heroDraft/      → todas as sessões de picks/bans
  ← players:          DELETADO ao arquivar
  ← playerOverrides:  DELETADO ao arquivar
  ← draftSession:     DELETADO ao arquivar (preservar só resultado final)
  ← botCanais:        DELETADO ao arquivar

/showmatch/
  sessaoAtiva/
    criadaEm:     timestamp
    expiraEm:     timestamp (+24h, limpo automaticamente)
    teams/{id}/
    confronto/
    heroDraft/sessions/{id}/
  → Sem players, sem disponibilidade, sem tabela
  → Completamente isolado do campeonato
```

---

### Modelo de acesso

| Perfil | Acesso |
|---|---|
| SuperAdmin | Cria campeonatos, vê todos, gerencia superadmins e admins de qualquer campeonato |
| Admin de campeonato | Opera APENAS o campeonato em que foi adicionado como admin |
| Capitão | Acessa o campeonato pelo qual foi registrado |
| Jogador | Acessa o campeonato em que se inscreveu |
| Visitante | Lê dados públicos do campeonato com `principal: true` |

**Regra do campo `principal`:** Somente um campeonato pode ter `principal: true` simultaneamente. Ao setar `principal: true` em um campeonato, o sistema automaticamente seta `principal: false` em todos os outros. As rotas públicas (`/tabela`, `/chave`, `/elenco`, etc.) sempre leem do campeonato com `principal: true`.

---

### Rascunho das Security Rules

```json
{
  "rules": {
    "superAdmins": {
      ".read": "auth != null && root.child('superAdmins/' + auth.uid).exists()",
      ".write": "root.child('superAdmins/' + auth.uid).exists()"
    },
    "system": {
      ".read": true,
      ".write": "root.child('superAdmins/' + auth.uid).exists()"
    },
    "campeonatos": {
      "$cid": {
        "info":             { ".read": true },
        "config/modules":   { ".read": true },
        "config/conteudo":  { ".read": true },
        "teams":            { ".read": true },
        "rodadas":          { ".read": true },
        "confrontos":       { ".read": true },
        "disponibilidade":  { ".read": true },
        "heroDraft":        { ".read": true },
        "players": {
          "$uid": {
            ".read":  "auth.uid == $uid || root.child('campeonatos/' + $cid + '/admins/' + auth.uid).exists() || root.child('superAdmins/' + auth.uid).exists()",
            ".write": "auth.uid == $uid || root.child('campeonatos/' + $cid + '/admins/' + auth.uid).exists()"
          }
        },
        "disponibilidade":  { ".write": "auth != null" },
        "confrontos":       { ".write": "auth != null" },
        "$data": {
          ".write": "root.child('superAdmins/' + auth.uid).exists() || root.child('campeonatos/' + $cid + '/admins/' + auth.uid).exists()"
        }
      }
    },
    "historico": {
      ".read": true,
      ".write": "root.child('superAdmins/' + auth.uid).exists()"
    },
    "showmatch": {
      ".read": true,
      ".write": "auth != null"
    },
    ".read": false,
    ".write": false
  }
}
```

---

### Bot Discord — estratégia de listeners dinâmicos

O bot usa um ponteiro central para saber qual campeonato ouvir:

```
/system/campeonatoAtivo: "season-3"
```

Quando este valor muda, o bot:
1. Cancela todos os listeners registrados para o campeonato anterior
2. Registra novos listeners apontando para o novo namespace
3. Sem reiniciar o processo (implementado com asyncio)

O showmatch usa o namespace `/showmatch/sessaoAtiva/` separado. O bot ouve os dois de forma independente e nunca mistura os contextos.

---

### Wizard de criação de campeonato

#### Campos obrigatórios na criação
- Nome do campeonato
- Label de temporada
- Datas: abertura de inscrições, leilão, início dos jogos
- Formato: fase regular (MD2/MD3), playoffs (MD5/MD7), bracket (dupla/simples)
- Leilão: moedas, min/max capitães, min/max players, roubo ativo
- Admins do campeonato (emails ou UIDs)

#### Campos opcionais na criação (configuráveis depois)
- Descrição pública
- Texto pós-inscrição
- Prazo de disponibilidade
- Streams Twitch
- Pontuação customizada
- Slots disponíveis para agendamento
- Regras customizadas

#### Comportamento: defaults da temporada anterior
Ao abrir o wizard, o sistema busca o campeonato mais recente e usa seus valores de `config/` como padrão em todos os campos. O organizador só precisa alterar o que mudou (normalmente nome e datas).

---

### Showmatch

- Modo separado no admin: botão "Criar Showmatch"
- Banner permanente em vermelho: **"SHOWMATCH — nada aqui afeta o campeonato oficial"**
- Dados salvos em `/showmatch/sessaoAtiva/` com `expiraEm: +24h`
- Ao encerrar o showmatch: dados deletados imediatamente
- O bot **não reage** a eventos do showmatch
- Times: escolhidos de um acervo de nomes (lista estática + nomes de temporadas anteriores do histórico)
- Sem inscrição de jogadores, sem disponibilidade, sem tabela, sem classificação

---

### Estratégia de migração (Season 2 → nova arquitetura)

**Premissa:** Os dados atuais em `/teams`, `/confrontos`, etc. continuam funcionando em produção durante o desenvolvimento. A nova arquitetura é desenvolvida no branch `refactor/multi-campeonato` e testada na preview URL do Vercel.

**Quando executar a migração:**
Após a Season 2 encerrar (ou quando o novo sistema estiver pronto para produção).

**Passos:**
1. Criar `/campeonatos/season-2/` no Firebase
2. Executar script de migração: copiar todos os dados atuais para o novo namespace
3. Validar leitura pelo frontend na preview URL do Vercel
4. **Semana de convivência paralela** — ambos os sistemas ativos, produção ainda no main
5. Confirmar que tudo funciona corretamente
6. Merge para main → Vercel deploya nova versão
7. Manter paths antigos por mais uma semana como fallback
8. Deletar paths antigos após confirmação

**O que sobrevive na migração:**
- Inscrições: vêm do Google Sheets (independente do Firebase)
- Times, rodadas, confrontos: migrados para o novo namespace
- Configurações: migradas para `/campeonatos/season-2/config/`

---

## Parte 3 — Plano de Implementação por Fases

### Status atual
- `main`: sistema funcionando em produção com inscrições ativas
- `refactor/multi-campeonato`: branch criado, preview URL gerada pelo Vercel

---

### Fase 0 — Validação do ambiente ✅ CONCLUÍDA
- Branch `refactor/multi-campeonato` criado
- Preview URL do Vercel confirmada e funcional
- Separação entre main (produção) e branch (desenvolvimento) validada

---

### Fase 1 — Foundation
**Objetivo:** Estrutura de dados, autenticação e wizard de criação.

- [ ] Schema completo do campeonato implementado no Firebase
- [ ] Security Rules atualizadas para o novo namespace
- [ ] Hook `useCampeonato()` — resolve campeonato ativo via `principal: boolean`
- [ ] Hook `useSuperAdmin()` — acesso e permissões
- [ ] Wizard de criação de campeonato (multi-step)
- [ ] Seletor de campeonato para SuperAdmin no painel
- [ ] Auto-roteamento de admins comuns para seu campeonato
- [ ] Banner persistente no admin: "Operando em: [Nome do Campeonato]"
- [ ] Lógica de `principal`: ao ativar um, desativa todos os outros

---

### Fase 2 — Migração
**Objetivo:** Transferir dados da Season 2 para o novo namespace.

- [ ] Script de migração: flat paths → `/campeonatos/season-2/`
- [ ] Testes de leitura na preview URL
- [ ] Semana de convivência paralela
- [ ] Merge para main após validação
- [ ] Limpeza dos paths antigos após uma semana

---

### Fase 3 — Páginas públicas e histórico
**Objetivo:** Todas as telas leem do campeonato ativo; histórico navegável.

- [ ] Todas as páginas públicas (`/tabela`, `/chave`, `/elenco`, `/agendamento`, `/espectador`, `/resultados`) leem via `useCampeonato()`
- [ ] Home: seção "Últimos campeonatos" (lista com campeão, datas, link para histórico)
- [ ] Home: seção "Próximos eventos" (data do próximo campeonato configurado)
- [ ] Rota `/historico` — biblioteca de campeonatos passados
- [ ] Rota `/historico/{id}` — detalhes de um campeonato: times, partidas, bracket, picks

---

### Fase 4 — Showmatch
**Objetivo:** Modo independente que não afeta nenhum campeonato.

- [ ] Modo showmatch no admin com banner vermelho permanente
- [ ] Namespace `/showmatch/sessaoAtiva/` com TTL de 24h
- [ ] Acervo de nomes de times (lista estática + histórico)
- [ ] Fluxo de encerramento com deleção imediata
- [ ] Bot completamente isolado do contexto de showmatch

---

### Fase 5 — Bot por campeonato
**Objetivo:** Bot reage ao campeonato ativo, nunca ao showmatch.

- [ ] Path `/system/campeonatoAtivo` como ponteiro
- [ ] Listeners dinâmicos com reregistro sem reiniciar o processo (asyncio)
- [ ] `/setup-all` salva canais em `/campeonatos/{id}/config/botCanais/`
- [ ] Wizard com defaults da temporada anterior

---

### Fase 6 — Privacy e arquivo
**Objetivo:** Ciclo de vida completo — encerramento limpo com histórico preservado.

- [ ] Flow de encerramento de campeonato no painel admin
- [ ] Cópia para `/historico/{id}/` (times, confrontos, picks — sem dados pessoais)
- [ ] Deleção de dados pessoais no Realtime DB (`players/`, `playerOverrides/`, `draftSession/`)
- [ ] Instrução clara para SuperAdmin: deleção em batch das contas Firebase Auth via Console
- [ ] Campo `validoDesdeRegras` na página `/regras` (exibido abaixo do título)

---

### Fase 7 — Extras e qualidade de vida
**Objetivo:** Melhorias de baixa prioridade mas alto valor no dia a dia.

- [ ] Notificação de check-in pré-partida via bot (1h antes do slot confirmado)
- [ ] Campo `regrasVersao: timestamp` nos confrontos (para auditoria retroativa)
- [ ] Wizard: ao criar campeonato, pré-popular com defaults da temporada anterior
- [ ] Validação de regras do wizard contra Security Rules antes de salvar

---

## Decisões técnicas registradas

| Decisão | Motivo |
|---|---|
| Firebase Realtime DB (não Firestore) | Latência em tempo real essencial para o leilão e hero draft |
| Sem Firebase Auth multi-tenancy | Mesmos jogadores participam de temporadas consecutivas; pools separados seriam overhead sem benefício |
| `principal: boolean` (não lógica automática) | Explícito, previsível, sem surpresas em edge cases |
| `/system/campeonatoAtivo` ponteiro separado | Bot e frontend precisam de um único ponto de verdade; regras de qual campeonato está "em exibição" e qual está "sendo operado" podem divergir |
| Sem Cloud Functions para deleção de Auth | Para o contexto de uma liga comunitária pequena, deleção manual em batch pelo console é suficiente e mantém o projeto 100% gratuito |
| Showmatch com TTL em vez de sem persistência | Hero Draft e leilão precisam de sincronização em tempo real entre dispositivos; TTL garante limpeza automática sem custo adicional |
| Dados de partida preservados no histórico | Nicks, battletags e resultados são informações públicas de desempenho competitivo — anonimizá-las quebraria o valor histórico do arquivo |
| Inscrições via Google Sheets | Sheets funciona como backup e visualização para os organizadores independentemente do Firebase; desacoplamento intencional |

---

## Timing

| Período | O que acontece |
|---|---|
| Agora (desenvolvimento) | Inscrições abertas em produção (`main`). Desenvolvimento no branch `refactor/multi-campeonato`. |
| ~20 dias | Campeonato começa. Idealmente a nova arquitetura está pronta para entrar em produção. |
| Após Season 2 | Migração completa. Season 3 já nasce na nova arquitetura. |

---

*Documento gerado em 2026-04-28. Manter atualizado a cada decisão arquitetural relevante.*
