/**
 * Show Packs — complete spectacles, one engine.
 *
 * Every pack is a scene function fed by the same StageDirector frame: same
 * narrative states, same impact events, same light groups — but each pack
 * has its own personality, architecture and color language:
 *
 *   🎧 festival   — Tomorrowland/Ultra mainstage: LED wall, lasers, CO₂
 *   🔺 pyramid    — Daft Punk visual language (Alive eras) — para o Arthur 🤖
 *   🌌 cyber      — sci-fi arena: holograms, neon lines, data columns
 *   🌲 nature     — organic pulse: auroras, luminous trees, fireflies
 *   🌃 synthwave  — retro horizon: striped sun, perspective grid, skyline
 *   🚀 space      — odyssey: starfield, nebulae, station, cosmic beams
 *
 * Never a frozen frame: every pack breathes (F.breath / F.sway) even in
 * silence. Zero per-frame allocations: pools and buffers live in SceneState.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import { sampleLed, LED_PATTERNS, type LedPatternId } from './ledPatterns'

// ---------------------------------------------------------------------------
// Scene state (allocated once)
// ---------------------------------------------------------------------------

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  hue: number
}

interface Ripple {
  x: number
  r: number
  life: number
}

export interface SceneState {
  particles: Particle[]
  ripples: Ripple[]
  co2: number // CO₂ jet envelope
  ledIdx: number
  ledMix: number
  ledTimer: number
  // pyramid (Alive eras)
  eraIdx: number
  eraMix: number
  eraTimer: number
  fanPhase: number
  // space starfield / nature fireflies (x, y, z|phase triplets)
  stars: Float32Array
  flies: Float32Array
  // cached static gradients (rebuilt only on resize) — avoids rebuilding
  // full-screen gradients every frame, which is heavy on fill-rate/GPU
  gradW: number
  gradH: number
  gradCache: Record<string, CanvasGradient>
}

export const MAX_PARTICLES = 360
const MAX_RIPPLES = 10
const STAR_COUNT = 180
const FLY_COUNT = 42

export function createSceneState(): SceneState {
  const particles: Particle[] = []
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, hue: 0 })
  }
  const ripples: Ripple[] = []
  for (let i = 0; i < MAX_RIPPLES; i++) ripples.push({ x: 0, r: 0, life: 0 })
  const stars = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    stars[i * 3] = Math.random()
    stars[i * 3 + 1] = Math.random()
    stars[i * 3 + 2] = 0.2 + Math.random() * 0.8 // depth
  }
  const flies = new Float32Array(FLY_COUNT * 3)
  for (let i = 0; i < FLY_COUNT; i++) {
    flies[i * 3] = Math.random()
    flies[i * 3 + 1] = 0.45 + Math.random() * 0.45
    flies[i * 3 + 2] = Math.random() * Math.PI * 2
  }
  return {
    gradW: 0,
    gradH: 0,
    gradCache: {},
    particles,
    ripples,
    co2: 0,
    ledIdx: 0,
    ledMix: 0,
    ledTimer: 0,
    eraIdx: 0,
    eraMix: 0,
    eraTimer: 0,
    fanPhase: 0,
    stars,
    flies
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Returns a cached gradient, rebuilding the cache only when the canvas size
 * changes. Building a full-screen CanvasGradient every frame is a real
 * fill-rate cost; static gradients (sky, sun, grid) should never be per-frame.
 */
function cachedGradient(
  ctx: CanvasRenderingContext2D,
  S: SceneState,
  W: number,
  H: number,
  key: string,
  build: (ctx: CanvasRenderingContext2D) => CanvasGradient
): CanvasGradient {
  if (S.gradW !== W || S.gradH !== H) {
    S.gradCache = {}
    S.gradW = W
    S.gradH = H
  }
  let g = S.gradCache[key]
  if (!g) {
    g = build(ctx)
    S.gradCache[key] = g
  }
  return g
}

export function spawnBurst(
  S: SceneState,
  x: number,
  y: number,
  count: number,
  hueBase: number,
  power = 1
): void {
  let spawned = 0
  for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
    const p = S.particles[i]
    if (p.life > 0) continue
    p.x = x + (Math.random() - 0.5) * 12
    p.y = y
    p.vx = (Math.random() - 0.5) * 3
    p.vy = -2.4 * power - Math.random() * 3.4 * power
    p.life = 1
    p.hue = (hueBase + Math.random() * 60) % 360
    spawned++
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, S: SceneState): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = S.particles[i]
    if (p.life <= 0) continue
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.08
    p.life -= 0.016
    if (p.life <= 0) continue
    ctx.fillStyle = `hsla(${p.hue}, 100%, ${55 + p.life * 25}%, ${p.life * 0.9})`
    const s = 1.4 + p.life * 1.6
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
  }
  ctx.restore()
}

export function drawCrowd(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  E: number,
  colorful: boolean
): void {
  const phones = 40
  for (let i = 0; i < phones; i++) {
    const px = ((i * 2654435761) % 997) / 997
    const py = ((i * 40503) % 431) / 431
    const tw = Math.sin(F.t * 3 + i * 2.4) * 0.5 + 0.5
    if (tw < 0.35 || E < 0.06) continue
    ctx.fillStyle = colorful
      ? `hsla(${(i * 47) % 360}, 90%, 70%, ${0.25 + tw * 0.5 * E})`
      : `hsla(${F.palette.a}, 40%, 85%, ${0.2 + tw * (0.3 + F.hihats * 0.4) * E})`
    ctx.fillRect(px * W, H - 22 - py * 46, 2, 3)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.93)'
  ctx.beginPath()
  ctx.moveTo(0, H)
  const heads = 30
  for (let i = 0; i <= heads; i++) {
    const x = (i / heads) * W
    const bounce = Math.sin(F.t * 6 + i * 1.7) * (2 + F.kickTick * 5) * E
    const y = H - 12 - ((i * 7919) % 15) - bounce
    ctx.quadraticCurveTo(x - W / heads / 2, y - 12, x, y)
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
  if (E > 0.25) {
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    ctx.lineWidth = 2.5
    for (let i = 0; i < 14; i++) {
      const x = (((i * 104729) % 991) / 991) * W
      const up = Math.max(0, Math.sin(F.t * 5 + i * 2.2)) * (8 + F.kick * 14) * E
      if (up < 4) continue
      ctx.beginPath()
      ctx.moveTo(x, H - 18)
      ctx.lineTo(x + Math.sin(i) * 3, H - 18 - up)
      ctx.stroke()
    }
  }
}

/** Director's choreographed lasers, drawn from a chosen origin. */
export function drawLasers(
  ctx: CanvasRenderingContext2D,
  W: number,
  originX: number,
  originY: number,
  F: DirectorFrame,
  width = 1.5
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < F.lasers.length; i++) {
    const lz = F.lasers[i]
    if (lz.intensity < 0.02) continue
    const a = -Math.PI / 2 + lz.angle
    ctx.strokeStyle = `hsla(${lz.hue}, 100%, 60%, ${lz.intensity * 0.6})`
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(originX, originY)
    ctx.lineTo(originX + Math.cos(a) * W * 1.2, originY + Math.sin(a) * W * 1.2)
    ctx.stroke()
  }
  ctx.restore()
}

