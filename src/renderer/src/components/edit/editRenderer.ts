/**
 * Edit renderer — the lyric edit, drawn on a canvas so the preview and the
 * exported video are the exact same pixels.
 *
 * Everything is laid out in a fixed space 1080 wide (1920 / 1350 / 1080 tall
 * for 9:16, 4:5 and 1:1); the caller scales the context (half size for the
 * live preview, 720p or 1080p while exporting).
 *
 *   background — the album cover blurred, an accent gradient or plain dark,
 *                with a vignette and film grain, slowly drifting, plus dust
 *   centre     — a CD, a vinyl record or the cover itself; the discs spin
 *                while their light stays fixed, like under a lamp
 *   lyrics     — word-by-word reveal in one of four looks (glow / bold /
 *                karaoke / minimal), the previous line drifting away and a
 *                chromatic split on the big hits
 *   header     — song title + artist pill and a slim progress line, kept
 *                inside TikTok's safe area
 *
 * Performance: without a GPU every full-frame pass costs ~10 ms at 1080p, so
 * the backdrop, halo, vignette and grain are baked into one layer (redrawn only when
 * the cover, colours, format or size change) and the centre's soft shadow is
 * a cached sprite. A frame is then one big drawImage plus the moving parts.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import type { LrcLine } from '@/utils/lrc'
import { t } from '@/i18n'

export const EDIT_W = 1080

export type EditFormat = '9:16' | '4:5' | '1:1'
export type EditLook = 'glow' | 'bold' | 'karaoke' | 'minimal'
export type EditBg = 'cover' | 'gradient' | 'dark'
export type EditCenter = 'cd' | 'vinyl' | 'cover' | 'none'
export type EditTextSize = 'sm' | 'md' | 'lg'

export const FORMAT_H: Record<EditFormat, number> = { '9:16': 1920, '4:5': 1350, '1:1': 1080 }

export interface EditOptions {
  format: EditFormat
  look: EditLook
  bg: EditBg
  center: EditCenter
  textSize: EditTextSize
  grain: boolean
  dust: boolean
  /** zoom, shake, flash and colour split on the beat */
  beat: boolean
  header: boolean
  watermark: boolean
}

export const DEFAULT_EDIT_OPTIONS: EditOptions = {
  format: '9:16',
  look: 'glow',
  bg: 'cover',
  center: 'cd',
  textSize: 'md',
  grain: true,
  dust: true,
  beat: true,
  header: true,
  watermark: true
}

export interface EditInput {
  time: number
  duration: number
  lines: LrcLine[]
  active: number
  cover: HTMLImageElement | null
  title: string
  artist: string
  accent: [number, number, number]
  F: DirectorFrame | null
  opts: EditOptions
}

const DUST = 38
const MAX_WORDS = 64
const SHADOW_PAD = 150

// Size of the frame being drawn. Set at the top of drawEdit (drawing is
// synchronous) so the helpers below don't need it threaded through.
let W = EDIT_W
let H = FORMAT_H['9:16']

export interface EditState {
  backdrop: HTMLCanvasElement | null
  backdropKey: string
  bg: HTMLCanvasElement | null
  bgKey: string
  shadow: HTMLCanvasElement | null
  shadowKey: string
  grain: HTMLCanvasElement | null
  rainbow: CanvasGradient | null
  glints: CanvasGradient | null
  gradCtx: CanvasRenderingContext2D | null
  dust: Float32Array
  // lyric layout cache
  layoutKey: string
  font: string
  fontNext: string
  lh: number
  wordX: Float32Array
  wordY: Float32Array
  wordW: Float32Array
  wordT: Float32Array
  words: string[]
  wordCount: number
  prevX: Float32Array
  prevY: Float32Array
  prevW: Float32Array
  prevWords: string[]
  prevCount: number
  prevFont: string
  lineIdx: number
  changeAt: number
  hit: number
}

