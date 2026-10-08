import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * ⛩️ Japanese Garden — a serene garden by a still pond, at dusk by default.
 *
 * Layered mountains fade into the haze (a snow-capped peak far away, a small
 * pagoda on a hill), the sun sets behind them and a band of mist drifts along
 * the horizon. A vermilion torii stands in the water and ripples in its own
 * reflection; koi glide under the surface between lily pads and a lotus; a
 * stone lantern glows on the shore; a big cherry tree frames the corner and
 * lets its petals tumble down — some come to rest on the pond and float.
 *
 * The clock only changes the light: soft pastel spring by day, the pink-violet
 * dusk most of the time, a moonlit night with stars and fireflies.
 *
 * Calm first: the music only lets more petals go and makes the lantern breathe.
 */

const HOR = 560 // the waterline on the board

// ---------------------------------------------------------------------------
// light by time of day
// ---------------------------------------------------------------------------

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: RGB
  skyMid: RGB
  skyLow: RGB
  sun: { x: number; y: number; r: number; color: string; glow: string; moon: boolean }
  far: string
  mid: string
  near: string
  waterTop: RGB
  waterBottom: RGB
  /** 0 = broad day … 1 = deep night */
  night: number
  cloud: string
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 16)
    return {
      key: 'day',
      skyTop: [118, 168, 214],
      skyMid: [188, 206, 228],
      skyLow: [246, 224, 218],
      sun: { x: 1180, y: 200, r: 40, color: '#fff7e6', glow: '255,244,214', moon: false },
      far: '#9aaac6',
      mid: '#73849f',
      near: '#3f4d55',
      waterTop: [150, 178, 204],
      waterBottom: [44, 68, 92],
      night: 0,
      cloud: '255,255,255'
    }
  if ((h >= 16 && h < 20) || (h >= 5 && h < 8))
    return {
      key: 'dusk',
      skyTop: [44, 28, 62],
      skyMid: [128, 82, 120],
      skyLow: [240, 164, 140],
      sun: { x: 668, y: 492, r: 58, color: '#ffd8aa', glow: '255,186,130', moon: false },
      far: '#8c7398',
      mid: '#5e4a72',
      near: '#2c2238',
      waterTop: [150, 104, 128],
      waterBottom: [24, 24, 46],
      night: 0.45,
      cloud: '255,190,180'
    }
  return {
    key: 'night',
    skyTop: [8, 12, 30],
    skyMid: [24, 28, 62],
    skyLow: [62, 54, 98],
    sun: { x: 1120, y: 170, r: 36, color: '#f3eedc', glow: '210,220,255', moon: true },
    far: '#3c3e66',
    mid: '#26284c',
    near: '#141530',
    waterTop: [46, 46, 88],
    waterBottom: [8, 10, 24],
    night: 1,
    cloud: '150,160,210'
  }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

