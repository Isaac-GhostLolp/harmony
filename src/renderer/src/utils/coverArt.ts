import { tk } from '@/i18n'
/**
 * Cover art generator — draws an album cover on a canvas from a style, a
 * palette, a seed and the album's own text. Everything is procedural (no
 * assets, works offline), deterministic for a given seed (so "another
 * variation" is just another seed), and resolution independent: the same
 * description draws the little previews and the 1000 px cover that's saved.
 */

export type CoverStyle =
  | 'gradient'
  | 'waves'
  | 'bauhaus'
  | 'sunset'
  | 'rings'
  | 'mosaic'
  | 'type'
  | 'topo'
  | 'night'
  | 'photo'

export const COVER_STYLES: { id: CoverStyle; label: string }[] = [
  { id: 'gradient', label: tk('Degradê') },
  { id: 'waves', label: tk('Ondas') },
  { id: 'bauhaus', label: tk('Bauhaus') },
  { id: 'sunset', label: tk('Retrô') },
  { id: 'rings', label: tk('Anéis') },
  { id: 'mosaic', label: tk('Mosaico') },
  { id: 'type', label: tk('Tipografia') },
  { id: 'topo', label: tk('Linhas') },
  { id: 'night', label: tk('Noite') },
  { id: 'photo', label: tk('Minha foto') }
]

/** background, then three colours */
export type Palette = [string, string, string, string]

export const PALETTES: { name: string; colors: Palette }[] = [
  { name: tk('Pôr do sol'), colors: ['#2b0f3a', '#ff6b6b', '#ffb36b', '#ffe29a'] },
  { name: tk('Oceano'), colors: ['#03203c', '#1e6fa8', '#3ec1d3', '#e0fbfc'] },
  { name: tk('Neon'), colors: ['#0b0221', '#ff2a6d', '#05d9e8', '#d1f7ff'] },
  { name: tk('Pastel'), colors: ['#fdf0f5', '#f7a8c4', '#a8d8f7', '#c9f0d4'] },
  { name: tk('Floresta'), colors: ['#0f2417', '#2d6a4f', '#95d5b2', '#f1e3c2'] },
  { name: tk('Café'), colors: ['#2a1a12', '#8b5a3c', '#d4a373', '#faedcd'] },
  { name: tk('Mono'), colors: ['#111111', '#444444', '#9a9a9a', '#f2f2f2'] },
  { name: tk('Algodão-doce'), colors: ['#2d1b4e', '#c77dff', '#ff9ecd', '#fff1a8'] },
  { name: tk('Vintage'), colors: ['#f1e6d0', '#d1495b', '#edae49', '#00798c'] },
  { name: tk('Lava'), colors: ['#120404', '#7a0b0b', '#ff4d1a', '#ffc53d'] }
]

export type TextPos = 'bottom' | 'center' | 'top' | 'none'