export function createEditState(): EditState {
  const dust = new Float32Array(DUST * 4)
  for (let i = 0; i < DUST; i++) {
    dust[i * 4] = Math.random()
    dust[i * 4 + 1] = Math.random()
    dust[i * 4 + 2] = 0.4 + Math.random() * 0.6
    dust[i * 4 + 3] = Math.random() * Math.PI * 2
  }
  return {
    backdrop: null,
    backdropKey: '',
    bg: null,
    bgKey: '',
    shadow: null,
    shadowKey: '',
    grain: null,
    rainbow: null,
    glints: null,
    gradCtx: null,
    dust,
    layoutKey: '',
    font: '',
    fontNext: '',
    lh: 100,
    wordX: new Float32Array(MAX_WORDS),
    wordY: new Float32Array(MAX_WORDS),
    wordW: new Float32Array(MAX_WORDS),
    wordT: new Float32Array(MAX_WORDS),
    words: [],
    wordCount: 0,
    prevX: new Float32Array(MAX_WORDS),
    prevY: new Float32Array(MAX_WORDS),
    prevW: new Float32Array(MAX_WORDS),
    prevWords: [],
    prevCount: 0,
    prevFont: '',
    lineIdx: -2,
    changeAt: 0,
    hit: 0
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function easeOut(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

/** Rotates an RGB colour's hue by `deg` degrees. */
export function shiftHue([r, g, b]: [number, number, number], deg: number): [number, number, number] {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  // the CSS hue-rotate() matrix
  const m = [
    0.213 + 0.787 * c - 0.213 * s, 0.715 - 0.715 * c - 0.715 * s, 0.072 - 0.072 * c + 0.928 * s,
    0.213 - 0.213 * c + 0.143 * s, 0.715 + 0.285 * c + 0.14 * s, 0.072 - 0.072 * c - 0.283 * s,
    0.213 - 0.213 * c - 0.787 * s, 0.715 - 0.715 * c + 0.715 * s, 0.072 + 0.928 * c + 0.072 * s
  ]
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  return [f(m[0] * r + m[1] * g + m[2] * b), f(m[3] * r + m[4] * g + m[5] * b), f(m[6] * r + m[7] * g + m[8] * b)]
}

// ---------------------------------------------------------------------------
// Layout per format
// ---------------------------------------------------------------------------

interface Layout {
  headerY: number
  cx: number
  cy: number
  R: number
  lyricsY: number
  text: number
  markY: number
}

function layoutFor(o: EditOptions): Layout {
  const none = o.center === 'none'
  const sizeMul = o.textSize === 'sm' ? 0.82 : o.textSize === 'lg' ? 1.18 : 1
  if (o.format === '9:16') {
    return {
      headerY: H * 0.115,
      cx: W / 2,
      cy: H * 0.36,
      R: W * 0.33,
      lyricsY: none ? H * 0.47 : H * 0.69,
      text: sizeMul * (none ? 1.18 : 1),
      markY: H * 0.85
    }
  }
  const square = o.format === '1:1'
  return {
    headerY: square ? 100 : 118,
    cx: W / 2,
    cy: square ? H * 0.42 : H * 0.385,
    R: square ? 196 : 248,
    lyricsY: none ? H * 0.53 : square ? H * 0.785 : H * 0.77,
    text: sizeMul * (none ? 1.1 : square ? 0.84 : 0.92),
    markY: H - 44
  }
}

// ---------------------------------------------------------------------------
// Cached textures and gradients
// ---------------------------------------------------------------------------

function ensureStatics(ctx: CanvasRenderingContext2D, S: EditState): void {
  if (S.gradCtx === ctx && S.rainbow) return
  S.gradCtx = ctx
  if (!S.grain) {
    const g = document.createElement('canvas')
    g.width = 256
    g.height = 256
    const gc = g.getContext('2d')!
    const img = gc.createImageData(256, 256)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    gc.putImageData(img, 0, 0)
    S.grain = g
  }
  // disc light: fixed in screen space while the print rotates under it
  const rb = ctx.createConicGradient(-0.6, 0, 0)
  const hues = [0, 45, 90, 160, 210, 270, 320, 360]
  for (let i = 0; i < hues.length; i++) {
    rb.addColorStop(i / (hues.length - 1), `hsla(${hues[i]}, 100%, 65%, ${i % 2 ? 0.16 : 0.06})`)
  }
  S.rainbow = rb
  const gl = ctx.createConicGradient(-0.9, 0, 0)
  gl.addColorStop(0, 'rgba(255,255,255,0)')
  gl.addColorStop(0.06, 'rgba(255,255,255,0.42)')
  gl.addColorStop(0.13, 'rgba(255,255,255,0)')
  gl.addColorStop(0.5, 'rgba(255,255,255,0)')
  gl.addColorStop(0.56, 'rgba(255,255,255,0.28)')
  gl.addColorStop(0.63, 'rgba(255,255,255,0)')
  gl.addColorStop(1, 'rgba(255,255,255,0)')
  S.glints = gl
}

const coverIds = new WeakMap<HTMLImageElement, number>()
let nextCoverId = 1
function coverId(img: HTMLImageElement | null): number {
  if (!img) return 0
  let id = coverIds.get(img)
  if (!id) {
    id = nextCoverId++
    coverIds.set(img, id)
  }
  return id
}

/** Small, blurred source for the background (cover, gradient or dark). */
function ensureBackdrop(S: EditState, I: EditInput): void {
  const mode = I.opts.bg === 'cover' && !(I.cover && I.cover.naturalWidth) ? 'gradient' : I.opts.bg
  const [ar, ag, ab] = I.accent
  const key = `${mode}|${mode === 'cover' ? coverId(I.cover) : `${ar},${ag},${ab}`}|${W}x${H}`
  if (key === S.backdropKey) return
  S.backdropKey = key
  const c = S.backdrop ?? document.createElement('canvas')
  c.width = 270
  c.height = Math.round((270 * H) / W)
  const bc = c.getContext('2d')!
  bc.filter = 'none'
  bc.globalCompositeOperation = 'source-over'
  bc.clearRect(0, 0, c.width, c.height)
  if (mode === 'cover') {
    const cover = I.cover!
    bc.filter = 'blur(16px) brightness(0.5) saturate(1.35)'
    // cover-fit, overscanned so the blur has no dark edges
    const s = Math.max(c.width / cover.naturalWidth, c.height / cover.naturalHeight) * 1.25
    const w = cover.naturalWidth * s
    const h = cover.naturalHeight * s
    bc.drawImage(cover, (c.width - w) / 2, (c.height - h) / 2, w, h)
  } else if (mode === 'gradient') {
    const second = shiftHue(I.accent, 55)
    const third = shiftHue(I.accent, -50)
    bc.fillStyle = `rgb(${(ar * 0.12) | 0},${(ag * 0.12) | 0},${(ab * 0.14 + 6) | 0})`
    bc.fillRect(0, 0, c.width, c.height)
    const blob = (x: number, y: number, r: number, [cr, cg, cb]: [number, number, number], a: number): void => {
      const g = bc.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`)
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
      bc.fillStyle = g
      bc.fillRect(0, 0, c.width, c.height)
    }
    bc.globalCompositeOperation = 'lighter'
    blob(c.width * 0.25, c.height * 0.2, c.width * 0.9, I.accent, 0.55)
    blob(c.width * 0.85, c.height * 0.55, c.width * 0.8, second, 0.42)
    blob(c.width * 0.3, c.height * 0.9, c.width * 0.75, third, 0.35)
  } else {
    bc.fillStyle = '#060608'
    bc.fillRect(0, 0, c.width, c.height)
    const g = bc.createRadialGradient(c.width / 2, 0, 0, c.width / 2, 0, c.height * 0.7)
    g.addColorStop(0, `rgba(${ar},${ag},${ab},0.16)`)
    g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
    bc.fillStyle = g
    bc.fillRect(0, 0, c.width, c.height)
  }
  bc.filter = 'none'
  bc.globalCompositeOperation = 'source-over'
  S.backdrop = c
  S.bgKey = ''
}

/** Backdrop + accent halo + vignette, baked at output resolution. */
function ensureBackground(S: EditState, I: EditInput, L: Layout, scale: number): void {
  const [ar, ag, ab] = I.accent
  const key = `${S.backdropKey}|${ar},${ag},${ab}|${I.opts.center}|${I.opts.grain}|${scale}`
  if (key === S.bgKey && S.bg) return
  S.bgKey = key
  const c = S.bg ?? document.createElement('canvas')
  c.width = Math.round(W * scale)
  c.height = Math.round(H * scale)
  const bc = c.getContext('2d')!
  bc.setTransform(scale, 0, 0, scale, 0, 0)
  bc.globalCompositeOperation = 'source-over'
  bc.fillStyle = '#050507'
  bc.fillRect(0, 0, W, H)
  if (S.backdrop) {
    bc.globalAlpha = 0.9
    bc.drawImage(S.backdrop, 0, 0, W, H)
    bc.globalAlpha = 1
  }
  // accent halo behind the centre piece (or the lyrics when there is none)
  const none = I.opts.center === 'none'
  const hx = L.cx
  const hy = none ? L.lyricsY : L.cy
  const hr = none ? W * 0.7 : L.R * 1.9
  const halo = bc.createRadialGradient(hx, hy, 0, hx, hy, hr)
  const a = none ? 0.32 : 0.55
  halo.addColorStop(0, `rgba(${ar},${ag},${ab},${a})`)
  halo.addColorStop(0.45, `rgba(${ar},${ag},${ab},${a * 0.33})`)
  halo.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
  bc.globalCompositeOperation = 'lighter'
  bc.fillStyle = halo
  bc.fillRect(0, 0, W, H)
  bc.globalCompositeOperation = 'source-over'
  const v = bc.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.32, W / 2, H * 0.45, Math.max(W, H) * 0.7)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.82)')
  bc.fillStyle = v
  bc.fillRect(0, 0, W, H)
  // film grain, one texel per output pixel. Baked rather than re-rolled each
  // frame: a full-frame overlay pass is the single most expensive thing to
  // draw without a GPU, and the drifting background keeps it alive anyway.
  if (I.opts.grain && S.grain) {
    bc.setTransform(1, 0, 0, 1, 0, 0)
    bc.globalAlpha = 0.09
    bc.globalCompositeOperation = 'overlay'
    bc.fillStyle = bc.createPattern(S.grain, 'repeat')!
    bc.fillRect(0, 0, c.width, c.height)
    bc.globalAlpha = 1
    bc.globalCompositeOperation = 'source-over'
  }
  S.bg = c
}

/** The centre piece's soft contact shadow, as a sprite. */
function ensureShadow(S: EditState, center: EditCenter, R: number, scale: number): void {
  const key = `${center}|${R}|${scale}`
  if (key === S.shadowKey && S.shadow) return
  S.shadowKey = key
  const c = S.shadow ?? document.createElement('canvas')
  const size = (R + SHADOW_PAD) * 2
  c.width = Math.ceil(size * scale)
  c.height = Math.ceil(size * scale)
  const sc = c.getContext('2d')!
  sc.setTransform(scale, 0, 0, scale, 0, 0)
  sc.clearRect(0, 0, size, size)
  sc.shadowColor = 'rgba(0,0,0,0.75)'
  sc.shadowBlur = 90 * scale
  sc.shadowOffsetY = 46 * scale
  sc.fillStyle = '#0a0a0d'
  sc.beginPath()
  if (center === 'cover') sc.roundRect(SHADOW_PAD, SHADOW_PAD, R * 2, R * 2, 28)
  else sc.arc(R + SHADOW_PAD, R + SHADOW_PAD, R, 0, Math.PI * 2)
  sc.fill()
  S.shadow = c
}

// ---------------------------------------------------------------------------
// Lyric layout
// ---------------------------------------------------------------------------

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif"

function fontFor(look: EditLook, mul: number): { font: string; lh: number } {
  switch (look) {
    case 'bold':
      return { font: `900 ${Math.round(92 * mul)}px 'Segoe UI Black', 'Segoe UI', 'Arial Black', system-ui, sans-serif`, lh: 104 * mul }
    case 'karaoke':
      return { font: `800 ${Math.round(80 * mul)}px ${SANS}`, lh: 98 * mul }
    case 'minimal':
      return { font: `500 ${Math.round(66 * mul)}px ${SANS}`, lh: 82 * mul }
    default:
      return { font: `italic 400 ${Math.round(88 * mul)}px ${SERIF}`, lh: 106 * mul }
  }
}

function caseFor(look: EditLook, w: string): string {
  return look === 'bold' ? w.toUpperCase() : look === 'minimal' ? w.toLowerCase() : w
}

/** Lays the active line out word by word (wrapped, centred) and times each word. */
function layoutLine(ctx: CanvasRenderingContext2D, S: EditState, I: EditInput, L: Layout): void {
  const line = I.lines[I.active]
  const look = I.opts.look
  const key = `${I.active}|${look}|${L.text}|${L.lyricsY}|${line?.text ?? ''}`
  if (key === S.layoutKey) return
  const sameLine = S.layoutKey.split('|')[0] === String(I.active)
  // keep the outgoing line for its exit animation (not when only the style changed)
  if (!sameLine) {
    S.prevCount = S.wordCount
    for (let i = 0; i < S.wordCount; i++) {
      S.prevX[i] = S.wordX[i]
      S.prevY[i] = S.wordY[i]
      S.prevW[i] = S.wordW[i]
    }
    S.prevWords = S.words
    S.prevFont = S.font
  }
  S.layoutKey = key
  const f = fontFor(look, L.text)
  S.font = f.font
  S.lh = f.lh
  S.fontNext = `italic 400 ${Math.round(44 * L.text)}px ${SERIF}`
  if (!line) {
    S.words = []
    S.wordCount = 0
    return
  }
  const raw = line.text.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS)
  const words = raw.map((w) => caseFor(look, w))
  ctx.font = S.font
  const space = ctx.measureText(' ').width
  const maxW = W * 0.8
  // greedy wrap into rows
  const rowStart: number[] = [0]
  let rowW = 0
  for (let i = 0; i < words.length; i++) {
    const w = ctx.measureText(words[i]).width
    S.wordW[i] = w
    const add = rowW === 0 ? w : rowW + space + w
    if (add > maxW && rowW > 0) {
      rowStart.push(i)
      rowW = w
    } else rowW = add
  }
  const rows = rowStart.length
  const top = L.lyricsY - ((rows - 1) * S.lh) / 2
  for (let r = 0; r < rows; r++) {
    const a = rowStart[r]
    const b = r + 1 < rows ? rowStart[r + 1] : words.length
    let w = 0
    for (let i = a; i < b; i++) w += S.wordW[i] + (i > a ? space : 0)
    let x = W / 2 - w / 2
    for (let i = a; i < b; i++) {
      S.wordX[i] = x + S.wordW[i] / 2
      S.wordY[i] = top + r * S.lh
      x += S.wordW[i] + space
    }
  }
  // word timing: enhanced LRC when it matches, else spread over the line by length
  const start = line.time
  const next = I.lines[I.active + 1]?.time ?? start + 4
  const span = Math.max(0.6, Math.min(next - start, 8)) * 0.8
  if (line.words && line.words.length === words.length) {
    for (let i = 0; i < words.length; i++) S.wordT[i] = line.words[i].time
  } else {
    let total = 0
    for (let i = 0; i < words.length; i++) total += raw[i].length + 1
    let acc = 0
    for (let i = 0; i < words.length; i++) {
      S.wordT[i] = start + (acc / Math.max(1, total)) * span
      acc += raw[i].length + 1
    }
  }
  S.words = words
  S.wordCount = words.length
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

export function drawEdit(ctx: CanvasRenderingContext2D, S: EditState, I: EditInput, scale: number): void {
  const o = I.opts
  W = EDIT_W
  H = FORMAT_H[o.format]
  const L = layoutFor(o)
  ensureStatics(ctx, S)
  ensureBackdrop(S, I)
  ensureBackground(S, I, L, scale)
  const t = I.time
  const F = o.beat ? I.F : null
  const kick = F ? F.kickTick : 0
  if (F && F.impactHit && F.impactLevel >= 3) S.hit = 1
  S.hit = o.beat ? Math.max(0, S.hit - 0.06) : 0

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  // camera: micro zoom on the kick, a little shake on the big hits
  ctx.save()
  const zoom = 1 + kick * 0.012 + S.hit * 0.02
  const shakeX = S.hit > 0.2 ? Math.sin(t * 80) * 6 * S.hit : 0
  ctx.translate(W / 2 + shakeX, H / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-W / 2, -H / 2)

  // baked background, slowly drifting (overscanned so no edge shows)
  const drift = 1.08 + Math.sin(t * 0.07) * 0.03
  const bw = W * drift
  const bh = H * drift
  ctx.drawImage(S.bg!, (W - bw) / 2 + Math.sin(t * 0.05) * 24, (H - bh) / 2, bw, bh)

  if (o.dust) drawDust(ctx, S, t, kick)
  if (o.center !== 'none') {
    const y = L.cy + Math.sin(t * 0.7) * 10
    const pulse = 1 + kick * 0.015
    ensureShadow(S, o.center, L.R, scale)
    const size = (L.R + SHADOW_PAD) * 2 * pulse
    ctx.drawImage(S.shadow!, L.cx - size / 2, y - size / 2, size, size)
    ctx.save()
    ctx.translate(L.cx, y)
    ctx.scale(pulse, pulse)
    if (o.center === 'cd') drawCD(ctx, S, I, L.R)
    else if (o.center === 'vinyl') drawVinyl(ctx, S, I, L.R)
    else drawCoverCard(ctx, I, L.R)
    ctx.restore()
  }
  drawLyrics(ctx, S, I, L)
  if (o.header) drawHeader(ctx, I, L.headerY)
  if (o.watermark) drawWatermark(ctx, L.markY)
  ctx.restore()

  // flash on the big hits
  if (S.hit > 0.01) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = `rgba(255,255,255,${S.hit * 0.18})`
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'
  }
}

function drawDust(ctx: CanvasRenderingContext2D, S: EditState, t: number, kick: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = '#fff'
  const d = S.dust
  for (let i = 0; i < DUST; i++) {
    const o = i * 4
    const depth = d[o + 2]
    const y = (((d[o + 1] - t * 0.012 * depth) % 1) + 1) % 1
    const x = d[o] + Math.sin(t * 0.3 + d[o + 3]) * 0.02
    const tw = Math.sin(t * 1.3 + d[o + 3] * 3) * 0.5 + 0.5
    ctx.globalAlpha = (0.08 + tw * 0.22 + kick * 0.1) * depth
    const s = 2 + depth * 4
    ctx.beginPath()
    ctx.arc(x * W, y * H, s, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Cover (or an accent placeholder) as a square of side 2r centred on 0,0. */
function drawPrint(ctx: CanvasRenderingContext2D, I: EditInput, r: number): void {
  const c = I.cover
  if (c && c.naturalWidth) {
    const side = Math.min(c.naturalWidth, c.naturalHeight)
    ctx.drawImage(c, (c.naturalWidth - side) / 2, (c.naturalHeight - side) / 2, side, side, -r, -r, r * 2, r * 2)
  } else {
    const [ar, ag, ab] = I.accent
    ctx.fillStyle = `rgb(${ar >> 1},${ag >> 1},${ab >> 1})`
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `italic 400 ${Math.round(r * 0.18)}px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', 0, -r * 0.55)
  }
}

function drawCD(ctx: CanvasRenderingContext2D, S: EditState, I: EditInput, R: number): void {
  const angle = I.time * 0.75 // ~43°/s, calm like the original
  // the print, spinning
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.clip()
  ctx.save()
  ctx.rotate(angle)
  drawPrint(ctx, I, R)
  ctx.restore()

  // grooves
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let r = R * 0.38; r < R * 0.97; r += 7) {
    ctx.moveTo(r, 0)
    ctx.arc(0, 0, r, 0, Math.PI * 2)
  }
  ctx.stroke()
  // the light stays put while the disc turns: rainbow + two glints
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = S.rainbow!
  ctx.fillRect(-R, -R, R * 2, R * 2)
  ctx.fillStyle = S.glints!
  ctx.fillRect(-R, -R, R * 2, R * 2)
  ctx.globalCompositeOperation = 'source-over'
  // clear outer edge
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.arc(0, 0, R * 0.965, 0, Math.PI * 2, true)
  ctx.fillStyle = 'rgba(220,230,255,0.22)'
  ctx.fill()
  ctx.restore()

  // hub: clear plastic ring, stacking ring and the hole
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2)
  ctx.arc(0, 0, R * 0.075, 0, Math.PI * 2, true)
  ctx.fillStyle = 'rgba(12,12,18,0.55)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.21, 0, Math.PI * 2)
  ctx.stroke()
  drawHole(ctx, R)
}

function drawHole(ctx: CanvasRenderingContext2D, R: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.075, 0, Math.PI * 2)
  ctx.fillStyle = '#030305'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 2
  ctx.stroke()
  // rim light
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, 0, R, Math.PI * 1.05, Math.PI * 1.6)
  ctx.stroke()
}