/** Sky, sun or moon, stars, mountains, the pagoda hill and the far shore. */
function paintLand(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, HOR)
  sky.addColorStop(0, rgb(P.skyTop))
  sky.addColorStop(0.55, rgb(P.skyMid))
  sky.addColorStop(1, rgb(P.skyLow))
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, HOR + 300)

  const r = rng(3)
  if (P.night > 0.7) {
    for (let i = 0; i < 220; i++) {
      const sx = r() * BW
      const sy = r() * HOR * 0.7
      g.fillStyle = `rgba(255,255,240,${0.2 + r() * 0.6})`
      g.fillRect(sx, sy, r() < 0.1 ? 2 : 1.2, r() < 0.1 ? 2 : 1.2)
    }
  }

  // sun / moon with its glow
  const { x, y, r: R } = P.sun
  const glow = g.createRadialGradient(x, y, 0, x, y, R * 7)
  glow.addColorStop(0, `rgba(${P.sun.glow},0.55)`)
  glow.addColorStop(0.3, `rgba(${P.sun.glow},0.18)`)
  glow.addColorStop(1, `rgba(${P.sun.glow},0)`)
  g.fillStyle = glow
  g.fillRect(x - R * 7, y - R * 7, R * 14, R * 14)
  g.fillStyle = P.sun.color
  g.beginPath()
  g.arc(x, y, R, 0, Math.PI * 2)
  g.fill()
  if (P.sun.moon) {
    g.fillStyle = 'rgba(160,160,180,0.18)'
    for (const [mx, my, mr] of [
      [-10, -8, 8],
      [12, 6, 6],
      [-4, 14, 4]
    ])
      g.beginPath(), g.arc(x + mx, y + my, mr, 0, Math.PI * 2), g.fill()
  }

  // the far peak, snow-capped
  g.fillStyle = P.far
  g.beginPath()
  g.moveTo(560, HOR)
  g.quadraticCurveTo(860, 420, 1000, 270)
  g.quadraticCurveTo(1140, 420, 1460, HOR)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(250,246,250,0.82)'
  g.beginPath()
  g.moveTo(1000, 270)
  g.quadraticCurveTo(958, 312, 930, 348)
  for (let i = 0; i < 6; i++) g.lineTo(944 + i * 24, i % 2 ? 360 + r() * 14 : 338 + r() * 10)
  g.quadraticCurveTo(1046, 312, 1000, 270)
  g.fill()
  // a ridge to the left
  g.fillStyle = P.far
  g.beginPath()
  g.moveTo(-100, HOR)
  g.lineTo(-100, 440)
  g.quadraticCurveTo(160, 400, 330, 460)
  g.quadraticCurveTo(470, 500, 640, HOR)
  g.closePath()
  g.fill()
  // haze settling on the far range
  const haze = g.createLinearGradient(0, 380, 0, HOR)
  haze.addColorStop(0, rgb(P.skyLow, 0))
  haze.addColorStop(1, rgb(P.skyLow, 0.55))
  g.fillStyle = haze
  g.fillRect(-300, 380, BW + 600, HOR - 380)

  // nearer hills, with a pagoda on one of them
  g.fillStyle = P.mid
  g.beginPath()
  g.moveTo(-100, HOR)
  g.lineTo(-100, 500)
  g.quadraticCurveTo(160, 450, 360, 488)
  g.quadraticCurveTo(560, 520, 760, 506)
  g.quadraticCurveTo(1000, 490, 1200, 518)
  g.quadraticCurveTo(1450, 540, 1700, 500)
  g.lineTo(1700, HOR)
  g.closePath()
  g.fill()
  pagoda(g, 300, 474, P.mid)

  // the far shore: a band of trees and pines
  g.fillStyle = P.near
  g.beginPath()
  g.moveTo(-100, HOR + 2)
  for (let px = -100; px <= 1700; px += 24) g.lineTo(px, HOR - 10 - r() * 16)
  g.lineTo(1700, HOR + 2)
  g.closePath()
  g.fill()
  for (let i = 0; i < 22; i++) pine(g, -40 + r() * 1700, HOR - 6, 26 + r() * 34, P.near)
  // a small lantern on the far shore (its light is drawn live)
  g.fillStyle = P.near
  g.fillRect(696, HOR - 34, 8, 26)
  g.fillRect(690, HOR - 40, 20, 6)
  g.fillRect(693, HOR - 10, 14, 4)
}

function pagoda(g: CanvasRenderingContext2D, x: number, base: number, color: string): void {
  g.fillStyle = color
  g.fillRect(x - 3, base - 118, 6, 24) // spire
  for (let i = 0; i < 3; i++) {
    const y = base - i * 30
    const w = 64 - i * 12
    g.fillRect(x - w * 0.32, y - 22, w * 0.64, 22)
    g.beginPath() // roof with upturned eaves
    g.moveTo(x - w * 0.62, y - 20)
    g.quadraticCurveTo(x - w * 0.45, y - 24, x - w * 0.36, y - 30)
    g.lineTo(x + w * 0.36, y - 30)
    g.quadraticCurveTo(x + w * 0.45, y - 24, x + w * 0.62, y - 20)
    g.closePath()
    g.fill()
  }
}

function pine(g: CanvasRenderingContext2D, x: number, base: number, h: number, color: string): void {
  g.fillStyle = color
  g.beginPath()
  g.moveTo(x, base - h)
  g.lineTo(x + h * 0.28, base - h * 0.4)
  g.lineTo(x + h * 0.12, base - h * 0.42)
  g.lineTo(x + h * 0.36, base)
  g.lineTo(x - h * 0.36, base)
  g.lineTo(x - h * 0.12, base - h * 0.42)
  g.lineTo(x - h * 0.28, base - h * 0.4)
  g.closePath()
  g.fill()
}

