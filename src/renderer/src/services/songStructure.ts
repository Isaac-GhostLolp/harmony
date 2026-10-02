/**
 * SongStructure — real-time reading of a song's form.
 *
 * The StageDirector feeds it a handful of per-frame audio features; it
 * answers "where are we in the song?" with a show state that follows what a
 * listener feels, not raw volume:
 *
 *   • Everything is RELATIVE TO THE CURRENT SONG. Each track learns its own
 *     loudness floor/ceiling (overall and bass), so a quiet ballad and a
 *     brick-walled funk track are both read on their own scale.
 *   • A DROP is a contrast event, not a loud moment: the bass/kick slams
 *     back after it was removed (a break, a build, or the one-bar beat cut
 *     funk and EDM use all the time). Loud-but-steady never fires a drop, and
 *     songs without a real bass slam (calm songs) never get one.
 *   • A BUILD needs a sustained rise with the bass held back, and it is
 *     short-lived: it either lands in a drop or falls back into the groove.
 *   • CLIMAX is the song's own loudest sustained section; GROOVE is the
 *     steady body; BREAK is the quiet part. All of them are re-evaluated
 *     continuously with hysteresis, so sections follow the music.
 *   • A beat tracker (onset detection + tempo histogram + phase lock) gives
 *     BPM and a beat clock; body-section changes land on beats.
 *
 * Pausing freezes the reading (nothing is re-learned while silent) and a new
 * track always restarts from the intro with fresh per-song calibration.
 * Zero per-frame allocations.
 */

export type SectionState = 'ambient' | 'intro' | 'groove' | 'build' | 'drop' | 'climax' | 'break' | 'finale'

export interface StructureInput {
  playing: boolean
  dt: number
  /** Song position 0..1. */
  progress: number
  /** Sub + kick band level (unsmoothed), 0..1. */
  low: number
  /** Overall musical loudness, 0..1. */
  full: number
  /** Hi-hat / air band level, 0..1. */
  high: number
  /** Positive spectral flux of the low band — kick onset strength. */
  lowOnset: number
}

// ---- tuning --------------------------------------------------------------
const MIN_RANGE_FULL = 0.1 // a song never looks more dynamic than this floor
const MIN_RANGE_LOW = 0.12
const BASSLESS_CEIL = 0.3 // low-band ceiling below this = no bass to drop
const SLAM_REL = 0.62 // bass must come back to ≥62% of the song's bass range
const SLAM_JUMP = 0.3 // …and jump ≥30% of the range above the recent dip
const DIP_MEMORY_MIN = 0.35 // seconds of bass dip needed before a slam counts
const DROP_GAP = 3.5 // minimum seconds between two drops
const BUILD_RISE = 0.02 // rise (range units / s) that starts a build in beat-driven music
const BUILD_RISE_CALM = 0.05 // calm songs need a real crescendo
const BUILD_MAX = 24
const PERIOD_MIN = 0.33 // 180 bpm
const PERIOD_MAX = 0.75 // 80 bpm
const HIST_BINS = 43 // 10ms bins between PERIOD_MIN and PERIOD_MAX
const ONSET_RING = 24
const SLOPE_N = 24 // 6s of history at 4 samples/s

