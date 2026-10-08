import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🌆 Synthwave — full '80s retro-future. Pure vaporwave nostalgia.
 *
 * A big neon sun with scanline bands (they slide slowly down, like the old
 * covers) sinks into a valley between wireframe mountains; thin pink cloud
 * streaks cross it. An endless perspective grid runs toward the viewer, the
 * sun reflected in it in stripes. Palm silhouettes frame the scene, rim-lit
 * in neon; stars twinkle and, now and then, a shooting star crosses the sky.
 * A faint CRT scanline sits over it all.
 *
 * The music: the grid speeds up with the bass, the sun glows with the energy,
 * each kick sends a pulse of light down the grid, and the horizon flares on
 * impacts.
 *
 * The clock changes the mood: a pastel vapor afternoon, the classic magenta
 * sunset, and a deep violet night with the sun low on the horizon.
 */

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: RGB
  skyMid: RGB
  skyLow: RGB
  ground: RGB
  stars: number
  sunY: number
  /** grid / neon line colour */
  grid: string
  wire: string
  cloud: string
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 16.5)
    return {
      key: 'day',
      skyTop: [58, 40, 138],
      skyMid: [168, 92, 190],
      skyLow: [255, 172, 186],
      ground: [26, 8, 44],
      stars: 0.15,
      sunY: HY - 200,
      grid: '255,96,206',
      wire: '120,240,255',
      cloud: '255,214,236'
    }
  if ((h >= 16.5 && h < 19.5) || (h >= 5.5 && h < 8))
    return {
      key: 'dusk',
      skyTop: [26, 0, 52],
      skyMid: [74, 12, 94],
      skyLow: [206, 52, 132],
      ground: [12, 0, 24],
      stars: 0.6,
      sunY: HY - 135,
      grid: '255,45,170',
      wire: '0,229,255',
      cloud: '255,140,200'
    }
  return {
    key: 'night',
    skyTop: [6, 2, 22],
    skyMid: [36, 8, 66],
    skyLow: [118, 26, 108],
    ground: [7, 0, 16],
    stars: 1,
    sunY: HY - 70,
    grid: '255,40,160',
    wire: '0,200,255',
    cloud: '200,90,170'
  }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// ---------------------------------------------------------------------------
// geometry (board coordinates)
// ---------------------------------------------------------------------------

const HY = 540 // the horizon
const VX = BW / 2 // vanishing point
const SUN_X = VX
const SUN_R = 205
/** perspective: a ground point at depth z sits at y = HY + F / z */
const F = 600
const CELL = 0.35 // grid cell size in world units
const Z_FAR = 42

const groundY = (z: number): number => HY + F / z

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSky(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, HY)
  sky.addColorStop(0, rgb(P.skyTop))
  sky.addColorStop(0.6, rgb(P.skyMid))
  sky.addColorStop(1, rgb(P.skyLow))
  g.fillStyle = sky
  g.fillRect(-10, -10, BW + 20, HY + 20)
  const r = rng(11)
  for (let i = 0; i < 320; i++) {
    const x = r() * BW
    const y = Math.pow(r(), 1.3) * (HY - 60)
    const a = (0.2 + r() * 0.7) * P.stars * (1 - y / HY)
    if (a <= 0.02) continue
    g.fillStyle = `rgba(255,${200 + r() * 55},${235 + r() * 20},${a})`
    const s = r() < 0.08 ? 2.2 : 1.3
    g.fillRect(x, y, s, s)
  }
}

