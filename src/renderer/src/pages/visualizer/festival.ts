/**
 * 🎧 Festival Mainstage — a real-world mainstage, built like the rigs at
 * Tomorrowland / Ultra / EDC and driven entirely by the StageDirector frame.
 *
 * Architecture: box-truss roof on lattice towers, a fine-pitch LED wall with
 * angled LED wings, an LED header ribbon, hanging PA line arrays, a DJ riser
 * with an LED face and monitor wedges, and a glossy deck that reflects the wall.
 *
 * Lighting: moving heads that tilt up into aerial fans on builds and dive into
 * the crowd on drops, washes, follow spots from FOH onto the DJ, floor
 * uplights, rim spill behind the wall, blinders, strobes and three laser banks
 * that open into fan sheets on big moments — all through lit haze.
 *
 * Special FX (fired by impacts and narrative state): flame projectors, CO₂
 * jets, cold-spark fountains, confetti cannons, fireworks over the roof and a
 * low fog that thickens after every blast.
 *
 * Zero per-frame allocations: every pool lives in FestivalState.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import type { SceneState } from './packs'
import { sampleLed, LED_PATTERNS } from './ledPatterns'
import { drawDJ, type DJStyle } from './dj'

const SPARK_MAX = 900
const SF = 7 // x, y, vx, vy, life, hue, kind (0 = fountain spark, 1 = firework)
const CONF_MAX = 280
const CF = 8 // x, y, vx, vy, rot, vrot, hue (-1 = white), life
const WALL_COLS = 48
const WALL_ROWS = 20
const WING_COLS = 8
const WING_ROWS = 14
const HEADS = 10

// stage-front FX positions (fraction of W)
const PYRO_X = [0.12, 0.27, 0.73, 0.88]
const CO2_X = [0.2, 0.33, 0.67, 0.8]
const FOUNTAIN_X = [0.38, 0.45, 0.55, 0.62]

const DJ_FESTIVAL: DJStyle = { look: 'human', deskHalf: 56, decks: true, booth: false }

export interface FestivalState {
  sparks: Float32Array
  sparkCursor: number
  confetti: Float32Array
  confCursor: number
  pyro: Float32Array // flame envelopes (>1 = holding)
  co2: Float32Array // CO₂ jet envelopes
  blind: number
  strobe: number
  wallFlash: number
  fog: number // extra haze density after blasts
  tilt: number // 0 = heads aimed into the crowd, 1 = aerial fans
  pyroSide: number
  colLevel: Float32Array // LED wall column brightness, reused for floor reflections
  // VJ content on the main wall (crossfading scenes)
  vjIdx: number
  vjMix: number
  vjTimer: number
  logo: number // artist-logo moment envelope
  // cached, size/palette-dependent
  gradW: number
  gradH: number
  sky: CanvasGradient | null
  deck: CanvasGradient | null
  hazeHue: number
  haze: CanvasGradient | null
  maskReady: boolean
  mask: CanvasPattern | null
}

export function createFestivalState(): FestivalState {
  return {
    sparks: new Float32Array(SPARK_MAX * SF),
    sparkCursor: 0,
    confetti: new Float32Array(CONF_MAX * CF),
    confCursor: 0,
    pyro: new Float32Array(PYRO_X.length),
    co2: new Float32Array(CO2_X.length),
    blind: 0,
    strobe: 0,
    wallFlash: 0,
    fog: 0,
    tilt: 1,
    pyroSide: 0,
    colLevel: new Float32Array(WALL_COLS),
    vjIdx: 0,
    vjMix: 0,
    vjTimer: 0,
    logo: 0,
    gradW: 0,
    gradH: 0,
    sky: null,
    deck: null,
    hazeHue: -1,
    haze: null,
    maskReady: false,
    mask: null
  }
}

// ---------------------------------------------------------------------------
// FX pools
// ---------------------------------------------------------------------------

function spawnSpark(fx: FestivalState, x: number, y: number, vx: number, vy: number, hue: number, kind: number): void {
  const o = fx.sparkCursor * SF
  fx.sparkCursor = (fx.sparkCursor + 1) % SPARK_MAX
  const s = fx.sparks
  s[o] = x
  s[o + 1] = y
  s[o + 2] = vx
  s[o + 3] = vy
  s[o + 4] = 1
  s[o + 5] = hue
  s[o + 6] = kind
}

function firework(fx: FestivalState, x: number, y: number, hue: number, k: number): void {
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = (1.2 + Math.random() * 2.4) * k
    spawnSpark(fx, x, y, Math.cos(a) * sp, Math.sin(a) * sp, hue + (Math.random() - 0.5) * 40, 1)
  }
}

function confettiBurst(fx: FestivalState, x: number, y: number, dir: number, F: DirectorFrame, k: number): void {
  const c = fx.confetti
  for (let i = 0; i < 120; i++) {
    const o = fx.confCursor * CF
    fx.confCursor = (fx.confCursor + 1) % CONF_MAX
    c[o] = x
    c[o + 1] = y
    c[o + 2] = (dir * 1.5 + (Math.random() - 0.5) * 6) * k
    c[o + 3] = -(6 + Math.random() * 8) * k
    c[o + 4] = Math.random() * Math.PI * 2
    c[o + 5] = (Math.random() - 0.5) * 0.4
    const pick = i % 5
    c[o + 6] = pick === 0 ? F.palette.a : pick === 1 ? F.palette.b : pick === 2 ? F.palette.c : pick === 3 ? 45 : -1
    c[o + 7] = 1
  }
}

/** Reads the frame's events and fires / decays every effect. */
function updateFx(fx: FestivalState, F: DirectorFrame, W: number, H: number, stageY: number): void {
  const hot = F.state === 'drop' || F.state === 'climax' || F.state === 'finale'
  const k = H / 600
  if (F.impactHit) {
    const lv = F.impactLevel
    if (lv >= 2) fx.blind = 1
    if (lv >= 3) fx.strobe = 1
    if (lv >= 4) fx.wallFlash = Math.max(fx.wallFlash, lv >= 5 ? 1 : 0.6)
    if (lv >= 4 && hot) {
      if (lv >= 5) {
        for (let i = 0; i < fx.pyro.length; i++) fx.pyro[i] = 1.25
      } else {
        // alternate outer / inner pairs
        fx.pyroSide = 1 - fx.pyroSide
        const a = fx.pyroSide
        fx.pyro[a] = 1.15
        fx.pyro[fx.pyro.length - 1 - a] = 1.15
      }
    }
    if (lv >= 5) {
      for (let i = 0; i < fx.co2.length; i++) fx.co2[i] = 1
      fx.fog = Math.min(1, fx.fog + 0.35)
      fx.logo = Math.max(fx.logo, 1)
    }
    if (F.state === 'finale' || (lv >= 5 && F.state === 'climax')) {
      firework(fx, W * (0.2 + Math.random() * 0.25), H * (0.03 + Math.random() * 0.05), F.palette.a, k)
      firework(fx, W * (0.55 + Math.random() * 0.25), H * (0.03 + Math.random() * 0.05), F.palette.b, k)
    }
  }
  if (F.stateJustChanged && F.state === 'drop') {
    for (let i = 0; i < fx.co2.length; i++) fx.co2[i] = 1
    fx.fog = Math.min(1, fx.fog + 0.3)
    fx.wallFlash = 1
    fx.logo = 1.6
    confettiBurst(fx, W * 0.3, stageY, 1, F, k)
    confettiBurst(fx, W * 0.7, stageY, -1, F, k)
  }
  if (F.stateJustChanged && F.state === 'finale') {
    confettiBurst(fx, W * 0.3, stageY, 1, F, k)
    confettiBurst(fx, W * 0.7, stageY, -1, F, k)
  }
  if (hot && F.snare > 0.6) fx.blind = Math.max(fx.blind, 0.45)

  // cold-spark fountains in front of the riser: climax, finale, peak of a build
  const fountains = F.state === 'climax' || F.state === 'finale' || (F.state === 'build' && F.tension > 0.8)
  if (fountains) {
    for (let i = 0; i < FOUNTAIN_X.length; i++) {
      for (let n = 0; n < 4; n++) {
        spawnSpark(
          fx,
          W * FOUNTAIN_X[i] + (Math.random() - 0.5) * 4,
          stageY - 2,
          (Math.random() - 0.5) * 2 * k,
          -(4 + Math.random() * 3.6) * k,
          40 + Math.random() * 12,
          0
        )
      }
    }
  }

  fx.blind *= 0.9
  fx.strobe = Math.max(0, fx.strobe - 0.025)
  fx.wallFlash *= 0.9
  fx.fog *= 0.996
  fx.logo = Math.max(0, fx.logo - 0.012)
  for (let i = 0; i < fx.pyro.length; i++) fx.pyro[i] = Math.max(0, fx.pyro[i] - 0.03)
  for (let i = 0; i < fx.co2.length; i++) fx.co2[i] = Math.max(0, fx.co2[i] - 0.022)
  const tiltTarget = hot ? 0 : 1
  fx.tilt += (tiltTarget - fx.tilt) * 0.025
}

