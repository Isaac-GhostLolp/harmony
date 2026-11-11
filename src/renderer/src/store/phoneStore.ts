import { create } from 'zustand'

/**
 * The phone's everyday options (Android only), kept on the phone itself:
 * ear care, automatic battery saving, shake to skip, beat vibration and the
 * musical alarm's music. Also the small notice pill those features use to
 * say what they just did ("Bateria baixa: Modo Ultra Rápido ligado").
 */

export interface AlarmMusic {
  /** a playlist's id, or null for the favourites */
  playlistId: number | null
  /** the media volume the music rises to, 0–1 */
  volume: number
  /** how long it takes to rise, in seconds */
  riseSec: number
  shuffle: boolean
}

interface PhoneOptions {
  earCare: boolean
  /** the most the media volume may go with headphones, 0–1 (null: no limit) */
  safeMax: number | null
  batterySaver: boolean
  shakeToSkip: boolean
  beatVibe: boolean
  alarmMusic: AlarmMusic
}

interface PhoneState extends PhoneOptions {
  set: (patch: Partial<PhoneOptions>) => void
  notice: { text: string; id: number } | null
  /** ear care's "you've been loud for a while" notice is showing */
  earWarning: boolean
  /** the musical alarm is ringing (its screen is showing) */
  ringing: boolean
  say: (text: string) => void
}

const KEY = 'harmony.phone'

const DEFAULTS: PhoneOptions = {
  earCare: true,
  safeMax: null,
  batterySaver: true,
  shakeToSkip: false,
  beatVibe: false,
  alarmMusic: { playlistId: null, volume: 0.6, riseSec: 60, shuffle: true }
}

function load(): PhoneOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PhoneOptions>
    return { ...DEFAULTS, ...saved, alarmMusic: { ...DEFAULTS.alarmMusic, ...saved.alarmMusic } }
  } catch {
    return DEFAULTS
  }
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null

export const usePhoneStore = create<PhoneState>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch)
    const { earCare, safeMax, batterySaver, shakeToSkip, beatVibe, alarmMusic } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ earCare, safeMax, batterySaver, shakeToSkip, beatVibe, alarmMusic }))
    } catch {
      /* kept for this session */
    }
  },
  notice: null,
  earWarning: false,
  ringing: false,
  say: (text) => {
    if (noticeTimer) clearTimeout(noticeTimer)
    set({ notice: { text, id: Date.now() } })
    noticeTimer = setTimeout(() => set({ notice: null }), 4200)
  }
}))
