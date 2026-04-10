// ============================================================
// Copa Inhouse — Apps Script
// Deploy como: Web App > Executar como "Eu" > Acesso "Qualquer pessoa"
// Colar a URL gerada em VITE_SHEETS_WEBAPP_URL no .env
// ============================================================

const SHEET_NAME = 'Respostas ao formulário 1'

const COL = {
  timestamp:      0,
  email:          1,
  discord:        2,
  battletag:      3,
  pais:           4,
  linguas:        5,
  elo:            6,
  rolePrimaria:   7,
  roleSecundaria: 8,
  titularReserva: 9,
  querCapitao:    10,
  aceitouRegras:  11,
}

// ── Normalização ─────────────────────────────────────────────

function normalizeRole(val) {
  const map = {
    'Assassino':           'DPS',
    'Off-Laner':           'Offlane',
    'Curandeiro':          'Healer',
    'Tank':                'Tank',
    'Flex':                'Flex',
    'Sem role secundária': 'Nenhuma',
    'Nenhuma':             'Nenhuma',
  }
  return map[val] || val || ''
}

function normalizeLinguas(val) {
  if (!val) return []
  const map = { 'Português': 'pt', 'English': 'en', 'Español': 'es' }
  return val.split(',').map(l => map[l.trim()] || l.trim().toLowerCase()).filter(Boolean)
}

function normalizeCapitao(val) {
  if (!val) return 'Nao'
  if (val === 'Sim') return 'Sim'
  if (val.toLowerCase().includes('necessário') || val.toLowerCase().includes('necessario')) return 'SoSeNecessario'
  return 'Nao'
}

function rowToPlayer(row, index) {
  return {
    id:             'sheets_' + (index + 2), // linha real na planilha
    email:          row[COL.email]          || '',
    discord:        row[COL.discord]        || '',
    battletag:      row[COL.battletag]      || '',
    pais:           row[COL.pais]           || '',
    linguas:        normalizeLinguas(row[COL.linguas]),
    elo:            row[COL.elo]            || '',
    rolePrimaria:   normalizeRole(row[COL.rolePrimaria]),
    roleSecundaria: normalizeRole(row[COL.roleSecundaria]),
    querCapitao:    normalizeCapitao(row[COL.querCapitao]),
    titularReserva: row[COL.titularReserva] || '',
    inscritoEm:     row[COL.timestamp]      || '',
    origem:         'forms',
  }
}

// ── GET — retorna lista de inscritos ─────────────────────────

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  const rows  = sheet.getDataRange().getValues()
  rows.shift() // remove cabeçalho

  const players = rows
    .filter(row => row[COL.email]) // ignora linhas vazias
    .map((row, i) => rowToPlayer(row, i))

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, players }))
    .setMimeType(ContentService.MimeType.JSON)
}

// ── POST — adiciona nova inscrição do site ───────────────────

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents)
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)

    const linguasStr = Array.isArray(data.linguas)
      ? data.linguas.map(l => ({ pt: 'Português', en: 'English', es: 'Español' }[l] || l)).join(', ')
      : ''

    const roleMap = { DPS: 'Assassino', Offlane: 'Off-Laner', Healer: 'Curandeiro', Tank: 'Tank', Flex: 'Flex', Nenhuma: 'Sem role secundária' }
    const capitaoMap = { Sim: 'Sim', SoSeNecessario: 'Sim, porém só caso seja muito necessário', Nao: 'Não' }

    sheet.appendRow([
      new Date(),
      data.email          || '',
      data.discord        || '',
      data.battletag      || '',
      data.pais           || '',
      linguasStr,
      data.elo            || '',
      roleMap[data.rolePrimaria]   || data.rolePrimaria   || '',
      roleMap[data.roleSecundaria] || data.roleSecundaria || '',
      '',                           // titularReserva — não coletado no site
      capitaoMap[data.querCapitao] || data.querCapitao || '',
      'Concordo',
    ])

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}
