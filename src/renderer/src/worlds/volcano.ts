import type { World, WorldContext } from './types'
import { ParticlePool } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🌋 Volcano — a dark volcanic night lit by glowing lava. Hot, moody, alive.
 *
 * A big cone stands over a cracked plain: rivers of lava crawl down its
 * flanks, a smoke plume rises from the crater lit orange from below, and a
 * lava river runs across the foreground, its dark crust plates slowly
 * drifting on the molten stream. Embers rise and fade, ash drifts down, and
 * the cracks in the ground pulse with molten light. A dead tree stands on
 * the rocks at the left.
 *
 * The music: the lava glow swells on the kick and the cracks breathe with it;
 * the big moments throw a small eruption of lava bombs (and, rarely, a
 * lightning bolt inside the ash plume). Every now and then the volcano
 * erupts by itself.
 *
 * The clock changes the light: a hazy ash-brown day, a crimson dusk, the night.
 */

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: RGB
  skyMid: RGB
  skyLow: RGB
  far: RGB
  cone: RGB
  ground: RGB
  smoke: RGB
  ash: string
  /** how much the lava dominates the light */
  lava: number
  stars: number
  sun: { x: number; y: number; r: number; rgb: string; a: number } | null
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 16.5)
    return {
      key: 'day',
      skyTop: [86, 78, 76],
      skyMid: [138, 116, 98],
      skyLow: [182, 146, 108],
      far: [104, 90, 86],
      cone: [46, 37, 34],
      ground: [50, 41, 36],
      smoke: [74, 68, 66],
      ash: '70,64,60',
      lava: 0.55,
      stars: 0,
      sun: { x: 360, y: 190, r: 46, rgb: '255,226,180', a: 0.55 }
    }
  if ((h >= 16.5 && h < 19.5) || (h >= 5.5 && h < 8))
    return {
      key: 'dusk',
      skyTop: [26, 16, 42],
      skyMid: [92, 32, 46],
      skyLow: [206, 88, 46],
      far: [56, 28, 40],
      cone: [26, 14, 17],
      ground: [24, 13, 13],
      smoke: [84, 58, 62],
      ash: '120,100,100',
      lava: 0.85,
      stars: 0.25,
      sun: { x: 290, y: 560, r: 70, rgb: '255,120,60', a: 0.9 }
    }
  return {
    key: 'night',
    skyTop: [7, 5, 10],
    skyMid: [24, 10, 14],
    skyLow: [88, 26, 12],
    far: [26, 14, 18],
    cone: [17, 10, 10],
    ground: [15, 9, 8],
    smoke: [64, 48, 46],
    ash: '150,138,132',
    lava: 1,
    stars: 1,
    sun: null
  }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// ---------------------------------------------------------------------------
// geometry (board coordinates)
// ---------------------------------------------------------------------------

const CRATER = { x: 970, y: 268 }
/** the board region the smoke plume lives in, and its buffer's scale */
const PLUME = { x: 560, y: -440, w: 1080, h: 860, s: 0.3 }
const PLAIN_Y = 700

/** The cone's outline. */
function conePath(g: CanvasRenderingContext2D | Path2D): void {
  g.moveTo(380, 760)
  g.lineTo(380, 712)
  g.quadraticCurveTo(760, 668, 900, 270)
  g.lineTo(930, 258)
  g.quadraticCurveTo(970, 290, 1010, 255)
  g.lineTo(1042, 266)
  g.quadraticCurveTo(1150, 660, 1580, 716)
  g.lineTo(1580, 760)
  g.closePath()
}

/** Height of the cone's surface per 4px column (for the lava bombs to land on). */
const SURF: number[] = (() => {
  const s = new Array(BW / 4 + 1).fill(9999)
  const quad = (p0: number[], c: number[], p1: number[]): void => {
    for (let t = 0; t <= 1; t += 0.002) {
      const u = 1 - t
      const x = u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0]
      const y = u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]
      const i = Math.round(x / 4)
      if (i >= 0 && i < s.length) s[i] = Math.min(s[i], y)
    }
  }
  // (a straight segment is a quad with its control point in the middle)
  quad([380, 712], [760, 668], [900, 270])
  quad([900, 270], [915, 264], [930, 258])
  quad([930, 258], [970, 290], [1010, 255])
  quad([1010, 255], [1026, 260.5], [1042, 266])
  quad([1042, 266], [1150, 660], [1580, 716])
  for (let i = 0; i < s.length; i++) s[i] = Math.min(s[i], PLAIN_Y + 8)
  return s
})()
const surfY = (x: number): number => SURF[Math.max(0, Math.min(SURF.length - 1, Math.round(x / 4)))]

