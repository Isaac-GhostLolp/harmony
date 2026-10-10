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
import { t, tk } from '@/i18n'

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
  { id: 'library', label: tk('Biblioteca'), group: 'sidebar', icon: Library, color: '#ff9f1c', emoji: '📚', term: 'ls' },
  { id: 'myworld', label: tk('Meu Mundo'), group: 'sidebar', icon: Globe2, color: '#2ec4b6', emoji: '🌍', term: '~/' },
  { id: 'search', label: tk('Pesquisar'), group: 'sidebar', icon: Search, color: '#4361ee', emoji: '🔍', term: '/?' },
  { id: 'playlists', label: tk('Playlists'), group: 'sidebar', icon: ListMusic, color: '#9b5de5', emoji: '🎶', term: '≡♪' },
  { id: 'artists', label: tk('Artistas'), group: 'sidebar', icon: MicVocal, color: '#f15bb5', emoji: '🎤', term: '@' },
  { id: 'albums', label: tk('Álbuns'), group: 'sidebar', icon: Disc3, color: '#fb5607', emoji: '💿', term: '(o)' },
  { id: 'favorites', label: tk('Favoritos'), group: 'sidebar', icon: Heart, color: '#ef233c', emoji: '❤️', term: '<3' },
  { id: 'visualizer', label: tk('Visualizer'), group: 'sidebar', icon: Clapperboard, color: '#7209b7', emoji: '🎬', term: '[*]' },
  { id: 'history', label: tk('Histórico'), group: 'sidebar', icon: Clock, color: '#3a86ff', emoji: '🕰️', term: '^R' },
  { id: 'equalizer', label: tk('Equalizador'), group: 'sidebar', icon: SlidersHorizontal, color: '#ffbe0b', emoji: '🎛️', term: '=|=' },
  { id: 'personalize', label: tk('Personalização'), group: 'sidebar', icon: Palette, color: '#06d6a0', emoji: '🎨', term: '#' },
  { id: 'settings', label: tk('Configurações'), group: 'sidebar', icon: Settings, color: '#8d99ae', emoji: '⚙️', term: '*' },
  { id: 'support', label: tk('Apoie'), group: 'sidebar', icon: Heart, color: '#ff4d6d', emoji: '💖', term: '♥' },

  { id: 'play', label: tk('Tocar'), group: 'player', icon: Play, filled: true, color: 'inherit', emoji: '▶️', term: '>' },
  { id: 'pause', label: tk('Pausar'), group: 'player', icon: Pause, filled: true, color: 'inherit', emoji: '⏸️', term: '||' },
  { id: 'prev', label: tk('Anterior'), group: 'player', icon: SkipBack, filled: true, color: 'inherit', emoji: '⏮️', term: '|<' },
  { id: 'next', label: tk('Próxima'), group: 'player', icon: SkipForward, filled: true, color: 'inherit', emoji: '⏭️', term: '>|' },
  { id: 'shuffle', label: tk('Aleatório'), group: 'player', icon: Shuffle, color: '#06d6a0', emoji: '🔀', term: '?!' },
  { id: 'repeat', label: tk('Repetir'), group: 'player', icon: Repeat, color: '#3a86ff', emoji: '🔁', term: '<>' },
  { id: 'repeatOne', label: tk('Repetir uma'), group: 'player', icon: Repeat1, color: '#3a86ff', emoji: '🔂', term: '<1>' },
  { id: 'like', label: tk('Favoritar'), group: 'player', icon: Heart, color: '#ef233c', emoji: '🤍', term: '<3' },
  { id: 'liked', label: tk('Favoritada'), group: 'player', icon: Heart, filled: true, color: '#ef233c', emoji: '❤️', term: '♥' },
  { id: 'capsule', label: tk('Cápsula do tempo'), group: 'player', icon: Hourglass, color: '#ffbe0b', emoji: '⏳', term: '8' },
  { id: 'lyrics', label: tk('Letras'), group: 'player', icon: MicVocal, color: '#f15bb5', emoji: '🎙️', term: 'Aa' },
  { id: 'dj', label: tk('DJ Mode'), group: 'player', icon: Disc3, color: '#9b5de5', emoji: '🎧', term: 'dj' },
  { id: 'mini', label: tk('Mini player'), group: 'player', icon: PictureInPicture2, color: '#2ec4b6', emoji: '🪟', term: '[]' },
  { id: 'queue', label: tk('Fila'), group: 'player', icon: ListMusic, color: '#ff9f1c', emoji: '📜', term: '::' },
  { id: 'volume', label: tk('Volume'), group: 'player', icon: Volume2, color: '#4cc9f0', emoji: '🔊', term: '))' },
  { id: 'volumeLow', label: tk('Volume baixo'), group: 'player', icon: Volume1, color: '#4cc9f0', emoji: '🔉', term: ')' },
  { id: 'mute', label: tk('Mudo'), group: 'player', icon: VolumeX, color: '#8d99ae', emoji: '🔇', term: 'x' }
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
  // the id, the Portuguese name or the name in the app's language
  for (const s of SLOTS) if (slug(s.id) === base || slug(s.label) === base || slug(t(s.label)) === base) return s.id
  return null
}

/** the built-in packs' names, in the order they're shown */
export const PACK_NAMES: Record<string, string> = {
  classic: tk('Clássico'),
  duotone: tk('Duotone'),
  neon: tk('Neon'),
  gradient: tk('Degradê'),
  color: tk('Colorido'),
  sticker: tk('Figurinha'),
  emoji: tk('Emoji'),
  pixel: tk('Pixel'),
  sketch: tk('Rabisco'),
  terminal: tk('Terminal')
}
