import {
  Library,
  ListMusic,
  MicVocal,
  Disc3,
  Heart,
  Clock,
  Clapperboard,
  Settings,
  Palette,
  Search,
  SlidersHorizontal,
  Globe2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Hourglass,
  PictureInPicture2,
  Volume2,
  Volume1,
  VolumeX,
  type LucideIcon
} from 'lucide-react'

/**
 * Every icon an icon pack can redraw: the sidebar's and the player bar's.
 * Each slot carries what the built-in packs need: the line icon (the
 * classic look, also the base of most packs), a colour of its own (Colorido,
 * Figurinha), an emoji and a terminal glyph. `filled` slots are drawn solid
 * in the classic look (the transport buttons, a liked heart).
 */

export type IconSlot =
  | 'library'
  | 'myworld'
  | 'search'
  | 'playlists'
  | 'artists'
  | 'albums'
  | 'favorites'
  | 'visualizer'
  | 'history'
  | 'personalize'
  | 'equalizer'
  | 'settings'
  | 'support'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'shuffle'
  | 'repeat'
  | 'repeatOne'
  | 'like'
  | 'liked'
  | 'capsule'
  | 'lyrics'
  | 'dj'
  | 'mini'
  | 'queue'
  | 'volume'
  | 'volumeLow'
  | 'mute'

export interface SlotDef {
  id: IconSlot
  label: string
  group: 'sidebar' | 'player'
  icon: LucideIcon
  filled?: boolean
  /** its own colour; 'inherit' keeps the button's (the play button) */
  color: string
  emoji: string
  term: string
}

export const SLOTS: SlotDef[] = [
  { id: 'library', label: 'Biblioteca', group: 'sidebar', icon: Library, color: '#ff9f1c', emoji: '📚', term: 'ls' },
  { id: 'myworld', label: 'Meu Mundo', group: 'sidebar', icon: Globe2, color: '#2ec4b6', emoji: '🌍', term: '~/' },
  { id: 'search', label: 'Pesquisar', group: 'sidebar', icon: Search, color: '#4361ee', emoji: '🔍', term: '/?' },
  { id: 'playlists', label: 'Playlists', group: 'sidebar', icon: ListMusic, color: '#9b5de5', emoji: '🎶', term: '≡♪' },
  { id: 'artists', label: 'Artistas', group: 'sidebar', icon: MicVocal, color: '#f15bb5', emoji: '🎤', term: '@' },
  { id: 'albums', label: 'Álbuns', group: 'sidebar', icon: Disc3, color: '#fb5607', emoji: '💿', term: '(o)' },
  { id: 'favorites', label: 'Favoritos', group: 'sidebar', icon: Heart, color: '#ef233c', emoji: '❤️', term: '<3' },
  { id: 'visualizer', label: 'Visualizer', group: 'sidebar', icon: Clapperboard, color: '#7209b7', emoji: '🎬', term: '[*]' },
  { id: 'history', label: 'Histórico', group: 'sidebar', icon: Clock, color: '#3a86ff', emoji: '🕰️', term: '^R' },
  { id: 'equalizer', label: 'Equalizador', group: 'sidebar', icon: SlidersHorizontal, color: '#ffbe0b', emoji: '🎛️', term: '=|=' },
  { id: 'personalize', label: 'Personalização', group: 'sidebar', icon: Palette, color: '#06d6a0', emoji: '🎨', term: '#' },
  { id: 'settings', label: 'Configurações', group: 'sidebar', icon: Settings, color: '#8d99ae', emoji: '⚙️', term: '*' },
  { id: 'support', label: 'Apoie', group: 'sidebar', icon: Heart, color: '#ff4d6d', emoji: '💖', term: '♥' },

  { id: 'play', label: 'Tocar', group: 'player', icon: Play, filled: true, color: 'inherit', emoji: '▶️', term: '>' },
  { id: 'pause', label: 'Pausar', group: 'player', icon: Pause, filled: true, color: 'inherit', emoji: '⏸️', term: '||' },
  { id: 'prev', label: 'Anterior', group: 'player', icon: SkipBack, filled: true, color: 'inherit', emoji: '⏮️', term: '|<' },
  { id: 'next', label: 'Próxima', group: 'player', icon: SkipForward, filled: true, color: 'inherit', emoji: '⏭️', term: '>|' },
  { id: 'shuffle', label: 'Aleatório', group: 'player', icon: Shuffle, color: '#06d6a0', emoji: '🔀', term: '?!' },
  { id: 'repeat', label: 'Repetir', group: 'player', icon: Repeat, color: '#3a86ff', emoji: '🔁', term: '<>' },
  { id: 'repeatOne', label: 'Repetir uma', group: 'player', icon: Repeat1, color: '#3a86ff', emoji: '🔂', term: '<1>' },
  { id: 'like', label: 'Favoritar', group: 'player', icon: Heart, color: '#ef233c', emoji: '🤍', term: '<3' },
  { id: 'liked', label: 'Favoritada', group: 'player', icon: Heart, filled: true, color: '#ef233c', emoji: '❤️', term: '♥' },
  { id: 'capsule', label: 'Cápsula do tempo', group: 'player', icon: Hourglass, color: '#ffbe0b', emoji: '⏳', term: '8' },
  { id: 'lyrics', label: 'Letras', group: 'player', icon: MicVocal, color: '#f15bb5', emoji: '🎙️', term: 'Aa' },
  { id: 'dj', label: 'DJ Mode', group: 'player', icon: Disc3, color: '#9b5de5', emoji: '🎧', term: 'dj' },
  { id: 'mini', label: 'Mini player', group: 'player', icon: PictureInPicture2, color: '#2ec4b6', emoji: '🪟', term: '[]' },
  { id: 'queue', label: 'Fila', group: 'player', icon: ListMusic, color: '#ff9f1c', emoji: '📜', term: '::' },
  { id: 'volume', label: 'Volume', group: 'player', icon: Volume2, color: '#4cc9f0', emoji: '🔊', term: '))' },
  { id: 'volumeLow', label: 'Volume baixo', group: 'player', icon: Volume1, color: '#4cc9f0', emoji: '🔉', term: ')' },
  { id: 'mute', label: 'Mudo', group: 'player', icon: VolumeX, color: '#8d99ae', emoji: '🔇', term: 'x' }
]

const bySlot = new Map(SLOTS.map((s) => [s.id, s]))
export const slotDef = (id: IconSlot): SlotDef => bySlot.get(id)!

/** a name made comparable: lower case, no accents, letters and digits only */
export const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** the slot a file name points at ('play.png', 'Biblioteca.svg', 'repeat-one.gif'…) */
export function slotForName(fileName: string): IconSlot | null {
  const base = slug(fileName.replace(/\.[^.]+$/, ''))
  for (const s of SLOTS) if (slug(s.id) === base || slug(s.label) === base) return s.id
  return null
}

/** the built-in packs' names, in the order they're shown */
export const PACK_NAMES: Record<string, string> = {
  classic: 'Clássico',
  duotone: 'Duotone',
  neon: 'Neon',
  gradient: 'Degradê',
  color: 'Colorido',
  sticker: 'Figurinha',
  emoji: 'Emoji',
  pixel: 'Pixel',
  sketch: 'Rabisco',
  terminal: 'Terminal'
}
