/**
 * 🔺 Pyramid — Daft Punk's Alive stage. Para o Arthur 🤖
 *
 * The giant pyramid is built from 81 triangular LED panels standing in front
 * of a wall of LED panels, with Thomas and Guy-Man in the cockpit at its
 * heart. It is a machine, not a picture: the panels detach and fly into new
 * formations driven by the song's narrative (layered tiers in the groove, a
 * vortex tightening around the duo in the build, an explosion on the drop
 * that reassembles into rings, a double helix, an upside-down pyramid, doors
 * opening onto the cockpit…), and each formation is painted with its own LED
 * content (apex waves, spectrum, Alive rainbow, sparkle, split colours).
 *
 * The back wall answers with panels that flip in waves on the beat, showing
 * a second colour on their back, and slide into staircases during builds.
 * Around it: the apex beam fan, base lasers, the console's dot-matrix
 * marquee, and the four Alive colour eras cycling through everything.
 *
 * Zero per-frame allocations: every buffer lives in PyramidState.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import type { SceneState } from './packs'
import { drawDJ, type DJStyle } from './dj'

const ROWS = 9
const TILES = ROWS * ROWS
const WALL_COLS = 16
const WALL_ROWS = 7
const PANELS = WALL_COLS * WALL_ROWS
const SPARK_MAX = 320
const SPF = 6 // x, y, vx, vy, life, hue
const TEXT_MAX = 256
const TAU = Math.PI * 2

const DJ_GUYMAN: DJStyle = { look: 'guyman', deskHalf: 30, decks: false, booth: false }
const DJ_THOMAS: DJStyle = { look: 'thomas', deskHalf: 30, decks: false, booth: false }

// ---------------------------------------------------------------------------
// Alive colour eras
// ---------------------------------------------------------------------------

interface Era {
  L: number[]
  R: number[]
  beam: number
  hazeL: number
  hazeR: number
  screen: number
  edge: number
  strip: number
  whiteCore: boolean
  cycle: boolean
}

const ERAS: Era[] = [
  { L: [196, 184], R: [196, 184], beam: 190, hazeL: 196, hazeR: 190, screen: 185, edge: 195, strip: 334, whiteCore: true, cycle: false },
  { L: [292, 326], R: [292, 326], beam: 18, hazeL: 348, hazeR: 24, screen: 14, edge: 22, strip: 12, whiteCore: false, cycle: false },
  { L: [322, 236], R: [108, 22], beam: 300, hazeL: 330, hazeR: 120, screen: 170, edge: 200, strip: 55, whiteCore: false, cycle: true },
  { L: [262, 300], R: [302, 338], beam: 286, hazeL: 286, hazeR: 322, screen: 278, edge: 292, strip: 300, whiteCore: true, cycle: false }
]
const ERA_SECONDS = 22
const ERA_NOW: Era = { L: [0, 0], R: [0, 0], beam: 0, hazeL: 0, hazeR: 0, screen: 0, edge: 0, strip: 0, whiteCore: false, cycle: false }

export function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180
  return (a + d * t + 360) % 360
}

function resolveEra(P: PyramidState): Era {
  const a = ERAS[P.eraIdx % ERAS.length]
  const b = ERAS[(P.eraIdx + 1) % ERAS.length]
  const t = P.eraMix
  const o = ERA_NOW
  o.L[0] = lerpHue(a.L[0], b.L[0], t)
  o.L[1] = lerpHue(a.L[1], b.L[1], t)
  o.R[0] = lerpHue(a.R[0], b.R[0], t)
  o.R[1] = lerpHue(a.R[1], b.R[1], t)
  o.beam = lerpHue(a.beam, b.beam, t)
  o.hazeL = lerpHue(a.hazeL, b.hazeL, t)
  o.hazeR = lerpHue(a.hazeR, b.hazeR, t)
  o.screen = lerpHue(a.screen, b.screen, t)
  o.edge = lerpHue(a.edge, b.edge, t)
  o.strip = lerpHue(a.strip, b.strip, t)
  const near = t < 0.5 ? a : b
  o.whiteCore = near.whiteCore
  o.cycle = near.cycle
  return o
}

// ---------------------------------------------------------------------------
// Panel formations and LED paints
// ---------------------------------------------------------------------------

const FORM_PYRAMID = 0 // the pyramid itself
const FORM_TIERS = 1 // rows slide like layered slices
const FORM_OPEN = 2 // the halves part like doors onto the cockpit
const FORM_VORTEX = 3 // a spiral tightening around the duo (build)
const FORM_BURST = 4 // explosion (drop entry)
const FORM_RING = 5 // three counter-rotating rings around the duo
const FORM_HELIX = 6 // a double helix across the stage
const FORM_FLIP = 7 // the pyramid upside down

const CYCLE_CALM = [FORM_PYRAMID]
const CYCLE_GROOVE = [FORM_PYRAMID, FORM_TIERS, FORM_PYRAMID, FORM_OPEN]
const CYCLE_BUILD = [FORM_VORTEX]
const CYCLE_DROP = [FORM_RING, FORM_HELIX, FORM_FLIP, FORM_OPEN]
const CYCLE_CLIMAX = [FORM_HELIX, FORM_RING, FORM_TIERS, FORM_FLIP, FORM_OPEN, FORM_RING]
const CYCLE_FINALE = [FORM_RING, FORM_HELIX]

const PAINT_APEX = 0 // waves rolling down from the apex
const PAINT_SPECTRUM = 1 // each panel a band of the spectrum
const PAINT_RAINBOW = 2 // the Alive rainbow
const PAINT_SPARKLE = 3 // white glints on the hi-hats
const PAINT_SPLIT = 4 // two colours trading places on the beat

const PAINTS_GROOVE = [PAINT_APEX, PAINT_SPECTRUM]
const PAINTS_DROP = [PAINT_SPECTRUM, PAINT_RAINBOW, PAINT_SPLIT]
const PAINTS_CLIMAX = [PAINT_RAINBOW, PAINT_SPARKLE, PAINT_SPLIT, PAINT_SPECTRUM]

const WALL_BREATH = 0
const WALL_EQ = 1
const WALL_FILL = 2
const WALL_CHECK = 3

function cycleFor(st: string): number[] {
  switch (st) {
    case 'groove':
      return CYCLE_GROOVE
    case 'build':
      return CYCLE_BUILD
    case 'drop':
      return CYCLE_DROP
    case 'climax':
      return CYCLE_CLIMAX
    case 'finale':
      return CYCLE_FINALE
    default:
      return CYCLE_CALM
  }
}

function paintFor(st: string, idx: number): number {
  switch (st) {
    case 'groove':
      return PAINTS_GROOVE[idx % PAINTS_GROOVE.length]
    case 'drop':
      return PAINTS_DROP[idx % PAINTS_DROP.length]
    case 'climax':
      return PAINTS_CLIMAX[idx % PAINTS_CLIMAX.length]
    case 'finale':
      return PAINT_RAINBOW
    default:
      return PAINT_APEX
  }
}

// ---------------------------------------------------------------------------
// Dot-matrix marquee (5x7 font, column bitmasks, bit 0 = top row)
// ---------------------------------------------------------------------------

const FONT_ROWS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100']
}
const FONT: Record<string, number[]> = {}
for (const ch in FONT_ROWS) {
  const rows = FONT_ROWS[ch]
  const cols: number[] = []
  for (let c = 0; c < 5; c++) {
    let m = 0
    for (let r = 0; r < 7; r++) if (rows[r][c] === '1') m |= 1 << r
    cols.push(m)
  }
  FONT[ch] = cols
}
const WORDS = ['ALIVE', 'HUMAN', 'ROBOT', 'ONE MORE TIME', 'DAFT PUNK', 'HARMONY', 'ARTHUR']

function setWord(P: PyramidState, idx: number): void {
  const w = WORDS[idx % WORDS.length]
  let n = 0
  for (let i = 0; i < w.length && n < TEXT_MAX - 6; i++) {
    const g = FONT[w[i]]
    if (!g) {
      n += 3 // space
      continue
    }
    for (let c = 0; c < 5; c++) P.text[n++] = g[c]
    P.text[n++] = 0
  }
  for (let i = n; i < TEXT_MAX; i++) P.text[i] = 0
  P.textLen = n
  P.wordIdx = idx
  P.scroll = 0
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface PyramidState {
  lastT: number
  eraIdx: number
  eraMix: number
  eraTimer: number
  fanPhase: number
  // tile topology: row, slot in the row (even = upright, odd = inverted), seed
  tRow: Uint8Array
  tSlot: Uint8Array
  seed: Float32Array
  // formation morph
  form: number
  formTimer: number
  beats: number
  cycleIdx: number
  morph: number
  morphDur: number
  fromX: Float32Array
  fromY: Float32Array
  fromR: Float32Array
  fromS: Float32Array
  curX: Float32Array
  curY: Float32Array
  curR: Float32Array
  curS: Float32Array
  delay: Float32Array
  verts: Float32Array // TILES x 3 vertices (px) of this frame
  paint: number
  paintIdx: number
  scan: number
  white: number
  beatCount: number
  // back wall panels (flip angle, target, wave delay)
  flip: Float32Array
  flipTo: Float32Array
  flipDelay: Float32Array
  wallBeats: number
  wallTimer: number
  waveKind: number
  // console marquee
  text: Uint8Array
  textLen: number
  wordIdx: number
  scroll: number
  // sparks
  sparks: Float32Array
  sparkCursor: number
  // size/hue keyed gradient cache
  cacheW: number
  cacheH: number
  cache: Map<number, CanvasGradient>
}

export function createPyramidState(): PyramidState {
  const tRow = new Uint8Array(TILES)
  const tSlot = new Uint8Array(TILES)
  const seed = new Float32Array(TILES)
  let i = 0
  for (let r = 0; r < ROWS; r++) {
    for (let j = 0; j <= r * 2; j++) {
      tRow[i] = r
      tSlot[i] = j
      seed[i] = Math.random()
      i++
    }
  }
  const P: PyramidState = {
    lastT: 0,
    eraIdx: 0,
    eraMix: 0,
    eraTimer: 0,
    fanPhase: 0,
    tRow,
    tSlot,
    seed,
    form: FORM_PYRAMID,
    formTimer: 0,
    beats: 0,
    cycleIdx: 0,
    morph: 1,
    morphDur: 1,
    fromX: new Float32Array(TILES),
    fromY: new Float32Array(TILES),
    fromR: new Float32Array(TILES),
    fromS: new Float32Array(TILES),
    curX: new Float32Array(TILES),
    curY: new Float32Array(TILES),
    curR: new Float32Array(TILES),
    curS: new Float32Array(TILES),
    delay: new Float32Array(TILES),
    verts: new Float32Array(TILES * 6),
    paint: PAINT_APEX,
    paintIdx: 0,
    scan: 0,
    white: 0,
    beatCount: 0,
    flip: new Float32Array(PANELS),
    flipTo: new Float32Array(PANELS),
    flipDelay: new Float32Array(PANELS),
    wallBeats: 0,
    wallTimer: 0,
    waveKind: 0,
    text: new Uint8Array(TEXT_MAX),
    textLen: 0,
    wordIdx: 0,
    scroll: 0,
    sparks: new Float32Array(SPARK_MAX * SPF),
    sparkCursor: 0,
    cacheW: 0,
    cacheH: 0,
    cache: new Map()
  }
  setWord(P, 0)
  return P
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function hash(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const SLOT_BEAM = 1
const SLOT_CORE = 2
const SLOT_BLOOM = 3
const SLOT_REFL = 4
const SLOT_HAZE_L = 5
const SLOT_HAZE_R = 6

/** Gradient cache keyed by slot + hue bucket; cleared on resize. */
function grad(
  ctx: CanvasRenderingContext2D,
  P: PyramidState,
  slot: number,
  hue: number,
  build: (ctx: CanvasRenderingContext2D, hue: number) => CanvasGradient
): CanvasGradient {
  const bucket = Math.round(hue / 6) % 60
  const key = slot * 100 + bucket
  let g = P.cache.get(key)
  if (!g) {
    if (P.cache.size > 300) P.cache.clear()
    g = build(ctx, bucket * 6)
    P.cache.set(key, g)
  }
  return g
}

