/**
 * StageDirector v3 — the show has a NARRATIVE, read from the song itself.
 *
 * Philosophy change: the stage must not stay constantly active. A show is
 * made of tension, rest, explosion, silence and climax — big moments only
 * feel big because calm exists before them. So the director runs a
 * Show-State machine (intro → groove → build → drop → climax → break →
 * finale), read by SongStructure (per-song calibrated sections, contrast-
 * based drops, beat tracking — see songStructure.ts), and publishes an EMOTION value (0..1) that is NOT the volume:
 * it is the dramatic intensity of the current moment. Every visual scales
 * by emotion, not by raw energy.
 *
 * It also:
 *   • fires SELECTIVE impacts — not every beat matters; an adaptive
 *     threshold keeps big hits rare so they land hard
 *   • choreographs 8 lasers through figures (fan, converge-on-the-DJ,
 *     scissors cross, wave, pinwheel) with spring-eased transitions
 *   • drives three independent light groups: Spotlights (vocals/DJ),
 *     Wash (soft base color) and Beams (sharp moving heads)
 *
 * Still draws nothing. Zero per-frame allocations. Android-port friendly.
 */
import { getEngine } from './audioEngine'
import { SongStructure, type SectionState } from './songStructure'

// ---------------------------------------------------------------------------
// Spring
// ---------------------------------------------------------------------------

export class Spring {
  value = 0
  private vel = 0
  constructor(
    private stiffness = 120,
    private damping = 14
  ) {}

  update(target: number, dt: number): number {
    const force = (target - this.value) * this.stiffness - this.vel * this.damping
    this.vel += force * dt
    this.value += this.vel * dt
    return this.value
  }

  snap(v: number): void {
    this.value = v
    this.vel = 0
  }
}

// ---------------------------------------------------------------------------
// Published types
// ---------------------------------------------------------------------------

export type ShowState = SectionState

export interface Fixture {
  aim: number // -1..1 across the stage
  intensity: number
  hueOffset: number
}

export interface Laser {
  /** Angle in radians, 0 = straight up, negative = left. */
  angle: number
  intensity: number
  hue: number
}

export interface Palette {
  a: number
  b: number
  c: number
  name: string
}

export interface DirectorFrame {
  // narrative
  state: ShowState
  stateJustChanged: boolean
  stateTime: number
  /** Dramatic intensity 0..1 — what everything should scale by. */
  emotion: number
  /** Build tension 0..1 (rises during build states). */
  tension: number
  /** Loudness relative to the current song's own range, 0..1. */
  relEnergy: number
  /** Estimated tempo (0 until known) and the beat clock. */
  bpm: number
  beatPhase: number
  /** ONE-FRAME flag on every beat of the tracked tempo. */
  beatTick: boolean

  // bands (0..1, inertial)
  subBass: number
  kick: number
  snare: number
  vocals: number
  hihats: number
  rms: number
  flux: number
  energy: number // raw heat 0..100 (micro-reactions only)

  // events
  kickTick: number // small envelope on every kick (subtle motion)
  impactHit: boolean // ONE-FRAME flag: a moment that matters
  /** Impact scale 1..5 fired THIS frame (0 = none). 5 = full spectacle. */
  impactLevel: number
  /** Consecutive on-beat kicks — high combos earn a level-5 reward. */
  combo: number
  impact: number // envelope of the big hit
  /** Envelope that accelerates laser choreography after level-4+ hits. */
  laserBoost: number
  flash: number // afterglow-decayed wash
  dim: number // pre-impact darkening

  // camera
  camX: number
  camY: number
  zoom: number

  // life
  breath: number
  sway: number

  bars: Float32Array

  // light groups — each with its own personality
  spots: Fixture[]
  wash: Fixture[]
  beams: Fixture[]
  backs: Fixture[] // backlights: rim glow behind the stage (sub-bass body)
  floors: Fixture[] // floor uplights (kick-driven)
  lasers: Laser[]

  palette: Palette
  playing: boolean
  t: number
}

/** Where the director reads audio from (the app engine, or a test rig). */
export interface AudioSource {
  /** Smoothed analyser: drives the visual bands and bars. */
  getAnalyserNode(): AnalyserNode
  /** Lightly smoothed analyser for onset / structure detection. */
  getDetectorNode(): AnalyserNode
  getSampleRate(): number
}

