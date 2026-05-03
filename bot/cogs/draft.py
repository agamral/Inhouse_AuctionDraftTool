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


def hex_to_int(color: str) -> int:
    try:
        return int(color.lstrip("#"), 16)
    except Exception:
        return GOLD


# ── Helpers Firebase ───────────────────────────────────────────────────────────

def get_camp_id(guild_id: int) -> str | None:
    """Retorna o campeonatoId vinculado a este servidor, ou None."""
    try:
        data = db.reference(f"/botGuilds/{guild_id}").get()
        return data.get("campeonatoId") if isinstance(data, dict) else None
    except Exception:
        return None


def save_config(guild_id: int, key: str, value, camp_id: str | None = None):
    if camp_id is None:
        camp_id = get_camp_id(guild_id)
    if not camp_id:
        return
    ref = db.reference(f"/campeonatos/{camp_id}/config/botCanais/{guild_id}/{key}")
    if value is None:
        ref.delete()
    else:
        ref.set(value)


def load_config(guild_id: int, key: str, camp_id: str | None = None):
    if camp_id is None:
        camp_id = get_camp_id(guild_id)
    if not camp_id:
        return None
    return db.reference(f"/campeonatos/{camp_id}/config/botCanais/{guild_id}/{key}").get()


class DraftCog(commands.Cog):
    def __init__(self, bot):
        self.bot              = bot
        self._loop            = None
        self._boot_ts         = 0
        self._last_action_ts  = 0
        self._last_status     = {}  # camp_id → last status
        self._privacy         = {}  # camp_id → bool
        self._camp_listeners  = {}  # camp_id → [listener, ...]

    # ── on_ready ───────────────────────────────────────────────────────────────
    @commands.Cog.listener()
    async def on_ready(self):
        self._loop    = asyncio.get_event_loop()
        self._boot_ts = int(time.time() * 1000)

        # Inicia listeners para todos os campeonatos já vinculados
        try:
            guilds_data = db.reference("/botGuilds").get() or {}
            camp_ids    = {v["campeonatoId"] for v in guilds_data.values()
                           if isinstance(v, dict) and v.get("campeonatoId")}
            for cid in camp_ids:
                await self.iniciar_listeners(cid)
        except Exception as e:
            print(f"DraftCog: erro ao carregar vínculos — {e}")

    # ── Iniciar listeners para um campeonato ───────────────────────────────────
    async def iniciar_listeners(self, camp_id: str):
        if camp_id in self._camp_listeners:
            return  # já ouvindo este campeonato

        print(f"DraftCog: iniciando listeners para campeonato '{camp_id}'")
        try:
            la = db.reference(f"/campeonatos/{camp_id}/draftSession/state/lastAction").listen(
                self._make_action_listener(camp_id))
            st = db.reference(f"/campeonatos/{camp_id}/draftSession/state/status").listen(
                self._make_status_listener(camp_id))
            pv = db.reference(f"/campeonatos/{camp_id}/config/modules/privacidadeAtiva").listen(
                self._make_privacy_listener(camp_id))
            self._camp_listeners[camp_id] = [la, st, pv]
            print(f"DraftCog: listeners ativos para '{camp_id}'.")
        except Exception as e:
            print(f"DraftCog: erro ao registrar listeners para '{camp_id}' — {e}")

    # ── Closures de listeners ──────────────────────────────────────────────────
    def _make_action_listener(self, camp_id):
        def callback(event):
            if not isinstance(event.data, dict):
                return
            asyncio.run_coroutine_threadsafe(
                self._handle_action(event.data, camp_id), self._loop)
        return callback

    def _make_status_listener(self, camp_id):
        def callback(event):
            if not isinstance(event.data, str):
                return
            asyncio.run_coroutine_threadsafe(
                self._handle_status(event.data, camp_id), self._loop)
        return callback

    def _make_privacy_listener(self, camp_id):
        def callback(event):
            self._privacy[camp_id] = bool(event.data) if event.data is not None else False
            print(f"DraftCog [{camp_id}]: privacidade {'ativada' if self._privacy[camp_id] else 'desativada'}")
        return callback

    # ── Canais do leilão para um campeonato ────────────────────────────────────
    async def _leilao_channels(self, camp_id: str) -> list:
        channels = []
        try:
            canais = db.reference(f"/campeonatos/{camp_id}/config/botCanais").get() or {}
            for gid_str, data in canais.items():
                if not isinstance(data, dict):
                    continue
                cid = data.get("canal_leilao")
                if cid:
                    ch = self.bot.get_channel(int(cid))
                    if ch:
                        channels.append(ch)
        except Exception as e:
            print(f"DraftCog: erro ao carregar canais — {e}")
        return channels

    # ── Handler de ações (compra/roubo) ────────────────────────────────────────
    async def _handle_action(self, action: dict, camp_id: str):
        ts = action.get("ts", 0)
        if ts <= self._boot_ts or ts <= self._last_action_ts:
            return
        self._last_action_ts = ts

        channels = await self._leilao_channels(camp_id)
        if not channels:
            print(f"DraftCog [{camp_id}]: nenhum canal configurado.")
            return

        privacy    = self._privacy.get(camp_id, False)
        kind       = action.get("type")
        team_color = hex_to_int(action.get("byTeamCor", ""))
        by_emoji   = action.get("byTeamEmoji", "")
        by_nome    = action.get("byTeamNome", "—")
        player     = "Jogador" if privacy else action.get("playerDiscord", "—")
        elo        = action.get("playerElo", "—")
        role       = action.get("playerRole", "—")
        preco      = action.get("preco", 0)

        if kind == "buy":
            embed = discord.Embed(
                title=f"✅  {by_emoji} {by_nome} comprou um jogador",
                color=team_color,
            )
            embed.add_field(name="Jogador",    value=f"**{player}**",   inline=True)
            if not privacy:
                embed.add_field(name="Elo",    value=elo,               inline=True)
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
                    entry = db.reference(
                        f"/campeonatos/{camp_id}/draftSession/captains/{from_id}/roster/{action.get('playerId','')}"
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
            if not privacy:
                embed.add_field(name="Elo",        value=elo,                         inline=True)
            embed.add_field(name="Função",         value=role,                        inline=True)
            embed.add_field(name="Preço do roubo", value=f"🪙 {preco}",               inline=True)
            embed.add_field(name="Roubado de",     value=f"{from_emoji} {from_nome}", inline=True)
            if refund:
                embed.add_field(
                    name="Reembolso",
                    value=f"🪙 {refund} devolvido para {from_emoji} {from_nome}",
                    inline=False,
                )
            embed.set_footer(text=f"{from_emoji} {from_nome} recebe turno extra!")
        else:
            return

        for ch in channels:
            await ch.send(embed=embed)

    # ── Handler de status (rodando / encerrado) ────────────────────────────────
    async def _handle_status(self, status: str, camp_id: str):
        if status == self._last_status.get(camp_id):
            return
        self._last_status[camp_id] = status

        channels = await self._leilao_channels(camp_id)
        if not channels:
            return

        if status == "rodando":
            try:
                state    = db.reference(f"/campeonatos/{camp_id}/draftSession/state").get() or {}
                captains = db.reference(f"/campeonatos/{camp_id}/draftSession/captains").get() or {}
                first_id = state.get("turnoAtual")
                first    = captains.get(first_id, {}) if first_id else {}
                nome     = first.get("capitaoNome") or first.get("nome", "—")
                emoji    = first.get("emoji", "")
                embed = discord.Embed(
                    title="🚀  Leilão Iniciado!",
                    description=f"Primeiro turno: **{emoji} {nome}**",
                    color=GOLD,
                )
                embed.add_field(name="Times",  value=str(len(captains)), inline=True)
                embed.add_field(name="Rodada", value="1",                inline=True)
            except Exception as e:
                embed = discord.Embed(title="🚀  Leilão Iniciado!", color=GOLD)
                print(f"DraftCog: erro embed início — {e}")

        elif status == "encerrado":
            try:
                captains    = db.reference(f"/campeonatos/{camp_id}/draftSession/captains").get() or {}
                sorted_caps = sorted(captains.values(), key=lambda c: c.get("seed", 99))
                embed = discord.Embed(
                    title="🏁  Leilão Encerrado!",
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
                embed = discord.Embed(title="🏁  Leilão Encerrado!", color=GOLD)
                print(f"DraftCog: erro embed fim — {e}")
        else:
            return

        for ch in channels:
            await ch.send(embed=embed)

    # ── /setup-leilao ──────────────────────────────────────────────────────────
    @app_commands.command(
        name="setup-leilao",
        description="Define o canal de notificações do leilão (compras, roubos, início, fim)",
    )
    @app_commands.describe(
        criar="Cria um canal #leilao automaticamente",
        cargo="Cargo que poderá ver o canal criado (opcional)",
    )
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_leilao(
        self,
        interaction: discord.Interaction,
        criar: bool = False,
        cargo: discord.Role | None = None,
    ):
        await interaction.response.defer(ephemeral=True)
        camp_id = get_camp_id(interaction.guild_id)
        if not camp_id:
            await interaction.followup.send("❌ Servidor não vinculado. Use `/setup token:SEU_TOKEN` primeiro.", ephemeral=True)
            return
        try:
            if criar:
                canal = await self._criar_canal(interaction, "leilao", cargo)
                if not canal:
                    return
            else:
                canal = interaction.channel

            save_config(interaction.guild_id, "canal_leilao", canal.id, camp_id)

            boas_vindas = discord.Embed(
                title="⚔️  Copa Inhouse — Leilão de Times",
                description="Este canal acompanha o leilão de times ao vivo.",
                color=GOLD,
            )
            boas_vindas.add_field(name="🚀 Leilão iniciado",   value="Admin abre o leilão e define o primeiro turno",           inline=False)
            boas_vindas.add_field(name="✅ Compra",             value="Jogador, elo, função, preço pago e novo preço de mercado", inline=False)
            boas_vindas.add_field(name="⚔️ Roubo",              value="Quem roubou, de quem, preço e reembolso ao time roubado", inline=False)
            boas_vindas.add_field(name="🏁 Leilão encerrado",   value="Roster completo de todos os times",                       inline=False)
            boas_vindas.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=boas_vindas)

            await interaction.followup.send(f"✅ Canal {canal.mention} configurado!", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    @cmd_setup_leilao.error
    async def cmd_setup_leilao_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message(
                "❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.", ephemeral=True)

    # ── /status ────────────────────────────────────────────────────────────────
    @app_commands.command(name="status", description="Mostra o estado atual do bot e do leilão")
    async def cmd_status(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        camp_id = get_camp_id(interaction.guild_id)
        try:
            embed = discord.Embed(title="⚙️  Status do Bot", color=GOLD)

            if not camp_id:
                embed.add_field(name="Campeonato", value="⚠️ Não vinculado — use `/setup token:SEU_TOKEN`", inline=False)
                await interaction.followup.send(embed=embed, ephemeral=True)
                return

            canal_id = load_config(interaction.guild_id, "canal_leilao", camp_id)
            state    = db.reference(f"/campeonatos/{camp_id}/draftSession/state").get() or {}
            captains = db.reference(f"/campeonatos/{camp_id}/draftSession/captains").get() or {}

            status_label = {
                "aguardando": "⏳ Aguardando",
                "rodando":    "🟢 Em andamento",
                "encerrado":  "🏁 Encerrado",
            }.get(state.get("status", "aguardando"), state.get("status", "—"))

            ch_leilao = self.bot.get_channel(int(canal_id)) if canal_id else None
            embed.add_field(name="Campeonato",    value=f"`{camp_id}`",                                                       inline=False)
            embed.add_field(name="Canal leilão",  value=ch_leilao.mention if ch_leilao else "⚠️ Não configurado",             inline=False)
            embed.add_field(name="Firebase",      value="🟢 Conectado",                                                       inline=True)
            embed.add_field(name="Leilão status", value=status_label,                                                         inline=True)
            embed.add_field(name="Times",         value=str(len(captains)),                                                    inline=True)

            if state.get("status") == "rodando":
                active_id = state.get("turnoExtra") or state.get("turnoAtual")
                cap  = captains.get(active_id, {}) if active_id else {}
                nome = cap.get("capitaoNome") or cap.get("nome", "—")
                extra = " *(turno extra)*" if state.get("turnoExtra") else ""
                embed.add_field(name="Vez de", value=f"{cap.get('emoji','')} {nome}{extra}", inline=True)

            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /inscritos ─────────────────────────────────────────────────────────────
    @app_commands.command(name="inscritos", description="Lista os jogadores inscritos no evento")
    async def cmd_inscritos(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not SHEETS_URL:
            await interaction.followup.send("❌ SHEETS_WEBAPP_URL não configurado.", ephemeral=True)
            return
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(SHEETS_URL, timeout=10))
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

    # ── /leilao ────────────────────────────────────────────────────────────────
    @app_commands.command(name="leilao", description="Mostra o estado atual do leilão de times")
    async def cmd_leilao(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        camp_id = get_camp_id(interaction.guild_id)
        if not camp_id:
            await interaction.followup.send("❌ Servidor não vinculado. Use `/setup` primeiro.", ephemeral=True)
            return
        try:
            state    = db.reference(f"/campeonatos/{camp_id}/draftSession/state").get() or {}
            captains = db.reference(f"/campeonatos/{camp_id}/draftSession/captains").get() or {}

            status_label = {
                "aguardando": "⏳ Aguardando",
                "rodando":    "🟢 Em andamento",
                "encerrado":  "🏁 Encerrado",
            }.get(state.get("status", "aguardando"), state.get("status", "—"))

            embed = discord.Embed(title="⚔️  Estado do Leilão", color=GOLD)
            embed.add_field(name="Status", value=status_label,               inline=True)
            embed.add_field(name="Rodada", value=str(state.get("rodada", 1)), inline=True)

            if state.get("status") == "rodando":
                active_id = state.get("turnoExtra") or state.get("turnoAtual")
                cap  = captains.get(active_id, {}) if active_id else {}
                nome = cap.get("capitaoNome") or cap.get("nome", "—")
                extra = " *(turno extra)*" if state.get("turnoExtra") else ""
                embed.add_field(name="Vez de", value=f"{cap.get('emoji','')} {nome}{extra}", inline=True)

            sorted_caps = sorted(captains.values(), key=lambda c: c.get("seed", 99))
            for cap in sorted_caps:
                count = len(cap.get("roster", {}) or {}) + (1 if cap.get("capitaoNome") else 0)
                embed.add_field(
                    name=f"{cap.get('emoji','')} {cap.get('nome','—')}",
                    value=f"🪙 {cap.get('moedas', 0)} · {count}/7 jogadores",
                    inline=True,
                )

            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── Helper: criar canal ────────────────────────────────────────────────────
    async def _criar_canal(self, interaction, nome, cargo):
        try:
            canal = await interaction.guild.create_text_channel(nome)
        except Exception as e:
            await interaction.followup.send(f"❌ Não foi possível criar o canal.\n`{e}`", ephemeral=True)
            return None
        if cargo:
            try:
                await canal.edit(overwrites={
                    interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False),
                    cargo: discord.PermissionOverwrite(view_channel=True, read_message_history=True),
                })
            except Exception as e:
                await interaction.followup.send(
                    f"⚠️ Canal {canal.mention} criado, mas não consegui aplicar permissões (`{e}`).",
                    ephemeral=True)
        return canal


async def setup(bot):
    await bot.add_cog(DraftCog(bot))
