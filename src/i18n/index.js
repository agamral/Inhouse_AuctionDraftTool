import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import pt from './locales/pt.json'
import es from './locales/es.json'
import en from './locales/en.json'

const LANG_STORAGE_KEY = 'idiomaEscolhido'

const TIMEZONE_LANG = {
  'America/Sao_Paulo': 'pt',
  'Europe/Lisbon': 'pt',
  'America/Argentina/Buenos_Aires': 'es',
  'America/Santiago': 'es',
  'America/Lima': 'es',
  'America/Bogota': 'es',
  'America/Caracas': 'es',
  'America/Mexico_City': 'es',
  'Europe/Madrid': 'es',
}

function idiomaInicial() {
  try {
    const salvo = localStorage.getItem(LANG_STORAGE_KEY)
    if (salvo) return salvo

    const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone
    return TIMEZONE_LANG[fuso] || 'en'
  } catch {
    return 'pt'
  }
}

i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    es: { translation: es },
    en: { translation: en },
  },
  lng: idiomaInicial(),
  fallbackLng: 'pt',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
