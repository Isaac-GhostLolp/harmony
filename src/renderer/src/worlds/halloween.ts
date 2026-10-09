import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🎃 Halloween — a full moon over an old graveyard.
 *
 * On the hill behind, a crooked mansion with candlelit windows; in front of
 * it an iron fence and rows of moonlit tombstones; a dead tree frames the
 * right side, its branches reaching across the edge of the moon. Jack-o'-
 * lanterns sit in the grass and their faces glow with the kick drum. Bats
 * cross the moon (a whole flock bursts out on a big hit), little ghosts drift
 * between the graves (bolder when someone sings), will-o'-wisps float low and
 * fog rolls through in three layers.
 *
 * In the daytime hours it's the hour before: an orange dusk, the moon rising
 * pale; at night it's deep blue and silver.
 */

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: string
  skyMid: string
  skyLow: string
  stars: number
  hills: string
  house: string
  ground: string
  tomb: RGB
  front: string
  moon: string
  moonGlow: string
  fog: string
  rim: string
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 7 && h < 18.5)
    return {
      key: 'dusk',
      skyTop: '#1c1440',
      skyMid: '#5b2a5f',
      skyLow: '#ff7a3c',
      stars: 0.25,
      hills: '#24112c',
      house: '#13091a',
      ground: '#1d1022',
      tomb: [92, 80, 102],
      front: '#0b050d',
      moon: '#ffe6c2',
      moonGlow: '255,190,140',
      fog: '255,196,178',
      rim: 'rgba(255,170,120,0.35)'
    }
  return {
    key: 'night',
    skyTop: '#05051a',
    skyMid: '#161236',
    skyLow: '#3d1f52',
    stars: 1,
    hills: '#130b24',
    house: '#0a0614',
    ground: '#150d22',
    tomb: [76, 72, 96],
    front: '#05030a',
    moon: '#fff6dd',
    moonGlow: '220,214,255',
    fog: '196,186,236',
    rim: 'rgba(210,214,255,0.35)'
  }
}

