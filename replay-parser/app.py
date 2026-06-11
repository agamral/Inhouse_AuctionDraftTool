"""
Replay Parser API — Heroes of the Storm
========================================
Endpoint Flask para parsear arquivos .StormReplay e devolver JSON.

Deploy: Render (free tier)
  Build command : pip install -r requirements.txt
  Start command : gunicorn app:app

Variáveis de ambiente:
  PORT               — porta HTTP (injetada pelo Render automaticamente)
  ALLOWED_ORIGIN     — origin permitida no CORS (opcional; padrão: *)
"""

import os
import sys
import json
import tempfile
import threading
import traceback
from pathlib import Path

# replay.game.events pode ter centenas de milhares de eventos em partidas
# muito longas — decodificar isso em Python puro pode estourar o timeout do
# gunicorn no Render free tier. Limitamos esse passo (usado só para talentos)
# a um tempo máximo; se estourar, o resto do resultado ainda é devolvido.
GAME_EVENTS_TIMEOUT = 45  # segundos

from flask import Flask, request, jsonify
from flask_cors import CORS

# Garante que parse_replay e talent_lookup sejam encontrados neste diretório
sys.path.insert(0, str(Path(__file__).parent))

app = Flask(__name__)

# CORS — permite todas as origens (free tier, uso interno)
CORS(app)

@app.after_request
def ensure_cors(response):
    """Garante CORS em todas as respostas, incluindo erros 4xx/5xx."""
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.route("/", methods=["OPTIONS"])
@app.route("/parse", methods=["OPTIONS"])
def handle_preflight():
    return "", 204


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_parse(filepath: str) -> dict:
    """
    Roda o pipeline completo de parsing em um arquivo .StormReplay.
    Retorna o dicionário de resultado no mesmo formato de resultado.json.
    """
    import mpyq
    from parse_replay import (
        load_protocol,
        parse_details,
        parse_attributes,
        parse_tracker_events,
        parse_game_events,
    )

    archive = mpyq.MPQArchive(filepath)
    header_content = archive.header["user_data_header"]["content"]
    protocol, base_build = load_protocol(header_content)

    result = {
        "match": {
            "build":            base_build,
            "datetime":         None,
            "map":              None,
            "game_mode":        None,
            "duration":         None,
            "duration_seconds": None,
        },
        "teams": {
            "team1": {"result": None, "takedowns": 0},
            "team2": {"result": None, "takedowns": 0},
        },
        "players": [],
    }

    sections = [
        ("replay.details",           protocol.decode_replay_details,           parse_details),
        ("replay.attributes.events", protocol.decode_replay_attributes_events, parse_attributes),
    ]
    for filename, decoder, handler in sections:
        try:
            raw = archive.read_file(filename)
            data = decoder(raw)
            handler(data, result)
        except Exception as exc:
            app.logger.warning("Aviso ao ler %s: %s", filename, exc)

    # tracker.events e game.events retornam generators — materializar antes de passar
    try:
        raw    = archive.read_file("replay.tracker.events")
        events = list(protocol.decode_replay_tracker_events(raw))
        parse_tracker_events(events, result)
    except Exception as exc:
        app.logger.warning("Aviso ao ler replay.tracker.events: %s", exc)

    # replay.game.events (talentos) — em partidas muito longas isso pode ter
    # centenas de milhares de eventos e demorar demais; roda com limite de
    # tempo numa thread separada para não travar a resposta inteira.
    try:
        raw = archive.read_file("replay.game.events")
        decoded = {}

        def _decode_game_events():
            decoded["events"] = list(protocol.decode_replay_game_events(raw))

        t = threading.Thread(target=_decode_game_events, daemon=True)
        t.start()
        t.join(GAME_EVENTS_TIMEOUT)
        if "events" in decoded:
            parse_game_events(decoded["events"], result)
        else:
            app.logger.warning(
                "replay.game.events demorou mais de %ss — talentos não disponíveis",
                GAME_EVENTS_TIMEOUT,
            )
    except Exception as exc:
        app.logger.warning("Aviso ao ler replay.game.events: %s", exc)

    result.pop("_user_id_to_slot", None)
    return result


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    """Healthcheck simples para o Render saber que o serviço está vivo."""
    return jsonify({"status": "ok"})


@app.route("/parse", methods=["POST"])
def parse():
    """
    Recebe um arquivo .StormReplay via multipart/form-data (campo "file")
    e devolve o JSON com as estatísticas da partida.

    Retorno de sucesso (200):
      { match, teams, players }

    Retorno de erro (400/500):
      { error: string, traceback?: string }
    """
    if "file" not in request.files:
        return jsonify({"error": "Campo 'file' não encontrado. Envie o replay como multipart/form-data."}), 400

    upload = request.files["file"]
    if not upload.filename.lower().endswith(".stormreplay"):
        return jsonify({"error": "O arquivo deve ter extensão .StormReplay"}), 400

    # Salva em arquivo temporário (mpyq precisa de um caminho de arquivo)
    suffix = ".StormReplay"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        upload.save(tmp_path)

    try:
        result = _run_parse(tmp_path)
        return jsonify(result)
    except Exception as exc:
        app.logger.error("Erro ao parsear replay: %s", exc)
        return jsonify({
            "error":     str(exc),
            "traceback": traceback.format_exc(),
        }), 500
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Entrypoint local
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