/** The foreground lava river: centre line and half width. */
const riverY = (x: number): number => 808 + 20 * Math.sin(x * 0.0042 + 1) + 9 * Math.sin(x * 0.011 + 0.4)
const riverHW = (x: number): number => 30 + 9 * Math.sin(x * 0.006 + 2)

function riverPath(): Path2D {
  const p = new Path2D()
  p.moveTo(-20, riverY(-20) - riverHW(-20))
  for (let x = 0; x <= BW + 20; x += 20) p.lineTo(x, riverY(x) - riverHW(x))
  for (let x = BW + 20; x >= -20; x -= 20) p.lineTo(x, riverY(x) + riverHW(x))
  p.closePath()
  return p
}

/** The lava rivers crawling down the cone, and where each one reaches the plain. */
function flankRivers(): { paths: Path2D[]; ends: { x: number; y: number }[] } {
  const r = rng(41)
  const paths: Path2D[] = []
  const ends: { x: number; y: number }[] = []
  for (const { x: x0, dir } of [
    { x: 926, dir: -0.42 },
    { x: 972, dir: 0.05 },
    { x: 1018, dir: 0.5 }
  ]) {
    const p = new Path2D()
    let x = x0
    let y = surfY(x0) + 6
    p.moveTo(x, y)
    while (y < PLAIN_Y - 6) {
      y += 16
      x += dir * 12 + (r() - 0.5) * 12
      // keep it on the cone
      if (y < surfY(x) + 4) y = surfY(x) + 4
      p.lineTo(x, y)
    }
    paths.push(p)
    ends.push({ x, y })
  }
  return { paths, ends }
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

interface Geo {
  rivers: Path2D[]
  river: Path2D
  riverEnds: { x: number; y: number }[]
}

function paintBack(g: CanvasRenderingContext2D, P: Pal, geo: Geo): void {
  const r = rng(7)
  // sky
  const sky = g.createLinearGradient(0, 0, 0, PLAIN_Y)
  sky.addColorStop(0, rgb(P.skyTop))
  sky.addColorStop(0.55, rgb(P.skyMid))
  sky.addColorStop(1, rgb(P.skyLow))
  g.fillStyle = sky
  g.fillRect(-10, -10, BW + 20, PLAIN_Y + 20)

  // stars, faint behind the haze
  if (P.stars > 0) {
    for (let i = 0; i < 260; i++) {
      const x = r() * BW
      const y = r() * 420
      const a = (0.15 + r() * 0.6) * P.stars * (1 - y / 520)
      g.fillStyle = `rgba(255,${220 + r() * 30},${200 + r() * 40},${a})`
      g.fillRect(x, y, r() < 0.1 ? 2 : 1.2, r() < 0.1 ? 2 : 1.2)
    }
  }

  // the sun through the ash
  if (P.sun) {
    const s = P.sun
    const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5)
    halo.addColorStop(0, `rgba(${s.rgb},${s.a * 0.35})`)
    halo.addColorStop(1, `rgba(${s.rgb},0)`)
    g.fillStyle = halo
    g.fillRect(s.x - s.r * 5, s.y - s.r * 5, s.r * 10, s.r * 10)
    g.fillStyle = `rgba(${s.rgb},${s.a})`
    g.beginPath()
    g.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    g.fill()
  }

  // a band of haze over the horizon
  const haze = g.createLinearGradient(0, 420, 0, PLAIN_Y)
  haze.addColorStop(0, rgb(P.skyLow, 0))
  haze.addColorStop(1, rgb(P.skyLow, 0.5))
  g.fillStyle = haze
  g.fillRect(-10, 420, BW + 20, PLAIN_Y - 420)

  // two far ranges, hazy
  for (let row = 0; row < 2; row++) {
    const base = 590 + row * 42
    const k = row === 0 ? 0.55 : 0.8
    g.fillStyle = rgb([
      P.far[0] * k + P.skyLow[0] * (1 - k),
      P.far[1] * k + P.skyLow[1] * (1 - k),
      P.far[2] * k + P.skyLow[2] * (1 - k)
    ] as RGB)
    g.beginPath()
    g.moveTo(-10, PLAIN_Y + 20)
    let y = base
    for (let x = -10; x <= BW + 20; x += 24) {
      y += (r() - 0.5) * 22
      y = Math.max(base - 60 + row * 10, Math.min(base + 30, y))
      g.lineTo(x, y)
    }
    g.lineTo(BW + 20, PLAIN_Y + 20)
    g.closePath()
    g.fill()
  }

  // the cone
  g.save()
  const cone = new Path2D()
  conePath(cone)
  const cg = g.createLinearGradient(380, 0, 1580, 0)
  cg.addColorStop(0, rgb(P.cone.map((c) => c * 1.25) as RGB))
  cg.addColorStop(0.5, rgb(P.cone))
  cg.addColorStop(1, rgb(P.cone.map((c) => c * 0.75) as RGB))
  g.fillStyle = cg
  g.fill(cone)
  g.clip(cone)
  // gullies running down the flanks
  for (let i = 0; i < 360; i++) {
    const x = 420 + r() * 1140
    const top = surfY(x)
    if (top > PLAIN_Y) continue
    const y = top + r() * (PLAIN_Y - top)
    const len = 18 + r() * 60
    const dx = (x - CRATER.x) / Math.max(60, y - CRATER.y + 60)
    const light = r() < 0.35
    g.strokeStyle = light ? `rgba(255,150,100,${0.04 + r() * 0.05})` : `rgba(0,0,0,${0.18 + r() * 0.2})`
    g.lineWidth = 1 + r() * 2.5
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + dx * len * 0.5 + (r() - 0.5) * 8, y + len * 0.5, x + dx * len, y + len)
    g.stroke()
  }
  // warm light from the crater and from the lava at the foot
  const top = g.createRadialGradient(CRATER.x, CRATER.y, 0, CRATER.x, CRATER.y, 340)
  top.addColorStop(0, `rgba(255,96,30,${0.32 * P.lava})`)
  top.addColorStop(1, 'rgba(255,96,30,0)')
  g.fillStyle = top
  g.fillRect(500, 200, 940, 500)
  const foot = g.createLinearGradient(0, 520, 0, PLAIN_Y + 10)
  foot.addColorStop(0, 'rgba(255,80,20,0)')
  foot.addColorStop(1, `rgba(255,80,20,${0.22 * P.lava})`)
  g.fillStyle = foot
  g.fillRect(380, 520, 1200, 200)
  // crusted channels under the lava rivers
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = 'rgba(60,14,6,0.9)'
  g.lineWidth = 15
  for (const p of geo.rivers) g.stroke(p)
  g.strokeStyle = 'rgba(150,34,8,0.9)'
  g.lineWidth = 7
  for (const p of geo.rivers) g.stroke(p)
  g.restore()

  // the crater's inner lip, glowing
  const lip = g.createRadialGradient(CRATER.x, CRATER.y + 4, 0, CRATER.x, CRATER.y + 4, 46)
  lip.addColorStop(0, 'rgba(255,214,110,0.95)')
  lip.addColorStop(0.45, 'rgba(255,110,30,0.6)')
  lip.addColorStop(1, 'rgba(255,60,10,0)')
  g.fillStyle = lip
  g.beginPath()
  g.ellipse(CRATER.x, CRATER.y + 2, 46, 14, 0, 0, Math.PI * 2)
  g.fill()

  // the plain
  g.fillStyle = rgb(P.ground)
  g.beginPath()
  g.moveTo(-10, BH + 10)
  for (let x = -10; x <= BW + 20; x += 40) g.lineTo(x, PLAIN_Y + 4 + Math.sin(x * 0.01) * 5 + r() * 4)
  g.lineTo(BW + 20, BH + 10)
  g.closePath()
  g.fill()
  // rubble on the plain
  for (let i = 0; i < 420; i++) {
    const x = r() * BW
    const y = PLAIN_Y + 10 + Math.pow(r(), 0.8) * (BH - PLAIN_Y)
    const s = 1 + ((y - PLAIN_Y) / (BH - PLAIN_Y)) * 6 * r()
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.35)' : rgb(P.ground.map((c) => c * 1.5) as RGB, 0.5)
    g.beginPath()
    g.ellipse(x, y, s * 1.6, s * 0.7, 0, 0, Math.PI * 2)
    g.fill()
  }
  // the ground lit by the lava river
  const lit = g.createLinearGradient(0, 700, 0, BH)
  lit.addColorStop(0, 'rgba(255,90,25,0)')
  lit.addColorStop(0.55, `rgba(255,90,25,${0.16 * P.lava})`)
  lit.addColorStop(1, `rgba(255,90,25,${0.05 * P.lava})`)
  g.fillStyle = lit
  g.fillRect(-10, 700, BW + 20, BH - 690)

  // the foreground lava river (its molten base; the crust floats on it live)
  g.save()
  g.fillStyle = '#c8400c'
  g.fill(geo.river)
  g.clip(geo.river)
  g.filter = 'blur(7px)'
  g.strokeStyle = '#ff8a2a'
  g.lineWidth = 34
  g.beginPath()
  for (let x = -20; x <= BW + 20; x += 20) g.lineTo(x, riverY(x))
  g.stroke()
  g.strokeStyle = '#ffd27a'
  g.lineWidth = 10
  g.stroke()
  g.filter = 'none'
  g.restore()
  // dark banks
  g.save()
  g.filter = 'blur(3px)'
  g.strokeStyle = 'rgba(10,4,2,0.7)'
  g.lineWidth = 6
  g.stroke(geo.river)
  g.restore()
}

