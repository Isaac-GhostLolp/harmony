import type { World } from './types'

/**
 * World registry. Each entry lazy-loads its module so only the active world's
 * code is ever evaluated (perf rule: load only the current theme's resources).
 * Adding a world — internal or, later, community-provided — is just one entry.
 */
export interface WorldMeta {
  id: string
  name: string
  emoji: string
  category: 'worlds' | 'signature'
  blurb: string
  /** behind "Carregar mais Worlds vivos": holidays and just-for-fun worlds */
  more?: boolean
  /** when it's "em alta": the days of the year this world is about */
  season?: (d: Date) => boolean
  load: () => Promise<World>
}

/** month is 1..12; a range may wrap past New Year */
const between = (d: Date, from: [number, number], to: [number, number]): boolean => {
  const v = (d.getMonth() + 1) * 100 + d.getDate()
  const a = from[0] * 100 + from[1]
  const b = to[0] * 100 + to[1]
  return a <= b ? v >= a && v <= b : v >= a || v <= b
}

/** Whether a world's date is near (shown first, with an "Em alta" badge). */
export function inSeason(w: WorldMeta, d = new Date()): boolean {
  return !!w.season && w.season(d)
}

export const WORLDS: WorldMeta[] = [
  {
    id: 'auto',
    name: 'Automático',
    emoji: '🎚️',
    category: 'signature',
    blurb: 'Escolhe o mundo certo para cada música pelo gênero, pela energia e pela hora do dia, e troca suavemente entre as faixas.',
    load: () => import('./auto').then((m) => m.autoWorld)
  },
  {
    id: 'blackhole',
    name: 'Black Hole',
    emoji: '🕳️',
    category: 'signature',
    blurb: 'Um buraco negro vivo, estrelas orbitando e lente gravitacional. Inspirado em Interestelar.',
    load: () => import('./blackhole').then((m) => m.blackHole)
  },
  {
    id: 'rain',
    name: 'Rain',
    emoji: '🌧️',
    category: 'worlds',
    blurb: 'Uma janela para uma cidade chuvosa à noite. Gotas escorrem, luzes piscam, relâmpagos ao longe.',
    load: () => import('./rain').then((m) => m.rainWorld)
  },
  {
    id: 'nature',
    name: 'Nature',
    emoji: '🌲',
    category: 'worlds',
    blurb: 'Uma floresta viva com vaga-lumes, raios de sol e folhas ao vento. Muda com a hora do dia.',
    load: () => import('./nature').then((m) => m.natureWorld)
  },
  {
    id: 'cyber-city',
    name: 'Cyberpunk',
    emoji: '🌃',
    category: 'signature',
    blurb: 'Uma cidade neon viva sob a chuva, com holográficos, scanlines e glitches. Inspirado em Cyberpunk 2077.',
    load: () => import('./cyberpunk').then((m) => m.cyberpunkWorld)
  },
  {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    category: 'worlds',
    blurb: 'Debaixo d\'água: raios de sol, cardumes, bolhas subindo e corais. Leve e sem peso.',
    load: () => import('./ocean').then((m) => m.oceanWorld)
  },
  {
    id: 'winter',
    name: 'Winter',
    emoji: '❄️',
    category: 'worlds',
    blurb: 'Uma paisagem de neve à noite, com aurora boreal ondulando no céu e flocos caindo.',
    load: () => import('./winter').then((m) => m.winterWorld)
  },
  {
    id: 'coffee-shop',
    name: 'Coffee Shop',
    emoji: '☕',
    category: 'worlds',
    blurb: 'Uma cafeteria aconchegante à noite: luzes quentes, chuva na janela e vapor do café. Ideal para estudar.',
    load: () => import('./coffeeshop').then((m) => m.coffeeShopWorld)
  },
  {
    id: 'japanese-garden',
    name: 'Japanese Garden',
    emoji: '⛩️',
    category: 'worlds',
    blurb: 'Um jardim zen ao entardecer: pétalas de cerejeira, lanternas, um lago tranquilo e um torii.',
    load: () => import('./japanesegarden').then((m) => m.japaneseGardenWorld)
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    emoji: '🌆',
    category: 'signature',
    blurb: 'Estética anos 80: sol neon, grid em perspectiva e montanhas wireframe. Puro vaporwave.',
    load: () => import('./synthwave').then((m) => m.synthwaveWorld)
  },
  {
    id: 'space-station',
    name: 'Space Station',
    emoji: '🛰️',
    category: 'signature',
    blurb: 'A vista de uma janela panorâmica: um planeta girando, satélites, nebulosas e meteoros.',
    load: () => import('./spacestation').then((m) => m.spaceStationWorld)
  },
  {
    id: 'volcano',
    name: 'Volcano',
    emoji: '🌋',
    category: 'signature',
    blurb: 'Uma noite vulcânica iluminada por lava: brasas subindo, cinzas caindo e o brilho pulsando com a música.',
    load: () => import('./volcano').then((m) => m.volcanoWorld)
  },
  // ---- more worlds: holidays and fun -------------------------------------
  {
    id: 'halloween',
    name: 'Halloween',
    emoji: '🎃',
    category: 'worlds',
    more: true,
    season: (d) => between(d, [10, 1], [11, 2]),
    blurb: 'Lua cheia sobre um cemitério antigo: abóboras que pulsam com a batida, morcegos, fantasmas e névoa.',
    load: () => import('./halloween').then((m) => m.halloweenWorld)
  },
  {
    id: 'christmas',
    name: 'Natal',
    emoji: '🎄',
    category: 'worlds',
    more: true,
    season: (d) => between(d, [12, 1], [1, 6]),
    blurb: 'Uma pracinha nevando na véspera de Natal: a árvore pisca no ritmo, a estrela pulsa e o trenó do Papai Noel cruza a lua.',
    load: () => import('./christmas').then((m) => m.christmasWorld)
  },
  {
    id: 'newyear',
    name: 'Réveillon',
    emoji: '🎆',
    category: 'worlds',
    more: true,
    season: (d) => between(d, [12, 26], [1, 2]),
    blurb: 'Virada em Copacabana: fogos explodindo no ritmo sobre o mar, o reflexo na água e a multidão de branco na areia.',
    load: () => import('./newyear').then((m) => m.newYearWorld)
  },
  {
    id: 'arcade',
    name: 'Arcade',
    emoji: '🕹️',
    category: 'worlds',
    more: true,
    blurb: 'Um fliperama dos anos 80 em tela de tubo: invasores marchando no ritmo, a navinha jogando sozinha e uma cidade-equalizador.',
    load: () => import('./arcade').then((m) => m.arcadeWorld)
  },
  {
    id: 'desert',
    name: 'Deserto',
    emoji: '🏜️',
    category: 'worlds',
    more: true,
    blurb: 'Dunas sem fim sob a Via Láctea e duas luas (de dia, dois sóis), uma caravana na crista e algo gigante sob a areia.',
    load: () => import('./desert').then((m) => m.desertWorld)
  },
  {
    id: 'biolum',
    name: 'Floresta Bioluminescente',
    emoji: '🍄',
    category: 'worlds',
    more: true,
    blurb: 'Uma floresta alienígena que brilha: cogumelos e árvores pulsando, plantas que se enrolam e sementes-água-viva no ar.',
    load: () => import('./biolum').then((m) => m.biolumWorld)
  },
  {
    id: 'coderain',
    name: 'Chuva de Código',
    emoji: '🟩',
    category: 'worlds',
    more: true,
    blurb: 'O código verde caindo em três profundidades, no ritmo da música. Siga o coelho branco.',
    load: () => import('./coderain').then((m) => m.codeRainWorld)
  },
  {
    id: 'custom',
    name: 'Meu fundo',
    emoji: '🖼️',
    category: 'worlds',
    blurb: 'Importe sua própria imagem como fundo vivo, com movimento suave que reage à música.',
    load: () => import('./custom').then((m) => m.customWorld)
  }
]

export function findWorld(id: string): WorldMeta | undefined {
  return WORLDS.find((w) => w.id === id)
}