export interface DirectorConfig {
  intensity: number
  flashIntensity: number
  motionIntensity: number
  economyMode: boolean
  cinematicMode: boolean
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const PALETTES: Record<string, Palette> = {
  electronic: { a: 190, b: 315, c: 265, name: 'electronic' },
  rock: { a: 18, b: 40, c: 350, name: 'rock' },
  synthwave: { a: 275, b: 190, c: 320, name: 'synthwave' },
  jazz: { a: 38, b: 25, c: 55, name: 'jazz' },
  lofi: { a: 215, b: 200, c: 250, name: 'lofi' }
}

function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180
  return (a + d * t + 360) % 360
}

// ---------------------------------------------------------------------------
// Show-state parameters: how much each element is allowed to exist
// ---------------------------------------------------------------------------

interface StateParams {
  emotionBase: number
  beams: number
  wash: number
  spots: number
  laserMode: 'off' | 'converge' | 'show' | 'wave'
  speed: number
}

const STATE_PARAMS: Record<ShowState, StateParams> = {
  ambient: { emotionBase: 0.04, beams: 0, wash: 0.12, spots: 0.05, laserMode: 'off', speed: 0.4 },
  intro: { emotionBase: 0.16, beams: 0.06, wash: 0.45, spots: 0.5, laserMode: 'off', speed: 0.55 },
  groove: { emotionBase: 0.45, beams: 0.55, wash: 0.7, spots: 0.6, laserMode: 'wave', speed: 0.85 },
  build: { emotionBase: 0.32, beams: 0.5, wash: 0.55, spots: 0.4, laserMode: 'converge', speed: 0.85 },
  drop: { emotionBase: 1.0, beams: 1, wash: 1, spots: 1, laserMode: 'show', speed: 1.35 },
  climax: { emotionBase: 0.82, beams: 1, wash: 0.85, spots: 0.7, laserMode: 'show', speed: 1.15 },
  break: { emotionBase: 0.2, beams: 0.12, wash: 0.5, spots: 0.6, laserMode: 'off', speed: 0.6 },
  finale: { emotionBase: 0.95, beams: 1, wash: 1, spots: 1, laserMode: 'wave', speed: 1.25 }
}

// ---------------------------------------------------------------------------

const BAR_COUNT = 36
const BEAM_COUNT = 10
const WASH_COUNT = 4
const SPOT_COUNT = 3
const LASER_COUNT = 8
const DIM_FRAMES = 5 // ~80ms pre-impact darkness

const LASER_FIGURES = [
  'fan',
  'tunnel',
  'cross',
  'x',
  'v',
  'spiral',
  'circle',
  'cone',
  'sweep',
  'wave',
  'crissCross',
  'mirror',
  'focusDJ',
  'skyBeam'
] as const
type LaserFigure = (typeof LASER_FIGURES)[number]

const BACK_COUNT = 4
const FLOOR_COUNT = 6

type FixtureInternal = { spring: Spring; target: number; intensity: Spring }

export class StageDirector {
  readonly frame: DirectorFrame
  readonly config: DirectorConfig = {
    intensity: 1,
    flashIntensity: 1,
    motionIntensity: 1,
    economyMode: false,
    cinematicMode: true
  }

  // audio buffers
  private source: AudioSource | null
  private freq: Uint8Array<ArrayBuffer> | null = null
  private det: Uint8Array<ArrayBuffer> | null = null
  private prevDet: Uint8Array<ArrayBuffer> | null = null
  private binHz = 23.4
  private detBinHz = 23.4
  private ranges: Record<string, [number, number]> | null = null
  private detLow: [number, number] = [1, 6]
  private barBins: Int32Array = new Int32Array(BAR_COUNT + 1)
  private barSprings: Spring[] = []

  // camera
  private camXSpring = new Spring(60, 10)
  private camYSpring = new Spring(140, 12)
  private zoomSpring = new Spring(40, 9)
  private camYImpulse = 0

  // song reading
  readonly structure = new SongStructure()
  private trackKey: string | number | null = null
  private kickAvg = 0
  private fluxAvg = 0
  private kickTimes: number[] = []

  // impact scale + combo
  private impactCooldowns = [0, 0, 0, 0, 0, 0] // index = level
  private combo = 0
  private lastKickAt = 0

  // pre-impact
  private dimCountdown = -1
  private pendingFlash = 0

  // lasers
  private laserSprings: Spring[] = []
  private laserFigure: LaserFigure = 'cross'
  private figureTimer = 0
  private fanOpen = new Spring(24, 8)

