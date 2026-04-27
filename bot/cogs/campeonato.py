import asyncio
import time
import discord
from discord.ext import commands
from discord import app_commands
from firebase_admin import db

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

# Tipos de confronto que contam para a tabela (exclui playoffs)
TIPOS_REGULARES = {'regular', 'desempate', None}


def hex_to_int(color: str) -> int:
    try:
        return int(color.lstrip("#"), 16)
    except Exception:
        return GOLD


def save_config(guild_id: int, key: str, value):
    ref = db.reference(f"/botConfig/{guild_id}/{key}")
    if value is None:
        ref.delete()
    else:
        ref.set(value)


def load_all_configs() -> dict:
    return db.reference("/botConfig").get() or {}


# ── Cálculo de classificação ──────────────────────────────────────────────────
# Replica a lógica de calcularClassificacao em scheduling.js

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
            continue  # ignora quartas/semi/final do bracket

        resultado = c.get('resultado')
        if not isinstance(resultado, dict):
            continue

        tipo_res = resultado.get('tipo', 'normal')
        ta, tb   = c.get('timeA'), c.get('timeB')
        gA = int(resultado.get('timeA') or 0)
        gB = int(resultado.get('timeB') or 0)

        if ta not in stats:
            stats[ta] = {'v': 0, 'e': 0, 'd': 0, 'gf': 0, 'gc': 0, 'pts': 0}
        if tb not in stats:
            stats[tb] = {'v': 0, 'e': 0, 'd': 0, 'gf': 0, 'gc': 0, 'pts': 0}

        is_desempate = c.get('tipo') == 'desempate'
        pts_v = 1 if is_desempate else 3  # desempate vale +1pt ao vencedor

        if tipo_res == 'duplo_wo':
            stats[ta]['d'] += 1
            stats[tb]['d'] += 1
        elif tipo_res == 'wo_a':
            stats[ta]['v'] += 1
            stats[ta]['pts'] += pts_v
            stats[tb]['d'] += 1
        elif tipo_res == 'wo_b':
            stats[tb]['v'] += 1
            stats[tb]['pts'] += pts_v
            stats[ta]['d'] += 1
        elif tipo_res == 'empate':
            # MD2 1–1 aguardando desempate — ambos ganham 1pt provisório
            stats[ta]['e'] += 1
            stats[ta]['pts'] += 1
            stats[ta]['gf'] += gA
            stats[ta]['gc'] += gB
            stats[tb]['e'] += 1
            stats[tb]['pts'] += 1
            stats[tb]['gf'] += gB
            stats[tb]['gc'] += gA
        else:  # normal
            if gA > gB:
                stats[ta]['v'] += 1
                stats[ta]['pts'] += pts_v
                stats[tb]['d'] += 1
            elif gB > gA:
                stats[tb]['v'] += 1
                stats[tb]['pts'] += pts_v
                stats[ta]['d'] += 1
            else:
                stats[ta]['e'] += 1
                stats[ta]['pts'] += 1
                stats[tb]['e'] += 1
                stats[tb]['pts'] += 1
            stats[ta]['gf'] += gA
            stats[ta]['gc'] += gB
            stats[tb]['gf'] += gB
            stats[tb]['gc'] += gA

    result = []
    for tid, s in stats.items():
        team = (teams.get(tid) or {})
        result.append({
            'id':   tid,
            'nome': team.get('nome', '?'),
            'cor':  team.get('cor', '#888888'),
            'j':    s['v'] + s['e'] + s['d'],
            'gd':   s['gf'] - s['gc'],
            **s,
        })

    result.sort(key=lambda x: (-x['pts'], -x['v'], -x['gd'], -x['gf']))
    return result


def build_tabela_embed(classificacao: list) -> discord.Embed:
    embed = discord.Embed(title="📊  Classificação", color=GOLD)
    if not classificacao:
        embed.description = "Nenhum resultado registrado ainda."
        embed.set_footer(text="Atualizado automaticamente a cada resultado")
        return embed

    medals = ['🥇', '🥈', '🥉']
    lines = []
    for i, t in enumerate(classificacao):
        pos = medals[i] if i < 3 else f"`{i + 1}.`"
        gd  = f"+{t['gd']}" if t['gd'] > 0 else str(t['gd'])
        vde = f"{t['v']}V {t['e']}E {t['d']}D"
        lines.append(f"{pos} **{t['nome']}** — **{t['pts']}** pts  ·  {vde}  ·  SG {gd}")

    embed.description = "\n".join(lines)
    embed.set_footer(text="Atualizado automaticamente a cada resultado")
    return embed