/** The vermilion torii standing in the water. */
function paintTorii(g: CanvasRenderingContext2D, P: Pal): void {
  const cx = 1250
  const base = 648
  const shade = 1 - P.night * 0.55
  const red = `rgb(${Math.round(196 * shade)},${Math.round(66 * shade)},${Math.round(44 * shade)})`
  const dark = `rgb(${Math.round(120 * shade)},${Math.round(36 * shade)},${Math.round(26 * shade)})`
  const black = '#15100e'
  // pillars, slightly tapered, black where they meet the water
  for (const side of [-1, 1]) {
    const px = cx + side * 86
    g.fillStyle = red
    g.beginPath()
    g.moveTo(px - 9, 420)
    g.lineTo(px + 9, 420)
    g.lineTo(px + 11, base)
    g.lineTo(px - 11, base)
    g.closePath()
    g.fill()
    g.fillStyle = dark
    g.fillRect(px + 3, 420, 6, base - 420)
    g.fillStyle = black
    g.fillRect(px - 12, base - 26, 24, 26)
  }
  // nuki (tie beam) through the pillars
  g.fillStyle = red
  g.fillRect(cx - 128, 458, 256, 14)
  g.fillStyle = dark
  g.fillRect(cx - 128, 468, 256, 4)
  // gakuzuka (the strut in the middle)
  g.fillStyle = red
  g.fillRect(cx - 8, 418, 16, 42)
  // shimaki + kasagi: the double top beam, sweeping up at the ends
  g.fillStyle = red
  g.fillRect(cx - 136, 404, 272, 16)
  g.fillStyle = black
  g.beginPath()
  g.moveTo(cx - 176, 384)
  g.quadraticCurveTo(cx - 120, 398, cx, 398)
  g.quadraticCurveTo(cx + 120, 398, cx + 176, 384)
  g.lineTo(cx + 172, 396)
  g.quadraticCurveTo(cx + 120, 410, cx, 410)
  g.quadraticCurveTo(cx - 120, 410, cx - 172, 396)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255,220,200,0.12)'
  g.fillRect(cx - 136, 404, 272, 3)
}

/** The water and the lily pads (both static); reflections are live. */
function paintWater(g: CanvasRenderingContext2D, P: Pal): void {
  const w = g.createLinearGradient(0, HOR, 0, BH)
  w.addColorStop(0, rgb(P.waterTop))
  w.addColorStop(1, rgb(P.waterBottom))
  g.fillStyle = w
  g.fillRect(-300, HOR, BW + 600, BH - HOR + 300)
}

function paintPads(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(17)
  const dim = 1 - P.night * 0.5
  const pads: [number, number, number][] = [
    [560, 716, 30],
    [606, 738, 22],
    [520, 744, 18],
    [1380, 800, 34],
    [1440, 772, 20],
    [1330, 836, 24],
    [860, 676, 16],
    [900, 690, 12]
  ]
  for (const [x, y, s] of pads) {
    const notch = r() * Math.PI * 2
    g.fillStyle = `hsl(${105 + r() * 25}, ${34}%, ${Math.round((24 + r() * 10) * dim)}%)`
    g.beginPath()
    g.moveTo(x, y)
    g.ellipse(x, y, s, s * 0.38, 0, notch + 0.35, notch + Math.PI * 2 - 0.05)
    g.closePath()
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.10)'
    g.lineWidth = 1
    g.beginPath()
    g.ellipse(x, y, s * 0.96, s * 0.36, 0, notch + 0.4, notch + Math.PI)
    g.stroke()
  }
  // a lotus on the first pad
  const lx = 556
  const ly = 708
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32
    g.fillStyle = i % 2 ? `rgba(246,180,206,${dim})` : `rgba(252,214,226,${dim})`
    g.save()
    g.translate(lx, ly)
    g.rotate(a + Math.PI / 2)
    g.beginPath()
    g.ellipse(0, -10, 5, 12, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  g.fillStyle = `rgba(255,220,120,${dim})`
  g.beginPath()
  g.arc(lx, ly - 2, 3, 0, Math.PI * 2)
  g.fill()
}

