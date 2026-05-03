import os
import json
import asyncio
import time
import firebase_admin
from firebase_admin import credentials, db
import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv

load_dotenv()

TOKEN                = os.getenv("DISCORD_TOKEN")
FIREBASE_CRED_JSON   = os.getenv("FIREBASE_CRED_JSON", "")
FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "")
GOLD = 0xC9A84C

# ── Firebase init ──────────────────────────────────────────────────────────────
try:
    cred = credentials.Certificate(json.loads(FIREBASE_CRED_JSON))
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DATABASE_URL})
    print("Firebase inicializado.")
except Exception as e:
    print(f"ERRO ao inicializar Firebase: {e}")

# ── Bot ────────────────────────────────────────────────────────────────────────
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


# ── /setup — vincula o servidor a um campeonato via token ──────────────────────
@bot.tree.command(name="setup", description="Vincula este servidor a um campeonato da Copa Inhouse")
@app_commands.describe(token="Token gerado no painel admin do site")
@app_commands.checks.has_permissions(manage_channels=True)
async def cmd_setup(interaction: discord.Interaction, token: str):
    await interaction.response.defer(ephemeral=True)
    try:
        campeonatos = db.reference("/campeonatos").get() or {}
        camp_id     = None
        camp_nome   = None

        # Procura qual campeonato tem este token
        for cid, camp in campeonatos.items():
            st = camp.get("setupToken")
            if not isinstance(st, dict):
                continue
            if st.get("token") != token:
                continue
            if st.get("expiraEm", 0) < int(time.time() * 1000):
                await interaction.followup.send("❌ Token expirado. Gere um novo no painel admin.", ephemeral=True)
                return
            camp_id   = cid
            camp_nome = camp.get("info", {}).get("nome", cid)
            break

        if not camp_id:
            await interaction.followup.send("❌ Token inválido ou não encontrado.", ephemeral=True)
            return

        gid = interaction.guild_id

        # Salva o vínculo guild → campeonato
        db.reference(f"/botGuilds/{gid}").set({
            "campeonatoId": camp_id,
            "linkedAt":     int(time.time() * 1000),
            "guildName":    interaction.guild.name,
        })

        # Marca vínculo no campeonato (para exibição no site)
        db.reference(f"/campeonatos/{camp_id}/config/botCanais/{gid}/vinculo").set(True)

        # Apaga o token (uso único)
        db.reference(f"/campeonatos/{camp_id}/setupToken").delete()

        # Notifica os cogs para iniciar listeners para este campeonato
        for cog in bot.cogs.values():
            if hasattr(cog, "iniciar_listeners"):
                await cog.iniciar_listeners(camp_id)

        embed = discord.Embed(
            title="✅  Servidor vinculado!",
            description=f"Este servidor está agora conectado ao campeonato **{camp_nome}**.",
            color=GOLD,
        )
        embed.add_field(
            name="Próximo passo",
            value="Use `/setup-all` para criar os canais de notificação automaticamente.",
            inline=False,
        )
        embed.set_footer(text=f"ID do campeonato: {camp_id}")
        await interaction.followup.send(embed=embed, ephemeral=True)

    except Exception as e:
        await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)


@cmd_setup.error
async def cmd_setup_error(interaction: discord.Interaction, error):
    if isinstance(error, app_commands.MissingPermissions):
        await interaction.response.send_message(
            "❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.",
            ephemeral=True,
        )


# ── Diagnóstico ────────────────────────────────────────────────────────────────
@bot.command()
@commands.has_permissions(administrator=True)
async def diag(ctx):
    me = ctx.guild.me
    perms = me.guild_permissions
    top = me.top_role
    camp_id = None
    try:
        data = db.reference(f"/botGuilds/{ctx.guild.id}").get()
        camp_id = data.get("campeonatoId") if isinstance(data, dict) else None
    except Exception:
        pass

    lines = [
        f"**manage_roles:**    `{perms.manage_roles}`",
        f"**manage_channels:** `{perms.manage_channels}`",
        f"**administrator:**   `{perms.administrator}`",
        f"**send_messages:**   `{perms.send_messages}`",
        f"**view_channel:**    `{perms.view_channel}`",
        f"**top_role:**        `{top.name}` (posição {top.position})",
        f"**campeonatoId:**    `{camp_id or 'não vinculado — use /setup'}`",
    ]
    await ctx.send("🔍 **Diagnóstico do bot:**\n" + "\n".join(lines))


async def main():
    async with bot:
        await bot.load_extension("cogs.draft")
        await bot.load_extension("cogs.campeonato")
        await bot.start(TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
