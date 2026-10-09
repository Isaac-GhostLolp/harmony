import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🏜️ Desert — endless dunes on a world that isn't quite ours.
 *
 * At night the Milky Way crosses the sky and two moons hang over the sand,
 * a big pale one and a small rusty one; by day two suns set together over
 * the horizon. Four rows of dunes roll away, each with a sharp crest between
 * its lit side and its shadow, and the wind lifts veils of sand off the crests
 * (stronger with the cymbals). A caravan of camels walks slowly along a ridge,
 * lanterns swinging at night. Now and then a shooting star; and on a big hit,
 * far away, something huge breaks out of the sand — a giant worm arching
 * through the air before it dives back under.
 */

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: string
  skyMid: string
  skyLow: string
  stars: number
  lit: RGB[] // per dune row, far → near
  shade: RGB[]
  silhouette: string
  sand: string
  glow: string
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 7 && h < 18)
    return {
      key: 'suns',
      skyTop: '#2a1c52',
      skyMid: '#c4567a',
      skyLow: '#ffc27a',
      stars: 0.15,
      lit: [
        [236, 160, 120],
        [226, 138, 86],
        [214, 118, 66],
        [198, 100, 54]
      ],
      shade: [
        [150, 86, 100],
        [126, 62, 66],
        [98, 44, 46],
        [70, 30, 34]
      ],
      silhouette: '#2a1414',
      sand: '255,214,170',
      glow: '255,200,130'
    }
  return {
    key: 'night',
    skyTop: '#03040d',
    skyMid: '#0c1230',
    skyLow: '#2a2a52',
    stars: 1,
    lit: [
      [92, 100, 140],
      [80, 88, 128],
      [70, 76, 114],
      [62, 66, 100]
    ],
    shade: [
      [40, 44, 74],
      [30, 33, 60],
      [22, 24, 46],
      [14, 16, 32]
    ],
    silhouette: '#070912',
    sand: '200,210,240',
    glow: '210,220,255'
  }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/** Base line (y of the dune feet) for each row, far → near. */
const ROW_BASE = [520, 600, 700, 860]
const ROW_HEIGHT = [70, 110, 160, 220]

interface Dune {
  peakX: number
  peakY: number
  left: number
  right: number
}

/**
 * Dunes along a row. A dune is asymmetric: a long gentle windward slope on the
 * left (in the light) up to a sharp crest, then a short steep slip face on
 * the right (in shadow).
 */
function dunesFor(row: number): Dune[] {
  const r = rng(100 + row * 17)
  const out: Dune[] = []
  let x = -400
  while (x < BW + 300) {
    const w = 460 + r() * 560 + row * 140
    const peakX = x + w * (0.62 + r() * 0.16)
    out.push({ peakX, peakY: ROW_BASE[row] - ROW_HEIGHT[row] * (0.55 + r() * 0.45), left: x, right: x + w })
    x += w * (0.55 + r() * 0.2) // dunes overlap, so the row has no gaps
  }
  return out
}

