/**
 * Mapas (battlegrounds) do Heroes of the Storm
 * Imagens baixadas de psionic-storm.com para /public/maps/
 * Execute: npm run download-maps
 */

const BASE = import.meta.env.PROD
  ? 'https://psionic-storm.com/wp-content/themes/psionicstorm/img/battlegrounds'
  : '/maps'

// ── Informações detalhadas por mapa ──────────────────────────────────────────
// Editar aqui para atualizar as informações no espectador.
//
// layoutUrl: imagem overhead/minimap do mapa.
//   Como obter: acesse heroesofthestorm.fandom.com/wiki/{NomeDoMapa},
//   clique na imagem do layout do mapa e copie a URL do arquivo
//   (começa com https://static.wikia.nocookie.net/heroesofthestorm/...).

export const MAPAS_INFO = {
  'alterac-pass': {
    objetivo: 'General Drakkisath',
    // Tributos surgem pelo mapa periodicamente. Capturar um Tributo convoca
    // cavalaria aliada. Ao coletar Tributos suficientes, o General Drakkisath
    // é invocado e avança destruindo estruturas inimigas.
    descricao: 'Tributos surgem periodicamente pelo mapa. Capture-os antes do time inimigo para convocar cavalaria aliada. Com Tributos suficientes, o poderoso General Drakkisath é invocado e avança destruindo estruturas inimigas.',
    layoutUrl: null,
  },
  'battlefield-of-eternity': {
    objetivo: 'Imortal',
    // Um Imortal por time luta no centro. Ajude o seu atacando o inimigo.
    // Quando o Imortal inimigo é derrotado, o seu avança pela lane central
    // empoderado — quanto maior a vantagem de tempo, mais forte ele fica.
    descricao: 'Um Imortal luta por cada time no centro do mapa. Ajude o seu atacando o Imortal inimigo. Quando o Imortal inimigo é derrotado, o seu avança pela lane central — quanto maior a diferença de tempo na luta, mais fortalecido ele fica.',
    layoutUrl: null,
  },
  'blackhearts-bay': {
    objetivo: 'Canhão do Blackheart',
    descricao: 'Colete Doubloons de baús e inimigos e entregue-as ao Capitão Blackheart. Com moedas suficientes, ele dispara os canhões do navio contra as estruturas inimigas causando dano massivo.',
    layoutUrl: null,
  },
  'braxis-holdout': {
    objetivo: 'Onda Zerg',
    // Dois beacons no mapa. Capture-os para encher o medidor Zerg do seu time.
    // Quando um beacon é perdido, a porcentagem acumulada é liberada como
    // onda Zerg. Quem tiver mais % lança uma onda maior.
    descricao: 'Capture e mantenha os dois Beacons para acumular Zergs em espera. Quando um Beacon é perdido, as porcentagens acumuladas se convertem em ondas Zerg — quem acumulou mais lança uma onda devastadoramente maior.',
    layoutUrl: null,
  },
  'cursed-hollow': {
    objetivo: 'Maldição do Senhor Corvo',
    // Tributos surgem em locais fixos. Ao coletar 3 Tributos, o time inimigo
    // fica Amaldiçoado: estruturas param de atacar e servos viram esqueletos
    // com 1 de vida. A maldição dura até o próximo Tributo ser coletado.
    descricao: 'Tributos surgem em pontos fixos do mapa. Ao coletar 3 Tributos, o time inimigo é Amaldiçoado: suas estruturas param de atacar e todos os seus servos se tornam esqueletos com apenas 1 ponto de vida.',
    layoutUrl: null,
  },
  'dragon-shire': {
    objetivo: 'Cavaleiro Dragão',
    // Dois shrines no mapa: Dragon Shrine e Sunken Temple. Um herói aliado
    // deve canalizar cada shrine simultaneamente para ativar o Poço do Dragão.
    // Um terceiro herói pode então se transformar no Cavaleiro Dragão.
    descricao: 'Dois Shrines precisam ser canalizados simultaneamente por heróis aliados para ativar o Poço do Dragão. Um terceiro companheiro pode então se transformar no poderoso Cavaleiro Dragão e devastar as lanes inimigas.',
    layoutUrl: null,
  },
  'garden-of-terror': {
    objetivo: 'Terror do Jardim',
    // À noite, Garden Terrors surgem em três locais. Mate-os para coletar
    // Seeds. Com Seeds suficientes, um herói aliado pode se transformar no
    // Garden Terror e destruir estruturas inimigas.
    descricao: 'À noite, Terrores do Jardim surgem em três pontos do mapa. Mate-os para coletar Sementes. Com Sementes suficientes, um herói aliado pode se transformar no Terror e avançar destruindo estruturas inimigas.',
    layoutUrl: null,
  },
  'hanamura-temple': {
    objetivo: 'Pontos de Pagamento',
    descricao: 'Capture Pontos de Carga para enviar pacotes ao Ponto de Pagamento inimigo. Cada entrega bem-sucedida causa dano direto ao Núcleo adversário. Proteja os seus carregadores e intercepte os deles.',
    layoutUrl: null,
  },
  'haunted-mines': {
    objetivo: 'Golem de Caveira',
    descricao: 'Periodicamente, as Minas abrem e os heróis descem para coletar Caveiras matando esqueletos. Quanto mais Caveiras sua equipe coleta em relação ao inimigo, mais forte será o Golem invocado para avançar pelas lanes.',
    layoutUrl: null,
  },
  'infernal-shrines': {
    objetivo: 'Punidor',
    // Quando um Shrine ativa, spawna 30-40 esqueletos (Sanctuary Guardians).
    // O time que matar mais esqueletos invoca um Punidor que caça heróis.
    // Três tipos: Arcano (cone de dano), Gélido (slow em área), Físico (empurra).
    descricao: 'Quando um Santuário Infernal ativa, esqueletos surgem ao redor dele. O time que eliminar mais esqueletos invoca um Punidor — um guardião infernal que persegue e ataca heróis inimigos até ser destruído.',
    layoutUrl: null,
  },
  'sky-temple': {
    objetivo: 'Templos do Céu',
    // Três Templos ativam sequencialmente. Capturar um Templo faz ele atirar
    // num alvo aleatório (estrutura ou herói inimigo). Heróis no Templo podem
    // ser alvo dos guardiões do Templo adversário.
    descricao: 'Templos do Céu ativam periodicamente pelo mapa. Capture-os antes do time inimigo — cada Templo capturado dispara raios continuamente em estruturas ou heróis adversários enquanto permanecer sob seu controle.',
    layoutUrl: null,
  },
  'tomb-of-the-spider-queen': {
    objetivo: 'Coletoras de Teias',
    // Matar inimigos dropa Gemas. Depositar Gemas nos Altares da Rainha acumula
    // pontos. Ao atingir o limite, Webweavers são invocadas em todas as lanes.
    // Morrer faz você dropar metade das Gemas que carregava.
    descricao: 'Elimine heróis inimigos para coletar Gemas e entregue-as nos Altares da Rainha Aranha. Ao depositar Gemas suficientes, Coletoras de Teias são invocadas e avançam por todas as lanes simultaneamente.',
    layoutUrl: null,
  },
  'towers-of-doom': {
    objetivo: 'Sinos dos Altares',
    // O Núcleo é INVULNERÁVEL a ataques diretos de heróis e servos.
    // Capture Altares de Tempestades para fazer os Sinos tocarem, causando
    // dano direto ao Núcleo inimigo. O dano escala com os Altares capturados.
    descricao: 'O Núcleo inimigo é completamente invulnerável a ataques diretos. A única forma de vencer é capturar Altares de Tempestades para fazer os Sinos tocarem — cada repique causa dano direto ao Núcleo adversário.',
    layoutUrl: null,
  },
  'volskaya-foundry': {
    objetivo: 'Protetor Triglav',
    // Dois Control Points no mapa. Capturar ambos simultaneamente invoca o
    // Triglav Protector. Um herói pilota (controla movimento e ataque principal)
    // e um segundo herói pode embarcar para controlar ataques secundários.
    descricao: 'Capture dois Pontos de Controle simultaneamente para invocar o Protetor Triglav. Um herói pilota o mech controlando movimento, enquanto um segundo aliado pode embarcar para controlar os ataques secundários.',
    layoutUrl: null,
  },
  'warhead-junction': {
    objetivo: 'Ogiva Nuclear',
    descricao: 'Ogivas Nucleares surgem pelo mapa periodicamente. Colete-as e use-as para lançar ataques nucleares devastadores em estruturas inimigas. Inimigos que carregam ogivas ficam visíveis — mate-os para roubar a carga.',
    layoutUrl: null,
  },
}

