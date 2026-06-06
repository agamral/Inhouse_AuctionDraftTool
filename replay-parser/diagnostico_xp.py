#!/usr/bin/env python3
"""
Diagnóstico de eventos de XP no replay.
Imprime a estrutura dos primeiros SPlayerStatsEvent encontrados.

USO:
    python diagnostico_xp.py caminho/para/replay.StormReplay
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mpyq
from parse_replay import load_protocol

def main():
    if len(sys.argv) < 2:
        print("Uso: python diagnostico_xp.py replay.StormReplay")
        sys.exit(1)

    path = sys.argv[1]
    archive = mpyq.MPQArchive(path)
    header_content = archive.header["user_data_header"]["content"]
    protocol, build = load_protocol(header_content)
    print(f"Build: {build}\n")

    raw = archive.read_file("replay.tracker.events")
    events = list(protocol.decode_replay_tracker_events(raw))

    # Conta tipos de eventos
    from collections import Counter
    tipos = Counter(e.get("_event", "?") for e in events)
    print("=== Tipos de eventos no tracker ===")
    for tipo, count in sorted(tipos.items(), key=lambda x: -x[1]):
        print(f"  {count:5d}x  {tipo}")
    print()

    # ── SStatGameEvent ────────────────────────────────────────────────────────
    stat_events = [e for e in events if e.get("_event") == "NNet.Replay.Tracker.SStatGameEvent"]
    print(f"=== SStatGameEvent: {len(stat_events)} eventos encontrados ===")
    if not stat_events:
        print("  (nenhum)")
    else:
        # Tipos de m_eventName distintos
        from collections import Counter
        nomes = Counter(
            e.get("m_eventName", b"?") if not isinstance(e.get("m_eventName"), str)
            else e.get("m_eventName", "?")
            for e in stat_events
        )
        print("\nSubtipos (m_eventName):")
        for nome, cnt in sorted(nomes.items(), key=lambda x: -x[1]):
            nome_str = nome.decode() if isinstance(nome, bytes) else nome
            print(f"  {cnt:5d}x  {nome_str}")

        # Primeiros 3 eventos de cada subtipo relevante (XP/Level)
        xp_keywords = ["xp", "level", "exp", "talent", "team"]
        seen_types = set()
        print("\n--- Primeiros eventos por subtipo ---")
        for ev in stat_events:
            nome = ev.get("m_eventName", b"")
            nome_str = (nome.decode() if isinstance(nome, bytes) else nome).lower()
            if nome_str in seen_types:
                continue
            if any(k in nome_str for k in xp_keywords):
                seen_types.add(nome_str)
                loop = ev.get("_gameloop", 0)
                secs = loop // 16
                print(f"\n  [{nome_str}]  loop={loop}  t={secs//60}:{secs%60:02d}")
                data = ev.get("m_data", ev)
                for k, v in ev.items():
                    if k.startswith("_"):
                        continue
                    print(f"    {k}: {repr(v)[:200]}")

        # Um evento completo bruto para ver todos os campos
        print("\n=== Primeiro SStatGameEvent completo (raw) ===")
        ev = stat_events[0]
        for k, v in ev.items():
            print(f"  {k}: {repr(v)[:200]}")

if __name__ == "__main__":
    main()
