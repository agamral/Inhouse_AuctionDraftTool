#!/usr/bin/env python3
"""
Heroes of the Storm Replay Parser
==================================
Standalone script — no Firebase, no React, no project dependencies.

INSTALLATION
------------
    pip install -r requirements.txt

USAGE
-----
    python parse_replay.py caminho/para/replay.StormReplay

OUTPUT
------
    resultado.json na mesma pasta deste script.

DEPENDENCIES
------------
    heroprotocol  — decodificador oficial Blizzard para arquivos .StormReplay
    mpyq          — leitor de arquivos MPQ (formato interno do replay)
"""

import sys
import json
import os
import importlib
import importlib.util
import argparse
from pathlib import Path
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# HotS roda a 16 game loops por segundo
GAMELOOPS_PER_SECOND = 16

# Windows FILETIME → Unix timestamp: diferença em intervalos de 100ns
WINDOWS_EPOCH_OFFSET = 116_444_736_000_000_000

# Mapeamento de campos de estatística do tracker para nomes legíveis
STAT_MAP = {
    "SoloKill":            "kills",
    "Deaths":              "deaths",
    "Assists":             "assists",
    "Takedowns":           "takedowns",
    "HeroDamage":          "hero_damage",
    "DamageTaken":         "damage_taken",
    "Healing":             "healing",
    "SelfHealing":         "self_healing",
    "ExperienceContribution": "experience_contribution",
    "MinionDamage":        "minion_damage",
    "StructureDamage":     "structure_damage",
    "Level":               "level",
    "TeamLevel":           "team_level",
    "TimeCCdEnemyHeroes":  "time_cc_enemy",
    "TimeSpentDead":       "time_dead",
    "MercCampCaptures":    "merc_camps",
    "WatchTowerCaptures":  "watchtowers",
    "HighestKillStreak":   "highest_kill_streak",
}

# Tradução de atributo de modo de jogo (atributo 500)
GAME_MODE_MAP = {
    b"HeroLeague":    "Hero League",
    b"TeamLeague":    "Team League",
    b"StormLeague":   "Storm League",
    b"QuickMatch":    "Quick Match",
    b"ARAM":          "Brawl / ARAM",
    b"UnrankedDraft": "Unranked Draft",
    b"Priv":          "Custom Game",
    b"Custom":        "Custom Game",
    b"Amm":           "Quick Match",
}

# Tiers de talentos: índice 0-6 → nível no jogo
TALENT_TIER_LEVELS = [1, 4, 7, 10, 13, 16, 20]


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def decode_str(value):
    """Converte bytes → str; retorna valor original se já for str."""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def safe_get(d, *keys, default=None):
    """Navegação segura em dicionários aninhados."""
    for key in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(key, default)
    return d


def filetime_to_iso(filetime):
    """Converte Windows FILETIME (100ns desde 1601) para ISO 8601 UTC."""
    try:
        unix_ts = (filetime - WINDOWS_EPOCH_OFFSET) / 10_000_000
        return datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Carregamento do protocolo
# ---------------------------------------------------------------------------

def _load_module_from_file(name, filepath):
    """Importa um módulo Python a partir de um caminho de arquivo."""
    spec = importlib.util.spec_from_file_location(name, filepath)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_protocol(archive_header_content):
    """
    Detecta o build do replay no cabeçalho e carrega o módulo de protocolo
    correto usando importlib.util (compatível com Python 3.12+, onde o
    módulo `imp` foi removido).
    """
    try:
        import heroprotocol as _hpkg
        pkg_dir = Path(_hpkg.__file__).parent

        # Os arquivos de protocolo ficam em heroprotocol/versions/
        versions_dir = pkg_dir / "versions"
        search_dir = versions_dir if versions_dir.is_dir() else pkg_dir

        protocol_files = sorted(
            f for f in search_dir.glob("protocol*.py") if f.stem[8:].isdigit()
        )
        if not protocol_files:
            raise RuntimeError("Nenhum arquivo protocol*.py encontrado no pacote heroprotocol.")

        # Carrega o protocolo mais recente para decodificar o cabeçalho
        latest_file = protocol_files[-1]
        latest_build = int(latest_file.stem[8:])
        latest_mod = _load_module_from_file("proto_latest", latest_file)

        header = latest_mod.decode_replay_header(archive_header_content)
        base_build = header["m_version"]["m_baseBuild"]

        # Tenta carregar o protocolo exato para o build do replay
        exact_files = [f for f in protocol_files if int(f.stem[8:]) == base_build]
        if exact_files:
            protocol = _load_module_from_file(f"proto_{base_build}", exact_files[0])
        else:
            # Build mais novo que o protocolo mais recente disponível — usa o mais próximo.
            # Em geral os dados ficam corretos pois a estrutura muda pouco entre builds.
            protocol = latest_mod

        return protocol, base_build

    except Exception as exc:
        raise RuntimeError(
            f"Não foi possível carregar o heroprotocol: {exc}\n"
            "Verifique se rodou:  pip install -r requirements.txt"
        )