/** A wireframe mountain range: dark faces, contour lines, neon ridge. */
function range(g: CanvasRenderingContext2D, P: Pal, pts: number[][], fill: [string, string], alpha: number): void {
  const path = new Path2D()
  path.moveTo(pts[0][0], HY + 2)
  for (const p of pts) path.lineTo(p[0], p[1])
  path.lineTo(pts[pts.length - 1][0], HY + 2)
  path.closePath()
  const top = Math.min(...pts.map((p) => p[1]))
  const grd = g.createLinearGradient(0, top, 0, HY)
  grd.addColorStop(0, fill[0])
  grd.addColorStop(1, fill[1])
  g.fillStyle = grd
  g.fill(path)
  g.save()
  g.clip(path)
  // contours, closer together near the horizon
  g.strokeStyle = `rgba(${P.wire},${0.22 * alpha})`
  g.lineWidth = 1
  for (let k = 0; k < 18; k++) {
    const y = HY - Math.pow(k / 18, 1.5) * (HY - top)
    g.beginPath()
    g.moveTo(pts[0][0], y)
    g.lineTo(pts[pts.length - 1][0], y)
    g.stroke()
  }
  // ribs from every peak down the faces
  g.strokeStyle = `rgba(${P.wire},${0.3 * alpha})`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]
    if (py > pts[i - 1][1] || py > pts[i + 1][1]) continue
    for (const d of [-1, -0.5, 0.5, 1]) {
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(px + d * (HY - py) * 0.9, HY + 2)
      g.stroke()
    }
  }
  g.restore()
  // the ridge, glowing
  const ridge = (): void => {
    g.beginPath()
    for (const p of pts) g.lineTo(p[0], p[1])
  }
  g.save()
  g.filter = 'blur(5px)'
  g.strokeStyle = `rgba(${P.grid},${0.7 * alpha})`
  g.lineWidth = 6
  ridge()
  g.stroke()
  g.restore()
  g.strokeStyle = `rgba(255,200,240,${0.9 * alpha})`
  g.lineWidth = 1.6
  ridge()
  g.stroke()
}

function jagged(r: () => number, x0: number, x1: number, heightAt: (x: number) => number, step: number): number[][] {
  const pts: number[][] = []
  for (let x = x0; x <= x1 + 0.1; x += step * (0.6 + r() * 0.8)) {
    const up = pts.length % 2 === 0
    const h = heightAt(x) * (up ? 0.75 + r() * 0.35 : 0.35 + r() * 0.3)
    pts.push([x, HY - Math.max(4, h)])
  }
  pts.push([x1, HY - 4])
  return pts
}

function paintMountains(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(29)
  // far range: low in the middle so the sun shows through the valley
  const far = (x: number): number => 40 + Math.pow(Math.abs(x - VX) / VX, 1.4) * 150
  range(g, P, jagged(r, -40, BW + 40, far, 70), [rgb(P.skyLow.map((c) => c * 0.45) as RGB), rgb(P.ground.map((c) => c * 2.2) as RGB)], 0.55)
  // near ranges on both sides
  const nearL = (x: number): number => Math.max(0, 260 - x * 0.42)
  const nearR = (x: number): number => Math.max(0, 260 - (BW - x) * 0.42)
  range(g, P, jagged(r, -40, 600, nearL, 90), ['#1c0634', rgb(P.ground)], 1)
  range(g, P, jagged(r, 1000, BW + 40, nearR, 90), ['#1c0634', rgb(P.ground)], 1)
  // the haze sitting on the horizon
  const haze = g.createLinearGradient(0, HY - 40, 0, HY + 10)
  haze.addColorStop(0, rgb(P.skyLow, 0))
  haze.addColorStop(1, rgb(P.skyLow, 0.55))
  g.fillStyle = haze
  g.fillRect(-10, HY - 40, BW + 20, 50)
}

