/**
 * 🌌 Cyber Arena — a sci-fi arena: holograms, neon lines, data.
 *
 * Architecture: a corridor of chamfered neon portals receding to a vanishing
 * point, dark walls between them streaming data rain, a glossy deck with a
 * neon grid, and a hexagonal riser in the middle. Behind the DJ a giant
 * holographic screen made of hexagon cells plays VJ scenes (the song's
 * spectrum, radial pulses, scanning bands, a pulsing eye); above the DJ a
 * three-ring hologram spins and tilts; the DJ is itself a hologram, projected
 * from the riser in a cone of light. Drones hover over the crowd with
 * follow-spots, moving heads hang from the first portal and lasers fire from
 * the ring and the walls. Kicks roll pulses down the grid, impacts send a
 * hexagonal shockwave across the deck and glitch the screen.
 *
 * Zero per-frame allocations: every pool lives in CyberState; everything
 * static is painted once into cached layers.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import { drawDJ, type DJStyle } from './dj'
import { drawParticles, spawnBurst, type SceneState } from './packs'
import { airLight, beam, crowd, createLayerCache, glowSprite, isHot, laser, layer, rng, type LayerCache } from './stagekit'

const HUE_A = 190 // cyan
const HUE_B = 315 // magenta
const FRAMES = 7 // portals in the corridor
const HEX_COLS = 26
const HEX_ROWS = 11
const DRONES = 4
const VJ_SCENES = 4
const MAX_WAVES = 6
const MAX_SHOCKS = 4

const DJ_HOLO: DJStyle = { look: 'hologram', deskHalf: 52, decks: true, booth: false }

export interface CyberState {
  cache: LayerCache
  cyan: HTMLCanvasElement | null
  pink: HTMLCanvasElement | null
  vj: number
  vjMix: number
  vjTimer: number
  glitch: number
  tilt: number
  waves: Float32Array // depth of each grid pulse (0 = free)
  waveCursor: number
  shocks: Float32Array // age of each shockwave (<0 = free)
  ringSpin: number
}

export function createCyberState(): CyberState {
  return {
    cache: createLayerCache(),
    cyan: null,
    pink: null,
    vj: 0,
    vjMix: 1,
    vjTimer: 0,
    glitch: 0,
    tilt: 0.5,
    waves: new Float32Array(MAX_WAVES),
    waveCursor: 0,
    shocks: new Float32Array(MAX_SHOCKS).fill(-1),
    ringSpin: 0
  }
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

interface Geo {
  vx: number
  vy: number
  riserY: number // top of the riser
  riserW: number
  screenL: number
  screenR: number
  screenT: number
  screenB: number
  ringX: number
  ringY: number
  ringR: number
  headY: number
  headL: number
  headR: number
}

function geo(W: number, H: number): Geo {
  const f1 = 1 / (1 + 0.55)
  return {
    vx: W / 2,
    vy: H * 0.42,
    riserY: H * 0.635,
    riserW: W * 0.17,
    screenL: W / 2 - W * 0.26,
    screenR: W / 2 + W * 0.26,
    screenT: H * 0.1,
    screenB: H * 0.43,
    ringX: W / 2,
    ringY: H * 0.29,
    ringR: Math.min(W * 0.12, H * 0.2),
    headY: H * 0.42 - H * 0.55 * f1 + H * 0.02,
    headL: W / 2 - W * 0.62 * f1 * 0.85,
    headR: W / 2 + W * 0.62 * f1 * 0.85
  }
}

/** The chamfered outline of portal i (0 = nearest). */
function portal(W: number, H: number, i: number): { hw: number; top: number; bot: number; ch: number; f: number } {
  const f = 1 / (1 + i * 0.55)
  return { hw: W * 0.62 * f, top: H * 0.42 - H * 0.55 * f, bot: H * 0.42 + H * 0.42 * f, ch: W * 0.62 * f * 0.22, f }
}