/** Everything molten that glows; drawn additively at the lava's heat. */
function paintGlow(g: CanvasRenderingContext2D, geo: Geo): void {
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.save()
  g.filter = 'blur(10px)'
  g.strokeStyle = 'rgba(255,70,15,0.5)'
  g.lineWidth = 26
  for (const p of geo.rivers) g.stroke(p)
  g.restore()
  g.strokeStyle = 'rgba(255,120,30,0.85)'
  g.lineWidth = 6
  for (const p of geo.rivers) g.stroke(p)
  g.strokeStyle = 'rgba(255,226,140,0.9)'
  g.lineWidth = 2.2
  for (const p of geo.rivers) g.stroke(p)
  // pools where the rivers reach the plain
  for (const e of geo.riverEnds) {
    const p = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, 60)
    p.addColorStop(0, 'rgba(255,150,50,0.7)')
    p.addColorStop(1, 'rgba(255,60,10,0)')
    g.fillStyle = p
    g.beginPath()
    g.ellipse(e.x, e.y, 60, 18, 0, 0, Math.PI * 2)
    g.fill()
  }
  // the air above the foreground river
  g.save()
  g.filter = 'blur(26px)'
  g.strokeStyle = 'rgba(255,90,20,0.35)'
  g.lineWidth = 120
  g.beginPath()
  for (let x = -60; x <= BW + 60; x += 30) g.lineTo(x, riverY(x) - 20)
  g.stroke()
  g.restore()
}

