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
    print(f"Bot online: {bot.user} (ID: {bot.user.id}) — {len(bot.guilds)} servidor(es)")
    for guild in bot.guilds:
        try:
            bot.tree.copy_global_to(guild=guild)
            synced = await bot.tree.sync(guild=guild)
            print(f"  Sincronizado em '{guild.name}': {len(synced)} comandos")
        except Exception as e:
            print(f"  Erro ao sincronizar em '{guild.name}': {e}")


@bot.event
async def on_guild_join(guild: discord.Guild):
    try:
        bot.tree.copy_global_to(guild=guild)
        await bot.tree.sync(guild=guild)
        print(f"Novo servidor '{guild.name}' — comandos sincronizados.")
    except Exception as e:
        print(f"Erro ao sincronizar em novo servidor '{guild.name}': {e}")


@bot.command()
@commands.has_permissions(administrator=True)
async def diag(ctx):
    me = ctx.guild.me
    perms = me.guild_permissions
    top = me.top_role
    lines = [
        f"**manage_roles:**    `{perms.manage_roles}`",
        f"**manage_channels:** `{perms.manage_channels}`",
        f"**administrator:**   `{perms.administrator}`",
        f"**send_messages:**   `{perms.send_messages}`",
        f"**view_channel:**    `{perms.view_channel}`",
        f"**top_role:**        `{top.name}` (posição {top.position})",
        f"**permissions int:** `{perms.value}`",
    ]
    await ctx.send("🔍 **Diagnóstico de permissões do bot:**\n" + "\n".join(lines))


async def main():
    async with bot:
        await bot.load_extension("cogs.draft")
        await bot.load_extension("cogs.campeonato")
        await bot.start(TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