function portalPath(g: CanvasRenderingContext2D, cx: number, p: { hw: number; top: number; bot: number; ch: number }): void {
  g.moveTo(cx - p.hw + p.ch, p.top)
  g.lineTo(cx + p.hw - p.ch, p.top)
  g.lineTo(cx + p.hw, p.top + p.ch)
  g.lineTo(cx + p.hw, p.bot)
  g.lineTo(cx - p.hw, p.bot)
  g.lineTo(cx - p.hw, p.top + p.ch)
  g.closePath()
}

/** Hexagonal riser top face. */
function riserPath(g: CanvasRenderingContext2D, cx: number, y: number, w: number, d: number): void {
  g.moveTo(cx - w, y)
  g.lineTo(cx - w * 0.55, y - d)
  g.lineTo(cx + w * 0.55, y - d)
  g.lineTo(cx + w, y)
  g.lineTo(cx + w * 0.55, y + d)
  g.lineTo(cx - w * 0.55, y + d)
  g.closePath()
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintArena(g: CanvasRenderingContext2D, W: number, H: number): void {
  const G = geo(W, H)
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#02040c')
  bg.addColorStop(0.5, '#05061a')
  bg.addColorStop(1, '#070312')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // far glow at the end of the corridor
  const end = g.createRadialGradient(G.vx, G.vy, 0, G.vx, G.vy, W * 0.3)
  end.addColorStop(0, 'rgba(60,40,140,0.35)')
  end.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = end
  g.fillRect(0, 0, W, H)

  // walls, ceiling and floor between the portals (far to near)
  for (let i = FRAMES - 1; i >= 1; i--) {
    const a = portal(W, H, i)
    const b = portal(W, H, i - 1)
    const shade = 8 + (FRAMES - i) * 2
    // side walls
    for (const s of [-1, 1]) {
      g.fillStyle = `rgb(${shade},${shade + 2},${shade + 12})`
      g.beginPath()
      g.moveTo(G.vx + s * a.hw, a.top + a.ch)
      g.lineTo(G.vx + s * b.hw, b.top + b.ch)
      g.lineTo(G.vx + s * b.hw, b.bot)
      g.lineTo(G.vx + s * a.hw, a.bot)
      g.closePath()
      g.fill()
      // thin light strips along the wall
      g.strokeStyle = 'rgba(120,160,255,0.06)'
      g.lineWidth = 1
      for (let k = 1; k < 5; k++) {
        const u = k / 5
        g.beginPath()
        g.moveTo(G.vx + s * a.hw, a.top + a.ch + (a.bot - a.top - a.ch) * u)
        g.lineTo(G.vx + s * b.hw, b.top + b.ch + (b.bot - b.top - b.ch) * u)
        g.stroke()
      }
    }
    // ceiling
    g.fillStyle = `rgb(${shade - 3},${shade - 2},${shade + 6})`
    g.beginPath()
    g.moveTo(G.vx - a.hw + a.ch, a.top)
    g.lineTo(G.vx + a.hw - a.ch, a.top)
    g.lineTo(G.vx + b.hw - b.ch, b.top)
    g.lineTo(G.vx - b.hw + b.ch, b.top)
    g.closePath()
    g.fill()
  }
  // the deck: glossy black with a cool sheen
  const deck = g.createLinearGradient(0, G.vy, 0, H)
  deck.addColorStop(0, '#0a0b1c')
  deck.addColorStop(1, '#020208')
  g.fillStyle = deck
  const p0 = portal(W, H, 0)
  const pf = portal(W, H, FRAMES - 1)
  g.beginPath()
  g.moveTo(G.vx - pf.hw, pf.bot)
  g.lineTo(G.vx + pf.hw, pf.bot)
  g.lineTo(G.vx + p0.hw, p0.bot)
  g.lineTo(W + 10, H + 10)
  g.lineTo(-10, H + 10)
  g.lineTo(G.vx - p0.hw, p0.bot)
  g.closePath()
  g.fill()
  // portal structures (far to near): dark beams
  for (let i = FRAMES - 1; i >= 0; i--) {
    const p = portal(W, H, i)
    g.strokeStyle = `rgb(${14 + i},${16 + i},${30 + i * 2})`
    g.lineWidth = Math.max(3, 18 * p.f * (H / 700))
    g.beginPath()
    portalPath(g, G.vx, p)
    g.stroke()
  }
  // the hexagonal riser
  const rw = G.riserW
  const rd = rw * 0.16
  g.fillStyle = '#0b0c1a'
  g.beginPath()
  g.moveTo(G.vx - rw, G.riserY)
  g.lineTo(G.vx - rw * 0.55, G.riserY + rd)
  g.lineTo(G.vx - rw * 0.55, G.riserY + rd + H * 0.045)
  g.lineTo(G.vx - rw, G.riserY + H * 0.045)
  g.closePath()
  g.fill()
  g.beginPath()
  g.moveTo(G.vx + rw, G.riserY)
  g.lineTo(G.vx + rw * 0.55, G.riserY + rd)
  g.lineTo(G.vx + rw * 0.55, G.riserY + rd + H * 0.045)
  g.lineTo(G.vx + rw, G.riserY + H * 0.045)
  g.closePath()
  g.fill()
  g.fillStyle = '#0e1024'
  g.fillRect(G.vx - rw * 0.55, G.riserY + rd, rw * 1.1, H * 0.045)
  g.fillStyle = '#121430'
  g.beginPath()
  riserPath(g, G.vx, G.riserY, rw, rd)
  g.fill()
}

/** Every neon tube in the arena (drawn additively, pulsing with the show). */
function paintNeon(g: CanvasRenderingContext2D, W: number, H: number): void {
  const G = geo(W, H)
  const tube = (path: () => void, hue: number, w: number): void => {
    g.save()
    g.shadowColor = `hsla(${hue},100%,60%,1)`
    g.shadowBlur = 10
    g.strokeStyle = `hsla(${hue},100%,62%,0.9)`
    g.lineWidth = w
    g.beginPath()
    path()
    g.stroke()
    g.restore()
    g.strokeStyle = `hsla(${hue},100%,88%,0.9)`
    g.lineWidth = Math.max(0.8, w * 0.35)
    g.beginPath()
    path()
    g.stroke()
  }
  // portal edges, alternating cyan / magenta
  for (let i = FRAMES - 1; i >= 0; i--) {
    const p = portal(W, H, i)
    const inner = { hw: p.hw * 0.965, top: p.top + p.hw * 0.035, bot: p.bot, ch: p.ch * 0.95 }
    tube(() => portalPath(g, G.vx, inner), i % 2 ? HUE_B : HUE_A, Math.max(1.2, 3.2 * p.f))
  }
  // floor grid: lines to the vanishing point and depth lines under each portal
  g.strokeStyle = `hsla(${HUE_A},100%,60%,0.22)`
  g.lineWidth = 1
  const p0 = portal(W, H, 0)
  g.beginPath()
  for (let k = -12; k <= 12; k++) {
    g.moveTo(G.vx + k * 6, G.vy + 8)
    g.lineTo(G.vx + (k / 12) * p0.hw * 1.6, H + 4)
  }
  for (let i = 0; i < FRAMES; i++) {
    const p = portal(W, H, i)
    g.moveTo(G.vx - p.hw, p.bot)
    g.lineTo(G.vx + p.hw, p.bot)
  }
  g.stroke()
  // the riser's edges
  const rw = G.riserW
  const rd = rw * 0.16
  tube(() => riserPath(g, G.vx, G.riserY, rw, rd), HUE_A, 2)
  tube(() => {
    g.moveTo(G.vx - rw * 0.55, G.riserY + rd + H * 0.045)
    g.lineTo(G.vx + rw * 0.55, G.riserY + rd + H * 0.045)
  }, HUE_B, 1.6)
  // the screen frame
  tube(() => g.rect(G.screenL - 6, G.screenT - 6, G.screenR - G.screenL + 12, G.screenB - G.screenT + 12), HUE_B, 1.4)
}

// ---------------------------------------------------------------------------
// live parts
// ---------------------------------------------------------------------------

const HEX = new Path2D()
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6
  if (i === 0) HEX.moveTo(Math.cos(a), Math.sin(a))
  else HEX.lineTo(Math.cos(a), Math.sin(a))
}
HEX.closePath()