  // fixtures
  private beamsInt: FixtureInternal[] = []
  private washInt: FixtureInternal[] = []
  private spotsInt: FixtureInternal[] = []
  private backsInt: FixtureInternal[] = []
  private floorsInt: FixtureInternal[] = []
  private beamPattern = 0
  private retargetTimer = 0
  private spotSlot = 0
  private spotTimer = 0

  // palette
  private moodScoresTime: Record<string, number> = {}
  private currentPaletteName = 'electronic'

  private time = 0
  private lastNow = 0

  constructor(source?: AudioSource) {
    this.source = source ?? null
    const mk = (n: number, stiff: number, damp: number, spread: boolean): [Fixture[], FixtureInternal[]] => {
      const pub: Fixture[] = []
      const internal: FixtureInternal[] = []
      for (let i = 0; i < n; i++) {
        const aim = spread ? (n > 1 ? (i / (n - 1)) * 2 - 1 : 0) : 0
        pub.push({ aim, intensity: 0, hueOffset: i * (360 / n) })
        const fi = { spring: new Spring(stiff, damp), target: aim, intensity: new Spring(80, 12) }
        fi.spring.snap(aim)
        internal.push(fi)
      }
      return [pub, internal]
    }
    const [beams, beamsInt] = mk(BEAM_COUNT, 30, 8, true)
    const [wash, washInt] = mk(WASH_COUNT, 14, 7, true)
    const [spots, spotsInt] = mk(SPOT_COUNT, 20, 8, true)
    const [backs, backsInt] = mk(BACK_COUNT, 12, 7, true)
    const [floors, floorsInt] = mk(FLOOR_COUNT, 40, 9, true)
    this.beamsInt = beamsInt
    this.washInt = washInt
    this.spotsInt = spotsInt
    this.backsInt = backsInt
    this.floorsInt = floorsInt

    const lasers: Laser[] = []
    for (let i = 0; i < LASER_COUNT; i++) {
      lasers.push({ angle: 0, intensity: 0, hue: 0 })
      const sp = new Spring(26, 7)
      sp.snap(0)
      this.laserSprings.push(sp)
    }
    for (let i = 0; i < BAR_COUNT; i++) this.barSprings.push(new Spring(150, 11))
    for (const k of Object.keys(PALETTES)) this.moodScoresTime[k] = 0

    this.frame = {
      state: 'ambient',
      stateJustChanged: false,
      stateTime: 0,
      emotion: 0,
      tension: 0,
      relEnergy: 0,
      bpm: 0,
      beatPhase: 0,
      beatTick: false,
      subBass: 0,
      kick: 0,
      snare: 0,
      vocals: 0,
      hihats: 0,
      rms: 0,
      flux: 0,
      energy: 0,
      kickTick: 0,
      impactHit: false,
      impactLevel: 0,
      combo: 0,
      impact: 0,
      laserBoost: 0,
      flash: 0,
      dim: 0,
      camX: 0,
      camY: 0,
      zoom: 0,
      breath: 0,
      sway: 0,
      bars: new Float32Array(BAR_COUNT),
      spots,
      wash,
      beams,
      backs,
      floors,
      lasers,
      palette: { ...PALETTES.electronic },
      playing: false,
      t: 0
    }
  }

  private ensureBuffers(): void {
    if (this.freq) return
    const src = this.source ?? getEngine()
    this.source = src
    const analyser = src.getAnalyserNode()
    const n = analyser.frequencyBinCount
    this.freq = new Uint8Array(n)
    this.binHz = src.getSampleRate() / (n * 2)
    const bin = (hz: number): number => Math.max(1, Math.min(n - 1, Math.round(hz / this.binHz)))
    this.ranges = {
      subBass: [bin(20), bin(60)],
      kick: [bin(60), bin(120)],
      snare: [bin(150), bin(300)],
      vocals: [bin(300), bin(2000)],
      hihats: [bin(6000), bin(16000)]
    }
    for (let b = 0; b <= BAR_COUNT; b++) {
      this.barBins[b] = Math.max(1, Math.floor(Math.pow(n, b / BAR_COUNT)))
    }
    const detector = src.getDetectorNode()
    const dn = detector.frequencyBinCount
    this.det = new Uint8Array(dn)
    this.prevDet = new Uint8Array(dn)
    this.detBinHz = src.getSampleRate() / (dn * 2)
    this.detLow = [
      Math.max(1, Math.round(35 / this.detBinHz)),
      Math.max(2, Math.round(150 / this.detBinHz))
    ]
  }

