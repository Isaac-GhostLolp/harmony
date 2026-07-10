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
  setTheme: (t: ThemeName) => void
  toggleQueue: () => void
  toggleLyrics: () => void
  setLyricsMode: (mode: LyricsMode) => void
  setCrossfade: (seconds: number) => void
  setBackground: (mode: BackgroundMode) => void
  setDjMode: (on: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  theme: 'dark',
  queueOpen: false,
  lyricsOpen: false,
  lyricsMode: 'synced',
  crossfade: 0,
  background: 'cover',
  djMode: false,
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
  setDjMode: (djMode) => set({ djMode })
}))