/** One VJ scene's brightness for a cell (u, v in 0..1, v = 0 at the top). */
function vjValue(scene: number, u: number, v: number, F: DirectorFrame): number {
  const t = F.t
  if (scene === 0) {
    // the song's spectrum, mirrored from the centre
    const b = F.bars[Math.min(F.bars.length - 1, Math.floor(Math.abs(u - 0.5) * 2 * F.bars.length))] ?? 0
    return 1 - v < b * 1.05 ? 0.35 + (1 - v) * 0.65 : 0.04
  }
  if (scene === 1) {
    // rings radiating from the centre on the beat
    const d = Math.hypot((u - 0.5) * 2.2, v - 0.5)
    return Math.max(0, Math.sin(d * 14 - t * 5 - F.kickTick * 2)) * (0.3 + F.energy / 140)
  }
  if (scene === 2) {
    // diagonal scanning bands
    const s = Math.sin((u * 3 + v * 1.4) * 4 - t * 3)
    return s > 0.6 ? 0.9 : s > 0.2 ? 0.25 : 0.03
  }
  // an eye that opens with the vocals and pulses on the kick
  const dx = (u - 0.5) * 2.4
  const dy = (v - 0.5) * 2
  const open = 0.25 + F.vocals * 0.5
  const lid = Math.abs(dy) < open * (1 - dx * dx) ? 1 : 0
  const iris = Math.hypot(dx, dy) < 0.32 + F.kickTick * 0.1 ? 1 : 0
  const pupil = Math.hypot(dx, dy) < 0.12 ? 1 : 0
  return lid ? (pupil ? 0.05 : iris ? 1 : 0.35) : Math.hypot(dx, dy) < 1.05 && Math.hypot(dx, dy) > 0.98 ? 0.6 : 0.02
}

