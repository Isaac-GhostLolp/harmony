import { App } from '@capacitor/app'
import { usePlayerStore } from '@/store/playerStore'
import { api } from '@/services/api'
import type { Song, RepeatMode } from '@/types'

/**
 * "Continuar de onde parou": the queue, the song and the second it was at
 * are kept (localStorage, ids only) and come back, paused, when the app
 * opens again. Saved on every queue change, every few seconds while
 * playing, and when the app goes to the background.
 */

const KEY = 'harmony.resume'
const MAX = 1000 // a saved queue that long is plenty

interface Saved {
  queue: number[]
  original: number[]
  index: number
  time: number
  shuffle: boolean
  repeat: RepeatMode
}

function save(): void {
  const s = usePlayerStore.getState()
  if (s.currentIndex < 0 || !s.queue.length) return
  const saved: Saved = {
    queue: s.queue.slice(0, MAX).map((x) => x.id),
    original: s.originalQueue.slice(0, MAX).map((x) => x.id),
    index: Math.min(s.currentIndex, MAX - 1),
    time: Math.floor(s.currentTime),
    shuffle: s.shuffle,
    repeat: s.repeat
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    /* nothing to pick up next time */
  }
}

/** brings the last queue back (paused); then keeps saving it */
export async function startResume(): Promise<void> {
  try {
    const raw = localStorage.getItem(KEY)
    const saved = raw ? (JSON.parse(raw) as Saved) : null
    if (saved && usePlayerStore.getState().currentIndex < 0) {
      const byId = new Map((((await api.library.getSongs()) as Song[]) ?? []).map((x) => [x.id, x]))
      const pick = (ids: number[]): Song[] => ids.map((id) => byId.get(id)).filter((x): x is Song => Boolean(x))
      const current = byId.get(saved.queue[saved.index])
      const queue = pick(saved.queue)
      const index = current ? queue.indexOf(current) : -1
      // only if the song it stopped on is still in the library
      if (current && index >= 0 && usePlayerStore.getState().currentIndex < 0) {
        const time = saved.time < (current.duration || 0) - 2 ? saved.time : 0
        usePlayerStore.getState().restore({
          queue,
          originalQueue: pick(saved.original).length ? pick(saved.original) : queue,
          index,
          time,
          shuffle: saved.shuffle,
          repeat: saved.repeat
        })
      }
    }
  } catch {
    /* start with an empty player */
  }

  let lastSaved = 0
  usePlayerStore.subscribe((s, prev) => {
    const changed =
      s.queue !== prev.queue || s.currentIndex !== prev.currentIndex || s.shuffle !== prev.shuffle || s.repeat !== prev.repeat
    if (changed || (s.isPlaying && Date.now() - lastSaved > 5000) || s.isPlaying !== prev.isPlaying) {
      lastSaved = Date.now()
      save()
    }
  })
  void App.addListener('pause', save)
}