/** The cracks in the plain, which breathe with the kick. */
function paintCracks(g: CanvasRenderingContext2D): void {
  const r = rng(23)
  const segs: number[][] = []
  const walk = (x: number, y: number, ang: number, n: number, w: number): void => {
    for (let i = 0; i < n; i++) {
      const len = 10 + r() * 18
      ang += (r() - 0.5) * 1.1
      const nx = x + Math.cos(ang) * len
      const ny = y + Math.sin(ang) * len * 0.45
      segs.push([x, y, nx, ny, w])
      x = nx
      y = ny
      if (r() < 0.22 && w > 0.8) walk(x, y, ang + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), 3 + Math.floor(r() * 5), w * 0.6)
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * BW
    let y = PLAIN_Y + 14 + r() * (BH - PLAIN_Y - 20)
    // not inside the river
    if (Math.abs(y - riverY(x)) < riverHW(x) + 12) y = riverY(x) + (y < riverY(x) ? -1 : 1) * (riverHW(x) + 20)
    walk(x, y, r() * Math.PI * 2, 6 + Math.floor(r() * 8), 1.4 + ((y - PLAIN_Y) / (BH - PLAIN_Y)) * 2)
  }
  // only on the plain, never across the river
  const area = new Path2D()
  area.rect(-10, PLAIN_Y + 8, BW + 20, BH)
  area.addPath(riverPath())
  g.clip(area, 'evenodd')
  g.lineCap = 'round'
  for (const pass of [
    { blur: 'blur(4px)', col: 'rgba(255,80,20,0.55)', mul: 4 },
    { blur: 'none', col: 'rgba(255,130,40,0.9)', mul: 1 },
    { blur: 'none', col: 'rgba(255,220,140,0.8)', mul: 0.4 }
  ]) {
    g.filter = pass.blur
    g.strokeStyle = pass.col
    for (const [x0, y0, x1, y1, w] of segs) {
      g.lineWidth = w * pass.mul
      g.beginPath()
      g.moveTo(x0, y0)
      g.lineTo(x1, y1)
      g.stroke()
    }
  }
  g.filter = 'none'
}