function drawScreen(ctx: CanvasRenderingContext2D, G: Geo, F: DirectorFrame, cs: CyberState, E: number, dx: number, hueShift: number, alpha: number): void {
  const cw = (G.screenR - G.screenL) / HEX_COLS
  const ch = (G.screenB - G.screenT) / HEX_ROWS
  const r = Math.min(cw * 0.58, ch * 0.66)
  const prev = (cs.vj + VJ_SCENES - 1) % VJ_SCENES
  for (let row = 0; row < HEX_ROWS; row++)
    for (let col = 0; col < HEX_COLS; col++) {
      const u = (col + 0.5) / HEX_COLS
      const v = (row + 0.5) / HEX_ROWS
      let val = vjValue(cs.vj, u, v, F)
      if (cs.vjMix < 1) val = val * cs.vjMix + vjValue(prev, u, v, F) * (1 - cs.vjMix)
      val *= 0.25 + E * 0.75
      if (val < 0.04) continue
      const hue = (HUE_A + (HUE_B - HUE_A) * u + hueShift + 360) % 360
      const x = G.screenL + (col + 0.5 + (row % 2) * 0.5) * cw + dx
      if (x > G.screenR + dx) continue
      const y = G.screenT + (row + 0.5) * ch
      ctx.fillStyle = `hsla(${hue}, 100%, ${45 + val * 30}%, ${Math.min(1, val) * alpha})`
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(r, r)
      ctx.fill(HEX)
      ctx.restore()
    }
}