# ---------------------------------------------------------------------------
# Resolução de nome canônico do herói (m_hero vem localizado no idioma de
# quem gravou — ex: "Asa da Morte" em pt-BR para "Deathwing"). O front-end
# casa ícones pelo nome em inglês, então expomos "heroIcon" com esse nome.
# ---------------------------------------------------------------------------

def _canonical_hero_name(hero_name):
    try:
        import talent_lookup as _tl
        if _tl.load():
            return _tl.get_canonical_name(hero_name)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Parsing de cada seção do replay
# ---------------------------------------------------------------------------

def parse_details(details, result):
    """Popula match.datetime, match.map e a lista base de jogadores."""
    filetime = details.get("m_timeUTC")
    result["match"]["datetime"] = filetime_to_iso(filetime) if filetime else None
    result["match"]["map"] = decode_str(details.get("m_title", b"")) or None

    for i, p in enumerate(details.get("m_playerList", [])):
        raw_result = p.get("m_result")
        hero_name = decode_str(p.get("m_hero", b""))
        player = {
            "slot":          i,
            "battletag":     decode_str(p.get("m_name", b"")),
            "hero":          hero_name,
            "heroIcon":      _canonical_hero_name(hero_name),
            "team":          (p.get("m_teamId", 0) + 1),  # 0/1 → 1/2
            "result":        "win" if raw_result == 1 else "loss" if raw_result == 2 else None,
            # Estatísticas — preenchidas depois
            "kills":                   None,
            "deaths":                  None,
            "assists":                 None,
            "takedowns":               None,
            "hero_damage":             None,
            "damage_taken":            None,
            "healing":                 None,
            "self_healing":            None,
            "experience_contribution": None,
            "minion_damage":           None,
            "structure_damage":        None,
            "level":                   None,
            "time_dead":               None,
            "time_cc_enemy":           None,
            "merc_camps":              None,
            "watchtowers":             None,
            "highest_kill_streak":     None,
            "talents":                 [],
        }
        result["players"].append(player)


def parse_attributes(attributes, result):
    """Extrai modo de jogo a partir dos atributos do replay (scope 16, attrid 3009)."""
    scopes = attributes.get("scopes", {})
    scope16 = scopes.get(16, {})
    # attrid 3009 = game mode global (Amm=QuickMatch, StormLeague, Priv=Custom, etc.)
    for attr in scope16.get(3009, []):
        raw_val = attr.get("value", b"")
        if raw_val:
            result["match"]["game_mode"] = (
                GAME_MODE_MAP.get(raw_val) or decode_str(raw_val) or None
            )
            return
    # Fallback: attrid 500 em alguns builds mais antigos
    for attr in scope16.get(500, []):
        raw_val = attr.get("value", b"")
        if raw_val and raw_val != b"Humn":
            result["match"]["game_mode"] = (
                GAME_MODE_MAP.get(raw_val) or decode_str(raw_val) or None
            )


_XP_FIXED_SCALE = 4096  # valores fixed-point do heroprotocol ÷ 4096 = valor real