function paintGround(g: CanvasRenderingContext2D, P: Pal): void {
  const grd = g.createLinearGradient(0, HY, 0, BH)
  grd.addColorStop(0, rgb(P.ground.map((c) => c * 2.4) as RGB))
  grd.addColorStop(0.25, rgb(P.ground))
  grd.addColorStop(1, rgb(P.ground.map((c) => c * 0.6) as RGB))
  g.fillStyle = grd
  g.fillRect(-10, HY, BW + 20, BH - HY + 10)

  // the sun reflected on the floor, in stripes
  g.save()
  g.filter = 'blur(6px)'
  for (let i = 0; i < 16; i++) {
    const y0 = HY + 4 + Math.pow(i / 16, 1.6) * 300
    const h = 3 + i * 0.9
    const w = SUN_R * (1.05 - i * 0.035)
    const a = 0.32 * (1 - i / 16)
    const lg = g.createLinearGradient(SUN_X - w, 0, SUN_X + w, 0)
    lg.addColorStop(0, 'rgba(255,90,180,0)')
    lg.addColorStop(0.5, `rgba(255,${150 - i * 4},${120 + i * 4},${a})`)
    lg.addColorStop(1, 'rgba(255,90,180,0)')
    g.fillStyle = lg
    g.fillRect(SUN_X - w, y0, w * 2, h)
  }
  g.restore()

  // the long lines of the grid, running to the vanishing point
  const yb = BH + 30
  const zb = F / (yb - HY)
  const lines = (width: number, alpha: number): void => {
    for (let k = -46; k <= 46; k++) {
      const xb = VX + (k * CELL * F) / zb
      const lg = g.createLinearGradient(0, HY, 0, yb)
      lg.addColorStop(0, `rgba(${P.grid},0)`)
      lg.addColorStop(0.12, `rgba(${P.grid},${alpha * 0.5})`)
      lg.addColorStop(1, `rgba(${P.grid},${alpha})`)
      g.strokeStyle = lg
      g.lineWidth = width
      g.beginPath()
      g.moveTo(VX + k * 0.6, HY)
      g.lineTo(xb, yb)
      g.stroke()
    }
  }
  g.save()
  g.filter = 'blur(4px)'
  lines(5, 0.45)
  g.restore()
  lines(1.4, 0.85)

  // the horizon line
  g.save()
  g.filter = 'blur(3px)'
  g.fillStyle = `rgba(${P.grid},0.8)`
  g.fillRect(-10, HY - 1.5, BW + 20, 3)
  g.restore()
  g.fillStyle = 'rgba(255,220,245,0.9)'
  g.fillRect(-10, HY - 0.5, BW + 20, 1)
}

/** One palm silhouette, rim-lit in neon. */
function palm(g: CanvasRenderingContext2D, P: Pal, x: number, base: number, h: number, lean: number, r: () => number): void {
  const dark = '#0d0219'
  const topX = x + lean * h
  const topY = base - h
  const cx = x + lean * h * 0.2
  const cy = base - h * 0.55
  // trunk: stacked rings along a curve, thinner towards the top
  const N = 26
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const u = 1 - t
    const px = u * u * x + 2 * u * t * cx + t * t * topX
    const py = u * u * base + 2 * u * t * cy + t * t * topY
    const w = (h * 0.045) * (1 - t * 0.45)
    g.fillStyle = dark
    g.beginPath()
    g.ellipse(px, py, w, h * 0.028, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = `rgba(${P.grid},0.35)`
    g.lineWidth = 1.2
    g.beginPath()
    g.arc(px, py, w, Math.PI * 1.05, Math.PI * 1.45)
    g.stroke()
  }
  // fronds, fanning out and drooping (none pointing straight up)
  const spread = [-2.55, -2.05, -1.5, -0.95, -0.45, 0.45, 0.95, 1.5, 2.05, 2.55]
  for (const d of spread) {
    const a = -Math.PI / 2 + d + (r() - 0.5) * 0.15
    const len = h * (0.4 + r() * 0.14) * (Math.abs(d) < 0.6 ? 0.8 : 1)
    const droop = len * (0.15 + Math.abs(d) * 0.16)
    const ex = topX + Math.cos(a) * len
    const ey = topY + Math.sin(a) * len * 0.6 + droop
    const mx = topX + Math.cos(a) * len * 0.55
    const my = topY + Math.sin(a) * len * 0.55 - len * 0.1
    // leaflets along the rib, pointing toward the tip and hanging a little
    const M = 34
    g.strokeStyle = dark
    g.lineWidth = 3.2
    g.lineCap = 'round'
    for (let j = 2; j <= M; j++) {
      const t = j / M
      const u = 1 - t
      const px = u * u * topX + 2 * u * t * mx + t * t * ex
      const py = u * u * topY + 2 * u * t * my + t * t * ey
      let tx = 2 * u * (mx - topX) + 2 * t * (ex - mx)
      let ty = 2 * u * (my - topY) + 2 * t * (ey - my)
      const tl = Math.hypot(tx, ty) || 1
      tx /= tl
      ty /= tl
      const leaf = len * 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.05))
      for (const side of [-1, 1]) {
        g.beginPath()
        g.moveTo(px, py)
        g.lineTo(px - ty * side * leaf * 0.75 + tx * leaf * 0.45, py + tx * side * leaf * 0.75 + ty * leaf * 0.45 + leaf * 0.35)
        g.stroke()
      }
    }
    g.lineWidth = 4.5
    g.beginPath()
    g.moveTo(topX, topY)
    g.quadraticCurveTo(mx, my, ex, ey)
    g.stroke()
    g.strokeStyle = `rgba(${P.grid},0.5)`
    g.lineWidth = 1.2
    g.stroke()
  }
  // the crown
  g.fillStyle = dark
  g.beginPath()
  g.arc(topX, topY + 4, h * 0.03, 0, Math.PI * 2)
  g.fill()
}

