"""
Módulo de lookup de nomes de talentos usando dados do HeroesToolChest/heroes-data.

Estrutura dos dados (por versão):
  heroesdata/{version}/data/herodata_{build}_localized.json  — árvore de talentos
  heroesdata/{version}/gamestrings/gamestrings_{build}_enus.json — nomes em inglês

Os dados são baixados uma vez e cacheados localmente em heroes_data_cache.json.
"""

import json
import re
import urllib.request
from pathlib import Path

CACHE_FILE = Path(__file__).parent / "heroes_data_cache.json"

GITHUB_API = "https://api.github.com/repos/HeroesToolChest/heroes-data/contents/heroesdata"
RAW_BASE   = "https://raw.githubusercontent.com/HeroesToolChest/heroes-data/master/heroesdata"

# Locales adicionais para indexar nomes de heróis localizados (m_hero do replay
# vem no idioma de quem gravou). Cobre os idiomas usados pela comunidade
# (PT, ES) e os mais comuns na cena competitiva ocidental.
LOCALES = ["ptbr", "eses", "esmx", "frfr", "dede", "itit", "plpl", "ruru"]

# Tier label do herodata → índice 0-based
TIER_TO_INDEX = {
    "level1":  0,
    "level4":  1,
    "level7":  2,
    "level10": 3,
    "level13": 4,
    "level16": 5,
    "level20": 6,
}

_db: dict | None = None            # {internal_id: {tier_index: {choice: name}}}
_hyperlink_idx: dict | None = None # {hyperlinkId (replay name) → internal_id}
_canonical_name: dict | None = None # {internal_id → hyperlinkId (nome canônico em inglês)}
_version: str | None = None


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _fetch_json(url: str):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "hots-replay-parser/1.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Download e construção do cache
# ---------------------------------------------------------------------------

def download(progress_fn=None) -> tuple[str, int]:
    """
    Baixa herodata + gamestrings da versão mais recente disponível.
    Retorna (version_string, hero_count).
    """
    global _db, _hyperlink_idx, _canonical_name, _version

    if progress_fn:
        progress_fn("Buscando versões disponíveis no HeroesToolChest...")

    entries  = _fetch_json(GITHUB_API)
    versions = sorted(
        [e["name"] for e in entries if e.get("type") == "dir"],
        key=lambda v: [int(x) for x in re.findall(r"\d+", v)],
    )
    if not versions:
        raise RuntimeError("Nenhuma versão encontrada no repositório heroes-data.")

    latest = versions[-1]
    build  = re.findall(r"\d+", latest)[-1]   # ex: "97039"

    # --- Herodata ---
    if progress_fn:
        progress_fn(f"Baixando herodata  (versão {latest}, build {build})...")

    herodata_url = f"{RAW_BASE}/{latest}/data/herodata_{build}_localized.json"
    herodata = _fetch_json(herodata_url)

    # --- Gamestrings (inglês) ---
    if progress_fn:
        progress_fn("Baixando gamestrings (enus)...")

    gs_url = f"{RAW_BASE}/{latest}/gamestrings/gamestrings_{build}_enus.json"
    gs = _fetch_json(gs_url)

    # Mapeamento nameId → nome de exibição
    # Chave no JSON: "{nameId}|{buttonId}|{abilityType}|{isPassive}" → nome
    raw_names = gs.get("gamestrings", {}).get("abiltalent", {}).get("name", {})
    name_by_id: dict[str, str] = {}
    for key, display_name in raw_names.items():
        name_id = key.split("|")[0]
        # Mantém o nome mais curto em caso de duplicata (evita "Cancel X" etc.)
        if name_id not in name_by_id or len(display_name) < len(name_by_id[name_id]):
            name_by_id[name_id] = display_name

    # --- Construir DB ---
    if progress_fn:
        progress_fn(f"Processando {len(herodata)} heróis...")

    db, hyperlink_idx, canonical_name = _build_db(herodata, name_by_id)

    # --- Nomes de herói localizados ---
    # m_hero no replay vem no idioma do cliente de quem gravou (ex: "Asa da Morte"
    # para Deathwing em pt-BR). Baixa gamestrings de outros locales e monta um
    # índice reverso {nome_localizado: internal_id} para casar com o internal_id.
    if progress_fn:
        progress_fn("Baixando nomes de heróis localizados...")

    internal_ids = set(db.keys()) | set(hyperlink_idx.values())
    for locale in LOCALES:
        try:
            loc_gs = _fetch_json(f"{RAW_BASE}/{latest}/gamestrings/gamestrings_{build}_{locale}.json")
        except Exception:
            continue
        unit_names = loc_gs.get("gamestrings", {}).get("unit", {}).get("name", {})
        for internal_id, localized_name in unit_names.items():
            if internal_id in internal_ids and localized_name not in hyperlink_idx:
                hyperlink_idx[localized_name] = internal_id

    cache = {
        "version": latest, "db": db, "hyperlink_idx": hyperlink_idx,
        "canonical_name": canonical_name,
    }
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))

    _db            = db
    _hyperlink_idx = hyperlink_idx
    _canonical_name = canonical_name
    _version       = latest
    return latest, len(db)