/** The near shore, rocks, the big stone lantern and the cherry tree. */
function paintForeground(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(41)
  const dim = 1 - P.night * 0.55
  const shade = (v: number): number => Math.round(v * dim)
  // shore
  const earth = g.createLinearGradient(0, 760, 0, BH)
  earth.addColorStop(0, `rgb(${shade(48)},${shade(62)},${shade(40)})`)
  earth.addColorStop(1, `rgb(${shade(20)},${shade(26)},${shade(18)})`)
  g.fillStyle = earth
  g.beginPath()
  g.moveTo(-100, 770)
  g.quadraticCurveTo(200, 756, 360, 800)
  g.quadraticCurveTo(470, 832, 560, BH + 40)
  g.lineTo(-100, BH + 40)
  g.closePath()
  g.fill()
  // moss tufts
  for (let i = 0; i < 160; i++) {
    const mx = -60 + r() * 560
    const my = 780 + r() * 130
    if (my < 770 + (mx / 560) * 40) continue
    g.fillStyle = `rgba(${shade(90 + r() * 40)},${shade(120 + r() * 40)},${shade(60)},0.35)`
    g.fillRect(mx, my, 2 + r() * 4, 1.5)
  }
  // rounded rocks along the water's edge
  for (const [x, y, w, h] of [
    [330, 800, 46, 24],
    [390, 822, 30, 16],
    [470, 860, 58, 30],
    [150, 776, 38, 18]
  ] as const) {
    const rock = g.createLinearGradient(0, y - h, 0, y + h)
    rock.addColorStop(0, `rgb(${shade(126)},${shade(122)},${shade(116)})`)
    rock.addColorStop(1, `rgb(${shade(52)},${shade(50)},${shade(48)})`)
    g.fillStyle = rock
    g.beginPath()
    g.ellipse(x, y, w, h, 0, Math.PI, 0)
    g.quadraticCurveTo(x + w, y + h * 0.4, x, y + h * 0.4)
    g.quadraticCurveTo(x - w, y + h * 0.4, x - w, y)
    g.fill()
    g.fillStyle = `rgba(${shade(110)},${shade(140)},${shade(70)},0.45)`
    g.beginPath()
    g.ellipse(x - w * 0.2, y - h * 0.75, w * 0.45, h * 0.22, 0, 0, Math.PI * 2)
    g.fill()
  }

  // the stone lantern (kasuga-dōrō); the light in its box is live
  stoneLantern(g, 236, 812, 1, dim)

  // the cherry tree: trunk, branches, blossom clouds
  const bark = `rgb(${shade(58)},${shade(38)},${shade(36)})`
  g.strokeStyle = bark
  g.lineCap = 'round'
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number): void => {
    const ex = x + Math.cos(ang) * len
    const ey = y + Math.sin(ang) * len
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(ang + 0.3) * len * 0.5, y + Math.sin(ang + 0.3) * len * 0.5, ex, ey)
    g.stroke()
    if (depth <= 0 || w < 3) {
      blossoms.push([ex, ey, 26 + r() * 30])
      return
    }
    const n = depth > 2 ? 2 : 2 + (r() < 0.5 ? 1 : 0)
    for (let i = 0; i < n; i++) branch(ex, ey, ang + (r() - 0.5) * 1.1 + (i - (n - 1) / 2) * 0.5, len * (0.62 + r() * 0.2), w * 0.62, depth - 1)
  }
  const blossoms: [number, number, number][] = []
  // trunk rising from behind the lantern, leaning right
  g.lineWidth = 46
  g.beginPath()
  g.moveTo(40, BH + 40)
  g.bezierCurveTo(70, 700, 30, 520, 110, 360)
  g.stroke()
  branch(110, 360, -1.0, 170, 30, 4)
  branch(100, 400, -2.1, 150, 26, 3)
  branch(120, 380, -0.35, 230, 24, 4)
  // blossom clouds, built up in three passes: a shadowed underside, the
  // body of pink puffs, then single little flowers catching the light
  for (const [bx, by, br] of blossoms) {
    for (let k = 0; k < 10; k++) {
      g.fillStyle = `rgba(${shade(196)},${shade(104)},${shade(140)},0.55)`
      g.beginPath()
      g.arc(bx + (r() - 0.5) * br * 1.7, by + br * 0.25 + (r() - 0.3) * br * 0.7, br * (0.2 + r() * 0.25), 0, Math.PI * 2)
      g.fill()
    }
    for (let k = 0; k < 26; k++) {
      const tone = r()
      g.fillStyle =
        tone < 0.45 ? `rgba(${shade(242)},${shade(170)},${shade(194)},0.82)` : `rgba(${shade(250)},${shade(204)},${shade(218)},0.82)`
      g.beginPath()
      g.arc(bx + (r() - 0.5) * br * 1.8, by + (r() - 0.55) * br * 1.2, br * (0.14 + r() * 0.24), 0, Math.PI * 2)
      g.fill()
    }
    for (let k = 0; k < 34; k++) {
      const fx = bx + (r() - 0.5) * br * 1.9
      const fy = by + (r() - 0.6) * br * 1.3
      const fr = 2.2 + r() * 2.4
      g.fillStyle = `rgba(${shade(255)},${shade(236)},${shade(242)},${0.6 + r() * 0.35})`
      for (let q = 0; q < 5; q++) {
        const a = (q / 5) * Math.PI * 2 + r()
        g.beginPath()
        g.arc(fx + Math.cos(a) * fr * 0.7, fy + Math.sin(a) * fr * 0.7, fr * 0.55, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = `rgba(${shade(220)},${shade(120)},${shade(150)},0.8)`
      g.fillRect(fx - 0.7, fy - 0.7, 1.4, 1.4)
    }
  }
}

function stoneLantern(g: CanvasRenderingContext2D, x: number, base: number, k: number, dim: number): void {
  const stone = (v: number): string => `rgb(${Math.round(v * dim)},${Math.round(v * dim * 0.98)},${Math.round(v * dim * 0.93)})`
  const s = k
  g.fillStyle = stone(70)
  g.fillRect(x - 44 * s, base - 16 * s, 88 * s, 16 * s) // base
  g.fillStyle = stone(86)
  g.fillRect(x - 12 * s, base - 108 * s, 24 * s, 92 * s) // shaft
  g.fillStyle = stone(64)
  g.fillRect(x + 4 * s, base - 108 * s, 8 * s, 92 * s)
  g.fillStyle = stone(96)
  g.fillRect(x - 40 * s, base - 124 * s, 80 * s, 16 * s) // platform
  g.fillStyle = stone(80)
  g.fillRect(x - 30 * s, base - 176 * s, 60 * s, 52 * s) // light box
  g.fillStyle = '#120c08'
  g.fillRect(x - 14 * s, base - 166 * s, 28 * s, 30 * s) // window (lit live)
  g.fillStyle = stone(100) // roof with upturned corners
  g.beginPath()
  g.moveTo(x - 64 * s, base - 172 * s)
  g.quadraticCurveTo(x - 40 * s, base - 182 * s, x - 22 * s, base - 206 * s)
  g.lineTo(x + 22 * s, base - 206 * s)
  g.quadraticCurveTo(x + 40 * s, base - 182 * s, x + 64 * s, base - 172 * s)
  g.lineTo(x + 56 * s, base - 168 * s)
  g.lineTo(x - 56 * s, base - 168 * s)
  g.closePath()
  g.fill()
  g.fillStyle = stone(90) // finial
  g.beginPath()
  g.arc(x, base - 214 * s, 9 * s, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = `rgba(${Math.round(100 * dim)},${Math.round(130 * dim)},${Math.round(70 * dim)},0.5)` // moss
  g.fillRect(x - 40 * s, base - 124 * s, 34 * s, 4 * s)
}

/** A soft cloud wisp sprite. */
function cloudSprite(rgbStr: string, seed: number): Layer {
  const c = document.createElement('canvas')
  c.width = 520
  c.height = 120
  const g = c.getContext('2d')!
  g.filter = 'blur(10px)'
  const r = rng(seed)
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(${rgbStr},${0.16 + r() * 0.14})`
    g.beginPath()
    g.ellipse(70 + r() * 380, 60 + (r() - 0.5) * 30, 50 + r() * 70, 12 + r() * 12, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Petal {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  flip: number
  size: number
  hue: number
  /** where it will land on the pond (board y), or Infinity for the shore */
  land: number
  floating: number // seconds afloat (0 = still falling)
}

interface Koi {
  cx: number
  cy: number
  rx: number
  ry: number
  speed: number
  phase: number
  size: number
  colors: [string, string]
}

interface State {
  v: View
  P: Pal
  land: Layer
  torii: Layer
  water: Layer
  reflection: Layer
  pads: Layer
  fg: Layer
  clouds: Layer[]
  warm: Layer
  firefly: Layer
  petals: Petal[]
  ripples: { x: number; y: number; t: number }[]
  nextRipple: number
  koi: Koi[]
  flies: { x: number; y: number; ph: number }[]
  spawnAcc: number
}

let S: State | null = null

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  // the reflection: the land and the torii mirrored about the waterline,
  // then sunk into the water's colour
  const reflection = makeLayer(v, (g) => {
    g.save()
    g.beginPath()
    g.rect(-300, HOR, BW + 600, BH - HOR + 300)
    g.clip()
    g.translate(0, 2 * HOR)
    g.scale(1, -1)
    paintLand(g, P)
    paintTorii(g, P)
    g.restore()
    const sink = g.createLinearGradient(0, HOR, 0, BH)
    sink.addColorStop(0, rgb(P.waterTop, 0.35))
    sink.addColorStop(1, rgb(P.waterBottom, 0.85))
    g.fillStyle = sink
    g.fillRect(-300, HOR, BW + 600, BH - HOR + 300)
  })
  const r = rng(7)
  return {
    v,
    P,
    land: makeLayer(v, (g) => paintLand(g, P)),
    torii: makeLayer(v, (g) => paintTorii(g, P)),
    water: makeLayer(v, (g) => paintWater(g, P)),
    reflection,
    pads: makeLayer(v, (g) => paintPads(g, P)),
    fg: makeLayer(v, (g) => paintForeground(g, P)),
    clouds: [cloudSprite(P.cloud, 1), cloudSprite(P.cloud, 2), cloudSprite(P.cloud, 3)],
    warm: glowSprite('255,184,100'),
    firefly: glowSprite('214,255,150', 64),
    petals: [],
    ripples: [],
    nextRipple: 3,
    koi: [
      { cx: 900, cy: 770, rx: 230, ry: 70, speed: 0.11, phase: r() * 6, size: 1, colors: ['#f08a3c', '#f6efe6'] },
      { cx: 1120, cy: 720, rx: 170, ry: 46, speed: -0.09, phase: r() * 6, size: 0.8, colors: ['#f2c14e', '#f2c14e'] },
      { cx: 760, cy: 840, rx: 140, ry: 34, speed: 0.13, phase: r() * 6, size: 0.9, colors: ['#f6efe6', '#e2563a'] }
    ],
    flies: Array.from({ length: 16 }, () => ({ x: r() * 900, y: 560 + r() * 300, ph: r() * 6.28 })),
    spawnAcc: 0
  }
}

function spawnPetal(st: State, anywhere = false): void {
  const r = Math.random
  const fromTree = r() < 0.75
  const p: Petal = {
    x: fromTree ? -20 + r() * 760 : r() * BW,
    y: fromTree ? (anywhere ? r() * 700 : 40 + r() * 280) : anywhere ? r() * 700 : -20,
    vx: 16 + r() * 22,
    vy: 18 + r() * 16,
    rot: r() * 6.28,
    spin: (r() - 0.5) * 2.4,
    flip: r() * 6.28,
    size: 5 + r() * 4,
    hue: r(),
    land: Infinity,
    floating: 0
  }
  // most come down on the pond (anywhere right of the near shore)
  const landY = HOR + 40 + r() * (BH - HOR - 60)
  p.land = landY
  st.petals.push(p)
}

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal, alpha: number): void {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(p.flip))))
  ctx.globalAlpha = alpha
  ctx.fillStyle = p.hue < 0.5 ? '#f7c3d2' : p.hue < 0.85 ? '#fbdce5' : '#f0a3bb'
  const s = p.size
  ctx.beginPath() // a petal with the little notch at its tip
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(-s * 0.9, s * 0.4, -s * 0.8, -s * 0.7, -s * 0.18, -s)
  ctx.lineTo(0, -s * 0.72)
  ctx.lineTo(s * 0.18, -s)
  ctx.bezierCurveTo(s * 0.8, -s * 0.7, s * 0.9, s * 0.4, 0, s)
  ctx.fill()
  ctx.restore()
}

function drawKoi(ctx: CanvasRenderingContext2D, k: Koi, time: number): void {
  const a = k.phase + time * k.speed
  const x = k.cx + Math.cos(a) * k.rx
  const y = k.cy + Math.sin(a) * k.ry
  // heading along the path
  const dx = -Math.sin(a) * k.rx * Math.sign(k.speed)
  const dy = Math.cos(a) * k.ry * Math.sign(k.speed)
  const heading = Math.atan2(dy, dx)
  const depth = 0.75 + ((y - HOR) / (BH - HOR)) * 0.5 // nearer = bigger
  const L = 46 * k.size * depth
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  ctx.scale(1, 0.62) // seen from above, a little flattened by the water
  const wag = Math.sin(time * 3.1 + k.phase) * 0.35
  // tail fin
  ctx.fillStyle = k.colors[0]
  ctx.beginPath()
  ctx.moveTo(-L * 0.55, 0)
  ctx.lineTo(-L * 0.95, -L * 0.22 + wag * L * 0.2)
  ctx.lineTo(-L * 0.85, wag * L * 0.1)
  ctx.lineTo(-L * 0.95, L * 0.22 + wag * L * 0.2)
  ctx.closePath()
  ctx.fill()
  // body
  ctx.fillStyle = k.colors[1]
  ctx.beginPath()
  ctx.moveTo(L * 0.5, 0)
  ctx.quadraticCurveTo(L * 0.3, -L * 0.2, -L * 0.1, -L * 0.15)
  ctx.quadraticCurveTo(-L * 0.45, -L * 0.08 + wag * 3, -L * 0.6, wag * 4)
  ctx.quadraticCurveTo(-L * 0.45, L * 0.08 + wag * 3, -L * 0.1, L * 0.15)
  ctx.quadraticCurveTo(L * 0.3, L * 0.2, L * 0.5, 0)
  ctx.fill()
  // a patch of colour on the back
  ctx.fillStyle = k.colors[0]
  ctx.beginPath()
  ctx.ellipse(L * 0.08, 0, L * 0.18, L * 0.09, 0, 0, Math.PI * 2)
  ctx.fill()
  // pectoral fins
  ctx.globalAlpha *= 0.7
  ctx.beginPath()
  ctx.ellipse(L * 0.2, -L * 0.17, L * 0.1, L * 0.04, -0.6, 0, Math.PI * 2)
  ctx.ellipse(L * 0.2, L * 0.17, L * 0.1, L * 0.04, 0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const japaneseGardenWorld: World = {
  id: 'japanese-garden',
  name: 'Japanese Garden',
  spectrumBins: 12,

  mount(c: WorldContext): void {
    S = build(c)
    for (let i = 0; i < 26; i++) spawnPetal(S, true)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const v = viewFor(c)
    if (!S || !sameView(S.v, v) || S.P.key !== palFor(c.dayPhase).key) {
      const petals = S?.petals ?? []
      S = build(c)
      S.petals = petals
    }
    const st = S
    const P = st.P
    const { s, ox, oy } = st.v
    const breathe = 0.86 + 0.08 * c.breath + 0.08 * c.energy

    ctx.save()
    ctx.drawImage(st.land, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // clouds drifting very slowly across the sky
    for (let i = 0; i < 3; i++) {
      const speed = 3 + i * 1.5
      const cx = ((i * 640 + time * speed) % (BW + 700)) - 520
      ctx.globalAlpha = P.night > 0.7 ? 0.5 : 0.9
      ctx.drawImage(st.clouds[i], cx, 120 + i * 70, 520, 120)
    }
    // mist along the horizon
    ctx.globalAlpha = 0.28 + 0.06 * Math.sin(time * 0.1)
    for (let i = 0; i < 2; i++) {
      const mx = ((time * (6 + i * 3) + i * 800) % (BW + 1000)) - 900
      ctx.drawImage(st.clouds[i], mx, HOR - 70 + i * 18, 1100, 110)
    }
    ctx.globalAlpha = 1
    ctx.restore()

    // ---- the pond: water, koi under the surface, the rippling reflection
    ctx.drawImage(st.water, 0, 0, width, height)
    ctx.save()
    toBoard(ctx, st.v)
    ctx.globalAlpha = 0.55 * (1 - P.night * 0.4)
    for (const k of st.koi) drawKoi(ctx, k, time)
    ctx.globalAlpha = 1
    ctx.restore()

    // reflection, drawn in thin bands that sway: calm near the far shore,
    // a little more as the water comes closer
    const dpr = st.v.dpr
    const band = 3
    ctx.globalAlpha = 0.85
    for (let y = HOR; y < BH; y += band) {
      const d = y - HOR
      const amp = 0.4 + d * 0.022
      const off = (Math.sin(y * 0.11 + time * 1.3) + 0.6 * Math.sin(y * 0.037 - time * 0.7)) * amp
      const sy = (oy + y * s) * dpr
      const sh = band * s * dpr + 1
      if (sy >= st.reflection.height || sy + sh <= 0) continue
      ctx.drawImage(st.reflection, 0, sy, st.reflection.width, sh, off * s, oy + y * s, width, band * s + 1 / dpr)
    }
    ctx.globalAlpha = 1

    ctx.save()
    toBoard(ctx, st.v)
    // the sun (or moon) glittering on the water below it
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 46; i++) {
      const d = (i / 46) ** 1.3
      const gy = HOR + 8 + d * (BH - HOR - 30)
      const spread = 12 + d * 120
      const gx = P.sun.x + Math.sin(i * 12.9898 + Math.floor(time * 1.6 + i) * 0.7) * spread
      const tw = 0.5 + 0.5 * Math.sin(time * 2.2 + i * 1.7)
      ctx.globalAlpha = tw * 0.32 * (1 - d * 0.6)
      ctx.fillStyle = `rgba(${P.sun.glow},1)`
      ctx.fillRect(gx - 6 - d * 10, gy, 12 + d * 20, 1.6 + d * 1.2)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.pads, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // a fish rising now and then (and on a big moment of the song)
    st.nextRipple -= dt
    if (st.nextRipple <= 0 || c.impactHit) {
      st.nextRipple = 4 + Math.random() * 6
      st.ripples.push({ x: 640 + Math.random() * 760, y: HOR + 60 + Math.random() * 240, t: 0 })
    }
    ctx.lineWidth = 1.2
    st.ripples = st.ripples.filter((rp) => {
      rp.t += dt
      if (rp.t > 5) return false
      for (let k = 0; k < 3; k++) {
        const tt = rp.t - k * 0.55
        if (tt <= 0) continue
        const R = tt * 26
        ctx.strokeStyle = `rgba(255,240,240,${Math.max(0, 0.3 - tt * 0.07)})`
        ctx.beginPath()
        ctx.ellipse(rp.x, rp.y, R, R * 0.3, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      return true
    })
    ctx.restore()

    // the torii stands in the water, over its own reflection
    ctx.drawImage(st.torii, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // far lantern light and its streak on the water
    ctx.globalCompositeOperation = 'lighter'
    const farGlow = (0.35 + 0.65 * P.night) * breathe
    ctx.globalAlpha = 0.7 * farGlow
    ctx.drawImage(st.warm, 680, HOR - 50, 40, 40)
    ctx.globalAlpha = 0.25 * farGlow
    ctx.drawImage(st.warm, 690, HOR + 2, 20, 70)
    ctx.restore()

    // ---- the near shore, the lantern and the cherry tree
    ctx.drawImage(st.fg, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // the lantern's flame, flickering softly
    const flicker = 0.88 + 0.06 * Math.sin(time * 7.3) + 0.04 * Math.sin(time * 12.1 + 1)
    const lit = (0.3 + 0.7 * Math.max(0.25, P.night)) * flicker * breathe
    ctx.fillStyle = `rgba(255,${200 + 20 * flicker},${120 + 20 * flicker},${Math.min(1, 0.9 * lit + 0.1)})`
    ctx.fillRect(236 - 14, 812 - 166, 28, 30)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.75 * lit
    ctx.drawImage(st.warm, 236 - 110, 812 - 151 - 110, 220, 220)
    ctx.globalAlpha = 0.25 * lit
    ctx.drawImage(st.warm, 236 - 220, 812 - 151 - 160, 440, 360)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    // petals: tumble down on the breeze; on the pond they float a while
    st.spawnAcc += dt * (0.9 + c.energy * 1.4)
    while (st.spawnAcc > 1 && st.petals.length < 150) {
      st.spawnAcc -= 1
      spawnPetal(st)
    }
    const gust = 1 + 0.4 * Math.sin(time * 0.21)
    st.petals = st.petals.filter((p) => {
      if (p.floating > 0) {
        p.floating += dt
        p.x += 4 * dt
        p.rot += 0.05 * dt
        const a = Math.max(0, 1 - p.floating / 14)
        if (a <= 0) return false
        drawPetal(ctx, p, 0.75 * a)
        return true
      }
      p.flip += dt * 2.2
      p.rot += p.spin * dt
      p.x += (p.vx * gust + Math.sin(time * 0.8 + p.flip) * 10) * dt
      p.y += p.vy * dt
      // on the pond (not over the near shore) → float
      const overShore = p.x < 560 && p.y > 770 + (p.x / 560) * 60
      if (p.y >= p.land && !overShore) {
        p.floating = 0.001
        p.y = p.land
        drawPetal(ctx, p, 0.75)
        return true
      }
      if (p.y > BH + 20 || p.x > BW + 40) return false
      drawPetal(ctx, p, 0.9)
      return true
    })

    // fireflies after dark
    if (P.night > 0.4) {
      ctx.globalCompositeOperation = 'lighter'
      for (const f of st.flies) {
        f.x += Math.sin(time * 0.3 + f.ph) * 8 * dt
        f.y += Math.cos(time * 0.23 + f.ph * 1.3) * 6 * dt
        const on = Math.max(0, Math.sin(time * 0.9 + f.ph * 3))
        ctx.globalAlpha = on * on * 0.8 * P.night
        ctx.drawImage(st.firefly, f.x - 14, f.y - 14, 28, 28)
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
    ctx.restore()

    // a soft vignette
    const vign = ctx.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.78)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(8,4,14,0.45)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