// ---------------------------------------------------------------------------
// Cached paint
// ---------------------------------------------------------------------------

function ensureCache(ctx: CanvasRenderingContext2D, fx: FestivalState, W: number, H: number, stageY: number, hazeHue: number): void {
  if (fx.gradW !== W || fx.gradH !== H) {
    fx.gradW = W
    fx.gradH = H
    const sky = ctx.createLinearGradient(0, 0, 0, stageY)
    sky.addColorStop(0, '#04030b')
    sky.addColorStop(0.6, '#090719')
    sky.addColorStop(1, '#120a22')
    fx.sky = sky
    const deck = ctx.createLinearGradient(0, stageY, 0, H)
    deck.addColorStop(0, '#0b0b13')
    deck.addColorStop(1, '#020205')
    fx.deck = deck
  }
  if (fx.hazeHue !== hazeHue) {
    // unit-radius haze puff; drawn scaled so it never depends on canvas size
    fx.hazeHue = hazeHue
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, `hsla(${hazeHue}, 35%, 70%, 1)`)
    g.addColorStop(0.5, `hsla(${hazeHue}, 35%, 60%, 0.35)`)
    g.addColorStop(1, `hsla(${hazeHue}, 35%, 50%, 0)`)
    fx.haze = g
  }
  if (!fx.maskReady) {
    // LED "screen door": a dark pixel grid laid over the wall
    fx.maskReady = true
    const c = document.createElement('canvas')
    c.width = 3
    c.height = 3
    const g = c.getContext('2d')
    if (g) {
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.fillRect(2, 0, 1, 3)
      g.fillRect(0, 2, 3, 1)
      fx.mask = ctx.createPattern(c, 'repeat')
    }
  }
}

// ---------------------------------------------------------------------------
// VJ content: smooth "video" scenes for the main wall, crossfaded like a VJ
// ---------------------------------------------------------------------------

const VJ_PIXELS = 0 // the classic LED pattern library, cell by cell
const VJ_PLASMA = 1
const VJ_STARBURST = 2
const VJ_SPECTRUM = 3
const VJ_TUNNEL = 4
const VJ_COUNT = 5

function advanceVJ(fx: FestivalState, F: DirectorFrame): void {
  const hot = F.state === 'drop' || F.state === 'climax' || F.state === 'finale'
  fx.vjTimer += 1 / 60
  if (fx.vjMix > 0) {
    fx.vjMix = Math.min(1, fx.vjMix + 0.015)
    if (fx.vjMix >= 1) {
      fx.vjIdx = (fx.vjIdx + 1) % VJ_COUNT
      fx.vjMix = 0
    }
  } else if (fx.vjTimer > (hot ? 8 : 14) || (F.stateJustChanged && F.state === 'drop')) {
    fx.vjTimer = 0
    fx.vjMix = 0.01
  }
}