export const MAPAS = [
  { id: 'alterac-pass',             nome: 'Alterac Pass'              },
  { id: 'battlefield-of-eternity',  nome: 'Battlefield of Eternity'   },
  { id: 'blackhearts-bay',          nome: "Blackheart's Bay"          },
  { id: 'braxis-holdout',           nome: 'Braxis Holdout'            },
  { id: 'cursed-hollow',            nome: 'Cursed Hollow'             },
  { id: 'dragon-shire',             nome: 'Dragon Shire'              },
  { id: 'garden-of-terror',         nome: 'Garden of Terror'          },
  { id: 'hanamura-temple',          nome: 'Hanamura Temple'           },
  { id: 'haunted-mines',            nome: 'Haunted Mines'             },
  { id: 'infernal-shrines',         nome: 'Infernal Shrines'          },
  { id: 'sky-temple',               nome: 'Sky Temple'                },
  { id: 'tomb-of-the-spider-queen', nome: 'Tomb of the Spider Queen'  },
  { id: 'towers-of-doom',           nome: 'Towers of Doom'            },
  { id: 'volskaya-foundry',         nome: 'Volskaya Foundry'          },
  { id: 'warhead-junction',         nome: 'Warhead Junction'          },
].map(m => ({ ...m, splashUrl: `${BASE}/${m.id}.jpg`, ...(MAPAS_INFO[m.id] ?? {}) }))

// Pool desta temporada — usado como padrão no pick de mapas
export const POOL_TEMPORADA = [
  'alterac-pass', 'battlefield-of-eternity', 'braxis-holdout',
  'cursed-hollow', 'dragon-shire', 'garden-of-terror',
  'infernal-shrines', 'sky-temple', 'tomb-of-the-spider-queen',
  'towers-of-doom', 'volskaya-foundry',
]

export function getMapaById(id) {
  return MAPAS.find(m => m.id === id) ?? null
}
