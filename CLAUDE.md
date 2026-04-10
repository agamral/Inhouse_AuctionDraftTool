# Copa Inhouse — Instruções para Claude Code

> Este arquivo é o contexto completo do projeto. Leia tudo antes de qualquer ação.

---

## O que é este projeto

Plataforma web completa para o campeonato **Copa Inhouse** de Heroes of the Storm.  
Inclui: site público, formulário de inscrição, tela de draft/leilão para capitães, tela de transmissão ao vivo para espectadores, painel admin e bot Discord.

Repositório: `https://github.com/agamral/Inhouse_AuctionDraftTool`

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite |
| Roteamento | React Router v6 |
| Estilo | CSS puro com variáveis (sem Tailwind) |
| i18n | i18next + react-i18next |
| Banco de dados | Firebase Realtime Database |
| Autenticação | Firebase Auth (Google OAuth) |
| Backend rules | Firebase Security Rules |
| Bot Discord | Python 3.11 + discord.py |
| Deploy frontend | Vercel |
| Deploy bot | Railway |
| Integração Sheets | Google Apps Script (Web App) |

---

## Identidade visual — OBRIGATÓRIO seguir

```css
/* Cores base */
--bg:       #0a0c10;
--bg2:      #0f1318;
--bg3:      #141820;
--gold:     #c9a84c;
--gold2:    #f0cc6e;
--gold-dim: rgba(201,168,76,0.13);
--border:   rgba(255,255,255,0.07);
--border2:  rgba(255,255,255,0.12);
--text:     #e2ddd6;
--text2:    #8a8680;
--text3:    #3e3c3a;
--red:      #e05555;
--green:    #4caf7d;
--blue:     #4a9eda;
--purple:   #9b6ee8;

/* Fontes — importar do Google Fonts */
Rajdhani        → títulos e headers (700)
Barlow Condensed → labels, badges, UI (400/600/700)
Barlow           → corpo de texto (300/400/500)
```

Dark theme obrigatório. Sem gradientes decorativos. Sem shadows pesados.  
Referência visual já aprovada: ver arquivos `leilao_hots_preview.html` e `leilao_hots_spectator.html` se existirem na pasta `/referencias`.

---

## Estrutura de pastas — criar exatamente assim

```
/
├── CLAUDE.md                  ← este arquivo
├── package.json
├── vite.config.js
├── index.html
├── .env.example               ← variáveis sem valores reais
├── .gitignore
├── /public
│   └── favicon.ico
├── /src
│   ├── main.jsx
│   ├── App.jsx                ← roteamento principal
│   ├── /pages
│   │   ├── Home.jsx
│   │   ├── Inscritos.jsx
│   │   ├── Inscricao.jsx
│   │   ├── Draft.jsx
│   │   ├── Espectador.jsx
│   │   └── Admin.jsx
│   ├── /components
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   ├── PlayerCard.jsx
│   │   ├── TeamPanel.jsx
│   │   ├── AnnounceOverlay.jsx
│   │   └── ProtectedRoute.jsx
│   ├── /hooks
│   │   ├── useAuth.js
│   │   ├── useDraft.js
│   │   └── usePlayers.js
│   ├── /firebase
│   │   ├── config.js          ← variáveis do .env, não hardcodar
│   │   ├── auth.js
│   │   └── database.js
│   ├── /i18n
│   │   ├── index.js
│   │   └── /locales
│   │       ├── pt.json
│   │       ├── es.json
│   │       └── en.json
│   ├── /styles
│   │   ├── global.css
│   │   └── variables.css
│   └── /utils
│       ├── draftRules.js      ← lógica pura do leilão
│       └── formatters.js
├── /bot
│   ├── main.py
│   ├── requirements.txt
│   ├── /cogs
│   │   ├── draft.py
│   │   └── announcements.py
│   └── .env.example
└── /referencias
    ├── leilao_hots_preview.html
    └── leilao_hots_spectator.html
```

---

## Regras do leilão — implementar em `/src/utils/draftRules.js`