let beamLen = 0
function buildBeam(ctx: CanvasRenderingContext2D, hue: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, beamLen, 0)
  g.addColorStop(0, `hsla(${hue}, 95%, 62%, 1)`)
  g.addColorStop(0.55, `hsla(${hue}, 95%, 55%, 0.25)`)
  g.addColorStop(1, `hsla(${hue}, 95%, 50%, 0)`)
  return g
}
function buildCore(ctx: CanvasRenderingContext2D): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, beamLen, 0)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  return g
}
function buildBloom(ctx: CanvasRenderingContext2D): CanvasGradient {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 100)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.3)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  return g
}
let reflTop = 0
let reflBot = 0
function buildRefl(ctx: CanvasRenderingContext2D, hue: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, reflTop, 0, reflBot)
  g.addColorStop(0, `hsla(${hue}, 90%, 58%, 0.5)`)
  g.addColorStop(1, `hsla(${hue}, 90%, 50%, 0)`)
  return g
}
function buildHaze(ctx: CanvasRenderingContext2D, hue: number): CanvasGradient {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 100)
  g.addColorStop(0, `hsla(${hue}, 95%, 55%, 1)`)
  g.addColorStop(1, `hsla(${hue}, 95%, 50%, 0)`)
  return g
}

// formation target scratch (s units, radians, scale, light)
let TX = 0
let TY = 0
let TR = 0
let TS = 1
let TD = 1

