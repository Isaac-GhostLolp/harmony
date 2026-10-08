import type { World, WorldContext } from './types'
import { BW, BH, fbm, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🛰️ Space Station — the view from a panoramic window: a great planet turning
 * below, a field of stars, a slow-drifting satellite, a distant nebula, and
 * the occasional meteor burning up in the atmosphere. Station HUD ticks glow
 * softly. Calm, vast, quiet.
 *
 * The planet is a real sphere: continents, ice, oceans and two cloud decks
 * that drift at their own pace, turning slowly under the station. Its night
 * side is dotted with city lights, and the thin blue atmosphere glows on the
 * limb. The station's clock decides where the sun is: a bright day over the
 * oceans, a dusk with the terminator crossing the planet in orange, or the
 * night, the sun behind the planet and the cities shining below, with an
 * aurora breathing on the horizon.
 *
 * The music: the city lights twinkle with the kick, the aurora breathes, the
 * window HUD glows with the energy, and meteors come more often when the song
 * is lively.
 */

type RGB = [number, number, number]

// ---------------------------------------------------------------------------
// the planet (a sphere sampled from an equirectangular map)
// ---------------------------------------------------------------------------

const PC = { x: 1060, y: 1660 } // centre, far below the window
const PR = 1260 // radius → its top is at y = 400
const TILT = 0.4 // axis tilted toward us
/** board region the planet buffer covers, and its scale */
const PB = { x: 0, y: 392, w: BW, h: BH - 392, s: 0.42 }
const TW = 512
const TH = 256
/** the buffer is refreshed in this many horizontal slices, one per frame */
const SLICES = 10

interface Maps {
  day: Uint8ClampedArray // rgb per texel
  cloud: Uint8Array // 0..255 cover
  /** city lights as points: texture angle, cos/sin of latitude, brightness */
  city: { cth: Float32Array; sth: Float32Array; cl: Float32Array; sl: Float32Array; b: Float32Array; tex: Int32Array; n: number }
}

let MAPS: Maps | null = null

/** Generates the planet's maps once per session (seamless: sampled on the sphere). */
function maps(): Maps {
  if (MAPS) return MAPS
  const day = new Uint8ClampedArray(TW * TH * 3)
  const cloud = new Uint8Array(TW * TH)
  const MAXC = 4500
  const city = { cth: new Float32Array(MAXC), sth: new Float32Array(MAXC), cl: new Float32Array(MAXC), sl: new Float32Array(MAXC), b: new Float32Array(MAXC), tex: new Int32Array(MAXC), n: 0 }
  const r = rng(77)
  for (let j = 0; j < TH; j++) {
    const lat = (0.5 - (j + 0.5) / TH) * Math.PI
    const cl = Math.cos(lat)
    const sy = Math.sin(lat)
    for (let i = 0; i < TW; i++) {
      const lon = ((i + 0.5) / TW) * Math.PI * 2
      const sx = cl * Math.cos(lon)
      const sz = cl * Math.sin(lon)
      const k = j * TW + i
      const h = fbm(sx * 1.6 + 10, sy * 1.6 + 3, sz * 1.6 - 7, 5)
      const land = h - 0.52
      const alat = Math.abs(lat)
      let rgbv: RGB
      if (alat > 1.22 + (h - 0.5) * 0.5) rgbv = [232, 240, 246] // ice
      else if (land < 0) {
        const d = Math.min(1, -land * 6)
        rgbv = [14 + 18 * (1 - d), 52 + 50 * (1 - d), 104 + 50 * (1 - d)] // ocean, lighter on the shelves
      } else {
        const dry = fbm(sx * 3 + 40, sy * 3, sz * 3, 3)
        const desert = Math.max(0, Math.min(1, (dry - 0.5) * 4 + (alat < 0.5 ? 0.3 : -0.4)))
        const hi = Math.min(1, land * 5)
        const g: RGB = [58 + hi * 40, 92 + hi * 20, 50 + hi * 20]
        const d: RGB = [176, 150, 104]
        rgbv = [g[0] + (d[0] - g[0]) * desert, g[1] + (d[1] - g[1]) * desert, g[2] + (d[2] - g[2]) * desert]
        // cities: clusters near the coasts and in the temperate belt
        const near = land < 0.08 ? 1 : 0.4
        const belt = alat < 1.0 ? 1 : 0.2
        const cn = fbm(sx * 9 + 5, sy * 9, sz * 9, 2)
        if (cn > 0.54 && r() < 0.6 * near * belt * (1 - desert * 0.7)) {
          // a little cluster of points inside this texel
          const pts = 1 + Math.floor(r() * 3)
          for (let q = 0; q < pts && city.n < MAXC; q++) {
            const la = lat + (r() - 0.5) * (Math.PI / TH)
            const th = lon + (r() - 0.5) * ((Math.PI * 2) / TW)
            city.cth[city.n] = Math.cos(th)
            city.sth[city.n] = Math.sin(th)
            city.cl[city.n] = Math.cos(la)
            city.sl[city.n] = Math.sin(la)
            city.b[city.n] = 0.55 + r() * 0.45
            city.tex[city.n] = k
            city.n++
          }
        }
      }
      day[k * 3] = rgbv[0]
      day[k * 3 + 1] = rgbv[1]
      day[k * 3 + 2] = rgbv[2]
      // clouds: streaky, stronger in bands
      const cf = fbm(sx * 2.4 - 20, sy * 5.5 + 9, sz * 2.4, 4)
      const band = 0.15 * Math.cos(lat * 6)
      cloud[k] = Math.max(0, Math.min(255, (cf + band - 0.5) * 900))
    }
  }
  MAPS = { day, cloud, city }
  return MAPS
}

interface Lut {
  w: number
  h: number
  /** per buffer pixel: texture row, fractional (−1 = outside the planet) */
  row: Float32Array
  lon: Float32Array
  /** lighting (0..1) and limb haze (0..1) */
  light: Float32Array
  limb: Float32Array
  band: Float32Array
}

function makeLut(sun: [number, number, number]): Lut {
  const w = Math.round(PB.w * PB.s)
  const h = Math.round(PB.h * PB.s)
  const n = w * h
  const lut: Lut = { w, h, row: new Float32Array(n), lon: new Float32Array(n), light: new Float32Array(n), limb: new Float32Array(n), band: new Float32Array(n) }
  const ct = Math.cos(TILT)
  const st = Math.sin(TILT)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const bx = PB.x + (x + 0.5) / PB.s
      const by = PB.y + (y + 0.5) / PB.s
      const dx = (bx - PC.x) / PR
      const dy = (PC.y - by) / PR
      const d2 = dx * dx + dy * dy
      if (d2 >= 1) {
        lut.row[k] = -1
        continue
      }
      const z = Math.sqrt(1 - d2)
      // lighting in view space
      const ndl = dx * sun[0] + dy * sun[1] + z * sun[2]
      const t = Math.max(0, Math.min(1, (ndl + 0.08) / 0.3))
      lut.light[k] = t * t * (3 - 2 * t)
      lut.band[k] = Math.max(0, 1 - Math.abs(ndl - 0.03) / 0.08)
      lut.limb[k] = Math.pow(1 - z, 2.2)
      // into the planet's frame
      const py = dy * ct - z * st
      const pz = dy * st + z * ct
      const lat = Math.asin(Math.max(-1, Math.min(1, py)))
      lut.lon[k] = Math.atan2(dx, pz) / (Math.PI * 2) + 0.5
      lut.row[k] = Math.min(TH - 1.001, Math.max(0, (0.5 - lat / Math.PI) * TH - 0.5))
    }
  return lut
}

