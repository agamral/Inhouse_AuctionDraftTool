/**
 * Mapas (battlegrounds) do Heroes of the Storm
 * Imagens baixadas de psionic-storm.com para /public/maps/
 * Execute: npm run download-maps
 */

// Splash arts locais em alta resolução (substituem o CDN externo para mapas do pool)
const LOCAL_SPLASH = '/maps/splash'
// Fallback para mapas sem splash local (CDN externo)
const CDN_SPLASH = 'https://psionic-storm.com/wp-content/themes/psionicstorm/img/battlegrounds'

const POOL_LOCAL_SPLASH = new Set([
  'alterac-pass', 'battlefield-of-eternity', 'braxis-holdout', 'cursed-hollow',
  'dragon-shire', 'garden-of-terror', 'infernal-shrines', 'sky-temple',
  'tomb-of-the-spider-queen', 'towers-of-doom', 'volskaya-foundry',
])

// ── Informações detalhadas por mapa ──────────────────────────────────────────
// Editar aqui para atualizar as informações exibidas no espectador.
// layoutUrl: imagens em /public/maps/overhead/ (serve tanto em dev quanto prod).

export const MAPAS_INFO = {
  'alterac-pass': {
    objetivo: 'Cavalaria & General Drakkisath',
    descricao: 'Invada o território inimigo, liberte prisioneiros aliados e chame a cavalaria para reivindicar o campo de batalha para o seu General — mas cuidado com as traiçoeiras armadilhas de lama!',
    layoutUrl: '/maps/overhead/alterac-pass-overhead.webp',
  },
  'battlefield-of-eternity': {
    objetivo: 'Imortal',
    descricao: 'Dois Imortais se enfrentam até que os Heróis intervenham. O time que derrotar o Imortal adversário primeiro permite que o seu Imortal avance pela lane com menor dano estrutural acumulado.',
    layoutUrl: '/maps/overhead/battlefield-of-eternity-overhead.webp',
  },
  'blackhearts-bay': {
    objetivo: 'Canhão do Blackheart',
    descricao: 'Colete Doubloons de baús e inimigos e entregue-as ao Capitão Blackheart. Com moedas suficientes, ele dispara os canhões do navio contra as estruturas inimigas. Heróis que morrem derrubam todas as moedas que carregavam.',
    layoutUrl: null,
  },
  'braxis-holdout': {
    objetivo: 'Onda Zerg',
    descricao: 'Capture e mantenha os dois Beacons para convocar os Zerg. Quanto mais tempo você mantiver ambos os Beacons, mais poderosa fica a sua onda Zerg.',
    layoutUrl: '/maps/overhead/braxis-holdout-overhead.webp',
  },
  'cursed-hollow': {
    objetivo: 'Maldição do Senhor Corvo',
    descricao: 'Colete Tributos para amaldiçoar o time inimigo. Enquanto amaldiçoados, os Servos inimigos ficam com apenas 1 ponto de vida e as Estruturas inimigas param de atacar.',
    layoutUrl: '/maps/overhead/cursed-hollow-overhead.webp',
  },
  'dragon-shire': {
    objetivo: 'Cavaleiro Dragão',
    descricao: 'Controle os Santuários do Sol e da Lua para ativar a estátua do Cavaleiro Dragão. Canalize na estátua para se transformar no poderoso Cavaleiro Dragão e devastar as lanes inimigas.',
    layoutUrl: '/maps/overhead/dragon-shire-overhead.webp',
  },
  'garden-of-terror': {
    objetivo: 'Terror do Jardim',
    descricao: 'Colete Sementes dos Shamblers que surgem pelo mapa. Junte Sementes suficientes para invocar um Terror do Jardim que avança destruindo estruturas pelo seu time.',
    layoutUrl: '/maps/overhead/garden-of-terror-overhead.webp',
  },
  'hanamura-temple': {
    objetivo: 'Payload',
    descricao: 'Escolte o Payload pelo território inimigo. Cada checkpoint alcançado faz o Payload bombardear Estruturas inimigas com dano direto.',
    layoutUrl: null,
  },
  'haunted-mines': {
    objetivo: 'Golem de Caveira',
    descricao: 'Desça às Minas, colete Caveiras derrotando mortos-vivos e invoque um Golem Tumular mais forte que o dos adversários para avançar pelas lanes.',
    layoutUrl: null,
  },
  'infernal-shrines': {
    objetivo: 'Punidor',
    descricao: 'Derrote 40 Guardiões do Santuário antes dos adversários para invocar um Punidor que ataca Heróis e Estruturas inimigas.',
    layoutUrl: '/maps/overhead/infernal-shrines-overhead.webp',
  },
  'sky-temple': {
    objetivo: 'Templos do Céu',
    descricao: 'Capture os Templos e desencadeie ataques poderosos contra as Estruturas inimigas. Mantenha o controle para acumular dano constante ao longo da partida.',
    layoutUrl: '/maps/overhead/sky-temple-overhead.webp',
  },
  'tomb-of-the-spider-queen': {
    objetivo: 'Coletoras de Teias',
    descricao: 'Colete Gemas derrubadas por Servos e Heróis. Entregue Gemas suficientes para invocar Coletoras de Teias que avançam por cada lane simultaneamente.',
    layoutUrl: '/maps/overhead/tomb-of-the-spider-queen-overhead.webp',
  },
  'towers-of-doom': {
    objetivo: 'Sinos dos Altares',
    descricao: 'Capture Altares para causar dano direto ao Núcleo inimigo. Controle Torres de Sino para aumentar o número de disparos realizados por repique — o Núcleo não pode ser atacado diretamente.',
    layoutUrl: '/maps/overhead/towers-of-doom-overhead.webp',
  },
  'volskaya-foundry': {
    objetivo: 'Protetor Triglav',
    descricao: 'Controle o Protetor Triglav capturando o Ponto de Controle. Dois Heróis pilotam o Protetor juntos enquanto o restante do time oferece suporte.',
    layoutUrl: '/maps/overhead/volskaya-foundry-overhead.webp',
  },
  'warhead-junction': {
    objetivo: 'Ogiva Nuclear',
    descricao: 'Colete e lance Ogivas Nucleares para devastar Estruturas inimigas. Inimigos que carregam ogivas ficam marcados — eliminate-os para roubar a carga.',
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
].map(m => ({
  ...m,
  splashUrl: POOL_LOCAL_SPLASH.has(m.id)
    ? `${LOCAL_SPLASH}/${m.id}.webp`
    : `${CDN_SPLASH}/${m.id}.jpg`,
  ...(MAPAS_INFO[m.id] ?? {}),
}))

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
