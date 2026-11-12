import { create } from 'zustand'

/**
 * "Toque pessoal" — the small personal touches of 0.21.0, besides the
 * cursor (utils/cursor.ts, which also has the trails and click effects):
 * interface sounds, page transitions, the scrollbar, text selection, the covers' shape, the
 * loading spinner and the mini player's skin.
 *
 * Kept in localStorage (applied before the first paint) and mirrored to the
 * app settings, like the cursor. The CSS-only ones are attributes on <html>
 * (data-scrollbar, data-cover…) that globals.css reads.
 */

export type UiSoundPack = 'off' | 'soft' | '8bit' | 'vinyl' | 'mech'
export type PageTransition = 'none' | 'fade' | 'slide' | 'zoom'
export type ScrollbarStyle = 'classic' | 'theme' | 'thin' | 'pill' | 'hover'
export type CoverShape = 'default' | 'square' | 'circle' | 'vinyl'
export type SpinnerStyle = 'classic' | 'vinyl' | 'wave' | 'logo'
export type MiniSkin = 'compact' | 'card' | 'turntable'

export interface Flair {
  uiSounds: UiSoundPack
  /** 0–1, apart from the music's volume */
  uiVolume: number
  transition: PageTransition
  scrollbar: ScrollbarStyle
  /** text selection and the typing caret in the theme's colour */
  themedSelection: boolean
  coverShape: CoverShape
  /** covers lean towards the mouse, in 3D */
  coverTilt: boolean
  spinner: SpinnerStyle
  miniSkin: MiniSkin
}

const KEY = 'harmony.flair'

export const FLAIR_DEFAULTS: Flair = {
  uiSounds: 'off',
  uiVolume: 0.5,
  transition: 'none',
  scrollbar: 'classic',
  themedSelection: true,
  coverShape: 'default',
  coverTilt: false,
  spinner: 'classic',
  miniSkin: 'compact'
}

function load(): Flair {
  try {
    return { ...FLAIR_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Flair>) }
  } catch {
    return FLAIR_DEFAULTS
  }
}

/** the CSS-only choices, as attributes on <html> */
function paint(f: Flair): void {
  const root = document.documentElement
  root.dataset.scrollbar = f.scrollbar
  root.dataset.cover = f.coverShape
  root.classList.toggle('themed-selection', f.themedSelection)
}

interface FlairState extends Flair {
  set: (patch: Partial<Flair>) => void
}

export const useFlairStore = create<FlairState>((set, get) => {
  const initial = load()
  if (typeof document !== 'undefined') paint(initial)
  return {
    ...initial,
    set: (patch) => {
      set(patch)
      const { set: _set, ...flair } = get()
      void _set
      paint(flair)
      try {
        localStorage.setItem(KEY, JSON.stringify(flair))
      } catch {
        /* kept for this session */
      }
      // (the mini player, another window, hears the change as a 'storage' event)
      window.harmony?.settings.set('flair', flair)
    }
  }
})

/** the saved choices, for the mini player's own window */
export function readFlair(): Flair {
  return load()
}