def _build_xp_timeline(events):
    """
    Converte eventos PeriodicXPBreakdown em timeline de XP cumulativo por time.
    Retorna [{t, team1Xp, team2Xp, team1Level, team2Level}].
    """
    def kv_int(lst):
        return {decode_str(i["m_key"]): i["m_value"] for i in (lst or []) if "m_key" in i}

    def kv_fixed(lst):
        return {decode_str(i["m_key"]): i["m_value"] / _XP_FIXED_SCALE for i in (lst or []) if "m_key" in i}

    XP_FIELDS = ["MinionXP", "CreepXP", "StructureXP", "HeroXP", "TrickleXP"]

    per_team = {1: [], 2: []}

    for ev in sorted(events, key=lambda e: e.get("_gameloop", 0)):
        ints   = kv_int(ev.get("m_intData", []))
        fixeds = kv_fixed(ev.get("m_fixedData", []))
        team   = ints.get("Team", 0)
        if team not in (1, 2):
            continue
        level  = ints.get("TeamLevel", 0)
        t_sec  = int(ev.get("_gameloop", 0) / GAMELOOPS_PER_SECOND)
        # PeriodicXPBreakdown já reporta o XP acumulado total desde o início,
        # não o ganho incremental do período — usar diretamente.
        total_xp = sum(fixeds.get(f, 0.0) for f in XP_FIELDS)
        per_team[team].append({"t": t_sec, "xp": int(total_xp), "level": level})

    n = min(len(per_team[1]), len(per_team[2]))
    return [
        {
            "t":           per_team[1][i]["t"],
            "team1Xp":     per_team[1][i]["xp"],
            "team2Xp":     per_team[2][i]["xp"],
            "team1Level":  per_team[1][i]["level"],
            "team2Level":  per_team[2][i]["level"],
        }
        for i in range(n)
    ]


def _build_event_timeline(stat_events, player_id_to_slot, players):
    """
    Gera timeline de eventos de jogo: kills, capturas de acampamento, objetivos.
    Retorna lista de dicts ordenada por tempo de jogo.
    """
    pid_to_info = {}
    for pid, slot in player_id_to_slot.items():
        if 0 <= slot < len(players):
            p = players[slot]
            pid_to_info[pid] = {"hero": p.get("hero"), "heroIcon": p.get("heroIcon"), "team": p.get("team")}

    STAT_SKIP = {
        "PeriodicXPBreakdown", "EndOfGameXPBreakdown", "EndOfGameTimeSpentDead",
        "EndOfGameTalentChoices", "EndOfGameUpVotesCollected", "PlayerInit",
        "PlayerSpawned", "TalentChosen", "GameStart", "GatesOpen",
        "TownStructureInit", "TownStructureDeath", "LootSprayUsed",
        "RegenGlobePickedUp", "LevelUp", "Punisher Killed", "JungleCampInit",
    }

    timeline = []

    for ev in sorted(stat_events, key=lambda e: e.get("_gameloop", 0)):
        name = decode_str(ev.get("m_eventName", b""))
        if name in STAT_SKIP:
            continue

        loop = ev.get("_gameloop", 0)
        t    = int(loop / GAMELOOPS_PER_SECOND)

        ints_raw = ev.get("m_intData")   or []
        fixs_raw = ev.get("m_fixedData") or []
        strs_raw = ev.get("m_stringData") or []

        ints = {decode_str(i["m_key"]): i["m_value"] for i in ints_raw if "m_key" in i}
        fixs = {decode_str(i["m_key"]): i["m_value"] / _XP_FIXED_SCALE for i in fixs_raw if "m_key" in i}
        strs = {decode_str(i["m_key"]): decode_str(i["m_value"]) for i in strs_raw if "m_key" in i}

        if name == "PlayerDeath":
            victim_pid  = ints.get("PlayerID")
            killer_pids = [i["m_value"] for i in ints_raw
                           if decode_str(i.get("m_key", b"")) == "KillingPlayer"]
            victim  = pid_to_info.get(victim_pid) if victim_pid is not None else None
            killers = [pid_to_info[p] for p in killer_pids if p in pid_to_info]
            if victim:
                timeline.append({
                    "t":       t,
                    "type":    "kill",
                    "victim":  {"hero": victim["hero"],  "heroIcon": victim["heroIcon"],  "team": victim["team"]},
                    "killers": [{"hero": k["hero"], "heroIcon": k["heroIcon"], "team": k["team"]} for k in killers],
                })

        elif name == "JungleCampCapture":
            # TeamID está em fixedData como inteiro × 4096
            team = int(round(fixs.get("TeamID", 0)))
            camp_type = strs.get("CampType", "Camp")
            if team in (1, 2):
                timeline.append({
                    "t":        t,
                    "type":     "camp",
                    "team":     team,
                    "campType": camp_type,
                })

        else:
            # Objetivos de mapa — tenta múltiplas chaves usadas por mapas diferentes
            winning = None

            # Infernal Shrine / Dragon Shire / Alterac Pass: time em intData
            for team_key in ("Winning Team", "Team", "CapturingTeam", "Owning Team"):
                v = ints.get(team_key)
                if v is not None and int(v) in (1, 2):
                    winning = int(v)
                    break

            # Braxis Holdout e mapas com barra de progresso em fixedData:
            # TeamOrderProgress=100 → time 1, TeamChaosProgress=100 → time 2
            if winning is None:
                order = fixs.get("TeamOrderProgress", 0)
                chaos = fixs.get("TeamChaosProgress", 0)
                if order >= 100:
                    winning = 1
                elif chaos >= 100:
                    winning = 2

            if winning is not None:
                timeline.append({
                    "t":    t,
                    "type": "objective",
                    "name": name,
                    "team": winning,
                })

    return sorted(timeline, key=lambda e: e["t"])


