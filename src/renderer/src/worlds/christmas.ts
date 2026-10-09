import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🎄 Natal — a little town square on Christmas Eve, snowing.
 *
 * In the middle, the big tree: tiers of snowy branches, glass baubles, and
 * garlands of lights that dance with the music — on every beat another colour
 * takes its turn — under a star that pulses with the kick. Around the square,
 * snow-capped houses with warm windows, wreaths on the doors and strings of
 * coloured bulbs along the eaves; smoke curls from the chimneys; two lamp
 * posts pool gold light on the snow. A snowman in a red scarf keeps watch,
 * presents wait under the tree, and every so often (or on a big hit) Santa's
 * sleigh crosses the moon, Rudolph's nose shining.
 *
 * In the daytime hours it's the blue hour before the night, lights already
 * on; after dark, deep blue with the moon.
 */

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: string
  skyLow: string
  horizon: string
  stars: number
  hills: string
  snow: string
  snowShade: string
  house: [string, string, string]
  roof: string
  far: string
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 7 && h < 18)
    return {
      key: 'dusk',
      skyTop: '#16285a',
      skyLow: '#5a73b4',
      horizon: '#e0a8c4',
      stars: 0.3,
      hills: '#9fb2da',
      snow: '#e3ebfb',
      snowShade: '#9eb0d8',
      house: ['#7a4a3a', '#4a5a7a', '#6a3a4a'],
      roof: '#f4f8ff',
      far: '#6f84b8'
    }
  return {
    key: 'night',
    skyTop: '#040a1e',
    skyLow: '#13284e',
    horizon: '#2c3f6e',
    stars: 1,
    hills: '#5d6f9c',
    snow: '#c3d1ef',
    snowShade: '#6c80b2',
    house: ['#4a2a22', '#28344f', '#3f2230'],
    roof: '#dfe8fb',
    far: '#3a4a74'
  }
}