def _build_db(herodata: dict, name_by_id: dict) -> tuple[dict, dict, dict]:
    """
    Constrói:
      db             = {internal_id: {tier_index: {choice_0based: {"name", "icon"}}}}
      hyperlink_idx  = {hyperlinkId: internal_id}   ← usado para mapear nomes do replay
      canonical_name = {internal_id: hyperlinkId}   ← nome canônico em inglês do herói

    "icon" é o nome do arquivo PNG (ex: "storm_ui_icon_abathur_spikeburst.png"),
    servido pelo repositório heroes-images (ver ICON_BASE_URL).
    """
    db: dict = {}
    hyperlink_idx: dict = {}
    canonical_name: dict = {}

    for hero_id, hero in herodata.items():
        # hyperlinkId é o nome que aparece no replay (ex: "Brightwing", "Li-Ming")
        hl_id = hero.get("hyperlinkId", "")
        if hl_id:
            hyperlink_idx[hl_id] = hero_id
            canonical_name[hero_id] = hl_id

        talents_by_tier = hero.get("talents", {})
        hero_db: dict = {}
        for tier_label, talent_list in talents_by_tier.items():
            tier_idx = TIER_TO_INDEX.get(tier_label.lower())
            if tier_idx is None:
                continue
            for talent in talent_list:
                sort    = talent.get("sort", 1)
                choice  = sort - 1                             # 0-based
                name_id = talent.get("nameId", "")
                name    = name_by_id.get(name_id) or name_id  # fallback: nameId
                icon    = talent.get("icon") or None
                hero_db.setdefault(tier_idx, {})[choice] = {"name": name, "icon": icon}
        if hero_db:
            db[hero_id] = hero_db

    return db, hyperlink_idx, canonical_name


# ---------------------------------------------------------------------------
# Carregamento do cache
# ---------------------------------------------------------------------------

def load() -> bool:
    """Carrega o cache do disco em memória. Retorna True se disponível."""
    global _db, _hyperlink_idx, _canonical_name, _version
    if _db is not None:
        return True
    if not CACHE_FILE.exists():
        return False
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)
        _db             = cache["db"]
        _hyperlink_idx  = cache.get("hyperlink_idx", {})
        _canonical_name = cache.get("canonical_name", {})
        _version        = cache.get("version", "?")
        return True
    except Exception:
        return False


def is_available() -> bool:
    return CACHE_FILE.exists()


def get_version() -> str | None:
    return _version


# ---------------------------------------------------------------------------
# Lookup
# ---------------------------------------------------------------------------

def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


# Base do repositório de imagens HeroesToolChest — servir ícones de talento
ICON_BASE_URL = "https://raw.githubusercontent.com/HeroesToolChest/heroes-images/master/heroesimages/abilitytalents"


def _resolve_internal_id(hero_name: str) -> str | None:
    """Resolve o hero_name do replay (em qualquer locale) para o internal_id."""
    if _db is None or not hero_name:
        return None

    # Tentativa 1: já é o internal_id
    if hero_name in _db:
        return hero_name

    # Tentativa 2: hyperlinkId ou nome localizado → internal_id
    if _hyperlink_idx:
        internal = _hyperlink_idx.get(hero_name)
        if internal:
            return internal

    # Tentativa 3: match normalizado (remove espaços, apóstrofos, pontos)
    target = _normalize(hero_name)
    for hl_name, internal in (_hyperlink_idx or {}).items():
        if _normalize(hl_name) == target:
            return internal
    for key in _db:
        if _normalize(key) == target:
            return key

    return None


def _hero_db(hero_name: str) -> dict | None:
    """Resolve o hero_name do replay para a sub-árvore de talentos no DB."""
    internal = _resolve_internal_id(hero_name)
    return _db.get(internal) if internal else None


def get_canonical_name(hero_name: str) -> str | None:
    """
    Resolve o hero_name do replay (em qualquer locale, ex: "Asa da Morte")
    para o nome canônico em inglês (hyperlinkId, ex: "Deathwing"), usado
    para casar com os assets de ícone do site.
    """
    internal = _resolve_internal_id(hero_name)
    if internal is None:
        return None
    return (_canonical_name or {}).get(internal)


def _entry(hero_name: str, tier_index: int, choice: int) -> dict | None:
    """Retorna {"name", "icon"} do talento, ou None se não encontrado."""
    hero_db = _hero_db(hero_name)
    if hero_db is None:
        return None
    # JSON serializa chaves int → str, então testamos ambos os tipos
    tier_db = hero_db.get(tier_index) or hero_db.get(str(tier_index), {})
    entry = tier_db.get(choice) or tier_db.get(str(choice))
    # Compat: caches antigos guardavam o nome direto como string
    if isinstance(entry, str):
        return {"name": entry, "icon": None}
    return entry


def get_name(hero_name: str, tier_index: int, choice: int) -> str | None:
    """
    Retorna o nome do talento ou None se não encontrado.

    Args:
        hero_name:  nome do herói como vem do replay (ex: "Li Li", "Sgt. Hammer")
        tier_index: 0-based (0=Lv1 … 6=Lv20)
        choice:     0-based dentro do tier (0=1ª opção, 1=2ª, 2=3ª)
    """
    entry = _entry(hero_name, tier_index, choice)
    return entry.get("name") if entry else None


def get_icon_url(hero_name: str, tier_index: int, choice: int) -> str | None:
    """Retorna a URL completa do ícone do talento, ou None se não encontrado."""
    entry = _entry(hero_name, tier_index, choice)
    icon  = entry.get("icon") if entry else None
    return f"{ICON_BASE_URL}/{icon}" if icon else None