function drawVJScene(
  ctx: CanvasRenderingContext2D,
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  F: DirectorFrame,
  E: number,
  bright: number
): void {
  const P = F.palette
  const t = F.t
  const cx = x + w / 2
  const cy = y + h / 2
  switch (id) {
    case VJ_PLASMA: {
      for (let i = 0; i < 3; i++) {
        const hue = i === 0 ? P.a : i === 1 ? P.b : P.c
        const bx = cx + Math.sin(t * (0.31 + i * 0.13) + i * 2) * w * 0.35
        const by = cy + Math.cos(t * (0.27 + i * 0.11) + i) * h * 0.35
        const r = h * (0.7 + F.kickTick * 0.25 + Math.sin(t * 0.5 + i) * 0.1)
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r)
        g.addColorStop(0, `hsla(${hue}, 90%, 62%, ${0.75 * bright})`)
        g.addColorStop(1, `hsla(${hue}, 90%, 50%, 0)`)
        ctx.fillStyle = g
        ctx.fillRect(x, y, w, h)
      }
      break
    }
    case VJ_STARBURST: {
      const rays = 18
      const rot = t * 0.25 * (1 + E) + F.impact * 0.6
      const R = Math.hypot(w, h)
      for (let i = 0; i < rays; i++) {
        const a0 = rot + (i / rays) * Math.PI * 2
        const a1 = a0 + (Math.PI / rays) * (0.7 + F.kickTick * 0.3)
        ctx.fillStyle =
          i % 2 === 0
            ? `hsla(${P.a}, 90%, 60%, ${0.55 * bright})`
            : `hsla(${P.b}, 90%, 60%, ${0.3 * bright})`
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R)
        ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R)
        ctx.closePath()
        ctx.fill()
      }
      const core = h * (0.12 + F.kick * 0.1)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 2.5)
      g.addColorStop(0, `rgba(255,255,255,${0.9 * bright})`)
      g.addColorStop(0.4, `hsla(${P.c}, 90%, 70%, ${0.5 * bright})`)
      g.addColorStop(1, 'hsla(0,0%,0%,0)')
      ctx.fillStyle = g
      ctx.fillRect(cx - core * 2.5, cy - core * 2.5, core * 5, core * 5)
      break
    }
    case VJ_SPECTRUM: {
      // mirrored, smoothed spectrum: an audio "mountain" glowing from the horizon line
      const n = F.bars.length
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, `hsla(${P.b}, 90%, 62%, ${0.85 * bright})`)
      g.addColorStop(0.5, `hsla(${P.a}, 90%, 70%, ${0.95 * bright})`)
      g.addColorStop(1, `hsla(${P.b}, 90%, 62%, ${0.85 * bright})`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(x, cy)
      for (let i = 0; i < n; i++) {
        // mirror around the centre so the shape is symmetric
        const bi = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)
        const v = F.bars[Math.floor(bi * (n - 1))] ?? 0
        ctx.lineTo(x + (i / (n - 1)) * w, cy - v * h * 0.46 - h * 0.01)
      }
      for (let i = n - 1; i >= 0; i--) {
        const bi = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)
        const v = F.bars[Math.floor(bi * (n - 1))] ?? 0
        ctx.lineTo(x + (i / (n - 1)) * w, cy + v * h * 0.46 + h * 0.01)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = `rgba(255,255,255,${0.6 * bright})`
      ctx.fillRect(x, cy - 1, w, 2)
      break
    }
    case VJ_TUNNEL: {
      const layers = 12
      const speed = 0.18 * (0.6 + E)
      for (let j = 0; j < layers; j++) {
        const z = (j / layers + t * speed) % 1
        const sc = z * z
        const rw = w * sc * 1.1
        const rh = h * sc * 1.1
        ctx.strokeStyle = `hsla(${(P.a + j * 14) % 360}, 90%, ${55 + z * 25}%, ${z * bright})`
        ctx.lineWidth = 1 + z * h * 0.025
        ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh)
      }
      break
    }
  }
}

// LED sample scratch (no allocation)
let ledV = 0
let ledH = 0

function sampleWall(S: SceneState, c: number, r: number, cols: number, rows: number, F: DirectorFrame): void {
  const n = LED_PATTERNS.length
  const a = sampleLed(LED_PATTERNS[S.ledIdx % n], c, r, cols, rows, F)
  ledV = a.v
  ledH = a.hueShift
  if (S.ledMix > 0) {
    const b = sampleLed(LED_PATTERNS[(S.ledIdx + 1) % n], c, r, cols, rows, F)
    ledV = ledV * (1 - S.ledMix) + b.v * S.ledMix
    ledH = ledH * (1 - S.ledMix) + b.hueShift * S.ledMix
  }
}

function advanceLedRotation(S: SceneState, F: DirectorFrame): void {
  S.ledTimer += 1 / 60
  if (S.ledMix > 0) {
    S.ledMix = Math.min(1, S.ledMix + 0.02)
    if (S.ledMix >= 1) {
      S.ledIdx = (S.ledIdx + 1) % LED_PATTERNS.length
      S.ledMix = 0
    }
  } else if (S.ledTimer > (F.state === 'drop' || F.state === 'climax' ? 9 : 15)) {
    S.ledTimer = 0
    S.ledMix = 0.01
  }
}

/** Box truss segment: two chords with zig-zag lacing, horizontal or vertical. */
function traceTruss(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, depth: number, vertical: boolean): void {
  const steps = Math.max(2, Math.round(len / depth))
  const step = len / steps
  if (vertical) {
    ctx.rect(x, y, depth, len)
    for (let i = 0; i < steps; i++) {
      ctx.moveTo(x, y + i * step)
      ctx.lineTo(x + depth, y + (i + 0.5) * step)
      ctx.lineTo(x, y + (i + 1) * step)
    }
  } else {
    ctx.rect(x, y, len, depth)
    for (let i = 0; i < steps; i++) {
      ctx.moveTo(x + i * step, y)
      ctx.lineTo(x + (i + 0.5) * step, y + depth)
      ctx.lineTo(x + (i + 1) * step, y)
    }
  }
}