const MOON = { x: 300, y: 150, r: 46 }
const TREE = { x: 800, base: 668, top: 236 }
const BULB_COLORS: RGB[] = [
  [255, 70, 60],
  [255, 200, 70],
  [80, 200, 120],
  [90, 160, 255],
  [255, 240, 210]
]

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSky(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, 620)
  sky.addColorStop(0, P.skyTop)
  sky.addColorStop(0.75, P.skyLow)
  sky.addColorStop(1, P.horizon)
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, BH + 600)
  const r = rng(12)
  for (let i = 0; i < 240; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.2 + r() * 0.6) * P.stars})`
    const s = r() < 0.92 ? 1 : 2
    g.fillRect(r() * BW, r() * 420, s, s)
  }
  const halo = g.createRadialGradient(MOON.x, MOON.y, MOON.r, MOON.x, MOON.y, MOON.r * 5)
  halo.addColorStop(0, 'rgba(230,236,255,0.28)')
  halo.addColorStop(1, 'rgba(230,236,255,0)')
  g.fillStyle = halo
  g.fillRect(MOON.x - MOON.r * 5, MOON.y - MOON.r * 5, MOON.r * 10, MOON.r * 10)
  g.fillStyle = '#f6f8ff'
  g.beginPath()
  g.arc(MOON.x, MOON.y, MOON.r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(170,180,210,0.25)'
  for (const [dx, dy, rr] of [
    [-14, -10, 10],
    [12, 8, 7],
    [-4, 18, 6],
    [18, -16, 5]
  ])
    g.beginPath(), g.arc(MOON.x + dx, MOON.y + dy, rr, 0, Math.PI * 2), g.fill()
}

/** Snowy hills far away, a tiny church and the lights of farms. */
function paintFar(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(21)
  g.fillStyle = P.far
  g.beginPath()
  g.moveTo(-200, 600)
  for (let x = -200; x <= BW + 200; x += 40) g.lineTo(x, 540 - Math.sin(x * 0.004 + 1) * 40 - Math.sin(x * 0.013) * 12)
  g.lineTo(BW + 200, BH)
  g.lineTo(-200, BH)
  g.fill()
  // snowy pines on the ridge
  for (let i = 0; i < 60; i++) {
    const x = r() * BW
    const y = 548 - Math.sin(x * 0.004 + 1) * 40 - Math.sin(x * 0.013) * 12
    const h = 18 + r() * 26
    g.fillStyle = '#22314f'
    g.beginPath()
    g.moveTo(x, y - h)
    g.lineTo(x - h * 0.35, y)
    g.lineTo(x + h * 0.35, y)
    g.fill()
    g.fillStyle = 'rgba(230,238,255,0.55)'
    g.beginPath()
    g.moveTo(x, y - h)
    g.lineTo(x - h * 0.12, y - h * 0.6)
    g.lineTo(x + h * 0.12, y - h * 0.6)
    g.fill()
  }
  // the little church on the hill
  const cx = 1340
  const cy = 520
  g.fillStyle = '#2a3654'
  g.fillRect(cx - 30, cy - 34, 60, 40)
  g.beginPath()
  g.moveTo(cx - 36, cy - 34)
  g.lineTo(cx, cy - 58)
  g.lineTo(cx + 36, cy - 34)
  g.fill()
  g.fillRect(cx + 14, cy - 92, 16, 60)
  g.beginPath()
  g.moveTo(cx + 10, cy - 92)
  g.lineTo(cx + 22, cy - 128)
  g.lineTo(cx + 34, cy - 92)
  g.fill()
  g.fillStyle = 'rgba(255,210,140,0.9)'
  g.fillRect(cx - 8, cy - 22, 8, 12)
  g.fillRect(cx + 19, cy - 80, 6, 9)
  // the snowy ground of the square
  const ground = g.createLinearGradient(0, 640, 0, BH)
  ground.addColorStop(0, P.snowShade)
  ground.addColorStop(0.25, P.snow)
  ground.addColorStop(1, P.snowShade)
  g.fillStyle = ground
  g.beginPath()
  g.moveTo(-200, 660)
  for (let x = -200; x <= BW + 200; x += 40) g.lineTo(x, 652 + Math.sin(x * 0.005) * 6)
  g.lineTo(BW + 200, BH + 200)
  g.lineTo(-200, BH + 200)
  g.fill()
}

interface Bulb {
  x: number
  y: number
  c: number
  ph: number
}

interface TownInfo {
  eaves: Bulb[]
  windows: { x: number; y: number; w: number; h: number; ph: number; candle: boolean }[]
  chimneys: { x: number; y: number }[]
}

/** The houses around the square. */
function paintHouses(g: CanvasRenderingContext2D, P: Pal, info: TownInfo): void {
  const r = rng(5)
  const houses: [number, number, number, number][] = [
    // x, width, wall height, roof rise
    [40, 220, 150, 90],
    [270, 170, 190, 80],
    [1120, 190, 170, 86],
    [1320, 240, 150, 100],
    [1570, 160, 180, 70]
  ]
  const base = 660
  houses.forEach(([x, w, hh, rise], i) => {
    const top = base - hh
    g.fillStyle = P.house[i % 3]
    g.fillRect(x, top, w, hh + 10)
    // timber lines
    g.fillStyle = 'rgba(0,0,0,0.18)'
    for (let yy = top + 18; yy < base; yy += 22) g.fillRect(x, yy, w, 2)
    // chimney
    const chx = x + w * (0.65 + r() * 0.15)
    g.fillStyle = '#3a2420'
    g.fillRect(chx, top - rise * 0.75, 22, rise * 0.6)
    g.fillStyle = P.roof
    g.fillRect(chx - 3, top - rise * 0.75 - 6, 28, 8)
    info.chimneys.push({ x: chx + 11, y: top - rise * 0.75 - 6 })
    // the roof, heavy with snow
    g.fillStyle = '#2a1c1e'
    g.beginPath()
    g.moveTo(x - 18, top + 4)
    g.lineTo(x + w / 2, top - rise)
    g.lineTo(x + w + 18, top + 4)
    g.closePath()
    g.fill()
    g.fillStyle = P.roof
    g.beginPath()
    g.moveTo(x - 20, top + 2)
    g.lineTo(x + w / 2, top - rise - 4)
    g.lineTo(x + w + 20, top + 2)
    // snow drips along the eave
    for (let k = 20; k >= 0; k--) {
      const ex = x - 20 + ((w + 40) * k) / 20
      g.lineTo(ex, top + 2 + (k % 2 ? 6 + r() * 6 : 0))
    }
    g.closePath()
    g.fill()
    g.fillStyle = 'rgba(120,140,190,0.35)'
    g.beginPath()
    g.moveTo(x + w / 2, top - rise - 4)
    g.lineTo(x + w + 20, top + 2)
    g.lineTo(x + w / 2 + 6, top - rise + 8)
    g.fill()
    // bulbs along the eaves (lit live)
    for (let k = 0; k <= 14; k++) {
      const u = k / 14
      const sx = x - 14 + (w + 28) * u
      const sy = top + 10 + Math.sin(u * Math.PI * 7) * 3 + 4
      info.eaves.push({ x: sx, y: sy, c: k % 4, ph: r() * 6.28 })
    }
    // windows (lit live) and a door with a wreath
    const cols = Math.max(2, Math.floor(w / 70))
    for (let c = 0; c < cols; c++) {
      const wx = x + ((c + 0.5) / cols) * w - 16
      const wy = top + 34
      g.fillStyle = '#1a1010'
      g.fillRect(wx - 3, wy - 3, 38, 46)
      info.windows.push({ x: wx, y: wy, w: 32, h: 40, ph: r() * 6.28, candle: r() < 0.4 })
      // snow on the sill
      g.fillStyle = P.roof
      g.fillRect(wx - 6, wy + 40, 44, 5)
    }
    const dx = x + w * 0.5 - 16
    g.fillStyle = '#2a1712'
    g.fillRect(dx, base - 56, 32, 56)
    g.strokeStyle = '#1f5a32'
    g.lineWidth = 6
    g.beginPath()
    g.arc(dx + 16, base - 36, 9, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#d0262c'
    g.fillRect(dx + 13, base - 30, 6, 6)
  })
}

interface TreeInfo {
  bulbs: Bulb[]
}

function tierShape(i: number): { top: number; bottom: number; half: number } {
  const h = TREE.base - TREE.top
  const top = TREE.top + h * (i * 0.135)
  const bottom = top + h * 0.26
  const half = 34 + i * 40
  return { top, bottom, half }
}

/** The big tree with its baubles, snow and presents. */
function paintTree(g: CanvasRenderingContext2D, P: Pal, info: TreeInfo): void {
  const r = rng(40)
  const x = TREE.x
  // trunk and shadow
  g.fillStyle = 'rgba(40,50,90,0.35)'
  g.beginPath()
  g.ellipse(x + 30, TREE.base + 8, 300, 26, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3a2416'
  g.fillRect(x - 18, TREE.base - 40, 36, 52)
  const tiers = 6
  for (let i = 0; i < tiers; i++) {
    const { top, bottom, half } = tierShape(i)
    const grd = g.createLinearGradient(x - half, 0, x + half, 0)
    grd.addColorStop(0, '#062a1a')
    grd.addColorStop(0.55, '#0e4a2c')
    grd.addColorStop(1, '#0a3a22')
    g.fillStyle = grd
    g.beginPath()
    g.moveTo(x, top)
    g.quadraticCurveTo(x - half * 0.4, (top + bottom) / 2, x - half, bottom)
    // a scalloped hem of branch tips
    const n = 6 + i * 2
    for (let k = 0; k <= n; k++) {
      const u = k / n
      g.lineTo(x - half + half * 2 * u, bottom + (k % 2 ? 10 : 0) - Math.sin(u * Math.PI) * 6)
    }
    g.quadraticCurveTo(x + half * 0.4, (top + bottom) / 2, x, top)
    g.fill()
    // needles texture
    g.strokeStyle = 'rgba(40,110,70,0.35)'
    g.lineWidth = 1.2
    for (let k = 0; k < 30 + i * 12; k++) {
      const u = r()
      const yy = top + (bottom - top) * (0.3 + r() * 0.7)
      const span = half * ((yy - top) / (bottom - top))
      const xx = x + (u * 2 - 1) * span
      g.beginPath()
      g.moveTo(xx, yy)
      g.lineTo(xx + (xx < x ? -6 : 6), yy + 5)
      g.stroke()
    }
    // snow resting on the tips
    g.fillStyle = P.roof
    for (let k = 0; k <= n; k += 2) {
      const u = k / n
      g.beginPath()
      g.ellipse(x - half + half * 2 * u, bottom - 4 - Math.sin(u * Math.PI) * 6, 9 + r() * 6, 4, 0, 0, Math.PI * 2)
      g.fill()
    }
    // a garland of lights draped across the tier (lit live)
    const sag = 14 + i * 3
    const count = 6 + i * 3
    for (let k = 0; k < count; k++) {
      const u = (k + 0.5) / count
      const gx = x - half * 0.9 + half * 1.8 * u
      const gy = top + (bottom - top) * 0.62 + Math.sin(u * Math.PI) * sag - (1 - Math.abs(u * 2 - 1)) * 4
      info.bulbs.push({ x: gx, y: gy, c: k % 4, ph: r() * 6.28 })
    }
    // glass baubles
    for (let k = 0; k < 2 + i; k++) {
      const yy = top + (bottom - top) * (0.45 + r() * 0.45)
      const span = half * ((yy - top) / (bottom - top)) * 0.85
      const bx = x + (r() * 2 - 1) * span
      const col = BULB_COLORS[Math.floor(r() * 4)]
      const rad = 6 + r() * 4
      const bg = g.createRadialGradient(bx - rad * 0.35, yy - rad * 0.35, 1, bx, yy, rad)
      bg.addColorStop(0, '#ffffff')
      bg.addColorStop(0.3, `rgb(${col[0]},${col[1]},${col[2]})`)
      bg.addColorStop(1, `rgb(${col[0] * 0.4},${col[1] * 0.4},${col[2] * 0.4})`)
      g.fillStyle = bg
      g.beginPath()
      g.arc(bx, yy, rad, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#c9a84a'
      g.fillRect(bx - 2, yy - rad - 3, 4, 3)
    }
  }
  // the presents
  const gifts: [number, number, number, string, string][] = [
    [x - 150, 54, 46, '#c62a35', '#f4d36b'],
    [x - 92, 40, 34, '#2a6fd0', '#ffffff'],
    [x + 70, 62, 40, '#2b9a5a', '#e23b3b'],
    [x + 140, 44, 52, '#f2c94c', '#c62a35'],
    [x - 30, 36, 28, '#9b51e0', '#f4d36b']
  ]
  for (const [gx, w, h, col, ribbon] of gifts) {
    const gy = TREE.base + 6 - h
    g.fillStyle = col
    g.fillRect(gx, gy, w, h)
    g.fillStyle = 'rgba(0,0,0,0.2)'
    g.fillRect(gx + w * 0.6, gy, w * 0.4, h)
    g.fillStyle = ribbon
    g.fillRect(gx + w / 2 - 3, gy, 6, h)
    g.fillRect(gx, gy + h * 0.35, w, 5)
    g.beginPath()
    g.ellipse(gx + w / 2 - 7, gy - 4, 8, 5, -0.5, 0, Math.PI * 2)
    g.ellipse(gx + w / 2 + 7, gy - 4, 8, 5, 0.5, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = P.roof
    g.fillRect(gx - 2, gy - 2, w + 4, 4)
  }
}

interface LampInfo {
  lamps: { x: number; y: number }[]
}

/** Foreground: lamp posts, the snowman, a low fence with snow. */
function paintFront(g: CanvasRenderingContext2D, P: Pal, info: LampInfo): void {
  for (const lx of [470, 1110]) {
    g.fillStyle = '#141826'
    g.fillRect(lx - 4, 520, 8, 160)
    g.fillRect(lx - 12, 674, 24, 8)
    g.beginPath()
    g.moveTo(lx - 16, 520)
    g.lineTo(lx + 16, 520)
    g.lineTo(lx + 10, 498)
    g.lineTo(lx - 10, 498)
    g.fill()
    g.fillStyle = 'rgba(255,214,140,0.95)'
    g.fillRect(lx - 9, 500, 18, 18)
    g.fillStyle = P.roof
    g.fillRect(lx - 18, 492, 36, 7)
    // a ribbon wrapped around the post
    g.strokeStyle = '#c62a35'
    g.lineWidth = 4
    for (let y = 540; y < 670; y += 22) {
      g.beginPath()
      g.moveTo(lx - 5, y)
      g.lineTo(lx + 5, y + 10)
      g.stroke()
    }
    info.lamps.push({ x: lx, y: 509 })
  }

  // the snowman
  const sx = 210
  const sb = 760
  const ball = (cx: number, cy: number, rr: number): void => {
    const grd = g.createRadialGradient(cx - rr * 0.4, cy - rr * 0.4, rr * 0.2, cx, cy, rr)
    grd.addColorStop(0, '#ffffff')
    grd.addColorStop(1, P.snowShade)
    g.fillStyle = grd
    g.beginPath()
    g.arc(cx, cy, rr, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = 'rgba(60,70,120,0.3)'
  g.beginPath()
  g.ellipse(sx + 20, sb + 4, 90, 14, 0, 0, Math.PI * 2)
  g.fill()
  ball(sx, sb - 52, 58)
  ball(sx, sb - 140, 42)
  ball(sx, sb - 205, 30)
  // stick arms
  g.strokeStyle = '#3a2416'
  g.lineWidth = 4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(sx - 36, sb - 150)
  g.lineTo(sx - 90, sb - 190)
  g.moveTo(sx - 74, sb - 178)
  g.lineTo(sx - 82, sb - 200)
  g.moveTo(sx + 36, sb - 150)
  g.lineTo(sx + 92, sb - 172)
  g.moveTo(sx + 76, sb - 166)
  g.lineTo(sx + 92, sb - 150)
  g.stroke()
  // scarf
  g.fillStyle = '#c62a35'
  g.beginPath()
  g.ellipse(sx, sb - 178, 34, 9, 0, 0, Math.PI * 2)
  g.fill()
  g.fillRect(sx + 10, sb - 178, 14, 46)
  g.fillStyle = '#f4f4f4'
  g.fillRect(sx + 10, sb - 150, 14, 4)
  // hat
  g.fillStyle = '#16141c'
  g.fillRect(sx - 30, sb - 232, 60, 7)
  g.fillRect(sx - 20, sb - 274, 40, 44)
  g.fillStyle = '#c62a35'
  g.fillRect(sx - 20, sb - 244, 40, 7)
  // face and buttons
  g.fillStyle = '#16141c'
  for (const [dx, dy] of [
    [-10, -212],
    [10, -212],
    [0, -150],
    [0, -130],
    [0, -110]
  ])
    g.beginPath(), g.arc(sx + dx, sb + dy, 3.5, 0, Math.PI * 2), g.fill()
  for (let k = -2; k <= 2; k++) g.beginPath(), g.arc(sx + k * 7, sb - 192 + Math.abs(k) * -2, 2, 0, Math.PI * 2), g.fill()
  g.fillStyle = '#f08a24'
  g.beginPath()
  g.moveTo(sx, sb - 204)
  g.lineTo(sx + 28, sb - 199)
  g.lineTo(sx, sb - 196)
  g.fill()

  // a low wooden fence across the front, with snow on top
  g.fillStyle = '#3a2a22'
  for (let x = 1240; x < BW + 40; x += 34) g.fillRect(x, 716, 10, 60)
  g.fillRect(1230, 730, 420, 8)
  g.fillRect(1230, 756, 420, 8)
  g.fillStyle = P.roof
  for (let x = 1240; x < BW + 40; x += 34) g.fillRect(x - 2, 712, 14, 6)
  g.fillRect(1228, 726, 424, 5)

  // the front snow drift
  g.fillStyle = P.snow
  g.beginPath()
  g.moveTo(-200, 800)
  for (let x = -200; x <= BW + 200; x += 40) g.lineTo(x, 770 + Math.sin(x * 0.007) * 12)
  g.lineTo(BW + 200, BH + 200)
  g.lineTo(-200, BH + 200)
  g.fill()
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Flake {
  x: number
  y: number
  s: number
  v: number
  ph: number
}

interface Puff {
  x: number
  y: number
  t: number
  s: number
}

interface State {
  v: View
  P: Pal
  sky: Layer
  far: Layer
  houses: Layer
  tree: Layer
  front: Layer
  town: TownInfo
  treeInfo: TreeInfo
  lampInfo: LampInfo
  bulbSprites: Layer[]
  warm: Layer
  star: Layer
  red: Layer
  smoke: Layer
  flakes: Flake[][]
  puffs: Puff[]
  puffTimer: number
  beat: number
  lastKick: number
  sleigh: { t: number } | null
  nextSleigh: number
  glints: { x: number; y: number; ph: number }[]
}

let S: State | null = null

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const town: TownInfo = { eaves: [], windows: [], chimneys: [] }
  const treeInfo: TreeInfo = { bulbs: [] }
  const lampInfo: LampInfo = { lamps: [] }
  const r = rng(73)
  const smoke = glowSprite('200,210,235', 64)
  return {
    v,
    P,
    sky: makeLayer(v, (g) => paintSky(g, P)),
    far: makeLayer(v, (g) => paintFar(g, P)),
    houses: makeLayer(v, (g) => paintHouses(g, P, town)),
    tree: makeLayer(v, (g) => paintTree(g, P, treeInfo)),
    front: makeLayer(v, (g) => paintFront(g, P, lampInfo)),
    town,
    treeInfo,
    lampInfo,
    bulbSprites: BULB_COLORS.map((col) => glowSprite(col.join(','), 48)),
    warm: glowSprite('255,200,120'),
    star: glowSprite('255,226,140'),
    red: glowSprite('255,50,40', 48),
    smoke,
    flakes: [140, 90, 40].map((n, layer) =>
      Array.from({ length: n }, () => ({
        x: r() * BW,
        y: r() * BH,
        s: [1.4, 2.4, 4][layer] * (0.7 + r() * 0.6),
        v: [26, 44, 70][layer] * (0.8 + r() * 0.4),
        ph: r() * 6.28
      }))
    ),
    puffs: [],
    puffTimer: 0,
    beat: 0,
    lastKick: 0,
    sleigh: null,
    nextSleigh: 14,
    glints: Array.from({ length: 70 }, () => ({ x: r() * BW, y: 670 + r() * 200, ph: r() * 6.28 }))
  }
}

/** Santa, his sleigh and four reindeer, in silhouette, flying left. */
function drawSleigh(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, red: Layer): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1.3, 1.3)
  // a dark silhouette with a soft golden glow, so it reads on the night sky
  // too (not only when it crosses the moon)
  ctx.shadowColor = 'rgba(255,214,140,0.75)'
  ctx.shadowBlur = 10
  ctx.fillStyle = '#0b1226'
  ctx.strokeStyle = '#0b1226'
  ctx.lineWidth = 2
  // reins
  ctx.beginPath()
  ctx.moveTo(56, -10)
  ctx.lineTo(-150, -14)
  ctx.stroke()
  for (let i = 0; i < 4; i++) {
    const rx = -36 - i * 34
    const gal = Math.sin(time * 9 + i)
    // body
    ctx.beginPath()
    ctx.ellipse(rx, -12, 13, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    // neck and head
    ctx.beginPath()
    ctx.moveTo(rx - 10, -15)
    ctx.lineTo(rx - 18, -26)
    ctx.lineTo(rx - 24, -25)
    ctx.lineTo(rx - 14, -12)
    ctx.fill()
    // antlers
    ctx.beginPath()
    ctx.moveTo(rx - 18, -26)
    ctx.lineTo(rx - 14, -36)
    ctx.moveTo(rx - 16, -31)
    ctx.lineTo(rx - 10, -34)
    ctx.stroke()
    // galloping legs
    ctx.beginPath()
    ctx.moveTo(rx - 8, -8)
    ctx.lineTo(rx - 14 - gal * 5, 4)
    ctx.moveTo(rx + 8, -8)
    ctx.lineTo(rx + 14 + gal * 5, 3)
    ctx.stroke()
  }
  // the sleigh with its curled runner and Santa
  ctx.beginPath()
  ctx.moveTo(40, -2)
  ctx.lineTo(90, -2)
  ctx.quadraticCurveTo(100, -2, 98, -22)
  ctx.lineTo(84, -20)
  ctx.lineTo(80, -10)
  ctx.lineTo(48, -10)
  ctx.quadraticCurveTo(40, -12, 40, -2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(36, 4)
  ctx.lineTo(100, 4)
  ctx.quadraticCurveTo(108, 4, 106, -6)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(62, -20, 8, 0, Math.PI * 2) // Santa
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(56, -26)
  ctx.lineTo(66, -40)
  ctx.lineTo(70, -24)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(80, -20, 10, 9, 0, 0, Math.PI * 2) // the sack
  ctx.fill()
  // Rudolph's nose
  ctx.shadowBlur = 0
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 6)
  ctx.drawImage(red, -162 - 14, -25 - 14, 28, 28)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const christmasWorld: World = {
  id: 'christmas',
  name: 'Natal',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    S = build(c)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const v = viewFor(c)
    if (!S || !sameView(S.v, v) || S.P.key !== palFor(c.dayPhase).key) S = build(c)
    const st = S

    // count beats: each one hands the lights to the next colour
    if (c.kick > 0.6 && st.lastKick <= 0.6) st.beat++
    st.lastKick = c.kick
    const lead = st.beat % 4

    ctx.save()
    ctx.drawImage(st.sky, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // Santa's sleigh across the sky
    st.nextSleigh -= dt
    if (!st.sleigh && (st.nextSleigh <= 0 || (c.impactHit && st.nextSleigh < 20))) {
      st.sleigh = { t: 0 }
      st.nextSleigh = 40 + Math.random() * 30
    }
    if (st.sleigh) {
      st.sleigh.t += dt
      const u = st.sleigh.t / 11
      const sx = BW + 220 - u * (BW + 520)
      const sy = 230 - Math.sin(u * Math.PI) * 120
      // a trail of sparkles behind the sleigh
      ctx.globalCompositeOperation = 'lighter'
      for (let k = 1; k < 14; k++) {
        const tu = u - k * 0.006
        const tx = BW + 220 - tu * (BW + 520) + 100
        const ty = 230 - Math.sin(tu * Math.PI) * 120 - 4 + Math.sin(time * 8 + k) * 3
        ctx.globalAlpha = (1 - k / 14) * 0.5
        ctx.drawImage(st.star, tx - 6, ty - 6, 12, 12)
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      drawSleigh(ctx, sx, sy, time, st.red)
      if (u > 1) st.sleigh = null
    }
    ctx.restore()

    ctx.drawImage(st.far, 0, 0, width, height)
    ctx.drawImage(st.houses, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // chimney smoke
    st.puffTimer -= dt
    if (st.puffTimer <= 0) {
      st.puffTimer = 0.35
      for (const ch of st.town.chimneys) st.puffs.push({ x: ch.x, y: ch.y, t: 0, s: 0.6 + Math.random() * 0.5 })
    }
    for (let i = st.puffs.length - 1; i >= 0; i--) {
      const p = st.puffs[i]
      p.t += dt
      if (p.t > 6) {
        st.puffs.splice(i, 1)
        continue
      }
      const px = p.x + p.t * 9 + Math.sin(p.t * 1.3 + p.s * 5) * 8
      const py = p.y - p.t * 22
      const size = (18 + p.t * 18) * p.s
      ctx.globalAlpha = 0.22 * (1 - p.t / 6)
      ctx.drawImage(st.smoke, px - size / 2, py - size / 2, size, size)
    }
    ctx.globalAlpha = 1
    // warm windows (some with a candle flickering)
    for (const w of st.town.windows) {
      const f = w.candle ? 0.82 + 0.12 * Math.sin(time * 8 + w.ph) + 0.06 * Math.sin(time * 19 + w.ph) : 0.95
      const grd = ctx.createLinearGradient(0, w.y, 0, w.y + w.h)
      grd.addColorStop(0, `rgba(255,${190 + 20 * f},120,${f})`)
      grd.addColorStop(1, `rgba(255,${150 + 20 * f},80,${f})`)
      ctx.fillStyle = grd
      ctx.fillRect(w.x, w.y, w.w, w.h)
      ctx.fillStyle = 'rgba(40,20,10,0.75)'
      ctx.fillRect(w.x + w.w / 2 - 1, w.y, 2, w.h)
      ctx.fillRect(w.x, w.y + w.h / 2 - 1, w.w, 2)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.3 * f
      ctx.drawImage(st.warm, w.x - 26, w.y - 22, w.w + 52, w.h + 44)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
    // bulbs on the eaves, chasing on the beat
    ctx.globalCompositeOperation = 'lighter'
    for (const b of st.town.eaves) {
      const on = 0.35 + 0.25 * Math.sin(time * 2 + b.ph) + (b.c === lead ? 0.5 * (0.4 + c.kick) : 0)
      ctx.globalAlpha = Math.min(1, Math.max(0.1, on))
      ctx.drawImage(st.bulbSprites[b.c], b.x - 9, b.y - 9, 18, 18)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.tree, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // the tree's lights: they twinkle, and the beat's colour flares
    ctx.globalCompositeOperation = 'lighter'
    const hot = 0.55 + c.energy * 0.3 + c.surge * 0.4
    for (const b of st.treeInfo.bulbs) {
      const tw = 0.5 + 0.5 * Math.sin(time * 3 + b.ph)
      const a = 0.35 + 0.3 * tw + (b.c === lead ? 0.6 * (0.3 + c.kick) : 0)
      ctx.globalAlpha = Math.min(1, a * hot)
      const s = b.c === lead ? 30 + c.kick * 12 : 24
      ctx.drawImage(st.bulbSprites[b.c], b.x - s / 2, b.y - s / 2, s, s)
      ctx.globalAlpha = Math.min(1, a)
      ctx.drawImage(st.bulbSprites[4], b.x - 3, b.y - 3, 6, 6)
    }
    // the star on top: slow rays, a pulse on the kick
    const sy = TREE.top - 14
    const pulse = 1 + c.kick * 0.35 + c.surge * 0.3
    ctx.globalAlpha = 0.55 + 0.25 * c.breath
    const gs = 150 * pulse
    ctx.drawImage(st.star, TREE.x - gs / 2, sy - gs / 2, gs, gs)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.save()
    ctx.translate(TREE.x, sy)
    ctx.rotate(Math.sin(time * 0.5) * 0.08)
    ctx.fillStyle = '#ffd86b'
    ctx.strokeStyle = '#fff3c4'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = (k % 2 ? 11 : 26) * (1 + c.kick * 0.12)
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.restore()

    ctx.drawImage(st.front, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // lamp light pooling on the snow
    ctx.globalCompositeOperation = 'lighter'
    for (const l of st.lampInfo.lamps) {
      const f = 0.9 + 0.05 * Math.sin(time * 3 + l.x)
      ctx.globalAlpha = 0.5 * f
      ctx.drawImage(st.warm, l.x - 70, l.y - 70, 140, 140)
      ctx.globalAlpha = 0.18 * f
      ctx.drawImage(st.warm, l.x - 120, l.y + 120, 240, 90)
    }
    // the snow glints
    for (const gl of st.glints) {
      const a = Math.pow(Math.max(0, Math.sin(time * 1.5 + gl.ph)), 16)
      if (a < 0.05) continue
      ctx.globalAlpha = a * (0.7 + c.hihats * 0.5)
      ctx.drawImage(st.bulbSprites[4], gl.x - 4, gl.y - 4, 8, 8)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    // falling snow, three depths; the music stirs it a little
    const wind = Math.sin(time * 0.2) * 14 + c.sway * 10
    const heavy = 0.7 + c.energy * 0.2 + c.surge * 0.5
    st.flakes.forEach((layer, li) => {
      ctx.fillStyle = `rgba(255,255,255,${[0.55, 0.75, 0.9][li]})`
      ctx.beginPath()
      const n = Math.round(layer.length * Math.min(1, heavy))
      for (let i = 0; i < n; i++) {
        const f = layer[i]
        f.y += f.v * dt
        f.x += (wind * (0.5 + li * 0.4) + Math.sin(time * 1.2 + f.ph) * 12) * dt
        if (f.y > BH + 10) {
          f.y = -10
          f.x = Math.random() * BW
        }
        if (f.x > BW + 10) f.x -= BW + 20
        if (f.x < -10) f.x += BW + 20
        ctx.moveTo(f.x + f.s, f.y)
        ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2)
      }
      ctx.fill()
    })
    ctx.restore()

    const vign = ctx.createRadialGradient(width / 2, height * 0.45, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.8)
    vign.addColorStop(0, 'rgba(0,0,20,0)')
    vign.addColorStop(1, 'rgba(0,4,24,0.5)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
