/**
 * Harmony's audio engine.
 *
 * Two <audio> elements (A/B slots) stream through the harmony:// protocol
 * (which supports Range requests, so seeking and `ended` are sample-accurate)
 * into a shared Web Audio graph:
 *
 *   slotA ─ gainA ─┐            ┌─ dry ──────────────────────┐
 *                  ├─ mix ──────┤                            ├─ 10x BiquadFilter (equalizer) ─ volumeGain ─ focusGain ─ sleepGain ─ output
 *   slotB ─ gainB ─┘            └─ karaoke (vocal cut) ─ wet ┘
 *
 * The dual-slot design gives us gapless track changes and true crossfade:
 * the next song starts in the idle slot while the old one ramps down.
 *
 * Karaoke: vocals are usually mixed dead centre, so L−R ("side") cancels
 * them while keeping most instruments; bass and kick are centred too, so
 * they come back from a low-passed L+R ("mid"). The branch is only wired up
 * while karaoke is on, so it costs nothing the rest of the time.
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
  /** after the equalizer: takes back what the EQ curve adds at its peak (no clipping) */
  private eqTrim: GainNode
  /** a safety limiter before the volume: a peak that still gets through is held, not clipped */
  private limiter: DynamicsCompressorNode
  /** after the volume: the sleep timer's slow fade to silence */
  private sleepGain: GainNode
  /** Focus mode: the music fades out for the break and back in after it */
  private focusGain: GainNode
  private analyser: AnalyserNode
  private detector: AnalyserNode
  private freqData: Uint8Array<ArrayBuffer> | null = null
  private autoNextFired = false
  // karaoke branch
  private mix: GainNode
  private dry: GainNode
  private wet: GainNode
  private splitter: ChannelSplitterNode
  private midAnalyser: AnalyserNode
  private sideAnalyser: AnalyserNode
  private vocalAnalyser: AnalyserNode
  private karaokeWired = false
  private karaokeOn = false
  private karaokeBuf: Float32Array<ArrayBuffer> | null = null

  /** Crossfade duration in seconds; 0 disables it. */
  crossfadeSec = 0

  onTime: (t: number, duration: number) => void = () => {}
  onEnded: () => void = () => {}
  /** Fired when crossfade window opens. Return 'advanced' if a new track was started. */
  onAutoNext: () => AutoNextResult = () => 'stay'

  constructor() {
    this.ctx = new AudioContext()

    this.volumeGain = this.ctx.createGain()
    this.sleepGain = this.ctx.createGain()
    this.focusGain = this.ctx.createGain()
    this.volumeGain.connect(this.focusGain)
    this.focusGain.connect(this.sleepGain)
    this.sleepGain.connect(this.ctx.destination)

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
    this.eqTrim = this.ctx.createGain()
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -1
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.25
    this.filters[this.filters.length - 1].connect(this.eqTrim)
    this.eqTrim.connect(this.limiter)
    this.limiter.connect(this.volumeGain)

    // Spectrum tap for the Cinema stage — after the EQ (so the lights react
    // to what's actually mixed), before the volume gain (lights shouldn't
    // die when the user just lowers the volume).
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.82
    this.filters[this.filters.length - 1].connect(this.analyser)

    // A second, lightly smoothed tap for onset / song-structure detection:
    // the visual analyser's heavy smoothing smears kicks into each other.
    this.detector = this.ctx.createAnalyser()
    this.detector.fftSize = 1024
    this.detector.smoothingTimeConstant = 0.25
    this.filters[this.filters.length - 1].connect(this.detector)

    const eqInput = this.filters[0]

    // Both slots meet here; the karaoke branch taps it as true stereo.
    this.mix = this.ctx.createGain()
    this.mix.channelCount = 2
    this.mix.channelCountMode = 'explicit'
    this.mix.channelInterpretation = 'speakers'
    this.dry = this.ctx.createGain()
    this.wet = this.ctx.createGain()
    this.wet.gain.value = 0
    this.mix.connect(this.dry)
    this.dry.connect(eqInput)
    this.wet.connect(eqInput)

    this.splitter = this.ctx.createChannelSplitter(2)
    const half = (v: number): GainNode => {
      const g = this.ctx.createGain()
      g.gain.value = v
      return g
    }
    const pass = (type: BiquadFilterType, freq: number): BiquadFilterNode => {
      const f = this.ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = 0.707
      return f
    }
    // side = (L − R) / 2: the centre (voice) cancels; high-passed so the
    // thin low end of the side doesn't fight the restored bass
    const side = this.ctx.createGain()
    const sideL = half(0.5)
    const sideR = half(-0.5)
    this.splitter.connect(sideL, 0)
    this.splitter.connect(sideR, 1)
    sideL.connect(side)
    sideR.connect(side)
    const sideHp1 = pass('highpass', 140)
    const sideHp2 = pass('highpass', 140)
    side.connect(sideHp1)
    sideHp1.connect(sideHp2)
    sideHp2.connect(this.wet)
    // mid = (L + R) / 2: low-passed to bring bass and kick back
    const mid = this.ctx.createGain()
    const midL = half(0.5)
    const midR = half(0.5)
    this.splitter.connect(midL, 0)
    this.splitter.connect(midR, 1)
    midL.connect(mid)
    midR.connect(mid)
    const midLp1 = pass('lowpass', 140)
    const midLp2 = pass('lowpass', 140)
    mid.connect(midLp1)
    midLp1.connect(midLp2)
    midLp2.connect(this.wet)
    // taps: is there any stereo at all (mono songs can't lose their voice),
    // and the singer's band of the centre, for the pitch the user is scored on
    this.midAnalyser = this.ctx.createAnalyser()
    this.midAnalyser.fftSize = 2048
    this.sideAnalyser = this.ctx.createAnalyser()
    this.sideAnalyser.fftSize = 2048
    mid.connect(this.midAnalyser)
    side.connect(this.sideAnalyser)
    const voiceBand = this.ctx.createBiquadFilter()
    voiceBand.type = 'bandpass'
    voiceBand.frequency.value = 520
    voiceBand.Q.value = 0.6
    this.vocalAnalyser = this.ctx.createAnalyser()
    this.vocalAnalyser.fftSize = 2048
    mid.connect(voiceBand)
    voiceBand.connect(this.vocalAnalyser)

    this.slots = [0, 1].map((idx) => {
      const el = new Audio()
      el.crossOrigin = 'anonymous' // + CORS headers on harmony:// → Web Audio can read samples
      el.preload = 'auto'
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      this.ctx.createMediaElementSource(el).connect(gain)
      gain.connect(this.mix)

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
  /**
   * Loads a song and plays it — or, with `autoplay` false, leaves it paused at
   * `startAt` seconds (picking up where the listener left off).
   */
  async load(url: string, startAt = 0, autoplay = true): Promise<void> {
    await this.ctx.resume().catch(() => {})

    const prev = this.slots[this.active]
    this.active = 1 - this.active
    const slot = this.slots[this.active]
    this.autoNextFired = false

    slot.el.src = url
    slot.el.currentTime = startAt

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

    if (!autoplay) return
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
    const target = Math.min(1, Math.max(0, v))
    // Ramp briefly instead of a hard jump — avoids audible clicks/zipper noise
    // when dragging the slider, and is cheaper than reacting per-sample.
    const g = this.volumeGain.gain
    const now = this.ctx.currentTime
    g.cancelScheduledValues(now)
    g.setTargetAtTime(target, now, 0.015)
  }

  /**
   * Sleep timer: the music fades to silence over `fadeSec`, starting in
   * `startInSec`. Scheduled on the audio clock, so it keeps time even when
   * the page's timers are slowed down (screen off, app in the background).
   */
  scheduleSleepFade(startInSec: number, fadeSec: number): void {
    const g = this.sleepGain.gain
    const at = this.ctx.currentTime + Math.max(0, startInSec)
    g.cancelScheduledValues(this.ctx.currentTime)
    g.setValueAtTime(1, this.ctx.currentTime)
    g.setValueAtTime(1, at)
    g.linearRampToValueAtTime(0.0001, at + Math.max(0.5, fadeSec))
  }

  /**
   * Focus mode: glide to `level` (0..1) over `sec`, starting in `startInSec`
   * — on the audio clock, so a break starts on time with the screen off.
   */
  focusFade(level: number, sec: number, startInSec = 0): void {
    const g = this.focusGain.gain
    const now = this.ctx.currentTime
    const at = now + Math.max(0, startInSec)
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(Math.max(0.0001, level), at + Math.max(0.1, sec))
  }

  /**
   * The musical alarm: from silence up to full sound over `sec`, slow at
   * first and faster at the end (a squared curve), so the first minute is a
   * whisper instead of a jump.
   */
  focusRise(sec: number): void {
    const g = this.focusGain.gain
    const now = this.ctx.currentTime
    const curve = new Float32Array(64)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.max(0.0001, Math.pow(i / (curve.length - 1), 2))
    g.cancelScheduledValues(now)
    g.setValueAtTime(0.0001, now)
    g.setValueCurveAtTime(curve, now + 0.05, Math.max(1, sec))
  }

  /**
   * A whole focus round on the audio clock: (from silence, when `fadeIn`)
   * up to full sound over `fadeSec`, full sound, and down to silence over the
   * last `fadeSec` of `totalSec` — when the break begins.
   */
  focusRound(totalSec: number, fadeSec: number, fadeIn: boolean): void {
    const g = this.focusGain.gain
    const now = this.ctx.currentTime
    g.cancelScheduledValues(now)
    if (fadeIn) {
      g.setValueAtTime(0.0001, now)
      g.linearRampToValueAtTime(1, now + fadeSec)
    } else g.setValueAtTime(1, now)
    const end = now + Math.max(fadeSec * 2, totalSec)
    g.setValueAtTime(1, end - fadeSec)
    g.linearRampToValueAtTime(0.0001, end)
  }

  /** back to full sound (the timer was cancelled, or the music was paused after it) */
  resetSleepFade(): void {
    const g = this.sleepGain.gain
    g.cancelScheduledValues(this.ctx.currentTime)
    g.setTargetAtTime(1, this.ctx.currentTime, 0.05)
  }

  setEqGains(gainsDb: number[]): void {
    this.filters.forEach((f, i) => {
      f.gain.value = gainsDb[i] ?? 0
    })
    // The bands overlap, so the curve's real peak is above any single slider
    // (Bass Boost's +7 dB reaches about +10). Lower the sound by that peak:
    // the EQ keeps its shape and loud masters stop clipping.
    const n = 96
    const freqs = new Float32Array(n)
    for (let i = 0; i < n; i++) freqs[i] = 20 * Math.pow(1000, i / (n - 1)) // 20 Hz – 20 kHz
    const mag = new Float32Array(n)
    const phase = new Float32Array(n)
    const total = new Float32Array(n).fill(1)
    for (const f of this.filters) {
      f.getFrequencyResponse(freqs, mag, phase)
      for (let i = 0; i < n; i++) total[i] *= mag[i]
    }
    const peakDb = 20 * Math.log10(Math.max(...total))
    const trim = Math.pow(10, -Math.max(0, peakDb) / 20)
    this.eqTrim.gain.setTargetAtTime(trim, this.ctx.currentTime, 0.05)
  }

  /**
   * Karaoke on/off. While on, the stereo split is wired (for the vocal cut
   * and the pitch/mono taps); `amount` 0..1 is how much of the voice to cut.
   */
  setKaraoke(on: boolean, amount = 0): void {
    this.karaokeOn = on
    if (on && !this.karaokeWired) {
      this.mix.connect(this.splitter)
      this.karaokeWired = true
    }
    const a = on ? Math.min(1, Math.max(0, amount)) : 0
    const now = this.ctx.currentTime
    this.dry.gain.cancelScheduledValues(now)
    this.wet.gain.cancelScheduledValues(now)
    this.dry.gain.setTargetAtTime(1 - a, now, 0.05)
    this.wet.gain.setTargetAtTime(a, now, 0.05)
    if (!on && this.karaokeWired) {
      // let the fade finish before unplugging
      window.setTimeout(() => {
        if (!this.karaokeOn && this.karaokeWired) {
          this.mix.disconnect(this.splitter)
          this.karaokeWired = false
        }
      }, 400)
    }
  }

  private rms(a: AnalyserNode): number {
    if (!this.karaokeBuf || this.karaokeBuf.length !== a.fftSize) this.karaokeBuf = new Float32Array(a.fftSize)
    a.getFloatTimeDomainData(this.karaokeBuf)
    let sum = 0
    for (let i = 0; i < this.karaokeBuf.length; i++) sum += this.karaokeBuf[i] * this.karaokeBuf[i]
    return Math.sqrt(sum / this.karaokeBuf.length)
  }

  /** Loudness of the centre and of the sides (only while karaoke is on). */
  getStereoLevels(): { mid: number; side: number } {
    if (!this.karaokeWired) return { mid: 0, side: 0 }
    return { mid: this.rms(this.midAnalyser), side: this.rms(this.sideAnalyser) }
  }

  /** The centre channel in the singing range, for pitch detection. */
  getVocalAnalyser(): AnalyserNode | null {
    return this.karaokeWired ? this.vocalAnalyser : null
  }

  /** Direct access for the StageDirector: it reads frequency data into its
   *  own preallocated buffers every frame (no per-frame allocations). */
  /**
   * The music as a MediaStream, for Pharaf (friends' voice calls). Taken after
   * the equalizer and before the volume: friends hear Harmony's sound, but each
   * one sets their own volume. Created on first use and kept.
   */
  private shareDest: MediaStreamAudioDestinationNode | null = null
  getShareStream(): MediaStream {
    if (!this.shareDest) {
      this.shareDest = this.ctx.createMediaStreamDestination()
      this.limiter.connect(this.shareDest) // after the EQ trim and limiter: no clipping in the call either
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    return this.shareDest.stream
  }

  getAnalyserNode(): AnalyserNode {
    return this.analyser
  }

  /** Lightly smoothed analyser used by the StageDirector to find kicks and
   *  song sections (onsets need sharp attacks). */
  getDetectorNode(): AnalyserNode {
    return this.detector
  }

  getSampleRate(): number {
    return this.ctx.sampleRate
  }

  /** Exact playback position of the active slot, read straight from the
   *  media element (the store only hears about it ~4x per second). */
  getCurrentTime(): number {
    return this.slots[this.active].el.currentTime || 0
  }

  /** The equalizer as it is set now, so an offline render (edit export)
   *  can rebuild the same filter chain. */
  getEqSnapshot(): { type: BiquadFilterType; frequency: number; Q: number; gain: number }[] {
    return this.filters.map((f) => ({ type: f.type, frequency: f.frequency.value, Q: f.Q.value, gain: f.gain.value }))
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