// ---------------------------------------------------------------------------
// palettes (where the sun is)
// ---------------------------------------------------------------------------

interface Pal {
  key: string
  sun: [number, number, number]
  /** the sun in the sky (board), if visible */
  glare: { x: number; y: number } | null
  rim: string
  aurora: number
  space: RGB
}

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 16.5) return { key: 'day', sun: norm([-0.45, 0.55, 0.7]), glare: { x: 180, y: 120 }, rim: '120,190,255', aurora: 0, space: [4, 8, 20] }
  if ((h >= 16.5 && h < 19.5) || (h >= 5.5 && h < 8)) return { key: 'dusk', sun: norm([-0.95, 0.28, -0.05]), glare: { x: -60, y: 330 }, rim: '255,160,110', aurora: 0.3, space: [3, 5, 14] }
  return { key: 'night', sun: norm([0.25, 0.35, -0.9]), glare: null, rim: '110,170,255', aurora: 1, space: [2, 3, 10] }
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSpace(g: CanvasRenderingContext2D, P: Pal, accent: RGB): void {
  g.fillStyle = `rgb(${P.space.join(',')})`
  g.fillRect(-10, -10, BW + 20, BH + 20)
  const r = rng(19)
  // the milky way: a soft diagonal band of dust
  g.save()
  g.translate(BW / 2, BH * 0.35)
  g.rotate(-0.32)
  g.filter = 'blur(30px)'
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${170 + r() * 40},${170 + r() * 30},${210 + r() * 40},${0.03 + r() * 0.04})`
    g.beginPath()
    g.ellipse((r() - 0.5) * 2000, (r() - 0.5) * 140, 120 + r() * 200, 30 + r() * 50, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.filter = 'blur(10px)'
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.2})`
    g.beginPath()
    g.ellipse((r() - 0.5) * 1800, (r() - 0.5) * 50, 60 + r() * 140, 6 + r() * 12, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.filter = 'none'
  // dense small stars inside the band
  for (let i = 0; i < 700; i++) {
    const x = (r() - 0.5) * 2000
    const y = (r() + r() + r() - 1.5) * 120
    g.fillStyle = `rgba(230,236,255,${0.15 + r() * 0.45})`
    g.fillRect(x, y, 1, 1)
  }
  g.restore()
  // the nebula, tinted by the song's colour
  g.save()
  g.filter = 'blur(40px)'
  const neb = (x: number, y: number, rad: number, a: number, c: RGB): void => {
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, `rgba(${c.join(',')},${a})`)
    grd.addColorStop(1, `rgba(${c.join(',')},0)`)
    g.fillStyle = grd
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  const ac: RGB = [Math.round(accent[0]), Math.round(accent[1]), Math.round(accent[2])]
  const comp: RGB = [Math.round(255 - ac[0] * 0.5), Math.round(140 + ac[1] * 0.2), Math.round(200 + ac[2] * 0.2)].map((v) => Math.min(255, v)) as RGB
  for (let i = 0; i < 9; i++) neb(1180 + (r() - 0.5) * 520, 170 + (r() - 0.5) * 200, 120 + r() * 160, 0.1 + r() * 0.08, i % 3 === 0 ? comp : ac)
  g.restore()
  // stars
  for (let i = 0; i < 520; i++) {
    const x = r() * BW
    const y = r() * BH * 0.8
    const b = Math.pow(r(), 3)
    g.fillStyle = `rgba(${r() < 0.2 ? '255,226,200' : r() < 0.3 ? '200,220,255' : '240,244,255'},${0.25 + b * 0.75})`
    const s = b > 0.7 ? 2 : b > 0.3 ? 1.5 : 1
    g.fillRect(x, y, s, s)
  }
}

