# Escopo Completo — Copa Inhouse

Plataforma web para organizar campeonatos de Heroes of the Storm com leilão de jogadores, drafts de herói e gerenciamento de partidas.

## Arquitetura geral

**Estrutura de URLs:**
- `/` → Home Mestre (lista todos os campeonatos)
- `/campeonatos/{id}/*` → Páginas de cada campeonato
- `/historico/*` → Arquivo de campeonatos encerrados
- `/showmatch/*` → Partidas avulsas (sem campeonato)
- `/admin` → Painel do SuperAdmin

**Três níveis de acesso:**
- **Público** — qualquer pessoa visitando o site
- **Capitão** — entrou via link personalizado ou login (email/PIN)
- **Admin / SuperAdmin** — organizadores do evento

**Módulos controlados por toggle do admin:**
`inscricaoAberta`, `inscritosAbertos`, `draftAtivo`, `espectadorAtivo`, `campeonatoAtivo`, `heroDraftAtivo`, `privacidadeAtiva`, `bannerInscritosAtivo`, `capitaesPublicos`

---

## Público geral

### Home Mestre (`/`)
Lista todos os campeonatos visíveis. Mostra status (Inscrições abertas, Leilão, Em andamento, Encerrado) e link para histórico.

### Home do Campeonato (`/campeonatos/{id}`)
Banner com nome, season label, descrição, próximo evento, botões de redes sociais, card de regras.

### Inscrição (`/campeonatos/{id}/inscricao`)
Formulário público (quando `inscricaoAberta = true`):
- Nick do Discord, Battletag (validação `Nick#0000`)
- País, Línguas faladas (PT/ES/EN)
- Elo, Função primária e secundária
- Titular/Reserva, Quer ser capitão?
- Aceite das regras

Envia para Google Sheets via Apps Script. Login com Google obrigatório.

### Inscritos (`/campeonatos/{id}/inscritos`)
Lista pública (quando `inscritosAbertos = true`). Mostra nick, elo, função primária e secundária, país, línguas, status. Ordenável por qualquer coluna. ⚑ de capitão controlado por `capitaesPublicos`.

### Regras (`/campeonatos/{id}/regras`)
Página estática em PT/ES/EN.

### Espectador do Leilão (`/campeonatos/{id}/espectador`)
View pública do leilão para transmissão Twitch. Mostra times, pool, turno, log.

### Resultados (`/campeonatos/{id}/resultados`)
Times formados após encerramento do leilão. Roster completo com elo, função, preço.

### Elenco (`/campeonatos/{id}/elenco`)
Times do campeonato com roster, capitão, W/L. Busca por jogador.

### Tabela (`/campeonatos/{id}/tabela`)
Classificação geral. Filtros por rodada e por time.

### Chave (`/campeonatos/{id}/chave`)
Bracket dos playoffs (Upper/Lower) — eliminação dupla.

### Agendamento (`/campeonatos/{id}/agendamento`)
Agenda das partidas confirmadas, agrupadas por rodada. Filtro por time.

### Hero Draft Espectador (`/campeonatos/{id}/hero-draft/espectador`)
Tela de espectador do draft de heróis (banimentos, picks, timer).

### Histórico (`/historico` e `/historico/{id}`)
Arquivo de campeonatos encerrados. Cada um tem detalhamento com times finais, partidas, resultados.

---

## Capitão (logado)

### Como entra
- **Link personalizado** — `https://.../draft?cap=ID&pin=XXXX`. Auto-login.
- **Formulário PIN** — seleciona time, digita PIN de 4 dígitos.
- **Email + senha** — Firebase Auth, mais usado pós-leilão.

### Leilão / Draft (`/campeonatos/{id}/draft`)
Tela principal do capitão:
- Sub-header com rodada, badge do time, turno atual, moedas
- Timer com barra de progresso e countdown sonoro nos últimos 10s
- Painel esquerdo: todos os times com rosters
- Painel central: pool em cards (4-5 por linha)
  - Roubáveis no topo (vermelho, com nome do dono)
  - Disponíveis embaixo
- Painel direito: seu próprio time
- Alerta dramático "SUA VEZ!" — fullscreen, 2.4s, só para o capitão da vez

**Ações:** Comprar (preço atual), Roubar (preço atual, dono recebe reembolso). Sons diferenciados para cada ação, tocados para todos os clientes.

### Hero Draft Capitão (`/campeonatos/{id}/hero-draft?time=A`)
Banir/pickar heróis. Presence para o admin ver quem está online. Timer por turno.

### Agendamento (visão capitão)
Marca disponibilidade nos slots da semana. Sistema auto-confirma quando há overlap entre dois times.

---

## Admin / Organizador

