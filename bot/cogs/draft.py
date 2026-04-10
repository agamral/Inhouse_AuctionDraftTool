import os
import discord
from discord.ext import commands
from discord import app_commands

# TODO: conectar Firebase — listener real em /draft/{sessionId}

CHANNEL_ID = int(os.getenv("DISCORD_CHANNEL_ID", "0"))


class DraftCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="inscritos", description="Mostra resumo dos jogadores inscritos")
    async def inscritos(self, interaction: discord.Interaction):
        # TODO: buscar /players do Firebase
        await interaction.response.send_message(
            "📋 **Inscritos** — Em breve (Firebase não conectado ainda)",
            ephemeral=True,
        )

    async def post_buy(self, channel, capitao: str, player: str, price: int):
        await channel.send(
            f"✅ **COMPRA:** {capitao} comprou **{player}** por **{price}** moedas. "
            f"Novo preço: **{price + 1}**"
        )

    async def post_steal(self, channel, capitao: str, player: str, from_capitao: str, price: int, refund: int):
        await channel.send(
            f"⚔️ **ROUBO:** {capitao} **ROUBOU** {player} de {from_capitao} por **{price}** moedas! "
            f"{from_capitao} recebe **{refund}** de volta."
        )

    async def post_turn(self, channel, capitao: str, coins: int):
        await channel.send(f"🔔 **TURNO:** Vez de **{capitao}** — {coins} moedas disponíveis")

    async def post_end(self, channel, teams: list):
        teams_str = " | ".join([f"{t['emoji']} {t['nome']}" for t in teams])
        await channel.send(f"🏁 **FIM:** Draft encerrado! Times formados: {teams_str}")


async def setup(bot):
    await bot.add_cog(DraftCog(bot))