export interface CoverSpec {
  style: CoverStyle
  palette: Palette
  seed: number
  title: string
  artist: string
  textPos: TextPos
  upper: boolean
  font: string // a CSS font family
  grain: boolean
  /** the user's picture, for the 'photo' style */
  image?: HTMLImageElement | null
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashText(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgba = (hex: string, a: number): string => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}
const lum = (hex: string): number => {
  const [r, g, b] = rgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
function mixHex(a: string, b: string, t: number): string {
  const A = rgb(a)
  const B = rgb(b)
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
function hsl(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

/** A harmonious palette that belongs to this text (same album, same colours). */
export function paletteFor(text: string, variant = 0): Palette {
  const r = rng(hashText(text) + variant * 7919)
  const h = Math.floor(r() * 360)
  const scheme = Math.floor(r() * 4)
  const hues =
    scheme === 0 ? [h, h + 25, h + 50] : scheme === 1 ? [h, h + 180, h + 200] : scheme === 2 ? [h, h + 120, h + 240] : [h, h + 150, h + 30]
  const dark = r() < 0.72
  return [
    dark ? hsl(h, 45, 9) : hsl(h, 40, 93),
    hsl(hues[0] % 360, 75, dark ? 58 : 52),
    hsl(hues[1] % 360, 70, dark ? 64 : 60),
    hsl(hues[2] % 360, 65, dark ? 82 : 40)
  ]
}

let grainTile: HTMLCanvasElement | null = null
function grain(ctx: CanvasRenderingContext2D, S: number): void {
  if (!grainTile) {
    grainTile = document.createElement('canvas')
    grainTile.width = grainTile.height = 160
    const g = grainTile.getContext('2d')!
    const img = g.createImageData(160, 160)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
  }
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.globalCompositeOperation = 'overlay'
  const scale = Math.max(1, S / 700)
  ctx.scale(scale, scale)
  ctx.fillStyle = ctx.createPattern(grainTile, 'repeat')!
  ctx.fillRect(0, 0, S / scale, S / scale)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

type Draw = (g: CanvasRenderingContext2D, S: number, p: Palette, r: () => number, spec: CoverSpec) => void

const drawGradient: Draw = (g, S, p, r) => {
  g.fillStyle = p[0]
  g.fillRect(0, 0, S, S)
  // soft colour blobs, melted together with a blur
  const off = document.createElement('canvas')
  off.width = off.height = S
  const o = off.getContext('2d')!
  o.fillStyle = mixHex(p[0], p[1], 0.35)
  o.fillRect(0, 0, S, S)
  for (let i = 0; i < 6; i++) {
    const x = r() * S
    const y = r() * S
    const rad = S * (0.35 + r() * 0.45)
    const c = p[1 + (i % 3)]
    const grad = o.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, rgba(c, 0.95))
    grad.addColorStop(1, rgba(c, 0))
    o.fillStyle = grad
    o.fillRect(0, 0, S, S)
  }
  g.filter = `blur(${Math.round(S * 0.05)}px) saturate(1.2)`
  g.drawImage(off, -S * 0.1, -S * 0.1, S * 1.2, S * 1.2)
  g.filter = 'none'
}

const drawWaves: Draw = (g, S, p, r) => {
  const sky = g.createLinearGradient(0, 0, 0, S)
  sky.addColorStop(0, mixHex(p[0], p[3], 0.25))
  sky.addColorStop(1, mixHex(p[0], p[1], 0.3))
  g.fillStyle = sky
  g.fillRect(0, 0, S, S)
  // a sun behind the hills
  const sx = S * (0.25 + r() * 0.5)
  const sy = S * (0.28 + r() * 0.12)
  g.fillStyle = rgba(p[3], 0.9)
  g.beginPath()
  g.arc(sx, sy, S * 0.12, 0, Math.PI * 2)
  g.fill()
  const layers = 6
  for (let k = 0; k < layers; k++) {
    const t = k / (layers - 1)
    const base = S * (0.42 + t * 0.48)
    const amp = S * (0.03 + r() * 0.05)
    const f1 = 1 + r() * 2.5
    const f2 = 2 + r() * 4
    const ph = r() * 10
    g.fillStyle = mixHex(mixHex(p[1], p[2], t), p[0], t * 0.65)
    g.beginPath()
    g.moveTo(0, S)
    for (let x = 0; x <= S; x += S / 80) {
      const u = x / S
      g.lineTo(x, base + Math.sin(u * Math.PI * f1 + ph) * amp + Math.sin(u * Math.PI * f2 + ph * 2) * amp * 0.4)
    }
    g.lineTo(S, S)
    g.closePath()
    g.fill()
  }
}

const drawBauhaus: Draw = (g, S, p, r) => {
  const n = r() < 0.5 ? 3 : 4
  const c = S / n
  const colors = [p[0], p[1], p[2], p[3]]
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = i * c
      const y = j * c
      const bg = colors[Math.floor(r() * 4)]
      let fg = colors[Math.floor(r() * 4)]
      if (fg === bg) fg = colors[(colors.indexOf(bg) + 2) % 4]
      g.fillStyle = bg
      g.fillRect(x, y, c + 1, c + 1)
      g.fillStyle = fg
      g.beginPath()
      const kind = Math.floor(r() * 6)
      const rot = Math.floor(r() * 4)
      const cx = x + (rot === 1 || rot === 2 ? c : 0)
      const cy = y + (rot >= 2 ? c : 0)
      if (kind === 0) {
        // quarter circle from a corner
        g.moveTo(cx, cy)
        g.arc(cx, cy, c, (rot * Math.PI) / 2, (rot * Math.PI) / 2 + Math.PI / 2)
      } else if (kind === 1) {
        g.arc(x + c / 2, y + c / 2, c * 0.38, 0, Math.PI * 2)
      } else if (kind === 2) {
        // half circle
        g.arc(x + c / 2, y + (rot % 2 ? 0 : c), c / 2, rot % 2 ? 0 : Math.PI, rot % 2 ? Math.PI : Math.PI * 2)
      } else if (kind === 3) {
        g.moveTo(x, y + c)
        g.lineTo(x + c / 2, y)
        g.lineTo(x + c, y + c)
      } else if (kind === 4) {
        for (let s = 0; s < 4; s++) g.rect(x, y + (s * c) / 4, c, c / 8)
      } else {
        g.arc(x + c / 2, y + c / 2, c * 0.42, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = bg
        g.beginPath()
        g.arc(x + c / 2, y + c / 2, c * 0.18, 0, Math.PI * 2)
      }
      g.fill()
    }
  }
}

const drawSunset: Draw = (g, S, p, r) => {
  const hz = S * 0.64
  const sky = g.createLinearGradient(0, 0, 0, hz)
  sky.addColorStop(0, p[0])
  sky.addColorStop(1, mixHex(p[0], p[1], 0.6))
  g.fillStyle = sky
  g.fillRect(0, 0, S, hz)
  // a few stars
  g.fillStyle = rgba(p[3], 0.8)
  for (let i = 0; i < 40; i++) g.fillRect(r() * S, r() * hz * 0.6, S * 0.003, S * 0.003)
  // the striped sun
  const R = S * 0.27
  const cy = hz - R * 0.35
  const sun = g.createLinearGradient(0, cy - R, 0, cy + R)
  sun.addColorStop(0, p[3])
  sun.addColorStop(1, p[1])
  g.save()
  g.beginPath()
  g.arc(S / 2, cy, R, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = sun
  g.fillRect(0, cy - R, S, R * 2)
  g.globalCompositeOperation = 'destination-out'
  for (let k = 0; k < 6; k++) {
    const y = cy + R * (0.05 + k * 0.17)
    g.fillRect(0, y, S, R * (0.025 + k * 0.022))
  }
  g.restore()
  // mountains
  g.fillStyle = mixHex(p[0], p[2], 0.25)
  g.beginPath()
  g.moveTo(0, hz)
  let x = 0
  while (x < S) {
    const w = S * (0.08 + r() * 0.14)
    g.lineTo(x + w / 2, hz - S * (0.04 + r() * 0.1))
    x += w
    g.lineTo(x, hz)
  }
  g.fill()
  // the neon floor
  g.fillStyle = p[0]
  g.fillRect(0, hz, S, S - hz)
  g.strokeStyle = rgba(p[2], 0.9)
  g.lineWidth = Math.max(1, S * 0.004)
  g.shadowColor = p[2]
  g.shadowBlur = S * 0.015
  for (let i = -12; i <= 12; i++) {
    g.beginPath()
    g.moveTo(S / 2 + i * S * 0.02, hz)
    g.lineTo(S / 2 + i * S * 0.16, S)
    g.stroke()
  }
  for (let k = 1; k < 9; k++) {
    const y = hz + (S - hz) * Math.pow(k / 9, 1.9)
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(S, y)
    g.stroke()
  }
  g.shadowBlur = 0
}

const drawRings: Draw = (g, S, p, r) => {
  g.fillStyle = p[0]
  g.fillRect(0, 0, S, S)
  const cx = S * (0.3 + r() * 0.4)
  const cy = S * (0.3 + r() * 0.4)
  const step = S * (0.03 + r() * 0.03)
  for (let k = Math.ceil((S * 1.5) / step); k > 0; k--) {
    g.fillStyle = [p[1], p[2], p[3], p[0]][k % 4]
    g.beginPath()
    g.arc(cx, cy, k * step, 0, Math.PI * 2)
    g.fill()
  }
  // an offset set of thin rings for a little op-art shimmer
  g.strokeStyle = rgba(p[0], 0.35)
  g.lineWidth = step * 0.18
  const ox = cx + S * (r() - 0.5) * 0.3
  const oy = cy + S * (r() - 0.5) * 0.3
  for (let k = 1; k < 40; k++) {
    g.beginPath()
    g.arc(ox, oy, k * step * 1.1, 0, Math.PI * 2)
    g.stroke()
  }
}

const drawMosaic: Draw = (g, S, p, r) => {
  const n = 5 + Math.floor(r() * 5)
  const c = S / n
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = p[Math.floor(r() * 4)]
      let b = p[Math.floor(r() * 4)]
      if (a === b) b = p[(p.indexOf(a) + 1) % 4]
      const x = i * c
      const y = j * c
      g.fillStyle = a
      g.fillRect(x, y, c + 1, c + 1)
      g.fillStyle = b
      g.beginPath()
      if (r() < 0.5) {
        g.moveTo(x, y)
        g.lineTo(x + c + 1, y)
        g.lineTo(x, y + c + 1)
      } else {
        g.moveTo(x + c + 1, y)
        g.lineTo(x + c + 1, y + c + 1)
        g.lineTo(x, y + c + 1)
      }
      g.fill()
    }
  }
}

const drawType: Draw = (g, S, p, r, spec) => {
  g.fillStyle = p[0]
  g.fillRect(0, 0, S, S)
  const word = (spec.title || 'Harmony').replace(/\s+/g, '').slice(0, 3).toUpperCase() || 'H'
  g.save()
  g.translate(S / 2, S / 2)
  g.rotate((r() < 0.5 ? -1 : 1) * (Math.PI / 2) * Math.floor(r() * 2))
  g.font = `900 ${S * (word.length === 1 ? 1.3 : word.length === 2 ? 0.9 : 0.62)}px ${spec.font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = p[1]
  g.fillText(word, -S * 0.05, S * 0.06)
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = rgba(p[2], 0.85)
  g.fillText(word, S * 0.04, -S * 0.04)
  g.restore()
  // a few thin rules, Swiss-poster style
  g.fillStyle = p[3]
  for (let i = 0; i < 3; i++) g.fillRect(S * 0.07, S * (0.08 + i * 0.025), S * (0.15 + r() * 0.3), S * 0.006)
}

const drawTopo: Draw = (g, S, p, r) => {
  const bg = g.createLinearGradient(0, 0, S, S)
  bg.addColorStop(0, p[0])
  bg.addColorStop(1, mixHex(p[0], p[1], 0.25))
  g.fillStyle = bg
  g.fillRect(0, 0, S, S)
  const lines = 44
  const fr = [1 + r() * 2, 2 + r() * 3, 4 + r() * 4]
  const ph = [r() * 6, r() * 6, r() * 6]
  g.lineWidth = Math.max(1, S * 0.0035)
  for (let k = 0; k < lines; k++) {
    const t = k / (lines - 1)
    const base = -S * 0.1 + t * S * 1.2
    g.strokeStyle = rgba(mixHex(p[1], p[3], t), 0.55 + 0.45 * Math.sin(t * Math.PI))
    g.beginPath()
    for (let x = 0; x <= S; x += S / 120) {
      const u = x / S
      const y =
        base +
        Math.sin(u * fr[0] * Math.PI + ph[0] + t * 2) * S * 0.06 +
        Math.sin(u * fr[1] * Math.PI + ph[1] - t * 3) * S * 0.03 +
        Math.sin(u * fr[2] * Math.PI + ph[2]) * S * 0.01
      if (x === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
}

const drawNight: Draw = (g, S, p, r) => {
  const sky = g.createLinearGradient(0, 0, 0, S)
  sky.addColorStop(0, mixHex(p[0], '#000000', 0.3))
  sky.addColorStop(1, mixHex(p[0], p[1], 0.45))
  g.fillStyle = sky
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 220; i++) {
    const s = r() < 0.92 ? S * 0.0025 : S * 0.006
    g.fillStyle = rgba(p[3], 0.4 + r() * 0.6)
    g.beginPath()
    g.arc(r() * S, r() * S * 0.75, s, 0, Math.PI * 2)
    g.fill()
  }
  // a crescent moon with a halo
  const mx = S * (0.6 + r() * 0.2)
  const my = S * (0.2 + r() * 0.12)
  const mr = S * 0.09
  const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 4)
  halo.addColorStop(0, rgba(p[3], 0.3))
  halo.addColorStop(1, rgba(p[3], 0))
  g.fillStyle = halo
  g.fillRect(0, 0, S, S)
  const moon = document.createElement('canvas')
  moon.width = moon.height = S
  const m = moon.getContext('2d')!
  m.fillStyle = p[3]
  m.beginPath()
  m.arc(mx, my, mr, 0, Math.PI * 2)
  m.fill()
  m.globalCompositeOperation = 'destination-out'
  m.beginPath()
  m.arc(mx - mr * 0.45, my - mr * 0.2, mr * 0.85, 0, Math.PI * 2)
  m.fill()
  g.drawImage(moon, 0, 0)
  // hills
  for (let k = 0; k < 3; k++) {
    g.fillStyle = mixHex(mixHex(p[0], '#000000', 0.2), p[2], 0.25 - k * 0.1)
    g.beginPath()
    g.moveTo(0, S)
    const base = S * (0.72 + k * 0.09)
    const ph = r() * 6
    for (let x = 0; x <= S; x += S / 60) g.lineTo(x, base + Math.sin((x / S) * Math.PI * (1.5 + k) + ph) * S * 0.04)
    g.lineTo(S, S)
    g.fill()
  }
}

const drawPhoto: Draw = (g, S, p, r, spec) => {
  const img = spec.image
  if (!img) {
    drawGradient(g, S, p, r, spec)
    return
  }
  // cover-fit, then a duotone in the palette's colours
  const k = Math.max(S / img.width, S / img.height)
  const w = img.width * k
  const h = img.height * k
  g.filter = 'grayscale(1) contrast(1.15)'
  g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h)
  g.filter = 'none'
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = p[1]
  g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'screen'
  g.fillStyle = rgba(mixHex(p[0], '#000000', 0.2), 0.9)
  g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'source-over'
}

const STYLES: Record<CoverStyle, Draw> = {
  gradient: drawGradient,
  waves: drawWaves,
  bauhaus: drawBauhaus,
  sunset: drawSunset,
  rings: drawRings,
  mosaic: drawMosaic,
  type: drawType,
  topo: drawTopo,
  night: drawNight,
  photo: drawPhoto
}

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (g.measureText(test).width > max && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

function drawText(g: CanvasRenderingContext2D, S: number, spec: CoverSpec): void {
  if (spec.textPos === 'none') return
  const title = spec.upper ? spec.title.toUpperCase() : spec.title
  const artist = spec.upper ? spec.artist.toUpperCase() : spec.artist
  if (!title && !artist) return
  const pad = S * 0.07
  const max = S - pad * 2
  // shrink the title until it fits in at most three lines
  let size = S * 0.1
  let lines: string[] = []
  for (; size > S * 0.04; size *= 0.92) {
    g.font = `800 ${size}px ${spec.font}`
    lines = wrap(g, title, max)
    if (lines.length <= 3 && lines.every((l) => g.measureText(l).width <= max)) break
  }
  const lh = size * 1.08
  const aSize = Math.max(S * 0.032, size * 0.42)
  const blockH = lines.length * lh + (artist ? aSize * 1.6 : 0)
  const center = spec.textPos === 'center'
  const top = spec.textPos === 'top' ? pad : center ? (S - blockH) / 2 : S - pad - blockH

  // light or dark text, depending on what's under it
  let light = true
  try {
    const sample = g.getImageData(0, Math.max(0, Math.floor(top)), S, Math.max(1, Math.floor(Math.min(blockH, S - top))))
    let sum = 0
    let n = 0
    for (let i = 0; i < sample.data.length; i += 4 * 37) {
      sum += 0.2126 * sample.data[i] + 0.7152 * sample.data[i + 1] + 0.0722 * sample.data[i + 2]
      n++
    }
    light = sum / Math.max(1, n) / 255 < 0.6
  } catch {
    light = lum(spec.palette[0]) < 0.5
  }

  // a soft shade behind the lettering, so it reads over busy patterns too
  g.save()
  const shade = light ? '0,0,0' : '255,255,255'
  if (center) {
    const cy = top + blockH / 2
    const rg = g.createRadialGradient(S / 2, cy, 0, S / 2, cy, S * 0.55)
    rg.addColorStop(0, `rgba(${shade},0.42)`)
    rg.addColorStop(1, `rgba(${shade},0)`)
    g.fillStyle = rg
    g.fillRect(0, 0, S, S)
  } else {
    const y0 = spec.textPos === 'top' ? 0 : top - pad * 1.6
    const y1 = spec.textPos === 'top' ? top + blockH + pad * 1.6 : S
    const lg = g.createLinearGradient(0, y0, 0, y1)
    const a = spec.textPos === 'top' ? [0.5, 0] : [0, 0.5]
    lg.addColorStop(0, `rgba(${shade},${a[0]})`)
    lg.addColorStop(1, `rgba(${shade},${a[1]})`)
    g.fillStyle = lg
    g.fillRect(0, y0, S, y1 - y0)
  }
  g.restore()

  g.save()
  g.textBaseline = 'top'
  g.textAlign = center ? 'center' : 'left'
  const x = center ? S / 2 : pad
  g.fillStyle = light ? '#ffffff' : '#141414'
  if (light) {
    g.shadowColor = 'rgba(0,0,0,0.45)'
    g.shadowBlur = S * 0.02
  }
  g.font = `800 ${size}px ${spec.font}`
  lines.forEach((l, i) => g.fillText(l, x, top + i * lh))
  if (artist) {
    g.font = `500 ${aSize}px ${spec.font}`
    g.globalAlpha = 0.85
    g.fillText(artist, x, top + lines.length * lh + aSize * 0.5, max)
  }
  g.restore()
}

// ---------------------------------------------------------------------------

/** Draw a cover onto a canvas of any size. */
export function drawCover(canvas: HTMLCanvasElement, spec: CoverSpec): void {
  const S = canvas.width
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.save()
  g.clearRect(0, 0, S, S)
  STYLES[spec.style](g, S, spec.palette, rng(spec.seed), spec)
  g.restore()
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.filter = 'none'
  if (spec.grain) grain(g, S)
  drawText(g, S, spec)
}

/** A cover chosen for an album with nothing but its name (bulk creation). */
export function autoSpec(title: string, artist: string, font: string): CoverSpec {
  const h = hashText(`${title}|${artist}`)
  const styles = COVER_STYLES.filter((s) => s.id !== 'photo')
  return {
    style: styles[h % styles.length].id,
    palette: h % 3 === 0 ? PALETTES[h % PALETTES.length].colors : paletteFor(title),
    seed: h,
    title,
    artist,
    textPos: 'bottom',
    upper: false,
    font,
    grain: true
  }
}

/** Render a spec to JPEG bytes, ready to save. */
export async function coverBytes(spec: CoverSpec, size = 1000): Promise<ArrayBuffer> {
  const c = document.createElement('canvas')
  c.width = c.height = size
  drawCover(c, spec)
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92))
  if (!blob) throw new Error('could not encode the cover')
  return blob.arrayBuffer()
}