/** Basalt in the foreground, rim-lit by the river, and a dead tree. */
function paintFront(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(77)
  const dark = rgb(P.ground.map((c) => c * 0.45) as RGB)
  const rock = (pts: number[][]): void => {
    g.fillStyle = dark
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (const p of pts) g.lineTo(p[0], p[1])
    g.closePath()
    g.fill()
    // rim light on the upper edge
    g.save()
    g.filter = 'blur(1.5px)'
    g.strokeStyle = `rgba(255,110,40,${0.45 * P.lava + 0.1})`
    g.lineWidth = 2.2
    g.beginPath()
    for (let i = 1; i < pts.length - 1; i++) g.lineTo(pts[i][0], pts[i][1])
    g.stroke()
    g.restore()
  }
  const jag = (x0: number, x1: number, yAt: (x: number) => number, step = 26): number[][] => {
    const pts: number[][] = [[x0, BH + 10]]
    for (let x = x0; x <= x1; x += step) pts.push([x, yAt(x) + (r() - 0.5) * 16])
    pts.push([x1, BH + 10])
    return pts
  }
  // left cluster
  rock(jag(-20, 400, (x) => 610 + Math.pow(x / 400, 1.6) * 290))
  // right corner
  rock(jag(1330, BW + 20, (x) => 900 - Math.pow((x - 1330) / 290, 0.7) * 190))
  // a few boulders along the bottom
  for (let i = 0; i < 7; i++) {
    const cx = 420 + r() * 900
    const w = 40 + r() * 70
    const h = 14 + r() * 22
    rock([
      [cx - w, BH + 10],
      [cx - w * 0.8, BH - h * 0.6],
      [cx - w * 0.3, BH - h],
      [cx + w * 0.4, BH - h * 0.85],
      [cx + w, BH + 10]
    ])
  }

  // the dead tree, standing on the left rocks
  g.strokeStyle = dark
  g.lineCap = 'round'
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number): void => {
    const nx = x + Math.cos(ang) * len
    const ny = y + Math.sin(ang) * len
    const bend = (r() - 0.5) * 0.6
    const cx = x + Math.cos(ang + bend) * len * 0.5
    const cy = y + Math.sin(ang + bend) * len * 0.5
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(cx, cy, nx, ny)
    g.stroke()
    if (depth <= 0) return
    // children carry on from where the branch was heading
    const on = Math.atan2(ny - cy, nx - cx) * 0.75 + (-Math.PI / 2) * 0.25
    const n = depth > 4 ? 2 : 2 + (r() < 0.4 ? 1 : 0)
    for (let i = 0; i < n; i++) branch(nx, ny, on + (r() - 0.5) * 0.5 + (i - (n - 1) / 2) * 0.55, len * (0.58 + r() * 0.12), w * 0.66, depth - 1)
  }
  branch(188, 716, -Math.PI / 2 - 0.08, 125, 13, 6)
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Plate {
  x: number
  off: number
  speed: number
  pts: number[]
}

interface Puff {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  age: number
  life: number
  kind: number
}

interface Bomb {
  x: number
  y: number
  vx: number
  vy: number
  alive: boolean
}

interface Spot {
  x: number
  y: number
  t: number
}

interface State {
  v: View
  P: Pal
  back: Layer
  glow: Layer
  cracks: Layer
  front: Layer
  geo: Geo
  smoke: Layer[]
  plume: Layer
  warm: Layer
  hot: Layer
  violet: Layer
  plates: Plate[]
  puffs: Puff[]
  bombs: Bomb[]
  spots: Spot[]
  heat: number
  erupt: number
  pending: number
  nextErupt: number
  cooldown: number
  bolt: { pts: number[]; t: number }
  flash: number
  puffClock: number
}

let S: State | null = null
const embers = new ParticlePool(120)
const ash = new ParticlePool(110)

function smokeSprite(seed: number, col: RGB): Layer {
  const c = document.createElement('canvas')
  c.width = c.height = 160
  const g = c.getContext('2d')!
  g.filter = 'blur(10px)'
  const r = rng(seed)
  for (let i = 0; i < 9; i++) {
    const x = 50 + r() * 60
    const y = 50 + r() * 60
    const rad = 22 + r() * 22
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, rgb(col, 0.7))
    grd.addColorStop(1, rgb(col, 0))
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

function makePlate(r: () => number, x: number): Plate {
  const n = 6 + Math.floor(r() * 4)
  const size = 10 + r() * 16
  const pts: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rad = size * (0.65 + r() * 0.45)
    pts.push(Math.cos(a) * rad * 1.5, Math.sin(a) * rad * 0.5)
  }
  return { x, off: (r() - 0.5) * 1.1, speed: 9 + r() * 6, pts }
}

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const { paths: rivers, ends } = flankRivers()
  const geo: Geo = { rivers, river: riverPath(), riverEnds: ends }
  const r = rng(5)
  return {
    v,
    P,
    back: makeLayer(v, (g) => paintBack(g, P, geo)),
    glow: makeLayer(v, (g) => paintGlow(g, geo)),
    cracks: makeLayer(v, paintCracks),
    front: makeLayer(v, (g) => paintFront(g, P)),
    geo,
    smoke: [smokeSprite(1, P.smoke), smokeSprite(2, P.smoke), smokeSprite(3, P.smoke)],
    plume: Object.assign(document.createElement('canvas'), { width: PLUME.w * PLUME.s, height: PLUME.h * PLUME.s }),
    warm: glowSprite('255,110,30'),
    hot: glowSprite('255,200,110', 64),
    violet: glowSprite('200,170,255'),
    plates: Array.from({ length: 46 }, (_, i) => makePlate(r, (i / 46) * (BW + 120) - 60)),
    // a plume that's already there when the world opens
    puffs: Array.from({ length: 40 }, (_, i) => {
      const age = (i / 40) * 15
      return { x: CRATER.x + (r() - 0.5) * 40, y: CRATER.y, vx: 6 + r() * 6, vy: -(22 + r() * 14), r: 26 + r() * 10, age, life: 14 + r() * 3, kind: i % 3 }
    }),
    bombs: [],
    spots: [],
    heat: 0.6,
    erupt: 0,
    pending: 0,
    nextErupt: 20 + r() * 20,
    cooldown: 0,
    bolt: { pts: [], t: -1 },
    flash: 0,
    puffClock: 0
  }
}