/** Black vinyl with the cover as its centre label. */
function drawVinyl(ctx: CanvasRenderingContext2D, S: EditState, I: EditInput, R: number): void {
  const angle = I.time * 1.2
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.fillStyle = '#0c0c0f'
  ctx.fill()
  // fine grooves, with a couple of track gaps
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (let r = R * 0.4; r < R * 0.96; r += 4.5) {
    ctx.moveTo(r, 0)
    ctx.arc(0, 0, r, 0, Math.PI * 2)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 3
  ctx.beginPath()
  for (const f of [0.55, 0.71, 0.84]) {
    ctx.moveTo(R * f, 0)
    ctx.arc(0, 0, R * f, 0, Math.PI * 2)
  }
  ctx.stroke()
  // sheen: two fixed highlights sweeping across the grooves
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.clip()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.55
  ctx.fillStyle = S.glints!
  ctx.fillRect(-R, -R, R * 2, R * 2)
  ctx.restore()
  // label: the cover, spinning
  const lr = R * 0.36
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, lr, 0, Math.PI * 2)
  ctx.clip()
  ctx.rotate(angle)
  drawPrint(ctx, I, lr)
  ctx.restore()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, lr, 0, Math.PI * 2)
  ctx.stroke()
  // spindle
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.03, 0, Math.PI * 2)
  ctx.fillStyle = '#d8d8de'
  ctx.fill()
  // rim light
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, 0, R - 1, Math.PI * 1.05, Math.PI * 1.6)
  ctx.stroke()
}

