# Notas Técnicas — HotS Replay Parser

Documento do que foi necessário para parsear arquivos `.StormReplay` corretamente,
incluindo os obstáculos encontrados e como foram resolvidos.

---

## 1. Formato do arquivo

Um `.StormReplay` é um arquivo **MPQ** (formato de arquivo comprimido da Blizzard),
lido pela biblioteca `mpyq`. Dentro dele existem várias seções binárias:

| Seção | Conteúdo |
|---|---|
| `replay.details` | Lista de jogadores, mapa, hora da partida |
| `replay.attributes.events` | Atributos da partida (modo de jogo, etc.) |
| `replay.tracker.events` | Estatísticas finais, duração, setup dos jogadores |
| `replay.game.events` | Eventos in-game (escolhas de talento, ações) |
| `replay.initdata` | Dados de inicialização |

---

## 2. Dependências

```
heroprotocol >= 2.0.0   # decodificador oficial Blizzard
mpyq >= 0.2.5           # leitor de MPQ
```

O `heroprotocol` fornece um módulo de protocolo específico para cada build do jogo
(ex: `protocol91756.py`). Cada módulo sabe decodificar o binário daquele build.

---

## 3. Carregamento do protocolo — problema crítico com Python 3.12+

### O problema

O pacote `heroprotocol` tem um `versions/__init__.py` que usa o módulo `imp`
da biblioteca padrão do Python. O `imp` foi **removido no Python 3.12**,
causando `ModuleNotFoundError: No module named 'imp'` ao tentar importar
`from heroprotocol import versions`.

### A solução

Usar `importlib.util` para carregar os arquivos de protocolo diretamente do disco,
sem passar pelo `versions/__init__.py` quebrado:

```python
import importlib.util
from pathlib import Path

def _load_module_from_file(name, filepath):
    spec = importlib.util.spec_from_file_location(name, filepath)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

# Localiza todos os protocol*.py instalados
pkg_dir = Path(heroprotocol.__file__).parent / "versions"
protocol_files = sorted(f for f in pkg_dir.glob("protocol*.py") if f.stem[8:].isdigit())

# Carrega o mais recente para ler o cabeçalho e descobrir o build
latest_mod = _load_module_from_file("proto_latest", protocol_files[-1])
header = latest_mod.decode_replay_header(header_bytes)
base_build = header["m_version"]["m_baseBuild"]

# Carrega o protocolo exato se disponível
exact = [f for f in protocol_files if int(f.stem[8:]) == base_build]
protocol = _load_module_from_file(f"proto_{base_build}", exact[0]) if exact else latest_mod
```

### Nota sobre builds recentes

O pacote PyPI do `heroprotocol` é atualizado com atraso em relação ao jogo.
Replays de builds mais novos (ex: 97039) são decodificados pelo protocolo mais
recente disponível (ex: 91756). Na prática os dados ficam corretos porque a
Blizzard mantém compatibilidade retroativa entre patches.

---

## 4. Extração de dados por seção

### 4.1 `replay.details` — jogadores e mapa

```python
details = protocol.decode_replay_details(raw_bytes)
```

- `details["m_playerList"]` — lista de jogadores
- `m_name` — battletag (bytes)
- `m_hero` — nome do herói (bytes, ex: `b"Brightwing"`)
- `m_teamId` — time (0 ou 1; converter para 1/2 somando 1)
- `m_result` — 1 = vitória, 2 = derrota
- `m_timeUTC` — Windows FILETIME (intervalos de 100ns desde 01/01/1601)

Conversão de timestamp:
```python
unix_ts = (filetime - 116_444_736_000_000_000) / 10_000_000
datetime.fromtimestamp(unix_ts, tz=timezone.utc)
```

### 4.2 `replay.attributes.events` — modo de jogo

```python
attrs = protocol.decode_replay_attributes_events(raw_bytes)
# attrs["scopes"][scope_id][attrid] = [{"value": bytes, ...}]
```

**Armadilha:** o atributo de modo de jogo **não** está no `attrid 500`.
Estrutura correta:

| Scope | Attrid | Conteúdo |
|---|---|---|
| 1–10 | 500 | Tipo de controle do jogador (`b"Humn"`) |
| **16** | **3009** | **Modo de jogo** (`b"Amm"`, `b"StormLeague"`, etc.) |

