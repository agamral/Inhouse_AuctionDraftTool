# Replay Parser — Documentação As-Built

> Documento de referência para o Claude Code responsável pelo site Copa Inhouse.
> Descreve o sistema **como foi implementado e está em produção** na branch `feature/replay-parser`
> (pronta para merge em `main`). Leia junto com `CLAUDE.md` para contexto geral do projeto.

---

## Visão geral

Após cada confronto, o admin faz upload dos arquivos `.StormReplay` (um por game) pelo painel.
Um endpoint Python parseia o arquivo, extrai estatísticas, talentos (com nomes/descrições em
PT/EN/ES), tenta identificar os jogadores automaticamente, e salva tudo no Firebase Realtime
Database sob o confronto correspondente. A página pública do confronto exibe os dados sem
nenhuma intervenção manual além do upload (e, ocasionalmente, da identificação manual de
jogadores não reconhecidos).

Também é possível anexar um link de VOD (YouTube) por game via painel admin.

---

## Arquitetura

```
Admin (AdminReplayUpload.jsx)
   │  upload do .StormReplay
   ▼
Endpoint Flask no Render (replay-parser/app.py)
   │  parse_replay.py + talent_lookup.py
   │  devolve JSON parseado
   ▼
Firebase Realtime Database
   /campeonatos/{campeonatoId}/confrontos/{confrontoId}/replays/game{n}
   ▼
Página pública (ConfrontoDetalhe.jsx) — exibe tabela, talentos, gráfico de XP, timeline, VOD
```

### Componentes do repositório

| Caminho | Papel |
|---|---|
| `replay-parser/app.py` | Endpoint Flask (deploy no Render, free tier) |
| `replay-parser/parse_replay.py` | Lógica de parsing do `.StormReplay` |
| `replay-parser/talent_lookup.py` | Resolução de nomes/descrições/ícones de talentos (multi-idioma) |
| `replay-parser/heroes_data_cache.json` | Cache gerado offline com dados de heróis/talentos (PT/EN/ES) |
| `replay-parser/NOTAS_TECNICAS.md` | Detalhes técnicos e armadilhas do parsing binário |
| `src/components/AdminReplayUpload.jsx` | UI de upload, status de parsing, identificação manual, campo de VOD |
| `src/pages/ConfrontoDetalhe.jsx` | Exibição pública: tabela de stats, talentos, gráfico de XP, timeline de eventos, VOD |

---

## Deploy do endpoint (Render)

```
Build command : pip install -r requirements.txt
Start command : gunicorn app:app
```

Variáveis de ambiente:
```
PORT               — injetada automaticamente pelo Render
ALLOWED_ORIGIN     — origin permitida no CORS (opcional; padrão: *)
```

CORS é garantido inclusive em respostas de erro (4xx/5xx) via `after_request`, para que o
frontend sempre consiga ler a mensagem de erro.

> **Nota operacional:** ao alterar `parse_replay.py` ou `talent_lookup.py`, é preciso
> redeployar o serviço no Render para que o endpoint use a versão nova. Replays já
> processados anteriormente **não são reprocessados automaticamente** — para obter campos
> novos (ex.: `name_i18n`/`description_i18n`, ícones) é necessário re-fazer o upload do
> mesmo arquivo `.StormReplay`.

---

## O que é extraído de cada replay

### Dados da partida
- Data/hora (UTC), mapa, modo de jogo, duração (segundos e `MM:SS`), build do jogo

### Dados por jogador (10 jogadores)
- Battletag, herói, time, resultado (vitória/derrota)
- Kills, Deaths, Assists, Takedowns
- Dano a heróis, dano sofrido, cura em aliados, autocura
- Contribuição de XP, dano a minions/estruturas, level final
- Tempo morto, CC aplicado, acampamentos/torres capturadas, maior kill streak