  private band(name: string): number {
    const [a, b] = this.ranges![name]
    const f = this.freq!
    let sum = 0
    for (let i = a; i <= b; i++) sum += f[i]
    return sum / ((b - a + 1) * 255)
  }

  /**
   * Call once per rendered frame. `progress` = song position 0..1, `trackKey`
   * identifies the current song (a change restarts the reading at the intro).
   * Several callers per frame (stage + theme world) share one update.
   */
  update(playing: boolean, progress = 0, trackKey: string | number | null = null, dtOverride?: number): DirectorFrame {
    const now = performance.now()
    if (dtOverride === undefined && this.lastNow && now - this.lastNow < 4) return this.frame
    const dt = dtOverride ?? Math.min(0.05, this.lastNow ? (now - this.lastNow) / 1000 : 1 / 60)
    this.lastNow = now
    return this.step(playing, progress, trackKey, dt)
  }

  private step(playing: boolean, progress: number, trackKey: string | number | null, dt: number): DirectorFrame {
    this.ensureBuffers()
    const F = this.frame
    this.time += dt
    F.t = this.time
    F.playing = playing
    F.stateJustChanged = false
    F.impactHit = false
    F.beatTick = false

    if (trackKey !== null && trackKey !== this.trackKey) {
      const first = this.trackKey === null
      this.trackKey = trackKey
      this.structure.resetTrack()
      this.combo = 0
      if (!first) this.fanOpen.snap(0)
    }

    const src = this.source!
    src.getAnalyserNode().getByteFrequencyData(this.freq!)
    const tmp = this.prevDet!
    this.prevDet = this.det
    this.det = tmp
    src.getDetectorNode().getByteFrequencyData(this.det!)

    // ---- visual features (smoothed analyser) ----
    const subBass = this.band('subBass')
    const kick = this.band('kick')
    const snareBand = this.band('snare')
    const vocals = this.band('vocals')
    const hihats = this.band('hihats')

    let rms = 0
    const f = this.freq!
    for (let i = 1; i < f.length; i++) rms += f[i] * f[i]
    rms = Math.sqrt(rms / f.length) / 255

    // ---- detection features (light smoothing: sharp onsets) ----
    const d = this.det!
    const pd = this.prevDet!
    let low = 0
    let lowOnset = 0
    for (let i = this.detLow[0]; i <= this.detLow[1]; i++) {
      low += d[i]
      const diff = d[i] - pd[i]
      if (diff > 0) lowOnset += diff
    }
    const lowBins = this.detLow[1] - this.detLow[0] + 1
    low /= lowBins * 255
    lowOnset /= lowBins * 255
    let flux = 0
    for (let i = 1; i < d.length; i++) {
      const diff = d[i] - pd[i]
      if (diff > 0) flux += diff
    }
    flux = Math.min(1, flux / (d.length * 18))

    const mix = (cur: number, target: number, up: number, down: number): number =>
      cur + (target - cur) * (target > cur ? up : down)
    F.subBass = mix(F.subBass, subBass, 0.5, 0.15)
    F.kick = mix(F.kick, kick, 0.6, 0.18)
    F.snare = mix(F.snare, snareBand, 0.6, 0.2)
    F.vocals = mix(F.vocals, vocals, 0.3, 0.1)
    F.hihats = mix(F.hihats, hihats, 0.5, 0.2)
    F.rms = mix(F.rms, rms, 0.4, 0.1)
    F.flux = mix(F.flux, flux, 0.7, 0.25)

    const energyTarget = playing ? Math.min(100, (rms * 0.55 + kick * 0.3 + flux * 0.35) * 145) : 0
    F.energy = mix(F.energy, energyTarget, 0.09, 0.012)

    // ---- SONG STRUCTURE: the narrative, read from the music ----
    const S = this.structure
    S.update(
      {
        playing,
        dt,
        progress,
        low,
        full: subBass * 0.2 + kick * 0.2 + snareBand * 0.15 + vocals * 0.3 + hihats * 0.15,
        high: hihats,
        lowOnset
      },
      this.time
    )
    if (S.stateJustChanged) {
      F.stateJustChanged = true
      if (S.state === 'drop') {
        this.fireImpact(1, true) // THE moment — pre-impact dim then explosion
        this.fanOpen.snap(0)
        this.figureTimer = 0
      }
    }
    F.state = S.state
    F.stateTime = S.stateTime
    F.tension = S.state === 'drop' ? 1 : S.tension
    F.relEnergy = S.relEnergy
    F.bpm = S.bpm
    F.beatPhase = S.beatPhase
    F.beatTick = S.beatTick

    // ---- kicks + COMBO tracking ----
    for (let l = 0; l < this.impactCooldowns.length; l++) {
      if (this.impactCooldowns[l] > 0) this.impactCooldowns[l] -= dt
    }
    this.kickAvg += (kick - this.kickAvg) * 0.04
    this.fluxAvg += (flux - this.fluxAvg) * 0.04
    F.impactLevel = 0
    const kickHit = playing && S.kickHit
    const kickStrength = S.kickStrength
    if (kickHit) {
      F.kickTick = Math.max(F.kickTick, (0.3 + kickStrength * 0.7) * 0.5)
      this.kickTimes.push(this.time)
      if (this.kickTimes.length > 12) this.kickTimes.shift()
      // combo: consecutive kicks on the tracked beat grid
      const gap = this.time - this.lastKickAt
      this.lastKickAt = this.time
      const onGrid = S.bpm > 0 && Math.min(S.beatPhase, 1 - S.beatPhase) < 0.2
      if (gap > 0.2 && gap < 1.4 && (onGrid || S.bpm === 0)) this.combo++
      else this.combo = 1
      F.combo = this.combo
    } else if (playing && this.time - this.lastKickAt > 2.2 && this.combo > 0) {
      this.combo = 0
      F.combo = 0
    }
    F.kickTick *= 0.9

    // ---- IMPACT SCALE 1..5: not every beat deserves an effect ----
    if (kickHit) {
      const active = S.state === 'drop' || S.state === 'climax' || S.state === 'finale'
      const score =
        kickStrength * 0.6 +
        S.relEnergy * 0.25 +
        Math.min(0.12, this.combo * 0.012) +
        (kick > this.kickAvg * 1.7 ? 0.08 : 0)

      let level = 1
      if (score > 0.9 && active) level = 5
      else if (score > 0.78 && active) level = 4
      else if (score > 0.62) level = 3
      else if (score > 0.48) level = 2

      // COMBO reward: long on-beat streaks force a full spectacle
      if (this.combo >= 16 && active && this.impactCooldowns[5] <= 0) {
        level = 5
        this.combo = 0
        F.combo = 0
      }
      // calm songs and quiet sections stay subtle
      const cap = active ? 5 : S.state === 'groove' || S.state === 'build' ? 3 : 2
      level = Math.min(level, cap, S.drive < 0.25 ? 2 : 5)

      const cooldowns = [0, 0, 0.35, 1.1, 2.4, 6]
      while (level > 1 && this.impactCooldowns[level] > 0) level--
      this.impactCooldowns[level] = cooldowns[level]
      this.fireLeveledImpact(level, kickStrength)
    }

    // pre-impact state machine
    if (this.dimCountdown >= 0) {
      this.dimCountdown--
      F.dim = Math.min(1, F.dim + 0.45)
      if (this.dimCountdown < 0) {
        F.flash = Math.max(F.flash, this.pendingFlash * this.config.flashIntensity)
        F.impact = Math.max(F.impact, this.pendingFlash)
        F.impactHit = true
        this.pendingFlash = 0
      }
    } else {
      F.dim *= 0.72
    }
    F.flash *= 0.9
    if (F.flash < 0.004) F.flash = 0
    F.impact *= 0.93
    F.laserBoost *= 0.955

    // ---- EMOTION: dramatic intensity, not volume ----
    const P = STATE_PARAMS[S.state]
    const dropBoost = Math.min(0.12, S.dropCount * 0.03) // "voltar ainda mais forte"
    let emotionTarget = P.emotionBase + dropBoost
    if (S.state === 'build') emotionTarget = 0.3 + S.tension * 0.45
    else if (S.state === 'groove' || S.state === 'climax' || S.state === 'finale' || S.state === 'break') {
      emotionTarget *= 0.75 + S.relEnergy * 0.35 // sections breathe with the song's own dynamics
    }
    if (!playing) emotionTarget = Math.min(emotionTarget, 0.1) // paused: dim, but keep the place
    emotionTarget = Math.min(1, emotionTarget) * this.config.intensity
    F.emotion = mix(F.emotion, emotionTarget, S.state === 'drop' ? 0.35 : 0.05, playing ? 0.012 : 0.04)

    // ---- camera: tension creeps in, drops punch out ----
    this.camYImpulse *= 0.86
    if (F.impactHit) this.camYImpulse = -3.4 * this.config.motionIntensity
    const zoomTarget =
      (S.state === 'build'
        ? S.tension * 0.016
        : S.state === 'drop'
          ? -0.012
          : S.state === 'climax'
            ? 0.006
            : 0) * this.config.motionIntensity
    F.camX = this.camXSpring.update(
      Math.sin(this.time * 0.6) * 1.6 * F.subBass * this.config.motionIntensity,
      dt
    )
    F.camY = this.camYSpring.update(this.camYImpulse, dt)
    F.zoom = this.zoomSpring.update(zoomTarget, dt)

    // ---- life ----
    F.breath = Math.sin(this.time * 0.8) * 0.5 + 0.5
    F.sway = Math.sin(this.time * 0.23)

    // ---- bars ----
    const bars = F.bars
    for (let b = 0; b < BAR_COUNT; b++) {
      const a = this.barBins[b]
      const z = Math.max(a + 1, this.barBins[b + 1])
      let sum = 0
      for (let i = a; i < z; i++) sum += f[i]
      bars[b] = Math.max(0, this.barSprings[b].update((sum / ((z - a) * 255)) * (playing ? 1 : 0), dt))
    }

    // ---- light groups + laser choreography ----
    this.updateGroups(dt, P)
    this.updateLasers(dt, P)

    // ---- palette ----
    this.updatePalette(dt, F.energy / 100, hihats, flux)

    return F
  }