/** The atmosphere: a thin glowing rim around the planet. */
function paintRim(g: CanvasRenderingContext2D, P: Pal): void {
  const grd = g.createRadialGradient(PC.x, PC.y, PR * 0.985, PC.x, PC.y, PR * 1.045)
  grd.addColorStop(0, `rgba(${P.rim},0)`)
  grd.addColorStop(0.25, `rgba(${P.rim},0.55)`)
  grd.addColorStop(0.4, `rgba(${P.rim},0.3)`)
  grd.addColorStop(1, `rgba(${P.rim},0)`)
  g.fillStyle = grd
  g.beginPath()
  g.arc(PC.x, PC.y, PR * 1.05, 0, Math.PI * 2)
  g.arc(PC.x, PC.y, PR * 0.985, 0, Math.PI * 2, true)
  g.fill()
  // where the sun is, the rim is brighter
  const sx = PC.x + P.sun[0] * PR
  const sy = PC.y - P.sun[1] * PR
  const hot = g.createRadialGradient(sx, sy, 0, sx, sy, 900)
  hot.addColorStop(0, `rgba(${P.key === 'dusk' ? '255,190,140' : '190,225,255'},0.45)`)
  hot.addColorStop(1, 'rgba(190,225,255,0)')
  g.save()
  g.beginPath()
  g.arc(PC.x, PC.y, PR * 1.03, 0, Math.PI * 2)
  g.arc(PC.x, PC.y, PR * 0.995, 0, Math.PI * 2, true)
  g.clip()
  g.fillStyle = hot
  g.fillRect(sx - 900, sy - 900, 1800, 1800)
  g.restore()
}

