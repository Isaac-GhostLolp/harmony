import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🌃 Cyberpunk — a living neon city at night, seen from a wet rooftop.
 * Moody, wet, electric.
 *
 * Layers of megastructures recede into a magenta haze, a giant arcology at
 * the back sweeping searchlights through the smog. Window grids glow and
 * flicker, vertical neon signs run down the towers, and holographic
 * billboards play: one of them is an equalizer of the song. A holographic
 * whale swims slowly through the sky. Flying cars stream along their lanes, thin
 * rain falls through the neon, and the rooftop in front is wet: its puddles
 * mirror the city and ripple with the rain. CRT scanlines over it all, and
 * the occasional glitch tearing the picture.
 *
 * The music: the neon pulses on the kick, the billboard plays the spectrum,
 * and glitches fire on impacts.
 *
 * The clock changes the air: a grey smoggy day, a rusty dusk, the night.
 */

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: RGB
  skyLow: RGB
  haze: RGB
  bldg: RGB
  /** fraction of windows lit */
  lit: number
  /** how strong the neon reads against the sky */
  neon: number
  cloud: string
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 16.5)
    return { key: 'day', skyTop: [74, 88, 100], skyLow: [150, 160, 158], haze: [150, 162, 160], bldg: [52, 58, 70], lit: 0.05, neon: 0.45, cloud: '170,178,180' }
  if ((h >= 16.5 && h < 19.5) || (h >= 5.5 && h < 8))
    return { key: 'dusk', skyTop: [30, 18, 54], skyLow: [196, 82, 86], haze: [190, 86, 104], bldg: [26, 18, 40], lit: 0.22, neon: 0.85, cloud: '220,110,120' }
  return { key: 'night', skyTop: [5, 4, 16], skyLow: [56, 16, 66], haze: [118, 38, 138], bldg: [13, 11, 27], lit: 0.32, neon: 1, cloud: '150,50,150' }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

// neon palette: cyan, magenta, yellow, hot pink, violet
const NEON = ['0,240,255', '255,40,200', '255,220,40', '255,90,120', '140,90,255']

// ---------------------------------------------------------------------------
// geometry (board coordinates)
// ---------------------------------------------------------------------------

const FLOOR = 792 // the rooftop's far edge
const RAIL = 744
const ARC = { x: 800, top: 0 } // the arcology (its top is set when painted)

interface Info {
  /** billboards that play live */
  boards: { x: number; y: number; w: number; h: number; kind: number; col: string }[]
  /** a few windows that flicker */
  wins: { x: number; y: number; w: number; h: number; col: string; ph: number }[]
  /** one broken sign that buzzes */
  broken: { x: number; y: number; w: number; h: number; col: string } | null
  beacons: { x: number; y: number; ph: number }[]
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function haze(g: CanvasRenderingContext2D, P: Pal, top: number, a: number): void {
  const grd = g.createLinearGradient(0, top, 0, FLOOR)
  grd.addColorStop(0, rgb(P.haze, 0))
  grd.addColorStop(1, rgb(P.haze, a))
  g.fillStyle = grd
  g.fillRect(-10, top, BW + 20, FLOOR - top + 10)
}

/** Pseudo-glyphs for the signs (not any real script). */
function glyph(g: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number): void {
  const n = 2 + Math.floor(r() * 3)
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const k = r()
    if (k < 0.4) {
      const yy = y + r() * s
      g.moveTo(x + r() * s * 0.3, yy)
      g.lineTo(x + s * (0.7 + r() * 0.3), yy)
    } else if (k < 0.8) {
      const xx = x + r() * s
      g.moveTo(xx, y + r() * s * 0.3)
      g.lineTo(xx, y + s * (0.7 + r() * 0.3))
    } else {
      g.moveTo(x, y + s)
      g.lineTo(x + s, y)
    }
  }
  g.stroke()
}

interface Bldg {
  x: number
  w: number
  top: number
  tier: number
}