function paintRow(g: CanvasRenderingContext2D, P: Pal, row: number, dunes: Dune[]): void {
  const base = ROW_BASE[row]
  const lit = P.lit[row]
  const shade = P.shade[row]
  const mid = lit.map((v, i) => (v * 0.45 + shade[i] * 0.55)) as RGB
  // the flat sand the dunes stand on (and that runs under the nearer rows)
  const ground = g.createLinearGradient(0, base - 10, 0, base + 200)
  ground.addColorStop(0, rgb(mid))
  ground.addColorStop(1, rgb(shade))
  g.fillStyle = ground
  g.fillRect(-300, base - 2, BW + 600, BH + 300)

  for (const d of dunes) {
    const { left, right, peakX, peakY } = d
    // windward profile (gentle, convex) and the slip face (steep, concave)
    const windward = (gg: CanvasRenderingContext2D): void => {
      gg.moveTo(left, base)
      gg.bezierCurveTo(left + (peakX - left) * 0.45, base - 4, peakX - (peakX - left) * 0.3, peakY + 2, peakX, peakY)
    }
    // the whole dune in shadow
    const sh = g.createLinearGradient(peakX, peakY, right, base)
    sh.addColorStop(0, rgb(shade))
    sh.addColorStop(1, rgb(shade.map((v) => v * 0.8) as RGB))
    g.fillStyle = sh
    g.beginPath()
    windward(g)
    g.bezierCurveTo(peakX + (right - peakX) * 0.18, peakY + (base - peakY) * 0.5, right - (right - peakX) * 0.35, base, right, base)
    g.closePath()
    g.fill()
    // the sunlit windward side, bounded by a curved crest line that runs down
    // from the summit into the trough, so the dune reads as a 3D shape
    const lg = g.createLinearGradient(left, base, peakX, peakY)
    lg.addColorStop(0, rgb(mid))
    lg.addColorStop(1, rgb(lit))
    g.fillStyle = lg
    g.beginPath()
    windward(g)
    g.bezierCurveTo(peakX + 8, peakY + (base - peakY) * 0.35, peakX + (right - peakX) * 0.05, base - (base - peakY) * 0.15, peakX + (right - peakX) * 0.32, base)
    g.closePath()
    g.fill()
    // a thin bright edge right on the crest
    g.strokeStyle = rgb(lit.map((v) => Math.min(255, v * 1.22)) as RGB, 0.75)
    g.lineWidth = 1.2 + row * 0.5
    g.beginPath()
    g.moveTo(peakX - (peakX - left) * 0.22, peakY + (base - peakY) * 0.06)
    g.quadraticCurveTo(peakX - 12, peakY, peakX, peakY)
    g.stroke()
  }

  // wind ripples on the nearest rows
  if (row >= 2) {
    const r = rng(9 + row)
    g.strokeStyle = rgb(shade, 0.3)
    g.lineWidth = 1.1
    for (let i = 0; i < 60 * row; i++) {
      const x = r() * BW
      const y = base - ROW_HEIGHT[row] * 0.35 + r() * (BH - base + ROW_HEIGHT[row])
      const w = 30 + r() * 60
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x + w / 2, y - 4, x + w, y + 1)
      g.stroke()
    }
  }
}

function paintSky(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, 560)
  sky.addColorStop(0, P.skyTop)
  sky.addColorStop(0.6, P.skyMid)
  sky.addColorStop(1, P.skyLow)
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, BH + 600)
  const r = rng(2)
  // the Milky Way: a diagonal band of glow and dust and many small stars
  g.save()
  g.translate(800, 260)
  g.rotate(-0.42)
  if (P.stars > 0.5) {
    for (let i = 0; i < 40; i++) {
      const x = (r() - 0.5) * 1900
      const y = (r() - 0.5) * 120
      const grd = g.createRadialGradient(x, y, 0, x, y, 90 + r() * 120)
      grd.addColorStop(0, `rgba(${r() < 0.5 ? '200,190,255' : '255,220,200'},${0.07 + r() * 0.07})`)
      grd.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grd
      g.fillRect(x - 220, y - 220, 440, 440)
    }
    for (let i = 0; i < 1400; i++) {
      const x = (r() - 0.5) * 1900
      const y = (r() + r() + r() - 1.5) * 90
      g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`
      g.fillRect(x, y, 1, 1)
    }
    // the dark dust lane
    g.fillStyle = 'rgba(5,6,16,0.12)'
    for (let i = 0; i < 26; i++) {
      g.beginPath()
      g.ellipse((r() - 0.5) * 1700, (r() - 0.5) * 30, 60 + r() * 120, 8 + r() * 14, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.restore()
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.2 + r() * 0.6) * P.stars})`
    const s = r() < 0.94 ? 1 : 2
    g.fillRect(r() * BW, r() * 470, s, s)
  }
  if (P.key === 'night') {
    // the two moons
    // on the left, like the light on the dunes' windward faces
    moon(g, 360, 165, 70, '#eef0ff', '#b8bedc')
    moon(g, 520, 250, 22, '#f2c8a8', '#b47c62')
  } else {
    // twin suns, low over the dunes
    sun(g, 590, 392, 46, '255,240,200')
    sun(g, 700, 418, 28, '255,170,110')
  }
}

function moon(g: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string): void {
  const halo = g.createRadialGradient(x, y, r, x, y, r * 4)
  halo.addColorStop(0, 'rgba(220,226,255,0.22)')
  halo.addColorStop(1, 'rgba(220,226,255,0)')
  g.fillStyle = halo
  g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8)
  const body = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
  body.addColorStop(0, light)
  body.addColorStop(1, dark)
  g.fillStyle = body
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  const cr = rng(Math.round(x))
  g.fillStyle = 'rgba(80,80,110,0.12)'
  for (let i = 0; i < 9; i++) {
    g.beginPath()
    g.arc(x + (cr() - 0.5) * r * 1.2, y + (cr() - 0.5) * r * 1.2, r * (0.08 + cr() * 0.18), 0, Math.PI * 2)
    g.fill()
  }
}