/** LED panel using the pattern library, with crossfading pattern rotation. */
function drawLedPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
  baseHue: number,
  F: DirectorFrame,
  S: SceneState,
  E: number,
  patterns: LedPatternId[]
): void {
  S.ledTimer += 1 / 60
  if (S.ledMix > 0) {
    S.ledMix = Math.min(1, S.ledMix + 0.02)
    if (S.ledMix >= 1) {
      S.ledIdx = (S.ledIdx + 1) % patterns.length
      S.ledMix = 0
    }
  } else if (S.ledTimer > (F.state === 'drop' || F.state === 'climax' ? 9 : 15)) {
    S.ledTimer = 0
    S.ledMix = 0.01
  }
  const cur = patterns[S.ledIdx % patterns.length]
  const nxt = patterns[(S.ledIdx + 1) % patterns.length]
  const cw = w / cols
  const ch = h / rows
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const a = sampleLed(cur, c, r, cols, rows, F)
      const va = a.v
      const ha = a.hueShift
      let v = va
      let hs = ha
      if (S.ledMix > 0) {
        const b = sampleLed(nxt, c, r, cols, rows, F)
        v = va * (1 - S.ledMix) + b.v * S.ledMix
        hs = ha * (1 - S.ledMix) + b.hueShift * S.ledMix
      }
      v *= E
      ctx.fillStyle =
        v > 0.04
          ? `hsla(${(baseHue + hs) % 360}, 85%, 60%, ${0.08 + v * 0.8})`
          : 'rgba(255,255,255,0.025)'
      ctx.fillRect(x + c * cw + 1, y + r * ch + 1, cw - 2, ch - 2)
    }
  }
}