```
- 4 a 6 capitães por evento
- Cada capitão começa com 15 moedas
- Preço base de cada player: 0 moedas
- Players premium têm preço base configurável pelo admin
- Capitão já está fixo no próprio time (conta como 1 dos 5~7)
- Capitães são INTOCÁVEIS — não podem ser leiloados
- Times precisam de mínimo 5 e máximo 7 players (capitão incluso)

ORDEM DOS TURNOS:
- Seed reverso estilo NBA Draft (pior seed escolhe primeiro)
- Seed definido pelo admin antes do draft
- Cada capitão compra 1 player por turno
- Após a rodada completa, volta ao primeiro capitão

ROUBO:
- Qualquer capitão pode comprar um player já comprado por outro
- Custo do roubo = preço atual do player + 1
- O capitão anterior recebe REEMBOLSO do valor que pagou originalmente
- O capitão roubado recebe UM TURNO EXTRA imediato
- No turno extra: pode comprar novo, roubar de volta, ou roubar outro

PREÇO:
- Sobe +1 a cada compra (incluindo roubo)
- Exemplo: Player X começa em 0 → comprado por 0 → agora custa 1
  → roubado por 1 → agora custa 2 → roubado por 2 → agora custa 3

ENCERRAMENTO:
- Leilão fecha automaticamente quando TODOS os times têm mínimo 5 players
- Admin pode encerrar manualmente também
- Capitão com time completo entra em standby mas seu time ainda pode ser roubado
- Se roubado em standby: recebe turno extra normalmente

VALIDAÇÕES:
- Capitão não pode comprar se não tiver moedas suficientes
- Time não pode ter mais de 7 players (não pode comprar se já tiver 7)
- Capitão não pode comprar jogador do próprio time
```

---

## Formulário de inscrição — campos exatos

Substituir Google Forms. Enviar dados via POST para Google Apps Script (URL no .env).

```js
campos = {
  email: String,          // auto-preenchido via Google Login
  nomeDiscord: String,    // obrigatório
  battletag: String,      // formato Nick#0000 — validar regex
  pais: String,           // dropdown com bandeiras
  linguas: Array,         // ['pt', 'es', 'en'] — múltipla escolha
  elo: String,            // enum: Bronze|Prata|Ouro|Platina|Diamante|Mestre
  rolePrimaria: String,   // enum: Tank|Offlane|DPS|Healer|Flex
  roleSecundaria: String, // enum: Tank|Offlane|DPS|Healer|Flex|Nenhuma
  querCapitao: String,    // enum: Sim|SoSeNecessario|Nao
  aceitouRegras: Boolean  // obrigatório true para submeter
}
```

Validação do Battletag: `/^.+#\d{4,5}$/`

---

## Módulos e quando ficam ativos

```
Home          → sempre ativo (público)
Inscritos     → sempre ativo (público) — controlado por toggle no Admin
Inscrição     → ativo quando inscrições abertas — toggle no Admin
Draft         → ativo APENAS no dia do evento — toggle no Admin
Espectador    → ativo quando draft está rodando — toggle no Admin
Admin         → sempre acessível mas protegido por login Firebase Admin
```

O Admin controla quais módulos aparecem no nav via Firebase Realtime DB:
```
/config/modules/inscricaoAberta: boolean
/config/modules/draftAtivo: boolean
/config/modules/espectadorAtivo: boolean
```

---

## Internacionalização (i18next)

Idiomas: **PT-BR** (padrão), **ES** (Español), **EN** (English)  
Seletor de idioma no canto direito do Navbar — sempre visível.  
Todos os textos públicos devem ter chave i18n. Textos do Admin podem ser só PT.

Estrutura das chaves:
```json
{
  "nav": { "home": "", "inscritos": "", "inscricao": "", "espectador": "", "draft": "" },
  "home": { "title": "", "subtitle": "", "cards": {} },
  "form": { "title": "", "fields": {}, "submit": "", "rules": "" },
  "inscritos": { "title": "", "filters": {}, "table": {} },
  "draft": { "turn": "", "coins": "", "buy": "", "steal": "", "round": "" },
  "espectador": { "live": "", "spotlight": "", "available": "" }
}
```

---

## Firebase — estrutura do banco de dados

```
/config
  /modules
    inscricaoAberta: boolean
    draftAtivo: boolean
    espectadorAtivo: boolean
  /draft
    moedas: number (15)
    minPlayers: number (5)
    maxPlayers: number (7)
    rouboAtivo: boolean (true)

/players/{playerId}
  nome: string
  discord: string
  battletag: string
  pais: string
  linguas: string[]
  elo: string
  rolePrimaria: string
  roleSecundaria: string
  querCapitao: string
  premium: boolean
  precoBase: number
  confirmado: boolean

/draft/{sessionId}
  status: 'aguardando' | 'rodando' | 'encerrado'
  turnoAtual: string (teamId)
  turnoExtra: string | null (teamId)
  rodada: number
  /teams/{teamId}
    nome: string
    capitao: string
    capitaoId: string
    emoji: string
    cor: string
    moedas: number
    seed: number
    /roster/{playerId}
      nome: string
      preco: number
      isCaptain: boolean
  /playerState/{playerId}
    preco: number
    ownedBy: string | null (teamId)
    historicoPreco: number[]
```

