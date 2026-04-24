/**
 * Baixa as imagens splash dos mapas de psionic-storm.com para /public/maps/
 *
 * Execute:
 *   npm run download-maps
 */

import { createWriteStream, mkdirSync, existsSync, statSync, renameSync, unlinkSync } from 'fs'
import { get }  from 'https'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '..', 'public', 'maps')
const BASE       = 'https://psionic-storm.com/wp-content/themes/psionicstorm/img/battlegrounds'

mkdirSync(OUTPUT_DIR, { recursive: true })

const MAPAS = [
  'alterac-pass',
  'battlefield-of-eternity',
  'blackhearts-bay',
  'braxis-holdout',
  'cursed-hollow',
  'dragon-shire',
  'garden-of-terror',
  'hanamura-temple',
  'haunted-mines',
  'infernal-shrines',
  'sky-temple',
  'tomb-of-the-spider-queen',
  'towers-of-doom',
  'volskaya-foundry',
  'warhead-junction',
]

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (existsSync(dest) && statSync(dest).size > 0) {
      resolve('skip')
      return
    }

    const tmp  = dest + '.tmp'
    const file = createWriteStream(tmp)

    get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        try { unlinkSync(tmp) } catch { /* nada */ }
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        try { renameSync(tmp, dest) } catch { /* nada */ }
        resolve('ok')
      })
      file.on('error', (err) => {
        try { unlinkSync(tmp) } catch { /* nada */ }
        reject(err)
      })
    }).on('error', (err) => { file.close(); reject(err) })
  })
}

const total = MAPAS.length
let ok = 0, skipped = 0, failed = 0

console.log(`\nBaixando ${total} imagens de mapas para ${OUTPUT_DIR}\n`)

for (const id of MAPAS) {
  const url  = `${BASE}/${id}.jpg`
  const dest = join(OUTPUT_DIR, `${id}.jpg`)
  const idx  = ok + skipped + failed + 1

  process.stdout.write(`[${String(idx).padStart(2)}/${total}] ${id.padEnd(30)} `)

  try {
    const result = await downloadFile(url, dest)
    if (result === 'skip') { process.stdout.write('já existe\n'); skipped++ }
    else                   { process.stdout.write('ok\n');        ok++      }
  } catch (e) {
    process.stdout.write(`ERRO — ${e.message}\n`)
    failed++
  }
}

console.log(`\n✓ ${ok} baixados  •  ${skipped} já existiam  •  ${failed} erros\n`)
