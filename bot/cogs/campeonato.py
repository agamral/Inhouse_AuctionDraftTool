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
            try:
                overwrites = {
                    interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False),
                    cargo: discord.PermissionOverwrite(view_channel=True, read_message_history=True),
                }
                await canal.edit(overwrites=overwrites)
                print(f"Permissões aplicadas em #{nome} para cargo '{cargo.name}'")
            except Exception as e:
                status  = getattr(e, 'status', '?')
                code    = getattr(e, 'code', '?')
                text    = getattr(e, 'text', '')
                print(f"Falha ao aplicar permissões em #{nome}: {type(e).__name__} status={status} code={code} text={text}")
                await interaction.followup.send(
                    f"⚠️ Canal {canal.mention} criado, mas não consegui aplicar as permissões "
                    f"(`{type(e).__name__} {status}/{code}`).\n"
                    f"Restrinja manualmente: botão direito no canal → **Editar canal** → **Permissões**.",
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

            boas_vindas = discord.Embed(
                title="🏆  Copa Inhouse — Campeonato",
                description=(
                    "Este canal recebe atualizações automáticas sempre que algo acontece no campeonato. "
                    "Não é necessário nenhum comando — tudo chega aqui sozinho."
                ),
                color=GREEN,
            )
            boas_vindas.add_field(name="🏆 Resultado registrado",  value="Placar de uma partida lançado pelo admin",       inline=False)
            boas_vindas.add_field(name="📅 Partida confirmada",     value="Dois times acordaram um horário para jogar",     inline=False)
            boas_vindas.add_field(name="⚔️ Empate — MD3 pendente", value="Série terminou 1–1, desempate será agendado",    inline=False)
            boas_vindas.add_field(name="⚠️ W.O. pendente",          value="Nenhum time marcou disponibilidade, admin avaliará", inline=False)
            boas_vindas.set_footer(text="Atualizações em tempo real via Firebase · Copa Inhouse Bot")
            await canal.send(embed=boas_vindas)

            await interaction.followup.send(
                f"✅ Canal {canal.mention} configurado!", ephemeral=True
            )
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

            info = discord.Embed(
                title="📊  Copa Inhouse — Classificação ao Vivo",
                description=(
                    "A mensagem abaixo é editada automaticamente pelo bot a cada resultado registrado. "
                    "Não é necessário nenhum comando."
                ),
                color=GOLD,
            )
            info.set_footer(text="Atualização automática via Firebase · Copa Inhouse Bot")
            await canal.send(embed=info)

            confrontos    = db.reference("/confrontos").get() or {}
            teams         = db.reference("/teams").get() or {}
            classificacao = calcular_classificacao(confrontos, teams)
            tabela_embed  = build_tabela_embed(classificacao)

            msg = await canal.send(embed=tabela_embed)
            save_config(interaction.guild_id, "tabela_msg_id", msg.id)

            await interaction.followup.send(
                f"✅ Tabela ao vivo configurada em {canal.mention}!", ephemeral=True
            )
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

            boas_vindas = discord.Embed(
                title="📅  Copa Inhouse — Agenda de Partidas",
                description=(
                    "Sempre que dois times confirmarem um horário para jogar, "
                    "um aviso aparecerá aqui automaticamente."
                ),
                color=BLUE,
            )
            boas_vindas.add_field(
                name="Como funciona",
                value=(
                    "Os capitães marcam sua disponibilidade em "
                    "[copa.inhouse/agendamento](https://copa.inhouse/agendamento). "
                    "Quando há horário em comum, a partida é confirmada e este canal é notificado."
                ),
                inline=False,
            )
            boas_vindas.set_footer(text="Atualizações em tempo real via Firebase · Copa Inhouse Bot")
            await canal.send(embed=boas_vindas)

            await interaction.followup.send(
                f"✅ Canal {canal.mention} configurado!", ephemeral=True
            )
        except Exception as e:
            await interaction.followup.send(f"❌ Erro: {e}", ephemeral=True)

    # ── /setup ────────────────────────────────────────────────────────────────
    @app_commands.command(
        name="setup",
        description="Cria todos os canais da Copa Inhouse de uma só vez",
    )
    @app_commands.describe(
        cargo="Cargo que poderá ver os canais criados (opcional)",
    )
    @app_commands.checks.has_permissions(manage_channels=True)
    async def cmd_setup_geral(
        self,
        interaction: discord.Interaction,
        cargo: discord.Role | None = None,
    ):
        await interaction.response.defer(ephemeral=True)

        criados  = []   # (emoji, nome, canal)
        falhas   = []   # nomes que falharam

        # ── Definições dos 4 canais ───────────────────────────────────────────
        async def criar_leilao():
            canal = await self._criar_canal(interaction, "leilao", cargo)
            if not canal:
                falhas.append("leilao")
                return
            save_config(interaction.guild_id, "canal_leilao", canal.id)
            bv = discord.Embed(
                title="⚔️  Copa Inhouse — Leilão de Times",
                description="Este canal acompanha o leilão ao vivo. Tudo chega aqui automaticamente.",
                color=GOLD,
            )
            bv.add_field(name="🚀 Leilão iniciado",  value="Admin abre o leilão e define o primeiro turno",           inline=False)
            bv.add_field(name="✅ Compra",            value="Jogador, elo, função, preço pago e novo preço de mercado", inline=False)
            bv.add_field(name="⚔️ Roubo",             value="Quem roubou, de quem, preço e reembolso ao time roubado", inline=False)
            bv.add_field(name="🏁 Encerrado",         value="Roster completo de todos os times formados",              inline=False)
            bv.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=bv)
            criados.append(("⚔️", "leilao", canal))

        async def criar_campeonato():
            canal = await self._criar_canal(interaction, "campeonato", cargo)
            if not canal:
                falhas.append("campeonato")
                return
            save_config(interaction.guild_id, "canal_campeonato", canal.id)
            bv = discord.Embed(
                title="🏆  Copa Inhouse — Campeonato",
                description="Notificações automáticas de tudo que acontece no campeonato.",
                color=GREEN,
            )
            bv.add_field(name="🏆 Resultado",         value="Placar lançado pelo admin",                   inline=False)
            bv.add_field(name="📅 Partida confirmada", value="Dois times acordaram horário para jogar",     inline=False)
            bv.add_field(name="⚔️ Empate — MD3",       value="Série terminou 1–1, desempate será agendado", inline=False)
            bv.add_field(name="⚠️ W.O. pendente",      value="Nenhum time marcou disponibilidade",          inline=False)
            bv.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=bv)
            criados.append(("🏆", "campeonato", canal))

        async def criar_agenda():
            canal = await self._criar_canal(interaction, "agenda", cargo)
            if not canal:
                falhas.append("agenda")
                return
            save_config(interaction.guild_id, "canal_agenda", canal.id)
            bv = discord.Embed(
                title="📅  Copa Inhouse — Agenda de Partidas",
                description="Um aviso é postado aqui toda vez que dois times confirmam horário para jogar.",
                color=BLUE,
            )
            bv.add_field(
                name="Como funciona",
                value="Capitães marcam disponibilidade no site. Quando há horário em comum, a partida é confirmada automaticamente.",
                inline=False,
            )
            bv.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=bv)
            criados.append(("📅", "agenda", canal))

        async def criar_tabela():
            canal = await self._criar_canal(interaction, "tabela", cargo)
            if not canal:
                falhas.append("tabela")
                return
            save_config(interaction.guild_id, "canal_tabela", canal.id)
            save_config(interaction.guild_id, "tabela_msg_id", None)
            info = discord.Embed(
                title="📊  Copa Inhouse — Classificação ao Vivo",
                description="A mensagem abaixo é editada automaticamente a cada resultado registrado.",
                color=GOLD,
            )
            info.set_footer(text="Copa Inhouse Bot · tempo real via Firebase")
            await canal.send(embed=info)
            confrontos    = db.reference("/confrontos").get() or {}
            teams         = db.reference("/teams").get() or {}
            classificacao = calcular_classificacao(confrontos, teams)
            msg = await canal.send(embed=build_tabela_embed(classificacao))
            save_config(interaction.guild_id, "tabela_msg_id", msg.id)
            criados.append(("📊", "tabela", canal))

        # ── Executa em sequência ──────────────────────────────────────────────
        for fn in [criar_leilao, criar_campeonato, criar_agenda, criar_tabela]:
            try:
                await fn()
            except Exception as e:
                print(f"Setup geral — erro inesperado: {e}")

        # ── Resumo final ──────────────────────────────────────────────────────
        resumo = discord.Embed(
            title="✅  Copa Inhouse configurada!",
            description=f"{len(criados)} canal{'is' if len(criados) != 1 else ''} criado{'s' if len(criados) != 1 else ''} e prontos para uso.",
            color=GOLD,
        )
        for emoji, nome, canal in criados:
            resumo.add_field(name=f"{emoji} #{nome}", value=canal.mention, inline=True)

        if falhas:
            resumo.add_field(
                name="⚠️ Falhas",
                value=", ".join(f"#{f}" for f in falhas) + "\nCrie esses canais manualmente e use os comandos `/setup-*` individuais.",
                inline=False,
            )

        if cargo:
            resumo.add_field(
                name="🔒 Cargo aplicado",
                value=cargo.mention,
                inline=False,
            )

        resumo.set_footer(text="Use /status para verificar a conexão com o Firebase.")
        await interaction.followup.send(embed=resumo, ephemeral=True)

    # ── Erro de permissão para todos os /setup-* ──────────────────────────────
    @cmd_setup_campeonato.error
    @cmd_setup_tabela.error
    @cmd_setup_agenda.error
    @cmd_setup_geral.error
    async def setup_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message(
                "❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.",
                ephemeral=True,
            )


async def setup(bot):
    await bot.add_cog(CampeonatoCog(bot))