/** The window: a dark frame with rounded corners, panel seams and HUD ticks (screen space). */
function paintFrame(v: View): Layer {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(v.w * v.dpr))
  c.height = Math.max(1, Math.round(v.h * v.dpr))
  const g = c.getContext('2d')!
  g.scale(v.dpr, v.dpr)
  const W = v.w
  const H = v.h
  const m = Math.max(14, Math.min(W, H) * 0.028)
  const rad = Math.min(W, H) * 0.09
  const glass = new Path2D()
  glass.roundRect(m, m, W - m * 2, H - m * 2, rad)
  // the wall around the glass
  g.save()
  const around = new Path2D()
  around.rect(0, 0, W, H)
  around.addPath(glass)
  g.clip(around, 'evenodd')
  const wall = g.createLinearGradient(0, 0, 0, H)
  wall.addColorStop(0, '#20242c')
  wall.addColorStop(1, '#14171d')
  g.fillStyle = wall
  g.fillRect(0, 0, W, H)
  // panel seams and a few status lights
  g.strokeStyle = 'rgba(0,0,0,0.45)'
  g.lineWidth = 1
  for (const x of [W * 0.25, W * 0.5, W * 0.75]) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, m)
    g.moveTo(x, H - m)
    g.lineTo(x, H)
    g.stroke()
  }
  g.restore()
  // the inner bevel catching a little light
  g.strokeStyle = 'rgba(160,190,230,0.18)'
  g.lineWidth = 2
  g.stroke(glass)
  g.strokeStyle = 'rgba(0,0,0,0.6)'
  g.lineWidth = 6
  g.save()
  g.clip(glass)
  g.stroke(glass)
  // a faint sheen on the glass
  const sheen = g.createLinearGradient(0, 0, W, H)
  sheen.addColorStop(0, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.38, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.42, 'rgba(200,220,255,0.035)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.fillStyle = sheen
  g.fillRect(0, 0, W, H)
  // vignette inside the window
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.45)')
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)
  g.restore()
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  t: number
}

interface State {
  v: View
  P: Pal
  accentKey: string
  space: Layer
  rim: Layer
  frame: Layer
  lut: Lut
  surf: HTMLCanvasElement
  surfImg: ImageData
  slice: number
  rot: number
  white: Layer
  warm: Layer
  green: Layer
  sunGlow: Layer
  twinkles: { x: number; y: number; ph: number; sp: number }[]
  meteors: Meteor[]
  nextMeteor: number
}

let S: State | null = null

const accentKeyOf = (a: RGB): string => a.map((x) => Math.round(x / 24)).join(',')

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  maps()
  const lut = makeLut(P.sun)
  const surf = document.createElement('canvas')
  surf.width = lut.w
  surf.height = lut.h
  const r = rng(8)
  return {
    v,
    P,
    accentKey: accentKeyOf(c.accent),
    space: makeLayer(v, (g) => paintSpace(g, P, c.accent)),
    rim: makeLayer(v, (g) => paintRim(g, P)),
    frame: paintFrame(v),
    lut,
    surf,
    surfImg: surf.getContext('2d')!.createImageData(lut.w, lut.h),
    slice: -1,
    rot: 0,
    white: glowSprite('235,242,255', 64),
    warm: glowSprite('255,170,90', 64),
    green: glowSprite('90,255,170'),
    sunGlow: glowSprite('255,244,226'),
    twinkles: Array.from({ length: 40 }, () => ({ x: r() * BW, y: r() * 420, ph: r() * 6.28, sp: 0.6 + r() * 1.8 })),
    meteors: [],
    nextMeteor: 4 + r() * 4
  }
}