### Wizard de Novo Campeonato (`/admin/novo-campeonato`)
SuperAdmin cria edição: identidade, datas, formato, leilão, admins, revisão.

### Painel Admin (`/campeonatos/{id}/admin`)

**Aba 1 — Geral:**
- Toggles dos módulos
- Edição de conteúdo do site (nome, label season, descrição, próximo evento, banner, redes sociais)

**Aba 2 — Inscrições:**
- Estatísticas (total, confirmados, descartados, pendentes, capitães)
- Filtros e busca
- Por jogador: Cap? / Confirmar / Descartar

**Aba 3 — Capitães:**
- Toggle "Capitães visíveis ao público"
- **Capitães do Leilão:** criar times com nome, capitão (dropdown), emoji, cor, seed, PIN automático
  - Edição inline ✏️
  - Subir/descer ordem, regenerar PIN, copiar link personalizado, deletar
  - 🎲 Randomizar seeds
- **Acesso dos Capitães:** contas Firebase Auth (email+senha)

**Aba 4 — Leilão:**
- Controle: iniciar, pausar, encerrar, resetar
- Regras: moedas (15), min/max capitães e players, roubo ativo, **timer por turno**, **volume dos sons**
- Simulador (SuperAdmin)
- Durante leilão ativo: ⏭ Avançar Turno, ⏹ Encerrar, 🗑 Resetar

**Aba 5 — Times:**
- **Importar do leilão:** 1 clique por time
- Criar manualmente com fuso horário e jogadores
- Edição inline ✏️
- Deletar

**Aba 6 — Campeonato:**
- Rodadas (regular, playoffs)
- Hero Drafts por confronto

**Aba 7 — Sistema (SuperAdmin):**
- Setup do Bot Discord
- Convidar/remover coadmins
- Encerrar Campeonato (arquiva em `/historico/{id}`)
- Migração

### Showmatch (`/showmatch`)
Sessões avulsas de hero draft (sem campeonato). Lobby com presence, configuração de mapa, bans globais, sequência custom.

---

## Ciclo completo de uma temporada

```
1. SuperAdmin cria campeonato (Wizard)

2. Admin abre inscrições (inscricaoAberta = true)
   └─ Jogadores se inscrevem via /inscricao
   └─ Dados → Google Sheets

3. Admin abre lista de inscritos (inscritosAbertos = true)

4. Admin confirma/descarta jogadores e marca capitães candidatos

5. Admin cria times do leilão (Capitães do Leilão)
   └─ Cada time recebe PIN único automaticamente
   └─ Manda link personalizado para cada capitão

6. Anúncio dos capitães (transmissão externa)
   └─ Admin liga capitaesPublicos → ⚑ aparece na lista

7. Dia do leilão (draftAtivo + espectadorAtivo)
   └─ Admin inicia
   └─ Capitães entram pelo link, fazem compras/roubos
   └─ Timer controla ritmo
   └─ Público assiste na Twitch via /espectador
   └─ Encerra automaticamente quando todos têm o mínimo

8. Pós-leilão (campeonatoAtivo = true)
   └─ Admin importa times do leilão para /teams/ (1 clique cada)
   └─ Cria rodadas e gera confrontos
   └─ Capitães marcam disponibilidade

9. Partidas com Hero Draft (heroDraftAtivo = true)
   └─ Para cada confronto: admin cria sessão de draft
   └─ Manda links pros 2 capitães
   └─ Capitães banem/pickam
   └─ Após partida: admin registra resultado
   └─ Tabela e Chave atualizam

10. Encerramento
    └─ Sistema → Encerrar Campeonato
    └─ Arquiva em /historico/{id}
    └─ Deleta dados pessoais
```

---

## Estado atual do leilão (decisões importantes)

- **Sem turno extra** (removido — quem é roubado não ganha turno bônus)
- Quando o timer zera: **pula o turno** (não força auto-pick)
- Pool em **grid de cards compactos**, roubáveis no topo com badge do dono
- **Alerta "SUA VEZ!"** fullscreen por 2.4s, só para o capitão da vez
- Sons sincronizados via `lastAction` (todos os clientes ouvem):
  - Countdown nos últimos 10s (MP3 com fallback sintético)
  - Pick (OGG do HotS)
  - Steal (MP3 do HotS, tom diferente)
- Volume controlado pelo slider do admin
- Links personalizados por capitão com auto-login

---

## Funcionalidades transversais

- **i18n** PT-BR/ES/EN (inclui nomes de heróis e roles)
- **Bandeiras via flagcdn.com** (emoji de bandeira não renderiza como flag no Windows)
- **Bot Discord** vinculado por guild, anuncia compras/roubos
- **Modo Privacidade** para transmissões (esconde nomes dos jogadores)
- **Multi-campeonato** namespaced por `/campeonatos/{id}` — permite seasons paralelas