/** Where a puff of the plume is at a given age (they rise, slow, and drift right). */
function puffAt(p: Puff): { x: number; y: number; r: number; a: number } {
  const t = p.age
  const y = p.y + p.vy * t * (1 - Math.min(0.45, t * 0.02))
  const x = p.x + p.vx * t + t * t * 0.55
  const k = t / p.life
  const a = Math.min(1, t * 1.2) * Math.pow(1 - k, 1.4)
  return { x, y, r: p.r + t * 12, a }
}

function lightningPath(): number[] {
  const pts: number[] = []
  let x = 980 + Math.random() * 260
  let y = 40 + Math.random() * 40
  pts.push(x, y)
  const n = 6 + Math.floor(Math.random() * 4)
  for (let i = 0; i < n; i++) {
    x += (Math.random() - 0.5) * 50
    y += 14 + Math.random() * 18
    pts.push(x, y)
  }
  return pts
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const volcanoWorld: World = {
  id: 'volcano',
  name: 'Volcano',
  spectrumBins: 16,

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

    // the heat follows the kick (smoothed so it swells instead of flickering)
    const target = 0.5 + c.kick * 0.35 + c.breath * 0.1 + c.energy * 0.1
    st.heat += (target - st.heat) * Math.min(1, dt * 7)
    const heat = st.heat

    // eruptions: now and then by themselves, or on a big moment of the song
    st.nextErupt -= dt
    st.cooldown -= dt
    if ((st.nextErupt <= 0 || (c.impactHit && st.cooldown <= 0)) && st.pending <= 0) {
      st.pending = 5 + Math.floor(Math.random() * 5)
      st.nextErupt = 28 + Math.random() * 30
      st.cooldown = 7
      // rarely, the ash plume crackles with lightning
      if (c.impactHit && Math.random() < 0.3 && st.bolt.t < 0) st.bolt = { pts: lightningPath(), t: 0 }
    }
    if (st.pending > 0 && Math.random() < dt * 14) {
      st.pending--
      st.erupt = Math.min(1, st.erupt + 0.35)
      const dir = Math.random() < 0.5 ? -1 : 1
      st.bombs.push({
        x: CRATER.x + (Math.random() - 0.5) * 50,
        y: CRATER.y,
        vx: dir * (15 + Math.random() * 70),
        vy: -(150 + Math.random() * 120),
        alive: true
      })
      for (let i = 0; i < 6; i++)
        embers.spawn((p) => {
          p.x = CRATER.x + (Math.random() - 0.5) * 40
          p.y = CRATER.y
          p.vx = (Math.random() - 0.5) * 120
          p.vy = -120 - Math.random() * 120
          p.maxLife = 1.5 + Math.random() * 1.5
          p.size = 4 + Math.random() * 4
          p.data = Math.random()
        })
    }
    st.erupt = Math.max(0, st.erupt - dt * 0.6)

    if (st.bolt.t >= 0) {
      st.bolt.t += dt
      const t = st.bolt.t
      st.flash = t < 0.06 ? 1 : t < 0.12 ? 0.25 : t < 0.2 ? 0.8 : Math.max(0, 0.8 - (t - 0.2) * 2.6)
      if (t > 0.55) st.bolt.t = -1
    } else st.flash = 0

    ctx.save()
    ctx.drawImage(st.back, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)

    // crater flare (grows during an eruption)
    ctx.globalCompositeOperation = 'lighter'
    const flare = (0.35 + heat * 0.4 + st.erupt * 0.8) * P.lava
    ctx.globalAlpha = Math.min(1, flare)
    const fr = 150 + st.erupt * 120
    ctx.drawImage(st.warm, CRATER.x - fr, CRATER.y - fr * 0.7, fr * 2, fr * 1.4)
    ctx.globalCompositeOperation = 'source-over'

    // the smoke plume
    st.puffClock += dt * (2.6 + st.erupt * 4)
    while (st.puffClock >= 1) {
      st.puffClock--
      const old = st.puffs.find((p) => p.age >= p.life)
      const np: Puff = {
        x: CRATER.x + (Math.random() - 0.5) * 40,
        y: CRATER.y,
        vx: 6 + Math.random() * 6,
        vy: -(22 + Math.random() * 14 + st.erupt * 20),
        r: 26 + Math.random() * 10,
        age: 0,
        life: 14 + Math.random() * 3,
        kind: Math.floor(Math.random() * 3)
      }
      if (old) Object.assign(old, np)
      else if (st.puffs.length < 70) st.puffs.push(np)
    }
    // (it's soft, so it's drawn into a small buffer and scaled up)
    const pg = st.plume.getContext('2d')!
    pg.setTransform(1, 0, 0, 1, 0, 0)
    pg.clearRect(0, 0, st.plume.width, st.plume.height)
    pg.setTransform(PLUME.s, 0, 0, PLUME.s, -PLUME.x * PLUME.s, -PLUME.y * PLUME.s)
    for (const p of st.puffs) {
      if (p.age >= p.life) continue
      p.age += dt
      const q = puffAt(p)
      pg.globalAlpha = q.a
      pg.drawImage(st.smoke[p.kind], q.x - q.r * 1.5, q.y - q.r * 1.5, q.r * 3, q.r * 3)
    }
    // lit from below by the crater
    pg.globalCompositeOperation = 'lighter'
    for (const p of st.puffs) {
      if (p.age >= p.life) continue
      const q = puffAt(p)
      const low = Math.max(0, 1 - (CRATER.y - q.y) / 380)
      if (low <= 0) continue
      pg.globalAlpha = low * q.a * (0.1 + heat * 0.1 + st.erupt * 0.25) * P.lava
      pg.drawImage(st.warm, q.x - q.r, q.y - q.r * 0.8, q.r * 2, q.r * 2)
    }
    pg.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(st.plume, PLUME.x, PLUME.y, PLUME.w, PLUME.h)
    ctx.globalCompositeOperation = 'lighter'
    // lightning inside the plume
    if (st.flash > 0) {
      const b = st.bolt.pts
      ctx.globalAlpha = st.flash * 0.6
      ctx.drawImage(st.violet, b[0] - 220, b[1] - 120, 440, 320)
      ctx.globalAlpha = st.flash
      ctx.strokeStyle = 'rgba(235,225,255,0.95)'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(b[0], b[1])
      for (let i = 2; i < b.length; i += 2) ctx.lineTo(b[i], b[i + 1])
      ctx.stroke()
    }

    // the lava, glowing with the heat
    ctx.globalAlpha = (0.55 + heat * 0.45) * (0.55 + 0.45 * P.lava)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(st.glow, 0, 0, width, height)
    // the cracks breathe with the kick
    ctx.globalAlpha = (0.25 + c.kick * 0.55 + c.breath * 0.15) * (0.6 + 0.4 * P.lava)
    ctx.drawImage(st.cracks, 0, 0, width, height)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    toBoard(ctx, st.v)

    // the lava crawling down the flanks
    ctx.globalAlpha = 0.5 + heat * 0.3
    ctx.strokeStyle = 'rgba(255,236,170,0.9)'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.setLineDash([10, 34])
    ctx.lineDashOffset = -time * 14
    for (const p of st.geo.rivers) ctx.stroke(p)
    ctx.setLineDash([])

    // a slow shimmer along the river
    for (let i = 0; i < 9; i++) {
      const x = ((i * 190 - time * 22) % (BW + 200) + BW + 200) % (BW + 200) - 100
      ctx.globalAlpha = (0.12 + 0.1 * Math.sin(time * 1.3 + i * 2)) * (0.6 + heat * 0.5)
      ctx.drawImage(st.hot, x - 60, riverY(x) - 16, 120, 32)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    // crust plates drifting on the foreground river
    ctx.save()
    ctx.clip(st.geo.river)
    for (const pl of st.plates) {
      pl.x -= pl.speed * dt
      if (pl.x < -60) pl.x += BW + 120
      const y = riverY(pl.x) + pl.off * riverHW(pl.x)
      ctx.fillStyle = 'rgba(30,10,6,0.96)'
      ctx.beginPath()
      ctx.moveTo(pl.x + pl.pts[0], y + pl.pts[1])
      for (let i = 2; i < pl.pts.length; i += 2) ctx.lineTo(pl.x + pl.pts[i], y + pl.pts[i + 1])
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,150,60,0.35)'
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    ctx.restore()
    ctx.globalCompositeOperation = 'lighter'
    // lava bombs: arc out of the crater and land on the flanks
    for (const b of st.bombs) {
      if (!b.alive) continue
      b.vy += 220 * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.vy > 0 && b.y >= surfY(b.x)) {
        b.alive = false
        st.spots.push({ x: b.x, y: surfY(b.x), t: 0 })
        continue
      }
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = 'rgba(255,170,70,0.7)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - b.vx * 0.06, b.y - b.vy * 0.06)
      ctx.stroke()
      ctx.drawImage(st.hot, b.x - 22, b.y - 22, 44, 44)
    }
    if (st.bombs.length > 40) st.bombs = st.bombs.filter((b) => b.alive)
    // where they landed, cooling down
    for (const s of st.spots) {
      s.t += dt
      const k = 1 - s.t / 4
      if (k <= 0) continue
      ctx.globalAlpha = k * k
      ctx.drawImage(st.hot, s.x - 16, s.y - 6, 32, 14)
    }
    if (st.spots.length > 30) st.spots = st.spots.filter((s) => s.t < 4)

    // embers rising from the crater and the river
    const rate = (0.9 + c.energy * 1.3) * dt * 10
    if (Math.random() < rate % 1) spawnEmber(Math.random() < 0.55)
    for (let i = 0; i < Math.floor(rate); i++) spawnEmber(Math.random() < 0.55)
    if (c.impactHit) for (let i = 0; i < 14; i++) spawnEmber(true)
    embers.each((p) => {
      p.vy -= 4 * dt
      p.vx += Math.sin(time * 2 + p.data * 12) * 10 * dt
      const k = 1 - p.life / p.maxLife
      ctx.globalAlpha = k * 0.8
      const s = p.size * (0.5 + k * 0.5)
      ctx.drawImage(st.warm, p.x - s, p.y - s, s * 2, s * 2)
    })
    // hot cores (one style for all of them)
    ctx.fillStyle = 'rgb(255,214,140)'
    embers.each((p) => {
      const k = 1 - p.life / p.maxLife
      ctx.globalAlpha = k
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2)
    })
    embers.update(dt)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    // basalt and the dead tree in front
    ctx.drawImage(st.front, 0, 0, width, height)

    // ash drifting down over everything
    ctx.save()
    toBoard(ctx, st.v)
    if (ash.activeCount < 90 && Math.random() < 0.6) {
      ash.spawn((p) => {
        p.x = Math.random() * (BW + 200)
        p.y = -10
        p.vx = -10 - Math.random() * 8
        p.vy = 18 + Math.random() * 26
        p.maxLife = 30
        p.size = 1.2 + Math.random() * 2.2
        p.data = Math.random()
      })
    }
    ctx.fillStyle = `rgba(${P.ash},1)`
    ash.each((p) => {
      p.x += Math.sin(time * 0.6 + p.data * 20) * 10 * dt
      if (p.y > BH + 10) p.life = p.maxLife
      ctx.globalAlpha = 0.25 + p.data * 0.35
      ctx.fillRect(p.x, p.y, p.size, p.size * 0.8)
    })
    ash.update(dt)
    ctx.restore()

    // a warm vignette
    const vg = ctx.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.35, width / 2, height * 0.55, Math.max(width, height) * 0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(10,2,0,0.45)')
    ctx.globalAlpha = 1
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }
}

function spawnEmber(fromCrater: boolean): void {
  embers.spawn((p) => {
    if (fromCrater) {
      p.x = CRATER.x + (Math.random() - 0.5) * 60
      p.y = CRATER.y + (Math.random() - 0.5) * 10
      p.vx = (Math.random() - 0.5) * 40
      p.vy = -40 - Math.random() * 70
    } else {
      p.x = Math.random() * BW
      p.y = riverY(p.x) + (Math.random() - 0.5) * 30
      p.vx = (Math.random() - 0.5) * 20
      p.vy = -25 - Math.random() * 40
    }
    p.maxLife = 2.5 + Math.random() * 2.5
    p.size = 3 + Math.random() * 4
    p.data = Math.random()
  })
}
