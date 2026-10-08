/**
 * 🌃 Synthwave City — an 80s show on the highway at sunset.
 *
 * A striped neon sun (its bands slide down slowly) sits inside a giant
 * chrome triangle lined with pink and cyan neon tubes — the stage. Behind it
 * a neon city skyline with lit windows and vertical signs; in front, a
 * highway running to the horizon, headlights streaming toward us on one side
 * and tail lights away on the other, with a magenta grid scrolling on both
 * shoulders. Retro speaker stacks with neon trim pump their woofers on the
 * kick, a segmented LED equalizer runs along the stage front, palms frame
 * the scene and the crowd waves glow sticks. Over it all, a VHS look:
 * scanlines and a slow tracking band; the big hits make the picture jitter
 * in RGB and, on the biggest, chrome lightning strikes from the sky.
 *
 * Zero per-frame allocations: pools live in SynthState; everything static
 * is painted once into cached layers.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import { canvasDpr } from '@/utils/perf'
import { drawDJ, type DJStyle } from './dj'
import { drawParticles, spawnBurst, type SceneState } from './packs'
import { beam, crowd, createLayerCache, glowSprite, isHot, laser, layer, rng, type LayerCache } from './stagekit'

const PINK = 320
const CYAN = 188
const CARS = 26
const CF = 3 // z (0 far … 1 near), lane, speed
const EQ_BARS = 24
const EQ_SEGS = 10

const DJ_SW: DJStyle = { look: 'human', deskHalf: 52, decks: true, booth: false }

export interface SynthState {
  cache: LayerCache
  pink: HTMLCanvasElement | null
  cyan: HTMLCanvasElement | null
  white: HTMLCanvasElement | null
  red: HTMLCanvasElement | null
  sun: HTMLCanvasElement | null
  sunCut: HTMLCanvasElement | null
  sunR: number
  cars: Float32Array
  scroll: number
  jitter: number
  bolt: number
  boltSeed: number
  tilt: number
}

export function createSynthState(): SynthState {
  const cars = new Float32Array(CARS * CF)
  const r = rng(21)
  for (let i = 0; i < CARS; i++) {
    cars[i * CF] = r()
    cars[i * CF + 1] = i % 4 // lanes 0,1 come toward us; 2,3 drive away
    cars[i * CF + 2] = 0.05 + r() * 0.05
  }
  return { cache: createLayerCache(), pink: null, cyan: null, white: null, red: null, sun: null, sunCut: null, sunR: 0, cars, scroll: 0, jitter: 0, bolt: 0, boltSeed: 1, tilt: 0.5 }
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

interface Geo {
  hy: number // horizon
  vx: number
  sunR: number
  sunY: number
  apexY: number
  baseY: number // triangle base = stage top
  baseHalf: number
  stageBot: number
  roadHalf: number // half width of the road at the bottom
}

function geo(W: number, H: number): Geo {
  const hy = H * 0.5
  const sunR = Math.min(H * 0.2, W * 0.13)
  return {
    hy,
    vx: W / 2,
    sunR,
    sunY: hy - sunR * 0.42,
    apexY: H * 0.08,
    baseY: H * 0.7,
    baseHalf: Math.min(W * 0.26, H * 0.42),
    stageBot: H * 0.76,
    roadHalf: W * 0.3
  }
}

/** Ground perspective: a point at depth z (0 = horizon … 1 = bottom of screen). */
const groundY = (G: Geo, H: number, z: number): number => G.hy + (H - G.hy) * z * z

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSky(g: CanvasRenderingContext2D, W: number, H: number): void {
  const G = geo(W, H)
  const sky = g.createLinearGradient(0, 0, 0, G.hy)
  sky.addColorStop(0, '#12062a')
  sky.addColorStop(0.45, '#35104f')
  sky.addColorStop(0.8, '#8a1f6a')
  sky.addColorStop(1, '#ff6a5a')
  g.fillStyle = sky
  g.fillRect(0, 0, W, G.hy + 2)
  const r = rng(5)
  for (let i = 0; i < 160; i++) {
    const y = Math.pow(r(), 1.5) * G.hy * 0.7
    g.fillStyle = `rgba(255,220,250,${(0.2 + r() * 0.6) * (1 - y / (G.hy * 0.7))})`
    g.fillRect(r() * W, y, 1.3, 1.3)
  }
  // thin cloud streaks low in the sky
  g.save()
  g.filter = 'blur(2px)'
  for (let i = 0; i < 7; i++) {
    const y = G.hy * (0.55 + r() * 0.35)
    const x = r() * W
    const w = W * (0.15 + r() * 0.3)
    g.fillStyle = `rgba(255,140,200,${0.12 + r() * 0.15})`
    g.beginPath()
    g.ellipse(x, y, w / 2, 2 + r() * 3, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

function paintCity(g: CanvasRenderingContext2D, W: number, H: number, neon: CanvasRenderingContext2D): void {
  const G = geo(W, H)
  const r = rng(41)
  for (let row = 0; row < 2; row++) {
    let x = -10
    while (x < W + 10) {
      const w = W * (0.025 + r() * 0.035) * (row ? 1.2 : 1)
      const mid = x + w / 2
      // lower near the middle so the sun shows
      const edge = Math.min(1, Math.abs(mid - G.vx) / (W * 0.5))
      const h = H * (0.03 + edge * 0.2 * (0.5 + r()) + (row ? 0.02 : 0.05) * r()) * (row ? 0.8 : 1)
      const top = G.hy - h
      g.fillStyle = row ? '#140828' : '#1d0b36'
      g.fillRect(x, top, w, h + 2)
      // windows
      for (let wy = top + 4; wy < G.hy - 3; wy += 5)
        for (let wx = x + 3; wx < x + w - 3; wx += 4) {
          if (r() > 0.22) continue
          g.fillStyle = r() < 0.6 ? 'rgba(255,200,140,0.55)' : r() < 0.5 ? 'rgba(90,230,255,0.6)' : 'rgba(255,90,200,0.6)'
          g.fillRect(wx, wy, 1.6, 2)
        }
      // neon on the roof edge and the occasional vertical sign
      if (row === 1 && r() < 0.5) {
        const hue = r() < 0.5 ? PINK : CYAN
        neon.save()
        neon.shadowColor = `hsla(${hue},100%,60%,1)`
        neon.shadowBlur = 8
        neon.strokeStyle = `hsla(${hue},100%,65%,0.9)`
        neon.lineWidth = 1.4
        neon.beginPath()
        neon.moveTo(x, top + 0.5)
        neon.lineTo(x + w, top + 0.5)
        neon.stroke()
        if (h > H * 0.12 && r() < 0.6) {
          const sx = x + w * 0.5
          neon.fillStyle = `hsla(${hue},100%,62%,0.9)`
          for (let s = 0; s < 5; s++) neon.fillRect(sx - 2, top + 8 + s * 9, 4, 6)
        }
        neon.restore()
      }
      x += w + 1 + r() * 4
    }
  }
}

function paintGround(g: CanvasRenderingContext2D, W: number, H: number): void {
  const G = geo(W, H)
  const ground = g.createLinearGradient(0, G.hy, 0, H)
  ground.addColorStop(0, '#2a0b40')
  ground.addColorStop(0.3, '#12061f')
  ground.addColorStop(1, '#05010c')
  g.fillStyle = ground
  g.fillRect(0, G.hy, W, H - G.hy + 2)
  // the road
  g.fillStyle = '#0a0612'
  g.beginPath()
  g.moveTo(G.vx - 3, G.hy)
  g.lineTo(G.vx + 3, G.hy)
  g.lineTo(G.vx + G.roadHalf, H + 2)
  g.lineTo(G.vx - G.roadHalf, H + 2)
  g.closePath()
  g.fill()
  // the sun reflected on the wet road
  const refl = g.createLinearGradient(0, G.hy, 0, H)
  refl.addColorStop(0, 'rgba(255,120,120,0.45)')
  refl.addColorStop(0.5, 'rgba(255,60,160,0.08)')
  refl.addColorStop(1, 'rgba(255,60,160,0)')
  g.fillStyle = refl
  g.beginPath()
  g.moveTo(G.vx - 3, G.hy)
  g.lineTo(G.vx + 3, G.hy)
  g.lineTo(G.vx + G.roadHalf * 0.5, H)
  g.lineTo(G.vx - G.roadHalf * 0.5, H)
  g.closePath()
  g.fill()
  // road edges in neon
  g.save()
  g.shadowColor = `hsla(${CYAN},100%,60%,1)`
  g.shadowBlur = 8
  g.strokeStyle = `hsla(${CYAN},100%,65%,0.8)`
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(G.vx - 3, G.hy)
  g.lineTo(G.vx - G.roadHalf, H + 2)
  g.moveTo(G.vx + 3, G.hy)
  g.lineTo(G.vx + G.roadHalf, H + 2)
  g.stroke()
  g.restore()
  // the horizon glows
  const glow = g.createLinearGradient(0, G.hy - 8, 0, G.hy + 14)
  glow.addColorStop(0, 'rgba(255,120,180,0)')
  glow.addColorStop(0.4, 'rgba(255,170,200,0.7)')
  glow.addColorStop(1, 'rgba(255,120,180,0)')
  g.fillStyle = glow
  g.fillRect(0, G.hy - 8, W, 22)
}

function paintStage(g: CanvasRenderingContext2D, W: number, H: number, neon: CanvasRenderingContext2D): void {
  const G = geo(W, H)
  const L = G.vx - G.baseHalf
  const R = G.vx + G.baseHalf
  const bw = Math.max(6, H * 0.018)
  // the chrome triangle
  const chrome = g.createLinearGradient(0, G.apexY, 0, G.baseY)
  chrome.addColorStop(0, '#d8d8f0')
  chrome.addColorStop(0.48, '#6a6a90')
  chrome.addColorStop(0.52, '#2a2440')
  chrome.addColorStop(1, '#8a86b0')
  g.strokeStyle = chrome
  g.lineWidth = bw
  g.lineJoin = 'miter'
  g.beginPath()
  g.moveTo(G.vx, G.apexY)
  g.lineTo(R, G.baseY)
  g.lineTo(L, G.baseY)
  g.closePath()
  g.stroke()
  // the platform
  g.fillStyle = '#1a1030'
  g.beginPath()
  g.moveTo(L - W * 0.05, G.baseY)
  g.lineTo(R + W * 0.05, G.baseY)
  g.lineTo(R + W * 0.07, G.stageBot)
  g.lineTo(L - W * 0.07, G.stageBot)
  g.closePath()
  g.fill()
  g.fillStyle = '#0c0718'
  g.fillRect(L - W * 0.07, G.stageBot, R - L + W * 0.14, H * 0.012)
  // speaker stacks either side
  const sw = W * 0.07
  const sh = H * 0.2
  for (const side of [-1, 1]) {
    const x = side < 0 ? L - W * 0.05 - sw * 0.2 - sw : R + W * 0.05 + sw * 0.2
    g.fillStyle = '#120a20'
    g.fillRect(x, G.baseY - sh + H * 0.02, sw, sh)
    g.strokeStyle = '#3a3060'
    g.lineWidth = 1.5
    g.strokeRect(x, G.baseY - sh + H * 0.02, sw, sh)
    for (let j = 0; j < 2; j++) {
      const cy = G.baseY - sh + H * 0.02 + sh * (0.28 + j * 0.46)
      g.fillStyle = '#05030a'
      g.beginPath()
      g.arc(x + sw / 2, cy, sw * 0.38, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#2a2244'
      g.stroke()
    }
    neon.save()
    neon.shadowColor = `hsla(${CYAN},100%,60%,1)`
    neon.shadowBlur = 8
    neon.strokeStyle = `hsla(${CYAN},100%,70%,0.85)`
    neon.lineWidth = 1.5
    neon.strokeRect(x - 2, G.baseY - sh + H * 0.02 - 2, sw + 4, sh + 4)
    neon.restore()
  }
  // neon tubes along the triangle: pink outside, cyan inside
  const tube = (inset: number, hue: number): void => {
    const ax = G.vx
    const ay = G.apexY + inset * 1.9
    const lx = L + inset * 1.7
    const rx = R - inset * 1.7
    const by = G.baseY - inset
    neon.save()
    neon.shadowColor = `hsla(${hue},100%,60%,1)`
    neon.shadowBlur = 14
    neon.strokeStyle = `hsla(${hue},100%,62%,0.95)`
    neon.lineWidth = 3
    neon.beginPath()
    neon.moveTo(ax, ay)
    neon.lineTo(rx, by)
    neon.lineTo(lx, by)
    neon.closePath()
    neon.stroke()
    neon.restore()
    neon.strokeStyle = `hsla(${hue},100%,90%,0.9)`
    neon.lineWidth = 1
    neon.beginPath()
    neon.moveTo(ax, ay)
    neon.lineTo(rx, by)
    neon.lineTo(lx, by)
    neon.closePath()
    neon.stroke()
  }
  tube(-bw * 0.9, PINK)
  tube(bw * 1.1, CYAN)
  // the platform's edge
  neon.save()
  neon.shadowColor = `hsla(${PINK},100%,60%,1)`
  neon.shadowBlur = 10
  neon.strokeStyle = `hsla(${PINK},100%,66%,0.95)`
  neon.lineWidth = 2
  neon.beginPath()
  neon.moveTo(L - W * 0.05, G.baseY)
  neon.lineTo(R + W * 0.05, G.baseY)
  neon.stroke()
  neon.restore()
}

function palm(g: CanvasRenderingContext2D, x: number, base: number, h: number, lean: number, r: () => number): void {
  const topX = x + lean * h
  const topY = base - h
  g.strokeStyle = '#08020f'
  g.lineCap = 'round'
  g.lineWidth = h * 0.035
  g.beginPath()
  g.moveTo(x, base)
  g.quadraticCurveTo(x + lean * h * 0.2, base - h * 0.55, topX, topY)
  g.stroke()
  for (const d of [-2.5, -1.9, -1.3, -0.7, 0.7, 1.3, 1.9, 2.5]) {
    const a = -Math.PI / 2 + d + (r() - 0.5) * 0.15
    const len = h * (0.36 + r() * 0.12)
    const ex = topX + Math.cos(a) * len
    const ey = topY + Math.sin(a) * len * 0.5 + len * (0.15 + Math.abs(d) * 0.13)
    const mx = topX + Math.cos(a) * len * 0.55
    const my = topY + Math.sin(a) * len * 0.5 - len * 0.12
    g.lineWidth = h * 0.012
    g.beginPath()
    g.moveTo(topX, topY)
    g.quadraticCurveTo(mx, my, ex, ey)
    g.stroke()
    g.lineWidth = h * 0.006
    for (let j = 2; j <= 16; j++) {
      const t = j / 16
      const u = 1 - t
      const px = u * u * topX + 2 * u * t * mx + t * t * ex
      const py = u * u * topY + 2 * u * t * my + t * t * ey
      const leaf = len * 0.16 * Math.sin(Math.PI * t)
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(px - leaf * 0.2, py + leaf)
      g.moveTo(px, py)
      g.lineTo(px + leaf * 0.2, py + leaf)
      g.stroke()
    }
  }
}

function paintPalms(g: CanvasRenderingContext2D, W: number, H: number): void {
  const r = rng(63)
  palm(g, W * 0.05, H * 1.02, H * 0.78, 0.14, r)
  palm(g, W * 0.15, H * 1.04, H * 0.55, 0.2, r)
  palm(g, W * 0.95, H * 1.02, H * 0.74, -0.16, r)
  palm(g, W * 0.86, H * 1.04, H * 0.5, -0.1, r)
}

function paintVhs(g: CanvasRenderingContext2D, W: number, H: number): void {
  g.fillStyle = 'rgba(0,0,0,0.12)'
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1)
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(10,0,20,0.5)')
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)
}

// ---------------------------------------------------------------------------
// live parts
// ---------------------------------------------------------------------------

function makeSun(ss: SynthState, R: number): void {
  const dpr = canvasDpr()
  const px = Math.max(2, Math.ceil(R * 2 * dpr))
  const c = document.createElement('canvas')
  c.width = c.height = px
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, px)
  grd.addColorStop(0, '#fff2a0')
  grd.addColorStop(0.35, '#ffc23d')
  grd.addColorStop(0.65, '#ff5fa8')
  grd.addColorStop(1, '#c0249c')
  g.fillStyle = grd
  g.beginPath()
  g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2)
  g.fill()
  ss.sun = c
  ss.sunCut = document.createElement('canvas')
  ss.sunCut.width = ss.sunCut.height = px
  ss.sunR = R
}