  /**
   * Impact Event: one synchronized spectacle, everything on the SAME frame.
   *   1 small motion · 2 discreet flash · 3 light punch · 4 lasers surge ·
   *   5 full show (pre-impact dim → flash + bloom + camera punch + laser
   *   acceleration + bar amplitude + converging spots + particle burst)
   */
  private fireLeveledImpact(level: number, strength: number): void {
    const F = this.frame
    switch (level) {
      case 1:
        break // the kickTick alone: small movement
      case 2:
        F.flash = Math.max(F.flash, 0.22 * this.config.flashIntensity)
        break
      case 3:
        F.flash = Math.max(F.flash, 0.4 * this.config.flashIntensity)
        this.camYImpulse = -2 * this.config.motionIntensity
        break
      case 4:
        F.flash = Math.max(F.flash, 0.55 * this.config.flashIntensity)
        F.laserBoost = 1
        this.camYImpulse = -2.8 * this.config.motionIntensity
        F.impact = Math.max(F.impact, 0.45)
        break
      default: {
        // level 5: the organism reacts as one
        F.impactLevel = 5
        F.laserBoost = 1
        this.fireImpact(Math.max(0.85, strength), true)
        return
      }
    }
    F.impactLevel = Math.max(F.impactLevel, level)
  }

  private fireImpact(strength: number, withPreDim: boolean): void {
    if (withPreDim && this.dimCountdown < 0) {
      this.dimCountdown = DIM_FRAMES
      this.pendingFlash = strength
    } else {
      const F = this.frame
      F.flash = Math.max(F.flash, strength * this.config.flashIntensity)
      F.impact = Math.max(F.impact, strength)
      F.impactHit = true
    }
  }