function formTarget(
  form: number,
  i: number,
  r: number,
  hx: number,
  hy: number,
  homeR: number,
  seed: number,
  F: DirectorFrame,
  duoY: number,
  midY: number
): void {
  const t = F.t
  TD = 1
  switch (form) {
    case FORM_TIERS: {
      TX = hx + Math.sin(t * 1.3 + r * 0.75) * 0.5
      TY = hy + (r - (ROWS - 1) / 2) * 0.14
      TR = homeR
      TS = 0.88
      break
    }
    case FORM_OPEN: {
      const side = hx < -0.01 ? -1 : hx > 0.01 ? 1 : 0
      if (side === 0) {
        TX = 0
        TY = hy - 1.4
        TR = homeR + t * 1.5
        TS = 0.7
      } else {
        TX = hx + side * (1.9 + r * 0.14)
        TY = hy + 0.1
        TR = homeR + side * 0.22
        TS = 0.9
      }
      break
    }
    case FORM_VORTEX: {
      const tens = F.tension
      const ang = i * 2.39996 + t * (0.6 + tens * 2.8)
      const rad = (0.55 + Math.sqrt(i) * 0.4) * (1.15 - tens * 0.4)
      TX = Math.cos(ang) * rad
      TY = duoY + Math.sin(ang) * rad * 0.9
      TR = ang + Math.PI / 2
      TS = 0.6
      TD = 0.75 + tens * 0.25
      break
    }
    case FORM_BURST: {
      const dx = hx
      const dy = hy - duoY
      const d = Math.hypot(dx, dy) || 1
      const push = 2.8 + seed * 2.8
      TX = hx + (dx / d) * push
      TY = hy + (dy / d) * push - 0.6
      TR = homeR + (seed - 0.5) * 9
      TS = 0.72
      break
    }
    case FORM_RING: {
      let n: number
      let idx: number
      let rad: number
      let sp: number
      if (i < 18) {
        n = 18
        idx = i
        rad = 1.75
        sp = 0.55
      } else if (i < 45) {
        n = 27
        idx = i - 18
        rad = 2.65
        sp = -0.4
      } else {
        n = 36
        idx = i - 45
        rad = 3.55
        sp = 0.28
      }
      rad *= 1 + F.kickTick * 0.07
      const ang = (idx / n) * TAU + t * sp
      TX = Math.cos(ang) * rad
      TY = duoY + Math.sin(ang) * rad * 0.92
      TR = ang + Math.PI / 2 + (idx & 1) * Math.PI
      TS = 0.62
      break
    }
    case FORM_HELIX: {
      const strand = i & 1
      const u = (i >> 1) / 40
      const ph = u * TAU * 1.5 + t * 1.6 + strand * Math.PI
      const depth = Math.cos(ph)
      TX = (u - 0.5) * 9.8
      TY = duoY + Math.sin(ph) * 1.7
      TR = ph * 0.5 + strand * Math.PI
      TS = 0.5 + 0.3 * (depth * 0.5 + 0.5)
      TD = 0.45 + 0.55 * (depth * 0.5 + 0.5)
      break
    }
    case FORM_FLIP: {
      TX = hx
      TY = 2 * midY - hy
      TR = homeR + Math.PI
      TS = 0.92
      break
    }
    default: {
      TX = hx
      TY = hy
      TR = homeR
      TS = 0.93 + F.breath * 0.02
    }
  }
}

function setForm(P: PyramidState, form: number, F: DirectorFrame): void {
  for (let i = 0; i < TILES; i++) {
    P.fromX[i] = P.curX[i]
    P.fromY[i] = P.curY[i]
    P.fromR[i] = P.curR[i] - TAU * Math.round(P.curR[i] / TAU)
    P.fromS[i] = P.curS[i]
    const r = P.tRow[i] / (ROWS - 1)
    const sd = P.seed[i]
    let d: number
    switch (form) {
      case FORM_BURST:
        d = sd * 0.08
        break
      case FORM_PYRAMID:
        d = (1 - r) * 0.4 + sd * 0.1 // reassembles from the base up
        break
      case FORM_RING:
        d = (i / TILES) * 0.45
        break
      case FORM_HELIX:
        d = (P.tSlot[i] / (P.tRow[i] * 2 + 1)) * 0.4 + sd * 0.05
        break
      default:
        d = r * 0.35 + sd * 0.12
    }
    P.delay[i] = d
  }
  P.form = form
  P.morph = 0
  P.morphDur = form === FORM_BURST ? 0.35 : form === FORM_VORTEX ? 1.5 : 1.15
  P.formTimer = 0
  P.beats = 0
  P.paint = form === FORM_BURST ? PAINT_RAINBOW : paintFor(F.state, P.paintIdx++)
}