def parse_tracker_events(tracker_events, result):
    """
    Extrai duração da partida, estatísticas por jogador e mapeamento de IDs.
    """
    players = result["players"]
    game_duration_loops = None

    # player_id (1-based do tracker) → slot (0-based do details)
    player_id_to_slot: dict[int, int] = {}

    # Acumulador de stats: slot → {campo: valor}
    score_stats: dict[int, dict] = {}

    # Coleta todos os SStatGameEvent para XP timeline e event timeline
    all_stat_events: list = []

    for event in tracker_events:
        etype = event.get("_event", "")

        # Mapeamento de IDs de jogadores
        if etype == "NNet.Replay.Tracker.SPlayerSetupEvent":
            pid = event.get("m_playerId")
            sid = event.get("m_slotId")
            if pid is not None and sid is not None:
                player_id_to_slot[pid] = sid

        # Duração: último loop antes de GameEnd
        elif etype in (
            "NNet.Replay.Tracker.SGameEndEvent",
            "NNet.Replay.Tracker.SUnitDiedEvent",
        ):
            loop = event.get("_gameloop")
            if loop and (game_duration_loops is None or loop > game_duration_loops):
                game_duration_loops = loop

        # Todos os eventos de stat (XP + kills + camps + objetivos)
        elif etype == "NNet.Replay.Tracker.SStatGameEvent":
            all_stat_events.append(event)

        # Estatísticas finais
        elif etype == "NNet.Replay.Tracker.SScoreResultEvent":
            loop = event.get("_gameloop")
            if loop:
                game_duration_loops = loop

            for instance in event.get("m_instanceList", []):
                stat_name = decode_str(instance.get("m_name", b""))
                values = instance.get("m_values", [])

                for slot_idx, val_entry in enumerate(values):
                    # val_entry varia por build:
                    #   antigo: [42]               (lista com int)
                    #   novo:   [{'m_value': 42}]  (lista com dict)
                    try:
                        if not (isinstance(val_entry, list) and val_entry):
                            continue
                        inner = val_entry[0]
                        if isinstance(inner, dict):
                            value = inner.get("m_value")
                        elif isinstance(inner, list):
                            value = inner[0]
                        else:
                            value = inner
                        if value is None:
                            continue
                    except (IndexError, TypeError):
                        continue

                    if slot_idx not in score_stats:
                        score_stats[slot_idx] = {}
                    score_stats[slot_idx][stat_name] = value

    # Duração da partida
    if game_duration_loops:
        secs = int(game_duration_loops / GAMELOOPS_PER_SECOND)
        result["match"]["duration_seconds"] = secs
        result["match"]["duration"] = f"{secs // 60}:{secs % 60:02d}"
    else:
        result["match"]["duration_seconds"] = None
        result["match"]["duration"] = None

    # Aplicar estatísticas a cada jogador pelo slot
    for slot_idx, stats in score_stats.items():
        if slot_idx >= len(players):
            continue
        p = players[slot_idx]
        for tracker_key, player_key in STAT_MAP.items():
            val = stats.get(tracker_key)
            if val is not None:
                p[player_key] = val

    # Totais por time
    for team_num in (1, 2):
        key = f"team{team_num}"
        result["teams"][key] = {
            "takedowns": sum(
                (p.get("takedowns") or 0) for p in players if p["team"] == team_num
            ),
            "result": next(
                (p["result"] for p in players if p["team"] == team_num and p["result"]),
                None,
            ),
        }

    # XP timeline (PeriodicXPBreakdown → um ponto por time a cada ~60s)
    xp_events = [e for e in all_stat_events
                 if decode_str(e.get("m_eventName", b"")) == "PeriodicXPBreakdown"]
    result["xpTimeline"]    = _build_xp_timeline(xp_events)
    result["eventTimeline"] = _build_event_timeline(all_stat_events, player_id_to_slot, players)