function drawSun(ctx: CanvasRenderingContext2D, G: Geo, F: DirectorFrame, ss: SynthState, E: number): void {
  if (!ss.sun || ss.sunR !== G.sunR) makeSun(ss, G.sunR)
  const R = G.sunR
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.35 + F.vocals * 0.35 + E * 0.15
  ctx.drawImage(ss.pink!, G.vx - R * 3, G.sunY - R * 3, R * 6, R * 6)
  ctx.restore()
  const cg = ss.sunCut!.getContext('2d')!
  const px = ss.sunCut!.width
  cg.globalCompositeOperation = 'copy'
  cg.drawImage(ss.sun!, 0, 0)
  cg.globalCompositeOperation = 'destination-out'
  const top = px * 0.45
  const gap = px * 0.075
  const slide = (F.t * px * 0.03) % gap
  for (let y = top - gap + slide; y < px; y += gap) {
    if (y < top) continue
    cg.fillRect(0, y, px, 1 + ((y - top) / (px - top)) * gap * 0.55)
  }
  cg.globalCompositeOperation = 'source-over'
  ctx.drawImage(ss.sunCut!, G.vx - R, G.sunY - R, R * 2, R * 2)
}

function drawCars(ctx: CanvasRenderingContext2D, W: number, H: number, G: Geo, F: DirectorFrame, ss: SynthState): void {
  const cars = ss.cars
  const speed = 1 + F.energy / 60 + F.laserBoost
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < CARS; i++) {
    const o = i * CF
    const lane = cars[o + 1]
    const toward = lane < 2
    let z = cars[o] + (toward ? 1 : -1) * cars[o + 2] * speed * (1 / 60) * (0.3 + cars[o] * 1.4)
    if (z > 1.05) z = 0.02
    if (z < 0.02) z = 1
    cars[o] = z
    const y = groundY(G, H, z)
    const off = ((lane % 2) + 0.5) * 0.24 * (toward ? -1 : 1) // lanes either side of the middle
    // the road's half width at this depth is roadHalf · z²
    const x = G.vx + off * G.roadHalf * z * z
    const s = 0.6 + z * z * 7
    const img = toward ? ss.white! : ss.red!
    const a = Math.min(1, z * 2.2)
    // a streak of light behind it
    const back = groundY(G, H, Math.max(0, z - (toward ? 0.06 : -0.06)))
    ctx.strokeStyle = toward ? `rgba(220,240,255,${a * 0.35})` : `rgba(255,60,80,${a * 0.35})`
    ctx.lineWidth = Math.max(1, s * 0.5)
    for (const d of [-1, 1]) {
      const lx = x + d * s * 0.9
      ctx.beginPath()
      ctx.moveTo(lx, y)
      ctx.lineTo(G.vx + (lx - G.vx) * ((back - G.hy) / Math.max(1, y - G.hy)), back)
      ctx.stroke()
    }
    ctx.globalAlpha = a
    ctx.drawImage(img, x - s * 0.9 - s, y - s, s * 2, s * 2)
    ctx.drawImage(img, x + s * 0.9 - s, y - s, s * 2, s * 2)
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

function drawBolt(ctx: CanvasRenderingContext2D, W: number, H: number, ss: SynthState): void {
  if (ss.bolt <= 0) return
  const r = rng(ss.boltSeed)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const side of [-1, 1]) {
    let x = W / 2 + side * W * (0.3 + r() * 0.1)
    let y = 0
    ctx.beginPath()
    ctx.moveTo(x, y)
    while (y < H * 0.45) {
      x += (r() - 0.5) * W * 0.05
      y += H * (0.03 + r() * 0.04)
      ctx.lineTo(x, y)
    }
    ctx.strokeStyle = `rgba(200,180,255,${ss.bolt * 0.35})`
    ctx.lineWidth = 8
    ctx.stroke()
    ctx.strokeStyle = `rgba(255,255,255,${ss.bolt})`
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the pack
// ---------------------------------------------------------------------------

export function drawSynthCity(ctx: CanvasRenderingContext2D, W: number, H: number, F: DirectorFrame, S: SceneState, E: number): void {
  const ss = S.synth
  const G = geo(W, H)
  const k = H / 600
  const t = F.t
  const hot = isHot(F)
  if (!ss.pink) {
    ss.pink = glowSprite('255,80,190')
    ss.cyan = glowSprite('80,230,255')
    ss.white = glowSprite('235,245,255')
    ss.red = glowSprite('255,50,70')
  }
  ss.tilt += ((hot ? 0 : F.state === 'build' ? 1 : 0.5) - ss.tilt) * 0.03
  if (F.impactLevel >= 3) ss.jitter = 1
  ss.jitter = Math.max(0, ss.jitter - 1 / 14)
  if (F.impactLevel >= 5) {
    ss.bolt = 1
    ss.boltSeed = (ss.boltSeed * 7 + 13) % 9973
  }
  ss.bolt = Math.max(0, ss.bolt - 1 / 12)

  // --- sky, sun, city ------------------------------------------------------
  ctx.drawImage(layer(ss.cache, 'sky', W, H, (g) => paintSky(g, W, H)), 0, 0, W, H)
  drawSun(ctx, G, F, ss, E)
  // the city and its neon are painted together (the neon goes to its own layer)
  let cityNeon: HTMLCanvasElement | null = null
  const city = layer(ss.cache, 'city', W, H, (g) => {
    cityNeon = layer(ss.cache, 'cityNeon', W, H, () => {})
    paintCity(g, W, H, cityNeon.getContext('2d')!)
  })
  ctx.drawImage(city, 0, 0, W, H)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = Math.min(1, 0.55 + F.hihats * 0.4 + F.flash * 0.3)
  ctx.drawImage(cityNeon ?? ss.cache.layers.cityNeon, 0, 0, W, H)
  ctx.restore()

  // --- the highway ------------------------------------------------------------
  ctx.drawImage(layer(ss.cache, 'ground', W, H, (g) => paintGround(g, W, H)), 0, 0, W, H)
  ss.scroll = (ss.scroll + (0.25 + F.energy / 300 + F.kickTick * 0.2) / 60) % 1
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // the magenta grid on both shoulders
  ctx.strokeStyle = `hsla(${PINK}, 100%, 62%, ${(0.3 + F.kickTick * 0.3) * (0.5 + E * 0.5)})`
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (let i = 1; i <= 14; i++) {
    const z = (i / 14 + ss.scroll / 14) % 1
    const y = groundY(G, H, z)
    if (y - G.hy < 2) continue
    const rx = G.roadHalf * z * z
    ctx.moveTo(0, y)
    ctx.lineTo(G.vx - rx - 6, y)
    ctx.moveTo(G.vx + rx + 6, y)
    ctx.lineTo(W, y)
  }
  for (let i = 1; i <= 9; i++) {
    for (const s of [-1, 1]) {
      ctx.moveTo(G.vx + s * (6 + i * 10), G.hy)
      ctx.lineTo(G.vx + s * (G.roadHalf + i * W * 0.09), H)
    }
  }
  ctx.stroke()
  // lane dashes rushing toward us
  ctx.fillStyle = 'rgba(255,240,200,0.75)'
  for (let i = 0; i < 12; i++) {
    const z0 = (i / 12 + ss.scroll) % 1
    const z1 = Math.min(1, z0 + 0.035)
    const y0 = groundY(G, H, z0)
    const y1 = groundY(G, H, z1)
    const w = 1 + z0 * z0 * 4
    ctx.fillRect(G.vx - w / 2, y0, w, Math.max(1, y1 - y0))
  }
  ctx.restore()
  drawCars(ctx, W, H, G, F, ss)

  // --- the stage --------------------------------------------------------------
  let stageNeon: HTMLCanvasElement | null = null
  const stage = layer(ss.cache, 'stage', W, H, (g) => {
    stageNeon = layer(ss.cache, 'stageNeon', W, H, () => {})
    paintStage(g, W, H, stageNeon.getContext('2d')!)
  })
  ctx.drawImage(stage, 0, 0, W, H)
  const neonLayer = stageNeon ?? ss.cache.layers.stageNeon
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // the tubes flicker as the build rises, and blaze on the drop
  const flick = F.state === 'build' && Math.sin(t * 40) > 0.3 - F.tension ? 0.4 : 1
  ctx.globalAlpha = Math.min(1, (0.5 + F.kickTick * 0.35 + F.flash * 0.3 + (hot ? 0.2 : 0)) * flick)
  ctx.drawImage(neonLayer, 0, 0, W, H)
  if (ss.jitter > 0.05) {
    // VHS jitter: offset copies in cyan and red
    ctx.globalAlpha = ss.jitter * 0.5
    ctx.drawImage(neonLayer, -6 * ss.jitter * k, 0, W, H)
    ctx.drawImage(neonLayer, 6 * ss.jitter * k, 0, W, H)
  }
  ctx.globalAlpha = 1
  // woofers pumping on the kick
  const L = G.vx - G.baseHalf
  const R = G.vx + G.baseHalf
  const sw = W * 0.07
  const sh = H * 0.2
  for (const side of [-1, 1]) {
    const x = side < 0 ? L - W * 0.05 - sw * 0.2 - sw : R + W * 0.05 + sw * 0.2
    for (let j = 0; j < 2; j++) {
      const cy = G.baseY - sh + H * 0.02 + sh * (0.28 + j * 0.46)
      const pump = 1 + F.kickTick * 0.12 + (j ? F.subBass : F.kick) * 0.05
      ctx.strokeStyle = `hsla(${j ? CYAN : PINK}, 100%, 65%, ${(0.35 + F.kickTick * 0.5) * (0.4 + E * 0.6)})`
      ctx.lineWidth = 1.5
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath()
        ctx.arc(x + sw / 2, cy, sw * 0.12 * ring * pump, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
  // the segmented LED equalizer along the stage front
  const eqL = L - W * 0.04
  const eqR = R + W * 0.04
  const eqT = G.baseY + H * 0.012
  const eqB = G.stageBot - H * 0.008
  const bw = (eqR - eqL) / EQ_BARS
  const segH = (eqB - eqT) / EQ_SEGS
  for (let b = 0; b < EQ_BARS; b++) {
    const v = (F.bars[Math.floor((Math.abs(b - (EQ_BARS - 1) / 2) / (EQ_BARS / 2)) * F.bars.length)] ?? 0) * (0.4 + E * 0.6)
    const lit = Math.round(v * EQ_SEGS)
    for (let s = 0; s < lit; s++) {
      const hue = s < EQ_SEGS * 0.5 ? CYAN : s < EQ_SEGS * 0.8 ? 270 : PINK
      ctx.fillStyle = `hsla(${hue}, 100%, 62%, 0.85)`
      ctx.fillRect(eqL + b * bw + 1, eqB - (s + 1) * segH + 1, bw - 2, segH - 1.5)
    }
  }
  ctx.restore()

  // the DJ under the triangle, against the sun
  drawDJ(ctx, S.djs[0], G.vx, G.baseY - 2 * k, H / 520, PINK, DJ_SW, F, E)

  // --- light ----------------------------------------------------------------
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const n = F.beams.length
  for (let i = 0; i < n; i++) {
    const fb = F.beams[i]
    // heads ride up the triangle's sides
    const u = (i % (n / 2)) / (n / 2)
    const side = i < n / 2 ? -1 : 1
    const x = G.vx + side * G.baseHalf * (1 - u * 0.85)
    const y = G.baseY - (G.baseY - G.apexY) * u * 0.85
    const downX = W / 2 + fb.aim * W * 0.8
    const upX = W / 2 + fb.aim * W * 1.1
    const tx = downX + (upX - downX) * ss.tilt
    const ty = H * 1.05 + (-H * 0.3 - H * 1.05) * ss.tilt
    beam(ctx, x, y, tx, ty, i % 2 ? PINK : CYAN, 100, 62 + F.flash * 20, fb.intensity * (0.5 + E * 0.5), hot ? 0.045 : 0.075)
  }
  const len = Math.max(W, H) * 1.4
  for (let i = 0; i < F.lasers.length; i++) {
    const lz = F.lasers[i]
    laser(ctx, G.vx, G.apexY + 6, Math.PI / 2 + lz.angle, len, i % 2 ? PINK : CYAN, lz.intensity, 1.1)
  }
  ctx.restore()

  drawBolt(ctx, W, H, ss)

  // palms, then the crowd waving glow sticks
  ctx.drawImage(layer(ss.cache, 'palms', W, H, (g) => paintPalms(g, W, H)), 0, 0, W, H)
  crowd(ctx, W, H, F, E, {
    fill: 'rgba(6,1,12,0.96)',
    top: H * 0.11,
    heads: 28,
    light: (x, y, i) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const a = Math.sin(t * 5 + i) * 0.5
      ctx.strokeStyle = `hsla(${i % 2 ? PINK : CYAN}, 100%, 65%, 0.9)`
      ctx.lineWidth = 2.2 * k
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.sin(a) * 12 * k, y - Math.cos(a) * 12 * k)
      ctx.stroke()
      ctx.restore()
    }
  })

  drawParticles(ctx, S)
  if (F.impactHit) spawnBurst(S, G.vx, G.sunY, 10 + F.impact * 14, PINK, 1)

  // --- VHS ------------------------------------------------------------------
  ctx.drawImage(layer(ss.cache, 'vhs', W, H, (g) => paintVhs(g, W, H)), 0, 0, W, H)
  const band = ((t * 0.07) % 1.3) * H - H * 0.15
  const bandG = ctx.createLinearGradient(0, band - 20, 0, band + 20)
  bandG.addColorStop(0, 'rgba(255,255,255,0)')
  bandG.addColorStop(0.5, `rgba(255,220,255,${0.035 + ss.jitter * 0.08})`)
  bandG.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = bandG
  ctx.fillRect(0, band - 20, W, 40)
}