/** The cover itself, as a card swaying gently. */
function drawCoverCard(ctx: CanvasRenderingContext2D, I: EditInput, R: number): void {
  ctx.rotate(Math.sin(I.time * 0.6) * 0.03)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(-R, -R, R * 2, R * 2, 28)
  ctx.clip()
  drawPrint(ctx, I, R)
  // soft top light
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.18 + Math.sin(I.time * 0.6) * 0.06
  ctx.fillStyle = 'rgb(255,255,255)'
  ctx.beginPath()
  ctx.moveTo(-R, -R)
  ctx.lineTo(R * 0.4, -R)
  ctx.lineTo(-R, R * 0.4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(-R, -R, R * 2, R * 2, 28)
  ctx.stroke()
}

function drawWord(
  ctx: CanvasRenderingContext2D,
  I: EditInput,
  word: string,
  x: number,
  y: number,
  alpha: number,
  pop: number,
  current: boolean,
  split: number
): void {
  const [ar, ag, ab] = I.accent
  const look = I.opts.look
  ctx.save()
  ctx.translate(x, y)
  if (pop !== 1) ctx.scale(pop, pop)
  if (split > 0.05) {
    // chromatic split on the big hits
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * split * 0.8
    ctx.fillStyle = 'rgb(255,40,80)'
    ctx.fillText(word, -10 * split, 0)
    ctx.fillStyle = 'rgb(40,220,255)'
    ctx.fillText(word, 10 * split, 0)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = alpha
  if (look === 'bold') {
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(word, 0, 0)
    ctx.fillStyle = current ? `rgb(${ar},${ag},${ab})` : '#ffffff'
    ctx.fillText(word, 0, 0)
  } else if (look === 'glow') {
    ctx.shadowColor = `rgba(${ar},${ag},${ab},0.9)`
    ctx.shadowBlur = 60
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillText(word, 0, 0)
    ctx.shadowColor = 'rgba(255,255,255,0.6)'
    ctx.shadowBlur = 18
    ctx.fillText(word, 0, 0)
  } else if (look === 'karaoke') {
    ctx.lineWidth = 8
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.strokeText(word, 0, 0)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(word, 0, 0)
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 12
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillText(word, 0, 0)
  }
  ctx.restore()
}

/** Karaoke: the sung part of a word fills with the accent, left to right. */
function drawKaraokeFill(
  ctx: CanvasRenderingContext2D,
  I: EditInput,
  word: string,
  x: number,
  y: number,
  w: number,
  lh: number,
  k: number
): void {
  if (k <= 0) return
  const [ar, ag, ab] = I.accent
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - w / 2 - 6, y - lh, (w + 12) * k, lh * 2)
  ctx.clip()
  ctx.fillStyle = `rgb(${ar},${ag},${ab})`
  ctx.fillText(word, x, y)
  ctx.restore()
}

function drawLyrics(ctx: CanvasRenderingContext2D, S: EditState, I: EditInput, L: Layout): void {
  const t = I.time
  const look = I.opts.look
  if (I.active !== S.lineIdx) {
    S.lineIdx = I.active
    S.changeAt = t
  }
  layoutLine(ctx, S, I, L)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const since = Math.abs(t - S.changeAt)
  const split = S.hit

  // outgoing line drifts up and fades
  const out = 1 - clamp01(since / 0.35)
  if (out > 0 && S.prevCount > 0) {
    ctx.font = S.prevFont || S.font
    for (let i = 0; i < S.prevCount; i++) {
      drawWord(ctx, I, S.prevWords[i], S.prevX[i], S.prevY[i] - (1 - out) * 50, out * 0.8, 1, false, 0)
    }
  }
  ctx.font = S.font

  if (S.wordCount === 0) {
    // instrumental: a soft breathing note
    const a = 0.35 + Math.sin(t * 2) * 0.15
    drawWord(ctx, I, '♪', W / 2, L.lyricsY, a * (1 - out), 1, false, 0)
    return
  }

  const line = I.lines[I.active]
  const enter = easeOut(clamp01((t - line.time + 0.05) / 0.4))
  for (let i = 0; i < S.wordCount; i++) {
    let a: number
    let pop = 1
    let dy = 0
    const nextT = i + 1 < S.wordCount ? S.wordT[i + 1] : Infinity
    if (look === 'minimal') {
      a = easeOut(clamp01((t - line.time + 0.05) / 0.45))
      dy = (1 - a) * 18
    } else if (look === 'karaoke') {
      // the whole line slides in, then each word fills as it is sung
      a = enter
      dy = (1 - enter) * 22
      drawWord(ctx, I, S.words[i], S.wordX[i], S.wordY[i] + dy, a, 1, false, split)
      const end = Math.min(nextT, S.wordT[i] + 1.2)
      const k = clamp01((t - S.wordT[i]) / Math.max(0.12, end - S.wordT[i]))
      ctx.globalAlpha = a
      drawKaraokeFill(ctx, I, S.words[i], S.wordX[i], S.wordY[i] + dy, S.wordW[i], S.lh / 2, k)
      ctx.globalAlpha = 1
      continue
    } else {
      const k = clamp01((t - S.wordT[i] + 0.06) / (look === 'bold' ? 0.16 : 0.32))
      if (look === 'bold') {
        // the whole line stays readable (and centred), words light up as sung
        a = 0.28 + easeOut(k) * 0.72
        pop = k > 0 ? 1 + (1 - easeOut(k)) * 0.35 : 1
      } else {
        if (k <= 0) continue
        a = easeOut(k)
        dy = (1 - a) * 26
      }
    }
    const current = t >= S.wordT[i] && t < nextT
    drawWord(ctx, I, S.words[i], S.wordX[i], S.wordY[i] + dy, a, pop, current, split)
  }

  // the line to come, faint, under the glow and karaoke looks
  if (look === 'glow' || look === 'karaoke') {
    const nxt = I.lines[I.active + 1]
    if (nxt) {
      ctx.font = S.fontNext
      ctx.globalAlpha = 0.28 * clamp01(since / 0.5)
      ctx.fillStyle = '#ffffff'
      const lastY = S.wordY[S.wordCount - 1]
      ctx.fillText(clip(ctx, nxt.text, W * 0.8), W / 2, lastY + S.lh)
      ctx.globalAlpha = 1
    }
  }
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}

function drawHeader(ctx: CanvasRenderingContext2D, I: EditInput, y: number): void {
  // title pill (below TikTok's top tabs on 9:16)
  ctx.font = `600 38px ${SANS}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const title = clip(ctx, I.title, W * 0.6)
  const tw = ctx.measureText(title).width
  ctx.font = `400 32px ${SANS}`
  const artist = clip(ctx, I.artist, W * 0.6)
  const aw = ctx.measureText(artist).width
  const w = Math.max(tw, aw) + 140
  const x = (W - w) / 2
  ctx.fillStyle = 'rgba(0,0,0,0.38)'
  ctx.beginPath()
  ctx.roundRect(x, y - 62, w, 124, 62)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()
  // note badge
  const [ar, ag, ab] = I.accent
  ctx.fillStyle = `rgb(${ar},${ag},${ab})`
  ctx.beginPath()
  ctx.arc(x + 62, y, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `700 36px 'Segoe UI Symbol', ${SANS}`
  ctx.textAlign = 'center'
  ctx.fillText('♪', x + 62, y + 2)
  ctx.textAlign = 'left'
  ctx.font = `600 38px ${SANS}`
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fillText(title, x + 112, y - 20)
  ctx.font = `400 32px ${SANS}`
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.fillText(artist, x + 112, y + 24)

  // progress line
  const p = I.duration > 0 ? clamp01(I.time / I.duration) : 0
  const px = W * 0.2
  const pw = W * 0.6
  const py = y + 100
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fillRect(px, py, pw, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(px, py, pw * p, 4)
  ctx.beginPath()
  ctx.arc(px + pw * p, py + 2, 8, 0, Math.PI * 2)
  ctx.fill()
}

function drawWatermark(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.font = `600 26px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 0.5
  ctx.fillStyle = '#ffffff'
  ctx.fillText(t('♪  feito com Harmony'), W / 2, y)
  ctx.globalAlpha = 1
}