function drawLineArray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, side: number, hue: number, F: DirectorFrame): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = 'rgba(40,40,52,0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, -y)
  ctx.lineTo(0, 0)
  ctx.stroke()
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = '#0b0b11'
    ctx.fillRect(-w / 2, 0, w, h - 1)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(-w / 2 + 2, h * 0.35, w - 4, 1)
    ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.12 + F.subBass * 0.25})`
    ctx.fillRect(-w / 2, h - 2, w, 1)
    ctx.translate(0, h)
    ctx.rotate(side * i * 0.012) // J-curve
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

export function drawFestival(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  const fx = S.fest
  const P = F.palette
  const t = F.t
  const hot = F.state === 'drop' || F.state === 'climax' || F.state === 'finale'
  const k = H / 600

  const stageY = H * 0.8
  const roofY = H * 0.055
  const truss = Math.max(8, H * 0.026)
  const towerL = W * 0.022
  const towerR = W * 0.978 - truss
  const wallL = W * 0.22
  const wallR = W * 0.78
  const wallT = H * 0.155
  const wallB = H * 0.6
  const boothW = W * 0.28
  const boothH = H * 0.1
  const boothX = W / 2 - boothW / 2
  const boothY = stageY - boothH
  const headY = roofY + truss + H * 0.014

  updateFx(fx, F, W, H, stageY)
  advanceLedRotation(S, F)
  advanceVJ(fx, F)
  ensureCache(ctx, fx, W, H, stageY, P.a)

  // light level in the air: how much the haze gets lit
  let lit = 0
  for (let i = 0; i < F.beams.length; i++) lit += F.beams[i].intensity
  lit = lit / Math.max(1, F.beams.length) + F.flash * 0.3

  // --- sky + lit haze ------------------------------------------------------
  ctx.fillStyle = fx.sky as CanvasGradient
  ctx.fillRect(0, 0, W, stageY)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = fx.haze as CanvasGradient
  for (let i = 0; i < 3; i++) {
    const cx = W * (0.22 + i * 0.28 + Math.sin(t * 0.05 + i * 2.1) * 0.08)
    const cy = H * (0.32 + Math.sin(t * 0.07 + i) * 0.08)
    ctx.globalAlpha = Math.min(1, (0.025 + lit * 0.09 + fx.fog * 0.06) * (0.3 + E * 0.7))
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(W * 0.34, H * 0.26)
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }
  ctx.globalAlpha = 1

  // rim spill leaking around the LED wall (backlights)
  for (let i = 0; i < F.backs.length; i++) {
    const bk = F.backs[i]
    if (bk.intensity < 0.02) continue
    const bx = i === 0 ? wallL - W * 0.008 : i === F.backs.length - 1 ? wallR + W * 0.008 : W * (0.36 + (i - 1) * 0.28)
    const by = i === 0 || i === F.backs.length - 1 ? (wallT + wallB) / 2 : wallT
    const r = H * 0.26
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r)
    g.addColorStop(0, `hsla(${P.b}, 90%, 58%, ${bk.intensity * 0.45})`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.fillRect(bx - r, by - r, r * 2, r * 2)
  }
  ctx.restore()

  // --- LED wings (angled, mirrored) ---------------------------------------
  const ledScale = 0.2 + E * 0.8
  for (let side = -1; side <= 1; side += 2) {
    const outerX = side < 0 ? W * 0.085 : W * 0.915
    const innerX = side < 0 ? W * 0.205 : W * 0.795
    const topO = H * 0.2
    const topI = H * 0.165
    const botO = H * 0.57
    const botI = H * 0.6
    ctx.beginPath()
    ctx.moveTo(outerX, topO)
    ctx.lineTo(innerX, topI)
    ctx.lineTo(innerX, botI)
    ctx.lineTo(outerX, botO)
    ctx.closePath()
    ctx.fillStyle = '#050509'
    ctx.fill()
    for (let c = 0; c < WING_COLS; c++) {
      const f0 = c / WING_COLS
      const f1 = (c + 1) / WING_COLS
      const x0 = outerX + (innerX - outerX) * f0
      const x1 = outerX + (innerX - outerX) * f1
      const fm = (f0 + f1) / 2
      const top = topO + (topI - topO) * fm
      const bot = botO + (botI - botO) * fm
      const rh = (bot - top) / WING_ROWS
      const cx = Math.min(x0, x1)
      const cw = Math.abs(x1 - x0)
      for (let r = 0; r < WING_ROWS; r++) {
        sampleWall(S, c, r, WING_COLS, WING_ROWS, F)
        const v = Math.max(ledV * ledScale * 0.85, fx.wallFlash * 0.7)
        if (v < 0.03) continue
        ctx.fillStyle = `hsla(${(P.a + ledH + 360) % 360}, 85%, ${50 + v * 22 + fx.wallFlash * 25}%, ${0.12 + v * 0.85})`
        ctx.fillRect(cx + 0.5, top + r * rh + 0.5, cw - 1, rh - 1)
      }
    }
    if (fx.mask) {
      ctx.beginPath()
      ctx.moveTo(outerX, topO)
      ctx.lineTo(innerX, topI)
      ctx.lineTo(innerX, botI)
      ctx.lineTo(outerX, botO)
      ctx.closePath()
      ctx.fillStyle = fx.mask
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(28,28,38,1)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // --- main LED wall -------------------------------------------------------
  ctx.fillStyle = '#04040a'
  ctx.fillRect(wallL, wallT, wallR - wallL, wallB - wallT)
  const cw = (wallR - wallL) / WALL_COLS
  const ch = (wallB - wallT) / WALL_ROWS
  const wallW = wallR - wallL
  const wallH = wallB - wallT
  const nextVJ = (fx.vjIdx + 1) % VJ_COUNT
  const pixW = (fx.vjIdx === VJ_PIXELS ? 1 - fx.vjMix : 0) + (nextVJ === VJ_PIXELS ? fx.vjMix : 0)
  if (pixW > 0.01) {
    for (let c = 0; c < WALL_COLS; c++) {
      let sum = 0
      for (let r = 0; r < WALL_ROWS; r++) {
        sampleWall(S, c, r, WALL_COLS, WALL_ROWS, F)
        const v = ledV * ledScale * pixW
        sum += v
        if (v < 0.03) continue
        ctx.fillStyle = `hsla(${(P.a + ledH + 360) % 360}, 85%, ${50 + v * 22}%, ${0.12 + v * 0.88})`
        ctx.fillRect(wallL + c * cw + 0.5, wallT + r * ch + 0.5, cw - 1, ch - 1)
      }
      fx.colLevel[c] = sum / WALL_ROWS
    }
  } else {
    for (let c = 0; c < WALL_COLS; c++) fx.colLevel[c] = 0
  }
  const vjBright = (0.3 + E * 0.7) * (0.85 + F.kickTick * 0.25)
  ctx.save()
  ctx.beginPath()
  ctx.rect(wallL, wallT, wallW, wallH)
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter'
  if (fx.vjIdx !== VJ_PIXELS) drawVJScene(ctx, fx.vjIdx, wallL, wallT, wallW, wallH, F, E, vjBright * (1 - fx.vjMix))
  if (fx.vjMix > 0 && nextVJ !== VJ_PIXELS) drawVJScene(ctx, nextVJ, wallL, wallT, wallW, wallH, F, E, vjBright * fx.vjMix)
  // smooth scenes light the floor too: estimate their glow per column from the spectrum
  const vjW = 1 - pixW
  if (vjW > 0.01) {
    for (let c = 0; c < WALL_COLS; c++) {
      fx.colLevel[c] += (0.25 + (F.bars[Math.floor((c / WALL_COLS) * F.bars.length)] ?? 0) * 0.4) * vjBright * vjW
    }
  }
  if (fx.wallFlash > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${fx.wallFlash * 0.85})`
    ctx.fillRect(wallL, wallT, wallW, wallH)
  }
  // artist logo moment (drop / full-spectacle impacts)
  if (fx.logo > 0.02) {
    const la = Math.min(1, fx.logo)
    const size = wallH * 0.26 * (1 + F.kickTick * 0.06)
    ctx.font = `900 ${size}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = `hsla(${P.c}, 90%, 60%, ${la * 0.35})`
    ctx.fillText('HARMONY', wallL + wallW / 2 + 3, wallT + wallH / 2 + 3)
    ctx.fillStyle = `rgba(255,255,255,${la * 0.95})`
    ctx.fillText('HARMONY', wallL + wallW / 2, wallT + wallH / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
  if (fx.mask) {
    ctx.fillStyle = fx.mask
    ctx.fillRect(wallL, wallT, wallR - wallL, wallB - wallT)
  }
  // cabinet seams + bezel
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 8; c < WALL_COLS; c += 8) {
    ctx.moveTo(wallL + c * cw, wallT)
    ctx.lineTo(wallL + c * cw, wallB)
  }
  for (let r = 5; r < WALL_ROWS; r += 5) {
    ctx.moveTo(wallL, wallT + r * ch)
    ctx.lineTo(wallR, wallT + r * ch)
  }
  ctx.stroke()
  ctx.strokeStyle = '#1a1a24'
  ctx.lineWidth = 3
  ctx.strokeRect(wallL - 1.5, wallT - 1.5, wallR - wallL + 3, wallB - wallT + 3)

  // LED header ribbon
  const ribY = H * 0.126
  const ribH = Math.max(3, H * 0.013)
  const ribSegs = 64
  const ribW = (wallR - wallL + W * 0.04) / ribSegs
  ctx.fillStyle = '#060609'
  ctx.fillRect(wallL - W * 0.02, ribY, ribW * ribSegs, ribH)
  for (let i = 0; i < ribSegs; i++) {
    const m = Math.abs(i - ribSegs / 2 + 0.5)
    let v = 0.5 + 0.5 * Math.sin(m * 0.45 - t * (3 + E * 5))
    v = v * v * v * v
    v = Math.min(1, v + F.kickTick * 0.5 + fx.wallFlash) * (0.25 + E * 0.75)
    if (v < 0.04) continue
    ctx.fillStyle = `hsla(${(P.c + m * 3) % 360}, 90%, ${55 + v * 25}%, ${0.15 + v * 0.8})`
    ctx.fillRect(wallL - W * 0.02 + i * ribW + 0.5, ribY + 0.5, ribW - 1, ribH - 1)
  }

  // --- roof truss + towers ---------------------------------------------------
  const steel = `rgba(${118 + F.flash * 80},${120 + F.flash * 80},${134 + F.flash * 80},${0.4 + E * 0.25})`
  ctx.strokeStyle = steel
  ctx.lineWidth = 1.2
  ctx.beginPath()
  traceTruss(ctx, towerL, roofY, towerR + truss - towerL, truss, false)
  traceTruss(ctx, towerL, roofY + truss, stageY - roofY - truss, truss, true)
  traceTruss(ctx, towerR, roofY + truss, stageY - roofY - truss, truss, true)
  ctx.stroke()

  // PA hangs
  drawLineArray(ctx, W * 0.058, roofY + truss + H * 0.02, W * 0.036, H * 0.024, 1, P.a, F)
  drawLineArray(ctx, W * 0.942, roofY + truss + H * 0.02, W * 0.036, H * 0.024, -1, P.a, F)

  // --- stage deck + reflections ---------------------------------------------
  ctx.fillStyle = fx.deck as CanvasGradient
  ctx.fillRect(0, stageY, W, H - stageY)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const reflH = (H - stageY) * 0.09
  for (let c = 0; c < WALL_COLS; c++) {
    const lv = fx.colLevel[c]
    if (lv < 0.04) continue
    const x = wallL + c * cw
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = `hsla(${P.a}, 80%, 60%, ${lv * 0.2 * (1 - j / 4) * (1 - j / 4)})`
      ctx.fillRect(x + 0.5, stageY + j * reflH, cw - 1, reflH)
    }
  }
  ctx.restore()
  // stage lip LED chase
  ctx.fillStyle = '#08080d'
  ctx.fillRect(0, stageY - 2, W, 4)
  const lipSegs = 90
  const lipW = W / lipSegs
  for (let i = 0; i < lipSegs; i++) {
    const v = Math.max(0, Math.sin(i * 0.35 - t * 4)) ** 6 * (0.3 + E * 0.7) + F.kickTick * 0.25 * E
    if (v < 0.04) continue
    ctx.fillStyle = `hsla(${P.b}, 90%, 62%, ${Math.min(1, v)})`
    ctx.fillRect(i * lipW + 1, stageY - 1, lipW - 2, 2)
  }

  // --- volumetric light -------------------------------------------------------
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // washes from the roof onto the deck
  for (let i = 0; i < F.wash.length; i++) {
    const wl = F.wash[i]
    if (wl.intensity < 0.02) continue
    const x = W * 0.28 + (i / Math.max(1, F.wash.length - 1)) * W * 0.44
    const landX = W / 2 + wl.aim * W * 0.4
    const g = ctx.createLinearGradient(x, headY, landX, stageY)
    g.addColorStop(0, `hsla(${P.a}, 60%, 62%, ${wl.intensity * 0.3})`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - 6, headY)
    ctx.lineTo(x + 6, headY)
    ctx.lineTo(landX + W * 0.12, stageY)
    ctx.lineTo(landX - W * 0.12, stageY)
    ctx.closePath()
    ctx.fill()
  }

  // moving heads: aerial fans on builds, diving into the crowd on drops
  const zoom = hot ? 0.045 : 0.085
  for (let i = 0; i < F.beams.length && i < HEADS; i++) {
    const fb = F.beams[i]
    if (fb.intensity < 0.02) continue
    const x = W * (0.1 + (i / (HEADS - 1)) * 0.8)
    const downX = W / 2 + fb.aim * W * 0.75
    const downY = H * 1.05
    const upX = W / 2 + fb.aim * W * 1.1
    const upY = -H * 0.4
    const lx = downX + (upX - downX) * fx.tilt
    const ly = downY + (upY - downY) * fx.tilt
    const ang = Math.atan2(ly - headY, lx - x)
    const L = Math.hypot(lx - x, ly - headY)
    const hue = (P.b + fb.hueOffset * 0.35 + t * 8) % 360
    const light = 60 + F.flash * 25
    ctx.save()
    ctx.translate(x, headY)
    ctx.rotate(ang)
    const g = ctx.createLinearGradient(0, 0, L, 0)
    g.addColorStop(0, `hsla(${hue}, 90%, ${light}%, ${fb.intensity * 0.6})`)
    g.addColorStop(0.45, `hsla(${hue}, 90%, ${light}%, ${fb.intensity * 0.18})`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    const we = L * zoom
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(0, -3)
    ctx.lineTo(L, -we)
    ctx.lineTo(L, we)
    ctx.lineTo(0, 3)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.moveTo(0, -1.5)
    ctx.lineTo(L, -we * 0.22)
    ctx.lineTo(L, we * 0.22)
    ctx.lineTo(0, 1.5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // lasers: two roof banks firing over the crowd, one bank on the riser
  const fan = F.laserBoost > 0.15 || F.state === 'finale'
  const llen = Math.max(W, H) * 1.5
  for (let i = 0; i < F.lasers.length; i++) {
    const lz = F.lasers[i]
    if (lz.intensity < 0.02) continue
    const n = F.lasers.length
    const bank = i < n * 0.375 ? -1 : i < n * 0.625 ? 0 : 1
    let ox = W / 2
    let oy = boothY + boothH * 0.25
    let a = -Math.PI / 2 + lz.angle
    if (bank !== 0) {
      ox = bank < 0 ? W * 0.12 : W * 0.88
      oy = roofY + truss
      a = Math.PI / 2 - bank * 0.55 + lz.angle * 0.7
    } else {
      ox += (i - n / 2 + 0.5) * W * 0.02
    }
    const subs = fan ? 3 : 0
    for (let s = -subs; s <= subs; s++) {
      const aa = a + s * 0.04
      const ex = ox + Math.cos(aa) * llen
      const ey = oy + Math.sin(aa) * llen
      const fall = s === 0 ? 1 : 0.55
      ctx.strokeStyle = `hsla(${lz.hue}, 100%, 60%, ${lz.intensity * 0.14 * fall})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.strokeStyle = `hsla(${lz.hue}, 100%, 72%, ${lz.intensity * 0.85 * fall})`
      ctx.lineWidth = 1.1
      ctx.stroke()
    }
    ctx.fillStyle = `hsla(${lz.hue}, 100%, 80%, ${lz.intensity})`
    ctx.fillRect(ox - 1.5, oy - 1.5, 3, 3)
  }
  ctx.restore()

  // --- fixtures on the rig ---------------------------------------------------
  const s = Math.max(5, H * 0.016)
  for (let i = 0; i < HEADS; i++) {
    const fb = F.beams[i]
    const x = W * (0.1 + (i / (HEADS - 1)) * 0.8)
    // yoke
    ctx.fillStyle = '#15151d'
    ctx.fillRect(x - s * 0.9, roofY + truss, s * 1.8, 2)
    ctx.fillRect(x - s * 0.9, roofY + truss, 2, headY - roofY - truss)
    ctx.fillRect(x + s * 0.9 - 2, roofY + truss, 2, headY - roofY - truss)
    if (!fb) continue
    const downX = W / 2 + fb.aim * W * 0.75
    const upX = W / 2 + fb.aim * W * 1.1
    const lx = downX + (upX - downX) * fx.tilt
    const ly = H * 1.05 + (-H * 0.4 - H * 1.05) * fx.tilt
    ctx.save()
    ctx.translate(x, headY)
    ctx.rotate(Math.atan2(ly - headY, lx - x))
    ctx.fillStyle = '#1b1b24'
    ctx.fillRect(-s * 0.7, -s * 0.55, s * 1.4, s * 1.1)
    if (fb.intensity > 0.03) {
      const hue = (P.b + fb.hueOffset * 0.35 + t * 8) % 360
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `hsla(${hue}, 90%, 75%, ${fb.intensity * 0.25})`
      ctx.beginPath()
      ctx.arc(s * 0.7, 0, s * 1.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `hsla(${hue}, 100%, 88%, ${0.4 + fb.intensity * 0.6})`
      ctx.beginPath()
      ctx.arc(s * 0.7, 0, s * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // blinders on the towers (warm, with filament afterglow)
  const lamp = Math.max(2.5, H * 0.008)
  const blind = fx.blind * (0.4 + E * 0.6)
  for (let side = 0; side < 2; side++) {
    const bx = side === 0 ? towerL + truss + lamp * 2.2 : towerR - lamp * 2.2
    for (let cl = 0; cl < 2; cl++) {
      const by = H * (0.3 + cl * 0.2)
      for (let q = 0; q < 4; q++) {
        const lx = bx + ((q % 2) - 0.5) * lamp * 2.3
        const ly = by + (Math.floor(q / 2) - 0.5) * lamp * 2.3
        ctx.fillStyle = '#121218'
        ctx.beginPath()
        ctx.arc(lx, ly, lamp, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle =
          blind > 0.2
            ? `rgba(255,${210 + blind * 40},${150 + blind * 90},${blind})`
            : `hsla(25, 100%, 50%, ${0.08 + blind * 1.5})`
        ctx.beginPath()
        ctx.arc(lx, ly, lamp * 0.7, 0, Math.PI * 2)
        ctx.fill()
      }
      if (blind > 0.05) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, H * 0.12)
        g.addColorStop(0, `rgba(255,220,170,${blind * 0.5})`)
        g.addColorStop(1, 'rgba(255,200,140,0)')
        ctx.fillStyle = g
        ctx.fillRect(bx - H * 0.12, by - H * 0.12, H * 0.24, H * 0.24)
        ctx.restore()
      }
    }
  }

  // strobes along the roof and the stage lip
  let strobe = fx.strobe
  if (hot && F.hihats > 0.55 && E > 0.6) strobe = Math.max(strobe, 0.6)
  const gate = Math.floor(t * 20) % 2 === 0 ? 1 : 0.12
  const sv = strobe * gate
  const sw = W * 0.03
  for (let i = 0; i < 7; i++) {
    const onRoof = i < 5
    const x = onRoof ? W * (0.2 + i * 0.15) : i === 5 ? W * 0.2 : W * 0.8
    const y = onRoof ? roofY + truss + 1 : stageY - 5
    ctx.fillStyle = '#1a1a22'
    ctx.fillRect(x - sw / 2, y, sw, 3)
    if (sv > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, 0.3 + sv)})`
      ctx.fillRect(x - sw / 2, y, sw, 3)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgba(220,235,255,${sv * 0.12})`
      ctx.beginPath()
      ctx.ellipse(x, y + 1.5, sw * 1.1, sw * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(235,245,255,${sv * 0.25})`
      ctx.beginPath()
      ctx.ellipse(x, y + 1.5, sw * 0.7, sw * 0.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  if (sv > 0.4) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = `rgba(255,255,255,${sv * 0.05})`
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  // --- DJ riser ---------------------------------------------------------------
  ctx.fillStyle = '#07070c'
  ctx.fillRect(boothX, boothY, boothW, boothH)
  const faceX = boothX + boothW * 0.04
  const faceW = boothW * 0.92
  const faceY = boothY + boothH * 0.18
  const faceH = boothH * 0.64
  const bars = 24
  const bw = faceW / bars
  for (let i = 0; i < bars; i++) {
    const level = (F.bars[Math.floor((i / bars) * F.bars.length)] ?? 0) * (0.5 + F.impact * 0.5) * (0.3 + E * 0.7)
    const segs = 8
    const lit = Math.round(Math.min(1, level) * segs)
    for (let j = 0; j < segs; j++) {
      const on = j < lit
      ctx.fillStyle = on
        ? `hsla(${(P.a + j * 8) % 360}, 90%, ${55 + j * 3}%, ${0.5 + level * 0.5})`
        : 'rgba(255,255,255,0.03)'
      ctx.fillRect(faceX + i * bw + 1, faceY + faceH - (j + 1) * (faceH / segs) + 1, bw - 2, faceH / segs - 2)
    }
  }
  ctx.strokeStyle = `hsla(${P.a}, 80%, 60%, ${0.35 + E * 0.45 + F.flash * 0.3})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(boothX, boothY)
  ctx.lineTo(boothX + boothW, boothY)
  ctx.stroke()

  drawDJ(ctx, S.djs[0], W / 2, boothY, H / 470, P.a, DJ_FESTIVAL, F, E)

  // monitor wedges at the riser corners, woofers kicking
  const mw = H * 0.04
  const mh = H * 0.045
  for (let side = 0; side < 2; side++) {
    const mx = side === 0 ? boothX + 4 : boothX + boothW - 4 - mw
    ctx.fillStyle = '#0c0c12'
    ctx.fillRect(mx, boothY - mh, mw, mh)
    ctx.strokeStyle = 'rgba(70,70,85,0.8)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(mx + mw / 2, boothY - mh * 0.45, mw * 0.3 + F.kick * mw * 0.05, 0, Math.PI * 2)
    ctx.stroke()
  }

  // follow spots from front-of-house onto the DJ
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const djY = boothY - H * 0.08
  for (let i = 0; i < F.spots.length; i++) {
    const sp = F.spots[i]
    if (sp.intensity < 0.03) continue
    const sx = W * (0.15 + (i / Math.max(1, F.spots.length - 1)) * 0.7)
    const sy = H * 1.08
    const tx = W / 2 + sp.aim * W * 0.05
    const g = ctx.createLinearGradient(sx, sy, tx, djY)
    g.addColorStop(0, `hsla(${P.c}, 25%, 90%, ${sp.intensity * 0.012})`)
    g.addColorStop(1, `hsla(${P.c}, 25%, 90%, ${sp.intensity * 0.1})`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(sx - W * 0.03, sy)
    ctx.lineTo(sx + W * 0.03, sy)
    ctx.lineTo(tx + H * 0.05, djY)
    ctx.lineTo(tx - H * 0.05, djY)
    ctx.closePath()
    ctx.fill()
    const halo = ctx.createRadialGradient(tx, djY, 0, tx, djY, H * 0.11)
    halo.addColorStop(0, `hsla(${P.c}, 30%, 92%, ${sp.intensity * 0.09})`)
    halo.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = halo
    ctx.fillRect(tx - H * 0.11, djY - H * 0.11, H * 0.22, H * 0.22)
  }

  // floor uplights along the lip
  for (let i = 0; i < F.floors.length; i++) {
    const fl = F.floors[i]
    if (fl.intensity < 0.02) continue
    const x = W / 2 + fl.aim * W * 0.44
    const g = ctx.createLinearGradient(x, stageY, x, stageY - H * 0.5)
    g.addColorStop(0, `hsla(${P.b}, 85%, 60%, ${fl.intensity * 0.5})`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - 4, stageY)
    ctx.lineTo(x + 4, stageY)
    ctx.lineTo(x + W * 0.025, stageY - H * 0.5)
    ctx.lineTo(x - W * 0.025, stageY - H * 0.5)
    ctx.closePath()
    ctx.fill()
  }

  // --- special FX -------------------------------------------------------------
  // CO₂ jets
  for (let i = 0; i < fx.co2.length; i++) {
    const c = fx.co2[i]
    if (c < 0.02) continue
    const x = W * CO2_X[i]
    const h = H * 0.48 * Math.min(1, c * 1.4)
    const spread = W * 0.02 * (1 + (1 - c) * 2.5)
    const g = ctx.createLinearGradient(x, stageY, x, stageY - h)
    g.addColorStop(0, `rgba(255,255,255,${0.55 * c})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - 4, stageY)
    ctx.lineTo(x + 4, stageY)
    ctx.lineTo(x + spread, stageY - h)
    ctx.lineTo(x - spread, stageY - h)
    ctx.closePath()
    ctx.fill()
    for (let p = 0; p < 3; p++) {
      ctx.fillStyle = `rgba(235,240,255,${0.07 * c})`
      ctx.beginPath()
      ctx.arc(x + Math.sin(t * 3 + p * 2 + i) * spread * 0.4, stageY - h * (0.45 + p * 0.22), spread * (0.8 + p * 0.4), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // flame projectors
  let heat = 0
  for (let i = 0; i < fx.pyro.length; i++) {
    const p = Math.min(1, fx.pyro[i])
    if (p < 0.02) continue
    heat += p
    const x = W * PYRO_X[i]
    const h = H * 0.36 * Math.sqrt(p) * (0.85 + 0.15 * Math.sin(t * 40 + i * 3))
    const w0 = W * 0.012
    const f1 = Math.sin(t * 23 + i) * w0 * 0.8
    const f2 = Math.sin(t * 31 + i * 2) * w0
    const g = ctx.createLinearGradient(x, stageY, x, stageY - h * 1.15)
    g.addColorStop(0, `rgba(255,255,225,${p})`)
    g.addColorStop(0.2, `rgba(255,200,80,${p * 0.95})`)
    g.addColorStop(0.55, `rgba(255,100,20,${p * 0.75})`)
    g.addColorStop(0.85, `rgba(150,30,0,${p * 0.3})`)
    g.addColorStop(1, 'rgba(60,10,0,0)')
    ctx.fillStyle = g
    // three licking tongues around a fat column, each flickering on its own
    for (let tg = -1; tg <= 1; tg++) {
      const th = h * (tg === 0 ? 1.1 : 0.75 + 0.15 * Math.sin(t * 17 + i + tg * 4))
      const tx = x + tg * w0 * 1.3
      const fl = Math.sin(t * (19 + tg * 6) + i * 3 + tg) * w0 * 1.4
      ctx.beginPath()
      ctx.moveTo(tx - w0 * 1.1, stageY)
      ctx.bezierCurveTo(tx - w0 * 3 + f1, stageY - th * 0.35, tx - w0 * 0.5 + fl, stageY - th * 0.7, tx + fl + f2 * 0.5, stageY - th)
      ctx.bezierCurveTo(tx + w0 * 0.5 + fl, stageY - th * 0.7, tx + w0 * 3 + f1, stageY - th * 0.35, tx + w0 * 1.1, stageY)
      ctx.closePath()
      ctx.fill()
    }
    // bright core
    ctx.fillStyle = `rgba(255,250,220,${p * 0.6})`
    ctx.beginPath()
    ctx.ellipse(x, stageY - h * 0.12, w0 * 1.2, h * 0.14, 0, 0, Math.PI * 2)
    ctx.fill()
    const glow = ctx.createRadialGradient(x, stageY - h * 0.3, 0, x, stageY - h * 0.3, H * 0.28)
    glow.addColorStop(0, `rgba(255,140,40,${0.28 * p})`)
    glow.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - H * 0.28, stageY - h * 0.3 - H * 0.28, H * 0.56, H * 0.56)
  }
  if (heat > 0.05) {
    ctx.fillStyle = `hsla(28, 100%, 50%, ${Math.min(0.06, heat * 0.015)})`
    ctx.fillRect(0, 0, W, H)
  }

  // sparks (fountains + fireworks)
  const sp = fx.sparks
  for (let i = 0; i < SPARK_MAX; i++) {
    const o = i * SF
    if (sp[o + 4] <= 0) continue
    const firework = sp[o + 6] > 0.5
    sp[o] += sp[o + 2]
    sp[o + 1] += sp[o + 3]
    sp[o + 3] += (firework ? 0.035 : 0.09) * k
    sp[o + 2] *= firework ? 0.975 : 0.99
    sp[o + 3] *= firework ? 0.975 : 1
    sp[o + 4] -= firework ? 0.013 : 0.016
    const life = sp[o + 4]
    if (life <= 0) continue
    ctx.fillStyle = `hsla(${sp[o + 5]}, 100%, ${60 + life * 30}%, ${life})`
    const size = firework ? 2.2 : 2
    // one rect stretched along the velocity reads as a motion streak
    ctx.fillRect(sp[o] - size / 2, sp[o + 1] - size / 2 - Math.max(0, -sp[o + 3]), size, size + Math.abs(sp[o + 3]))
  }

  // low fog rolling over the deck, lit by the uplights
  const fogAmt = 0.25 + fx.fog
  const fogTop = stageY - H * (0.06 + fx.fog * 0.05)
  const fg = ctx.createLinearGradient(0, fogTop, 0, H)
  fg.addColorStop(0, `hsla(${P.a}, 40%, 75%, 0)`)
  fg.addColorStop(0.35, `hsla(${P.a}, 40%, 75%, ${0.09 * fogAmt * (0.4 + E * 0.6)})`)
  fg.addColorStop(1, `hsla(${P.a}, 40%, 70%, ${0.03 * fogAmt})`)
  ctx.fillStyle = fg
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * W
    ctx.lineTo(x, fogTop + H * 0.02 * Math.sin(i * 0.9 + t * 0.6) + H * 0.01 * Math.sin(i * 2.3 - t * 0.4))
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // confetti fluttering down (normal blending: paper, not light)
  const cf = fx.confetti
  for (let i = 0; i < CONF_MAX; i++) {
    const o = i * CF
    if (cf[o + 7] <= 0) continue
    cf[o + 3] = Math.min(cf[o + 3] + 0.12 * k, 1.3 * k)
    cf[o + 2] *= 0.985
    cf[o + 4] += cf[o + 5]
    cf[o] += cf[o + 2] + Math.sin(cf[o + 4]) * 0.6 * k
    cf[o + 1] += cf[o + 3]
    cf[o + 7] -= 0.0025
    if (cf[o + 1] > H + 10) cf[o + 7] = 0
    const life = cf[o + 7]
    if (life <= 0) continue
    const a = Math.min(1, life * 2)
    ctx.fillStyle = cf[o + 6] < 0 ? `rgba(255,255,255,${a})` : `hsla(${cf[o + 6]}, 85%, 60%, ${a})`
    const w = 5 * k * Math.abs(Math.cos(cf[o + 4])) + 0.6
    ctx.fillRect(cf[o] - w / 2, cf[o + 1], w, 3 * k)
  }

  // FX hardware on the lip
  ctx.fillStyle = '#121219'
  for (let i = 0; i < PYRO_X.length; i++) ctx.fillRect(W * PYRO_X[i] - 5, stageY - 4, 10, 4)
  for (let i = 0; i < CO2_X.length; i++) ctx.fillRect(W * CO2_X[i] - 4, stageY - 5, 8, 5)
}
