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
// layoutUrl: imagem overhead/minimap do mapa (null = não exibir).
//   Fonte recomendada: heroesofthestorm.fandom.com (cada página de mapa tem a
//   imagem do layout — clique na imagem e copie a URL do arquivo original).

export const MAPAS_INFO = {
  'alterac-pass': {
    objetivo: 'General Drakkisath',
    descricao: 'Elimine heróis inimigos para coletar Tributos. Com 3 Tributos acumulados, o General Drakkisath é invocado e avança por uma lane devastando estruturas inimigas.',
    layoutUrl: null,
  },
  'battlefield-of-eternity': {
    objetivo: 'Imortal',
    descricao: 'Dois Imortais se enfrentam no centro do mapa. Ajude o seu a vencer o duelo — quanto maior a diferença de tempo na luta, mais fortalecido ele avança pela lane central.',
    layoutUrl: null,
  },
  'blackhearts-bay': {
    objetivo: 'Canhão do Blackheart',
    descricao: 'Colete moedas de baús e inimigos e entregue-as ao Capitão Blackheart. Com moedas suficientes, ele dispara os canhões do navio contra as estruturas inimigas.',
    layoutUrl: null,
  },
  'braxis-holdout': {
    objetivo: 'Onda Zerg',
    descricao: 'Capture e mantenha as balizas Zerg para encher seu medidor de enxame. Ao perder uma baliza, toda a fila é liberada como uma onda zerg devastadora nas lanes inimigas.',
    layoutUrl: null,
  },
  'cursed-hollow': {
    objetivo: 'Maldição do Senhor Corvo',
    descricao: 'Colete 3 Tributos oferecidos pelo Senhor Corvo para lançar uma Maldição sobre os inimigos — suas estruturas param de atacar e seus servos se transformam em esqueletos frágeis.',
    layoutUrl: null,
  },
  'dragon-shire': {
    objetivo: 'Cavaleiro Dragão',
    descricao: 'Capture e mantenha simultaneamente o Santuário do Dragão e o Templo Afundado para invocar o poderoso Cavaleiro Dragão e devastar as defesas inimigas.',
    layoutUrl: null,
  },
  'garden-of-terror': {
    objetivo: 'Terror do Jardim',
    descricao: 'À noite, Terrores do Jardim surgem pelo mapa. Colete Sementes suficientes para invocar seu próprio Terror — uma criatura colossal que destrói estruturas inimigas.',
    layoutUrl: null,
  },
  'hanamura-temple': {
    objetivo: 'Pontos de Pagamento',
    descricao: 'Capture Pontos de Carga para enviar pacotes ao Ponto de Pagamento inimigo. Cada entrega causa dano direto ao Núcleo adversário. Proteja os seus e intercepte os deles.',
    layoutUrl: null,
  },
  'haunted-mines': {
    objetivo: 'Golem de Caveira',
    descricao: 'Colete Caveiras nas Minas para criar um Golem. Quanto mais Caveiras, mais forte o Golem — ele sai das Minas e avança pelas lanes derrubando estruturas no caminho.',
    layoutUrl: null,
  },
  'infernal-shrines': {
    objetivo: 'Punidor',
    descricao: 'Quando um Santuário Infernal ativar, mate os esqueletos mais rápido que o inimigo para invocar um Punidor — um guerreiro infernal que caça e elimina heróis adversários.',
    layoutUrl: null,
  },
  'sky-temple': {
    objetivo: 'Templos do Céu',
    descricao: 'Capture e mantenha os Templos do Céu para que eles disparem raios solares constantes nas estruturas e heróis inimigos, acumulando dano ao longo da partida.',
    layoutUrl: null,
  },
  'tomb-of-the-spider-queen': {
    objetivo: 'Coletoras de Teias',
    descricao: 'Colete Gemas dos inimigos abatidos e deposite-as nos Altares da Rainha. Gemas suficientes invocam Coletoras de Teias que avançam simultaneamente por todas as lanes.',
    layoutUrl: null,
  },
  'towers-of-doom': {
    objetivo: 'Sinos dos Altares',
    descricao: 'O Núcleo inimigo é invulnerável ao ataque direto. Capture Altares de Tempestades para acionar os Sinos e causar dano direto ao Núcleo adversário — a única forma de vencer.',
    layoutUrl: null,
  },
  'volskaya-foundry': {
    objetivo: 'Protetor Triglav',
    descricao: 'Capture dois Pontos de Controle simultaneamente para pilotar o Protetor Triglav — um mech colosso que pode ser controlado por dois jogadores ao mesmo tempo.',
    layoutUrl: null,
  },
  'warhead-junction': {
    objetivo: 'Ogiva Nuclear',
    descricao: 'Colete Ogivas Nucleares espalhadas pelo mapa e lance-as nas estruturas inimigas. Heróis que carregam ogivas ficam marcados — elimine-os para roubar a carga.',
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
