/**
 * Mapeamento heroId → slug da skin padrão no psionic-storm.com
 * URL do vídeo: https://psionic-storm.com/media/videos/skins/{slug}.webm
 *
 * Todos os slugs foram confirmados buscando cada página de herói no site.
 *
 * Casos especiais:
 *   - cho / gall usam prefixo "cho_" / "gall_" (compartilham o mesmo modelo)
 *   - greymane usa prefixo "greymane_"
 *   - valeera usa prefixo "standard_"
 *   - varian usa prefixo de role "warrior_"
 */

// Vídeos servidos localmente de /public/videos/ (baixar com: npm run download-videos)
// Fallback automático para imagem estática no componente se o arquivo não existir.
const BASE = '/videos'

const SLUGS = {
  // ── TANKS ──────────────────────────────────────────────────────────────────
  anubarak:       'traitor-king',
  arthas:         'the-lich-king',
  blaze:          'veteran-firebat',
  cho:            'cho_twilights-hammer-chieftain',
  diablo:         'lord-of-terror',
  etc:            'rock-god',
  garrosh:        'son-of-hellscream',
  johanna:        'crusader-of-zakarum',
  malganis:       'nathrezim-lord',
  mei:            'adventuring-climatologist',
  muradin:        'mountain-king',
  stitches:       'terror-of-darkshire',
  tyrael:         'archangel-of-justice',

  // ── BRUISERS ────────────────────────────────────────────────────────────────
  artanis:        'hierarch-of-the-daelaam',
  chen:           'legendary-brewmaster',
  deathwing:      'the-destroyer',
  dehaka:         'primal-pack-leader',
  dva:            'meka-pilot',
  gazlowe:        'boss-of-ratchet',
  hogger:         'scourge-of-elwynn',
  imperius:       'archangel-of-valor',
  leoric:         'the-skeleton-king',
  malthael:       'aspect-of-death',
  ragnaros:       'the-firelord',
  rexxar:         'champion-of-the-horde',
  samuro:         'the-blademaster',
  sonya:          'wandering-barbarian',
  thrall:         'warchief-of-the-horde',
  varian:         'warrior_high-king-of-the-alliance',
  yrel:           'light-of-hope',

  // ── MELEE ASSASSINS ─────────────────────────────────────────────────────────
  alarak:         'highlord-of-the-taldarim',
  illidan:        'the-betrayer',
  kerrigan:       'queen-of-blades',
  maiev:          'the-warden',
  murky:          'baby-murloc',
  qhira:          'realmless-bounty-hunter',
  thebutcher:     'flesh-carver',
  valeera:        'standard_shadow-of-the-uncrowned',
  zeratul:        'dark-prelate',
  genji:          'cybernetic-ninja',

  // ── RANGED ASSASSINS ────────────────────────────────────────────────────────
  azmodan:        'lord-of-sin',
  cassia:         'amazon-warmatron',
  chromie:        'keeper-of-time',
  falstad:        'wildhammer-thane',
  fenix:          'steward-of-the-templar',
  gall:           'gall_twilights-hammer-chieftain',
  greymane:       'greymane_lord-of-the-worgen',
  guldan:         'darkness-incarnate',
  hanzo:          'master-assassin',
  jaina:          'archmage',
  junkrat:        'junker-demolitionist',
  kaelthas:       'the-sun-king',
  kelthuzad:      'archlich-of-naxxramas',
  liming:         'rebellious-wizard',
  lunara:         'first-daughter-of-cenarius',
  mephisto:       'lord-of-hatred',
  nazeebo:        'heretic-witch-doctor',
  nova:           'dominion-ghost',
  orphea:         'heir-of-raven-court',
  probius:        'curious-probe',
  raynor:         'renegade-commander',
  sgthammer:      'siege-tank-operator',
  sylvanas:       'the-banshee-queen',
  tassadar:       'savior-of-the-templar',
  tracer:         'agent-of-overwatch',
  tychus:         'notorious-outlaw',
  valla:          'demon-hunter',
  xul:            'cryptic-necromancer',
  zagara:         'broodmother-of-the-swarm',
  zuljin:         'warlord-of-the-amani',

  // ── HEALERS ─────────────────────────────────────────────────────────────────
  alexstrasza:    'the-life-binder',
  ana:            'veteran-sniper',
  anduin:         'king-of-stormwind',
  auriel:         'archangel-of-hope',
  brightwing:     'faerie-dragon',
  deckard:        'the-last-horadrim',
  kharazim:       'veradani-monk',
  lili:           'world-wanderer',
  ltmorales:      'combat-medic',
  lucio:          'freedom-fighting-dj',
  malfurion:      'archdruid',
  rehgar:         'shaman-of-the-earthen-ring',
  stukov:         'infested-admiral',
  tyrande:        'high-priestess-of-elune',
  uther:          'the-lightbringer',
  whitemane:      'high-inquisitor',

  // ── SUPPORTS ────────────────────────────────────────────────────────────────
  abathur:        'evolution-master',
  medivh:         'the-last-guardian',
  thelostvikings: 'triple-trouble',
  zarya:          'defender-of-russia',
}

/**
 * Retorna a URL do vídeo webm local para um herói, ou null se não mapeado.
 * Baixar os vídeos com: npm run download-videos
 */
export function getHeroVideoUrl(heroId) {
  const slug = SLUGS[heroId]
  if (!slug) return null
  return `${BASE}/${slug}.webm`
}

/**
 * Retorna a URL da imagem fullsize do psionic-storm para um herói.
 * Usada como fallback quando o vídeo não existe (ex: Mei, Deathwing, Hogger, Qhira, Anduin).
 * Mesmo slug, caminho diferente.
 */
export function getHeroImageUrl(heroId) {
  const slug = SLUGS[heroId]
  if (!slug) return null
  return `https://psionic-storm.com/media/img/skins/fullsize/${slug}.jpg`
}
