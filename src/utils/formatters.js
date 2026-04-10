export function formatBattletag(tag) {
  return tag?.trim() ?? ''
}

export function flagFromCountry(code) {
  const flags = {
    BR: '🇧🇷', AR: '🇦🇷', MX: '🇲🇽', CL: '🇨🇱',
    CO: '🇨🇴', PE: '🇵🇪', VE: '🇻🇪', UY: '🇺🇾',
    PY: '🇵🇾', BO: '🇧🇴', EC: '🇪🇨', US: '🇺🇸',
    PT: '🇵🇹', ES: '🇪🇸',
  }
  return flags[code] ?? '🌎'
}

export function eloColor(elo) {
  const colors = {
    Bronze: '#cd7f32',
    Prata: '#c0c0c0',
    Ouro: '#c9a84c',
    Platina: '#4a9eda',
    Diamante: '#9b6ee8',
    Mestre: '#e05555',
  }
  return colors[elo] ?? 'var(--text2)'
}