function drawRing(ctx: CanvasRenderingContext2D, G: Geo, F: DirectorFrame, cs: CyberState, E: number): void {
  const R = G.ringR * (1 + F.impact * 0.35) + F.breath * 4
  for (let ring = 0; ring < 3; ring++) {
    const rr = R * (1 - ring * 0.18)
    const tilt = 0.28 + ring * 0.08 + Math.sin(F.t * 0.4 + ring) * 0.06
    const spin = cs.ringSpin * (ring % 2 ? -1 : 1) * (1 + ring * 0.3)
    ctx.save()
    ctx.translate(G.ringX, G.ringY)
    ctx.rotate(F.sway * 0.05 + (ring - 1) * 0.12)
    ctx.scale(1, tilt)
    const segs = 28
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + spin
      const band = F.bars[(s + ring * 7) % F.bars.length] ?? 0
      const a = (0.18 + band * 0.7 + F.vocals * 0.2) * (0.3 + E * 0.7)
      const hue = ring === 1 ? HUE_B : HUE_A
      ctx.strokeStyle = `hsla(${hue}, 100%, ${60 + band * 25}%, ${a})`
      ctx.lineWidth = 2.4 / tilt
      ctx.beginPath()
      ctx.arc(0, 0, rr, a0, a0 + (Math.PI * 2) / segs - 0.06)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawDrone(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number, i: number): void {
  ctx.fillStyle = '#0c0d18'
  ctx.beginPath()
  ctx.ellipse(x, y, 9 * k, 3.5 * k, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#0c0d18'
  ctx.lineWidth = 1.5 * k
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(x + s * 6 * k, y)
    ctx.lineTo(x + s * 13 * k, y - 3 * k)
    ctx.stroke()
    // spinning rotors (a blur ellipse)
    ctx.fillStyle = 'rgba(160,190,255,0.12)'
    ctx.beginPath()
    ctx.ellipse(x + s * 13 * k, y - 3.5 * k, 6 * k, 1.2 * k, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // nav lights
  const on = Math.sin(t * 4 + i * 1.7) > 0.3
  ctx.fillStyle = on ? 'rgba(255,60,80,0.95)' : 'rgba(255,60,80,0.2)'
  ctx.fillRect(x - 10 * k, y - 1, 2, 2)
  ctx.fillStyle = on ? 'rgba(60,255,140,0.2)' : 'rgba(60,255,140,0.95)'
  ctx.fillRect(x + 8 * k, y - 1, 2, 2)
}

function drawDataRain(ctx: CanvasRenderingContext2D, W: number, H: number, F: DirectorFrame, E: number): void {
  const cols = 9
  for (const side of [-1, 1]) {
    for (let c = 0; c < cols; c++) {
      const u = c / cols
      // columns sit on the first wall segment, in perspective
      const x = side < 0 ? W * (0.015 + u * 0.13) : W * (0.985 - u * 0.13)
      const top = H * (0.1 + u * 0.12)
      const bot = H * (0.72 - u * 0.1)
      const len = bot - top
      const speed = 40 + ((c * 37) % 50)
      const head = (F.t * speed + c * 97) % (len + 60)
      const sz = (1 - u * 0.5) * (H / 700)
      for (let d = 0; d < 9; d++) {
        const y = top + head - d * 11 * sz * 1.4
        if (y < top || y > bot) continue
        const a = (1 - d / 9) * (0.12 + F.hihats * 0.5) * (0.4 + E * 0.6)
        ctx.fillStyle = d === 0 ? `rgba(200,255,240,${a * 1.5})` : `hsla(${170 + (c % 3) * 10}, 100%, 60%, ${a})`
        const gw = (3 + ((c + d) % 3) * 2) * sz
        ctx.fillRect(x - gw / 2, y, gw, 7 * sz)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// the pack
// ---------------------------------------------------------------------------

export function drawCyber(ctx: CanvasRenderingContext2D, W: number, H: number, F: DirectorFrame, S: SceneState, E: number): void {
  const cs = S.cyber
  const G = geo(W, H)
  const k = H / 600
  const t = F.t
  const hot = isHot(F)
  if (!cs.cyan) {
    cs.cyan = glowSprite('80,230,255')
    cs.pink = glowSprite('255,80,220')
  }

  // narrative: VJ scenes change every few bars (and right away on a drop)
  cs.vjTimer += 1 / 60
  if ((cs.vjTimer > 9 && F.beatTick) || (F.stateJustChanged && F.state === 'drop')) {
    cs.vj = (cs.vj + 1) % VJ_SCENES
    cs.vjMix = 0
    cs.vjTimer = 0
  }
  cs.vjMix = Math.min(1, cs.vjMix + 1 / 40)
  cs.tilt += ((hot ? 0 : F.state === 'build' ? 1 : 0.55) - cs.tilt) * 0.03
  cs.ringSpin += (0.004 + F.energy / 9000 + F.laserBoost * 0.01) * (1 + (hot ? 1 : 0))
  if (F.impactLevel >= 4) cs.glitch = 1
  cs.glitch = Math.max(0, cs.glitch - 1 / 18)
  if (F.beatTick && E > 0.15) {
    cs.waves[cs.waveCursor] = 1
    cs.waveCursor = (cs.waveCursor + 1) % MAX_WAVES
  }
  if (F.impactHit) {
    for (let i = 0; i < MAX_SHOCKS; i++)
      if (cs.shocks[i] < 0) {
        cs.shocks[i] = 0
        break
      }
  }

  // --- the arena -----------------------------------------------------------
  ctx.drawImage(layer(cs.cache, 'arena', W, H, (g) => paintArena(g, W, H)), 0, 0, W, H)
  const lit = airLight(F)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // the neon architecture, breathing with the backlights and the kick
  let backs = 0
  for (let i = 0; i < F.backs.length; i++) backs += F.backs[i].intensity
  backs /= Math.max(1, F.backs.length)
  ctx.globalAlpha = Math.min(1, 0.55 + backs * 0.35 + F.kickTick * 0.25 + F.flash * 0.3)
  ctx.drawImage(layer(cs.cache, 'neon', W, H, (g) => paintNeon(g, W, H)), 0, 0, W, H)
  ctx.globalAlpha = 1

  // data rain on the near walls
  drawDataRain(ctx, W, H, F, E)

  // the holographic screen (with an RGB split while it glitches), on a dark backing
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(3,4,14,0.9)'
  ctx.fillRect(G.screenL - 4, G.screenT - 4, G.screenR - G.screenL + 8, G.screenB - G.screenT + 8)
  ctx.globalCompositeOperation = 'lighter'
  if (cs.glitch > 0.02) {
    const off = cs.glitch * 10 * k
    drawScreen(ctx, G, F, cs, E, -off, -30, 0.45)
    drawScreen(ctx, G, F, cs, E, off, 40, 0.45)
  } else drawScreen(ctx, G, F, cs, E, 0, 0, 0.85)

  // pulses rolling down the floor grid toward us
  for (let i = 0; i < MAX_WAVES; i++) {
    const w = cs.waves[i]
    if (w <= 0) continue
    cs.waves[i] = w - 0.018
    // w runs 1 (at the far end) → 0 (at our feet), in perspective
    const persp = 1 / (1 + w * 6)
    const y = G.vy + 8 + (H - G.vy - 8) * persp
    const hw = W * 0.62 * 1.6 * persp
    ctx.strokeStyle = `hsla(${HUE_A}, 100%, 70%, ${(1 - w) * 0.6 * E})`
    ctx.lineWidth = 1 + persp * 2
    ctx.beginPath()
    ctx.moveTo(G.vx - hw, y)
    ctx.lineTo(G.vx + hw, y)
    ctx.stroke()
  }
  // hexagonal shockwaves across the deck
  for (let i = 0; i < MAX_SHOCKS; i++) {
    const a = cs.shocks[i]
    if (a < 0) continue
    cs.shocks[i] = a + 1 / 60
    if (a > 1.4) {
      cs.shocks[i] = -1
      continue
    }
    const rw = G.riserW * (1 + a * 4)
    ctx.strokeStyle = `hsla(${HUE_B}, 100%, 66%, ${(1 - a / 1.4) * 0.7})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    riserPath(ctx, G.vx, G.riserY + H * 0.03 + a * H * 0.12, rw, rw * 0.16)
    ctx.stroke()
  }

  // projection cone from the riser up to the hologram
  const cone = ctx.createLinearGradient(0, G.riserY, 0, G.ringY - G.ringR * 0.3)
  cone.addColorStop(0, `hsla(${HUE_A}, 100%, 65%, ${(0.12 + F.vocals * 0.2) * (0.4 + E * 0.6)})`)
  cone.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = cone
  ctx.beginPath()
  ctx.moveTo(G.vx - G.riserW * 0.35, G.riserY)
  ctx.lineTo(G.vx + G.riserW * 0.35, G.riserY)
  ctx.lineTo(G.vx + G.ringR * 1.1, G.ringY - G.ringR * 0.3)
  ctx.lineTo(G.vx - G.ringR * 1.1, G.ringY - G.ringR * 0.3)
  ctx.closePath()
  ctx.fill()

  // the three-ring hologram
  drawRing(ctx, G, F, cs, E)
  ctx.restore()

  // the holographic DJ on the riser
  drawDJ(ctx, S.djs[0], G.vx, G.riserY - 6 * k, H / 560, HUE_A, DJ_HOLO, F, E)

  // --- light ----------------------------------------------------------------
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // moving heads on the first portal: aerial fans on builds, into the crowd on drops
  const n = F.beams.length
  for (let i = 0; i < n; i++) {
    const fb = F.beams[i]
    const x = G.headL + (i / Math.max(1, n - 1)) * (G.headR - G.headL)
    const downX = W / 2 + fb.aim * W * 0.8
    const upX = W / 2 + fb.aim * W * 1.1
    const tx = downX + (upX - downX) * cs.tilt
    const ty = H * 1.05 + (-H * 0.3 - H * 1.05) * cs.tilt
    const hue = i % 2 ? HUE_B : (HUE_A + fb.hueOffset * 0.3) % 360
    beam(ctx, x, G.headY, tx, ty, hue, 95, 62 + F.flash * 20, fb.intensity * (0.5 + E * 0.5), hot ? 0.04 : 0.07)
  }
  // drones with follow-spots on the DJ
  for (let i = 0; i < DRONES; i++) {
    const dx = W * (0.2 + 0.6 * ((i + 0.5) / DRONES)) + Math.sin(t * 0.3 + i * 1.9) * W * 0.05
    const dy = H * (0.17 + 0.04 * Math.sin(t * 0.5 + i * 2))
    const sp = F.spots[i % F.spots.length]
    beam(ctx, dx, dy, G.vx + sp.aim * W * 0.06, G.riserY - 20 * k, 200, 30, 85, sp.intensity * 0.5, 0.05)
  }
  // lasers: from the hologram and from both walls
  const len = Math.max(W, H) * 1.4
  for (let i = 0; i < F.lasers.length; i++) {
    const lz = F.lasers[i]
    const side = i % 3
    if (side === 0) laser(ctx, G.ringX, G.ringY, -Math.PI / 2 + lz.angle + Math.PI, len, lz.hue, lz.intensity, 1.1)
    else {
      const ox = side === 1 ? W * 0.03 : W * 0.97
      const a = side === 1 ? -0.25 + lz.angle * 0.6 : Math.PI + 0.25 + lz.angle * 0.6
      laser(ctx, ox, H * 0.38, a, len, lz.hue, lz.intensity * 0.8, 1)
    }
  }
  // the air glows a little with all that light
  if (lit > 0.05) {
    ctx.globalAlpha = Math.min(0.5, lit * 0.25)
    ctx.drawImage(cs.cyan!, -W * 0.1, H * 0.1, W * 0.6, H * 0.7)
    ctx.drawImage(cs.pink!, W * 0.5, H * 0.1, W * 0.6, H * 0.7)
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // drones over the light
  for (let i = 0; i < DRONES; i++) {
    const dx = W * (0.2 + 0.6 * ((i + 0.5) / DRONES)) + Math.sin(t * 0.3 + i * 1.9) * W * 0.05
    const dy = H * (0.17 + 0.04 * Math.sin(t * 0.5 + i * 2))
    drawDrone(ctx, dx, dy, k, t, i)
  }

  // the crowd, wristbands glowing cyan and magenta
  crowd(ctx, W, H, F, E, {
    fill: 'rgba(2,2,8,0.96)',
    top: H * 0.12,
    heads: 28,
    light: (x, y, i) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.5 + F.kickTick * 0.5
      const s = 9 * k
      ctx.drawImage(i % 2 ? cs.pink! : cs.cyan!, x - s, y - s, s * 2, s * 2)
      ctx.restore()
    }
  })

  drawParticles(ctx, S)
  if (F.impactHit) spawnBurst(S, G.ringX, G.ringY, 14 + F.impact * 16, HUE_B, 1)
}