---

## Bot Discord — comportamento

Arquivo: `/bot/main.py`  
Linguagem: Python 3.11  
Biblioteca: discord.py 2.x  

O bot fica online 24/7 e:
1. Ouve eventos do Firebase via listener
2. Posta no canal `#leilão-oficial` quando algo acontece no draft
3. Responde ao comando `/inscritos` com resumo dos jogadores

Mensagens que o bot deve postar:
```
✅ COMPRA: "{capitão} comprou {player} por {X} moedas. Novo preço: {X+1}"
⚔️ ROUBO: "{capitão} ROUBOU {player} de {outro capitão} por {X} moedas! {outro} recebe {Y} de volta."
🔔 TURNO: "Turno de {capitão} — {X} moedas disponíveis"
🏁 FIM: "Draft encerrado! Times formados: [lista]"
```

Variáveis de ambiente do bot:
```
DISCORD_TOKEN=
FIREBASE_CRED_JSON=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=
```

---

## Variáveis de ambiente — .env.example

```env
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Google Sheets (Apps Script Web App URL)
VITE_SHEETS_WEBAPP_URL=

# Admin
VITE_ADMIN_EMAIL=
```

**NUNCA commitar o .env real. Sempre usar .env.example com valores vazios.**

---

## Ordem de implementação recomendada

### Fase 1 — Base (sem Firebase)
```
1. Criar estrutura de pastas completa
2. Configurar Vite + React + React Router
3. Instalar dependências: react-router-dom, i18next, react-i18next, firebase
4. Criar global.css com variáveis de cor e fontes
5. Criar Navbar.jsx com troca de idioma e navegação
6. Criar Home.jsx estática
7. Criar i18n com PT/ES/EN básico
```

### Fase 2 — Páginas estáticas
```
8.  Inscritos.jsx com tabela mockada e filtros funcionais
9.  Inscricao.jsx com formulário completo e validação (sem envio real)
10. Espectador.jsx adaptado do leilao_hots_spectator.html
11. Draft.jsx adaptado do leilao_hots_preview.html
12. Admin.jsx com toggles e configurações (sem Firebase ainda)
```

### Fase 3 — Firebase
```
13. Configurar Firebase project e adicionar config.js
14. Implementar Firebase Auth (Google Login)
15. Implementar leitura/escrita do draft no Realtime DB
16. Implementar security rules
17. Conectar formulário de inscrição ao Apps Script
```

### Fase 4 — Bot e deploy
```
18. Implementar bot Discord com discord.py
19. Conectar bot ao Firebase
20. Deploy frontend no Vercel
21. Deploy bot no Railway
```

---

## Instruções de comportamento para o Claude Code

- **Sempre preservar código existente** — alterar apenas o necessário para nova funcionalidade
- **Nunca hardcodar** tokens, URLs de API ou credenciais — sempre usar variáveis de ambiente
- **Sempre perguntar** antes de deletar ou refatorar algo que já existe
- **CSS sem frameworks externos** — usar as variáveis CSS definidas neste arquivo
- **Componentes pequenos** — preferir componentes focados a componentes gigantes
- **Dados mockados** nas fases 1 e 2 devem ser claramente marcados com comentário `// TODO: conectar Firebase`
- **Commits semânticos**: `feat:`, `fix:`, `style:`, `refactor:`, `docs:`
- Ao terminar uma tarefa, listar o que foi feito e perguntar se funcionou

---

## Como iniciar o projeto do zero

Execute no terminal dentro da pasta do repositório clonado:

```bash
npm create vite@latest . -- --template react
npm install
npm install react-router-dom i18next react-i18next firebase
npm run dev
```

Para o bot:
```bash
cd bot
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install discord.py firebase-admin python-dotenv
```

---

## Contato e contexto adicional

- Desenvolvedor: André (agamral no GitHub)
- Editor: VSCode com Claude Code (VSClaude)
- O projeto usa Claude.ai (claude.ai) para planejamento e Claude Code para implementação
- Dúvidas de regras do leilão ou design: consultar este arquivo primeiro
- Os arquivos `leilao_hots_preview.html` e `leilao_hots_spectator.html` na pasta `/referencias` são a referência visual aprovada — o React deve replicar esse visual