/** Re-samples rows [y0, y1) of the planet into its buffer. */
function paintPlanet(st: State, y0: number, y1: number): void {
  const M = maps()
  const L = st.lut
  const sd = st.surfImg.data
  const rot = st.rot
  const crot = st.rot * 1.35 // the clouds drift a little faster
  const dusk = st.P.key === 'dusk' ? 1 : 0.35
  for (let k = y0 * L.w; k < y1 * L.w; k++) {
    const o = k * 4
    const row = L.row[k]
    if (row < 0) {
      // outside: the atmosphere's colour (the planet is clipped to a crisp circle)
      sd[o] = 70
      sd[o + 1] = 120
      sd[o + 2] = 210
      sd[o + 3] = 255
      continue
    }
    // bilinear samples, so coasts and clouds stay smooth
    const j0 = row | 0
    const fy = row - j0
    const r0 = j0 * TW
    const r1 = r0 + TW
    let fu = (L.lon[k] + rot) * TW - 0.5
    fu -= Math.floor(fu / TW) * TW
    const i0 = fu | 0
    const fx = fu - i0
    const i1 = i0 + 1 === TW ? 0 : i0 + 1
    const w00 = (1 - fx) * (1 - fy)
    const w10 = fx * (1 - fy)
    const w01 = (1 - fx) * fy
    const w11 = fx * fy
    const a = (r0 + i0) * 3
    const b2 = (r0 + i1) * 3
    const c2 = (r1 + i0) * 3
    const d = (r1 + i1) * 3
    const D = M.day
    const dr = D[a] * w00 + D[b2] * w10 + D[c2] * w01 + D[d] * w11
    const dg = D[a + 1] * w00 + D[b2 + 1] * w10 + D[c2 + 1] * w01 + D[d + 1] * w11
    const db = D[a + 2] * w00 + D[b2 + 2] * w10 + D[c2 + 2] * w01 + D[d + 2] * w11
    let cu = (L.lon[k] + crot) * TW - 0.5
    cu -= Math.floor(cu / TW) * TW
    const ci0 = cu | 0
    const cx = cu - ci0
    const ci1 = ci0 + 1 === TW ? 0 : ci0 + 1
    const C = M.cloud
    const cl = ((C[r0 + ci0] * (1 - cx) + C[r0 + ci1] * cx) * (1 - fy) + (C[r1 + ci0] * (1 - cx) + C[r1 + ci1] * cx) * fy) / 255
    const li = L.light[k]
    // surface lit by the sun, a whisper of it on the night side
    let rr = dr * (li + 0.035)
    let gg = dg * (li + 0.04)
    let bb = db * (li + 0.06)
    // clouds on top
    const cw = 240 * li + 18
    rr += (cw - rr) * cl * 0.92
    gg += (cw - gg) * cl * 0.92
    bb += (cw + 6 - bb) * cl * 0.92
    // the terminator glows warm
    const b = L.band[k] * dusk
    rr += 95 * b
    gg += 42 * b
    bb += 14 * b
    // the atmosphere thickens toward the limb
    const lm = L.limb[k] * (0.25 + li * 0.75)
    rr += (110 - rr) * lm
    gg += (170 - gg) * lm
    bb += (255 - bb) * lm
    sd[o] = rr
    sd[o + 1] = gg
    sd[o + 2] = bb
    sd[o + 3] = 255
  }
  st.surf.getContext('2d')!.putImageData(st.surfImg, 0, 0, 0, y0, L.w, y1 - y0)
}

/** City lights: real points on the sphere, shining only on the night side. */
function drawCities(ctx: CanvasRenderingContext2D, st: State, kick: number): void {
  const C = maps().city
  const M = maps()
  const sun = st.P.sun
  const ct = Math.cos(TILT)
  const sn = Math.sin(TILT)
  const R = st.rot * Math.PI * 2 + Math.PI
  const cr = Math.cos(R)
  const sr = Math.sin(R)
  const crot = st.rot * 1.35
  const boost = 1.3 + kick * 0.5
  ctx.fillStyle = 'rgb(255,200,130)'
  for (let i = 0; i < C.n; i++) {
    // view longitude φ = θ − R
    const cth = C.cth[i]
    const sth = C.sth[i]
    const sphi = sth * cr - cth * sr
    const cphi = cth * cr + sth * sr
    const dx = C.cl[i] * sphi
    const pz = C.cl[i] * cphi
    const py = C.sl[i]
    const dy = py * ct + pz * sn
    const z = -py * sn + pz * ct
    if (z <= 0.02) continue
    const ndl = dx * sun[0] + dy * sun[1] + z * sun[2]
    const t = Math.max(0, Math.min(1, (ndl + 0.08) / 0.3))
    const night = 1 - t * t * (3 - 2 * t)
    if (night < 0.05) continue
    const by = PC.y - dy * PR
    if (by < PB.y || by > BH) continue
    // thick cloud hides them
    const k = C.tex[i]
    const row = k - (k % TW)
    let cu = (k % TW) / TW + (crot - st.rot)
    cu -= Math.floor(cu)
    const cl = M.cloud[row + Math.floor(cu * TW)] / 255
    ctx.globalAlpha = Math.min(1, C.b[i] * night * night * (1 - cl * 0.85) * Math.min(1, z * 4) * boost)
    ctx.fillRect(PC.x + dx * PR - 1.1, by - 1.1, 2.2, 2.2)
  }
  ctx.globalAlpha = 1
}

