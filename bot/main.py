import os
import json
import asyncio
import firebase_admin
from firebase_admin import credentials, db
import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

TOKEN                = os.getenv("DISCORD_TOKEN")
FIREBASE_CRED_JSON   = os.getenv("FIREBASE_CRED_JSON", "")
FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "")

# ── Firebase init ─────────────────────────────────────────────
try:
    cred = credentials.Certificate(json.loads(FIREBASE_CRED_JSON))
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DATABASE_URL})
    print("Firebase inicializado.")
except Exception as e:
    print(f"ERRO ao inicializar Firebase: {e}")

# ── Bot ───────────────────────────────────────────────────────
intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"Bot online: {bot.user} (ID: {bot.user.id})")
    try:
        synced = await bot.tree.sync()
        print(f"Slash commands sincronizados: {len(synced)}")
    except Exception as e:
        print(f"Erro ao sincronizar comandos: {e}")


async def main():
    async with bot:
        await bot.load_extension("cogs.draft")
        await bot.load_extension("cogs.campeonato")
        await bot.start(TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