function paintFront(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(53)
  palm(g, P, 110, BH + 40, 560, 0.15, r)
  palm(g, P, 290, BH + 60, 400, 0.2, r)
  palm(g, P, 1510, BH + 40, 520, -0.17, r)
  palm(g, P, 1385, BH + 70, 350, -0.12, r)
}

/** A faint CRT scanline over the whole screen (screen pixels, not board). */
function paintScan(v: View): Layer {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(v.w * v.dpr))
  c.height = Math.max(1, Math.round(v.h * v.dpr))
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(0,0,0,0.12)'
  const step = Math.max(3, Math.round(3 * v.dpr))
  for (let y = 0; y < c.height; y += step) g.fillRect(0, y, c.width, Math.max(1, Math.round(v.dpr)))
  const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.4, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(8,0,20,0.5)')
  g.fillStyle = vg
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** The sun's disc (its bands are cut live). */
function sunSprite(v: View): Layer {
  const px = Math.ceil(SUN_R * 2 * v.s * v.dpr)
  const c = document.createElement('canvas')
  c.width = c.height = Math.max(2, px)
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, px)
  grd.addColorStop(0, '#fff3a0')
  grd.addColorStop(0.3, '#ffc53d')
  grd.addColorStop(0.62, '#ff5fb4')
  grd.addColorStop(1, '#b0249c')
  g.fillStyle = grd
  g.beginPath()
  g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2)
  g.fill()
  return c
}

