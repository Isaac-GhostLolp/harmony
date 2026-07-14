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
  load: () => Promise<World>
}

export const WORLDS: WorldMeta[] = [
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