function schedule(P: PyramidState, F: DirectorFrame, dt: number): void {
  P.formTimer += dt
  if (F.beatTick) {
    P.beats++
    P.beatCount++
  }
  const st = F.state
  const cyc = cycleFor(st)
  const hot = st === 'drop' || st === 'climax' || st === 'finale'
  if (F.stateJustChanged) {
    P.cycleIdx = 0
    P.paintIdx = 0
    if (st === 'drop' || st === 'finale') setForm(P, FORM_BURST, F)
    else if (P.form !== cyc[0]) setForm(P, cyc[0], F)
    else P.paint = paintFor(st, P.paintIdx++)
    return
  }
  if (P.form === FORM_BURST) {
    if (P.formTimer > 0.6) setForm(P, cyc[P.cycleIdx % cyc.length], F)
    return
  }
  if (cyc.length === 1) {
    if (P.form !== cyc[0]) setForm(P, cyc[0], F)
    return
  }
  const beatsPer = st === 'groove' ? 16 : 8
  const secs = st === 'groove' ? 9 : 4.5
  const due = F.bpm > 0 ? P.beats >= beatsPer : P.formTimer > secs
  const kicked = hot && F.impactLevel >= 4 && P.formTimer > 1.4
  if (due || kicked || cyc.indexOf(P.form) < 0) {
    P.cycleIdx = (P.cycleIdx + 1) % cyc.length
    setForm(P, cyc[P.cycleIdx], F)
  }
}

function triggerWave(P: PyramidState): void {
  const kind = P.waveKind++ % 5
  for (let p = 0; p < PANELS; p++) {
    const c = p % WALL_COLS
    const r = (p / WALL_COLS) | 0
    let d: number
    switch (kind) {
      case 0:
        d = Math.hypot((c - (WALL_COLS - 1) / 2) / WALL_COLS, (r - (WALL_ROWS - 1) / 2) / WALL_ROWS) * 1.4
        break
      case 1:
        d = c / WALL_COLS
        break
      case 2:
        d = r / WALL_ROWS
        break
      case 3:
        d = 1 - c / WALL_COLS
        break
      default:
        d = hash(p, P.waveKind)
    }
    P.flipDelay[p] = d * 0.55
    P.flipTo[p] += Math.PI
  }
}

