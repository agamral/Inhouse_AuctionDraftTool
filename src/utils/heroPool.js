// Lista completa de heróis do HotS — atualizada abril 2026
// iconeUrl: usar '/heroes/{id}.png' quando as imagens forem baixadas para /public/heroes/
// Roles oficiais: Tank | Bruiser | Melee Assassin | Ranged Assassin | Healer | Support

export const ROLES = {
  TANK: 'Tank',
  BRUISER: 'Bruiser',
  MELEE_ASSASSIN: 'Melee Assassin',
  RANGED_ASSASSIN: 'Ranged Assassin',
  HEALER: 'Healer',
  SUPPORT: 'Support',
}

export const UNIVERSOS = {
  WARCRAFT: 'Warcraft',
  STARCRAFT: 'StarCraft',
  DIABLO: 'Diablo',
  OVERWATCH: 'Overwatch',
  NEXUS: 'Nexus',
  CLASSICO: 'Blizzard Classic',
}

export const HEROES = [
  // ── TANKS ──────────────────────────────────────────────────────────────────
  { id: 'anubarak',    nome: "Anub'arak",       role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/anubarak.png'    },
  { id: 'arthas',      nome: 'Arthas',           role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/arthas.png'      },
  { id: 'blaze',       nome: 'Blaze',            role: ROLES.TANK,             universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/blaze.png'       },
  { id: 'cho',         nome: 'Cho',              role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/cho.png'         },
  { id: 'diablo',      nome: 'Diablo',           role: ROLES.TANK,             universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/diablo.png'      },
  { id: 'etc',         nome: 'E.T.C.',           role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/etc.png'         },
  { id: 'garrosh',     nome: 'Garrosh',          role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/garrosh.png'     },
  { id: 'johanna',     nome: 'Johanna',          role: ROLES.TANK,             universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/johanna.png'     },
  { id: 'malganis',    nome: "Mal'Ganis",        role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/malganis.png'    },
  { id: 'mei',         nome: 'Mei',              role: ROLES.TANK,             universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/mei.png'         },
  { id: 'muradin',     nome: 'Muradin',          role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/muradin.png'     },
  { id: 'stitches',    nome: 'Stitches',         role: ROLES.TANK,             universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/stitches.png'    },
  { id: 'tyrael',      nome: 'Tyrael',           role: ROLES.TANK,             universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/tyrael.png'      },

  // ── BRUISERS ────────────────────────────────────────────────────────────────
  { id: 'artanis',     nome: 'Artanis',          role: ROLES.BRUISER,          universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/artanis.png'     },
  { id: 'chen',        nome: 'Chen',             role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/chen.png'        },
  { id: 'deathwing',   nome: 'Deathwing',        role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/deathwing.png'   },
  { id: 'dehaka',      nome: 'Dehaka',           role: ROLES.BRUISER,          universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/dehaka.png'      },
  { id: 'dva',         nome: 'D.Va',             role: ROLES.BRUISER,          universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/dva.png'         },
  { id: 'gazlowe',     nome: 'Gazlowe',          role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/gazlowe.png'     },
  { id: 'hogger',      nome: 'Hogger',           role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/hogger.png'      },
  { id: 'imperius',    nome: 'Imperius',         role: ROLES.BRUISER,          universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/imperius.png'    },
  { id: 'leoric',      nome: 'Leoric',           role: ROLES.BRUISER,          universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/leoric.png'      },
  { id: 'malthael',    nome: 'Malthael',         role: ROLES.BRUISER,          universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/malthael.png'    },
  { id: 'ragnaros',    nome: 'Ragnaros',         role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/ragnaros.png'    },
  { id: 'rexxar',      nome: 'Rexxar',           role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/rexxar.png'      },
  { id: 'samuro',      nome: 'Samuro',           role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/samuro.png'      },
  { id: 'sonya',       nome: 'Sonya',            role: ROLES.BRUISER,          universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/sonya.png'       },
  { id: 'thrall',      nome: 'Thrall',           role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/thrall.png'      },
  { id: 'varian',      nome: 'Varian',           role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/varian.png'      },
  { id: 'yrel',        nome: 'Yrel',             role: ROLES.BRUISER,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/yrel.png'        },

  // ── MELEE ASSASSINS ─────────────────────────────────────────────────────────
  { id: 'alarak',      nome: 'Alarak',           role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/alarak.png'      },
  { id: 'illidan',     nome: 'Illidan',          role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/illidan.png'     },
  { id: 'kerrigan',    nome: 'Kerrigan',         role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/kerrigan.png'    },
  { id: 'maiev',       nome: 'Maiev',            role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/maiev.png'       },
  { id: 'murky',       nome: 'Murky',            role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/murky.png'       },
  { id: 'qhira',       nome: 'Qhira',            role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.NEXUS,      iconeUrl: '/heroes/qhira.png'       },
  { id: 'thebutcher',  nome: 'The Butcher',      role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/thebutcher.png'  },
  { id: 'valeera',     nome: 'Valeera',          role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/valeera.png'     },
  { id: 'zeratul',     nome: 'Zeratul',          role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/zeratul.png'     },
  { id: 'genji',       nome: 'Genji',            role: ROLES.MELEE_ASSASSIN,   universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/genji.png'       },

  // ── RANGED ASSASSINS ────────────────────────────────────────────────────────
  { id: 'azmodan',     nome: 'Azmodan',          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/azmodan.png'     },
  { id: 'cassia',      nome: 'Cassia',           role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/cassia.png'      },
  { id: 'chromie',     nome: 'Chromie',          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/chromie.png'     },
  { id: 'falstad',     nome: 'Falstad',          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/falstad.png'     },
  { id: 'fenix',       nome: 'Fenix',            role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/fenix.png'       },
  { id: 'gall',        nome: 'Gall',             role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/gall.png'        },
  { id: 'greymane',    nome: 'Greymane',         role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/greymane.png'    },
  { id: 'guldan',      nome: "Gul'dan",          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/guldan.png'      },
  { id: 'hanzo',       nome: 'Hanzo',            role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/hanzo.png'       },
  { id: 'jaina',       nome: 'Jaina',            role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/jaina.png'       },
  { id: 'junkrat',     nome: 'Junkrat',          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/junkrat.png'     },
  { id: 'kaelthas',    nome: "Kael'thas",        role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/kaelthas.png'    },
  { id: 'kelthuzad',   nome: "Kel'Thuzad",       role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/kelthuzad.png'   },
  { id: 'liming',      nome: 'Li-Ming',          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/liming.png'      },
  { id: 'lunara',      nome: 'Lunara',           role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/lunara.png'      },
  { id: 'mephisto',    nome: 'Mephisto',         role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/mephisto.png'    },
  { id: 'nazeebo',     nome: 'Nazeebo',          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/nazeebo.png'     },
  { id: 'nova',        nome: 'Nova',             role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/nova.png'        },
  { id: 'orphea',      nome: 'Orphea',           role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.NEXUS,      iconeUrl: '/heroes/orphea.png'      },
  { id: 'probius',     nome: 'Probius',          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/probius.png'     },
  { id: 'raynor',      nome: 'Raynor',           role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/raynor.png'      },
  { id: 'sgthammer',   nome: 'Sgt. Hammer',      role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/sgthammer.png'   },
  { id: 'sylvanas',    nome: 'Sylvanas',         role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/sylvanas.png'    },
  { id: 'tassadar',    nome: 'Tassadar',         role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/tassadar.png'    },
  { id: 'tracer',      nome: 'Tracer',           role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/tracer.png'      },
  { id: 'tychus',      nome: 'Tychus',           role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/tychus.png'      },
  { id: 'valla',       nome: 'Valla',            role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/valla.png'       },
  { id: 'xul',         nome: 'Xul',              role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/xul.png'         },
  { id: 'zagara',      nome: 'Zagara',           role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/zagara.png'      },
  { id: 'zuljin',      nome: "Zul'jin",          role: ROLES.RANGED_ASSASSIN,  universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/zuljin.png'      },

  // ── HEALERS ─────────────────────────────────────────────────────────────────
  { id: 'alexstrasza', nome: 'Alexstrasza',      role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/alexstrasza.png' },
  { id: 'ana',         nome: 'Ana',              role: ROLES.HEALER,           universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/ana.png'         },
  { id: 'anduin',      nome: 'Anduin',           role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/anduin.png'      },
  { id: 'auriel',      nome: 'Auriel',           role: ROLES.HEALER,           universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/auriel.png'      },
  { id: 'brightwing',  nome: 'Brightwing',       role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/brightwing.png'  },
  { id: 'deckard',     nome: 'Deckard',          role: ROLES.HEALER,           universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/deckard.png'     },
  { id: 'kharazim',    nome: 'Kharazim',         role: ROLES.HEALER,           universo: UNIVERSOS.DIABLO,     iconeUrl: '/heroes/kharazim.png'    },
  { id: 'lili',        nome: 'Li Li',            role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/lili.png'        },
  { id: 'ltmorales',   nome: 'Lt. Morales',      role: ROLES.HEALER,           universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/ltmorales.png'   },
  { id: 'lucio',       nome: 'Lúcio',            role: ROLES.HEALER,           universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/lucio.png'       },
  { id: 'malfurion',   nome: 'Malfurion',        role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/malfurion.png'   },
  { id: 'rehgar',      nome: 'Rehgar',           role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/rehgar.png'      },
  { id: 'stukov',      nome: 'Stukov',           role: ROLES.HEALER,           universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/stukov.png'      },
  { id: 'tyrande',     nome: 'Tyrande',          role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/tyrande.png'     },
  { id: 'uther',       nome: 'Uther',            role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/uther.png'       },
  { id: 'whitemane',   nome: 'Whitemane',        role: ROLES.HEALER,           universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/whitemane.png'   },

  // ── SUPPORTS ────────────────────────────────────────────────────────────────
  { id: 'abathur',       nome: 'Abathur',        role: ROLES.SUPPORT,          universo: UNIVERSOS.STARCRAFT,  iconeUrl: '/heroes/abathur.png'       },
  { id: 'medivh',        nome: 'Medivh',         role: ROLES.SUPPORT,          universo: UNIVERSOS.WARCRAFT,   iconeUrl: '/heroes/medivh.png'        },
  { id: 'thelostvikings',nome: 'The Lost Vikings',role: ROLES.SUPPORT,         universo: UNIVERSOS.CLASSICO,   iconeUrl: '/heroes/thelostvikings.png'},
  { id: 'zarya',         nome: 'Zarya',          role: ROLES.SUPPORT,          universo: UNIVERSOS.OVERWATCH,  iconeUrl: '/heroes/zarya.png'         },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getHeroById(id) {
  return HEROES.find((h) => h.id === id) ?? null
}

export function getHeroesByRole(role) {
  return HEROES.filter((h) => h.role === role)
}

export function getHeroesByUniverso(universo) {
  return HEROES.filter((h) => h.universo === universo)
}

export function searchHeroes(query) {
  const q = query.toLowerCase()
  return HEROES.filter((h) => h.nome.toLowerCase().includes(q))
}