  // ---- three independent groups ----
  private updateGroups(dt: number, P: StateParams): void {
    const F = this.frame
    const E = F.emotion

    // BEAMS: coordinated patterns, gated by state
    this.retargetTimer -= dt
    if (this.retargetTimer <= 0) {
      this.retargetTimer = (6 + Math.random() * 4) / P.speed
      this.beamPattern = (this.beamPattern + 1) % 4
      for (let i = 0; i < BEAM_COUNT; i++) {
        const n = i / (BEAM_COUNT - 1)
        const fx = this.beamsInt[i]
        switch (this.beamPattern) {
          case 0:
            fx.target = i % 2 === 0 ? 0.7 - n * 0.4 : -0.7 + n * 0.4
            break
          case 1:
            fx.target = (n - 0.5) * 0.4
            break
          case 2:
            fx.target = (n - 0.5) * 2
            break
          default:
            fx.target = Math.sin(n * Math.PI * 2) * 0.8
        }
      }
    }
    for (let i = 0; i < BEAM_COUNT; i++) {
      const fx = this.beamsInt[i]
      const pub = F.beams[i]
      const drift = Math.sin(this.time * 0.4 * P.speed + i * 1.3) * 0.08
      pub.aim = fx.spring.update(fx.target + drift, dt)
      const band = F.bars[Math.floor((i / BEAM_COUNT) * BAR_COUNT)]
      pub.intensity = fx.intensity.update((0.04 + band * 0.55) * P.beams * E, dt)
    }

    // WASH: broad soft base — the light that remains in calm states
    for (let i = 0; i < WASH_COUNT; i++) {
      const fx = this.washInt[i]
      const pub = F.wash[i]
      const base = (i / (WASH_COUNT - 1)) * 2 - 1
      pub.aim = fx.spring.update(base * 0.8 + Math.sin(this.time * 0.15 + i) * 0.06, dt)
      pub.intensity = fx.intensity.update(
        (P.wash * 0.5 + F.breath * 0.08 + F.rms * 0.25) * Math.max(E, 0.08),
        dt
      )
    }

    // BACKLIGHTS: rim glow behind the stage, breathing with the sub-bass body
    for (let i = 0; i < BACK_COUNT; i++) {
      const fx = this.backsInt[i]
      const pub = F.backs[i]
      const base = (i / (BACK_COUNT - 1)) * 2 - 1
      pub.aim = fx.spring.update(base * 0.7, dt)
      pub.intensity = fx.intensity.update(
        (0.1 + F.subBass * 0.6 + F.breath * 0.06) * Math.max(E, 0.06) * (0.3 + P.wash * 0.7),
        dt
      )
    }

    // FLOOR LIGHTS: uplights punching with the kick, chasing across the stage
    for (let i = 0; i < FLOOR_COUNT; i++) {
      const fx = this.floorsInt[i]
      const pub = F.floors[i]
      const base = (i / (FLOOR_COUNT - 1)) * 2 - 1
      pub.aim = fx.spring.update(base * 0.9, dt)
      const chase = Math.sin(this.time * 2.4 * P.speed - i * 0.9) * 0.5 + 0.5
      pub.intensity = fx.intensity.update(
        (F.kickTick * 0.7 + chase * 0.18 + F.impact * 0.4) * P.beams * E,
        dt
      )
    }

    // SPOTS: follow the vocals / the DJ — cycle target slots slowly
    this.spotTimer -= dt
    if (this.spotTimer <= 0) {
      this.spotTimer = 7 + Math.random() * 4
      this.spotSlot = (this.spotSlot + 1) % 3
    }
    const slots = [-0.45, 0, 0.45]
    for (let i = 0; i < SPOT_COUNT; i++) {
      const fx = this.spotsInt[i]
      const pub = F.spots[i]
      const target = i === 1 ? 0 : slots[(this.spotSlot + i) % 3]
      pub.aim = fx.spring.update(target, dt)
      pub.intensity = fx.intensity.update(
        (0.15 + F.vocals * 0.85) * P.spots * Math.max(E, 0.1),
        dt
      )
    }
  }