function drawSatellite(ctx: CanvasRenderingContext2D, st: State, time: number): void {
  const period = 110
  const u = (time % period) / period
  const x = -120 + u * (BW + 240)
  const y = 180 + Math.sin(u * Math.PI) * -60 + 40
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.sin(time * 0.05) * 0.5 + 0.2)
  const lit = st.P.key !== 'night'
  // solar panels
  for (const side of [-1, 1]) {
    ctx.fillStyle = lit ? '#1d3f7a' : '#0e1c36'
    const px = side < 0 ? -64 : 14
    ctx.fillRect(px, -9, 50, 18)
    ctx.strokeStyle = lit ? 'rgba(160,200,255,0.5)' : 'rgba(120,150,200,0.25)'
    ctx.lineWidth = 0.8
    for (let i = 1; i < 5; i++) {
      ctx.beginPath()
      ctx.moveTo(px + i * 10, -9)
      ctx.lineTo(px + i * 10, 9)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px + 50, 0)
    ctx.stroke()
    ctx.fillStyle = '#5a6270'
    ctx.fillRect(side < 0 ? -14 : 6, -1.5, 8, 3)
  }
  // body in gold foil
  ctx.fillStyle = lit ? '#c49a3c' : '#5a4620'
  ctx.fillRect(-7, -10, 14, 20)
  ctx.fillStyle = lit ? 'rgba(255,240,190,0.5)' : 'rgba(255,240,190,0.15)'
  ctx.fillRect(-7, -10, 4, 20)
  // dish
  ctx.strokeStyle = '#b8c0cc'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(0, -16, 6, Math.PI * 0.1, Math.PI * 0.9)
  ctx.stroke()
  ctx.restore()
  // a slow glint off the panels, and a blinking light
  const glint = Math.pow(Math.max(0, Math.sin(time * 0.35)), 30)
  ctx.globalCompositeOperation = 'lighter'
  if (lit && glint > 0.01) {
    ctx.globalAlpha = glint
    ctx.drawImage(st.white, x - 30, y - 30, 60, 60)
  }
  if (Math.sin(time * 2.4) > 0.85) {
    ctx.globalAlpha = 0.9
    ctx.drawImage(st.warm, x - 6, y - 26, 12, 12)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const spaceStationWorld: World = {
  id: 'space-station',
  name: 'Space Station',
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
    // the nebula follows the song's colour
    const ak = accentKeyOf(c.accent)
    if (ak !== st.accentKey) {
      st.accentKey = ak
      st.space = makeLayer(st.v, (g) => paintSpace(g, P, c.accent))
    }

    // the planet turns (one turn in ~25 minutes); re-sampled a few times a second
    st.rot += dt / 1500
    if (st.slice < 0) {
      paintPlanet(st, 0, st.lut.h)
      st.slice = 0
    } else {
      const h = Math.ceil(st.lut.h / SLICES)
      const y0 = st.slice * h
      paintPlanet(st, y0, Math.min(st.lut.h, y0 + h))
      st.slice = (st.slice + 1) % SLICES
    }

    ctx.save()
    ctx.drawImage(st.space, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    ctx.globalCompositeOperation = 'lighter'
    for (const s of st.twinkles) {
      const a = Math.max(0, Math.sin(time * s.sp + s.ph))
      if (a < 0.1) continue
      ctx.globalAlpha = a * 0.8
      ctx.drawImage(st.white, s.x - 5, s.y - 5, 10, 10)
    }
    // the sun, when it's in the sky
    if (P.glare) {
      ctx.globalAlpha = P.key === 'day' ? 0.9 : 0.75
      ctx.drawImage(st.sunGlow, P.glare.x - 260, P.glare.y - 260, 520, 520)
      ctx.globalAlpha = 1
      ctx.drawImage(st.sunGlow, P.glare.x - 60, P.glare.y - 60, 120, 120)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    drawSatellite(ctx, st, time)

    // the planet
    ctx.save()
    ctx.beginPath()
    ctx.arc(PC.x, PC.y, PR, 0, Math.PI * 2)
    ctx.clip()
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(st.surf, PB.x, PB.y, PB.w, PB.h)
    ctx.globalCompositeOperation = 'lighter'
    drawCities(ctx, st, c.kick)
    ctx.restore()
    ctx.restore()

    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(st.rim, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'

    ctx.save()
    toBoard(ctx, st.v)
    ctx.globalCompositeOperation = 'lighter'
    // an aurora breathing over the horizon on the night side
    if (P.aurora > 0) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 - 0.62 + i * 0.07 + Math.sin(time * 0.15 + i) * 0.015
        const x = PC.x + Math.cos(a) * PR * 1.004
        const y = PC.y + Math.sin(a) * PR * 1.004
        const k = (0.5 + 0.5 * Math.sin(time * 0.6 + i * 1.3)) * (0.45 + c.breath * 0.35)
        ctx.globalAlpha = k * P.aurora * 0.5
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(a + Math.PI / 2)
        ctx.drawImage(st.green, -60, -70, 120, 90)
        ctx.restore()
      }
    }

    // meteors burning up as they hit the atmosphere
    st.nextMeteor -= dt * (1 + c.energy * 1.5)
    if (st.nextMeteor <= 0) {
      st.nextMeteor = 6 + Math.random() * 8
      const x = 300 + Math.random() * 1300
      st.meteors.push({ x, y: 220 + Math.random() * 160, vx: -(160 + Math.random() * 120), vy: 120 + Math.random() * 80, t: 0 })
    }
    for (let i = st.meteors.length - 1; i >= 0; i--) {
      const m = st.meteors[i]
      m.t += dt
      m.x += m.vx * dt
      m.y += m.vy * dt
      const dist = Math.hypot(m.x - PC.x, m.y - PC.y) / PR
      if (dist < 0.995 || m.t > 4) {
        st.meteors.splice(i, 1)
        continue
      }
      // hotter and brighter as it reaches the air
      const heat = Math.max(0, Math.min(1, (1.06 - dist) / 0.06))
      const tail = 0.12 + heat * 0.1
      const lg = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail)
      lg.addColorStop(0, heat > 0.3 ? 'rgba(255,200,140,1)' : 'rgba(240,244,255,0.9)')
      lg.addColorStop(1, 'rgba(255,140,80,0)')
      ctx.globalAlpha = Math.min(1, m.t * 3)
      ctx.strokeStyle = lg
      ctx.lineWidth = 1.4 + heat * 1.2
      ctx.beginPath()
      ctx.moveTo(m.x, m.y)
      ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail)
      ctx.stroke()
      if (heat > 0.2) {
        ctx.globalAlpha = heat * 0.8
        ctx.drawImage(st.warm, m.x - 10, m.y - 10, 20, 20)
      }
    }
    ctx.restore()

    // the window, and its HUD glowing with the energy
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(st.frame, 0, 0, width, height)
    drawHud(ctx, width, height, c, time)
    ctx.restore()
  }
}