function spawnSparks(P: PyramidState, x: number, y: number, n: number, hue: number, power: number): void {
  const sp = P.sparks
  for (let k = 0; k < n; k++) {
    const o = P.sparkCursor * SPF
    P.sparkCursor = (P.sparkCursor + 1) % SPARK_MAX
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
    const v = (2 + Math.random() * 4.5) * power
    sp[o] = x
    sp[o + 1] = y
    sp[o + 2] = Math.cos(a) * v
    sp[o + 3] = Math.sin(a) * v
    sp[o + 4] = 0.7 + Math.random() * 0.3
    sp[o + 5] = hue < 0 ? Math.random() * 360 : hue + Math.random() * 40
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export function drawPyramid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  const P = S.pyr
  const dt = P.lastT > 0 ? Math.min(0.05, Math.max(0, F.t - P.lastT)) : 1 / 60
  P.lastT = F.t
  if (P.cacheW !== W || P.cacheH !== H) {
    P.cache.clear()
    P.cacheW = W
    P.cacheH = H
  }
  const t = F.t
  const st = F.state
  const hot = st === 'drop' || st === 'climax' || st === 'finale'

  // eras
  P.eraTimer += dt
  if (P.eraMix > 0) {
    P.eraMix = Math.min(1, P.eraMix + dt * 0.6)
    if (P.eraMix >= 1) {
      P.eraIdx = (P.eraIdx + 1) % ERAS.length
      P.eraMix = 0
    }
  } else if (P.eraTimer > ERA_SECONDS || (st === 'drop' && F.stateJustChanged && P.eraTimer > 8)) {
    P.eraTimer = 0
    P.eraMix = 0.001
  }
  const era = resolveEra(P)
  schedule(P, F, dt)
  if (F.impactHit) P.fanPhase += 0.5 * (0.5 + F.impact)
  else if (F.kickTick > 0.35 && st === 'climax') P.fanPhase += 0.06
  if (F.beatTick) P.scan = 1
  P.scan = Math.max(0, P.scan - dt / 0.4)
  if (F.impactHit && F.impactLevel >= 4) P.white = 1
  P.white = Math.max(0, P.white - dt * 2.2)

  // geometry
  const stageY = H * 0.84
  const apexX = W / 2
  const apexY = H * 0.1
  const h = stageY - apexY
  const baseHalf = Math.min(h * 0.62, W * 0.3)
  const s = (baseHalf * 2) / ROWS
  const rowH = h / ROWS
  const anchorY = apexY + h * 0.55
  const consoleY = apexY + h * 0.56
  const winTopY = apexY + h * 0.31
  const duoY = (apexY + h * 0.435 - anchorY) / s
  const midY = (apexY + h * 0.5 - anchorY) / s

  drawWall(ctx, P, W, H, F, E, era, dt, stageY)

  // haze pools
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const hazeR = W * 0.5
  ctx.globalAlpha = Math.min(1, (0.14 + F.breath * 0.04 + F.vocals * 0.06) * E + 0.04)
  ctx.fillStyle = grad(ctx, P, SLOT_HAZE_L, era.hazeL, buildHaze)
  ctx.translate(W * 0.18, H * 0.38)
  ctx.scale(hazeR / 100, hazeR / 100)
  ctx.fillRect(-100, -100, 200, 200)
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = Math.min(1, (0.12 + F.breath * 0.04 + F.vocals * 0.06) * E + 0.04)
  ctx.fillStyle = grad(ctx, P, SLOT_HAZE_R, era.hazeR, buildHaze)
  ctx.translate(W * 0.82, H * 0.38)
  ctx.scale(hazeR / 100, hazeR / 100)
  ctx.fillRect(-100, -100, 200, 200)
  ctx.restore()

  drawBeams(ctx, P, apexX, apexY, H, F, E, era)

  // --- the panel pyramid ----------------------------------------------------
  if (P.morph < 1) P.morph = Math.min(1, P.morph + dt / P.morphDur)
  let home = 0
  const vt = P.verts
  for (let i = 0; i < TILES; i++) {
    const r = P.tRow[i]
    const up = (P.tSlot[i] & 1) === 0
    const hx = (P.tSlot[i] - r) / 2
    const hy = ((r + (up ? 2 / 3 : 1 / 3)) * rowH + apexY - anchorY) / s
    const homeR = up ? 0 : Math.PI
    formTarget(P.form, i, r, hx, hy, homeR, P.seed[i], F, duoY, midY)
    let x = TX
    let y = TY
    let rot = TR
    let sc = TS
    let dep = TD
    if (P.morph < 1) {
      const d = P.delay[i]
      const m = easeInOut(clamp01((P.morph - d) / (1 - d)))
      x = P.fromX[i] + (x - P.fromX[i]) * m
      y = P.fromY[i] + (y - P.fromY[i]) * m
      let dR = rot - P.fromR[i]
      dR -= TAU * Math.round(dR / TAU)
      rot = P.fromR[i] + dR * m
      sc = P.fromS[i] + (sc - P.fromS[i]) * m
      dep = 1 + (dep - 1) * m
    }
    P.curX[i] = x
    P.curY[i] = y
    P.curR[i] = rot
    P.curS[i] = sc
    home += Math.max(0, 1 - Math.hypot(x - hx, y - hy) / 1.5)
    const cx = apexX + x * s
    const cy = anchorY + y * s
    const c = Math.cos(rot) * sc
    const sn = Math.sin(rot) * sc
    const hs = s / 2
    const top = (-2 / 3) * rowH
    const bot = rowH / 3
    const o = i * 6
    vt[o] = cx - top * sn
    vt[o + 1] = cy + top * c
    vt[o + 2] = cx + hs * c - bot * sn
    vt[o + 3] = cy + hs * sn + bot * c
    vt[o + 4] = cx - hs * c - bot * sn
    vt[o + 5] = cy - hs * sn + bot * c
    paintTile(ctx, P, i, r, x, dep, F, E, era, vt, o)
  }
  const homeness = home / TILES

  // pyramid body behind the cockpit + skeleton when the panels are away
  if (homeness < 0.97) {
    ctx.strokeStyle = `hsla(${era.edge}, 80%, 65%, ${(0.08 + (1 - homeness) * 0.2) * (0.5 + E * 0.5)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(apexX, apexY)
    ctx.lineTo(apexX + baseHalf, stageY)
    ctx.lineTo(apexX - baseHalf, stageY)
    ctx.closePath()
    for (let r = 1; r < ROWS; r++) {
      const y = apexY + r * rowH
      const hw = (r / ROWS) * baseHalf
      ctx.moveTo(apexX - hw, y)
      ctx.lineTo(apexX + hw, y)
    }
    ctx.stroke()
  }

  // panel edges: a soft glow pass and a crisp pass, one path each
  ctx.beginPath()
  for (let i = 0; i < TILES; i++) {
    const o = i * 6
    ctx.moveTo(vt[o], vt[o + 1])
    ctx.lineTo(vt[o + 2], vt[o + 3])
    ctx.lineTo(vt[o + 4], vt[o + 5])
    ctx.closePath()
  }
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const edgeL = era.whiteCore ? 85 : 68
  ctx.strokeStyle = `hsla(${era.edge}, 100%, ${edgeL}%, ${(0.1 + E * 0.14 + F.kick * 0.1) * (1 + P.white)})`
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.restore()
  ctx.strokeStyle = `hsla(${era.edge}, 100%, ${edgeL}%, ${Math.min(1, 0.4 + E * 0.35 + F.flash * 0.3)})`
  ctx.lineWidth = 1.1
  ctx.stroke()

  // outer edge light + apex mirror while the pyramid is assembled
  if (homeness > 0.2) {
    const k = clamp01((homeness - 0.2) / 0.7)
    const glow = 0.35 + F.kick * 0.65
    ctx.save()
    ctx.shadowColor = `hsla(${era.edge}, 100%, 55%, ${glow * E * k})`
    ctx.shadowBlur = 26 + F.kick * 40
    ctx.strokeStyle = `hsla(${era.edge}, 100%, 62%, ${((0.5 + glow * 0.45) * E + F.flash * 0.25) * k})`
    ctx.lineWidth = 4 + F.kick * 4 * E
    ctx.beginPath()
    ctx.moveTo(apexX, apexY - 2)
    ctx.lineTo(apexX + baseHalf + 2, stageY)
    ctx.lineTo(apexX - baseHalf - 2, stageY)
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
    const mh = rowH * 0.55
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + F.flash * 0.6 + F.hihats * 0.2) * E * k})`
    ctx.beginPath()
    ctx.moveTo(apexX, apexY - 2)
    ctx.lineTo(apexX + mh * 0.62, apexY + mh)
    ctx.lineTo(apexX - mh * 0.62, apexY + mh)
    ctx.closePath()
    ctx.fill()
  }

  // apex bloom
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = Math.min(1, (0.08 + F.hihats * 0.5 + F.flash * 0.4) * E)
  ctx.fillStyle = grad(ctx, P, SLOT_BLOOM, 0, buildBloom)
  ctx.translate(apexX, apexY)
  const br = (H * 0.16 * (1 + F.hihats)) / 100
  ctx.scale(br, br)
  ctx.fillRect(-100, -100, 200, 200)
  ctx.restore()

  drawCockpit(ctx, P, S, apexX, h, baseHalf, winTopY, consoleY, homeness, F, E, era, dt)
  drawBaseLasers(ctx, apexX, baseHalf, stageY, W, F, E, hot)
  drawStageFloor(ctx, P, W, H, apexX, baseHalf, stageY, homeness, F, E, era)

  // sparks
  if (F.impactHit) {
    spawnSparks(P, apexX, apexY, 14 + F.impactLevel * 10, era.cycle ? -1 : era.beam, 1 + F.impact * 0.6)
    if (F.impactLevel >= 4) {
      spawnSparks(P, apexX - baseHalf * 0.9, stageY, 18, 45, 1.4)
      spawnSparks(P, apexX + baseHalf * 0.9, stageY, 18, 45, 1.4)
    }
  }
  if (F.stateJustChanged && st === 'drop') spawnSparks(P, apexX, apexY, 70, -1, 1.6)
  drawSparks(ctx, P, dt)
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  P: PyramidState,
  i: number,
  r: number,
  x: number,
  dep: number,
  F: DirectorFrame,
  E: number,
  era: Era,
  vt: Float32Array,
  o: number
): void {
  const t = F.t
  const rowF = r / (ROWS - 1)
  let hue: number
  let sat = 95
  let lv: number
  switch (P.paint) {
    case PAINT_SPECTRUM: {
      const xn = clamp01(x / 10 + 0.5)
      const band = F.bars[Math.floor(Math.abs(xn - 0.5) * 2 * (F.bars.length - 1) * 0.7)] ?? 0
      hue = lerpHue(era.screen, era.edge, band)
      lv = 0.12 + band * 0.95 * (1 - rowF * 0.3)
      break
    }
    case PAINT_RAINBOW: {
      hue = (t * 45 + i * 9 + r * 24) % 360
      lv = 0.45 + 0.3 * Math.sin(t * 5 + i * 0.7)
      break
    }
    case PAINT_SPARKLE: {
      hue = era.screen
      const glint = hash(i, Math.floor(t * 12)) > 0.86 - F.hihats * 0.3
      lv = glint ? 0.95 : 0.16 + rowF * 0.1
      if (glint) sat = 15
      break
    }
    case PAINT_SPLIT: {
      const left = x < 0
      const on = ((r + P.tSlot[i] + P.beatCount) & 1) === 0
      hue = left ? era.L[0] : era.R[1]
      lv = on ? 0.75 : 0.18
      break
    }
    default: {
      const speed = 3 + F.tension * 6
      const wave = Math.sin(t * speed - r * 0.85) * 0.5 + 0.5
      hue = lerpHue(era.L[0], era.L[1], rowF)
      lv = 0.22 + wave * 0.5
      if (F.state === 'build' && F.tension > 0.8 && Math.sin(t * 40) > 0) lv += 0.35
    }
  }
  const scanPos = (1 - P.scan) * ROWS
  if (P.scan > 0 && Math.abs(r - scanPos) < 0.9) lv += 0.45 * P.scan
  lv += F.kick * 0.12 + F.flash * 0.35
  lv *= (0.4 + E * 0.7) * dep
  const w = P.white
  const light = Math.min(92, 8 + lv * 56) * (1 - w) + 95 * w
  ctx.fillStyle = `hsla(${hue}, ${sat * (1 - w)}%, ${light}%, ${Math.min(1, 0.4 + lv * 0.6 + w)})`
  ctx.beginPath()
  ctx.moveTo(vt[o], vt[o + 1])
  ctx.lineTo(vt[o + 2], vt[o + 3])
  ctx.lineTo(vt[o + 4], vt[o + 5])
  ctx.closePath()
  ctx.fill()
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  P: PyramidState,
  W: number,
  H: number,
  F: DirectorFrame,
  E: number,
  era: Era,
  dt: number,
  stageY: number
): void {
  const st = F.state
  const hot = st === 'drop' || st === 'climax' || st === 'finale'
  // flip waves on the beat (time fallback while the tempo is unknown)
  P.wallTimer += dt
  let every = 0
  if (st === 'build') every = F.tension > 0.7 ? 1 : 2
  else if (hot) every = 2
  else if (st === 'groove') every = 8
  if (F.beatTick) {
    P.wallBeats++
    if (every > 0 && P.wallBeats % every === 0) {
      triggerWave(P)
      P.wallTimer = 0
    }
  } else if (F.bpm === 0 && every > 0 && P.wallTimer > every * 0.5) {
    triggerWave(P)
    P.wallTimer = 0
  }
  if (F.impactHit && F.impactLevel >= 3) triggerWave(P)
  const k = Math.min(1, dt * 9)
  for (let p = 0; p < PANELS; p++) {
    if (P.flipDelay[p] > 0) P.flipDelay[p] -= dt
    else P.flip[p] += (P.flipTo[p] - P.flip[p]) * k
    if (P.flipTo[p] > 40 * Math.PI) {
      P.flipTo[p] -= 40 * Math.PI
      P.flip[p] -= 40 * Math.PI
    }
  }

  let mode = WALL_BREATH
  if (st === 'groove' || st === 'drop') mode = WALL_EQ
  else if (st === 'build') mode = WALL_FILL
  else if (st === 'climax') mode = P.cycleIdx % 2 === 0 ? WALL_CHECK : WALL_EQ
  else if (st === 'finale') mode = WALL_CHECK

  const x0 = W * 0.012
  const x1 = W * 0.988
  const top = H * 0.035
  const bot = stageY - H * 0.02
  const pw = (x1 - x0) / WALL_COLS
  const ph = (bot - top) / WALL_ROWS
  const gap = Math.max(2, pw * 0.08)
  const t = F.t
  const amp = 0.4 + E * 0.6
  // truss frame
  ctx.strokeStyle = `rgba(90,95,120,${0.12 + E * 0.06})`
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 0; c <= WALL_COLS; c++) {
    ctx.moveTo(x0 + c * pw, top)
    ctx.lineTo(x0 + c * pw, bot)
  }
  for (let r = 0; r <= WALL_ROWS; r++) {
    ctx.moveTo(x0, top + r * ph)
    ctx.lineTo(x1, top + r * ph)
  }
  ctx.stroke()

  ctx.lineWidth = 2
  for (let p = 0; p < PANELS; p++) {
    const c = p % WALL_COLS
    const r = (p / WALL_COLS) | 0
    const cf = Math.cos(P.flip[p])
    const wf = Math.max(0.04, Math.abs(cf))
    let lv: number
    switch (mode) {
      case WALL_EQ: {
        const band = F.bars[Math.floor((Math.abs(c - (WALL_COLS - 1) / 2) / (WALL_COLS / 2)) * (F.bars.length - 1))] ?? 0
        lv = WALL_ROWS - 1 - r < band * WALL_ROWS * 1.25 ? 0.55 : 0.05
        break
      }
      case WALL_FILL:
        lv = (WALL_ROWS - r) / WALL_ROWS < F.tension ? 0.5 + (F.tension > 0.85 && Math.sin(t * 30) > 0 ? 0.3 : 0) : 0.05
        break
      case WALL_CHECK:
        lv = ((c + r + P.beatCount) & 1) === 0 ? 0.62 : 0.06
        break
      default:
        lv = 0.07 + 0.07 * Math.sin(t * 0.8 + c * 0.4 + r * 0.6)
    }
    lv = (lv + F.flash * 0.35) * amp
    let offY = 0
    if (st === 'build') offY = -Math.sin(c * 0.6 + t * 1.5) * ph * 0.25 * F.tension
    else if (st === 'climax') offY = Math.sin(c * 0.5 - t * 3) * ph * 0.1 * E
    const offX = (c - (WALL_COLS - 1) / 2) * F.impact * pw * 0.05
    const w = (pw - gap) * wf
    const px = x0 + c * pw + (pw - w) / 2 + offX
    const py = top + r * ph + gap / 2 + offY
    const shade = 0.45 + 0.55 * wf
    const hue = cf >= 0 ? era.hazeL : era.R[1]
    // dark panel face, LED strip frame
    ctx.fillStyle = `hsla(${hue}, 80%, ${(5 + lv * 22) * shade}%, ${0.55 + lv * 0.3})`
    ctx.fillRect(px, py, w, ph - gap)
    if (lv > 0.03) {
      ctx.strokeStyle = `hsla(${hue}, 100%, ${(35 + lv * 45) * shade}%, ${Math.min(1, 0.1 + lv * 1.2)})`
      ctx.strokeRect(px + 1.5, py + 1.5, w - 3, ph - gap - 3)
    }
  }
}

