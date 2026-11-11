import { App } from '@capacitor/app'
import { HarmonyPhone } from './phone'
import { usePhoneStore } from '@/store/phoneStore'
import { usePlayerStore } from '@/store/playerStore'
import { getEngine } from '@/services/audioEngine'
import { isUltraFast, setUltraFast, onUltraFastChange } from '@/utils/perf'
import { t } from '@/i18n'

/**
 * The phone's everyday care, all running quietly in the background:
 *
 *  • Ear care: with headphones, time spent at a high volume adds up; after
 *    45 minutes a gentle notice suggests turning it down (quieter listening
 *    slowly pays the time back). An optional safe maximum keeps the
 *    volume below a chosen level.
 *  • Battery: at 20% (not charging) the Harmony turns on Ultra Fast Mode by
 *    itself, and turns it off again once the phone charges — only if it was
 *    the one who turned it on.
 *  • Shake to skip: two firm shakes in a row play the next song.
 *  • Beat vibration: the phone pulses with the kicks while the app is open.
 */

let started = false

export function startEveryday(): void {
  if (started) return
  started = true
  startEarCare()
  startBatterySaver()
  startShake()
  startBeatVibe()
}

function buzz(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* no vibration here */
  }
}

// ── ear care ──────────────────────────────────────────────────────────

/** what counts as "loud" (share of the phone's media volume) */
const LOUD = 0.8
/** loud listening, in seconds, before the notice */
const LOUD_LIMIT = 45 * 60

let loudSec = 0

function startEarCare(): void {
  let last = Date.now()
  const tick = async (): Promise<void> => {
    const now = Date.now()
    const dt = Math.min(60, (now - last) / 1000)
    last = now
    const { earCare, safeMax, say } = usePhoneStore.getState()
    if (!earCare && safeMax == null) return
    if (!usePlayerStore.getState().isPlaying) return
    const info = await HarmonyPhone.audioInfo().catch(() => null)
    if (!info || !info.headphones || info.max <= 0) return
    const level = info.volume / info.max

    if (safeMax != null && level > safeMax + 0.001) {
      const cap = Math.floor(safeMax * info.max)
      await HarmonyPhone.setVolume({ volume: cap, show: true }).catch(() => undefined)
      say(t('🎧 Volume limitado a {n}% para cuidar dos seus ouvidos', { n: Math.round(safeMax * 100) }))
      return
    }
    if (!earCare) return
    if (level >= LOUD) loudSec += dt
    else loudSec = Math.max(0, loudSec - dt / 2)
    if (loudSec >= LOUD_LIMIT && !document.hidden) {
      loudSec = 0
      usePhoneStore.setState({ earWarning: true })
      buzz(60)
    }
  }
  setInterval(() => void tick(), 10_000)
}

/** the notice's "turn it down" button */
export async function lowerVolume(to = 0.6): Promise<void> {
  const info = await HarmonyPhone.audioInfo().catch(() => null)
  if (!info) return
  await HarmonyPhone.setVolume({ volume: Math.min(info.volume, Math.round(to * info.max)), show: true }).catch(() => undefined)
}

// ── battery ───────────────────────────────────────────────────────────

const AUTO_KEY = 'harmony.batteryAuto'
const DECLINED_KEY = 'harmony.batteryDeclined'