/** A row of buildings: bodies, setbacks, antennas, window grids. */
function row(g: CanvasRenderingContext2D, P: Pal, info: Info, r: () => number, opts: { depth: number; x0: number; x1: number; minTop: number; maxTop: number; wMin: number; wMax: number; win: number; avoid?: [number, number] }): Bldg[] {
  const out: Bldg[] = []
  const body = mix(P.bldg, P.haze, opts.depth * 0.55)
  let x = opts.x0
  while (x < opts.x1) {
    const w = opts.wMin + r() * (opts.wMax - opts.wMin)
    let top = opts.minTop + r() * (opts.maxTop - opts.minTop)
    if (opts.avoid && x + w > opts.avoid[0] && x < opts.avoid[1]) top = Math.max(top, opts.maxTop - 40)
    const b: Bldg = { x, w, top, tier: r() < 0.45 ? 1 : 0 }
    out.push(b)
    // body (with a setback on top sometimes)
    const shade = g.createLinearGradient(x, 0, x + w, 0)
    shade.addColorStop(0, rgb(mix(body, [255, 255, 255], 0.03)))
    shade.addColorStop(1, rgb(mix(body, [0, 0, 0], 0.25)))
    g.fillStyle = shade
    g.fillRect(x, top, w, FLOOR + 20 - top)
    let roof = top
    if (b.tier) {
      const tw = w * (0.45 + r() * 0.3)
      const th = 30 + r() * 70
      g.fillRect(x + (w - tw) / 2, top - th, tw, th)
      roof = top - th
    }
    // antenna and its beacon
    if (r() < 0.55) {
      const ax = x + w * (0.3 + r() * 0.4)
      const ah = 20 + r() * 60
      g.strokeStyle = rgb(body)
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(ax, roof)
      g.lineTo(ax, roof - ah)
      g.stroke()
      info.beacons.push({ x: ax, y: roof - ah, ph: r() * 6.28 })
    }
    // windows
    const ws = opts.win
    if (ws > 0) {
      const cols = Math.max(1, Math.floor((w - ws * 2) / (ws * 2.2)))
      const rows = Math.floor((FLOOR - top - ws) / (ws * 2.6))
      const tint = NEON[Math.floor(r() * NEON.length)]
      const warm = r() < 0.6
      const litHere = P.lit * (r() < 0.2 ? 0.15 : 0.4 + r() * 1.3)
      const ribbons = ws >= 3 && r() < 0.35
      if (ribbons) {
        for (let j = 0; j < rows; j++) {
          if (r() > litHere * 1.6) continue
          const wy = top + ws + j * ws * 2.6
          const x0 = x + ws + r() * w * 0.3
          g.fillStyle = `rgba(${warm ? '255,214,160' : '190,230,255'},${(0.25 + r() * 0.35) * (1 - opts.depth * 0.5)})`
          g.fillRect(x0, wy, Math.max(4, x + w - ws - x0 - r() * w * 0.3), ws * 1.2)
        }
        x += w + 3 + r() * 14
        continue
      }
      const darkCols = new Set(Array.from({ length: Math.floor(cols * 0.3) }, () => Math.floor(r() * cols)))
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          if (darkCols.has(i) || r() > litHere) continue
          const wx = x + ws + i * ws * 2.2
          const wy = top + ws + j * ws * 2.6
          const col = r() < 0.75 ? (warm ? '255,214,160' : '190,230,255') : tint
          g.fillStyle = `rgba(${col},${(0.35 + r() * 0.5) * (1 - opts.depth * 0.5)})`
          g.fillRect(wx, wy, ws * 1.2, ws * 1.4)
          if (info.wins.length < 70 && r() < 0.02) info.wins.push({ x: wx, y: wy, w: ws * 1.2, h: ws * 1.4, col, ph: r() * 6.28 })
        }
    }
    x += w + 3 + r() * 14
  }
  return out
}