function drawHud(ctx: CanvasRenderingContext2D, W: number, H: number, c: WorldContext, time: number): void {
  const m = Math.max(14, Math.min(W, H) * 0.028) + 16
  const L = Math.min(W, H) * 0.04
  const a = 0.28 + c.energy * 0.2
  ctx.strokeStyle = `rgba(120,200,255,${a})`
  ctx.lineWidth = 1.5
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1]
  ]
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath()
    ctx.moveTo(x, y + sy * L)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * L, y)
    ctx.stroke()
  }
  // a few quiet readouts
  const fs = Math.max(10, Math.round(Math.min(W, H) * 0.016))
  ctx.font = `${fs}px ui-monospace, monospace`
  ctx.fillStyle = `rgba(140,210,255,${a + 0.1})`
  const alt = (408 + Math.sin(time * 0.01) * 0.6).toFixed(1).replace('.', ',')
  const vel = (7.66 + Math.sin(time * 0.013) * 0.004).toFixed(2).replace('.', ',')
  ctx.textAlign = 'left'
  ctx.fillText(`ALT ${alt} km`, m + 8, H - m - L * 0.6)
  ctx.fillText(`VEL ${vel} km/s`, m + 8, H - m - L * 0.6 - fs * 1.5)
  ctx.textAlign = 'right'
  const orbit = Math.floor(time / 92) + 1
  ctx.fillText(`ÓRBITA ${orbit}`, W - m - 8, m + 8 + fs)
  // a small blinking status dot
  if (Math.sin(time * 1.6) > 0) {
    ctx.fillStyle = 'rgba(120,255,170,0.8)'
    ctx.beginPath()
    ctx.arc(W - m - 8, H - m - 8 - fs * 0.35, fs * 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.textAlign = 'left'
}
