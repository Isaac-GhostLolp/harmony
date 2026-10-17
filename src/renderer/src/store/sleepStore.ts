import { create } from 'zustand'
import { usePlayerStore } from '@/store/playerStore'
import { useUiStore } from '@/store/uiStore'
import { getEngine } from '@/services/audioEngine'
import { IS_ANDROID } from '@/platform'
import { api } from '@/services/api'

/**
 * Sleep timer: after the chosen time (or at the end of the current song)
 * the music fades out slowly, pauses, and the Harmony closes itself.
 *
 * The fade is scheduled on the audio clock (AudioEngine.scheduleSleepFade),
 * which keeps time with the screen off; the page timer that pauses and
 * closes may run a little late in the background, but by then it's silent.
 */

/** how long the music takes to fade away */
export const FADE_SEC = 20
/** at the end of a song the fade is shorter */
const SONG_FADE_SEC = 8

export type SleepMode = 'time' | 'song'

interface SleepState {
  mode: SleepMode | null
  /** when the music stops (ms since epoch), for 'time' */
  endsAt: number | null
  startMinutes: (minutes: number) => void
  /** stop when the current song ends */
  startEndOfSong: () => void
  addMinutes: (minutes: number) => void
  cancel: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null
let unsubscribe: (() => void) | null = null

function clearWatchers(): void {
  if (timer) clearTimeout(timer)
  timer = null
  unsubscribe?.()
  unsubscribe = null
}

/** fades already done: pause, put the sound back for next time, close the app */
async function finish(): Promise<void> {
  clearWatchers()
  useSleepStore.setState({ mode: null, endsAt: null })
  const player = usePlayerStore.getState()
  if (player.isPlaying) player.togglePlay()
  // give the pause a moment before the sound comes back up (silent anyway)
  await new Promise((r) => setTimeout(r, 400))
  getEngine().resetSleepFade()
  if (IS_ANDROID) {
    const [{ App }, { saveDatabaseNow }] = await Promise.all([
      import('@capacitor/app'),
      import('@/platform/android/database')
    ])
    await saveDatabaseNow().catch(() => undefined)
    await App.exitApp()
  } else {
    api.window?.close()
  }
}

function scheduleTime(endsAt: number): void {
  clearWatchers()
  const left = (endsAt - Date.now()) / 1000
  getEngine().scheduleSleepFade(left - FADE_SEC, Math.min(FADE_SEC, left))
  timer = setTimeout(() => void finish(), Math.max(0, endsAt - Date.now()) + 300)
}

export const useSleepStore = create<SleepState>((set, get) => ({
  mode: null,
  endsAt: null,

  startMinutes: (minutes) => {
    const endsAt = Date.now() + minutes * 60_000
    set({ mode: 'time', endsAt })
    scheduleTime(endsAt)
  },

  startEndOfSong: () => {
    clearWatchers()
    getEngine().resetSleepFade()
    set({ mode: 'song', endsAt: null })
    const startId = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex]?.id
    let fading = false
    unsubscribe = usePlayerStore.subscribe((s) => {
      const song = s.queue[s.currentIndex]
      // the next song started (or the queue ended): this one is over
      if (song?.id !== startId || (!s.isPlaying && song && s.currentTime >= (song.duration || 0) - 0.5)) {
        void finish()
        return
      }
      // with crossfade on, the next song starts that much earlier: be silent by then
      const crossfade = useUiStore.getState().crossfade || 0
      const left = (song.duration || 0) - crossfade - s.currentTime
      if (!fading && song.duration > 0 && left <= SONG_FADE_SEC && left > 0) {
        fading = true
        getEngine().scheduleSleepFade(0, left)
      } else if (fading && left > SONG_FADE_SEC + 1) {
        // went back in the song: the sound comes back until the end nears again
        fading = false
        getEngine().resetSleepFade()
      }
    })
  },

  addMinutes: (minutes) => {
    const { mode, endsAt } = get()
    if (mode !== 'time' || !endsAt) return
    const next = Math.max(endsAt, Date.now()) + minutes * 60_000
    getEngine().resetSleepFade()
    set({ endsAt: next })
    scheduleTime(next)
  },

  cancel: () => {
    clearWatchers()
    getEngine().resetSleepFade()
    set({ mode: null, endsAt: null })
  }
}))
