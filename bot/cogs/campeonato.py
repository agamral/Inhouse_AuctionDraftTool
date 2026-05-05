import asyncio
import time
import discord
from discord.ext import commands
from discord import app_commands
from firebase_admin import db
from .draft import get_camp_id, save_config, hex_to_int

GOLD  = 0xC9A84C
GREEN = 0x4CAF7D
RED   = 0xE05555
BLUE  = 0x4A9EDA

SLOT_LABEL = {
    'terca-20h':  'Terça 20h',  'terca-21h':  'Terça 21h',  'terca-22h':  'Terça 22h',
    'quarta-20h': 'Quarta 20h', 'quarta-21h': 'Quarta 21h', 'quarta-22h': 'Quarta 22h',
    'quinta-20h': 'Quinta 20h', 'quinta-21h': 'Quinta 21h', 'quinta-22h': 'Quinta 22h',
    'sabado-17h': 'Sábado 17h', 'sabado-18h': 'Sábado 18h', 'sabado-19h': 'Sábado 19h',
}

TIPOS_REGULARES = {'regular', 'desempate', None}


def calcular_classificacao(confrontos: dict, teams: dict) -> list:
    stats: dict[str, dict] = {}
    for tid in teams:
        stats[tid] = {'v': 0, 'e': 0, 'd': 0, 'gf': 0, 'gc': 0, 'pts': 0}

    STATUS_CONTA = {'realizado', 'empate_pendente'}

    for c in confrontos.values():
        if not isinstance(c, dict):
            continue
        if c.get('status') not in STATUS_CONTA:
            continue
        if c.get('tipo', 'regular') not in TIPOS_REGULARES:
            continue

        resultado = c.get('resultado')
        if not isinstance(resultado, dict):
            continue

        tipo_res = resultado.get('tipo', 'normal')
        ta, tb   = c.get('timeA'), c.get('timeB')
        gA = int(resultado.get('timeA') or 0)
        gB = int(resultado.get('timeB') or 0)

        for t in (ta, tb):
            if t not in stats:
                stats[t] = {'v': 0, 'e': 0, 'd': 0, 'gf': 0, 'gc': 0, 'pts': 0}

        is_desempate = c.get('tipo') == 'desempate'
        pts_v = 1 if is_desempate else 3

        if tipo_res == 'duplo_wo':
            stats[ta]['d'] += 1; stats[tb]['d'] += 1
        elif tipo_res == 'wo_a':
            stats[ta]['v'] += 1; stats[ta]['pts'] += pts_v; stats[tb]['d'] += 1
        elif tipo_res == 'wo_b':
            stats[tb]['v'] += 1; stats[tb]['pts'] += pts_v; stats[ta]['d'] += 1
        elif tipo_res == 'empate':
            for t, gf, gc in [(ta, gA, gB), (tb, gB, gA)]:
                stats[t]['e'] += 1; stats[t]['pts'] += 1
                stats[t]['gf'] += gf; stats[t]['gc'] += gc
        else:
            if gA > gB:
                stats[ta]['v'] += 1; stats[ta]['pts'] += pts_v; stats[tb]['d'] += 1
            elif gB > gA:
                stats[tb]['v'] += 1; stats[tb]['pts'] += pts_v; stats[ta]['d'] += 1
            else:
                stats[ta]['e'] += 1; stats[ta]['pts'] += 1
                stats[tb]['e'] += 1; stats[tb]['pts'] += 1
            stats[ta]['gf'] += gA; stats[ta]['gc'] += gB
            stats[tb]['gf'] += gB; stats[tb]['gc'] += gA

    result = []
    for tid, s in stats.items():
        team = (teams.get(tid) or {})
        result.append({'id': tid, 'nome': team.get('nome', '?'), 'cor': team.get('cor', '#888888'),
                       'j': s['v'] + s['e'] + s['d'], 'gd': s['gf'] - s['gc'], **s})

    result.sort(key=lambda x: (-x['pts'], -x['v'], -x['gd'], -x['gf']))
    return result