def parse_game_events(game_events, result):
    """
    Extrai escolhas de talento de cada jogador a partir dos game events.

    O replay registra qual das opções do tier foi escolhida (m_index, 0-based),
    mas não o nome do talento — isso exigiria um dicionário externo (heroes-data).
    """
    players = result["players"]
    talent_counters = [0] * len(players)

    for event in game_events:
        etype = event.get("_event", "")

        # Evento canônico desde builds recentes
        if etype != "NNet.Game.SHeroTalentTreeSelectedEvent":
            # Fallback para nomes alternativos em builds antigos
            if "Talent" not in etype and "talent" not in etype:
                continue

        user_id = safe_get(event, "_userid", "m_userId")
        if user_id is None or user_id >= len(players):
            continue

        tier_index = talent_counters[user_id]

        # m_index = índice absoluto no talent tree completo do herói (0–20+).
        # Cada tier tem tipicamente 3 opções → opção dentro do tier = m_index % 3.
        # m_talentName existe apenas em builds mais antigos.
        abs_index = event.get("m_index")
        if abs_index is None:
            abs_index = event.get("m_talentIndex")

        within_tier = (abs_index % 3) if abs_index is not None else None

        name = None
        icon = None
        description = None
        if event.get("m_talentName"):
            name = decode_str(event["m_talentName"])

        # Tenta lookup no banco de dados de heróis se disponível
        if within_tier is not None:
            try:
                import talent_lookup as _tl
                if _tl.load():
                    hero = players[user_id].get("hero", "")
                    if name is None:
                        name = _tl.get_name(hero, tier_index, within_tier)
                    icon        = _tl.get_icon_url(hero, tier_index, within_tier)
                    description = _tl.get_description(hero, tier_index, within_tier)
            except Exception:
                pass

        talent_entry = {
            "tier":           tier_index,
            "level":          TALENT_TIER_LEVELS[tier_index] if tier_index < len(TALENT_TIER_LEVELS) else None,
            "choice":         within_tier,    # 0=1ª opção, 1=2ª, 2=3ª dentro do tier
            "absolute_index": abs_index,
            "name":           name,
            "icon":           icon,
            "description":    description,
        }
        players[user_id]["talents"].append(talent_entry)
        talent_counters[user_id] += 1


# ---------------------------------------------------------------------------
# Impressão resumida no terminal
# ---------------------------------------------------------------------------

def print_summary(result):
    m = result["match"]
    print("\n" + "=" * 60)
    print(f"  Mapa:      {m.get('map') or 'Desconhecido'}")
    print(f"  Modo:      {m.get('game_mode') or 'Desconhecido'}")
    print(f"  Data:      {m.get('datetime') or 'Desconhecida'}")
    print(f"  Duração:   {m.get('duration') or 'Desconhecida'}")
    print("=" * 60)

    for team_num in (1, 2):
        team_data = result["teams"].get(f"team{team_num}", {})
        print(
            f"\n  Time {team_num} — {(team_data.get('result') or '?').upper()}"
            f"  (Takedowns: {team_data.get('takedowns', 0)})"
        )
        for p in result["players"]:
            if p["team"] != team_num:
                continue
            kda = f"{p.get('kills') or 0}/{p.get('deaths') or 0}/{p.get('assists') or 0}"
            print(f"    {p['hero']:<20} {p['battletag']:<30} K/D/A: {kda}")
            print(
                f"      Dano: {p.get('hero_damage') or 0:>8}  "
                f"Sofrido: {p.get('damage_taken') or 0:>8}  "
                f"Cura: {p.get('healing') or 0:>8}"
            )
            if p["talents"]:
                names = [t.get("name") or f"idx={t.get('index')}" for t in p["talents"]]
                print(f"      Talentos: {', '.join(names)}")
    print()


