/**
 * Mapas (battlegrounds) do Heroes of the Storm
 * Imagens baixadas de psionic-storm.com para /public/maps/
 * Execute: npm run download-maps
 */

const BASE = import.meta.env.PROD
  ? 'https://psionic-storm.com/wp-content/themes/psionicstorm/img/battlegrounds'
  : '/maps'

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
].map(m => ({ ...m, splashUrl: `${BASE}/${m.id}.jpg` }))

export function getMapaById(id) {
  return MAPAS.find(m => m.id === id) ?? null
}