# ── Cog principal ─────────────────────────────────────────────────────────────

class CampeonatoCog(commands.Cog):
    def __init__(self, bot):
        self.bot               = bot
        self._loop             = None
        self._boot_ts          = int(time.time() * 1000)
        self._confrontos_cache: dict = {}
        self._listeners        = []

    @commands.Cog.listener()
    async def on_ready(self):
        if self._listeners:
            return
        self._loop = asyncio.get_event_loop()
        try:
            listener = db.reference("/confrontos").listen(self._on_confrontos)
            self._listeners = [listener]
            print("CampeonatoCog: listener /confrontos ativo.")
        except Exception as e:
            print(f"CampeonatoCog: erro ao registrar listener — {e}")

    # ── Firebase listener ─────────────────────────────────────────────────────

    def _on_confrontos(self, event):
        asyncio.run_coroutine_threadsafe(
            self._process_event(event.path, event.data), self._loop
        )

    async def _process_event(self, path: str, data):
        if path == "/":
            # carga inicial — só popula o cache, sem notificar
            if isinstance(data, dict):
                self._confrontos_cache = dict(data)
            return

        parts = path.strip("/").split("/")
        cid   = parts[0]

        prev = self._confrontos_cache.get(cid) or {}

        # Atualiza o cache localmente
        if data is None:
            self._confrontos_cache.pop(cid, None)
            return

        if len(parts) == 1:
            new_c = data if isinstance(data, dict) else {}
        else:
            # atualização parcial (ex: só o campo 'status' mudou)
            new_c = dict(prev)
            new_c[parts[1]] = data

        old_status = prev.get("status") if isinstance(prev, dict) else None
        new_status = new_c.get("status") if isinstance(new_c, dict) else None

        self._confrontos_cache[cid] = new_c

        # Não notifica a carga inicial (old_status == None significa que não sabíamos nada antes)
        if old_status is None or new_status == old_status:
            return

        teams   = db.reference("/teams").get() or {}
        rodadas = db.reference("/rodadas").get() or {}

        await self._notify(new_c, old_status, new_status, teams, rodadas)

        if new_status in {"realizado", "empate_pendente"}:
            await self._update_tabela(teams)

    # ── Notificações de status ────────────────────────────────────────────────

    async def _notify(self, c: dict, old_status: str, new_status: str, teams: dict, rodadas: dict):
        ta      = (teams.get(c.get("timeA")) or {})
        tb      = (teams.get(c.get("timeB")) or {})
        rodada  = (rodadas.get(c.get("rodadaId")) or {})
        rnum    = rodada.get("numero", "?")
        slot    = SLOT_LABEL.get(c.get("slot", ""), c.get("slot") or "—")
        nome_a  = ta.get("nome", "Time A")
        nome_b  = tb.get("nome", "Time B")
        formato = c.get("formato", "MD2")

        # ── Partida confirmada ────────────────────────────────────────────────
        if new_status == "confirmado":
            embed = discord.Embed(title="📅  Partida Confirmada!", color=GREEN)
            embed.add_field(name="Confronto", value=f"**{nome_a}** vs **{nome_b}**", inline=False)
            embed.add_field(name="Horário",   value=slot,         inline=True)
            embed.add_field(name="Rodada",    value=str(rnum),    inline=True)
            embed.add_field(name="Formato",   value=formato,      inline=True)

            for ch in await self._channels("canal_agenda"):
                await ch.send(embed=embed)
            for ch in await self._channels("canal_campeonato"):
                await ch.send(embed=embed)

        # ── Resultado registrado ──────────────────────────────────────────────
        elif new_status == "realizado":
            resultado = c.get("resultado") or {}
            gA       = int(resultado.get("timeA") or 0)
            gB       = int(resultado.get("timeB") or 0)
            tipo_res = resultado.get("tipo", "normal")

            if tipo_res == "wo_a":
                desc = f"**{nome_a}** venceu por W.O."
                cor  = hex_to_int(ta.get("cor", ""))
            elif tipo_res == "wo_b":
                desc = f"**{nome_b}** venceu por W.O."
                cor  = hex_to_int(tb.get("cor", ""))
            elif tipo_res == "duplo_wo":
                desc = "Duplo W.O. — nenhum time compareceu."
                cor  = RED
            else:
                if gA > gB:
                    desc = f"**{nome_a}** vence!\n`{nome_a}  {gA} – {gB}  {nome_b}`"
                    cor  = hex_to_int(ta.get("cor", ""))
                elif gB > gA:
                    desc = f"**{nome_b}** vence!\n`{nome_a}  {gA} – {gB}  {nome_b}`"
                    cor  = hex_to_int(tb.get("cor", ""))
                else:
                    desc = f"Empate  `{nome_a}  {gA} – {gB}  {nome_b}`"
                    cor  = GOLD

            embed = discord.Embed(title="🏆  Resultado Registrado", description=desc, color=cor)
            embed.add_field(name="Rodada",  value=str(rnum), inline=True)
            embed.add_field(name="Formato", value=formato,   inline=True)

            for ch in await self._channels("canal_campeonato"):
                await ch.send(embed=embed)

        # ── Empate — desempate MD3 pendente ───────────────────────────────────
        elif new_status == "empate_pendente":
            embed = discord.Embed(
                title="⚔️  Empate! Desempate MD3 pendente",
                description=f"**{nome_a}** 1–1 **{nome_b}**\nUm confronto de desempate será agendado.",
                color=GOLD,
            )
            embed.add_field(name="Rodada", value=str(rnum), inline=True)
            for ch in await self._channels("canal_campeonato"):
                await ch.send(embed=embed)

        # ── W.O. pendente ─────────────────────────────────────────────────────
        elif new_status == "wo_pendente":
            embed = discord.Embed(
                title="⚠️  W.O. Pendente",
                description=(
                    f"**{nome_a}** vs **{nome_b}** — Rodada {rnum}\n"
                    "Nenhum time marcou disponibilidade. O admin precisa resolver."
                ),
                color=RED,
            )
            for ch in await self._channels("canal_campeonato"):
                await ch.send(embed=embed)

    # ── Tabela ao vivo ────────────────────────────────────────────────────────

    async def _update_tabela(self, teams: dict):
        confrontos    = db.reference("/confrontos").get() or {}
        classificacao = calcular_classificacao(confrontos, teams)
        embed         = build_tabela_embed(classificacao)
        configs       = load_all_configs()

        for gid_str, cfg in configs.items():
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

            # Se a mensagem sumiu, posta uma nova e salva o ID
            msg = await ch.send(embed=embed)
            save_config(int(gid_str), "tabela_msg_id", msg.id)

    # ── Helper: criar ou usar canal existente ────────────────────────────────

    async def _criar_canal(
        self,
        interaction: discord.Interaction,
        nome: str,
        cargo: discord.Role | None,
    ) -> discord.TextChannel | None:
        try:
            canal = await interaction.guild.create_text_channel(nome)
        except Exception as e:
            print(f"Erro ao criar canal '{nome}': {type(e).__name__}: {e}")
            await interaction.followup.send(
                f"❌ Não foi possível criar o canal.\n`{type(e).__name__}: {e}`",
                ephemeral=True,
            )
            return None

        if cargo:
            await interaction.followup.send(
                f"ℹ️ Canal {canal.mention} criado. Para restringir ao cargo **{cargo.name}**: "
                f"clique com o botão direito em {canal.mention} → **Editar canal** → "
                f"**Permissões** → adicione o cargo e desative **Ver Canal** para `@everyone`.",
                ephemeral=True,
            )

        return canal

    # ── Helper: canais por tipo ───────────────────────────────────────────────

    async def _channels(self, config_key: str) -> list:
        result = []
        try:
            for cfg in (load_all_configs() or {}).values():
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

    # ── /setup-campeonato ─────────────────────────────────────────────────────
    @app_commands.command(
        name="setup-campeonato",
        description="Define o canal de notificações do campeonato (resultados, empates, W.O.)",
    )
    @app_commands.describe(
        criar="Cria um canal #campeonato automaticamente",
        cargo="Cargo que poderá ver o canal criado (opcional)",
    )
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_campeonato(
        self,
        interaction: discord.Interaction,
        criar: bool = False,
        cargo: discord.Role | None = None,
    ):
        await interaction.response.defer(ephemeral=True)
        try:
            if criar:
                canal = await self._criar_canal(interaction, "campeonato", cargo)
                if not canal:
                    return
            else:
                canal = interaction.channel

            save_config(interaction.guild_id, "canal_campeonato", canal.id)
            embed = discord.Embed(
                title="✅  Canal de Campeonato configurado!",
                description=f"{canal.mention} receberá atualizações automáticas do campeonato.",
                color=GREEN,
            )
            embed.add_field(name="🏆 Resultados",        value="Placares registrados pelo admin",           inline=False)
            embed.add_field(name="📅 Partidas marcadas",  value="Quando um horário for confirmado",          inline=False)
            embed.add_field(name="⚔️ Empates",            value="Quando uma série termina 1–1 (MD3 vem aí)", inline=False)
            embed.add_field(name="⚠️ W.O. pendente",      value="Quando ninguém marcou disponibilidade",    inline=False)
            if criar:
                embed.add_field(name="📌 Canal criado", value=canal.mention, inline=False)
            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /setup-tabela ─────────────────────────────────────────────────────────
    @app_commands.command(
        name="setup-tabela",
        description="Posta a classificação ao vivo e a mantém atualizada automaticamente",
    )
    @app_commands.describe(
        criar="Cria um canal #tabela automaticamente",
        cargo="Cargo que poderá ver o canal criado (opcional)",
    )
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_tabela(
        self,
        interaction: discord.Interaction,
        criar: bool = False,
        cargo: discord.Role | None = None,
    ):
        await interaction.response.defer(ephemeral=True)
        try:
            if criar:
                canal = await self._criar_canal(interaction, "tabela", cargo)
                if not canal:
                    return
            else:
                canal = interaction.channel

            save_config(interaction.guild_id, "canal_tabela", canal.id)
            save_config(interaction.guild_id, "tabela_msg_id", None)

            confrontos    = db.reference("/confrontos").get() or {}
            teams         = db.reference("/teams").get() or {}
            classificacao = calcular_classificacao(confrontos, teams)
            embed         = build_tabela_embed(classificacao)

            msg = await canal.send(embed=embed)
            save_config(interaction.guild_id, "tabela_msg_id", msg.id)

            resp = f"✅ Tabela ao vivo postada em {canal.mention}! Será editada automaticamente a cada resultado."
            await interaction.followup.send(resp, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /setup-agenda ─────────────────────────────────────────────────────────
    @app_commands.command(
        name="setup-agenda",
        description="Define o canal de partidas confirmadas (horários acordados pelos times)",
    )
    @app_commands.describe(
        criar="Cria um canal #agenda automaticamente",
        cargo="Cargo que poderá ver o canal criado (opcional)",
    )
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_agenda(
        self,
        interaction: discord.Interaction,
        criar: bool = False,
        cargo: discord.Role | None = None,
    ):
        await interaction.response.defer(ephemeral=True)
        try:
            if criar:
                canal = await self._criar_canal(interaction, "agenda", cargo)
                if not canal:
                    return
            else:
                canal = interaction.channel

            save_config(interaction.guild_id, "canal_agenda", canal.id)
            embed = discord.Embed(
                title="✅  Canal de Agenda configurado!",
                description=(
                    f"{canal.mention} receberá um aviso cada vez que "
                    "dois times confirmarem um horário para jogar."
                ),
                color=BLUE,
            )
            if criar:
                embed.add_field(name="📌 Canal criado", value=canal.mention, inline=False)
            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── Erro de permissão para todos os /setup-* ──────────────────────────────
    @cmd_setup_campeonato.error
    @cmd_setup_tabela.error
    @cmd_setup_agenda.error
    async def setup_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message(
                "❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.",
                ephemeral=True,
            )


async def setup(bot):
    await bot.add_cog(CampeonatoCog(bot))