  // ---- laser choreography: professional figures, never random ----
  private updateLasers(dt: number, P: StateParams): void {
    const F = this.frame
    const E = F.emotion
    const speed = P.speed * (1 + F.laserBoost * 0.9) // level-4+ impacts accelerate

    this.figureTimer += dt * (1 + F.laserBoost)
    if (P.laserMode === 'show' && this.figureTimer > 6 / P.speed) {
      this.figureTimer = 0
      let idx = LASER_FIGURES.indexOf(this.laserFigure)
      idx = (idx + 1 + Math.floor(Math.random() * (LASER_FIGURES.length - 1))) % LASER_FIGURES.length
      this.laserFigure = LASER_FIGURES[idx]
    }
    const fan = this.fanOpen.update(P.laserMode === 'off' ? 0 : 1, dt)

    for (let i = 0; i < LASER_COUNT; i++) {
      const n = LASER_COUNT > 1 ? i / (LASER_COUNT - 1) : 0.5
      const centered = n - 0.5
      const half = i < LASER_COUNT / 2 ? -1 : 1
      let target = 0
      let on = 0
      switch (P.laserMode) {
        case 'off':
          target = 0
          on = 0
          break
        case 'converge': {
          const close = 1 - this.frame.tension * 0.8
          target = centered * 1.4 * close
          on = 0.35 + this.frame.tension * 0.3
          break
        }
        case 'wave':
          target = centered * 1.6 + Math.sin(this.time * 1.6 * speed + n * Math.PI * 2) * 0.35
          on = 0.7
          break
        default: {
          on = 0.75
          switch (this.laserFigure) {
            case 'fan':
              target = centered * 2 * (0.6 + Math.sin(this.time * 0.7 * speed) * 0.15)
              break
            case 'tunnel': // parallel beams sweeping together
              target = Math.sin(this.time * 0.9 * speed) * 0.7
              break
            case 'cross': // scissors: halves aim across each other
              target = -centered * 1.7 * (0.6 + Math.sin(this.time * 1.1 * speed) * 0.4)
              break
            case 'x': // two fixed crossing planes, breathing
              target = half * (0.9 + Math.sin(this.time * 1.3 * speed + n * 2) * 0.12)
              break
            case 'v':
              target = half * (0.35 + Math.abs(centered) * 0.9)
              break
            case 'spiral':
              target = Math.sin(this.time * 1.1 * speed + i * ((Math.PI * 2) / LASER_COUNT)) * 1.2
              break
            case 'circle':
              target = Math.sin(this.time * 1.6 * speed + i * ((Math.PI * 2) / LASER_COUNT)) * 0.9
              break
            case 'cone':
              target = centered * 0.5
              break
            case 'sweep': // everyone sweeps side to side in unison
              target = Math.sin(this.time * 1.2 * speed) * 1.4 + centered * 0.2
              break
            case 'wave':
              target = centered * 1.5 + Math.sin(this.time * 2 * speed + n * Math.PI * 2) * 0.4
              break
            case 'crissCross': // alternating beams crossing
              target = (i % 2 === 0 ? 1 : -1) * (0.7 + Math.sin(this.time * 1.4 * speed) * 0.5)
              break
            case 'mirror': // symmetric halves mirroring a sweep
              target = half * Math.abs(Math.sin(this.time * speed + Math.abs(centered) * 2)) * 1.3
              break
            case 'focusDJ': // everything converges on the booth
              target = centered * 0.12
              break
            default: // skyBeam: near-vertical pillars reaching up
              target = centered * 0.25 + Math.sin(this.time * 0.5 * speed + i) * 0.05
          }
        }
      }
      const laser = F.lasers[i]
      laser.angle = this.laserSprings[i].update(target * fan, dt)
      const targetInt = on * (0.35 + F.hihats * 0.45 + F.impact * 0.3) * E
      laser.intensity += (targetInt - laser.intensity) * 0.12
      laser.hue = (F.palette.c + i * 18 + this.time * 24) % 360
    }
  }