function startBatterySaver(): void {
  /** Ultra Fast was turned on by the battery (remembered across restarts) */
  let auto = localStorage.getItem(AUTO_KEY) === '1'
  let ours = false
  const setAuto = (on: boolean): void => {
    auto = on
    try {
      if (on) localStorage.setItem(AUTO_KEY, '1')
      else localStorage.removeItem(AUTO_KEY)
    } catch {
      /* fine for this session */
    }
  }
  /** turned off by hand while the battery was low: not again until it charges */
  let declined = localStorage.getItem(DECLINED_KEY) === '1'
  const setDeclined = (on: boolean): void => {
    declined = on
    try {
      if (on) localStorage.setItem(DECLINED_KEY, '1')
      else localStorage.removeItem(DECLINED_KEY)
    } catch {
      /* fine for this session */
    }
  }
  // the listener changed it by hand: from now on it's theirs
  onUltraFastChange((on) => {
    if (ours) return
    if (auto && !on) setDeclined(true)
    setAuto(false)
  })

  const check = async (): Promise<void> => {
    const b = await HarmonyPhone.battery().catch(() => null)
    if (!b || b.level < 0) return
    const { batterySaver, say } = usePhoneStore.getState()
    if (declined && (b.charging || b.level >= 30)) setDeclined(false)
    if (batterySaver && !auto && !declined && !isUltraFast() && !b.charging && b.level <= 20) {
      ours = true
      setUltraFast(true)
      ours = false
      setAuto(true)
      say(t('🔋 Bateria em {n}%: Modo Ultra Rápido ligado para economizar', { n: b.level }))
    } else if (auto && (b.charging || b.level >= 30 || !batterySaver)) {
      ours = true
      setUltraFast(false)
      ours = false
      setAuto(false)
      if (b.charging) say(t('🔌 Carregando: o Harmony voltou ao normal'))
    }
  }
  void check()
  setInterval(() => void check(), 60_000)
  void App.addListener('resume', () => void check())
  usePhoneStore.subscribe((s, prev) => {
    if (s.batterySaver !== prev.batterySaver) void check()
  })
}

// ── shake to skip ─────────────────────────────────────────────────────

/** m/s² beyond gravity that counts as a shake */
const SHAKE = 15

function startShake(): void {
  let peaks: number[] = []
  let quietUntil = 0
  const onMotion = (e: DeviceMotionEvent): void => {
    const a = e.acceleration
    let force: number
    if (a && a.x != null && a.y != null && a.z != null) force = Math.hypot(a.x, a.y, a.z)
    else {
      const g = e.accelerationIncludingGravity
      if (!g || g.x == null || g.y == null || g.z == null) return
      force = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81)
    }
    const now = performance.now()
    if (now < quietUntil || force < SHAKE) return
    // one peak per swing: ignore the samples of the same jolt
    if (peaks.length && now - peaks[peaks.length - 1] < 120) return
    peaks = peaks.filter((p) => now - p < 700)
    peaks.push(now)
    if (peaks.length >= 2) {
      peaks = []
      quietUntil = now + 1500
      const p = usePlayerStore.getState()
      if (!p.queue.length) return
      p.next()
      buzz(40)
    }
  }
  let on = false
  const sync = (): void => {
    const want = usePhoneStore.getState().shakeToSkip
    if (want === on) return
    on = want
    if (on) window.addEventListener('devicemotion', onMotion)
    else window.removeEventListener('devicemotion', onMotion)
  }
  sync()
  usePhoneStore.subscribe(sync)
}

// ── beat vibration ────────────────────────────────────────────────────

function startBeatVibe(): void {
  let raf = 0
  let last = 0
  let avg = 0
  let lastBuzz = 0
  let freq: Uint8Array<ArrayBuffer> | null = null

  const frame = (now: number): void => {
    raf = 0
    if (!running()) return
    raf = requestAnimationFrame(frame)
    if (now - last < 30) return
    const dt = Math.min(0.1, (now - last) / 1000 || 0.03)
    last = now
    const an = getEngine().getDetectorNode()
    if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(freq)
    // the lowest ~150 Hz: the kick and the bass
    const top = Math.max(2, Math.min(freq.length, Math.round((150 / (an.context.sampleRate / 2)) * freq.length)))
    let sum = 0
    for (let i = 1; i < top; i++) sum += freq[i]
    const bass = Math.pow(sum / (top - 1) / 255, 1.4)
    if (bass > avg * 1.3 + 0.07 && now - lastBuzz > 200) {
      lastBuzz = now
      buzz(Math.round(18 + bass * 22))
    }
    avg += (bass - avg) * Math.min(1, dt * 4)
  }

  const running = (): boolean =>
    usePhoneStore.getState().beatVibe && usePlayerStore.getState().isPlaying && !document.hidden

  const sync = (): void => {
    if (running() && !raf) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }
  usePhoneStore.subscribe(sync)
  usePlayerStore.subscribe((s, prev) => {
    if (s.isPlaying !== prev.isPlaying) sync()
  })
  document.addEventListener('visibilitychange', sync)
  sync()
}