function paintBack(g: CanvasRenderingContext2D, P: Pal, info: Info): void {
  const r = rng(13)
  const sky = g.createLinearGradient(0, 0, 0, FLOOR)
  sky.addColorStop(0, rgb(P.skyTop))
  sky.addColorStop(1, rgb(P.skyLow))
  g.fillStyle = sky
  g.fillRect(-10, -10, BW + 20, FLOOR + 20)
  const glow = g.createRadialGradient(BW / 2, FLOOR, 0, BW / 2, FLOOR, 900)
  glow.addColorStop(0, rgb(P.haze, 0.55))
  glow.addColorStop(1, rgb(P.haze, 0))
  g.fillStyle = glow
  g.fillRect(-10, -10, BW + 20, FLOOR + 20)

  // low smog clouds, lit from below by the city
  g.save()
  g.filter = 'blur(22px)'
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(${P.cloud},${0.08 + r() * 0.12})`
    g.beginPath()
    g.ellipse(r() * BW, 60 + r() * 220, 120 + r() * 220, 24 + r() * 36, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()

  // the arcology: a stepped megatower, far in the haze
  const arcCol = mix(P.bldg, P.haze, 0.38)
  const tiers = [
    [200, 190],
    [150, 140],
    [112, 110],
    [80, 80],
    [50, 60],
    [24, 46]
  ]
  let y = FLOOR + 10
  const steps: { hw: number; y0: number; y1: number }[] = []
  for (const [hw, h] of tiers) {
    steps.push({ hw, y0: y - h, y1: y })
    y -= h
  }
  for (const st of steps) {
    const sg = g.createLinearGradient(ARC.x - st.hw, 0, ARC.x + st.hw, 0)
    sg.addColorStop(0, rgb(mix(arcCol, [255, 255, 255], 0.05)))
    sg.addColorStop(0.5, rgb(arcCol))
    sg.addColorStop(1, rgb(mix(arcCol, [0, 0, 0], 0.3)))
    g.fillStyle = sg
    g.fillRect(ARC.x - st.hw, st.y0, st.hw * 2, st.y1 - st.y0)
    // vertical ribs
    g.fillStyle = 'rgba(0,0,0,0.18)'
    for (let x = ARC.x - st.hw + 10; x < ARC.x + st.hw; x += 18) g.fillRect(x, st.y0, 3, st.y1 - st.y0)
    // a lit band on each ledge
    g.fillStyle = `rgba(255,190,140,${0.25 + P.lit})`
    g.fillRect(ARC.x - st.hw, st.y0, st.hw * 2, 2)
    // scattered windows
    for (let i = 0; i < st.hw * 0.5; i++) {
      if (r() > P.lit * 2) continue
      g.fillStyle = `rgba(255,${200 + r() * 40},${160 + r() * 60},${0.25 + r() * 0.4})`
      g.fillRect(ARC.x - st.hw + 4 + r() * (st.hw * 2 - 8), st.y0 + 6 + r() * (st.y1 - st.y0 - 10), 2, 2)
    }
  }
  ARC.top = y
  g.fillStyle = rgb(arcCol)
  g.fillRect(ARC.x - 3, y - 70, 6, 70)
  // its crown glows
  g.save()
  g.filter = 'blur(6px)'
  g.fillStyle = `rgba(0,230,255,${0.5 * P.neon + 0.1})`
  g.fillRect(ARC.x - 24, y - 4, 48, 6)
  g.restore()
  info.beacons.push({ x: ARC.x, y: y - 70, ph: 0 })
  haze(g, P, 200, 0.45)

  // far row
  row(g, P, info, r, { depth: 0.85, x0: -30, x1: BW + 30, minTop: 420, maxTop: 600, wMin: 50, wMax: 110, win: 2 })
  haze(g, P, 360, 0.6)
  // middle-far row
  row(g, P, info, r, { depth: 0.55, x0: -30, x1: BW + 30, minTop: 330, maxTop: 560, wMin: 70, wMax: 150, win: 3, avoid: [620, 980] })
  haze(g, P, 300, 0.35)
}

function paintMid(g: CanvasRenderingContext2D, P: Pal, info: Info, neon: CanvasRenderingContext2D): void {
  const r = rng(31)
  const bs = row(g, P, info, r, { depth: 0.25, x0: 230, x1: 1380, minTop: 260, maxTop: 520, wMin: 110, wMax: 190, win: 4, avoid: [660, 940] })
  haze(g, P, 480, 0.25)

  // signs and billboards on this row (drawn into the neon layer)
  let kind = 0
  for (const b of bs) {
    const k = r()
    const col = NEON[Math.floor(r() * NEON.length)]
    if (k < 0.4 && b.w > 120 && info.boards.length < 3) {
      // a holographic billboard on the face
      const w = b.w * 0.78
      const h = w * (0.55 + r() * 0.2)
      info.boards.push({ x: b.x + (b.w - w) / 2, y: b.top + 30 + r() * 60, w, h, kind: kind++ % 3, col })
    } else if (k < 0.8) {
      // a vertical sign
      const sw = 26 + r() * 12
      const sh = 120 + r() * 160
      const sx = b.x + (r() < 0.5 ? 8 : b.w - sw - 8)
      const sy = b.top + 20 + r() * 80
      neonSign(neon, sx, sy, sw, sh, col, true, r)
      if (!info.broken && r() < 0.5) info.broken = { x: sx, y: sy, w: sw, h: sh, col }
    }
    // a neon strip on the roof edge
    if (r() < 0.6) {
      neon.save()
      neon.strokeStyle = `rgba(${col},0.9)`
      neon.lineWidth = 2
      neon.shadowColor = `rgba(${col},1)`
      neon.shadowBlur = 10
      neon.beginPath()
      neon.moveTo(b.x, b.top + 1)
      neon.lineTo(b.x + b.w, b.top + 1)
      neon.stroke()
      neon.restore()
    }
  }
}

function neonSign(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, vertical: boolean, r: () => number): void {
  g.save()
  g.fillStyle = 'rgba(8,4,14,0.85)'
  g.fillRect(x, y, w, h)
  g.shadowColor = `rgba(${col},1)`
  g.shadowBlur = 16
  g.strokeStyle = `rgba(${col},1)`
  g.lineWidth = 2
  g.strokeRect(x + 2, y + 2, w - 4, h - 4)
  g.lineWidth = 2.2
  g.lineCap = 'round'
  const s = (vertical ? w : h) - 12
  if (vertical) for (let yy = y + 8; yy + s < y + h - 4; yy += s + 7) glyph(g, x + 6, yy, s, r)
  else for (let xx = x + 8; xx + s < x + w - 4; xx += s + 7) glyph(g, xx, y + 6, s, r)
  g.restore()
}

function paintNear(g: CanvasRenderingContext2D, P: Pal, info: Info, neon: CanvasRenderingContext2D): void {
  const r = rng(47)
  const body = mix(P.bldg, [0, 0, 0], 0.35)
  // two towers framing the view
  const towers = [
    { x: -40, w: 290, top: 40 },
    { x: 1340, w: 300, top: 110 }
  ]
  for (const t of towers) {
    const shade = g.createLinearGradient(t.x, 0, t.x + t.w, 0)
    const left = t.x < BW / 2
    shade.addColorStop(0, rgb(mix(body, [255, 255, 255], left ? 0.02 : 0.06)))
    shade.addColorStop(1, rgb(mix(body, [255, 255, 255], left ? 0.06 : 0.02)))
    g.fillStyle = shade
    g.fillRect(t.x, t.top, t.w, FLOOR + 20 - t.top)
    // floor slabs and windows
    for (let y = t.top + 30; y < FLOOR; y += 38) {
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(t.x, y, t.w, 3)
      // a ribbon of glass per floor, lit in stretches
      g.fillStyle = 'rgba(30,26,52,0.9)'
      g.fillRect(t.x + 10, y + 12, t.w - 24, 14)
      for (let x = t.x + 10; x < t.x + t.w - 24; ) {
        const w = 20 + r() * 70
        if (r() < P.lit * 1.4) {
          g.fillStyle = `rgba(${r() < 0.85 ? '255,200,150' : '170,220,255'},${0.18 + r() * 0.3})`
          g.fillRect(x, y + 12, Math.min(w, t.x + t.w - 24 - x), 14)
        }
        x += w + 2
      }
    }
    // AC units and pipes on the inner face
    const edge = left ? t.x + t.w : t.x
    for (let y = t.top + 80; y < FLOOR - 40; y += 70 + r() * 60) {
      g.fillStyle = rgb(mix(body, [0, 0, 0], 0.3))
      g.fillRect(left ? edge - 4 : edge - 20, y, 24, 18)
    }
  }
  // signs on the towers
  neonSign(neon, 214, 150, 46, 330, NEON[0], true, r)
  neonSign(neon, 30, 520, 170, 52, NEON[1], false, r)
  neonSign(neon, 1350, 210, 50, 380, NEON[3], true, r)
  neonSign(neon, 1430, 640, 160, 48, NEON[2], false, r)

  // the rooftop: railing on the far edge
  g.fillStyle = '#07050d'
  g.fillRect(-10, RAIL, BW + 20, 5)
  g.fillRect(-10, RAIL + 24, BW + 20, 3)
  for (let x = -10; x < BW + 20; x += 64) g.fillRect(x, RAIL, 5, FLOOR - RAIL)
  // a rim of neon light along the top rail
  g.fillStyle = `rgba(255,80,200,${0.25 * P.neon + 0.05})`
  g.fillRect(-10, RAIL, BW + 20, 1)
}

/** The wet rooftop: dark concrete, the city mirrored, brighter in the puddles. */
function paintFloor(g: CanvasRenderingContext2D, v: View, P: Pal, mirror: (g: CanvasRenderingContext2D) => void): void {
  g.fillStyle = rgb(mix(P.bldg, [0, 0, 0], 0.55))
  g.fillRect(-10, FLOOR, BW + 20, BH - FLOOR + 10)
  const puddles = new Path2D()
  const r = rng(61)
  for (let i = 0; i < 9; i++) {
    const cx = r() * BW
    const cy = FLOOR + 20 + r() * 80
    puddles.ellipse(cx, cy, 90 + r() * 200, 8 + r() * 14, 0, 0, Math.PI * 2)
  }
  const reflect = (alpha: number): void => {
    g.save()
    g.globalAlpha = alpha
    g.setTransform(1, 0, 0, 1, 0, 0)
    const fy = (FLOOR * v.s + v.oy) * v.dpr
    g.translate(0, fy * 2)
    g.scale(1, -1)
    g.filter = `blur(${Math.round(3 * v.dpr)}px)`
    mirror(g)
    g.restore()
  }
  g.save()
  g.beginPath()
  g.rect(-10, FLOOR, BW + 20, BH - FLOOR + 10)
  g.clip()
  reflect(0.45)
  g.clip(puddles)
  reflect(0.9)
  g.restore()
  // the floor darkens toward us
  const fade = g.createLinearGradient(0, FLOOR, 0, BH)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = fade
  g.fillRect(-10, FLOOR, BW + 20, BH - FLOOR + 10)
}

function scanLayer(v: View): Layer {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(v.w * v.dpr))
  c.height = Math.max(1, Math.round(v.h * v.dpr))
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(0,0,0,0.1)'
  const step = Math.max(3, Math.round(3 * v.dpr))
  for (let y = 0; y < c.height; y += step) g.fillRect(0, y, c.width, Math.max(1, Math.round(v.dpr)))
  const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.4, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(4,0,12,0.5)')
  g.fillStyle = vg
  g.fillRect(0, 0, c.width, c.height)
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Car {
  x: number
  lane: number
  speed: number
}

interface Drop {
  x: number
  y: number
  v: number
  len: number
  a: number
}

interface State {
  v: View
  P: Pal
  back: Layer
  mid: Layer
  near: Layer
  neon: Layer
  neonFlip: Layer
  bloom: Layer
  floor: Layer
  scan: Layer
  info: Info
  red: Layer
  white: Layer
  cyan: Layer
  pink: Layer
  cars: Car[]
  drops: Drop[]
  ripples: { x: number; y: number; t: number }[]
  glitch: number
  nextGlitch: number
  tears: { y: number; h: number; dx: number }[]
}

let S: State | null = null

const LANES = [
  { y: 300, s: 0.45, far: true },
  { y: 372, s: 0.55, far: true },
  { y: 450, s: 0.7, far: false },
  { y: 220, s: 0.8, far: false }
]

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const info: Info = { boards: [], wins: [], broken: null, beacons: [] }
  // the neon layer is painted alongside the mid and near rows
  const neon = makeLayer(v, () => {})
  const ng = neon.getContext('2d')!
  const back = makeLayer(v, (g) => paintBack(g, P, info))
  const mid = makeLayer(v, (g) => paintMid(g, P, info, ng))
  const near = makeLayer(v, (g) => paintNear(g, P, info, ng))
  const mirror = (g: CanvasRenderingContext2D): void => {
    g.drawImage(back, 0, 0)
    g.drawImage(mid, 0, 0)
    g.drawImage(near, 0, 0)
    g.drawImage(neon, 0, 0)
  }
  const floor = makeLayer(v, (g) => paintFloor(g, v, P, mirror))
  // the neon alone, mirrored on the floor, so its reflection pulses too
  const neonFlip = makeLayer(v, (g) => {
    g.beginPath()
    g.rect(-10, FLOOR, BW + 20, BH - FLOOR + 10)
    g.clip()
    g.setTransform(1, 0, 0, 1, 0, 0)
    const fy = (FLOOR * v.s + v.oy) * v.dpr
    g.translate(0, fy * 2)
    g.scale(1, -1)
    g.filter = `blur(${Math.round(4 * v.dpr)}px)`
    g.drawImage(neon, 0, 0)
  })
  // a soft bloom around every neon
  const bloom = makeLayer(v, (g) => {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.filter = `blur(${Math.round(10 * v.dpr)}px)`
    g.drawImage(neon, 0, 0)
    g.drawImage(neon, 0, 0)
  })
  const r = rng(5)
  return {
    bloom,
    v,
    P,
    back,
    mid,
    near,
    neon,
    neonFlip,
    floor,
    scan: scanLayer(v),
    info,
    red: glowSprite('255,50,60', 64),
    white: glowSprite('255,244,230', 64),
    cyan: glowSprite('0,230,255'),
    pink: glowSprite('255,60,200'),
    cars: Array.from({ length: 22 }, (_, i) => ({ x: r() * (BW + 200) - 100, lane: i % LANES.length, speed: (60 + r() * 70) * (r() < 0.5 ? -1 : 1) })),
    drops: Array.from({ length: 170 }, () => ({ x: r() * (BW + 100), y: r() * BH, v: 900 + r() * 500, len: 14 + r() * 22, a: 0.12 + r() * 0.25 })),
    ripples: [],
    glitch: 0,
    nextGlitch: 10 + r() * 8,
    tears: []
  }
}

/** The holographic whale, swimming slowly across the sky. */
function drawWhale(ctx: CanvasRenderingContext2D, st: State, time: number, flicker: number): void {
  const period = 46
  const u = ((time / period) % 1) * 1.3 - 0.15
  const at = (k: number): [number, number] => {
    const t = u - k
    return [t * BW * 1.1 - 80, 250 + Math.sin(t * 7) * 60 + Math.sin(t * 17) * 12]
  }
  const [hx, hy] = at(0)
  if (hx < -300 || hx > BW + 300) return
  // the spine, and a body outline around it (fat behind the head, thin at the tail)
  const N = 18
  const L = 0.0075
  const spine: [number, number][] = []
  for (let i = 0; i <= N; i++) spine.push(at(i * L))
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i <= N; i++) {
    const [x, y] = spine[i]
    const [qx, qy] = spine[Math.min(N, i + 1)]
    const [px, py] = spine[Math.max(0, i - 1)]
    let tx = px - qx
    let ty = py - qy
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const t = i / N
    const w = 24 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.8) + 1.5
    left.push([x - ty * w, y + tx * w])
    right.push([x + ty * w, y - tx * w])
  }
  const body = new Path2D()
  body.moveTo(left[0][0], left[0][1])
  for (const p of left) body.lineTo(p[0], p[1])
  for (let i = right.length - 1; i >= 0; i--) body.lineTo(right[i][0], right[i][1])
  body.closePath()

  const [tx, ty] = spine[N]
  const [px, py] = spine[2]
  const ang = Math.atan2(hy - py, hx - px)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // a soft halo
  ctx.globalAlpha = 0.18 * flicker
  ctx.drawImage(st.cyan, hx - 160 - Math.cos(ang) * 60, hy - 90 - Math.sin(ang) * 60, 320, 180)
  // fins and tail (filled, translucent)
  ctx.fillStyle = 'rgba(80,220,255,0.22)'
  ctx.strokeStyle = 'rgba(150,250,255,0.75)'
  ctx.lineWidth = 1.3
  ctx.globalAlpha = flicker
  const sw = Math.sin(time * 3) * 0.35
  const fin = (x: number, y: number, a: number, len: number, spread: number): void => {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.cos(a - spread) * len, y + Math.sin(a - spread) * len, x + Math.cos(a) * len * 1.1, y + Math.sin(a) * len * 1.1)
    ctx.quadraticCurveTo(x + Math.cos(a + spread) * len * 0.6, y + Math.sin(a + spread) * len * 0.6, x, y)
    ctx.fill()
    ctx.stroke()
  }
  fin(tx, ty, ang + Math.PI - 0.45 + sw, 46, 0.35)
  fin(tx, ty, ang + Math.PI + 0.45 + sw, 46, 0.35)
  const [fx, fy] = spine[4]
  fin(fx, fy, ang + Math.PI - 0.95 + sw * 0.4, 38, 0.35)
  // the body
  ctx.fillStyle = 'rgba(60,200,255,0.28)'
  ctx.fill(body)
  ctx.strokeStyle = 'rgba(170,250,255,0.9)'
  ctx.lineWidth = 1.6
  ctx.stroke(body)
  // the grooves along its belly
  ctx.globalAlpha = 0.45 * flicker
  ctx.lineWidth = 1
  for (const k of [0.45, 0.65]) {
    ctx.beginPath()
    for (let i = 1; i <= 9; i++) {
      const [x, y] = spine[i]
      const [lx, ly] = left[i]
      const gx = x + (lx - x) * k
      const gy = y + (ly - y) * k
      if (i === 1) ctx.moveTo(gx, gy)
      else ctx.lineTo(gx, gy)
    }
    ctx.stroke()
  }
  // scan lines through the hologram
  ctx.save()
  ctx.clip(body)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 0.25
  ctx.fillStyle = 'rgba(0,0,0,1)'
  const minY = Math.min(...left.map((p) => p[1]), ...right.map((p) => p[1]))
  const maxY = Math.max(...left.map((p) => p[1]), ...right.map((p) => p[1]))
  for (let y = minY; y < maxY; y += 4) ctx.fillRect(Math.min(hx, tx) - 60, y, Math.abs(hx - tx) + 120, 1.5)
  ctx.restore()
  // eye
  ctx.globalAlpha = flicker
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  const [ex, ey] = spine[1]
  ctx.fillRect(ex - 1.5 + Math.sin(ang) * 8, ey - 1.5 - Math.cos(ang) * 8, 3, 3)
  ctx.restore()
}

function drawBoards(ctx: CanvasRenderingContext2D, st: State, c: WorldContext, buzz: number): void {
  const { time } = c
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const b of st.info.boards) {
    const flick = Math.sin(time * 37 + b.x) > 0.97 ? 0.4 : 1
    ctx.globalAlpha = 0.12 * flick
    ctx.fillStyle = `rgba(${b.col},1)`
    ctx.fillRect(b.x, b.y, b.w, b.h)
    ctx.globalAlpha = 0.7 * flick
    ctx.strokeStyle = `rgba(${b.col},1)`
    ctx.lineWidth = 1.5
    ctx.strokeRect(b.x, b.y, b.w, b.h)
    ctx.save()
    ctx.beginPath()
    ctx.rect(b.x + 4, b.y + 4, b.w - 8, b.h - 8)
    ctx.clip()
    if (b.kind === 0) {
      // the song's spectrum
      const bins = c.spectrum.length || 1
      const bw = (b.w - 12) / bins
      for (let i = 0; i < bins; i++) {
        const h = Math.max(2, (c.spectrum[i] ?? 0) * (b.h - 14))
        ctx.globalAlpha = 0.75 * flick
        ctx.fillRect(b.x + 6 + i * bw, b.y + b.h - 6 - h, bw * 0.7, h)
      }
    } else if (b.kind === 1) {
      // a slowly turning wireframe ring, a logo of nothing
      const cx = b.x + b.w / 2
      const cy = b.y + b.h / 2
      const R = Math.min(b.w, b.h) * 0.32
      ctx.globalAlpha = 0.8 * flick
      for (let i = 0; i < 6; i++) {
        const a = time * 0.6 + (i / 6) * Math.PI
        ctx.beginPath()
        ctx.ellipse(cx, cy, R * Math.abs(Math.cos(a)) + 1, R, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 0.5 * flick * (0.6 + c.kick * 0.4)
      ctx.drawImage(st.white, cx - R * 0.6, cy - R * 0.6, R * 1.2, R * 1.2)
    } else {
      // scrolling lines of "text"
      const r = rng(Math.floor(b.x))
      const off = (time * 22) % 16
      ctx.globalAlpha = 0.7 * flick
      for (let y = b.y + 8 - off; y < b.y + b.h; y += 16) {
        let x = b.x + 8
        while (x < b.x + b.w - 10) {
          const w = 6 + r() * 30
          ctx.fillRect(x, y, w, 5)
          x += w + 5
        }
      }
    }
    ctx.restore()
    // scan bars over the hologram
    ctx.globalAlpha = 0.18
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.globalCompositeOperation = 'source-over'
    for (let y = b.y; y < b.y + b.h; y += 4) ctx.fillRect(b.x, y, b.w, 1.5)
    ctx.globalCompositeOperation = 'lighter'
  }
  // the broken sign buzzes off and on
  const br = st.info.broken
  if (br && buzz < 0.5) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.75
    ctx.fillStyle = 'rgba(8,4,14,1)'
    ctx.fillRect(br.x, br.y, br.w, br.h)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const cyberpunkWorld: World = {
  id: 'cyber-city',
  name: 'Cyberpunk',
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
    const neonA = (0.55 + c.kick * 0.35 + c.breath * 0.1) * (0.5 + 0.5 * P.neon)

    ctx.save()
    ctx.drawImage(st.back, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    ctx.globalCompositeOperation = 'lighter'
    // searchlights sweeping from the arcology
    for (let i = 0; i < 2; i++) {
      const a = -Math.PI / 2 + Math.sin(time * 0.13 + i * 2.4) * 0.7
      ctx.save()
      ctx.translate(ARC.x, ARC.top + 10)
      ctx.rotate(a + Math.PI / 2)
      const lg = ctx.createLinearGradient(0, 0, 0, -900)
      lg.addColorStop(0, `rgba(200,220,255,${0.12 * (0.4 + 0.6 * P.neon)})`)
      lg.addColorStop(1, 'rgba(200,220,255,0)')
      ctx.fillStyle = lg
      ctx.beginPath()
      ctx.moveTo(-4, 0)
      ctx.lineTo(-90, -900)
      ctx.lineTo(90, -900)
      ctx.lineTo(4, 0)
      ctx.fill()
      ctx.restore()
    }
    // beacons blinking on the antennas
    for (const b of st.info.beacons) {
      const on = Math.sin(time * 2.2 + b.ph) > 0.6
      if (!on) continue
      ctx.globalAlpha = 0.85
      ctx.drawImage(st.red, b.x - 9, b.y - 9, 18, 18)
    }
    // far traffic
    drawCars(ctx, st, dt, true)
    ctx.restore()

    ctx.drawImage(st.mid, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // flickering windows
    for (const w of st.info.wins) {
      const k = Math.sin(time * 0.7 + w.ph)
      if (k > 0.3) continue
      ctx.globalAlpha = k < -0.6 ? 0.9 : 0.5
      ctx.fillStyle = 'rgba(6,4,14,1)'
      ctx.fillRect(w.x, w.y, w.w, w.h)
    }
    ctx.globalAlpha = 1
    const buzz = Math.sin(time * 23) * Math.sin(time * 3.1) + (Math.sin(time * 0.4) > -0.3 ? 1 : 0)
    drawBoards(ctx, st, c, buzz)
    drawWhale(ctx, st, time, Math.random() > 0.03 ? 1 : 0.4)
    drawCars(ctx, st, dt, false)
    ctx.restore()

    ctx.drawImage(st.near, 0, 0, width, height)
    // the neon, pulsing on the kick
    ctx.globalAlpha = Math.min(1, neonA)
    ctx.drawImage(st.neon, 0, 0, width, height)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, neonA * 0.9)
    ctx.drawImage(st.bloom, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(st.floor, 0, 0, width, height)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 * neonA
    ctx.drawImage(st.neonFlip, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    ctx.save()
    toBoard(ctx, st.v)
    // rain through the neon, rippling the puddles
    ctx.strokeStyle = P.key === 'day' ? 'rgba(220,230,240,1)' : 'rgba(170,210,255,1)'
    ctx.lineWidth = 1.1
    for (const d of st.drops) {
      d.y += d.v * dt
      d.x -= d.v * 0.08 * dt
      if (d.y > FLOOR + 20 + (d.x % 90)) {
        if (st.ripples.length < 40 && Math.random() < 0.35) st.ripples.push({ x: d.x, y: FLOOR + 14 + Math.random() * 90, t: 0 })
        d.y = -40 - Math.random() * 200
        d.x = Math.random() * (BW + 100)
      }
      ctx.globalAlpha = d.a
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x + d.len * 0.08, d.y - d.len)
      ctx.stroke()
    }
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(200,220,255,1)'
    for (let i = st.ripples.length - 1; i >= 0; i--) {
      const rp = st.ripples[i]
      rp.t += dt
      if (rp.t > 0.6) {
        st.ripples.splice(i, 1)
        continue
      }
      const k = rp.t / 0.6
      ctx.globalAlpha = (1 - k) * 0.4
      ctx.beginPath()
      ctx.ellipse(rp.x, rp.y, 3 + k * 16, 1 + k * 4, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()

    // CRT
    ctx.globalAlpha = 1
    ctx.drawImage(st.scan, 0, 0, width, height)

    // glitch tears: on impacts, or now and then
    st.nextGlitch -= dt
    if (st.nextGlitch <= 0 || (c.impactHit && Math.random() < 0.5)) {
      st.glitch = 1
      st.nextGlitch = 9 + Math.random() * 10
      st.tears = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => ({ y: Math.random() * height, h: 4 + Math.random() * 26, dx: (Math.random() - 0.5) * 60 }))
    }
    if (st.glitch > 0.01) {
      st.glitch = Math.max(0, st.glitch - dt * 3.5)
      const canvas = ctx.canvas
      const sx = canvas.width / width
      for (const t of st.tears) {
        const dx = t.dx * st.glitch * (Math.random() < 0.3 ? -1 : 1)
        ctx.drawImage(canvas, 0, t.y * sx, canvas.width, t.h * sx, dx, t.y, width, t.h)
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.25 * st.glitch
        ctx.fillStyle = Math.random() < 0.5 ? 'rgb(0,240,255)' : 'rgb(255,40,200)'
        ctx.fillRect(0, t.y + t.h * Math.random(), width, 1.5)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }
}

function drawCars(ctx: CanvasRenderingContext2D, st: State, dt: number, far: boolean): void {
  for (const car of st.cars) {
    const lane = LANES[car.lane]
    if (lane.far !== far) continue
    car.x += car.speed * lane.s * dt
    if (car.x > BW + 120) car.x = -120
    if (car.x < -120) car.x = BW + 120
    const s = lane.s
    const y = lane.y + Math.sin(car.x * 0.01 + car.lane) * 3
    const dir = Math.sign(car.speed)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.9
    ctx.fillStyle = 'rgba(10,8,20,1)'
    ctx.fillRect(car.x - 14 * s, y - 3 * s, 28 * s, 7 * s)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.9
    const head = car.x + dir * 14 * s
    const tail = car.x - dir * 14 * s
    ctx.drawImage(st.white, head - 10 * s, y - 10 * s, 20 * s, 20 * s)
    ctx.drawImage(st.red, tail - 8 * s, y - 8 * s, 16 * s, 16 * s)
    // a faint glow under it
    ctx.globalAlpha = 0.25
    ctx.drawImage(st.cyan, car.x - 18 * s, y + 2 * s, 36 * s, 10 * s)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}