def build_tabela_embed(classificacao: list) -> discord.Embed:
    embed = discord.Embed(title="📊  Classificação", color=GOLD)
    if not classificacao:
        embed.description = "Nenhum resultado registrado ainda."
        embed.set_footer(text="Atualizado automaticamente a cada resultado")
        return embed

    medals = ['🥇', '🥈', '🥉']
    lines  = []
    for i, t in enumerate(classificacao):
        pos = medals[i] if i < 3 else f"`{i + 1}.`"
        gd  = f"+{t['gd']}" if t['gd'] > 0 else str(t['gd'])
        vde = f"{t['v']}V {t['e']}E {t['d']}D"
        lines.append(f"{pos} **{t['nome']}** — **{t['pts']}** pts  ·  {vde}  ·  SG {gd}")

    embed.description = "\n".join(lines)
    embed.set_footer(text="Atualizado automaticamente a cada resultado")
    return embed


# ── Cog principal ──────────────────────────────────────────────────────────────

class CampeonatoCog(commands.Cog):
    def __init__(self, bot):
        self.bot                    = bot
        self._loop                  = None
        self._boot_ts               = int(time.time() * 1000)
        self._confrontos_cache: dict[str, dict] = {}  # camp_id → {confId: conf}
        self._camp_listeners: dict[str, list]   = {}  # camp_id → [listener]

    @commands.Cog.listener()
    async def on_ready(self):
        self._loop = asyncio.get_event_loop()
        try:
            guilds_data = db.reference("/botGuilds").get() or {}
            camp_ids    = {v["campeonatoId"] for v in guilds_data.values()
                           if isinstance(v, dict) and v.get("campeonatoId")}
            for cid in camp_ids:
                await self.iniciar_listeners(cid)
        except Exception as e:
            print(f"CampeonatoCog: erro ao carregar vínculos — {e}")

    # ── Iniciar listeners para um campeonato ───────────────────────────────────
    async def iniciar_listeners(self, camp_id: str):
        if camp_id in self._camp_listeners:
            return
        print(f"CampeonatoCog: iniciando listeners para '{camp_id}'")
        try:
            listener = db.reference(f"/campeonatos/{camp_id}/confrontos").listen(
                self._make_confrontos_listener(camp_id))
            self._camp_listeners[camp_id] = [listener]
            print(f"CampeonatoCog: listener /confrontos ativo para '{camp_id}'.")
        except Exception as e:
            print(f"CampeonatoCog: erro ao registrar listener para '{camp_id}' — {e}")

    # ── Closure de listener ────────────────────────────────────────────────────
    def _make_confrontos_listener(self, camp_id: str):
        def callback(event):
            asyncio.run_coroutine_threadsafe(
                self._process_event(event.path, event.data, camp_id), self._loop)
        return callback

    # ── Processamento de eventos ───────────────────────────────────────────────
    async def _process_event(self, path: str, data, camp_id: str):
        cache = self._confrontos_cache.setdefault(camp_id, {})

        if path == "/":
            if isinstance(data, dict):
                cache.update(data)
            return

        parts = path.strip("/").split("/")
        cid   = parts[0]
        prev  = cache.get(cid) or {}

        if data is None:
            cache.pop(cid, None)
            return

        new_c = data if len(parts) == 1 and isinstance(data, dict) else {**prev, parts[1]: data}

        old_status = prev.get("status") if isinstance(prev, dict) else None
        new_status = new_c.get("status") if isinstance(new_c, dict) else None

        cache[cid] = new_c

        if old_status is None or new_status == old_status:
            return

        teams   = db.reference(f"/campeonatos/{camp_id}/teams").get() or {}
        rodadas = db.reference(f"/campeonatos/{camp_id}/rodadas").get() or {}

        await self._notify(new_c, old_status, new_status, teams, rodadas, camp_id)

        if new_status in {"realizado", "empate_pendente"}:
            await self._update_tabela(teams, camp_id)

    # ── Notificações ───────────────────────────────────────────────────────────
    async def _notify(self, c: dict, old_status: str, new_status: str,
                      teams: dict, rodadas: dict, camp_id: str):
        ta     = (teams.get(c.get("timeA")) or {})
        tb     = (teams.get(c.get("timeB")) or {})
        rodada = (rodadas.get(c.get("rodadaId")) or {})
        rnum   = rodada.get("numero", "?")
        slot   = SLOT_LABEL.get(c.get("slot", ""), c.get("slot") or "—")
        nome_a = ta.get("nome", "Time A")
        nome_b = tb.get("nome", "Time B")
        formato = c.get("formato", "MD2")

        if new_status == "confirmado":
            embed = discord.Embed(title="📅  Partida Confirmada!", color=GREEN)
            embed.add_field(name="Confronto", value=f"**{nome_a}** vs **{nome_b}**", inline=False)
            embed.add_field(name="Horário",   value=slot,      inline=True)
            embed.add_field(name="Rodada",    value=str(rnum), inline=True)
            embed.add_field(name="Formato",   value=formato,   inline=True)
            for ch in await self._channels("canal_agenda",     camp_id): await ch.send(embed=embed)
            for ch in await self._channels("canal_campeonato", camp_id): await ch.send(embed=embed)

        elif new_status == "realizado":
            resultado = c.get("resultado") or {}
            gA       = int(resultado.get("timeA") or 0)
            gB       = int(resultado.get("timeB") or 0)
            tipo_res = resultado.get("tipo", "normal")

            if tipo_res == "wo_a":
                desc, cor = f"**{nome_a}** venceu por W.O.", hex_to_int(ta.get("cor",""))
            elif tipo_res == "wo_b":
                desc, cor = f"**{nome_b}** venceu por W.O.", hex_to_int(tb.get("cor",""))
            elif tipo_res == "duplo_wo":
                desc, cor = "Duplo W.O. — nenhum time compareceu.", RED
            elif gA > gB:
                desc = f"**{nome_a}** vence!\n`{nome_a}  {gA} – {gB}  {nome_b}`"
                cor  = hex_to_int(ta.get("cor",""))
            elif gB > gA:
                desc = f"**{nome_b}** vence!\n`{nome_a}  {gA} – {gB}  {nome_b}`"
                cor  = hex_to_int(tb.get("cor",""))
            else:
                desc, cor = f"Empate  `{nome_a}  {gA} – {gB}  {nome_b}`", GOLD

            embed = discord.Embed(title="🏆  Resultado Registrado", description=desc, color=cor)
            embed.add_field(name="Rodada",  value=str(rnum), inline=True)
            embed.add_field(name="Formato", value=formato,   inline=True)
            for ch in await self._channels("canal_campeonato", camp_id): await ch.send(embed=embed)

        elif new_status == "empate_pendente":
            embed = discord.Embed(
                title="⚔️  Empate! Desempate MD3 pendente",
                description=f"**{nome_a}** 1–1 **{nome_b}**\nUm confronto de desempate será agendado.",
                color=GOLD,
            )
            embed.add_field(name="Rodada", value=str(rnum), inline=True)
            for ch in await self._channels("canal_campeonato", camp_id): await ch.send(embed=embed)

        elif new_status == "wo_pendente":
            embed = discord.Embed(
                title="⚠️  W.O. Pendente",
                description=f"**{nome_a}** vs **{nome_b}** — Rodada {rnum}\nNenhum time marcou disponibilidade.",
                color=RED,
            )
            for ch in await self._channels("canal_campeonato", camp_id): await ch.send(embed=embed)

    # ── Tabela ao vivo ─────────────────────────────────────────────────────────
    async def _update_tabela(self, teams: dict, camp_id: str):
        confrontos    = db.reference(f"/campeonatos/{camp_id}/confrontos").get() or {}
        classificacao = calcular_classificacao(confrontos, teams)
        embed         = build_tabela_embed(classificacao)

        canais = db.reference(f"/campeonatos/{camp_id}/config/botCanais").get() or {}
        for gid_str, cfg in canais.items():
            if not isinstance(cfg, dict):
                continue
            canal_id = cfg.get("canal_tabela")
            msg_id   = cfg.get("tabela_msg_id")
            if not canal_id:
                continue
            ch = self.bot.get_channel(int(canal_id))
            if not ch:
                continue
            if msg_id:
                try:
                    msg = await ch.fetch_message(int(msg_id))
                    await msg.edit(embed=embed)
                    continue
                except discord.NotFound:
                    pass
            msg = await ch.send(embed=embed)
            save_config(int(gid_str), "tabela_msg_id", msg.id, camp_id)

    # ── Helper: canais por tipo ────────────────────────────────────────────────
    async def _channels(self, config_key: str, camp_id: str) -> list:
        result = []
        try:
            canais = db.reference(f"/campeonatos/{camp_id}/config/botCanais").get() or {}
            for cfg in canais.values():
                if not isinstance(cfg, dict):
                    continue
                cid = cfg.get(config_key)
                if cid:
                    ch = self.bot.get_channel(int(cid))
                    if ch:
                        result.append(ch)
        except Exception as e:
            print(f"CampeonatoCog: erro ao carregar canais ({config_key}) — {e}")
        return result

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

    def _check_linked(self, guild_id: int) -> str | None:
        return get_camp_id(guild_id)

    # ── /setup-campeonato ──────────────────────────────────────────────────────
    @app_commands.command(name="setup-campeonato",
                          description="Define o canal de notificações do campeonato")
    @app_commands.describe(criar="Cria um canal #campeonato automaticamente",
                           cargo="Cargo que poderá ver o canal (opcional)")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_campeonato(self, interaction: discord.Interaction,
                                   criar: bool = False, cargo: discord.Role | None = None):
        await interaction.response.defer(ephemeral=True)
        camp_id = self._check_linked(interaction.guild_id)
        if not camp_id:
            await interaction.followup.send("❌ Use `/setup token:SEU_TOKEN` primeiro.", ephemeral=True)
            return
        try:
            canal = await self._criar_canal(interaction, "campeonato", cargo) if criar else interaction.channel
            if not canal: return
            save_config(interaction.guild_id, "canal_campeonato", canal.id, camp_id)
            bv = discord.Embed(title="🏆  Copa Inhouse — Campeonato",
                               description="Notificações automáticas de tudo que acontece no campeonato.",
                               color=GREEN)
            bv.add_field(name="🏆 Resultado",         value="Placar lançado pelo admin",                   inline=False)
            bv.add_field(name="📅 Partida confirmada", value="Dois times acordaram horário para jogar",     inline=False)
            bv.add_field(name="⚔️ Empate — MD3",       value="Série terminou 1–1, desempate será agendado", inline=False)
            bv.add_field(name="⚠️ W.O. pendente",      value="Nenhum time marcou disponibilidade",          inline=False)
            bv.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=bv)
            await interaction.followup.send(f"✅ Canal {canal.mention} configurado!", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /setup-tabela ──────────────────────────────────────────────────────────
    @app_commands.command(name="setup-tabela",
                          description="Posta a classificação ao vivo e a mantém atualizada")
    @app_commands.describe(criar="Cria um canal #tabela automaticamente",
                           cargo="Cargo que poderá ver o canal (opcional)")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_tabela(self, interaction: discord.Interaction,
                               criar: bool = False, cargo: discord.Role | None = None):
        await interaction.response.defer(ephemeral=True)
        camp_id = self._check_linked(interaction.guild_id)
        if not camp_id:
            await interaction.followup.send("❌ Use `/setup token:SEU_TOKEN` primeiro.", ephemeral=True)
            return
        try:
            canal = await self._criar_canal(interaction, "tabela", cargo) if criar else interaction.channel
            if not canal: return
            save_config(interaction.guild_id, "canal_tabela", canal.id, camp_id)
            save_config(interaction.guild_id, "tabela_msg_id", None, camp_id)
            info = discord.Embed(title="📊  Copa Inhouse — Classificação ao Vivo",
                                 description="A mensagem abaixo é editada automaticamente a cada resultado.",
                                 color=GOLD)
            info.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=info)
            confrontos    = db.reference(f"/campeonatos/{camp_id}/confrontos").get() or {}
            teams         = db.reference(f"/campeonatos/{camp_id}/teams").get() or {}
            classificacao = calcular_classificacao(confrontos, teams)
            msg = await canal.send(embed=build_tabela_embed(classificacao))
            save_config(interaction.guild_id, "tabela_msg_id", msg.id, camp_id)
            await interaction.followup.send(f"✅ Tabela ao vivo configurada em {canal.mention}!", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /setup-agenda ──────────────────────────────────────────────────────────
    @app_commands.command(name="setup-agenda",
                          description="Define o canal de partidas confirmadas")
    @app_commands.describe(criar="Cria um canal #agenda automaticamente",
                           cargo="Cargo que poderá ver o canal (opcional)")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_agenda(self, interaction: discord.Interaction,
                               criar: bool = False, cargo: discord.Role | None = None):
        await interaction.response.defer(ephemeral=True)
        camp_id = self._check_linked(interaction.guild_id)
        if not camp_id:
            await interaction.followup.send("❌ Use `/setup token:SEU_TOKEN` primeiro.", ephemeral=True)
            return
        try:
            canal = await self._criar_canal(interaction, "agenda", cargo) if criar else interaction.channel
            if not canal: return
            save_config(interaction.guild_id, "canal_agenda", canal.id, camp_id)
            bv = discord.Embed(title="📅  Copa Inhouse — Agenda de Partidas",
                               description="Um aviso é postado aqui toda vez que dois times confirmam horário para jogar.",
                               color=BLUE)
            bv.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=bv)
            await interaction.followup.send(f"✅ Canal {canal.mention} configurado!", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /setup-all ─────────────────────────────────────────────────────────────
    @app_commands.command(name="setup-all",
                          description="Cria todos os canais da Copa Inhouse de uma só vez")
    @app_commands.describe(cargo="Cargo que poderá ver os canais criados (opcional)")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_geral(self, interaction: discord.Interaction,
                              cargo: discord.Role | None = None):
        await interaction.response.defer(ephemeral=True)
        camp_id = self._check_linked(interaction.guild_id)
        if not camp_id:
            await interaction.followup.send("❌ Use `/setup token:SEU_TOKEN` primeiro.", ephemeral=True)
            return

        criados, falhas = [], []

        async def _setup(nome, config_key, embed_fn):
            canal = await self._criar_canal(interaction, nome, cargo)
            if not canal:
                falhas.append(nome)
                return
            save_config(interaction.guild_id, config_key, canal.id, camp_id)
            await canal.send(embed=embed_fn(canal))
            criados.append((nome, canal))

        def leilao_embed(_):
            e = discord.Embed(title="⚔️  Copa Inhouse — Leilão de Times",
                              description="Acompanha o leilão ao vivo.", color=GOLD)
            e.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            return e

        def camp_embed(_):
            e = discord.Embed(title="🏆  Copa Inhouse — Campeonato",
                              description="Notificações automáticas do campeonato.", color=GREEN)
            e.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            return e

        def agenda_embed(_):
            e = discord.Embed(title="📅  Copa Inhouse — Agenda",
                              description="Partidas confirmadas aparecem aqui.", color=BLUE)
            e.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            return e

        for nome, key, fn in [
            ("leilao",     "canal_leilao",     leilao_embed),
            ("campeonato", "canal_campeonato",  camp_embed),
            ("agenda",     "canal_agenda",      agenda_embed),
        ]:
            try:
                await _setup(nome, key, fn)
            except Exception as e:
                print(f"setup-all — erro em #{nome}: {e}")

        # Tabela (precisa de lógica extra)
        try:
            canal = await self._criar_canal(interaction, "tabela", cargo)
            if canal:
                save_config(interaction.guild_id, "canal_tabela", canal.id, camp_id)
                save_config(interaction.guild_id, "tabela_msg_id", None, camp_id)
                await canal.send(embed=discord.Embed(
                    title="📊  Copa Inhouse — Classificação ao Vivo",
                    description="Editada automaticamente a cada resultado.", color=GOLD))
                confrontos    = db.reference(f"/campeonatos/{camp_id}/confrontos").get() or {}
                teams         = db.reference(f"/campeonatos/{camp_id}/teams").get() or {}
                msg = await canal.send(embed=build_tabela_embed(calcular_classificacao(confrontos, teams)))
                save_config(interaction.guild_id, "tabela_msg_id", msg.id, camp_id)
                criados.append(("tabela", canal))
        except Exception as e:
            falhas.append("tabela")
            print(f"setup-all — erro em #tabela: {e}")

        resumo = discord.Embed(
            title="✅  Copa Inhouse configurada!",
            description=f"{len(criados)} canal(is) criado(s).",
            color=GOLD,
        )
        for nome, canal in criados:
            resumo.add_field(name=f"#{nome}", value=canal.mention, inline=True)
        if falhas:
            resumo.add_field(name="⚠️ Falhas", value=", ".join(f"#{f}" for f in falhas), inline=False)
        resumo.set_footer(text=f"Campeonato vinculado: {camp_id}")
        await interaction.followup.send(embed=resumo, ephemeral=True)

    @cmd_setup_campeonato.error
    @cmd_setup_tabela.error
    @cmd_setup_agenda.error
    @cmd_setup_geral.error
    async def setup_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message(
                "❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.",
                ephemeral=True)


async def setup(bot):
    await bot.add_cog(CampeonatoCog(bot))