### Talentos por jogador
7 talentos (tiers Lv1/4/7/10/13/16/20), cada um com:
- `tier`, `level`, `choice`, `absolute_index`
- `name` / `description` (string em inglês, mantida por compatibilidade)
- **`name_i18n` / `description_i18n`** — dicionários `{ "en": ..., "pt": ..., "es": ... }`
  com nome e descrição localizados (ver seção [Talentos multi-idioma](#talentos-multi-idioma-name_i18n--description_i18n))
- `icon` — URL do ícone do talento

### Dados adicionais (para gráficos)
- Série temporal de XP por time (gráfico "Vantagem de XP")
- Linha do tempo de eventos (kills, capturas de objetivo/acampamentos)

---

## Estrutura salva no Firebase

```
/campeonatos/{campeonatoId}/confrontos/{confrontoId}/replays/
  game1/
    parsed: true
    uploadedAt: timestamp
    vodUrl: "https://youtube.com/..." | null
    match:
      build, datetime, map (id + nome), game_mode, duration, duration_seconds
    teams:
      team1: { takedowns, result }
      team2: { takedowns, result }
    players:
      slot0:
        battletag, hero, team, result
        kills, deaths, assists, takedowns
        hero_damage, damage_taken, healing, self_healing
        experience_contribution, minion_damage, structure_damage
        level, time_dead, time_cc_enemy, merc_camps, highest_kill_streak
        playerUid: string | null         # vínculo com /players (auto ou manual)
        unidentified: boolean
        talents:
          - tier, level, choice, absolute_index
            name, name_i18n: { en, pt, es }
            description, description_i18n: { en, pt, es }
            icon
    xpTimeline: [...]      # série para o gráfico de vantagem de XP
    events: [...]          # linha do tempo de kills/objetivos
  game2/
    ... (mesma estrutura, para MD2+)
```

---

## Identificação automática e manual de jogadores

```
Para cada jogador no replay:
  → Busca battletag em /campeonatos/{id}/players/
  → Encontrou? Vincula playerUid automaticamente
  → Não encontrou? Marca slot como unidentified: true
```

No painel admin (`AdminReplayUpload.jsx`), confrontos com jogadores não identificados
mostram um alerta com dropdown por slot — o admin escolhe manualmente o jogador cadastrado
correspondente. O dropdown é populado a partir do roster dos times do confronto
(`buildRosterOptions`). O vínculo é salvo permanentemente e não precisa ser refeito.

Resolve casos de smurf, conta emprestada ou battletag diferente do cadastrado.

---

## Talentos multi-idioma (`name_i18n` / `description_i18n`)

Em vez de buscar traduções em tempo de exibição, o parser busca **todos os idiomas
suportados de uma vez** (en/pt/es) no momento do parsing e os embute no JSON salvo.
Isso evita reprocessamento por idioma — basta um upload por replay.

**Backend** (`talent_lookup.py`):
- `TALENT_LOCALES = {"pt": "ptbr", "es": "eses"}` mapeia idioma → sufixo de locale do
  HeroesToolChest (`gamestrings_{build}_{locale}.json`)
- `download()` baixa e indexa `gamestrings` para `en`, `pt` e `es`, construindo
  `name_by_id_langs` / `desc_by_id_langs` como `{lang: {talent_id: texto}}`
- O cache (`heroes_data_cache.json`) armazena `name`/`description` de cada talento como
  dicionário `{lang: texto}` (com fallback retrocompatível para o formato antigo de string única)
- `get_names_i18n(hero, tier, choice)` / `get_descriptions_i18n(...)` retornam o dict completo;
  `get_name(..., lang="en")` / `get_description(..., lang="en")` retornam a string de um
  idioma específico, com fallback para inglês

**Frontend** (`ConfrontoDetalhe.jsx`):
```js
function talentTexto(lang, i18nDict, fallback) {
  if (i18nDict) return i18nDict[lang] || i18nDict.en || fallback
  return fallback
}
// em TalentBadge:
const nome      = talentTexto(i18n.language, t.name_i18n, t.name)
const descricao = talentTexto(i18n.language, t.description_i18n, t.description)
```

---

## Tradução de nomes de mapas

Os mapas têm chave i18n própria no namespace `"maps"` de `pt.json`/`en.json`/`es.json`
(traduções conferidas contra a terminologia oficial do jogo). Helper compartilhado:

```js
function mapaNome(t, mapa) {
  if (!mapa) return null
  return t('maps.' + mapa.id, { defaultValue: mapa.nome })
}
```

Usado em `ConfrontoDetalhe.jsx`, `HeroDraft.jsx` (em `TurnStrip`, `ShowmatchPreDraft`,
`ShowmatchLobby`, `ShowmatchConfirmacao`) e `HeroDraftEspectador.jsx` — todas as telas que
exibem nome de mapa usam a mesma chave, então a tradução é consistente em todo o site.

Nomes de heróis já eram traduzidos antes deste módulo (namespace `"heroes"`, sem alterações).

---

## VOD (link do YouTube)

Implementação simples por decisão de produto — sem upload de vídeo, apenas link externo:

- **Admin** (`AdminReplayUpload.jsx`, dentro de `GamePanel`): campo de texto + botão "Salvar"
  por game, grava `vodUrl` em `replays/game{n}/vodUrl` (string ou `null` se vazio)
- **Público** (`ConfrontoDetalhe.jsx`): se `replayGame.vodUrl` existe, o botão "▶ Assistir
  Partida" vira um link `<a target="_blank">`; caso contrário fica desabilitado com a
  mensagem "Disponível em breve"

---

## Exibição pública (`ConfrontoDetalhe.jsx`)

Quando o replay de um game está parseado, a página exibe:

1. Resumo do game — mapa (traduzido), duração, modo, placar de takedowns por time
2. Tabela de jogadores — herói, battletag, K/D/A, TD, dano, cura (com abas: Tabela / Vantagem
   de XP / Eventos)
3. Talentos por jogador — nome/descrição/ícone localizados conforme o idioma ativo, com
   tooltip customizado e botão "copiar build" (formato usado pelo jogo)
4. Gráfico de vantagem de XP ao longo da partida
5. Linha do tempo de eventos (kills, capturas de objetivo/acampamentos), com nomes de heróis
   e times traduzidos
6. Botão de VOD (link do YouTube, quando cadastrado)
7. Para MD2+: seções/abas separadas por game

---

## Backlog conhecido (fora do escopo deste módulo)

- **Página `/stats` do campeonato** (heróis mais jogados/banidos, winrate, builds populares,
  mapas mais jogados, jogador com mais kills/cura) — só faz sentido após acumular volume
  relevante de replays. Não é parte do MVP nem está planejada para esta branch.

---

## Notas operacionais para o merge

- Redeploy do endpoint no Render é necessário para que as versões atualizadas de
  `parse_replay.py`/`talent_lookup.py` entrem em produção.
- Replays já enviados antes deste módulo de i18n de talentos precisam ser re-enviados
  (mesmo arquivo `.StormReplay`) para ganhar `name_i18n`/`description_i18n` e ícones.
- Para detalhes de baixo nível do parsing binário (formatos de evento, armadilhas de
  protocolo, mapeamento de IDs de heróis, etc.), ver `replay-parser/NOTAS_TECNICAS.md`.
