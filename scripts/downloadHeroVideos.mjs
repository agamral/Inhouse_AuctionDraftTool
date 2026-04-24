/**
 * Baixa os vídeos webm dos heróis de psionic-storm.com para /public/videos/
 *
 * Execute uma vez antes do deploy:
 *   npm run download-videos
 *
 * Arquivos já baixados são pulados automaticamente.
 * Erros (slug errado, servidor offline) são reportados mas não interrompem o restante.
 */

import { createWriteStream, mkdirSync, existsSync, statSync, renameSync, unlinkSync } from 'fs'
import { get }  from 'https'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '..', 'public', 'videos')
const BASE       = 'https://psionic-storm.com/media/videos/skins'

mkdirSync(OUTPUT_DIR, { recursive: true })

// ── Mapeamento heroId → slug (espelho de heroVideos.js) ───────────────────────
const SLUGS = {
  // TANKS
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
  // BRUISERS
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
  // MELEE ASSASSINS
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
  // RANGED ASSASSINS
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
  // HEALERS
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
  // SUPPORTS
  abathur:        'evolution-master',
  medivh:         'the-last-guardian',
  thelostvikings: 'triple-trouble',
  zarya:          'defender-of-russia',
}

// ── Download com retry ────────────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // Pula se já existe e tem tamanho > 0
    if (existsSync(dest) && statSync(dest).size > 0) {
      resolve('skip')
      return
    }

    const tmp = dest + '.tmp'
    const file = createWriteStream(tmp)

    get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        try { renameSync(tmp, dest) } catch { /* tmp já foi removido */ }
        resolve('ok')
      })
      file.on('error', (err) => {
        try { unlinkSync(tmp) } catch { /* nada */ }
        reject(err)
      })
    }).on('error', (err) => { file.close(); reject(err) })
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

const entries = Object.entries(SLUGS)
const total   = entries.length
let ok = 0, skipped = 0, failed = 0

console.log(`\nBaixando ${total} vídeos para ${OUTPUT_DIR}\n`)

for (const [heroId, slug] of entries) {
  const url  = `${BASE}/${slug}.webm`
  const dest = join(OUTPUT_DIR, `${slug}.webm`)
  const idx  = ok + skipped + failed + 1

  process.stdout.write(`[${String(idx).padStart(2)}/${total}] ${heroId.padEnd(15)} `)

  try {
    const result = await downloadFile(url, dest)
    if (result === 'skip') {
      process.stdout.write('já existe\n')
      skipped++
    } else {
      process.stdout.write('ok\n')
      ok++
    }
  } catch (e) {
    process.stdout.write(`ERRO — ${e.message}\n`)
    failed++
  }
}

console.log(`\n✓ ${ok} baixados  •  ${skipped} já existiam  •  ${failed} erros\n`)
if (failed > 0) {
  console.log('Heróis com erro usarão o fallback de imagem estática no draft.\n')
}
