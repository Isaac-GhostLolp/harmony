import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'
import type { ThemeName } from '@/types'

export type BackgroundMode = 'none' | 'cover'
export type LyricsMode = 'synced' | 'karaoke' | 'edit'

interface UiState {
  theme: ThemeName
  queueOpen: boolean
  lyricsOpen: boolean
  lyricsMode: LyricsMode
  crossfade: number
  background: BackgroundMode
  djMode: boolean
  world: string | null
  worldOpacity: number
  worldBlur: number
  customMedia: { type: 'image' | 'video'; url: string } | null
  setTheme: (t: ThemeName) => void
  toggleQueue: () => void
  toggleLyrics: () => void
  setLyricsMode: (mode: LyricsMode) => void
  setCrossfade: (seconds: number) => void
  setBackground: (mode: BackgroundMode) => void
  setDjMode: (on: boolean) => void
  setWorld: (id: string | null) => void
  setWorldOpacity: (v: number) => void
  setWorldBlur: (v: number) => void
  setCustomMedia: (m: { type: 'image' | 'video'; url: string } | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  theme: 'dark',
  queueOpen: false,
  lyricsOpen: false,
  lyricsMode: 'synced',
  crossfade: 0,
  background: 'cover',
  djMode: false,
  world: null,
  // World panel look — user-tunable. Opacity 0..100 (how see-through panels are),
  // blur 0..30 px. Defaults match the tuned 0.13.4 values.
  worldOpacity: 72,
  worldBlur: 8,
  customMedia: null,
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    window.harmony.settings.set('theme', theme)
    set({ theme })
  },
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  toggleLyrics: () => set((s) => ({ lyricsOpen: !s.lyricsOpen })),
  setLyricsMode: (lyricsMode) => {
    window.harmony.settings.set('lyricsMode', lyricsMode)
    set({ lyricsMode })
  },
  setCrossfade: (crossfade) => {
    persistSettingDebounced('crossfade', crossfade)
    set({ crossfade })
  },
  setBackground: (background) => {
    window.harmony.settings.set('background', background)
    set({ background })
  },
  setDjMode: (djMode) => set({ djMode }),
  setWorld: (world) => {
    window.harmony.settings.set('world', world)
    // toggle a class so themed CSS can make panels glassier when a world is on
    document.documentElement.classList.toggle('world-active', Boolean(world))
    set({ world })
  },
  setWorldOpacity: (worldOpacity) => {
    // opacity slider: higher = MORE see-through, so panel alpha goes down
    const alpha = (1 - worldOpacity / 100) * 0.6 + 0.08 // 0.08..0.68
    document.documentElement.style.setProperty('--world-panel-alpha', String(alpha))
    persistSettingDebounced('worldOpacity', worldOpacity)
    set({ worldOpacity })
  },
  setWorldBlur: (worldBlur) => {
    document.documentElement.style.setProperty('--world-panel-blur', `${worldBlur}px`)
    persistSettingDebounced('worldBlur', worldBlur)
    set({ worldBlur })
  },
  setCustomMedia: (customMedia) => {
    set({ customMedia })
  }
}))
