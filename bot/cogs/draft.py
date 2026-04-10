import os
import asyncio
import time
import requests
import discord
from discord.ext import commands
from discord import app_commands
from firebase_admin import db

SHEETS_URL = os.getenv("SHEETS_WEBAPP_URL", "")
GOLD       = 0xC9A84C
CONFIG_REF = "/botConfig"   # nó no Firebase onde salvamos guild_id → channel_id


def hex_to_int(color: str) -> int:
    try:
        return int(color.lstrip("#"), 16)
    except Exception:
        return GOLD


# ── Helpers Firebase ──────────────────────────────────────────
def save_channel(guild_id: int, channel_id: int):
    db.reference(f"{CONFIG_REF}/{guild_id}/channel_id").set(channel_id)

def load_channel(guild_id: int) -> int | None:
    val = db.reference(f"{CONFIG_REF}/{guild_id}/channel_id").get()
    return int(val) if val else None


class DraftCog(commands.Cog):
    def __init__(self, bot):
        self.bot              = bot
        self._loop            = None
        self._boot_ts         = 0
        self._last_action_ts  = 0
        self._last_status     = None
        self._listeners       = []

    # ── on_ready ──────────────────────────────────────────────
    @commands.Cog.listener()
    async def on_ready(self):
        if self._listeners:
            return

        self._loop    = asyncio.get_event_loop()
        self._boot_ts = int(time.time() * 1000)

        try:
            la = db.reference("/draftSession/state/lastAction").listen(self._on_last_action)
            st = db.reference("/draftSession/state/status").listen(self._on_status)
            self._listeners = [la, st]
            print("DraftCog: listeners Firebase ativos.")
        except Exception as e:
            print(f"DraftCog: erro ao registrar listeners — {e}")

    # ── Firebase callbacks ────────────────────────────────────
    def _on_last_action(self, event):
        if not isinstance(event.data, dict):
            return
        asyncio.run_coroutine_threadsafe(
            self._handle_action(event.data), self._loop
        )

    def _on_status(self, event):
        if not isinstance(event.data, str):
            return
        asyncio.run_coroutine_threadsafe(
            self._handle_status(event.data), self._loop
        )

    # ── Pega todos os canais configurados ─────────────────────
    async def _all_channels(self):
        """Retorna lista de canais configurados via /setup em todos os servidores."""
        channels = []
        try:
            config = db.reference(CONFIG_REF).get() or {}
            for guild_id_str, data in config.items():
                channel_id = data.get("channel_id")
                if channel_id:
                    ch = self.bot.get_channel(int(channel_id))
                    if ch:
                        channels.append(ch)
        except Exception as e:
            print(f"DraftCog: erro ao carregar canais configurados — {e}")
        return channels

    # ── Handlers ──────────────────────────────────────────────
    async def _handle_action(self, action: dict):
        ts = action.get("ts", 0)
        if ts <= self._boot_ts or ts <= self._last_action_ts:
            return
        self._last_action_ts = ts

        channels = await self._all_channels()
        if not channels:
            print("DraftCog: nenhum canal configurado. Use /setup num canal do servidor.")
            return

        kind       = action.get("type")
        team_color = hex_to_int(action.get("byTeamCor", ""))
        by_emoji   = action.get("byTeamEmoji", "")
        by_nome    = action.get("byTeamNome", "—")
        player     = action.get("playerDiscord", "—")
        elo        = action.get("playerElo", "—")
        role       = action.get("playerRole", "—")
        preco      = action.get("preco", 0)

        if kind == "buy":
            embed = discord.Embed(
                title=f"✅  {by_emoji} {by_nome} comprou um jogador",
                color=team_color,
            )
            embed.add_field(name="Jogador",    value=f"**{player}**",   inline=True)
            embed.add_field(name="Elo",        value=elo,               inline=True)
            embed.add_field(name="Função",     value=role,              inline=True)
            embed.add_field(name="Pago",       value=f"🪙 {preco}",     inline=True)
            embed.add_field(name="Novo preço", value=f"🪙 {preco + 1}", inline=True)

        elif kind == "steal":
            from_emoji = action.get("fromTeamEmoji", "")
            from_nome  = action.get("fromTeamNome", "—")
            from_id    = action.get("fromTeamId")
            refund     = 0
            if from_id:
                try:
                    player_id = action.get("playerId", "")
                    entry = db.reference(
                        f"/draftSession/captains/{from_id}/roster/{player_id}"
                    ).get()
                    if isinstance(entry, dict):
                        refund = entry.get("preco", 0)
                except Exception:
                    pass

            embed = discord.Embed(
                title=f"⚔️  {by_emoji} {by_nome} ROUBOU um jogador!",
                color=team_color,
            )
            embed.add_field(name="Jogador",        value=f"**{player}**",             inline=True)
            embed.add_field(name="Elo",            value=elo,                         inline=True)
            embed.add_field(name="Função",         value=role,                        inline=True)
            embed.add_field(name="Preço do roubo", value=f"🪙 {preco}",               inline=True)
            embed.add_field(name="Roubado de",     value=f"{from_emoji} {from_nome}", inline=True)
            if refund:
                embed.add_field(name="Reembolso", value=f"🪙 {refund} → {from_emoji} {from_nome}", inline=False)
            embed.set_footer(text=f"{from_emoji} {from_nome} recebe turno extra!")
        else:
            return

        for ch in channels:
            await ch.send(embed=embed)

    async def _handle_status(self, status: str):
        if status == self._last_status:
            return
        self._last_status = status

        channels = await self._all_channels()
        if not channels:
            return

        if status == "rodando":
            try:
                state    = db.reference("/draftSession/state").get() or {}
                captains = db.reference("/draftSession/captains").get() or {}
                first_id = state.get("turnoAtual")
                first    = captains.get(first_id, {}) if first_id else {}
                nome     = first.get("capitaoNome") or first.get("nome", "—")
                emoji    = first.get("emoji", "")
                embed = discord.Embed(
                    title="🚀  Draft Iniciado!",
                    description=f"Primeiro turno: **{emoji} {nome}**",
                    color=GOLD,
                )
                embed.add_field(name="Times",  value=str(len(captains)), inline=True)
                embed.add_field(name="Rodada", value="1",                inline=True)
            except Exception as e:
                embed = discord.Embed(title="🚀  Draft Iniciado!", color=GOLD)
                print(f"DraftCog: erro embed início — {e}")

        elif status == "encerrado":
            try:
                captains    = db.reference("/draftSession/captains").get() or {}
                sorted_caps = sorted(captains.values(), key=lambda c: c.get("seed", 99))
                embed = discord.Embed(
                    title="🏁  Draft Encerrado!",
                    description="Todos os times estão formados.",
                    color=GOLD,
                )
                for cap in sorted_caps:
                    roster   = cap.get("roster", {}) or {}
                    cap_nome = cap.get("capitaoNome", "")
                    lines    = []
                    if cap_nome:
                        lines.append(f"⚑ {cap_nome} *(cap)*")
                    for entry in roster.values():
                        lines.append(f"{entry.get('discord','?')} — 🪙{entry.get('preco',0)}")
                    embed.add_field(
                        name=f"{cap.get('emoji','')} {cap.get('nome','—')}",
                        value="\n".join(lines) if lines else "—",
                        inline=True,
                    )
            except Exception as e:
                embed = discord.Embed(title="🏁  Draft Encerrado!", color=GOLD)
                print(f"DraftCog: erro embed fim — {e}")
        else:
            return

        for ch in channels:
            await ch.send(embed=embed)

    # ── /setup ────────────────────────────────────────────────
    @app_commands.command(name="setup", description="Define este canal como central de notificações do draft")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup(self, interaction: discord.Interaction):
        try:
            save_channel(interaction.guild_id, interaction.channel_id)
            embed = discord.Embed(
                title="✅  Bot configurado!",
                description=f"Este canal ({interaction.channel.mention}) receberá todas as notificações do draft.",
                color=GOLD,
            )
            embed.add_field(name="Compras",   value="Notificações de compra de jogadores", inline=False)
            embed.add_field(name="Roubos",    value="Notificações de roubo com reembolso", inline=False)
            embed.add_field(name="Status",    value="Início e fim do draft",               inline=False)
            embed.set_footer(text="Use /status para verificar a conexão a qualquer momento.")
            await interaction.response.send_message(embed=embed)
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro ao salvar configuração: {e}", ephemeral=True)

    @cmd_setup.error
    async def cmd_setup_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message(
                "❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.",
                ephemeral=True,
            )

    # ── /status ───────────────────────────────────────────────
    @app_commands.command(name="status", description="Mostra o estado atual do bot e do draft")
    async def cmd_status(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            channel_id = load_channel(interaction.guild_id)
            state      = db.reference("/draftSession/state").get() or {}
            captains   = db.reference("/draftSession/captains").get() or {}

            status_draft = state.get("status", "aguardando")
            status_label = {
                "aguardando": "⏳ Aguardando",
                "rodando":    "🟢 Em andamento",
                "encerrado":  "🏁 Encerrado",
            }.get(status_draft, status_draft)

            embed = discord.Embed(title="⚙️  Status do Bot", color=GOLD)

            if channel_id:
                ch = self.bot.get_channel(channel_id)
                embed.add_field(
                    name="Canal de notificações",
                    value=ch.mention if ch else f"ID {channel_id} (não encontrado)",
                    inline=False,
                )
            else:
                embed.add_field(
                    name="Canal de notificações",
                    value="⚠️ Não configurado — use `/setup` num canal",
                    inline=False,
                )

            embed.add_field(name="Firebase",     value="🟢 Conectado",  inline=True)
            embed.add_field(name="Draft status", value=status_label,    inline=True)
            embed.add_field(name="Times",        value=str(len(captains)), inline=True)

            if status_draft == "rodando":
                active_id = state.get("turnoExtra") or state.get("turnoAtual")
                cap       = captains.get(active_id, {}) if active_id else {}
                nome      = cap.get("capitaoNome") or cap.get("nome", "—")
                extra     = " *(turno extra)*" if state.get("turnoExtra") else ""
                embed.add_field(name="Vez de", value=f"{cap.get('emoji','')} {nome}{extra}", inline=True)

            await interaction.followup.send(embed=embed, ephemeral=True)

        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /inscritos ────────────────────────────────────────────
    @app_commands.command(name="inscritos", description="Lista os jogadores inscritos no evento")
    async def cmd_inscritos(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not SHEETS_URL:
            await interaction.followup.send("❌ SHEETS_WEBAPP_URL não configurado.", ephemeral=True)
            return
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None, lambda: requests.get(SHEETS_URL, timeout=10)
            )
            data    = resp.json()
            players = data.get("players", []) if data.get("ok") else []

            if not players:
                await interaction.followup.send("Nenhum jogador inscrito ainda.", ephemeral=True)
                return

            lines = [
                f"**{p.get('discord','?')}** — {p.get('elo','?')} · {p.get('rolePrimaria','?')}"
                for p in players[:25]
            ]
            extra = f"\n*...e mais {len(players) - 25} jogadores*" if len(players) > 25 else ""
            embed = discord.Embed(
                title=f"📋  Inscritos ({len(players)})",
                description="\n".join(lines) + extra,
                color=GOLD,
            )
            await interaction.followup.send(embed=embed, ephemeral=True)

        except Exception as e:
            await interaction.followup.send(f"❌ Erro ao buscar inscritos: {e}", ephemeral=True)

    # ── /draft ────────────────────────────────────────────────
    @app_commands.command(name="draft", description="Mostra o estado atual do draft")
    async def cmd_draft(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            state    = db.reference("/draftSession/state").get() or {}
            captains = db.reference("/draftSession/captains").get() or {}

            status_draft = state.get("status", "aguardando")
            status_label = {
                "aguardando": "⏳ Aguardando",
                "rodando":    "🟢 Em andamento",
                "encerrado":  "🏁 Encerrado",
            }.get(status_draft, status_draft)

            embed = discord.Embed(title="⚔️  Estado do Draft", color=GOLD)
            embed.add_field(name="Status", value=status_label,              inline=True)
            embed.add_field(name="Rodada", value=str(state.get("rodada",1)), inline=True)

            if status_draft == "rodando":
                active_id = state.get("turnoExtra") or state.get("turnoAtual")
                cap       = captains.get(active_id, {}) if active_id else {}
                nome      = cap.get("capitaoNome") or cap.get("nome", "—")
                extra     = " *(turno extra)*" if state.get("turnoExtra") else ""
                embed.add_field(name="Vez de", value=f"{cap.get('emoji','')} {nome}{extra}", inline=True)

            sorted_caps = sorted(captains.values(), key=lambda c: c.get("seed", 99))
            for cap in sorted_caps:
                count = len(cap.get("roster", {}) or {}) + (1 if cap.get("capitaoNome") else 0)
                embed.add_field(
                    name=f"{cap.get('emoji','')} {cap.get('nome','—')}",
                    value=f"🪙 {cap.get('moedas',0)} · {count}/7 jogadores",
                    inline=True,
                )

            await interaction.followup.send(embed=embed, ephemeral=True)

        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)


async def setup(bot):
    await bot.add_cog(DraftCog(bot))
