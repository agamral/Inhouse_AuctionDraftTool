import discord
from discord.ext import commands

# TODO: conectar Firebase — listener de eventos para anúncios automáticos


class AnnouncementsCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def announce(self, guild_id: int, channel_id: int, message: str):
        guild = self.bot.get_guild(guild_id)
        if not guild:
            return
        channel = guild.get_channel(channel_id)
        if channel:
            await channel.send(message)


async def setup(bot):
    await bot.add_cog(AnnouncementsCog(bot))