O decoder já reverte os bytes e remove nulos — usar o valor diretamente:

```python
game_mode_raw = attrs["scopes"][16][3009][0]["value"]  # ex: b"Amm"
```

Mapeamento dos valores:

| Valor | Modo |
|---|---|
| `b"Amm"` | Quick Match |
| `b"StormLeague"` | Storm League |
| `b"Priv"` | Custom Game |
| `b"UnrankedDraft"` | Unranked Draft |
| `b"ARAM"` | Brawl / ARAM |

### 4.3 `replay.tracker.events` — estatísticas e duração

```python
events = list(protocol.decode_replay_tracker_events(raw_bytes))
```

**Evento `SScoreResultEvent`** — contém as estatísticas finais de todos os jogadores.

**Armadilha crítica — formato do valor mudou entre builds:**

```python
# Builds antigos:
m_values = [[42], [18], ...]            # lista com inteiro

# Builds recentes (97039+):
m_values = [[{"m_value": 42, "m_time": 743}], ...]  # lista com dict
```

Extração robusta para ambos os formatos:

```python
inner = val_entry[0]
if isinstance(inner, dict):
    value = inner.get("m_value")
elif isinstance(inner, list):
    value = inner[0]
else:
    value = inner
```

Estatísticas disponíveis no evento (campo `m_name`):

| Campo | Significado |
|---|---|
| `SoloKill` | Kills (abates finais) |
| `Deaths` | Mortes |
| `Assists` | Assistências |
| `Takedowns` | SoloKill + Assists |
| `HeroDamage` | Dano causado a heróis |
| `DamageTaken` | Dano recebido |
| `Healing` | Cura em aliados |
| `SelfHealing` | Autocura |
| `Level` | Nível do herói ao fim |
| `ExperienceContribution` | XP contribuída |

**Duração da partida:** usar o `_gameloop` do último `SScoreResultEvent`.
Taxa de conversão: **16 game loops = 1 segundo**.

**Mapeamento jogador → slot de estatística:**

O evento `SPlayerSetupEvent` fornece `m_playerId` → `m_slotId`.
O `m_slotId` corresponde ao índice na lista `m_playerList` do `replay.details`.
Os `m_values` do `SScoreResultEvent` são indexados pelo `m_slotId`.

### 4.4 `replay.game.events` — talentos

```python
events = list(protocol.decode_replay_game_events(raw_bytes))
```

**Evento de talento:** `NNet.Game.SHeroTalentTreeSelectedEvent`

Campos relevantes:
- `_userid["m_userId"]` — índice do jogador (0-based, corresponde ao slot)
- `m_index` — **índice absoluto** do talento no talent tree completo do herói

**Armadilha — `m_index` é absoluto, não relativo ao tier:**

Com 3 opções por tier e 7 tiers (Lv1, 4, 7, 10, 13, 16, 20), os índices vão de 0 a 20:

```
Tier Lv1  → índices 0, 1, 2
Tier Lv4  → índices 3, 4, 5
Tier Lv7  → índices 6, 7, 8
Tier Lv10 → índices 9, 10, 11  (Heroic — pode ter só 2 opções)
Tier Lv13 → índices 12, 13, 14
Tier Lv16 → índices 15, 16, 17
Tier Lv20 → índices 18, 19, 20
```

Para obter qual opção foi escolhida dentro do tier:
```python
within_tier = m_index % 3   # 0 = 1ª opção, 1 = 2ª, 2 = 3ª
```

O tier em si é derivado da contagem de eventos por jogador (1º evento = tier 0, 2º = tier 1, etc.).

---

## 5. Resolução de nomes de talentos

O replay **não armazena o nome** do talento — apenas o índice. Para resolver o nome
é necessário um dicionário externo.

### Fonte dos dados

**HeroesToolChest/heroes-data** (GitHub):
- `heroesdata/{version}/data/herodata_{build}_localized.json` — árvore de talentos
- `heroesdata/{version}/gamestrings/gamestrings_{build}_enus.json` — nomes em inglês

### Armadilha 1 — IDs internos vs nomes de exibição