function sun(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  const halo = g.createRadialGradient(x, y, r * 0.6, x, y, r * 6)
  halo.addColorStop(0, `rgba(${col},0.55)`)
  halo.addColorStop(0.3, `rgba(${col},0.18)`)
  halo.addColorStop(1, `rgba(${col},0)`)
  g.fillStyle = halo
  g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12)
  g.fillStyle = `rgb(${col})`
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Grain {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
  s: number
}

interface State {
  v: View
  P: Pal
  sky: Layer
  rows: Layer[]
  dunes: Dune[][]
  ridge: Float32Array
  dust: Layer
  glow: Layer
  lantern: Layer
  grains: Grain[]
  camels: { x: number; y: number; ph: number; rider: boolean; lamp: boolean }[]
  worm: { x: number; t: number } | null
  nextWorm: number
  meteors: { x: number; y: number; t: number }[]
}

let S: State | null = null

const bez = (a: number, b: number, c: number, d: number, t: number): number =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d

/**
 * The top of a row of dunes, every 4 board px (the caravan walks on it).
 * Sampled from the same curves paintRow draws.
 */
function ridgeMap(dunes: Dune[], base: number): Float32Array {
  const map = new Float32Array(Math.ceil((BW + 800) / 4)).fill(base)
  // every segment between two samples fills all the cells it spans (sparse
  // samples left cells at the ground level, and the camels dropped into them)
  const seg = (x0: number, y0: number, x1: number, y1: number): void => {
    const a = Math.round((Math.min(x0, x1) + 400) / 4)
    const b = Math.round((Math.max(x0, x1) + 400) / 4)
    for (let i = Math.max(0, a); i <= Math.min(map.length - 1, b); i++) {
      const x = i * 4 - 400
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0)
      const y = y0 + (y1 - y0) * Math.max(0, Math.min(1, t))
      if (y < map[i]) map[i] = y
    }
  }
  const curve = (px: number[], py: number[]): void => {
    let lx = bez(px[0], px[1], px[2], px[3], 0)
    let ly = bez(py[0], py[1], py[2], py[3], 0)
    for (let k = 1; k <= 60; k++) {
      const t = k / 60
      const x = bez(px[0], px[1], px[2], px[3], t)
      const y = bez(py[0], py[1], py[2], py[3], t)
      seg(lx, ly, x, y)
      lx = x
      ly = y
    }
  }
  for (const d of dunes) {
    const { left, right, peakX, peakY } = d
    curve([left, left + (peakX - left) * 0.45, peakX - (peakX - left) * 0.3, peakX], [base, base - 4, peakY + 2, peakY])
    curve([peakX, peakX + (right - peakX) * 0.18, right - (right - peakX) * 0.35, right], [peakY, peakY + (base - peakY) * 0.5, base, base])
  }
  // a gentle smoothing: animals take the slip faces at an angle, not straight down
  const out = new Float32Array(map.length)
  const R = 6 // ±24 px
  for (let i = 0; i < map.length; i++) {
    let sum = 0
    let n = 0
    for (let k = -R; k <= R; k++) {
      const j = i + k
      if (j < 0 || j >= map.length) continue
      sum += map[j]
      n++
    }
    out[i] = sum / n
  }
  return out
}

function ridgeY(map: Float32Array, x: number): number {
  const f = Math.max(0, Math.min(map.length - 1.001, (x + 400) / 4))
  const i = Math.floor(f)
  return map[i] + (map[i + 1] - map[i]) * (f - i)
}

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const dunes = [0, 1, 2, 3].map(dunesFor)
  return {
    v,
    P,
    sky: makeLayer(v, (g) => paintSky(g, P)),
    rows: dunes.map((d, i) => makeLayer(v, (g) => paintRow(g, P, i, d))),
    dunes,
    ridge: ridgeMap(dunes[1], ROW_BASE[1]),
    dust: glowSprite(P.sand, 64),
    glow: glowSprite(P.glow),
    lantern: glowSprite('255,180,90', 48),
    grains: [],
    camels: Array.from({ length: 6 }, (_, i) => ({ x: 300 + i * 46, y: -1, ph: i * 1.3, rider: i % 2 === 0, lamp: i === 0 || i === 3 })),
    worm: null,
    nextWorm: 40,
    meteors: []
  }
}