# ---------------------------------------------------------------------------
# Ponto de entrada
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Parseia um arquivo .StormReplay e salva resultado.json"
    )
    parser.add_argument("replay_path", help="Caminho para o arquivo .StormReplay")
    args = parser.parse_args()

    replay_path = Path(args.replay_path)

    # Validação do arquivo
    if not replay_path.exists():
        print(f"Erro: Arquivo não encontrado: {replay_path}", file=sys.stderr)
        sys.exit(1)
    if not replay_path.is_file():
        print(f"Erro: O caminho não aponta para um arquivo: {replay_path}", file=sys.stderr)
        sys.exit(1)
    if replay_path.suffix.lower() != ".stormreplay":
        print(
            f"Aviso: Extensão inesperada '{replay_path.suffix}' — esperava .StormReplay",
            file=sys.stderr,
        )

    # Verificar dependências antes de qualquer coisa
    try:
        import mpyq  # noqa: F401
    except ImportError:
        print(
            "Erro: 'mpyq' não está instalado.\n"
            "Execute:  pip install -r requirements.txt",
            file=sys.stderr,
        )
        sys.exit(1)
    try:
        import heroprotocol  # noqa: F401
    except ImportError:
        print(
            "Erro: 'heroprotocol' não está instalado.\n"
            "Execute:  pip install -r requirements.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    import mpyq

    # Abrir o arquivo MPQ
    print(f"Abrindo replay: {replay_path}")
    try:
        archive = mpyq.MPQArchive(str(replay_path))
    except Exception as exc:
        print(f"Erro: Não foi possível abrir o arquivo de replay: {exc}", file=sys.stderr)
        sys.exit(1)

    # Carregar protocolo correto para o build do replay
    try:
        header_content = archive.header["user_data_header"]["content"]
        protocol, base_build = load_protocol(header_content)
        print(f"Protocolo detectado: build {base_build}")
    except RuntimeError as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        sys.exit(1)

    # Estrutura de resultado
    result = {
        "match": {
            "build":          base_build,
            "datetime":       None,
            "map":            None,
            "game_mode":      None,
            "duration":       None,
            "duration_seconds": None,
        },
        "teams": {
            "team1": {"result": None, "takedowns": 0},
            "team2": {"result": None, "takedowns": 0},
        },
        "players": [],
    }

    # --- replay.details ---
    print("Lendo detalhes dos jogadores...")
    try:
        raw = archive.read_file("replay.details")
        details = protocol.decode_replay_details(raw)
        parse_details(details, result)
    except Exception as exc:
        print(f"Aviso: Não foi possível ler replay.details: {exc}", file=sys.stderr)

    # --- replay.attributes.events ---
    print("Lendo atributos (modo de jogo)...")
    try:
        raw = archive.read_file("replay.attributes.events")
        attributes = protocol.decode_replay_attributes_events(raw)
        parse_attributes(attributes, result)
    except Exception as exc:
        print(f"Aviso: Não foi possível ler replay.attributes.events: {exc}", file=sys.stderr)

    # --- replay.tracker.events ---
    print("Lendo eventos de rastreamento (estatísticas)...")
    try:
        raw = archive.read_file("replay.tracker.events")
        tracker_events = list(protocol.decode_replay_tracker_events(raw))
        parse_tracker_events(tracker_events, result)
    except Exception as exc:
        print(f"Aviso: Não foi possível ler replay.tracker.events: {exc}", file=sys.stderr)

    # --- replay.game.events ---
    print("Lendo eventos de jogo (talentos)...")
    try:
        raw = archive.read_file("replay.game.events")
        game_events = list(protocol.decode_replay_game_events(raw))
        parse_game_events(game_events, result)
    except Exception as exc:
        print(f"Aviso: Não foi possível ler replay.game.events: {exc}", file=sys.stderr)

    # Salvar JSON
    output_path = Path(__file__).parent / "resultado.json"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2, default=str)
        print(f"\nResultado salvo em: {output_path}")
    except Exception as exc:
        print(f"Erro ao salvar resultado.json: {exc}", file=sys.stderr)
        sys.exit(1)

    print_summary(result)


if __name__ == "__main__":
    main()