function ema(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Adaptive floor/ceiling tracker: learns the song's own dynamic range. */
class RangeTracker {
  floor = 0
  ceil = 0
  seeded = false

  constructor(
    private minRange: number,
    private ceilTau: number,
    private floorTau: number
  ) {}

  reset(prior: number): void {
    this.seeded = false
    this.ceil = prior
    this.floor = prior
  }

  update(x: number, dt: number): void {
    if (!this.seeded) {
      this.seeded = true
      this.floor = x
      this.ceil = Math.max(x, this.ceil)
      return
    }
    if (x > this.ceil) this.ceil = x
    else this.ceil += (x - this.ceil) * ema(dt, this.ceilTau)
    if (x < this.floor) this.floor = x
    else this.floor += (x - this.floor) * ema(dt, this.floorTau)
  }

  get range(): number {
    return Math.max(this.ceil - this.floor, this.minRange)
  }

  rel(x: number): number {
    return clamp01((x - this.floor) / this.range)
  }
}

export class SongStructure {
  // ---- published ----
  state: SectionState = 'ambient'
  stateTime = 0
  stateJustChanged = false
  /** Build tension 0..1. */
  tension = 0
  /** Energy relative to this song's own range, 0..1. */
  relEnergy = 0
  /** Bass presence relative to this song's own range, 0..1. */
  relLow = 0
  /** How much a steady beat is driving the music right now, 0..1. */
  drive = 0
  bpm = 0
  /** 0..1 confidence in the tempo estimate. */
  tempoConfidence = 0
  /** 0..1 position inside the current beat. */
  beatPhase = 0
  beatTick = false
  beatCount = 0
  kickHit = false
  /** 0..1 strength of the kick that fired this frame, relative to the song. */
  kickStrength = 0
  /** Drops fired in this track so far. */
  dropCount = 0
  /** Seconds the song has been playing (excludes pauses). */
  songTime = 0

  // ---- smoothed features ----
  private fullFast = 0
  private fullMid = 0
  private lowFast = 0
  private lowMid = 0
  private lowSlow = 0
  private highMid = 0
  private fullRange = new RangeTracker(MIN_RANGE_FULL, 75, 40)
  private lowRange = new RangeTracker(MIN_RANGE_LOW, 75, 40)
  private priorFullCeil = 0
  private priorLowCeil = 0

  // ---- onsets / tempo ----
  private onsetMean = 0
  private onsetVar = 0
  private refractory = 0
  private onsetTimes = new Float64Array(ONSET_RING)
  private onsetCount = 0
  private hist = new Float32Array(HIST_BINS)
  private period = 0.5
  private lastBeat = 0
  private density = 0

  // ---- slopes ----
  private fullHist = new Float32Array(SLOPE_N)
  private highHist = new Float32Array(SLOPE_N)
  private histCursor = 0
  private histFill = 0
  private histTimer = 0
  private rise = 0
  private highRise = 0

  // ---- section memory ----
  private dipMem = 0
  private lowMinRecent = 0
  private sinceDrop = 99
  private riseHold = 0
  private fallHold = 0
  private loudHold = 0
  private quietHold = 0
  private bodyHold = 0
  private pendingState: SectionState | null = null
  private lastProgress = 0

  /** A new track started: always open on the intro, recalibrate per song. */
  resetTrack(): void {
    this.priorFullCeil = Math.max(this.priorFullCeil * 0.9, this.fullRange.ceil * 0.9)
    this.priorLowCeil = Math.max(this.priorLowCeil * 0.9, this.lowRange.ceil * 0.9)
    this.fullRange.reset(this.priorFullCeil)
    this.lowRange.reset(this.priorLowCeil)
    this.fullFast = this.fullMid = 0
    this.lowFast = this.lowMid = this.lowSlow = 0
    this.highMid = 0
    this.onsetMean = this.onsetVar = 0
    this.onsetCount = 0
    this.hist.fill(0)
    this.histFill = 0
    this.histCursor = 0
    this.rise = this.highRise = 0
    this.dipMem = 0
    this.sinceDrop = 99
    this.riseHold = this.fallHold = this.loudHold = this.quietHold = this.bodyHold = 0
    this.pendingState = null
    this.dropCount = 0
    this.drive = 0
    this.density = 0
    this.tension = 0
    this.songTime = 0
    this.tempoConfidence = 0
    this.beatCount = 0
    this.setState('intro')
  }

  private setState(next: SectionState): void {
    this.pendingState = null
    if (next === this.state) return
    this.state = next
    this.stateTime = 0
    this.stateJustChanged = true
    if (next === 'drop') {
      this.dropCount++
      this.sinceDrop = 0
      this.dipMem = 0
    }
    if (next === 'build') this.tension = 0
  }

  /** Body-section changes wait for the next beat when the tempo is solid. */
  private requestState(next: SectionState): void {
    if (next === this.state) {
      this.pendingState = null
      return
    }
    if (this.tempoConfidence < 0.25) this.setState(next)
    else this.pendingState = next
  }

  update(inp: StructureInput, now: number): void {
    const dt = inp.dt
    this.stateJustChanged = false
    this.kickHit = false
    this.beatTick = false

    // seeking far back to the start counts as a fresh listen
    if (inp.progress < 0.01 && this.lastProgress > 0.05 && inp.playing) this.resetTrack()
    this.lastProgress = inp.progress

    // PAUSE: freeze the reading — nothing decays, nothing is re-learned
    if (!inp.playing) return
    if (this.state === 'ambient') this.setState('intro')
    this.stateTime += dt
    this.songTime += dt
    this.sinceDrop += dt

    // ---- smoothing ----
    this.fullFast += (inp.full - this.fullFast) * ema(dt, 0.3)
    this.fullMid += (inp.full - this.fullMid) * ema(dt, 1.5)
    this.lowFast += (inp.low - this.lowFast) * ema(dt, 0.12)
    this.lowMid += (inp.low - this.lowMid) * ema(dt, 1.2)
    this.lowSlow += (inp.low - this.lowSlow) * ema(dt, 5)
    this.highMid += (inp.high - this.highMid) * ema(dt, 1.5)
    // silence (gaps, fades) must not teach the song a fake floor
    const audible = inp.full > 0.03
    if (audible) {
      this.fullRange.update(this.fullMid, dt)
      this.lowRange.update(this.lowMid, dt)
    }
    this.relEnergy = this.fullRange.rel(this.fullMid)
    this.relLow = this.lowRange.rel(this.lowMid)
    const relLowFast = this.lowRange.rel(this.lowFast)

    // ---- kick onsets: adaptive threshold on low-band flux ----
    const o = inp.lowOnset
    const a = ema(dt, 0.8)
    this.onsetMean += (o - this.onsetMean) * a
    this.onsetVar += ((o - this.onsetMean) * (o - this.onsetMean) - this.onsetVar) * a
    if (this.refractory > 0) this.refractory -= dt
    const thresh = this.onsetMean + 1.5 * Math.sqrt(this.onsetVar) + 0.01
    if (o > thresh && this.refractory <= 0 && inp.low > this.lowRange.floor + this.lowRange.range * 0.25) {
      this.refractory = 0.11
      this.kickHit = true
      this.kickStrength = clamp01(relLowFast * 0.7 + clamp01((o - thresh) / (thresh + 0.01)) * 0.3)
      this.registerOnset(now)
    }

    // ---- beat clock (phase-locked to the onsets) ----
    if (now - this.lastBeat >= this.period) {
      this.lastBeat += this.period
      if (now - this.lastBeat > this.period) this.lastBeat = now // lost: re-anchor
      this.beatTick = true
      this.beatCount++
    }
    this.beatPhase = clamp01((now - this.lastBeat) / this.period)

    // kick density over the last 4s → how much a beat drives the song
    let recent = 0
    const n = Math.min(this.onsetCount, ONSET_RING)
    for (let i = 0; i < n; i++) if (now - this.onsetTimes[i] < 4) recent++
    this.density = recent / 4
    const driveNow = clamp01(this.density / 1.6) * (0.35 + 0.65 * this.relLow)
    this.drive += (driveNow - this.drive) * ema(dt, 2.5)

    // ---- slopes over the last few seconds ----
    this.histTimer += dt
    if (this.histTimer >= 0.25) {
      this.histTimer = 0
      this.fullHist[this.histCursor] = this.fullRange.rel(this.fullMid)
      this.highHist[this.histCursor] = this.highMid
      this.histCursor = (this.histCursor + 1) % SLOPE_N
      if (this.histFill < SLOPE_N) this.histFill++
      if (this.histFill >= 16) {
        this.rise = this.slope(this.fullHist, 16)
        this.highRise = this.slope(this.highHist, 16)
      }
    }

    // ---- bass dip memory (the "beat cut" before a drop) ----
    const dipped = this.lowSlow - this.lowFast > this.lowRange.range * 0.3 || relLowFast < 0.28
    if (dipped) {
      this.dipMem = Math.min(4, this.dipMem + dt)
      this.lowMinRecent = Math.min(this.lowMinRecent, this.lowFast)
    } else {
      this.dipMem = Math.max(0, this.dipMem - dt * 0.6)
      if (this.dipMem === 0) this.lowMinRecent = this.lowFast
    }

    // ---- DROP: the bass slams back after being removed ----
    const hasBass = this.lowRange.ceil > BASSLESS_CEIL && this.lowRange.ceil - this.lowRange.floor > MIN_RANGE_LOW * 0.8
    const slam =
      this.kickHit &&
      hasBass &&
      relLowFast >= SLAM_REL &&
      this.lowFast - this.lowMinRecent >= this.lowRange.range * SLAM_JUMP
    const primed = this.dipMem >= DIP_MEMORY_MIN || (this.state === 'build' && this.tension > 0.35)
    if (slam && primed && this.sinceDrop > DROP_GAP && this.songTime > 3 && this.state !== 'drop') {
      this.setState('drop')
    }

    this.runSections(inp, dt)

    if (this.pendingState && this.beatTick) this.setState(this.pendingState)
  }

  private runSections(inp: StructureInput, dt: number): void {
    const relF = this.relEnergy
    const riseNeed = this.drive > 0.3 ? BUILD_RISE : BUILD_RISE_CALM
    const rising = this.rise > riseNeed && this.highRise >= -0.002 && (this.relLow < 0.55 || this.dipMem > 0.5)
    this.riseHold = rising ? this.riseHold + dt : Math.max(0, this.riseHold - dt * 2)
    this.fallHold = this.rise < 0.005 ? this.fallHold + dt : 0
    this.loudHold = relF > 0.72 && this.relLow > 0.5 ? this.loudHold + dt : 0
    this.quietHold = relF < 0.32 ? this.quietHold + dt : 0
    this.bodyHold = relF > 0.42 ? this.bodyHold + dt : 0
    const beatDriven = this.drive > 0.35
    // early in a song its range is still unknown: everything looks "loud",
    // so climax waits for a drop or for enough of the song to be heard
    const climaxOk = this.dropCount > 0 || this.songTime > 40

    switch (this.state) {
      case 'ambient':
        break
      case 'intro':
        if (this.stateTime > 4 && this.riseHold > 1.5) this.requestState('build')
        else if (this.stateTime > 4 && (beatDriven || this.bodyHold > 3)) {
          this.requestState(climaxOk && this.loudHold > 3 ? 'climax' : 'groove')
        }
        break
      case 'groove':
        if (this.riseHold > 1.5) this.requestState('build')
        else if (climaxOk && this.loudHold > 4 && this.stateTime > 4) this.requestState('climax')
        else if (this.quietHold > 2.5 && this.stateTime > 4) this.requestState('break')
        break
      case 'build':
        this.tension = clamp01(Math.max(this.tension, this.stateTime / 12 + this.rise * 6))
        if (this.stateTime > BUILD_MAX || (this.fallHold > 2.5 && this.stateTime > 3)) {
          this.requestState(climaxOk && this.loudHold > 1 ? 'climax' : relF > 0.4 ? 'groove' : 'break')
        }
        break
      case 'drop': {
        const dropLen = Math.max(2, this.period * 4)
        if (this.stateTime > dropLen) this.setState(relF > 0.6 && this.relLow > 0.45 ? 'climax' : 'groove')
        break
      }
      case 'climax':
        if (inp.progress > 0.88 && this.stateTime > 2) this.setState('finale')
        else if (this.riseHold > 2.5) this.requestState('build')
        else if (this.quietHold > 1.5) this.requestState('break')
        else if (relF < 0.55 && this.stateTime > 4 && this.loudHold === 0 && this.lowMid < this.lowSlow * 0.97) {
          this.requestState('groove')
        }
        break
      case 'break':
        if (this.riseHold > 1.5) this.requestState('build')
        else if (this.bodyHold > 2 && this.stateTime > 3) this.requestState(climaxOk && this.loudHold > 1 ? 'climax' : 'groove')
        break
      case 'finale':
        if (this.quietHold > 2) this.requestState('break')
        break
    }
    if (this.state !== 'build') this.tension *= 0.97
  }

  /** Least-squares slope (units per second) of the newest `count` samples. */
  private slope(buf: Float32Array, count: number): number {
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    for (let i = 0; i < count; i++) {
      const idx = (this.histCursor - count + i + SLOPE_N * 2) % SLOPE_N
      const x = i * 0.25
      const y = buf[idx]
      sx += x
      sy += y
      sxx += x * x
      sxy += x * y
    }
    const den = count * sxx - sx * sx
    return den === 0 ? 0 : (count * sxy - sx * sy) / den
  }

  private registerOnset(now: number): void {
    const slot = this.onsetCount % ONSET_RING
    this.onsetTimes[slot] = now
    this.onsetCount++
    const n = Math.min(this.onsetCount, ONSET_RING)
    if (n < 4) return

    // tempo histogram over onset pairs, folded into one beat period
    const h = this.hist
    for (let i = 0; i < HIST_BINS; i++) h[i] *= 0.9
    for (let i = 0; i < n; i++) {
      if (i === slot) continue
      const d = now - this.onsetTimes[i]
      if (d <= 0 || d > 2.4) continue
      for (let k = 1; k <= 4; k++) {
        const p = d / k
        if (p < PERIOD_MIN || p > PERIOD_MAX) continue
        const b = Math.round((p - PERIOD_MIN) * 100)
        const w = 1 / k
        h[b] += w
        if (b > 0) h[b - 1] += w * 0.5
        if (b < HIST_BINS - 1) h[b + 1] += w * 0.5
      }
    }
    let best = 0
    let total = 0
    for (let i = 0; i < HIST_BINS; i++) {
      total += h[i]
      if (h[i] > h[best]) best = i
    }
    if (total > 0) {
      const p = PERIOD_MIN + best / 100
      this.tempoConfidence = clamp01((h[best] / total) * 4)
      this.period += (p - this.period) * 0.25
      this.bpm = 60 / this.period
    }

    // phase lock: nudge the beat clock toward onsets that land near a beat
    const err = now - this.lastBeat
    const wrapped = err > this.period / 2 ? err - this.period : err
    if (Math.abs(wrapped) < this.period * 0.25) this.lastBeat += wrapped * 0.35
  }
}