function drawCamel(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ph: number, rider: boolean): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.beginPath()
  // body with its hump
  ctx.moveTo(-16, -16)
  ctx.quadraticCurveTo(-14, -30, -4, -30)
  ctx.quadraticCurveTo(2, -40, 8, -30)
  ctx.quadraticCurveTo(16, -28, 16, -18)
  ctx.lineTo(18, -20)
  // neck and head
  ctx.quadraticCurveTo(24, -30, 26, -38)
  ctx.lineTo(33, -36)
  ctx.lineTo(32, -32)
  ctx.lineTo(28, -32)
  ctx.quadraticCurveTo(26, -22, 18, -12)
  ctx.lineTo(-16, -12)
  ctx.closePath()
  ctx.fill()
  // legs, walking
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  const sw = Math.sin(ph) * 4
  ctx.moveTo(-12, -13)
  ctx.lineTo(-12 + sw, 2)
  ctx.moveTo(-7, -13)
  ctx.lineTo(-7 - sw, 2)
  ctx.moveTo(10, -13)
  ctx.lineTo(10 - sw, 2)
  ctx.moveTo(14, -13)
  ctx.lineTo(14 + sw, 2)
  ctx.stroke()
  if (rider) {
    ctx.beginPath()
    ctx.moveTo(-2, -36)
    ctx.lineTo(-6, -50)
    ctx.lineTo(2, -50)
    ctx.lineTo(4, -36)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(-2, -54, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * The worm: a thick ringed body travelling along an arc — out of the sand on
 * the left, over the top, back under on the right. `t` runs 0 → 2; the head
 * sits at angle π − tπ and the body trails it along the arc; only the part
 * above the sand (angles 0..π) is drawn.
 */
function drawWorm(ctx: CanvasRenderingContext2D, x: number, base: number, t: number, col: string): void {
  const R = 150
  const L = Math.PI * 0.95 // body length, as an angle
  const head = Math.PI - t * Math.PI
  const from = Math.max(0, head)
  const to = Math.min(Math.PI, head + L)
  if (to <= from) return
  ctx.save()
  const steps = 28
  // tail first, so the head is drawn on top
  for (let k = steps; k >= 0; k--) {
    const a = from + ((to - from) * k) / steps
    const along = (a - head) / L // 0 at the head, 1 at the tail
    const thick = 40 * (1 - along * 0.55)
    const px = x + Math.cos(a) * R
    const py = base - Math.sin(a) * R
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(px, py, thick / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,230,200,0.14)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, py, thick / 2 - 2, -a - 1.4, -a + 0.1)
    ctx.stroke()
  }
  if (head > 0) {
    // the open, ringed mouth
    const hx = x + Math.cos(head) * R
    const hy = base - Math.sin(head) * R
    ctx.translate(hx, hy)
    ctx.rotate(-head - Math.PI / 2)
    ctx.fillStyle = '#05030a'
    ctx.beginPath()
    ctx.ellipse(0, -6, 17, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,220,180,0.35)'
    ctx.lineWidth = 1.5
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * 6, -6 + Math.sin(a) * 3)
      ctx.lineTo(Math.cos(a) * 15, -6 + Math.sin(a) * 8)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const desertWorld: World = {
  id: 'desert',
  name: 'Deserto',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    S = build(c)
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
    // the moons (or suns) breathe a little with the music
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.12 + 0.08 * c.breath + c.surge * 0.15
    if (P.key === 'night') ctx.drawImage(st.glow, 360 - 260, 165 - 260, 520, 520)
    else ctx.drawImage(st.glow, 640 - 320, 405 - 320, 640, 640)
    // shooting stars
    if (P.key === 'night' && (Math.random() < dt * (0.08 + c.surge * 0.6) || c.impactHit)) st.meteors.push({ x: 200 + Math.random() * 1200, y: 40 + Math.random() * 200, t: 0 })
    for (let i = st.meteors.length - 1; i >= 0; i--) {
      const m = st.meteors[i]
      m.t += dt
      if (m.t > 0.9) {
        st.meteors.splice(i, 1)
        continue
      }
      const hx = m.x + m.t * 420
      const hy = m.y + m.t * 160
      const grd = ctx.createLinearGradient(hx - 110, hy - 42, hx, hy)
      grd.addColorStop(0, 'rgba(255,255,255,0)')
      grd.addColorStop(1, `rgba(255,255,255,${0.8 * (1 - m.t / 0.9)})`)
      ctx.strokeStyle = grd
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(hx - 110, hy - 42)
      ctx.lineTo(hx, hy)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.rows[0], 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // the worm, far away between the first two rows of dunes
    st.nextWorm -= dt
    if (!st.worm && (st.nextWorm <= 0 || (c.impactHit && st.nextWorm < 25))) {
      st.worm = { x: 350 + Math.random() * 900, t: 0 }
      st.nextWorm = 45 + Math.random() * 30
    }
    if (st.worm) {
      const w = st.worm
      w.t += dt / 3.2
      const base = ROW_BASE[1] - 30
      drawWorm(ctx, w.x, base, w.t, P.key === 'night' ? '#141826' : '#5a2a22')
      // sand bursting where it breaks out and where it dives
      if (Math.random() < 0.9) {
        for (const ex of [w.x - 150, w.x + 150]) {
          const active = ex < w.x ? w.t < 1 : w.t > 1 && w.t < 1.95
          if (!active) continue
          st.grains.push({ x: ex + (Math.random() - 0.5) * 40, y: base, vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 140, t: 0, life: 1.6, s: 30 + Math.random() * 30 })
        }
      }
      if (w.t >= 2) st.worm = null
    }
    ctx.restore()

    ctx.drawImage(st.rows[1], 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // the caravan along the second row's ridges
    const cs = 0.9
    for (const cm of st.camels) {
      cm.x += 14 * dt
      cm.ph += dt * 4.2
      if (cm.x > BW + 60) {
        cm.x -= BW + 400
        cm.y = -1
      }
      // ease toward the path, so there's never a jolt
      const want = ridgeY(st.ridge, cm.x) + 2
      cm.y = cm.y < 0 ? want : cm.y + (want - cm.y) * Math.min(1, dt * 6)
      const y = cm.y
      ctx.fillStyle = P.silhouette
      ctx.strokeStyle = P.silhouette
      drawCamel(ctx, cm.x, y, cs, cm.ph, cm.rider)
      if (cm.lamp && P.key === 'night') {
        ctx.globalCompositeOperation = 'lighter'
        const sw = Math.sin(cm.ph * 0.5) * 3
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 7 + cm.x)
        ctx.drawImage(st.lantern, cm.x + 26 * cs + sw - 10, y - 40 * cs - 10, 20, 20)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()

    ctx.drawImage(st.rows[2], 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // wind lifting veils of sand off the crests (the cymbals push it)
    const wind = 0.3 + c.hihats * 0.9 + c.energy * 0.4 + c.surge * 0.6
    for (const row of [1, 2, 3]) {
      for (const d of st.dunes[row]) {
        if (d.peakX < -50 || d.peakX > BW + 50) continue
        if (Math.random() < dt * 6 * wind) {
          st.grains.push({ x: d.peakX + (Math.random() - 0.5) * 20, y: d.peakY + 2, vx: 60 + Math.random() * 80, vy: -8 - Math.random() * 14, t: 0, life: 2 + Math.random(), s: 18 + row * 10 })
        }
      }
    }
    ctx.globalCompositeOperation = P.key === 'night' ? 'lighter' : 'source-over'
    for (let i = st.grains.length - 1; i >= 0; i--) {
      const gr = st.grains[i]
      gr.t += dt
      if (gr.t > gr.life) {
        st.grains.splice(i, 1)
        continue
      }
      gr.x += gr.vx * dt
      gr.y += gr.vy * dt
      gr.vy += 40 * dt
      const a = Math.sin((gr.t / gr.life) * Math.PI) * (gr.s > 40 ? 0.22 : 0.1)
      const s = gr.s * (1 + gr.t * 0.8)
      ctx.globalAlpha = a
      // veils off the crests are long thin streaks along the wind; the worm's
      // bursts stay round
      if (gr.s > 40) ctx.drawImage(st.dust, gr.x - s / 2, gr.y - s / 2, s, s * 0.6)
      else ctx.drawImage(st.dust, gr.x - s * 1.6, gr.y - s * 0.12, s * 3.2, s * 0.24)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.rows[3], 0, 0, width, height)

    // haze near the horizon and a vignette
    const vign = ctx.createRadialGradient(width / 2, height * 0.5, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.8)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, P.key === 'night' ? 'rgba(0,0,10,0.55)' : 'rgba(40,10,20,0.4)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
