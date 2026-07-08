import { create } from 'zustand'
import type { Song, RepeatMode } from '@/types'

interface PlayerState {
  queue: Song[]
  originalQueue: Song[]
  currentIndex: number
  isPlaying: boolean
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  seekPosition: number | null // one-shot seek request consumed by useAudioPlayer
  currentTime: number
  /** Bumped on every playQueue so re-selecting the same song restarts it. */
  epoch: number

  currentSong: () => Song | null
  playQueue: (songs: Song[], startIndex: number) => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  setVolume: (v: number) => void
  seek: (seconds: number) => void
  setCurrentTime: (t: number) => void
  clearSeek: () => void
  addNext: (song: Song) => void
  addToQueue: (song: Song) => void
  removeFromQueue: (index: number) => void
  moveInQueue: (from: number, to: number) => void
  setFavoriteFlag: (songId: number, fav: boolean) => void
  updateSongCover: (songId: number, coverPath: string) => void
  removeSongById: (songId: number) => void
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  isPlaying: false,
  volume: 0.8,
  shuffle: false,
  repeat: 'off',
  seekPosition: null,
  currentTime: 0,
  epoch: 0,

  currentSong: () => {
    const { queue, currentIndex } = get()
    return queue[currentIndex] ?? null
  },

  playQueue: (songs, startIndex) => {
    const { shuffle } = get()
    if (songs.length === 0) return
    if (shuffle) {
      const first = songs[startIndex]
      const rest = shuffleArray(songs.filter((_, i) => i !== startIndex))
      set((st) => ({
        queue: [first, ...rest],
        originalQueue: songs,
        currentIndex: 0,
        isPlaying: true,
        currentTime: 0,
        epoch: st.epoch + 1
      }))
    } else {
      set((st) => ({
        queue: songs,
        originalQueue: songs,
        currentIndex: startIndex,
        isPlaying: true,
        currentTime: 0,
        epoch: st.epoch + 1
      }))
    }
  },

  togglePlay: () => set((s) => ({ isPlaying: s.queue.length > 0 ? !s.isPlaying : false })),

  next: () => {
    const { queue, currentIndex, repeat } = get()
    if (queue.length === 0) return
    let nextIndex = currentIndex + 1
    if (nextIndex >= queue.length) {
      if (repeat === 'all') nextIndex = 0
      else return set({ isPlaying: false })
    }
    set({ currentIndex: nextIndex, isPlaying: true, currentTime: 0 })
  },

  previous: () => {
    const { queue, currentIndex, currentTime } = get()
    if (queue.length === 0) return
    // Spotify behavior: restart if more than 3s in, otherwise go back
    if (currentTime > 3 || currentIndex === 0) {
      set({ seekPosition: 0, currentTime: 0 })
    } else {
      set({ currentIndex: currentIndex - 1, isPlaying: true, currentTime: 0 })
    }
  },

  toggleShuffle: () => {
    const { shuffle, queue, originalQueue, currentIndex } = get()
    const current = queue[currentIndex]
    if (!shuffle) {
      const rest = shuffleArray(queue.filter((_, i) => i !== currentIndex))
      set({ shuffle: true, queue: current ? [current, ...rest] : rest, currentIndex: 0 })
    } else {
      const idx = current ? originalQueue.findIndex((s) => s.id === current.id) : 0
      set({ shuffle: false, queue: originalQueue, currentIndex: Math.max(0, idx) })
    }
  },

  cycleRepeat: () =>
    set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

  setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)) }),
  seek: (seconds) => set({ seekPosition: seconds, currentTime: seconds }),
  setCurrentTime: (t) => set({ currentTime: t }),
  clearSeek: () => set({ seekPosition: null }),

  addNext: (song) =>
    set((s) => {
      const q = [...s.queue]
      q.splice(s.currentIndex + 1, 0, song)
      return { queue: q }
    }),

  addToQueue: (song) => set((s) => ({ queue: [...s.queue, song] })),

  removeFromQueue: (index) =>
    set((s) => {
      const q = s.queue.filter((_, i) => i !== index)
      const ci = index < s.currentIndex ? s.currentIndex - 1 : s.currentIndex
      return { queue: q, currentIndex: Math.min(ci, q.length - 1) }
    }),

  moveInQueue: (from, to) =>
    set((s) => {
      const q = [...s.queue]
      const [item] = q.splice(from, 1)
      q.splice(to, 0, item)
      let ci = s.currentIndex
      if (from === ci) ci = to
      else if (from < ci && to >= ci) ci--
      else if (from > ci && to <= ci) ci++
      return { queue: q, currentIndex: ci }
    }),

  setFavoriteFlag: (songId, fav) =>
    set((s) => ({
      queue: s.queue.map((sg) => (sg.id === songId ? { ...sg, favorite: fav ? 1 : 0 } : sg))
    })),

  updateSongCover: (songId, coverPath) =>
    set((s) => ({
      queue: s.queue.map((sg) => (sg.id === songId ? { ...sg, coverPath } : sg)),
      originalQueue: s.originalQueue.map((sg) =>
        sg.id === songId ? { ...sg, coverPath } : sg
      )
    })),

  removeSongById: (songId) =>
    set((s) => {
      if (!s.queue.some((sg) => sg.id === songId)) return {}
      const removedBefore = s.queue
        .slice(0, s.currentIndex)
        .filter((sg) => sg.id === songId).length
      const queue = s.queue.filter((sg) => sg.id !== songId)
      const originalQueue = s.originalQueue.filter((sg) => sg.id !== songId)
      const currentIndex = Math.min(Math.max(0, s.currentIndex - removedBefore), queue.length - 1)
      return {
        queue,
        originalQueue,
        currentIndex,
        isPlaying: queue.length === 0 ? false : s.isPlaying
      }
    })
}))