const MOON = { x: 1180, y: 215, r: 108 }
const HOUSE_BASE = 512

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSky(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, 640)
  sky.addColorStop(0, P.skyTop)
  sky.addColorStop(0.62, P.skyMid)
  sky.addColorStop(1, P.skyLow)
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, BH + 600)
  const r = rng(11)
  for (let i = 0; i < 260; i++) {
    const x = r() * BW
    const y = r() * 470
    const s = r() < 0.9 ? 1 : 2
    g.fillStyle = `rgba(255,255,240,${(0.25 + r() * 0.6) * P.stars})`
    g.fillRect(x, y, s, s)
  }
  // the moon's halo, then the moon with its seas
  const halo = g.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.8, MOON.x, MOON.y, MOON.r * 4.2)
  halo.addColorStop(0, `rgba(${P.moonGlow},0.35)`)
  halo.addColorStop(0.35, `rgba(${P.moonGlow},0.1)`)
  halo.addColorStop(1, `rgba(${P.moonGlow},0)`)
  g.fillStyle = halo
  g.fillRect(MOON.x - MOON.r * 5, MOON.y - MOON.r * 5, MOON.r * 10, MOON.r * 10)
  const body = g.createRadialGradient(MOON.x - 30, MOON.y - 34, 10, MOON.x, MOON.y, MOON.r)
  body.addColorStop(0, '#ffffff')
  body.addColorStop(0.7, P.moon)
  body.addColorStop(1, '#d8c9a8')
  g.fillStyle = body
  g.beginPath()
  g.arc(MOON.x, MOON.y, MOON.r, 0, Math.PI * 2)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(MOON.x, MOON.y, MOON.r, 0, Math.PI * 2)
  g.clip()
  const cr = rng(4)
  for (let i = 0; i < 16; i++) {
    const a = cr() * Math.PI * 2
    const d = Math.sqrt(cr()) * MOON.r * 0.8
    g.fillStyle = `rgba(120,104,90,${0.07 + cr() * 0.1})`
    g.beginPath()
    g.ellipse(MOON.x + Math.cos(a) * d, MOON.y + Math.sin(a) * d, 8 + cr() * 26, 6 + cr() * 18, cr() * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

interface HouseInfo {
  windows: { x: number; y: number; w: number; h: number; on: boolean; ph: number }[]
}

/** Far hills, little bare trees and the mansion on its hill. */
function paintFar(g: CanvasRenderingContext2D, P: Pal, info: HouseInfo): void {
  const r = rng(23)
  // the far ridge
  g.fillStyle = P.hills
  g.beginPath()
  g.moveTo(-200, 640)
  for (let x = -200; x <= BW + 200; x += 40) {
    const hill = Math.exp(-((x - 400) ** 2) / (2 * 260 ** 2)) * 150
    g.lineTo(x, 610 - hill - Math.sin(x * 0.011) * 18 - Math.sin(x * 0.027) * 8)
  }
  g.lineTo(BW + 200, BH + 200)
  g.lineTo(-200, BH + 200)
  g.fill()
  // tiny bare trees along the ridge
  g.strokeStyle = P.hills
  g.lineCap = 'round'
  for (let i = 0; i < 18; i++) {
    const x = 700 + r() * 900
    const base = 600 - Math.sin(x * 0.011) * 18 - Math.sin(x * 0.027) * 8
    tree(g, x, base + 4, 30 + r() * 26, -Math.PI / 2 + (r() - 0.5) * 0.2, 3, 4, r)
  }

  // the mansion
  const h = P.house
  g.fillStyle = h
  const body = (x: number, y: number, w: number, hh: number): void => g.fillRect(x, y, w, hh)
  const gable = (x: number, w: number, y: number, rise: number): void => {
    g.beginPath()
    g.moveTo(x - 10, y)
    g.lineTo(x + w / 2, y - rise)
    g.lineTo(x + w + 10, y)
    g.closePath()
    g.fill()
  }
  const spire = (cx: number, y: number, w: number, rise: number): void => {
    g.beginPath()
    g.moveTo(cx - w / 2 - 6, y)
    g.lineTo(cx + 3, y - rise) // a little crooked
    g.lineTo(cx + w / 2 + 6, y)
    g.closePath()
    g.fill()
  }
  body(250, 380, 300, HOUSE_BASE - 380 + 20)
  gable(250, 150, 380, 70)
  gable(400, 150, 380, 56)
  body(220, 300, 64, HOUSE_BASE - 300 + 20) // left tower
  spire(252, 300, 64, 110)
  body(505, 330, 52, HOUSE_BASE - 330 + 20) // right tower
  spire(531, 330, 52, 84)
  body(330, 312, 18, 50) // chimney
  // a weathervane and a broken shutter
  g.fillRect(253, 182, 2, 26)
  g.fillRect(244, 190, 20, 2)
  // moon-side rim light on the right edges
  g.fillStyle = P.rim
  g.fillRect(282, 300, 2, HOUSE_BASE - 300)
  g.fillRect(555, 330, 2, HOUSE_BASE - 330)
  g.fillRect(548, 380, 2, HOUSE_BASE - 380)
  // windows: dark frames now, lit live
  const W: [number, number, number, number][] = [
    [238, 330, 16, 26],
    [238, 400, 16, 26],
    [518, 360, 14, 22],
    [518, 420, 14, 22],
    [290, 410, 20, 30],
    [345, 410, 20, 30],
    [400, 410, 20, 30],
    [455, 410, 20, 30],
    [290, 462, 20, 30],
    [455, 462, 20, 30],
    [318, 352, 14, 20],
    [470, 352, 14, 20]
  ]
  for (const [x, y, w, hh] of W) {
    g.fillStyle = '#05030a'
    g.beginPath()
    g.roundRect(x, y, w, hh, [w / 2, w / 2, 1, 1])
    g.fill()
    info.windows.push({ x, y, w, h: hh, on: r() < 0.7, ph: r() * 6.28 })
  }
  // the door
  g.fillStyle = '#05030a'
  g.beginPath()
  g.roundRect(372, 470, 30, 42, [15, 15, 0, 0])
  g.fill()
}

function tree(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  ang: number,
  width: number,
  depth: number,
  r: () => number
): void {
  const ex = x + Math.cos(ang) * len
  const ey = y + Math.sin(ang) * len
  const bend = (r() - 0.5) * len * 0.35
  g.lineWidth = width
  g.beginPath()
  g.moveTo(x, y)
  g.quadraticCurveTo((x + ex) / 2 + Math.cos(ang + Math.PI / 2) * bend, (y + ey) / 2 + Math.sin(ang + Math.PI / 2) * bend, ex, ey)
  g.stroke()
  if (depth <= 0 || width < 0.8) return
  const kids = r() < 0.3 ? 3 : 2
  for (let k = 0; k < kids; k++) {
    const spread = (k - (kids - 1) / 2) * (0.5 + r() * 0.45) + (r() - 0.5) * 0.3
    tree(g, ex, ey, len * (0.62 + r() * 0.2), ang + spread, width * 0.66, depth - 1, r)
  }
}

interface Tomb {
  x: number
  y: number
}

/** The graveyard: ground, iron fence and tombstones. */
function paintGraveyard(g: CanvasRenderingContext2D, P: Pal, tombs: Tomb[]): void {
  const r = rng(77)
  // the graveyard's ground, rising a little to the right
  g.fillStyle = P.ground
  g.beginPath()
  g.moveTo(-200, 660)
  for (let x = -200; x <= BW + 200; x += 40) g.lineTo(x, 640 - Math.sin((x + 200) * 0.004) * 26 - Math.sin(x * 0.013) * 6)
  g.lineTo(BW + 200, BH + 200)
  g.lineTo(-200, BH + 200)
  g.fill()
  // iron fence along the back
  g.fillStyle = '#07040c'
  const fy = (x: number): number => 628 - Math.sin((x + 200) * 0.004) * 26
  g.fillRect(600, fy(600) - 54, 640, 3)
  g.fillRect(600, fy(600) - 20, 640, 3)
  for (let x = 600; x <= 1240; x += 15) {
    const top = fy(x) - 70
    g.fillRect(x, top, 3, 74)
    g.beginPath()
    g.moveTo(x - 3, top + 2)
    g.lineTo(x + 1.5, top - 9)
    g.lineTo(x + 6, top + 2)
    g.fill()
  }
  // tombstones, back rows smaller
  const rows = [
    { y: 652, n: 7, s: 0.55, x0: 560, x1: 1260 },
    { y: 690, n: 6, s: 0.75, x0: 480, x1: 1300 },
    { y: 734, n: 5, s: 0.95, x0: 420, x1: 1240 }
  ]
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const x = row.x0 + ((i + 0.3 + r() * 0.4) / row.n) * (row.x1 - row.x0)
      const y = row.y + (r() - 0.5) * 10
      const s = row.s * (0.85 + r() * 0.3)
      tombs.push({ x, y })
      stone(g, x, y, s, Math.floor(r() * 4), (r() - 0.5) * 0.14, P, r)
    }
  }
}