function triggerFloorFx(S: SceneState, F: DirectorFrame, W: number): void {
  if (!F.impactHit) return
  for (let i = 0; i < MAX_RIPPLES; i++) {
    if (S.ripples[i].life > 0) continue
    S.ripples[i].x = W / 2 + (Math.random() - 0.5) * W * 0.3
    S.ripples[i].r = 8
    S.ripples[i].life = 1
    break
  }
  if (F.impactLevel >= 5) S.co2 = 1
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  stageY: number,
  hue: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  ctx.fillStyle = '#06060c'
  ctx.fillRect(0, stageY, W, H - stageY)
  const refl = ctx.createLinearGradient(0, stageY, 0, H)
  refl.addColorStop(0, `hsla(${hue}, 80%, 55%, ${0.14 * E + F.flash * 0.08})`)
  refl.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = refl
  ctx.fillRect(0, stageY, W, H - stageY)

  // luminous waves rolling across the floor
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    const phase = (F.t * (0.25 + F.kickTick * 0.3) + i / 3) % 1
    const y = stageY + phase * (H - stageY)
    ctx.fillStyle = `hsla(${hue}, 85%, 60%, ${(0.06 + F.kickTick * 0.12) * E * (1 - phase)})`
    ctx.fillRect(0, y, W, 2)
  }
  // impact ripples
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const rp = S.ripples[i]
    if (rp.life <= 0) continue
    rp.r += 4.5
    rp.life -= 0.02
    if (rp.life <= 0) continue
    ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${rp.life * 0.5 * E})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(rp.x, stageY + 10, rp.r, rp.r * 0.22, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 🎧 FESTIVAL MAINSTAGE
// ---------------------------------------------------------------------------

function drawFestival(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  const P = F.palette
  const stageY = H * 0.78
  const wallTop = H * 0.12
  const wallBottom = stageY - H * 0.06
  const trussY = wallTop - 10
  triggerFloorFx(S, F, W)

  // haze
  const hz = ctx.createRadialGradient(
    W * (0.35 + Math.sin(F.t * 0.3) * 0.1),
    H * 0.4,
    0,
    W * 0.5,
    H * 0.4,
    W * 0.7
  )
  hz.addColorStop(0, `hsla(${P.a}, 80%, 55%, ${(0.05 + F.breath * 0.02) * E})`)
  hz.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = hz
  ctx.fillRect(0, 0, W, H)

  // BACKLIGHTS: rim glow behind the whole rig (sub-bass body)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < F.backs.length; i++) {
    const bk = F.backs[i]
    if (bk.intensity < 0.02) continue
    const x = W / 2 + bk.aim * W * 0.42
    const g = ctx.createRadialGradient(x, wallBottom, 0, x, wallBottom, H * 0.32)
    g.addColorStop(0, `hsla(${P.b}, 85%, 55%, ${bk.intensity * 0.4})`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - H * 0.32, wallBottom - H * 0.32, H * 0.64, H * 0.4)
  }
  ctx.restore()

  // giant LED wall — full animation library
  drawLedPanel(
    ctx,
    W * 0.08,
    wallTop,
    W * 0.84,
    wallBottom - wallTop,
    36,
    10,
    P.a,
    F,
    S,
    E,
    LED_PATTERNS
  )

  drawFloor(ctx, W, H, stageY, P.a, F, S, E)

  // truss + blinders
  ctx.strokeStyle = `rgba(140,140,155,${0.22 + E * 0.25})`
  ctx.lineWidth = 3
  ctx.strokeRect(W * 0.06, trussY, W * 0.88, 10)
  for (const tx of [W * 0.06, W * 0.94 - 12]) {
    ctx.strokeRect(tx, trussY, 12, stageY - trussY)
    for (let i = 0; i < 4; i++) {
      const ly = trussY + 30 + i * (stageY - trussY - 60) * 0.3
      const flash = F.flash * (0.5 + F.snare)
      ctx.fillStyle = `rgba(255,250,235,${(0.05 + F.breath * 0.03 + flash * 0.85) * E})`
      ctx.beginPath()
      ctx.arc(tx + 6, ly, 5 + flash * 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const originYBeam = trussY + 12
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // WASH
  for (let i = 0; i < F.wash.length; i++) {
    const wl = F.wash[i]
    if (wl.intensity < 0.02) continue
    const x = W * 0.16 + (i / (F.wash.length - 1)) * W * 0.68
    const landX = W / 2 + wl.aim * W * 0.5
    const grad = ctx.createLinearGradient(x, originYBeam, landX, stageY)
    grad.addColorStop(0, `hsla(${P.a}, 60%, 62%, ${wl.intensity * 0.5})`)
    grad.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x - 8, originYBeam)
    ctx.lineTo(x + 8, originYBeam)
    ctx.lineTo(landX + W * 0.14, stageY)
    ctx.lineTo(landX - W * 0.14, stageY)
    ctx.closePath()
    ctx.fill()
  }

  // SPOTS
  for (let i = 0; i < F.spots.length; i++) {
    const sp = F.spots[i]
    if (sp.intensity < 0.03) continue
    const x = W * 0.3 + (i / (F.spots.length - 1)) * W * 0.4
    const landX = W / 2 + sp.aim * W * 0.3
    const landY = stageY - H * 0.02
    const grad = ctx.createLinearGradient(x, originYBeam, landX, landY)
    grad.addColorStop(0, `hsla(${P.c}, 30%, 85%, ${sp.intensity * 0.75})`)
    grad.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x - 2.5, originYBeam)
    ctx.lineTo(x + 2.5, originYBeam)
    ctx.lineTo(landX + 22, landY)
    ctx.lineTo(landX - 22, landY)
    ctx.closePath()
    ctx.fill()
  }

  // BEAMS
  for (let i = 0; i < F.beams.length; i++) {
    const fx = F.beams[i]
    const x = W * 0.1 + (i / (F.beams.length - 1)) * W * 0.8
    const landX = W / 2 + fx.aim * W * 0.55
    if (fx.intensity > 0.02) {
      const hue = (P.b + fx.hueOffset * 0.35 + F.t * 8) % 360
      const grad = ctx.createLinearGradient(x, originYBeam, landX, stageY + 4)
      grad.addColorStop(0, `hsla(${hue}, 90%, 62%, ${fx.intensity})`)
      grad.addColorStop(1, 'hsla(0,0%,0%,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(x - 3, originYBeam)
      ctx.lineTo(x + 3, originYBeam)
      ctx.lineTo(landX + 28, stageY + 4)
      ctx.lineTo(landX - 28, stageY + 4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${fx.intensity * 0.5})`
      ctx.beginPath()
      ctx.ellipse(landX, stageY + 6, 32, 7, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = `rgba(200,200,215,${0.3 + E * 0.4})`
    ctx.fillRect(x - 5, trussY + 2, 10, 12)
  }

  // FLOOR LIGHTS: uplight cones along the stage front
  for (let i = 0; i < F.floors.length; i++) {
    const fl = F.floors[i]
    if (fl.intensity < 0.02) continue
    const x = W / 2 + fl.aim * W * 0.42
    const grad = ctx.createLinearGradient(x, stageY, x, stageY - H * 0.3)
    grad.addColorStop(0, `hsla(${P.b}, 85%, 60%, ${fl.intensity * 0.55})`)
    grad.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x - 5, stageY)
    ctx.lineTo(x + 5, stageY)
    ctx.lineTo(x + 20, stageY - H * 0.3)
    ctx.lineTo(x - 20, stageY - H * 0.3)
    ctx.closePath()
    ctx.fill()
  }

  // CO₂ jets on full-spectacle impacts
  S.co2 *= 0.94
  if (S.co2 > 0.03) {
    for (const jx of [W * 0.3, W * 0.7]) {
      const g = ctx.createLinearGradient(jx, stageY, jx, stageY - H * 0.4 * S.co2)
      g.addColorStop(0, `rgba(255,255,255,${0.5 * S.co2 * E})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(jx - 8, stageY)
      ctx.lineTo(jx + 8, stageY)
      ctx.lineTo(jx + 30 * S.co2, stageY - H * 0.4 * S.co2)
      ctx.lineTo(jx - 30 * S.co2, stageY - H * 0.4 * S.co2)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()

  drawLasers(ctx, W, W / 2, stageY - H * 0.12, F)

  // booth + DJ
  const boothW = W * 0.3
  const boothH = H * 0.14
  const boothX = W / 2 - boothW / 2
  const boothY = stageY - boothH
  ctx.fillStyle = '#0c0c12'
  ctx.fillRect(boothX, boothY, boothW, boothH)
  ctx.strokeStyle = `hsla(${P.a}, 80%, 60%, ${0.3 + E * 0.5 + F.flash * 0.3})`
  ctx.lineWidth = 2
  ctx.strokeRect(boothX, boothY, boothW, boothH)
  const miniBars = 16
  const miniW = boothW / miniBars
  for (let i = 0; i < miniBars; i++) {
    const level = (F.bars[i * 2] ?? 0) * (0.7 + F.impact * 0.5) * E
    const h = Math.min(boothH - 14, level * (boothH - 14))
    ctx.fillStyle = `hsla(${P.a}, 85%, 60%, ${0.35 + level * 0.6})`
    ctx.fillRect(boothX + i * miniW + 2, boothY + boothH - 6 - h, miniW - 4, h)
  }
  const bob = F.kickTick * 6
  ctx.fillStyle = 'rgba(0,0,0,0.95)'
  ctx.beginPath()
  ctx.arc(W / 2, boothY - 16 + bob, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(W / 2 - 16, boothY - 8 + bob, 32, 10)

  if (F.impactHit) spawnBurst(S, W * 0.34, H * 0.64, 12 + F.impact * 18, P.b, 1)
  if (F.impactHit) spawnBurst(S, W * 0.66, H * 0.64, 12 + F.impact * 18, P.b, 1)
}

// ---------------------------------------------------------------------------
// 🔺 PYRAMID — Daft Punk visual language, Alive color eras. Para o Arthur 🤖
// ---------------------------------------------------------------------------

interface Era {
  L: [number, number]
  R: [number, number]
  beam: number
  hazeL: number
  hazeR: number
  screen: number
  edge: number
  strip: number
  whiteCore: boolean
  cycle?: boolean
}

const ERAS: Era[] = [
  { L: [196, 184], R: [196, 184], beam: 190, hazeL: 196, hazeR: 190, screen: 185, edge: 195, strip: 334, whiteCore: true },
  { L: [292, 326], R: [292, 326], beam: 18, hazeL: 348, hazeR: 24, screen: 14, edge: 22, strip: 12, whiteCore: false },
  { L: [322, 236], R: [108, 22], beam: 300, hazeL: 330, hazeR: 120, screen: 170, edge: 200, strip: 55, whiteCore: false, cycle: true },
  { L: [262, 300], R: [302, 338], beam: 286, hazeL: 286, hazeR: 322, screen: 278, edge: 292, strip: 300, whiteCore: true }
]
const ERA_SECONDS = 22

function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180
  return (a + d * t + 360) % 360
}

function resolveEra(S: SceneState): Era {
  const a = ERAS[S.eraIdx % ERAS.length]
  if (S.eraMix <= 0) return a
  const b = ERAS[(S.eraIdx + 1) % ERAS.length]
  const t = S.eraMix
  return {
    L: [lerpHue(a.L[0], b.L[0], t), lerpHue(a.L[1], b.L[1], t)],
    R: [lerpHue(a.R[0], b.R[0], t), lerpHue(a.R[1], b.R[1], t)],
    beam: lerpHue(a.beam, b.beam, t),
    hazeL: lerpHue(a.hazeL, b.hazeL, t),
    hazeR: lerpHue(a.hazeR, b.hazeR, t),
    screen: lerpHue(a.screen, b.screen, t),
    edge: lerpHue(a.edge, b.edge, t),
    strip: lerpHue(a.strip, b.strip, t),
    whiteCore: (t < 0.5 ? a : b).whiteCore,
    cycle: (t < 0.5 ? a : b).cycle
  }
}

interface Tri {
  x1: number
  y1: number
  x2: number
  y2: number
  x3: number
  y3: number
  row: number
  col: number
}

function buildInvLattice(cx: number, topY: number, tipY: number, halfTop: number, rows: number): Tri[] {
  const tris: Tri[] = []
  const rowH = (tipY - topY) / rows
  for (let r = 0; r < rows; r++) {
    const yTop = topY + r * rowH
    const yBot = yTop + rowH
    const halfT = halfTop * (1 - r / rows)
    const halfB = halfTop * (1 - (r + 1) / rows)
    const downCount = rows - r
    for (let i = 0; i < downCount; i++) {
      const xTL = cx - halfT + (i / downCount) * halfT * 2
      const xTR = cx - halfT + ((i + 1) / downCount) * halfT * 2
      const xB = downCount > 1 ? cx - halfB + (i / (downCount - 1)) * halfB * 2 : cx
      tris.push({ x1: xTL, y1: yTop, x2: xTR, y2: yTop, x3: xB, y3: yBot, row: r, col: i })
      if (i < downCount - 1) {
        const xBR = downCount > 1 ? cx - halfB + ((i + 1) / (downCount - 1)) * halfB * 2 : cx
        tris.push({ x1: xTR, y1: yTop, x2: xB, y2: yBot, x3: xBR, y3: yBot, row: r, col: i + 0.5 })
      }
    }
  }
  return tris
}

const latticeCache = new Map<string, Tri[]>()

function drawPyramid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  const stageY = H * 0.78
  S.eraTimer += 1 / 60
  if (S.eraMix > 0) {
    S.eraMix = Math.min(1, S.eraMix + 0.01)
    if (S.eraMix >= 1) {
      S.eraIdx = (S.eraIdx + 1) % ERAS.length
      S.eraMix = 0
    }
  } else if (S.eraTimer > ERA_SECONDS || (F.state === 'drop' && F.stateJustChanged && S.eraTimer > 8)) {
    S.eraTimer = 0
    S.eraMix = 0.01
  }
  const era = resolveEra(S)
  if (F.impactHit) S.fanPhase += 0.5 * (0.5 + F.impact)
  else if (F.kickTick > 0.35 && F.state === 'climax') S.fanPhase += 0.06

  // backwall lattice
  ctx.strokeStyle = `hsla(${era.L[0]}, 80%, 60%, ${(0.045 + F.vocals * 0.08) * E})`
  ctx.lineWidth = 1
  const cell = 46
  const wallBot = stageY - 4
  ctx.beginPath()
  for (let y = H * 0.04; y < wallBot; y += cell) {
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
  }
  for (let x = -H; x < W + H; x += cell) {
    ctx.moveTo(x, H * 0.04)
    ctx.lineTo(x + (wallBot - H * 0.04) * 0.577, wallBot)
    ctx.moveTo(x, H * 0.04)
    ctx.lineTo(x - (wallBot - H * 0.04) * 0.577, wallBot)
  }
  ctx.stroke()

  // haze
  const hazeL = ctx.createRadialGradient(W * 0.16, H * 0.35, 0, W * 0.16, H * 0.35, W * 0.55)
  hazeL.addColorStop(0, `hsla(${era.hazeL}, 95%, 55%, ${(0.15 + F.breath * 0.04) * E})`)
  hazeL.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = hazeL
  ctx.fillRect(0, 0, W, H)
  const hazeR = ctx.createRadialGradient(W * 0.84, H * 0.35, 0, W * 0.84, H * 0.35, W * 0.55)
  hazeR.addColorStop(0, `hsla(${era.hazeR}, 95%, 55%, ${(0.13 + F.breath * 0.04) * E})`)
  hazeR.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = hazeR
  ctx.fillRect(0, 0, W, H)

  const apexX = W / 2
  const apexY = H * 0.18
  const baseY = stageY
  const baseHalf = W * 0.155

  // beam fan
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const originX = apexX
  const originY = apexY + (baseY - apexY) * 0.42
  const FAN = 14
  for (let i = 0; i < FAN; i++) {
    const spread = (i / (FAN - 1)) * Math.PI
    const wobble = Math.sin(F.t * 0.9 + i * 1.7) * 0.12
    const a = Math.PI + spread + S.fanPhase * 0.25 * Math.sin(i * 0.9) + wobble
    const len = H * 1.15
    const ex = originX + Math.cos(a) * len
    const ey = originY + Math.sin(a) * len
    const band = F.bars[Math.floor((i / FAN) * F.bars.length)] ?? 0
    const hue = era.cycle ? (F.t * 40 + i * 26) % 360 : era.beam
    const intensity = (0.08 + band * 0.4 + F.flash * 0.25 + F.tension * 0.12) * E
    if (intensity < 0.02) continue
    const grad = ctx.createLinearGradient(originX, originY, ex, ey)
    grad.addColorStop(0, `hsla(${hue}, 95%, 60%, ${intensity})`)
    grad.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(originX - 2, originY)
    ctx.lineTo(originX + 2, originY)
    ctx.lineTo(ex + 26, ey)
    ctx.lineTo(ex - 26, ey)
    ctx.closePath()
    ctx.fill()
    if (era.whiteCore) {
      const core = ctx.createLinearGradient(originX, originY, ex, ey)
      core.addColorStop(0, `rgba(255,255,255,${intensity * 0.8})`)
      core.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.moveTo(originX - 1, originY)
      ctx.lineTo(originX + 1, originY)
      ctx.lineTo(ex + 5, ey)
      ctx.lineTo(ex - 5, ey)
      ctx.closePath()
      ctx.fill()
    }
  }

  // blooms
  const bloomA = (0.06 + F.hihats * 0.55 + F.flash * 0.35) * E
  for (const [bx, by, br] of [
    [W * 0.5, apexY - H * 0.02, H * 0.16],
    [W * 0.24, H * 0.2, H * 0.11],
    [W * 0.76, H * 0.2, H * 0.11]
  ] as [number, number, number][]) {
    const bloom = ctx.createRadialGradient(bx, by, 0, bx, by, br * (1 + F.hihats))
    bloom.addColorStop(0, `rgba(255,255,255,${bloomA})`)
    bloom.addColorStop(0.4, `hsla(${era.beam}, 90%, 70%, ${bloomA * 0.5})`)
    bloom.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bloom
    ctx.fillRect(bx - br * 2, by - br * 2, br * 4, br * 4)
  }
  ctx.restore()

  // top LED strips
  for (const sy of [H * 0.045, H * 0.075]) {
    const segs = 30
    const segW = (W * 0.9) / segs
    for (let i = 0; i < segs; i++) {
      const flick = Math.sin(F.t * 5 + i * 1.9 + sy) * 0.5 + 0.5
      ctx.fillStyle = `hsla(${era.strip}, 95%, 62%, ${(0.12 + flick * 0.45 + F.snare * 0.35 + F.flash * 0.2) * E})`
      ctx.fillRect(W * 0.05 + i * segW + 2, sy, segW - 4, 3)
    }
  }

  // inverted lattices
  const rows = 7
  const latTopY = H * 0.1
  const latTipY = stageY - H * 0.03
  const halfTop = W * 0.2
  for (const side of [-1, 1]) {
    const cx = W / 2 + side * W * 0.31
    const key = `${side}:${W.toFixed(0)}x${H.toFixed(0)}`
    let tris = latticeCache.get(key)
    if (!tris) {
      tris = buildInvLattice(cx, latTopY, latTipY, halfTop, rows)
      latticeCache.set(key, tris)
      if (latticeCache.size > 8) latticeCache.clear()
    }
    const [hueTop, hueBottom] = side < 0 ? era.L : era.R
    ctx.lineWidth = 2
    for (const tri of tris) {
      const frac = tri.row / rows
      const hue = lerpHue(hueTop, hueBottom, frac)
      const band =
        F.bars[Math.floor(((tri.col / Math.max(1, rows - tri.row)) * 0.5 + frac * 0.5) * F.bars.length)] ?? 0
      const flick = Math.sin(F.t * 4 + tri.row * 2.1 + tri.col * 3.7) * 0.5 + 0.5
      const lit = (0.26 + band * 0.5 + flick * 0.2 + F.breath * 0.06 + F.flash * 0.35) * E
      ctx.strokeStyle = `hsla(${hue}, 100%, ${55 + lit * 20}%, ${Math.min(1, 0.14 + lit)})`
      ctx.beginPath()
      ctx.moveTo(tri.x1, tri.y1)
      ctx.lineTo(tri.x2, tri.y2)
      ctx.lineTo(tri.x3, tri.y3)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.save()
    const midHue = lerpHue(hueTop, hueBottom, 0.5)
    ctx.shadowColor = `hsla(${midHue}, 100%, 60%, ${0.85 * E})`
    ctx.shadowBlur = 20 + F.kick * 26
    ctx.strokeStyle = era.whiteCore
      ? `rgba(255,255,255,${(0.5 + F.kick * 0.5) * E})`
      : `hsla(${midHue}, 100%, 66%, ${(0.55 + F.kick * 0.45) * E})`
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(cx - halfTop, latTopY)
    ctx.lineTo(cx + halfTop, latTopY)
    ctx.lineTo(cx, latTipY)
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }

  // pyramid
  const glow = 0.35 + F.kick * 0.65
  const screenTop = apexY + (baseY - apexY) * 0.52
  const screenHalfTop = ((screenTop - apexY) / (baseY - apexY)) * baseHalf
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(apexX - screenHalfTop, screenTop)
  ctx.lineTo(apexX + screenHalfTop, screenTop)
  ctx.lineTo(apexX + baseHalf, baseY)
  ctx.lineTo(apexX - baseHalf, baseY)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = '#0a1013'
  ctx.fillRect(apexX - baseHalf, screenTop, baseHalf * 2, baseY - screenTop)
  const gcols = 18
  const grows = 8
  const gw = (baseHalf * 2) / gcols
  const gh = (baseY - screenTop) / grows
  for (let c = 0; c < gcols; c++) {
    for (let r = 0; r < grows; r++) {
      const band = F.bars[Math.floor((c / gcols) * F.bars.length)] ?? 0
      const scan = Math.sin(F.t * 3 - r * 0.8 + c * 0.3) * 0.5 + 0.5
      const v = (0.25 + band * 0.5 + scan * 0.25 + F.flash * 0.2) * E
      ctx.fillStyle = `hsla(${era.screen + Math.sin(c * 0.5 + F.t) * 15}, 85%, ${58 + v * 22}%, ${0.1 + v * 0.75})`
      ctx.fillRect(apexX - baseHalf + c * gw + 1, screenTop + r * gh + 1, gw - 2, gh - 2)
    }
  }
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(apexX, apexY)
  ctx.lineTo(apexX + screenHalfTop, screenTop)
  ctx.lineTo(apexX - screenHalfTop, screenTop)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = '#050505'
  ctx.fillRect(apexX - screenHalfTop, apexY, screenHalfTop * 2, screenTop - apexY)
  for (let i = 0; i < 6; i++) {
    const phase = (i / 6 + F.t * 0.12) % 1
    const y = apexY + phase * (screenTop - apexY)
    ctx.fillStyle = `hsla(${era.edge}, 90%, 75%, ${0.14 * E})`
    ctx.fillRect(apexX - screenHalfTop, y, screenHalfTop * 2, 1.5)
  }
  ctx.restore()

  ctx.save()
  ctx.shadowColor = `hsla(${era.edge}, 100%, 55%, ${glow * E})`
  ctx.shadowBlur = 30 + F.kick * 46
  ctx.strokeStyle = `hsla(${era.edge}, 100%, 58%, ${(0.55 + glow * 0.45) * E + F.flash * 0.25})`
  ctx.lineWidth = 5 + F.kick * 5 * E
  ctx.beginPath()
  ctx.moveTo(apexX, apexY)
  ctx.lineTo(apexX + baseHalf, baseY)
  ctx.lineTo(apexX - baseHalf, baseY)
  ctx.closePath()
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = `rgba(255,255,255,${(0.35 + glow * 0.5) * E + F.flash * 0.3})`
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(apexX, apexY)
  ctx.lineTo(apexX + baseHalf, baseY)
  ctx.lineTo(apexX - baseHalf, baseY)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(apexX - screenHalfTop, screenTop)
  ctx.lineTo(apexX + screenHalfTop, screenTop)
  ctx.stroke()
  ctx.restore()

  const mirrorH = (baseY - apexY) * 0.08
  ctx.fillStyle = `rgba(255,255,255,${(0.25 + F.flash * 0.7) * E})`
  ctx.beginPath()
  ctx.moveTo(apexX, apexY)
  ctx.lineTo(apexX + mirrorH * 0.7, apexY + mirrorH)
  ctx.lineTo(apexX - mirrorH * 0.7, apexY + mirrorH)
  ctx.closePath()
  ctx.fill()

  const consoleY = apexY + (baseY - apexY) * 0.36
  const consoleW = baseHalf * 0.6
  ctx.fillStyle = '#000'
  ctx.fillRect(apexX - consoleW / 2, consoleY, consoleW, 9)
  for (const [dx, color] of [
    [-consoleW * 0.22, `rgba(255,200,80,${0.5 + F.kick * 0.5})`],
    [consoleW * 0.22, `rgba(220,220,235,${0.5 + F.kick * 0.5})`]
  ] as [number, string][]) {
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(apexX + dx, consoleY - 10, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillRect(apexX + dx - 5, consoleY - 12, 10, 3)
  }

  drawFloor(ctx, W, H, stageY, era.beam, F, S, E)
  triggerFloorFx(S, F, W)
  if (F.impactHit) spawnBurst(S, W / 2, originY, 16 + F.impact * 16, era.beam, 1.1)
}

// ---------------------------------------------------------------------------
// 🌌 CYBER ARENA — sci-fi: neon architecture, data columns, holograms
// ---------------------------------------------------------------------------

function drawCyber(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  const P = F.palette
  const stageY = H * 0.82
  const hueA = 190 // cyan
  const hueB = 315 // magenta
  triggerFloorFx(S, F, W)

  // deep gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#02050c')
  bg.addColorStop(1, '#060312')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // perspective neon floor grid receding to a vanishing point
  const vpY = H * 0.44
  ctx.strokeStyle = `hsla(${hueA}, 100%, 55%, ${(0.1 + F.kickTick * 0.2) * E})`
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = -10; i <= 10; i++) {
    const x = W / 2 + i * (W / 12)
    ctx.moveTo(W / 2 + i * 8, vpY)
    ctx.lineTo(x, H)
  }
  for (let i = 1; i <= 12; i++) {
    const p = i / 12
    const scroll = (p + F.t * 0.12 * (1 + F.energy / 80)) % 1
    const y = vpY + scroll * scroll * (H - vpY)
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
  }
  ctx.stroke()

  // holographic data columns rising, driven by the spectrum
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const cols = 24
  for (let i = 0; i < cols; i++) {
    const x = (i / cols) * W + W / cols / 2
    const band = F.bars[Math.floor((i / cols) * F.bars.length)] ?? 0
    const h = (0.08 + band * 0.7) * (vpY - H * 0.06) * E
    const hue = i % 2 === 0 ? hueA : hueB
    const g = ctx.createLinearGradient(x, vpY, x, vpY - h)
    g.addColorStop(0, `hsla(${hue}, 100%, 60%, ${0.5 * E})`)
    g.addColorStop(1, `hsla(${hue}, 100%, 70%, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(x - W / cols / 2 + 1, vpY - h, W / cols - 2, h)
    // scanline segments in the column
    for (let seg = 0; seg < 5; seg++) {
      const sy = vpY - (seg / 5) * h - ((F.t * 40) % (h / 5))
      if (sy < vpY - h) continue
      ctx.fillStyle = `hsla(${hue}, 100%, 85%, ${band * 0.5 * E})`
      ctx.fillRect(x - W / cols / 2 + 1, sy, W / cols - 2, 1.5)
    }
  }
  ctx.restore()

  // central holographic ring stack (breathing + impact expansion)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const ringCx = W / 2
  const ringCy = vpY - H * 0.12
  for (let i = 0; i < 5; i++) {
    const rr = (30 + i * 26) * (1 + F.impact * 0.4) + F.breath * 6
    const hue = lerpHue(hueA, hueB, i / 4)
    ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${(0.14 + F.vocals * 0.4 - i * 0.02) * E})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(ringCx, ringCy, rr, rr * 0.34, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  // hologram figure hint
  ctx.strokeStyle = `hsla(${hueA}, 100%, 70%, ${(0.1 + F.vocals * 0.5) * E})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ringCx, ringCy - 30 - F.vocals * 20)
  ctx.lineTo(ringCx, ringCy + 30)
  ctx.stroke()
  ctx.restore()

  // side neon pillars (backlights personality)
  for (let i = 0; i < F.backs.length; i++) {
    const bk = F.backs[i]
    const x = i < F.backs.length / 2 ? W * 0.06 + i * 20 : W * 0.94 - (F.backs.length - 1 - i) * 20
    const hue = i % 2 === 0 ? hueA : hueB
    ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${(0.15 + bk.intensity * 0.6) * E})`
    ctx.fillRect(x - 2, H * 0.1, 4, stageY - H * 0.1)
  }

  drawLasers(ctx, W, W / 2, ringCy, F, 1.2)
  drawParticles(ctx, S)
  if (F.impactHit) spawnBurst(S, ringCx, ringCy, 14 + F.impact * 16, hueB, 1)
  void P
}

// ---------------------------------------------------------------------------
// 🌲 NATURE PULSE — organic: aurora bands, luminous trees, fireflies
// ---------------------------------------------------------------------------

function drawNature(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  const stageY = H * 0.82
  triggerFloorFx(S, F, W)

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#02100a')
  bg.addColorStop(1, '#050806')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // aurora bands (green/teal/violet), always drifting
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let b = 0; b < 3; b++) {
    const hue = [140, 170, 280][b]
    const baseY = H * (0.2 + b * 0.09)
    ctx.beginPath()
    ctx.moveTo(0, baseY)
    for (let x = 0; x <= W; x += 24) {
      const y =
        baseY +
        Math.sin(x * 0.006 + F.t * (0.3 + b * 0.1)) * 26 * (0.6 + F.vocals * 0.8) +
        Math.sin(x * 0.013 - F.t * 0.4) * 12
      ctx.lineTo(x, y)
    }
    ctx.lineTo(W, 0)
    ctx.lineTo(0, 0)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, baseY - 60, 0, baseY + 30)
    g.addColorStop(0, `hsla(${hue}, 80%, 55%, 0)`)
    g.addColorStop(0.6, `hsla(${hue}, 85%, 55%, ${(0.12 + F.breath * 0.06) * E})`)
    g.addColorStop(1, `hsla(${hue}, 80%, 55%, 0)`)
    ctx.fillStyle = g
    ctx.fill()
  }
  ctx.restore()

  // luminous trees — trunks with glowing canopies pulsing on the beat
  const trees = 6
  for (let i = 0; i < trees; i++) {
    const x = (i + 0.5) * (W / trees)
    const th = H * (0.28 + ((i * 37) % 10) / 60)
    const sway = Math.sin(F.t * 0.6 + i) * 6 * (0.5 + F.sway * 0.5)
    ctx.strokeStyle = `hsla(140, 30%, 30%, ${0.5 * E + 0.1})`
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(x, stageY)
    ctx.quadraticCurveTo(x + sway * 0.5, stageY - th * 0.5, x + sway, stageY - th)
    ctx.stroke()
    // canopy glow
    const band = F.bars[Math.floor((i / trees) * F.bars.length)] ?? 0
    const g = ctx.createRadialGradient(x + sway, stageY - th, 0, x + sway, stageY - th, 40 + band * 40)
    const hue = 90 + i * 20
    g.addColorStop(0, `hsla(${hue}, 90%, 60%, ${(0.3 + band * 0.5) * E})`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.fillRect(x + sway - 80, stageY - th - 80, 160, 160)
  }

  // fireflies drifting (persistent life)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const flies = S.flies
  for (let i = 0; i < flies.length / 3; i++) {
    flies[i * 3] += Math.sin(F.t * 0.5 + flies[i * 3 + 2]) * 0.0006
    flies[i * 3 + 1] += Math.cos(F.t * 0.4 + flies[i * 3 + 2]) * 0.0004
    const x = ((flies[i * 3] % 1) + 1) % 1
    const y = flies[i * 3 + 1]
    const tw = Math.sin(F.t * 2 + i * 1.3) * 0.5 + 0.5
    ctx.fillStyle = `hsla(80, 100%, 70%, ${(0.15 + tw * 0.5) * (0.4 + E)})`
    ctx.fillRect(x * W, y * H, 2.2, 2.2)
  }
  ctx.restore()

  drawFloor(ctx, W, H, stageY, 140, F, S, E)
  drawParticles(ctx, S)
  if (F.impactHit) {
    for (let i = 0; i < trees; i++) {
      spawnBurst(S, (i + 0.5) * (W / trees), stageY - H * 0.3, 4 + F.impact * 6, 90 + i * 20, 0.8)
    }
  }
}

// ---------------------------------------------------------------------------
// 🌃 SYNTHWAVE CITY — retro horizon: striped sun, perspective grid, skyline
// ---------------------------------------------------------------------------

function drawSynthwave(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  const horizon = H * 0.52
  triggerFloorFx(S, F, W)

  // sky gradient (static → cached; rebuilding full-screen gradients every
  // frame was the GPU hog)
  const sky = cachedGradient(ctx, S, W, H, 'sw-sky', (c) => {
    const g = c.createLinearGradient(0, 0, 0, horizon)
    g.addColorStop(0, '#160a2e')
    g.addColorStop(0.6, '#3a1152')
    g.addColorStop(1, '#7a1e63')
    return g
  })
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, horizon)

  // the striped sun
  const sunR = H * 0.22
  const sunX = W / 2
  const sunY = horizon - sunR * 0.35
  ctx.save()
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
  ctx.clip()
  const sun = cachedGradient(ctx, S, W, H, 'sw-sun', (c) => {
    const g = c.createLinearGradient(0, sunY - sunR, 0, sunY + sunR)
    g.addColorStop(0, '#ffd23f')
    g.addColorStop(0.5, '#ff8c42')
    g.addColorStop(1, '#ff2e97')
    return g
  })
  ctx.fillStyle = sun
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2)
  ctx.fillStyle = '#160a2e'
  for (let i = 0; i < 7; i++) {
    const sy = sunY + sunR * 0.15 + i * (sunR * 0.11)
    ctx.fillRect(sunX - sunR, sy, sunR * 2, 2 + i * 0.8)
  }
  ctx.restore()

  // sun glow reacts to vocals (small area, cheap to keep dynamic)
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 2)
  glow.addColorStop(0, `hsla(330, 100%, 60%, ${(0.15 + F.vocals * 0.3) * E})`)
  glow.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = glow
  ctx.fillRect(sunX - sunR * 2, sunY - sunR * 2, sunR * 4, sunR * 4)

  // retro skyline silhouette
  ctx.fillStyle = '#0d0620'
  ctx.beginPath()
  ctx.moveTo(0, horizon)
  for (let i = 0; i < 16; i++) {
    const bw = W / 16
    const bh = (((i * 6547) % 100) / 100) * H * 0.12 + H * 0.03
    ctx.lineTo(i * bw, horizon - bh)
    ctx.lineTo((i + 1) * bw, horizon - bh)
  }
  ctx.lineTo(W, horizon)
  ctx.closePath()
  ctx.fill()
  // neon windows
  ctx.fillStyle = `hsla(190, 100%, 60%, ${(0.3 + F.hihats * 0.5) * E})`
  for (let i = 0; i < 40; i++) {
    const x = (i * 131) % W
    const y = horizon - (((i * 79) % 40) / 40) * H * 0.1 - 4
    if (Math.sin(F.t * 3 + i) > 0.3) ctx.fillRect(x, y, 2, 2)
  }

  // ground fill (static → cached)
  const grid = cachedGradient(ctx, S, W, H, 'sw-ground', (c) => {
    const g = c.createLinearGradient(0, horizon, 0, H)
    g.addColorStop(0, '#1a0833')
    g.addColorStop(1, '#05010f')
    return g
  })
  ctx.fillStyle = grid
  ctx.fillRect(0, horizon, W, H - horizon)

  // perspective neon grid — draw as a SINGLE stroked path (one GPU op) and
  // cap the horizon-crowding lines to avoid massive overdraw near the vanishing line
  ctx.strokeStyle = `hsla(315, 100%, 60%, ${(0.35 + F.kickTick * 0.3) * E})`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = -14; i <= 14; i++) {
    ctx.moveTo(W / 2 + i * 10, horizon)
    ctx.lineTo(W / 2 + i * (W / 8), H)
  }
  for (let i = 1; i <= 12; i++) {
    const p = i / 12
    const scroll = (p + F.t * 0.18 * (1 + F.energy / 90)) % 1
    // bias lines toward the viewer; skip the ones that would pile up in the
    // first couple of pixels below the horizon (invisible but still rasterized)
    const y = horizon + scroll * scroll * (H - horizon)
    if (y - horizon < 3) continue
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
  }
  ctx.stroke()

  drawLasers(ctx, W, W / 2, horizon, F, 1.3)
  drawParticles(ctx, S)
  if (F.impactHit) spawnBurst(S, sunX, sunY, 10 + F.impact * 14, 330, 1)
}

// ---------------------------------------------------------------------------
// 🚀 SPACE ODYSSEY — starfield, nebulae, station, cosmic beams
// ---------------------------------------------------------------------------

function drawSpace(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  S: SceneState,
  E: number
): void {
  ctx.fillStyle = '#01010a'
  ctx.fillRect(0, 0, W, H)

  // nebula clouds (soft, slow)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const [nx, ny, nh] of [
    [0.3, 0.4, 265],
    [0.7, 0.55, 195],
    [0.5, 0.3, 320]
  ] as [number, number, number][]) {
    const g = ctx.createRadialGradient(nx * W, ny * H, 0, nx * W, ny * H, W * 0.35)
    const drift = Math.sin(F.t * 0.1 + nx * 6) * 20
    g.addColorStop(0, `hsla(${nh}, 70%, 50%, ${(0.06 + F.breath * 0.03) * (0.5 + E)})`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.fillRect(nx * W - W * 0.35 + drift, ny * H - W * 0.35, W * 0.7, W * 0.7)
  }
  ctx.restore()

  // warp starfield — speeds up with energy, streaks on impacts
  const stars = S.stars
  const cx = W / 2
  const cy = H * 0.42
  const speed = 0.002 + F.energy / 6000 + F.impact * 0.02
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < stars.length / 3; i++) {
    let z = stars[i * 3 + 2] - speed
    if (z <= 0.02) {
      stars[i * 3] = Math.random()
      stars[i * 3 + 1] = Math.random()
      z = 1
    }
    stars[i * 3 + 2] = z
    const sx = cx + (stars[i * 3] - 0.5) * W / z
    const sy = cy + (stars[i * 3 + 1] - 0.5) * H / z
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue
    const size = (1 - z) * 3 + 0.4
    const bright = (1 - z) * (0.6 + E * 0.4)
    ctx.fillStyle = `hsla(${F.palette.a}, 30%, ${80 + (1 - z) * 20}%, ${bright})`
    // streak on high impact
    if (F.impact > 0.3) {
      const px = cx + (stars[i * 3] - 0.5) * W / (z + speed * 6)
      const py = cy + (stars[i * 3 + 1] - 0.5) * H / (z + speed * 6)
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = size * 0.6
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(sx, sy)
      ctx.stroke()
    } else {
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size)
    }
  }
  ctx.restore()

  // space station ring silhouette with lit windows, slow rotation
  const stationY = H * 0.66
  ctx.save()
  ctx.translate(W / 2, stationY)
  ctx.rotate(Math.sin(F.t * 0.05) * 0.06)
  ctx.strokeStyle = `hsla(${F.palette.a}, 40%, 60%, ${0.4 + E * 0.3})`
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.ellipse(0, 0, W * 0.28, H * 0.05, 0, 0, Math.PI * 2)
  ctx.stroke()
  // lit windows around the ring, twinkle with hi-hats
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const wx = Math.cos(a) * W * 0.28
    const wy = Math.sin(a) * H * 0.05
    const on = Math.sin(F.t * 2 + i) > 0.2 - F.hihats
    ctx.fillStyle = `hsla(190, 100%, 70%, ${on ? 0.4 + F.hihats * 0.4 : 0.06})`
    ctx.fillRect(wx - 1, wy - 1, 2, 2)
  }
  ctx.restore()

  // cosmic beams from the station (the director's lasers)
  drawLasers(ctx, W, W / 2, stationY, F, 1.2)
  drawParticles(ctx, S)
  if (F.impactHit) spawnBurst(S, W / 2, cy, 16 + F.impact * 18, F.palette.b, 1.2)
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type PackId = 'festival' | 'pyramid' | 'cyber' | 'nature' | 'synthwave' | 'space'

export interface ShowPack {
  id: PackId
  name: string
  emoji: string
  blurb: string
  /** Some packs manage their own background; the shell keeps it black. */
  draw: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    F: DirectorFrame,
    S: SceneState,
    E: number
  ) => void
}

export const SHOW_PACKS: ShowPack[] = [
  { id: 'festival', name: 'Festival Mainstage', emoji: '🎧', blurb: 'Tomorrowland · Ultra · EDC', draw: drawFestival },
  { id: 'pyramid', name: 'Pyramid', emoji: '🔺', blurb: 'Daft Punk · Alive', draw: drawPyramid },
  { id: 'cyber', name: 'Cyber Arena', emoji: '🌌', blurb: 'Holograms · neon · sci-fi', draw: drawCyber },
  { id: 'nature', name: 'Nature Pulse', emoji: '🌲', blurb: 'Auroras · trees · fireflies', draw: drawNature },
  { id: 'synthwave', name: 'Synthwave City', emoji: '🌃', blurb: 'Retro neon · 80s sunset', draw: drawSynthwave },
  { id: 'space', name: 'Space Odyssey', emoji: '🚀', blurb: 'Starfield · nebulae · station', draw: drawSpace }
]

export function getPack(id: PackId): ShowPack {
  return SHOW_PACKS.find((p) => p.id === id) ?? SHOW_PACKS[0]
}