function cloudStreaks(P: Pal): Layer {
  const c = document.createElement('canvas')
  c.width = 1800
  c.height = 300
  const g = c.getContext('2d')!
  const r = rng(71)
  g.filter = 'blur(2px)'
  for (let i = 0; i < 9; i++) {
    const y = 30 + r() * 240
    const x = r() * 1500
    const w = 260 + r() * 520
    const h = 3 + r() * 7
    const lg = g.createLinearGradient(x, 0, x + w, 0)
    lg.addColorStop(0, `rgba(${P.cloud},0)`)
    lg.addColorStop(0.3, `rgba(${P.cloud},${0.35 + r() * 0.3})`)
    lg.addColorStop(0.7, `rgba(${P.cloud},${0.35 + r() * 0.3})`)
    lg.addColorStop(1, `rgba(${P.cloud},0)`)
    g.fillStyle = lg
    g.beginPath()
    g.ellipse(x + w / 2, y, w / 2, h, 0, 0, Math.PI * 2)
    g.fill()
    // the darker belly that cuts across the sun
    g.fillStyle = `rgba(${P.skyMid.join(',')},${0.5 + r() * 0.3})`
    g.beginPath()
    g.ellipse(x + w / 2, y + h * 0.9, w * 0.42, h * 0.55, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface State {
  v: View
  P: Pal
  sky: Layer
  mountains: Layer
  ground: Layer
  front: Layer
  scan: Layer
  sun: Layer
  sunCut: Layer
  clouds: Layer
  pink: Layer
  gold: Layer
  white: Layer
  scroll: number
  waves: number[]
  lastKick: number
  shoot: { x: number; y: number; vx: number; vy: number; t: number }
  nextShoot: number
  twinkles: { x: number; y: number; ph: number; sp: number }[]
}

let S: State | null = null

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const sun = sunSprite(v)
  const sunCut = document.createElement('canvas')
  sunCut.width = sun.width
  sunCut.height = sun.height
  const r = rng(3)
  return {
    v,
    P,
    sky: makeLayer(v, (g) => paintSky(g, P)),
    mountains: makeLayer(v, (g) => paintMountains(g, P)),
    ground: makeLayer(v, (g) => paintGround(g, P)),
    front: makeLayer(v, (g) => paintFront(g, P)),
    scan: paintScan(v),
    sun,
    sunCut,
    clouds: cloudStreaks(P),
    pink: glowSprite('255,80,190'),
    gold: glowSprite('255,190,90'),
    white: glowSprite('255,235,250', 64),
    scroll: 0,
    waves: [],
    lastKick: 0,
    shoot: { x: 0, y: 0, vx: 0, vy: 0, t: -1 },
    nextShoot: 8 + r() * 10,
    twinkles: Array.from({ length: 26 }, () => ({ x: r() * BW, y: r() * (HY - 160), ph: r() * 6.28, sp: 0.8 + r() * 1.6 }))
  }
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const synthwaveWorld: World = {
  id: 'synthwave',
  name: 'Synthwave',
  spectrumBins: 24,

  mount(c: WorldContext): void {
    S = build(c)
  },

  unmount(): void {
    S = null
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const v = viewFor(c)
    if (!S || !sameView(S.v, v) || S.P.key !== palFor(c.dayPhase).key) S = build(c)
    const st = S
    const P = st.P

    ctx.save()
    ctx.drawImage(st.sky, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)

    // twinkling stars
    if (P.stars > 0.1) {
      ctx.globalCompositeOperation = 'lighter'
      for (const s of st.twinkles) {
        const a = Math.max(0, Math.sin(time * s.sp + s.ph)) * P.stars
        if (a < 0.05) continue
        ctx.globalAlpha = a
        ctx.drawImage(st.white, s.x - 6, s.y - 6, 12, 12)
      }
    }

    // a shooting star now and then
    st.nextShoot -= dt
    if (st.nextShoot <= 0 && st.shoot.t < 0) {
      const dir = Math.random() < 0.5 ? -1 : 1
      st.shoot = { x: VX + (Math.random() - 0.5) * 1100, y: 40 + Math.random() * 160, vx: dir * (520 + Math.random() * 260), vy: 140 + Math.random() * 80, t: 0 }
      st.nextShoot = 12 + Math.random() * 16
    }
    if (st.shoot.t >= 0) {
      const sh = st.shoot
      sh.t += dt
      sh.x += sh.vx * dt
      sh.y += sh.vy * dt
      const k = Math.sin(Math.min(1, sh.t / 0.9) * Math.PI)
      if (sh.t > 0.9) sh.t = -1
      const tail = 0.14
      const lg = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * tail, sh.y - sh.vy * tail)
      lg.addColorStop(0, 'rgba(255,240,255,0.9)')
      lg.addColorStop(1, 'rgba(255,120,220,0)')
      ctx.globalAlpha = k * Math.max(0.35, P.stars)
      ctx.strokeStyle = lg
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sh.x, sh.y)
      ctx.lineTo(sh.x - sh.vx * tail, sh.y - sh.vy * tail)
      ctx.stroke()
    }

    // the sun's glow, riding the energy
    ctx.globalCompositeOperation = 'lighter'
    const glow = 0.3 + c.energy * 0.35 + c.breath * 0.08
    ctx.globalAlpha = glow
    const gr = SUN_R * 3.2
    ctx.drawImage(st.pink, SUN_X - gr, P.sunY - gr, gr * 2, gr * 2)
    ctx.globalAlpha = glow * 0.5
    ctx.drawImage(st.gold, SUN_X - SUN_R * 1.6, P.sunY - SUN_R * 1.9, SUN_R * 3.2, SUN_R * 3.2)
    ctx.globalCompositeOperation = 'source-over'

    // the sun, with its bands sliding slowly down
    const cg = st.sunCut.getContext('2d')!
    const px = st.sunCut.width
    cg.globalCompositeOperation = 'copy'
    cg.drawImage(st.sun, 0, 0)
    cg.globalCompositeOperation = 'destination-out'
    const k = px / (SUN_R * 2) // sprite px per board unit
    // (bands start a little above the middle and thicken toward the bottom)
    const top = SUN_R * 0.8
    const slide = (time * 6) % 24
    for (let y = top - 24 + slide; y < SUN_R * 2; y += 24) {
      if (y < top) continue
      const t = (y - top) / (SUN_R * 2 - top)
      cg.fillRect(0, y * k, px, (1.5 + t * 12) * k)
    }
    cg.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(st.sunCut, SUN_X - SUN_R, P.sunY - SUN_R, SUN_R * 2, SUN_R * 2)

    // cloud streaks drifting across it
    const cx = -((time * 6) % 1800)
    ctx.globalAlpha = 0.85
    const cy = P.sunY - 170
    ctx.drawImage(st.clouds, cx, cy, 1800, 300)
    ctx.drawImage(st.clouds, cx + 1800, cy, 1800, 300)
    ctx.restore()

    // the mountains and the floor
    ctx.drawImage(st.mountains, 0, 0, width, height)
    ctx.drawImage(st.ground, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    ctx.beginPath()
    ctx.rect(-10, HY + 1, BW + 20, BH)
    ctx.clip()

    // the cross lines of the grid, scrolling toward us with the bass
    st.scroll = (st.scroll + dt * (0.55 + c.bass * 0.9)) % CELL
    ctx.globalCompositeOperation = 'lighter'
    for (let n = 0; ; n++) {
      const z = 1.2 + n * CELL - st.scroll
      if (z > Z_FAR) break
      if (z <= 0.2) continue
      const y = groundY(z)
      if (y > BH + 10) continue
      const a = Math.min(1, 2.2 / z) * 0.85
      const w = Math.min(3, 0.6 + 2 / z)
      ctx.globalAlpha = a * 0.35
      ctx.fillStyle = `rgba(${P.grid},1)`
      ctx.fillRect(-10, y - w * 2, BW + 20, w * 4)
      ctx.globalAlpha = a
      ctx.fillRect(-10, y - w / 2, BW + 20, w)
    }

    // each kick sends a pulse of light down the grid
    if (c.kick > 0.75 && st.lastKick <= 0.75 && st.waves.length < 5) st.waves.push(Z_FAR * 0.6)
    st.lastKick = c.kick
    for (let i = st.waves.length - 1; i >= 0; i--) {
      const z = (st.waves[i] -= dt * (6 + st.waves[i] * 1.2))
      if (z < 0.9) {
        st.waves.splice(i, 1)
        continue
      }
      const y = groundY(z)
      const a = Math.min(1, 3 / z) * 0.55
      ctx.globalAlpha = a
      ctx.drawImage(st.pink, -200, y - 30, BW + 400, 60)
      ctx.fillStyle = 'rgba(255,220,245,1)'
      ctx.globalAlpha = a * 0.8
      ctx.fillRect(-10, y - 1, BW + 20, 2)
    }
    ctx.restore()

    // the horizon flares on impacts
    ctx.save()
    toBoard(ctx, st.v)
    ctx.globalCompositeOperation = 'lighter'
    const flare = 0.18 + c.impact * 0.6 + c.kick * 0.08
    ctx.globalAlpha = Math.min(1, flare)
    ctx.drawImage(st.gold, -300, HY - 40, BW + 600, 80)
    ctx.globalAlpha = Math.min(1, flare * 0.8)
    ctx.drawImage(st.pink, SUN_X - 700, HY - 60, 1400, 120)
    ctx.restore()

    // palms, then the CRT
    ctx.drawImage(st.front, 0, 0, width, height)
    ctx.drawImage(st.scan, 0, 0, width, height)
    ctx.restore()
  }
}
