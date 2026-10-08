/**
 * 🌲 Nature Pulse — a festival in a forest clearing at night.
 *
 * Under a starry sky the aurora hangs in curtains of rays (they ripple with
 * the vocals and the spectrum) and is mirrored in a still lake below the
 * mountains. Tall pines frame the scene. The stage is a living arch: two
 * giant trees whose trunks curve and meet over the DJ, roots gripping a
 * mossy stone platform. Vines hang from the arch carrying glowing flowers
 * that light up with the spectrum like an equalizer; bioluminescent
 * mushrooms along the front pulse on the kick. Light falls through the mist
 * in god rays from the arch, green lasers thread between the trunks,
 * fireflies drift everywhere, and every impact releases a swirl of glowing
 * spores. The crowd holds up lanterns.
 *
 * Zero per-frame allocations: pools live in NatureState; everything static
 * is painted once into cached layers.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import { drawDJ, type DJStyle } from './dj'
import { drawParticles, spawnBurst, type SceneState } from './packs'
import { airLight, beam, crowd, createLayerCache, glowSprite, isHot, laser, layer, rng, type LayerCache } from './stagekit'

const AW = 320 // aurora buffer
const AH = 120
const FLIES = 110
const FF = 5 // x, y, phase, vx, vy (fractions of W/H)
const VINES = 9
const BULBS = 5
const SHROOMS = 16

const DJ_FOREST: DJStyle = { look: 'human', deskHalf: 50, decks: true, booth: false }

export interface NatureState {
  cache: LayerCache
  aurora: HTMLCanvasElement | null
  rays: HTMLCanvasElement[]
  green: HTMLCanvasElement | null
  gold: HTMLCanvasElement | null
  teal: HTMLCanvasElement | null
  mist: HTMLCanvasElement | null
  flies: Float32Array
  swirl: number
  tilt: number
  shrooms: Float32Array // x, y, size (fractions)
}

export function createNatureState(): NatureState {
  const flies = new Float32Array(FLIES * FF)
  const r = rng(12)
  for (let i = 0; i < FLIES; i++) {
    flies[i * FF] = r()
    flies[i * FF + 1] = 0.35 + r() * 0.55
    flies[i * FF + 2] = r() * Math.PI * 2
  }
  const shrooms = new Float32Array(SHROOMS * 3)
  for (let i = 0; i < SHROOMS; i++) {
    const side = i % 2 ? 1 : -1
    shrooms[i * 3] = 0.5 + side * (0.1 + r() * 0.18)
    shrooms[i * 3 + 1] = 0.745 + r() * 0.03
    shrooms[i * 3 + 2] = 0.5 + r() * 0.8
  }
  return { cache: createLayerCache(), aurora: null, rays: [], green: null, gold: null, teal: null, mist: null, flies, swirl: 0, tilt: 0.4, shrooms }
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

const HORIZON = 0.5 // treeline / mountain base
const LAKE_T = 0.505
const LAKE_B = 0.64
const STAGE_Y = 0.74 // top of the stone platform
const ARCH_TOP = 0.13

/** A point on the left trunk's centre line (u = 0 at the root, 1 at the crown). */
function trunk(W: number, H: number, u: number, side: number): [number, number] {
  const bx = W * (0.5 - 0.2 * side)
  const by = H * (STAGE_Y + 0.02)
  const cx = W * (0.5 - 0.25 * side)
  const cy = H * 0.3
  const tx = W * 0.5 - side * W * 0.015
  const ty = H * ARCH_TOP
  const v = 1 - u
  return [v * v * bx + 2 * v * u * cx + u * u * tx, v * v * by + 2 * v * u * cy + u * u * ty]
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function pine(g: CanvasRenderingContext2D, x: number, base: number, h: number, w: number, r: () => number): void {
  g.beginPath()
  g.moveTo(x, base - h)
  const tiers = 7
  for (let i = 1; i <= tiers; i++) {
    const y = base - h + (h * 0.92 * i) / tiers
    const ww = w * (0.25 + (0.75 * i) / tiers) * (0.9 + r() * 0.2)
    g.lineTo(x + ww, y)
    g.lineTo(x + ww * 0.45, y - h * 0.03)
  }
  for (let i = tiers; i >= 1; i--) {
    const y = base - h + (h * 0.92 * i) / tiers
    const ww = w * (0.25 + (0.75 * i) / tiers) * (0.9 + r() * 0.2)
    g.lineTo(x - ww * 0.45, y - h * 0.03)
    g.lineTo(x - ww, y)
  }
  g.closePath()
  g.fill()
  g.fillRect(x - w * 0.05, base - h * 0.08, w * 0.1, h * 0.08)
}

function paintSky(g: CanvasRenderingContext2D, W: number, H: number): void {
  const r = rng(3)
  const sky = g.createLinearGradient(0, 0, 0, H * HORIZON)
  sky.addColorStop(0, '#020812')
  sky.addColorStop(0.6, '#04121c')
  sky.addColorStop(1, '#0a1f24')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H * HORIZON + 2)
  for (let i = 0; i < 260; i++) {
    const b = Math.pow(r(), 3)
    g.fillStyle = `rgba(230,240,255,${0.15 + b * 0.75})`
    const s = b > 0.7 ? 1.8 : 1
    g.fillRect(r() * W, Math.pow(r(), 1.3) * H * HORIZON * 0.95, s, s)
  }
  // a crescent moon
  const mx = W * 0.16
  const my = H * 0.11
  const mr = H * 0.028
  const halo = g.createRadialGradient(mx, my, 0, mx, my, mr * 6)
  halo.addColorStop(0, 'rgba(220,235,255,0.18)')
  halo.addColorStop(1, 'rgba(220,235,255,0)')
  g.fillStyle = halo
  g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12)
  g.fillStyle = '#e8f0ff'
  g.beginPath()
  g.arc(mx, my, mr, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.arc(mx + mr * 0.45, my - mr * 0.15, mr * 0.9, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'source-over'
  // mountains
  for (let row = 0; row < 2; row++) {
    g.fillStyle = row === 0 ? '#0b1a22' : '#08141a'
    g.beginPath()
    g.moveTo(-10, H * HORIZON + 4)
    let y = H * (HORIZON - 0.12 + row * 0.05)
    for (let x = -10; x <= W + 30; x += W / 26) {
      y += (r() - 0.5) * H * 0.05
      y = Math.max(H * (HORIZON - 0.2 + row * 0.06), Math.min(H * (HORIZON - 0.03), y))
      g.lineTo(x, y)
    }
    g.lineTo(W + 30, H * HORIZON + 4)
    g.closePath()
    g.fill()
  }
}

function paintLand(g: CanvasRenderingContext2D, W: number, H: number): void {
  const r = rng(29)
  // far treeline along the shore
  g.fillStyle = '#050d0f'
  for (let x = -10; x < W + 10; x += 5 + r() * 9) pine(g, x, H * (HORIZON + 0.012), H * (0.03 + r() * 0.05), H * 0.014, r)
  // the lake
  const lake = g.createLinearGradient(0, H * LAKE_T, 0, H * LAKE_B)
  lake.addColorStop(0, '#071a20')
  lake.addColorStop(1, '#030b0e')
  g.fillStyle = lake
  g.fillRect(0, H * LAKE_T, W, H * (LAKE_B - LAKE_T))
  g.strokeStyle = 'rgba(160,220,230,0.06)'
  g.lineWidth = 1
  for (let i = 0; i < 40; i++) {
    const y = H * (LAKE_T + r() * (LAKE_B - LAKE_T))
    const x = r() * W
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 20 + r() * 80, y)
    g.stroke()
  }
  // the clearing
  const ground = g.createLinearGradient(0, H * LAKE_B, 0, H)
  ground.addColorStop(0, '#071008')
  ground.addColorStop(1, '#020502')
  g.fillStyle = ground
  g.beginPath()
  g.moveTo(-10, H * LAKE_B + 6)
  for (let x = -10; x <= W + 20; x += 30) g.lineTo(x, H * LAKE_B + Math.sin(x * 0.02) * 4 - 2)
  g.lineTo(W + 20, H + 10)
  g.lineTo(-10, H + 10)
  g.closePath()
  g.fill()
  // tall pines framing both sides
  g.fillStyle = '#020604'
  pine(g, W * 0.04, H * 0.98, H * 0.95, W * 0.07, r)
  pine(g, W * 0.13, H * 0.9, H * 0.72, W * 0.05, r)
  pine(g, W * 0.21, H * 0.82, H * 0.5, W * 0.035, r)
  pine(g, W * 0.96, H * 0.98, H * 0.92, W * 0.07, r)
  pine(g, W * 0.87, H * 0.9, H * 0.7, W * 0.05, r)
  pine(g, W * 0.79, H * 0.82, H * 0.48, W * 0.035, r)

  // the stone platform, mossy
  const px = W / 2
  const pw = W * 0.2
  const py = H * STAGE_Y
  g.fillStyle = '#0b120c'
  g.beginPath()
  g.ellipse(px, py + H * 0.03, pw, H * 0.035, 0, 0, Math.PI)
  g.lineTo(px - pw, py)
  g.ellipse(px, py, pw, H * 0.03, 0, Math.PI, 0, true)
  g.closePath()
  g.fill()
  g.fillStyle = '#132016'
  g.beginPath()
  g.ellipse(px, py, pw, H * 0.03, 0, 0, Math.PI * 2)
  g.fill()

  // the living arch: two trunks meeting over the DJ
  for (const side of [-1, 1]) {
    // roots
    g.fillStyle = '#060a06'
    for (let k = 0; k < 4; k++) {
      const [rx, ry] = trunk(W, H, 0.02, side)
      g.beginPath()
      g.moveTo(rx - W * 0.02, ry - H * 0.02)
      g.quadraticCurveTo(rx + side * W * (0.01 + k * 0.02) * (k % 2 ? 1 : -1), ry + H * 0.01, rx + (k - 1.5) * W * 0.025, ry + H * 0.03)
      g.lineTo(rx + W * 0.02, ry - H * 0.02)
      g.fill()
    }
    // the trunk, tapering
    const N = 40
    g.beginPath()
    for (let i = 0; i <= N; i++) {
      const u = i / N
      const [x, y] = trunk(W, H, u, side)
      const w = W * (0.042 - u * 0.026)
      if (i === 0) g.moveTo(x - w, y)
      else g.lineTo(x - w, y)
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N
      const [x, y] = trunk(W, H, u, side)
      const w = W * (0.042 - u * 0.026)
      g.lineTo(x + w, y)
    }
    g.closePath()
    const bark = g.createLinearGradient(0, H * ARCH_TOP, 0, H * STAGE_Y)
    bark.addColorStop(0, '#16221b')
    bark.addColorStop(1, '#0c140e')
    g.fillStyle = bark
    g.fill()
    // bark lines and a green rim of moss
    g.save()
    g.clip()
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 1
    for (let i = 0; i < 26; i++) {
      const u = r() * 0.9
      const [x, y] = trunk(W, H, u, side)
      g.beginPath()
      g.moveTo(x + (r() - 0.5) * W * 0.04, y)
      g.lineTo(x + (r() - 0.5) * W * 0.04, y - H * 0.06)
      g.stroke()
    }
    g.restore()
    g.strokeStyle = 'rgba(110,220,140,0.3)'
    g.lineWidth = 2.5
    g.beginPath()
    for (let i = 0; i <= N; i++) {
      const u = i / N
      const [x, y] = trunk(W, H, u, side)
      const w = W * (0.042 - u * 0.026)
      if (i === 0) g.moveTo(x - side * w, y)
      else g.lineTo(x - side * w, y)
    }
    g.stroke()
    // branches reaching out from the crown
    g.strokeStyle = '#060a06'
    g.lineCap = 'round'
    for (let b = 0; b < 4; b++) {
      const [x, y] = trunk(W, H, 0.55 + b * 0.1, side)
      g.lineWidth = W * (0.008 - b * 0.0012)
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x - side * W * 0.08, y - H * 0.06, x - side * W * (0.16 + b * 0.03), y - H * (0.02 + b * 0.02))
      g.stroke()
    }
  }
  // the canopy: dark leaf clusters across the top of the arch
  g.fillStyle = '#040805'
  for (let i = 0; i < 70; i++) {
    const u = r()
    const x = W * (0.2 + u * 0.6)
    const y = H * (ARCH_TOP - 0.02 + Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.18 + (r() - 0.5) * 0.08)
    g.beginPath()
    g.ellipse(x, y, W * (0.02 + r() * 0.03), H * (0.02 + r() * 0.025), r(), 0, Math.PI * 2)
    g.fill()
  }

}