O `heroprotocol` e o replay usam o **nome de exibição** do herói (ex: `"Brightwing"`).
O `heroes-data` usa **IDs internos** (ex: `"FaerieDragon"`).

Exemplos de divergência:

| Nome no replay | ID interno no heroes-data |
|---|---|
| Brightwing | FaerieDragon |
| Li-Ming | Wizard |
| Kharazim | Monk |
| Johanna | Crusader |
| Sonya | Barbarian |
| Cassia | Amazon |
| Lt. Morales | Medic |
| Valla | DemonHunter |
| Xul | Necromancer |
| Nazeebo | WitchDoctor |
| Gazlowe | Tinker |
| E.T.C. | L90ETC |
| Mei | MeiOW |

**Solução:** usar o campo `hyperlinkId` do herodata — ele contém o nome de exibição
e serve como ponte:

```python
# Ao construir o DB:
hyperlink_idx[hero["hyperlinkId"]] = hero_id   # {"Brightwing": "FaerieDragon"}

# Ao buscar:
internal_id = hyperlink_idx.get(hero_name_from_replay)
talents = db[internal_id]
```

### Armadilha 2 — chaves inteiras viram strings no JSON

Ao salvar o cache em JSON e recarregar, as chaves dos dicionários aninhados
(tier_index e choice, que são inteiros) são convertidas para strings pelo JSON.

```python
# Lookup robusto para ambos os tipos de chave:
tier_db = hero_db.get(tier_index) or hero_db.get(str(tier_index), {})
name    = tier_db.get(choice)     or tier_db.get(str(choice))
```

### Estrutura do gamestrings

O nome de um talento está em:
```
gamestrings["gamestrings"]["abiltalent"]["name"]["{nameId}|{buttonId}|{abilityType}|{isPassive}"]
```

A chave composta pode ser simplificada: basta usar o prefixo `nameId` (parte antes do primeiro `|`)
para construir um índice `{nameId: display_name}`.

---

## 5.1. Resolução multi-idioma (PT/EN/ES)

Para exibir nomes e descrições de talentos localizados sem precisar reprocessar o replay
por idioma, o lookup busca **todos os idiomas suportados de uma vez** no momento do parsing
e os embute no JSON salvo (`name_i18n`/`description_i18n` como `{lang: texto}`).

O HeroesToolChest publica um `gamestrings_{build}_{locale}.json` por locale. Os sufixos de
locale não seguem o código de idioma do site:

```python
TALENT_LOCALES = {"pt": "ptbr", "es": "eses"}
# inglês não precisa de mapeamento — é o arquivo *_enus.json já usado
```

Para cada idioma, o gamestrings é baixado e indexado com o mesmo helper `_index_abiltalent`,
produzindo `name_by_id_langs = {"en": {...}, "pt": {...}, "es": {...}}` (e equivalente para
descrições). O cache (`heroes_data_cache.json`) passou a guardar `name`/`description` como
dicionário `{lang: texto}` por talento.

**Compatibilidade com o cache antigo:** caches gerados antes desta mudança guardavam
`name`/`description` como string única (inglês). O parser de leitura (`_entry`) trata os
três formatos possíveis — dict novo, string legada, e dict legado com apenas `"en"` — para
não quebrar caches antigos sem necessidade de regenerá-los manualmente.

---

## 6. Resumo dos obstáculos e soluções

| Problema | Causa | Solução |
|---|---|---|
| `No module named 'imp'` | Python 3.12 removeu `imp` | Carregar protocolo com `importlib.util` |
| Stats todas zeradas | Formato `m_value` mudou de `[int]` para `[{"m_value": int}]` | Detectar ambos os formatos |
| Modo de jogo ausente | Atributo no `attrid 3009`, não `500` | Corrigir o attrid de busca |
| Talentos como "idx None" | Evento é `SHeroTalentTreeSelectedEvent`, campo é `m_index` | Usar o evento e campo corretos |
| `m_index` não é opção relativa | É índice absoluto no tree (0-20) | Usar `m_index % 3` para opção no tier |
| Heróis sem nome de talento | IDs internos ≠ nomes do replay | Usar `hyperlinkId` como ponte |
| Lookup retorna None após reload | JSON converte int keys → string | Tentar `key` e `str(key)` |
