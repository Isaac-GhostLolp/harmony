import { create } from 'zustand'
import { usePlayerStore } from '@/store/playerStore'
import { getEngine } from '@/services/audioEngine'

/**
 * Focus mode (a Pomodoro with music): the music plays while you focus; at
 * the break it fades out and pauses, and when the break is over it comes
 * back, fading in — round after round, until it's stopped.
 *
 * The fade into the break is scheduled on the audio clock, so it's on time
 * even with the screen off; the page timer that pauses and resumes may run
 * a little late in the background, which a break doesn't mind.
 */

export interface FocusPlan {
  id: string
  focus: number // minutes
  rest: number
}

export const FOCUS_PLANS: FocusPlan[] = [
  { id: 'classic', focus: 25, rest: 5 },
  { id: 'deep', focus: 50, rest: 10 }
]

const FADE_SEC = 4

type Phase = 'focus' | 'break'

interface FocusState {
  plan: FocusPlan | null
  phase: Phase | null
  /** when this phase ends (ms since epoch) */
  endsAt: number | null
  /** focus rounds finished */
  rounds: number
  start: (plan: FocusPlan) => void
  /** ends the current phase now (focus → break, or break → focus) */
  skip: () => void
  stop: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null
let unwatch: (() => void) | null = null
const clear = (): void => {
  if (timer) clearTimeout(timer)
  timer = null
  unwatch?.()
  unwatch = null
}

function buzz(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* no vibration on this device */
  }
}

export const useFocusStore = create<FocusState>((set, get) => {
  const beginFocus = (plan: FocusPlan): void => {
    clear()
    const player = usePlayerStore.getState()
    const wasPlaying = player.isPlaying
    const ms = plan.focus * 60_000
    // the whole round on the audio clock: in (if it was quiet), and out as the break begins
    getEngine().focusRound(ms / 1000, FADE_SEC, !wasPlaying)
    if (!wasPlaying && player.queue.length) player.togglePlay()
    set({ plan, phase: 'focus', endsAt: Date.now() + ms })
    timer = setTimeout(beginBreak, ms)
  }

  const beginBreak = (): void => {
    clear()
    const { plan, rounds } = get()
    if (!plan) return
    const player = usePlayerStore.getState()
    if (player.isPlaying) player.togglePlay()
    buzz([180, 120, 180])
    const ms = plan.rest * 60_000
    set({ phase: 'break', endsAt: Date.now() + ms, rounds: rounds + 1 })
    timer = setTimeout(() => {
      buzz([300])
      beginFocus(plan)
    }, ms)
    // pressing play during the break (the sound is faded out) means "back to focus"
    unwatch = usePlayerStore.subscribe((s, prev) => {
      if (s.isPlaying && !prev.isPlaying && get().phase === 'break') beginFocus(plan)
    })
  }

  return {
    plan: null,
    phase: null,
    endsAt: null,
    rounds: 0,

    start: (plan) => {
      set({ rounds: 0 })
      beginFocus(plan)
    },

    skip: () => {
      const { phase, plan } = get()
      if (!plan) return
      if (phase === 'focus') {
        getEngine().focusFade(0.0001, 1.2)
        clear()
        timer = setTimeout(beginBreak, 1200)
      } else beginFocus(plan)
    },

    stop: () => {
      clear()
      getEngine().focusFade(1, 0.6)
      set({ plan: null, phase: null, endsAt: null, rounds: 0 })
    }
  }
})