function drawBeams(
  ctx: CanvasRenderingContext2D,
  P: PyramidState,
  apexX: number,
  apexY: number,
  H: number,
  F: DirectorFrame,
  E: number,
  era: Era
): void {
  const st = F.state
  const len = H * 1.25
  if (beamLen !== len) {
    beamLen = len
    P.cache.clear()
  }
  const FAN = 14
  const build = st === 'build'
  const strobeOff = build && F.tension > 0.8 && Math.sin(F.t * 36) < 0
  if (strobeOff) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < FAN; i++) {
    const u = i / (FAN - 1)
    let a: number
    if (build) a = -Math.PI / 2 + (u - 0.5) * 2.2 * (1 - F.tension * 0.8) + Math.sin(F.t * 0.7 + i) * 0.04
    else a = Math.PI + 0.12 + u * (Math.PI - 0.24) + Math.sin(F.t * 0.9 + i * 1.7) * 0.1 + P.fanPhase * 0.25 * Math.sin(i * 0.9)
    const band = F.bars[Math.floor(u * (F.bars.length - 1))] ?? 0
    const calm = st === 'intro' || st === 'ambient' || st === 'break'
    const intensity = ((calm ? 0.04 : 0.08) + band * 0.38 + F.flash * 0.25 + F.tension * 0.14) * E
    if (intensity < 0.02) continue
    const hue = era.cycle ? (F.t * 40 + i * 26) % 360 : era.beam
    ctx.save()
    ctx.translate(apexX, apexY)
    ctx.rotate(a)
    ctx.globalAlpha = Math.min(1, intensity)
    ctx.fillStyle = grad(ctx, P, SLOT_BEAM, hue, buildBeam)
    ctx.beginPath()
    ctx.moveTo(0, -2)
    ctx.lineTo(len, -len * 0.035)
    ctx.lineTo(len, len * 0.035)
    ctx.lineTo(0, 2)
    ctx.closePath()
    ctx.fill()
    if (era.whiteCore) {
      ctx.fillStyle = grad(ctx, P, SLOT_CORE, 0, buildCore)
      ctx.beginPath()
      ctx.moveTo(0, -1)
      ctx.lineTo(len, -len * 0.006)
      ctx.lineTo(len, len * 0.006)
      ctx.lineTo(0, 1)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}

function drawCockpit(
  ctx: CanvasRenderingContext2D,
  P: PyramidState,
  S: SceneState,
  apexX: number,
  h: number,
  baseHalf: number,
  winTopY: number,
  consoleY: number,
  homeness: number,
  F: DirectorFrame,
  E: number,
  era: Era,
  dt: number
): void {
  const t = F.t
  const wTop = baseHalf * 0.31 * 0.8
  const wBot = baseHalf * 0.56 * 0.86
  // window: dark cabin inside the pyramid, a floating platform when it opens
  ctx.beginPath()
  ctx.moveTo(apexX - wTop, winTopY)
  ctx.lineTo(apexX + wTop, winTopY)
  ctx.lineTo(apexX + wBot, consoleY)
  ctx.lineTo(apexX - wBot, consoleY)
  ctx.closePath()
  ctx.fillStyle = `rgba(2,2,5,${0.35 + homeness * 0.6})`
  ctx.fill()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = `hsla(${era.edge}, 100%, 65%, ${0.18 + E * 0.2 + F.kick * 0.15})`
  ctx.lineWidth = 4
  ctx.stroke()
  // light bars along the cabin's back
  for (let k = 0; k < 3; k++) {
    const y = winTopY + (consoleY - winTopY) * (0.22 + k * 0.2)
    const f = (y - winTopY) / (consoleY - winTopY)
    const hw = (wTop + (wBot - wTop) * f) * 0.86
    const on = Math.sin(t * 2 - k * 0.9) * 0.5 + 0.5
    ctx.fillStyle = `hsla(${era.strip}, 100%, 60%, ${(0.08 + on * 0.2 + F.snare * 0.25) * (0.4 + E * 0.6)})`
    ctx.fillRect(apexX - hw, y, hw * 2, 2)
  }
  ctx.restore()
  ctx.strokeStyle = `hsla(${era.edge}, 100%, 75%, ${0.5 + E * 0.4})`
  ctx.lineWidth = 1.2
  ctx.stroke()

  // Thomas and Guy-Man
  const sc = (consoleY - winTopY) / 68
  drawDJ(ctx, S.djs[0], apexX - wBot * 0.45, consoleY, sc, era.edge, DJ_GUYMAN, F, E)
  drawDJ(ctx, S.djs[1], apexX + wBot * 0.45, consoleY, sc, era.edge, DJ_THOMAS, F, E)

  // console front (hides their legs) with a button row and the marquee
  const frontH = h * 0.075
  const fTop = wBot * 1.04
  const fBot = baseHalf * (0.56 + frontH / h) * 0.9
  ctx.beginPath()
  ctx.moveTo(apexX - fTop, consoleY - 1)
  ctx.lineTo(apexX + fTop, consoleY - 1)
  ctx.lineTo(apexX + fBot, consoleY + frontH)
  ctx.lineTo(apexX - fBot, consoleY + frontH)
  ctx.closePath()
  ctx.fillStyle = '#050508'
  ctx.fill()
  ctx.strokeStyle = `hsla(${era.edge}, 100%, 72%, ${0.55 + E * 0.4 + F.kick * 0.2})`
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(apexX - fTop, consoleY - 1)
  ctx.lineTo(apexX + fTop, consoleY - 1)
  ctx.stroke()

  const btn = 28
  const bw = (fTop * 1.8) / btn
  for (let b = 0; b < btn; b++) {
    const lit = hash(b, Math.floor(t * 4 + P.beatCount)) > 0.55 - F.kick * 0.3
    const hue = (b * 37 + (era.cycle ? t * 30 : era.strip)) % 360
    ctx.fillStyle = `hsla(${hue}, 100%, ${lit ? 62 : 25}%, ${lit ? 0.9 : 0.3})`
    ctx.fillRect(apexX - fTop * 0.9 + b * bw + bw * 0.2, consoleY + frontH * 0.1, bw * 0.6, frontH * 0.1)
  }

  // dot-matrix marquee
  const speed = F.bpm > 0 ? (F.bpm / 60) * 3 : 7
  P.scroll += dt * speed
  const pitch = (frontH * 0.62) / 7
  const fw = fTop * 0.92
  const cols = Math.max(8, Math.floor((fw * 2) / pitch))
  if (P.scroll - cols > P.textLen + 4) setWord(P, P.wordIdx + 1)
  const head = Math.floor(P.scroll)
  const mx = apexX - (cols * pitch) / 2
  const my = consoleY + frontH * 0.3
  const ds = pitch * 0.62
  const flashAll = P.white > 0.4
  ctx.fillStyle = `hsla(${era.strip}, 60%, 30%, 0.22)`
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 7; r++) ctx.fillRect(mx + c * pitch, my + r * pitch, ds, ds)
  }
  ctx.fillStyle = `hsla(${era.strip}, 100%, ${70 + F.kick * 15}%, ${0.75 + E * 0.25})`
  for (let c = 0; c < cols; c++) {
    const idx = head - cols + c
    const m = flashAll ? 127 : idx >= 0 && idx < P.textLen ? P.text[idx] : 0
    if (m === 0) continue
    for (let r = 0; r < 7; r++) if (m & (1 << r)) ctx.fillRect(mx + c * pitch, my + r * pitch, ds, ds)
  }
}

