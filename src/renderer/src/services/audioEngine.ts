/**
 * Harmony's audio engine.
 *
 * Two <audio> elements (A/B slots) stream through the harmony:// protocol
 * (which supports Range requests, so seeking and `ended` are sample-accurate)
 * into a shared Web Audio graph:
 *
 *   slotA ─ gainA ─┐
 *                  ├─ 10x BiquadFilter (equalizer) ─ volumeGain ─ output
 *   slotB ─ gainB ─┘
 *
 * The dual-slot design gives us gapless track changes and true crossfade:
 * the next song starts in the idle slot while the old one ramps down.
 */

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const

interface Slot {
  el: HTMLAudioElement
  gain: GainNode
}

type AutoNextResult = 'advanced' | 'stay'

export class AudioEngine {
  private ctx: AudioContext
  private slots: Slot[]
  private active = 0
  private filters: BiquadFilterNode[]
  private volumeGain: GainNode
  private analyser: AnalyserNode
  private freqData: Uint8Array<ArrayBuffer> | null = null
  private autoNextFired = false

  /** Crossfade duration in seconds; 0 disables it. */
  crossfadeSec = 0

  onTime: (t: number, duration: number) => void = () => {}
  onEnded: () => void = () => {}
  /** Fired when crossfade window opens. Return 'advanced' if a new track was started. */
  onAutoNext: () => AutoNextResult = () => 'stay'

  constructor() {
    this.ctx = new AudioContext()

    this.volumeGain = this.ctx.createGain()
    this.volumeGain.connect(this.ctx.destination)

    // Equalizer chain: lowshelf → 8x peaking → highshelf
    this.filters = EQ_BANDS.map((freq, i) => {
      const f = this.ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.1
      f.gain.value = 0
      return f
    })
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1])
    }
    this.filters[this.filters.length - 1].connect(this.volumeGain)

    // Spectrum tap for the Cinema stage — after the EQ (so the lights react
    // to what's actually mixed), before the volume gain (lights shouldn't
    // die when the user just lowers the volume).
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.82
    this.filters[this.filters.length - 1].connect(this.analyser)

    const eqInput = this.filters[0]

    this.slots = [0, 1].map((idx) => {
      const el = new Audio()
      el.crossOrigin = 'anonymous' // + CORS headers on harmony:// → Web Audio can read samples
      el.preload = 'auto'
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      this.ctx.createMediaElementSource(el).connect(gain)
      gain.connect(eqInput)

      el.addEventListener('timeupdate', () => this.handleTime(idx))
      el.addEventListener('ended', () => {
        if (idx === this.active) this.onEnded()
      })
      return { el, gain }
    })
  }

  private handleTime(idx: number): void {
    if (idx !== this.active) return
    const el = this.slots[idx].el
    const duration = Number.isFinite(el.duration) ? el.duration : 0
    this.onTime(Math.min(el.currentTime, duration || el.currentTime), duration)

    if (
      this.crossfadeSec > 0 &&
      duration > this.crossfadeSec * 2 && // don't crossfade tiny clips
      duration - el.currentTime <= this.crossfadeSec &&
      !this.autoNextFired
    ) {
      this.autoNextFired = true
      if (this.onAutoNext() === 'stay') {
        // Nothing to advance to (end of queue / repeat-one): let `ended` fire.
        // autoNextFired stays true so we don't loop; seek() resets it.
      }
    }
  }

  /** Loads and plays a track in the idle slot, crossfading from the current one. */
  async load(url: string): Promise<void> {
    await this.ctx.resume().catch(() => {})

    const prev = this.slots[this.active]
    this.active = 1 - this.active
    const slot = this.slots[this.active]
    this.autoNextFired = false

    slot.el.src = url
    slot.el.currentTime = 0

    const now = this.ctx.currentTime
    const fade = this.crossfadeSec
    slot.gain.gain.cancelScheduledValues(now)
    prev.gain.gain.cancelScheduledValues(now)

    if (fade > 0 && !prev.el.paused) {
      slot.gain.gain.setValueAtTime(0.0001, now)
      slot.gain.gain.exponentialRampToValueAtTime(1, now + fade)
      prev.gain.gain.setValueAtTime(Math.max(prev.gain.gain.value, 0.0001), now)
      prev.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade)
      const prevEl = prev.el
      window.setTimeout(() => {
        prevEl.pause()
        prevEl.removeAttribute('src')
        prevEl.load()
      }, fade * 1000 + 150)
    } else {
      slot.gain.gain.setValueAtTime(1, now)
      prev.gain.gain.setValueAtTime(0, now)
      prev.el.pause()
      prev.el.removeAttribute('src')
      prev.el.load()
    }

    await slot.el.play().catch(() => {
      /* autoplay policy: resolved on next user gesture via play() */
    })
  }

  play(): void {
    this.ctx.resume().catch(() => {})
    this.slots[this.active].el.play().catch(() => {})
  }

  pause(): void {
    this.slots[this.active].el.pause()
  }

  seek(seconds: number): void {
    const el = this.slots[this.active].el
    const max = Number.isFinite(el.duration) ? el.duration : seconds
    el.currentTime = Math.max(0, Math.min(seconds, max))
    this.autoNextFired = false
  }

  setVolume(v: number): void {
    this.volumeGain.gain.value = Math.min(1, Math.max(0, v))
  }

  setEqGains(gainsDb: number[]): void {
    this.filters.forEach((f, i) => {
      f.gain.value = gainsDb[i] ?? 0
    })
  }

  /** Direct access for the StageDirector: it reads frequency data into its
   *  own preallocated buffers every frame (no per-frame allocations). */
  getAnalyserNode(): AnalyserNode {
    return this.analyser
  }

  getSampleRate(): number {
    return this.ctx.sampleRate
  }

  /** Log-spaced frequency bands, each normalized 0..1. */
  getSpectrum(bins = 32): number[] {
    if (!this.freqData) this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(this.freqData)
    const n = this.freqData.length
    const out: number[] = []
    for (let b = 0; b < bins; b++) {
      const start = Math.max(1, Math.floor(Math.pow(n, b / bins)))
      const end = Math.max(start + 1, Math.floor(Math.pow(n, (b + 1) / bins)))
      let sum = 0
      let count = 0
      for (let i = start; i < end && i < n; i++) {
        sum += this.freqData[i]
        count++
      }
      out.push(count > 0 ? sum / count / 255 : 0)
    }
    return out
  }

  /** Average energy of the lowest bands (kick/bass), 0..1. */
  getBassLevel(): number {
    const spectrum = this.getSpectrum(24)
    return (spectrum[0] + spectrum[1] + spectrum[2] + spectrum[3]) / 4
  }
}

/** App-wide singleton — exactly one audio graph per window. */
let engine: AudioEngine | null = null
export function getEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine()
  return engine
}