  private updatePalette(dt: number, E: number, hihats: number, flux: number): void {
    let kickRate = 0
    if (this.kickTimes.length >= 4) {
      const span = this.kickTimes[this.kickTimes.length - 1] - this.kickTimes[0]
      if (span > 0.5) kickRate = (this.kickTimes.length - 1) / span
    }
    const scores: Record<string, number> = {
      electronic: (kickRate > 1.5 ? 1 : 0) + (E > 0.45 ? 1 : 0) + (hihats > 0.2 ? 0.5 : 0),
      rock: (flux > this.fluxAvg * 1.05 ? 0.8 : 0) + (E > 0.4 ? 0.7 : 0) + (kickRate < 1.6 ? 0.5 : 0),
      synthwave: (E > 0.25 && E < 0.6 ? 1 : 0) + (kickRate > 0.8 && kickRate < 2 ? 0.6 : 0),
      jazz: (flux < this.fluxAvg * 0.9 ? 0.8 : 0) + (kickRate < 0.9 ? 0.8 : 0) + (E < 0.45 ? 0.4 : 0),
      lofi: (E < 0.3 ? 1 : 0) + (hihats < 0.12 ? 0.7 : 0)
    }
    let bestName = this.currentPaletteName
    let bestScore = -1
    for (const name of Object.keys(scores)) {
      if (scores[name] > bestScore) {
        bestScore = scores[name]
        bestName = name
      }
    }
    for (const name of Object.keys(this.moodScoresTime)) {
      this.moodScoresTime[name] =
        name === bestName ? this.moodScoresTime[name] + dt : Math.max(0, this.moodScoresTime[name] - dt)
    }
    if (bestName !== this.currentPaletteName && this.moodScoresTime[bestName] > 3) {
      this.currentPaletteName = bestName
    }
    const target = PALETTES[this.currentPaletteName]
    const Pal = this.frame.palette
    const k = 0.012
    Pal.a = lerpHue(Pal.a, target.a, k)
    Pal.b = lerpHue(Pal.b, target.b, k)
    Pal.c = lerpHue(Pal.c, target.c, k)
    Pal.name = target.name
  }
}

let director: StageDirector | null = null
export function getDirector(): StageDirector {
  if (!director) director = new StageDirector()
  return director
}