function drawBaseLasers(
  ctx: CanvasRenderingContext2D,
  apexX: number,
  baseHalf: number,
  stageY: number,
  W: number,
  F: DirectorFrame,
  E: number,
  hot: boolean
): void {
  if (!hot && F.state !== 'build') return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineWidth = 1.4
  const L = W * 1.2
  for (let i = 0; i < F.lasers.length; i++) {
    const lz = F.lasers[i]
    if (lz.intensity < 0.02) continue
    const side = i & 1 ? 1 : -1
    const ox = apexX + side * baseHalf * 0.98
    const a = -Math.PI / 2 + lz.angle * 0.8 + side * 0.35
    ctx.strokeStyle = `hsla(${lz.hue}, 100%, 62%, ${Math.min(1, lz.intensity * 0.7 * (0.5 + E * 0.5))})`
    ctx.beginPath()
    ctx.moveTo(ox, stageY)
    ctx.lineTo(ox + Math.cos(a) * L, stageY + Math.sin(a) * L)
    ctx.stroke()
  }
  ctx.restore()
}

function drawStageFloor(
  ctx: CanvasRenderingContext2D,
  P: PyramidState,
  W: number,
  H: number,
  apexX: number,
  baseHalf: number,
  stageY: number,
  homeness: number,
  F: DirectorFrame,
  E: number,
  era: Era
): void {
  ctx.fillStyle = '#040407'
  ctx.fillRect(-12, stageY, W + 24, H - stageY + 12)
  // the pyramid mirrored on the glossy deck
  reflTop = stageY
  reflBot = H
  ctx.save()
  ctx.globalAlpha = Math.min(1, (0.25 + E * 0.45 + F.flash * 0.3) * (0.3 + homeness * 0.7))
  ctx.fillStyle = grad(ctx, P, SLOT_REFL, era.edge, buildRefl)
  ctx.beginPath()
  ctx.moveTo(apexX - baseHalf, stageY)
  ctx.lineTo(apexX + baseHalf, stageY)
  ctx.lineTo(apexX + baseHalf * 0.35, H)
  ctx.lineTo(apexX - baseHalf * 0.35, H)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = `hsla(${era.edge}, 100%, 70%, ${0.35 + E * 0.4})`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, stageY)
  ctx.lineTo(W, stageY)
  ctx.stroke()
  // kick waves rolling to the crowd
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    const ph = (F.t * (0.25 + F.kickTick * 0.3) + i / 3) % 1
    ctx.fillStyle = `hsla(${era.beam}, 85%, 60%, ${(0.05 + F.kickTick * 0.12) * E * (1 - ph)})`
    ctx.fillRect(0, stageY + ph * (H - stageY), W, 2)
  }
  ctx.restore()

  // crowd silhouettes, hands up on the hot sections
  const hot = F.state === 'drop' || F.state === 'climax' || F.state === 'finale'
  const heads = 34
  ctx.fillStyle = 'rgba(0,0,0,0.94)'
  ctx.beginPath()
  ctx.moveTo(-12, H + 12)
  for (let i = 0; i <= heads; i++) {
    const x = (i / heads) * W
    const bounce = Math.sin(F.t * 6 + i * 1.7) * (2 + F.kickTick * 6) * E
    const y = H - 10 - ((i * 7919) % 13) - bounce
    ctx.quadraticCurveTo(x - W / heads / 2, y - 13, x, y)
  }
  ctx.lineTo(W + 12, H + 12)
  ctx.closePath()
  ctx.fill()
  if (hot || E > 0.4) {
    ctx.strokeStyle = 'rgba(0,0,0,0.92)'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let i = 0; i < 18; i++) {
      const x = (((i * 104729) % 991) / 991) * W
      const up = Math.max(0, Math.sin(F.t * 5 + i * 2.2)) * (10 + F.kick * 16) * E
      if (up < 5) continue
      ctx.moveTo(x, H - 16)
      ctx.lineTo(x + Math.sin(i) * 4, H - 16 - up)
    }
    ctx.stroke()
  }
}

function drawSparks(ctx: CanvasRenderingContext2D, P: PyramidState, dt: number): void {
  const sp = P.sparks
  const k = dt * 60
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < SPARK_MAX; i++) {
    const o = i * SPF
    if (sp[o + 4] <= 0) continue
    sp[o] += sp[o + 2] * k
    sp[o + 1] += sp[o + 3] * k
    sp[o + 3] += 0.07 * k
    sp[o + 2] *= 0.992
    sp[o + 4] -= 0.012 * k
    const life = sp[o + 4]
    if (life <= 0) continue
    ctx.fillStyle = `hsla(${sp[o + 5]}, 100%, ${60 + life * 30}%, ${life})`
    const sz = 1.2 + life * 2
    ctx.fillRect(sp[o] - sz / 2, sp[o + 1] - sz / 2, sz, sz)
  }
  ctx.restore()
}