function stone(g: CanvasRenderingContext2D, x: number, y: number, s: number, kind: number, tilt: number, P: Pal, r: () => number): void {
  g.save()
  g.translate(x, y)
  g.rotate(tilt)
  g.scale(s, s)
  // shadow on the grass
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.beginPath()
  g.ellipse(-14, 2, 44, 7, 0, 0, Math.PI * 2)
  g.fill()
  const path = new Path2D()
  if (kind === 0) {
    path.moveTo(-26, 0)
    path.lineTo(-26, -58)
    path.arc(0, -58, 26, Math.PI, 0)
    path.lineTo(26, 0)
  } else if (kind === 1) {
    // a cross
    path.rect(-7, -96, 14, 96)
    path.rect(-28, -76, 56, 13)
  } else if (kind === 2) {
    path.moveTo(-30, 0)
    path.lineTo(-30, -52)
    path.lineTo(-20, -66)
    path.lineTo(20, -66)
    path.lineTo(30, -52)
    path.lineTo(30, 0)
  } else {
    // an obelisk
    path.moveTo(-15, 0)
    path.lineTo(-11, -104)
    path.lineTo(0, -120)
    path.lineTo(11, -104)
    path.lineTo(15, 0)
  }
  const [cr, cg, cb] = P.tomb
  const grd = g.createLinearGradient(-30, 0, 30, 0)
  grd.addColorStop(0, `rgb(${cr * 0.45},${cg * 0.45},${cb * 0.5})`)
  grd.addColorStop(0.7, `rgb(${cr},${cg},${cb})`)
  grd.addColorStop(1, `rgb(${Math.min(255, cr * 1.5)},${Math.min(255, cg * 1.5)},${Math.min(255, cb * 1.45)})`) // moon side
  g.fillStyle = grd
  g.fill(path)
  // weathering: specks and a bit of moss at the foot
  g.save()
  g.clip(path)
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`
    g.fillRect(-30 + r() * 60, -110 + r() * 110, 2 + r() * 4, 1 + r() * 3)
  }
  g.fillStyle = 'rgba(60,90,50,0.35)'
  g.fillRect(-32, -10, 64, 12)
  g.restore()
  if (kind === 0 || kind === 2) {
    g.fillStyle = 'rgba(0,0,0,0.38)'
    g.font = 'bold 13px Georgia, serif'
    g.textAlign = 'center'
    g.fillText('R.I.P', 0, -36)
  }
  g.restore()
}

interface Pumpkin {
  x: number
  y: number
  r: number
  face: Path2D
  ph: number
}

function pumpkinFace(x: number, y: number, r: number, kind: number): Path2D {
  const p = new Path2D()
  const eye = (cx: number, up: boolean): void => {
    p.moveTo(cx - r * 0.17, y - r * 0.06)
    p.lineTo(cx, y - r * (up ? 0.42 : 0.36))
    p.lineTo(cx + r * 0.17, y - r * 0.06)
    p.closePath()
  }
  eye(x - r * 0.3, true)
  eye(x + r * 0.3, kind === 1)
  // nose
  p.moveTo(x - r * 0.07, y + r * 0.08)
  p.lineTo(x, y - r * 0.04)
  p.lineTo(x + r * 0.07, y + r * 0.08)
  p.closePath()
  // a jagged grin
  const w = r * 0.6
  p.moveTo(x - w, y + r * 0.18)
  const teeth = kind === 2 ? 3 : 4
  for (let i = 0; i <= teeth * 2; i++) {
    const u = i / (teeth * 2)
    const px = x - w + u * w * 2
    const curve = Math.sin(u * Math.PI) * r * 0.22
    p.lineTo(px, y + r * 0.2 + curve * 0.4 + (i % 2 ? r * 0.08 : 0))
  }
  for (let i = teeth * 2; i >= 0; i--) {
    const u = i / (teeth * 2)
    const px = x - w + u * w * 2
    p.lineTo(px, y + r * 0.26 + Math.sin(u * Math.PI) * r * 0.28 - (i % 2 ? 0 : r * 0.07))
  }
  p.closePath()
  return p
}

/** Foreground: the near grass, the jack-o'-lanterns (unlit) and the big tree. */
function paintFront(g: CanvasRenderingContext2D, P: Pal, pumpkins: Pumpkin[]): void {
  const r = rng(31)
  g.fillStyle = P.front
  g.beginPath()
  g.moveTo(-200, 790)
  for (let x = -200; x <= BW + 200; x += 30) g.lineTo(x, 772 + Math.sin(x * 0.006) * 14 + Math.sin(x * 0.03) * 4)
  g.lineTo(BW + 200, BH + 200)
  g.lineTo(-200, BH + 200)
  g.fill()
  // tufts of grass
  g.strokeStyle = P.front
  g.lineCap = 'round'
  for (let i = 0; i < 220; i++) {
    const x = r() * BW
    const y = 778 + Math.sin(x * 0.006) * 14
    g.lineWidth = 1.5 + r() * 2
    g.beginPath()
    g.moveTo(x, y + 6)
    g.quadraticCurveTo(x + (r() - 0.5) * 10, y - 10, x + (r() - 0.5) * 16, y - 14 - r() * 18)
    g.stroke()
  }

  // the dead tree on the right, framing the moon
  g.strokeStyle = '#040208'
  g.lineCap = 'round'
  tree(g, 1470, 930, 250, -Math.PI / 2 - 0.12, 46, 7, rng(8))

  // jack-o'-lanterns
  const spots: [number, number, number, number][] = [
    [170, 784, 60, 0],
    [312, 806, 40, 2],
    [1108, 790, 54, 1],
    [1236, 810, 36, 0],
    [706, 812, 28, 2]
  ]
  for (const [x, y, rad, kind] of spots) {
    paintPumpkin(g, x, y, rad)
    const face = pumpkinFace(x, y - rad * 0.05, rad, kind)
    g.fillStyle = '#2a1004'
    g.fill(face)
    pumpkins.push({ x, y, r: rad, face, ph: r() * 6.28 })
  }
}

function paintPumpkin(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = 'rgba(0,0,0,0.5)'
  g.beginPath()
  g.ellipse(x, y + r * 0.78, r * 1.25, r * 0.22, 0, 0, Math.PI * 2)
  g.fill()
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.3)
  grd.addColorStop(0, '#ffad4a')
  grd.addColorStop(0.55, '#e0670f')
  grd.addColorStop(1, '#6d2a05')
  g.fillStyle = grd
  for (const k of [-2, 2, -1, 1, 0]) {
    g.beginPath()
    g.ellipse(x + k * r * 0.34, y, r * (0.55 - Math.abs(k) * 0.05), r * 0.82, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(90,30,0,0.45)'
    g.lineWidth = Math.max(1, r * 0.03)
    g.stroke()
  }
  // the stem
  g.fillStyle = '#3d4a1c'
  g.beginPath()
  g.moveTo(x - r * 0.08, y - r * 0.74)
  g.quadraticCurveTo(x - r * 0.04, y - r * 1.05, x + r * 0.16, y - r * 1.08)
  g.lineTo(x + r * 0.14, y - r * 0.96)
  g.quadraticCurveTo(x + r * 0.06, y - r * 0.92, x + r * 0.08, y - r * 0.74)
  g.closePath()
  g.fill()
}

const FOG_W = 1500
/** tiles are laid this far apart, so neighbours overlap and there's no seam */
const FOG_STEP = 1100

/** Draw a fog sprite tiled across the board, drifting at `speed` px/s. */
function fogBand(ctx: CanvasRenderingContext2D, fog: Layer, time: number, speed: number, y: number, h: number): void {
  const off = ((time * speed) % FOG_STEP) - FOG_STEP - 200
  for (let x = off; x < BW + 200; x += FOG_STEP) ctx.drawImage(fog, x, y, FOG_W, h)
}

function fogSprite(rgbStr: string, seed: number): Layer {
  const c = document.createElement('canvas')
  // the blobs stay well inside the canvas, so the blur fades out instead
  // of being cut at the edges (tiles overlap by the empty margins)
  c.width = FOG_W
  c.height = 240
  const g = c.getContext('2d')!
  g.filter = 'blur(26px)'
  const r = rng(seed)
  for (let i = 0; i < 30; i++) {
    const rx = 110 + r() * 170
    g.fillStyle = `rgba(${rgbStr},${0.08 + r() * 0.12})`
    g.beginPath()
    g.ellipse(rx + 80 + r() * (FOG_W - rx * 2 - 160), 120 + (r() - 0.5) * 50, rx, 22 + r() * 26, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Bat {
  x: number
  y: number
  vx: number
  vy: number
  s: number
  ph: number
  burst: boolean
}

interface Ghost {
  x: number
  y: number
  dir: number
  t: number
  life: number
  s: number
}

interface State {
  v: View
  P: Pal
  sky: Layer
  far: Layer
  yard: Layer
  front: Layer
  info: HouseInfo
  tombs: Tomb[]
  pumpkins: Pumpkin[]
  fogs: Layer[]
  candle: Layer
  green: Layer
  moonGlow: Layer
  bats: Bat[]
  ghosts: Ghost[]
  wisps: { x: number; y: number; ph: number; sp: number }[]
  nextWindow: number
}

let S: State | null = null

function newBat(r: () => number, burst = false, from?: { x: number; y: number }): Bat {
  const left = r() < 0.5
  return {
    x: from ? from.x : left ? -60 : BW + 60,
    y: from ? from.y : 90 + r() * 330,
    vx: (from ? (r() < 0.5 ? -1 : 1) : left ? 1 : -1) * (70 + r() * 80),
    vy: from ? -60 - r() * 90 : (r() - 0.5) * 20,
    s: 0.6 + r() * 0.8,
    ph: r() * 6.28,
    burst
  }
}

function newGhost(tombs: Tomb[], r: () => number): Ghost {
  const t = tombs[Math.floor(r() * tombs.length)]
  return { x: t.x, y: t.y - 60, dir: r() < 0.5 ? -1 : 1, t: 0, life: 9 + r() * 8, s: 0.7 + r() * 0.5 }
}

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const info: HouseInfo = { windows: [] }
  const tombs: Tomb[] = []
  const pumpkins: Pumpkin[] = []
  const r = rng(91)
  return {
    v,
    P,
    sky: makeLayer(v, (g) => paintSky(g, P)),
    far: makeLayer(v, (g) => paintFar(g, P, info)),
    yard: makeLayer(v, (g) => paintGraveyard(g, P, tombs)),
    front: makeLayer(v, (g) => paintFront(g, P, pumpkins)),
    info,
    tombs,
    pumpkins,
    fogs: [fogSprite(P.fog, 1), fogSprite(P.fog, 2), fogSprite(P.fog, 3)],
    candle: glowSprite('255,170,60'),
    green: glowSprite('140,255,190', 64),
    moonGlow: glowSprite(P.moonGlow),
    bats: Array.from({ length: 9 }, () => {
      const b = newBat(r)
      b.x = r() * BW
      return b
    }),
    ghosts: [],
    wisps: Array.from({ length: 9 }, () => ({ x: 450 + r() * 850, y: 640 + r() * 160, ph: r() * 6.28, sp: 0.3 + r() * 0.5 })),
    nextWindow: 3
  }
}

function drawBat(ctx: CanvasRenderingContext2D, b: Bat, time: number): void {
  const flap = Math.sin(time * (14 + b.s * 4) + b.ph)
  const s = b.s * 14
  const dir = Math.sign(b.vx) || 1
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.scale(dir * s, s)
  ctx.beginPath()
  // body
  ctx.ellipse(0, 0, 0.5, 0.75, 0, 0, Math.PI * 2)
  // ears
  ctx.moveTo(0.3, -0.6)
  ctx.lineTo(0.42, -1.05)
  ctx.lineTo(0.12, -0.7)
  ctx.moveTo(-0.3, -0.6)
  ctx.lineTo(-0.42, -1.05)
  ctx.lineTo(-0.12, -0.7)
  ctx.fill()
  // wings: scalloped, beating up and down
  const tip = -flap * 1.2
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * 0.35, -0.2)
    ctx.quadraticCurveTo(side * 1.4, -0.9 + tip, side * 2.6, -0.3 + tip)
    ctx.quadraticCurveTo(side * 2.2, 0.15 + tip * 0.5, side * 1.95, 0.05 + tip * 0.4)
    ctx.quadraticCurveTo(side * 1.7, 0.4 + tip * 0.3, side * 1.3, 0.2 + tip * 0.3)
    ctx.quadraticCurveTo(side * 1.05, 0.55, side * 0.7, 0.3)
    ctx.quadraticCurveTo(side * 0.5, 0.5, side * 0.35, 0.25)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost, a: number, time: number, glow: Layer): void {
  const s = g.s * 50
  const bob = Math.sin(time * 1.6 + g.x * 0.01) * 6
  ctx.save()
  ctx.translate(g.x, g.y + bob)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = a * 0.25
  ctx.drawImage(glow, -s * 2.2, -s * 2.4, s * 4.4, s * 4.4)
  ctx.globalCompositeOperation = 'source-over'
  ctx.scale(g.dir, 1)
  ctx.globalAlpha = a
  const grd = ctx.createLinearGradient(0, -s, 0, s * 1.3)
  grd.addColorStop(0, 'rgba(240,244,255,0.95)')
  grd.addColorStop(1, 'rgba(200,210,255,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.moveTo(-s * 0.7, s * 0.2)
  ctx.bezierCurveTo(-s * 0.8, -s * 1.15, s * 0.8, -s * 1.15, s * 0.7, s * 0.2)
  // a wavy hem, trailing behind
  const w = time * 5
  ctx.lineTo(s * 0.62, s * 1.2)
  for (let i = 0; i <= 4; i++) {
    const x = s * 0.62 - (i / 4) * s * 1.5
    ctx.lineTo(x, s * (1.05 + Math.sin(w + i * 1.7) * 0.12 + (i % 2 ? 0.14 : 0)))
  }
  ctx.closePath()
  ctx.fill()
  // eyes and an "oo" mouth
  ctx.fillStyle = `rgba(20,16,40,${0.9})`
  ctx.beginPath()
  ctx.ellipse(-s * 0.22, -s * 0.32, s * 0.09, s * 0.14, 0, 0, Math.PI * 2)
  ctx.ellipse(s * 0.2, -s * 0.32, s * 0.09, s * 0.14, 0, 0, Math.PI * 2)
  ctx.ellipse(0, s * 0.02, s * 0.09, s * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const halloweenWorld: World = {
  id: 'halloween',
  name: 'Halloween',
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
    // the moon breathes a little with the music
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.16 + 0.1 * c.breath + c.kick * 0.12 + c.surge * 0.15
    const mg = MOON.r * 5
    ctx.drawImage(st.moonGlow, MOON.x - mg / 2, MOON.y - mg / 2, mg, mg)
    ctx.globalCompositeOperation = 'source-over'
    // thin clouds sliding over the moon
    for (let i = 0; i < 2; i++) {
      const x = ((time * (7 + i * 4) + i * 760) % (BW + FOG_W)) - FOG_W
      ctx.globalAlpha = 0.45
      ctx.drawImage(st.fogs[i], x, 120 + i * 90, FOG_W, 200)
    }
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.far, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // candlelight in the mansion's windows; now and then one goes out or lights up
    st.nextWindow -= dt
    if (st.nextWindow <= 0) {
      const w = st.info.windows[Math.floor(Math.random() * st.info.windows.length)]
      w.on = !w.on
      st.nextWindow = 2 + Math.random() * 5
    }
    for (const w of st.info.windows) {
      if (!w.on) continue
      const flick = 0.75 + 0.15 * Math.sin(time * 7 + w.ph) + 0.1 * Math.sin(time * 17 + w.ph * 2)
      ctx.fillStyle = `rgba(255,${170 + 30 * flick},${70 + 20 * flick},${0.85 * flick})`
      ctx.beginPath()
      ctx.roundRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4, [(w.w - 4) / 2, (w.w - 4) / 2, 1, 1])
      ctx.fill()
      // the mullion
      ctx.fillStyle = 'rgba(20,10,10,0.8)'
      ctx.fillRect(w.x + w.w / 2 - 1, w.y + 2, 2, w.h - 4)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.35 * flick
      ctx.drawImage(st.candle, w.x - 20, w.y - 18, w.w + 40, w.h + 36)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }

    // bats: a few always circling; a big hit sends a flock out of the tree
    if (c.impactHit && st.bats.length < 40) {
      for (let i = 0; i < 10; i++) st.bats.push(newBat(Math.random, true, { x: 1380 + Math.random() * 120, y: 500 + Math.random() * 100 }))
    }
    const speed = 1 + c.energy * 0.6 + c.surge * 0.5
    ctx.fillStyle = '#05030a'
    for (let i = st.bats.length - 1; i >= 0; i--) {
      const b = st.bats[i]
      b.x += b.vx * dt * speed
      b.y += (b.vy + Math.sin(time * 2 + b.ph) * 30) * dt * speed
      if (b.burst) b.vy *= 1 - dt * 0.6
      if (b.x < -80 || b.x > BW + 80 || b.y < -80) {
        if (b.burst || st.bats.length > 12) st.bats.splice(i, 1)
        else Object.assign(b, newBat(Math.random))
        continue
      }
      drawBat(ctx, b, time)
    }
    ctx.restore()

    // fog far
    ctx.save()
    toBoard(ctx, st.v)
    ctx.globalAlpha = 0.5
    fogBand(ctx, st.fogs[2], time, 9, 520, 220)
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.yard, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // will-o'-wisps among the graves
    ctx.globalCompositeOperation = 'lighter'
    for (const w of st.wisps) {
      const x = w.x + Math.sin(time * w.sp + w.ph) * 40
      const y = w.y + Math.sin(time * w.sp * 1.7 + w.ph) * 14
      const a = (0.25 + 0.25 * Math.sin(time * 2 + w.ph)) * (0.7 + c.hihats * 0.6 + c.surge * 0.4)
      ctx.globalAlpha = Math.max(0, a)
      ctx.drawImage(st.green, x - 16, y - 16, 32, 32)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    // ghosts drift between the graves; someone singing brings them out
    const want = 1 + Math.round(c.vocals * 2 + c.surge)
    if (st.ghosts.length < want && Math.random() < dt * 0.4) st.ghosts.push(newGhost(st.tombs, Math.random))
    for (let i = st.ghosts.length - 1; i >= 0; i--) {
      const g = st.ghosts[i]
      g.t += dt
      g.x += g.dir * 14 * dt
      g.y -= 3 * dt
      if (g.t > g.life) {
        st.ghosts.splice(i, 1)
        continue
      }
      // fade in, linger, fade out
      const a = Math.min(1, g.t / 2, (g.life - g.t) / 2) * (0.6 + c.vocals * 0.35)
      drawGhost(ctx, g, Math.max(0, a), time, st.moonGlow)
    }
    // mid fog, in front of the graves
    ctx.globalAlpha = 0.55
    fogBand(ctx, st.fogs[0], time, 15, 660, 200)
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.front, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // the jack-o'-lanterns: candle flicker, and the kick lights them up
    for (const p of st.pumpkins) {
      const flick = 0.7 + 0.18 * Math.sin(time * 9 + p.ph) + 0.12 * Math.sin(time * 23 + p.ph * 3)
      const glow = Math.min(1.4, flick * (0.7 + c.kick * 0.7 + c.surge * 0.3))
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.28 * glow
      ctx.drawImage(st.candle, p.x - p.r * 2.6, p.y - p.r * 1.8, p.r * 5.2, p.r * 4) // light on the grass
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = `rgba(255,${Math.round(170 + 70 * Math.min(1, glow))},${Math.round(60 + 90 * Math.min(1, glow))},1)`
      ctx.fill(p.face)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = Math.min(1, 0.35 + 0.4 * glow)
      ctx.fill(p.face)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.5 * glow
      ctx.drawImage(st.candle, p.x - p.r * 0.9, p.y - p.r * 0.8, p.r * 1.8, p.r * 1.6)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
    // the low fog, closest
    ctx.globalAlpha = 0.4
    fogBand(ctx, st.fogs[1], time, 22, 740, 220)
    ctx.globalAlpha = 1
    ctx.restore()

    // a violet grade and a vignette
    const vign = ctx.createRadialGradient(width / 2, height * 0.45, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.8)
    vign.addColorStop(0, 'rgba(10,0,20,0)')
    vign.addColorStop(1, `rgba(6,0,14,${P.key === 'night' ? 0.6 : 0.45})`)
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