function paintFront(g: CanvasRenderingContext2D, W: number, H: number, sh: Float32Array): void {
  const r = rng(77)
  // mushrooms at the foot of the platform
  for (let i = 0; i < SHROOMS; i++) {
    const x = sh[i * 3] * W
    const y = sh[i * 3 + 1] * H
    const s = sh[i * 3 + 2] * H * 0.018
    g.fillStyle = '#6a8a80'
    g.fillRect(x - s * 0.13, y - s * 0.8, s * 0.26, s * 0.8)
    g.fillStyle = '#2a6a62'
    g.beginPath()
    g.ellipse(x, y - s * 0.8, s * 1.05, s * 0.6, 0, Math.PI, 0)
    g.fill()
  }
  // tall grass along the bottom (behind the crowd)
  g.strokeStyle = '#030703'
  g.lineCap = 'round'
  for (let i = 0; i < 260; i++) {
    const x = r() * W
    const y = H * (0.8 + r() * 0.2)
    const h = H * (0.02 + r() * 0.04)
    g.lineWidth = 1 + r() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + (r() - 0.5) * 8, y - h * 0.6, x + (r() - 0.5) * 14, y - h)
    g.stroke()
  }
}

function raySprite(hue: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, 64)
  grd.addColorStop(0, `hsla(${hue}, 90%, 60%, 0)`)
  grd.addColorStop(0.7, `hsla(${hue}, 90%, 62%, 0.55)`)
  grd.addColorStop(0.95, `hsla(${hue + 10}, 90%, 75%, 0.9)`)
  grd.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`)
  g.fillStyle = grd
  g.fillRect(0, 0, 1, 64)
  return c
}

// ---------------------------------------------------------------------------
// live parts
// ---------------------------------------------------------------------------

/** The aurora, drawn into a small buffer (it's soft; scaled up it costs little). */
function paintAurora(ns: NatureState, F: DirectorFrame, E: number): void {
  const g = ns.aurora!.getContext('2d')!
  g.clearRect(0, 0, AW, AH)
  g.globalCompositeOperation = 'lighter'
  const t = F.t
  const hot = isHot(F)
  for (let b = 0; b < 3; b++) {
    const sprite = ns.rays[hot && b === 2 ? 3 : b]
    const base = AH * (0.42 + b * 0.14)
    for (let x = 0; x < AW; x += 2) {
      const u = x / AW
      const y = base + Math.sin(u * 7 + t * (0.25 + b * 0.08) + b) * AH * 0.1 + Math.sin(u * 17 - t * 0.4) * AH * 0.03
      const band = F.bars[Math.floor(u * F.bars.length)] ?? 0
      const flick = 0.55 + 0.45 * Math.sin(u * 60 + t * (1.5 + b * 0.4) + b * 3)
      const a = (0.18 + F.vocals * 0.35 + band * 0.35 + F.breath * 0.1) * flick * (0.45 + E * 0.55) * (b === 2 ? 0.7 : 1)
      const len = AH * (0.25 + band * 0.25 + (b === 0 ? 0.15 : 0))
      g.globalAlpha = Math.min(1, a)
      g.drawImage(sprite, x, y - len, 2, len)
    }
  }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
}

function drawVines(ctx: CanvasRenderingContext2D, W: number, H: number, F: DirectorFrame, ns: NatureState, E: number): void {
  const t = F.t
  for (let v = 0; v < VINES; v++) {
    const u = 0.32 + (v / (VINES - 1)) * 0.36
    const side = u < 0.5 ? -1 : 1
    // hang from the inner curve of the arch
    const along = 0.72 + Math.abs(u - 0.5) * -0.5 + 0.2
    const [ax, ay] = trunk(W, H, Math.min(0.98, along + (v % 2) * 0.04), side)
    const x0 = W * u + (ax - W * u) * 0.15
    const y0 = ay + H * 0.02
    const len = H * (0.12 + ((v * 37) % 10) / 55)
    const sw = Math.sin(t * 0.8 + v * 1.3) * W * 0.008 * (0.6 + F.sway * 0.6)
    ctx.strokeStyle = '#08120a'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(x0 + sw * 0.5, y0 + len * 0.5, x0 + sw, y0 + len)
    ctx.stroke()
    // glowing flowers along the vine: an equalizer of the song
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let b = 0; b < BULBS; b++) {
      const k = (b + 1) / BULBS
      const bx = x0 + sw * k * k
      const by = y0 + len * k
      const bar = F.bars[(v * 3 + b) % F.bars.length] ?? 0
      const on = (0.15 + bar * 0.95) * (0.35 + E * 0.65)
      const img = (v + b) % 3 === 0 ? ns.gold! : (v + b) % 3 === 1 ? ns.teal! : ns.green!
      const s = H * (0.012 + bar * 0.02)
      ctx.globalAlpha = Math.min(1, on)
      ctx.drawImage(img, bx - s * 2, by - s * 2, s * 4, s * 4)
      ctx.fillStyle = `rgba(240,255,230,${Math.min(1, on)})`
      ctx.fillRect(bx - 1.2, by - 1.2, 2.4, 2.4)
    }
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// the pack
// ---------------------------------------------------------------------------

export function drawNature(ctx: CanvasRenderingContext2D, W: number, H: number, F: DirectorFrame, S: SceneState, E: number): void {
  const ns = S.nature
  const t = F.t
  const k = H / 600
  const hot = isHot(F)
  if (!ns.aurora) {
    ns.aurora = document.createElement('canvas')
    ns.aurora.width = AW
    ns.aurora.height = AH
    ns.rays = [raySprite(140), raySprite(168), raySprite(285), raySprite(320)]
    ns.green = glowSprite('140,255,160')
    ns.gold = glowSprite('255,220,140')
    ns.teal = glowSprite('90,240,220')
    ns.mist = glowSprite('170,220,210', 128)
  }
  ns.tilt += ((hot ? 0 : F.state === 'build' ? 1 : 0.45) - ns.tilt) * 0.03
  ns.swirl = Math.max(0, ns.swirl - 1 / 90)
  if (F.impactHit) ns.swirl = 1

  // --- sky and aurora -----------------------------------------------------
  ctx.drawImage(layer(ns.cache, 'sky', W, H, (g) => paintSky(g, W, H)), 0, 0, W, H)
  paintAurora(ns, F, E)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(ns.aurora, 0, 0, AW, AH, 0, 0, W, H * HORIZON)
  ctx.restore()

  // --- the land ---------------------------------------------------------------
  ctx.drawImage(layer(ns.cache, 'land', W, H, (g) => paintLand(g, W, H)), 0, 0, W, H)
  // the aurora mirrored in the lake, rippling
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, H * LAKE_T, W, H * (LAKE_B - LAKE_T))
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.4
  const strips = 12
  const lakeH = H * (LAKE_B - LAKE_T)
  for (let i = 0; i < strips; i++) {
    const sy = (i / strips) * AH
    const sh = AH / strips
    const dx = Math.sin(t * 1.2 + i * 0.9) * 4 * k
    ctx.save()
    ctx.translate(dx, H * LAKE_T + (i / strips) * lakeH)
    ctx.scale(1, -1)
    ctx.drawImage(ns.aurora, 0, AH - sy - sh, AW, sh, 0, -lakeH / strips, W, lakeH / strips)
    ctx.restore()
  }
  ctx.restore()

  // the canopy catches the stage's wash
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < F.wash.length; i++) {
    const wl = F.wash[i]
    if (wl.intensity < 0.02) continue
    ctx.globalAlpha = wl.intensity * 0.35
    const x = W * (0.3 + (i / Math.max(1, F.wash.length - 1)) * 0.4)
    ctx.drawImage(i % 2 ? ns.teal! : ns.green!, x - W * 0.16, H * (ARCH_TOP - 0.08), W * 0.32, H * 0.3)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  drawVines(ctx, W, H, F, ns, E)

  // mushrooms + grass, then their caps glowing on the kick
  ctx.drawImage(layer(ns.cache, 'front', W, H, (g) => paintFront(g, W, H, ns.shrooms)), 0, 0, W, H)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < SHROOMS; i++) {
    const x = ns.shrooms[i * 3] * W
    const s = ns.shrooms[i * 3 + 2] * H * 0.018
    const y = ns.shrooms[i * 3 + 1] * H - s * 1.05
    ctx.globalAlpha = Math.min(1, 0.25 + F.kickTick * 0.6 + F.flash * 0.3) * (0.4 + E * 0.6)
    ctx.drawImage(ns.teal!, x - s * 3, y - s * 2.4, s * 6, s * 4.8)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // the DJ on the stone, inside the arch
  drawDJ(ctx, S.djs[0], W / 2, H * STAGE_Y - 4 * k, H / 560, 140, DJ_FOREST, F, E)

  // --- light ----------------------------------------------------------------
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // god rays from the arch through the mist
  const n = F.beams.length
  for (let i = 0; i < n; i++) {
    const fb = F.beams[i]
    const u = 0.12 + (i / Math.max(1, n - 1)) * 0.76
    const side = u < 0.5 ? -1 : 1
    const [x, y] = trunk(W, H, 0.55 + Math.abs(u - 0.5) * 0.8, side)
    const downX = W / 2 + fb.aim * W * 0.7
    const upX = W / 2 + fb.aim * W * 1.1
    const tx = downX + (upX - downX) * ns.tilt
    const ty = H * 1.05 + (-H * 0.3 - H * 1.05) * ns.tilt
    const hue = i % 3 === 0 ? 48 : 110 + fb.hueOffset * 0.15
    beam(ctx, x, y, tx, ty, hue, 55, 70 + F.flash * 15, fb.intensity * (0.45 + E * 0.5), hot ? 0.05 : 0.08)
  }
  // a follow spot on the DJ through the canopy
  for (let i = 0; i < F.spots.length; i++) {
    const sp = F.spots[i]
    beam(ctx, W * (0.42 + i * 0.08), H * 0.02, W / 2 + sp.aim * W * 0.05, H * (STAGE_Y - 0.06), 50, 30, 85, sp.intensity * 0.45, 0.05)
  }
  // green lasers threading between the trunks
  const len = Math.max(W, H) * 1.4
  for (let i = 0; i < F.lasers.length; i++) {
    const lz = F.lasers[i]
    laser(ctx, W / 2, H * (ARCH_TOP + 0.06), Math.PI / 2 + lz.angle * 0.9, len, hot ? lz.hue : 120 + (i % 3) * 15, lz.intensity * 0.9, 1)
  }
  // low mist over the lake and the clearing, lit by the show
  const lit = airLight(F)
  for (let i = 0; i < 4; i++) {
    const mx = ((t * (6 + i * 3) * k + i * W * 0.37) % (W * 1.6)) - W * 0.3
    const my = H * (i < 2 ? LAKE_B - 0.02 : 0.78) + Math.sin(t * 0.2 + i) * 6 * k
    ctx.globalAlpha = (0.06 + lit * 0.12) * (i < 2 ? 0.8 : 1)
    ctx.drawImage(ns.mist!, mx - W * 0.35, my - H * 0.05, W * 0.7, H * 0.1)
  }
  ctx.globalAlpha = 1

  // fireflies (they swirl up on an impact)
  const fl = ns.flies
  for (let i = 0; i < FLIES; i++) {
    const o = i * FF
    const ph = fl[o + 2]
    fl[o + 3] += (Math.sin(t * 0.5 + ph) * 0.00004 - fl[o + 3] * 0.02)
    fl[o + 4] += (Math.cos(t * 0.4 + ph * 1.3) * 0.00003 - fl[o + 4] * 0.02 - ns.swirl * 0.00012)
    if (ns.swirl > 0.9) {
      // a little outward kick from the stage
      fl[o + 3] += (fl[o] - 0.5) * 0.0015
      fl[o + 4] -= 0.0012
    }
    fl[o] += fl[o + 3]
    fl[o + 1] += fl[o + 4]
    if (fl[o + 1] < 0.08) fl[o + 1] = 0.9
    if (fl[o + 1] > 0.95) fl[o + 1] = 0.4
    const x = (((fl[o] % 1) + 1) % 1) * W
    const y = fl[o + 1] * H
    const tw = Math.max(0, Math.sin(t * 2.2 + ph * 3))
    const a = (0.15 + tw * 0.75) * (0.5 + E * 0.5)
    if (a < 0.05) continue
    const s = (3 + tw * 3) * k
    ctx.globalAlpha = a
    ctx.drawImage(ns.gold!, x - s, y - s, s * 2, s * 2)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // the crowd holds up lanterns
  crowd(ctx, W, H, F, E, {
    fill: 'rgba(1,4,2,0.96)',
    top: H * 0.11,
    heads: 28,
    light: (x, y) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.7
      const s = 10 * k
      ctx.drawImage(ns.gold!, x - s, y - s * 1.2, s * 2, s * 2)
      ctx.restore()
    }
  })

  drawParticles(ctx, S)
  if (F.impactHit) {
    for (let v = 0; v < 5; v++) spawnBurst(S, W * (0.36 + v * 0.07), H * 0.3, 4 + F.impact * 6, 90 + v * 20, 0.8)
  }
}
