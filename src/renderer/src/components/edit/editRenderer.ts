/**
 * Edit renderer — the vertical (9:16) lyric edit, drawn on a canvas so the
 * preview and the exported video are the exact same pixels.
 *
 * Everything is laid out in a fixed 1080 x 1920 space; the caller scales the
 * context (half size for the live preview, full size while exporting).
 *
 *   background — the album cover, blurred, darkened and slowly drifting,
 *                film grain, floating dust and a vignette
 *   disc       — an opaque CD printed with the cover: it spins while the
 *                light (iridescent rainbow + white glints) stays fixed, like
 *                a real disc under a lamp; it pulses gently on the kick
 *   lyrics     — word-by-word reveal in one of three looks (glow / bold /
 *                minimal), with the previous line drifting away and a
 *                chromatic split on the big hits
 *   header     — song title + artist pill and a slim progress line, kept
 *                inside TikTok's safe area
 */
import type { DirectorFrame } from '@/services/stageDirector'
import type { LrcLine } from '@/utils/lrc'

export const EDIT_W = 1080
export const EDIT_H = 1920

export type EditLook = 'glow' | 'bold' | 'minimal'

export interface EditInput {
  time: number
  duration: number
  lines: LrcLine[]
  active: number
  cover: HTMLImageElement | null
  title: string
  artist: string
  look: EditLook
  accent: [number, number, number]
  F: DirectorFrame | null
}

const DUST = 38
const MAX_WORDS = 64

export interface EditState {
  // cover backdrop (blurred once per cover)
  backdrop: HTMLCanvasElement | null
  backdropFor: HTMLImageElement | null | undefined
  grain: HTMLCanvasElement | null
  grainPattern: CanvasPattern | null
  vignette: CanvasGradient | null
  haloKey: string
  halo: CanvasGradient | null
  rainbow: CanvasGradient | null
  glints: CanvasGradient | null
  gradCtx: CanvasRenderingContext2D | null
  dust: Float32Array
  // lyric layout cache
  layoutKey: string
  wordX: Float32Array
  wordY: Float32Array
  wordW: Float32Array
  wordT: Float32Array
  words: string[]
  wordCount: number
  prevKey: string
  prevX: Float32Array
  prevY: Float32Array
  prevWords: string[]
  prevCount: number
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
    backdropFor: undefined,
    grain: null,
    grainPattern: null,
    vignette: null,
    haloKey: '',
    halo: null,
    rainbow: null,
    glints: null,
    gradCtx: null,
    dust,
    layoutKey: '',
    wordX: new Float32Array(MAX_WORDS),
    wordY: new Float32Array(MAX_WORDS),
    wordW: new Float32Array(MAX_WORDS),
    wordT: new Float32Array(MAX_WORDS),
    words: [],
    wordCount: 0,
    prevKey: '',
    prevX: new Float32Array(MAX_WORDS),
    prevY: new Float32Array(MAX_WORDS),
    prevWords: [],
    prevCount: 0,
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

// ---------------------------------------------------------------------------
// Cached textures and gradients
// ---------------------------------------------------------------------------

function ensureStatics(ctx: CanvasRenderingContext2D, S: EditState): void {
  if (S.gradCtx === ctx && S.grainPattern) return
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
  S.grainPattern = ctx.createPattern(S.grain, 'repeat')
  const v = ctx.createRadialGradient(EDIT_W / 2, EDIT_H * 0.45, EDIT_W * 0.35, EDIT_W / 2, EDIT_H * 0.45, EDIT_H * 0.72)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.78)')
  S.vignette = v
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
  S.haloKey = ''
}

function ensureBackdrop(S: EditState, cover: HTMLImageElement | null): void {
  if (S.backdropFor === cover) return
  S.backdropFor = cover
  if (!cover || !cover.naturalWidth) {
    S.backdrop = null
    return
  }
  const c = S.backdrop ?? document.createElement('canvas')
  c.width = 270
  c.height = 480
  const bc = c.getContext('2d')!
  bc.clearRect(0, 0, c.width, c.height)
  bc.filter = 'blur(16px) brightness(0.5) saturate(1.35)'
  // cover-fit, overscanned so the blur has no dark edges
  const s = Math.max(c.width / cover.naturalWidth, c.height / cover.naturalHeight) * 1.25
  const w = cover.naturalWidth * s
  const h = cover.naturalHeight * s
  bc.drawImage(cover, (c.width - w) / 2, (c.height - h) / 2, w, h)
  bc.filter = 'none'
  S.backdrop = c
}

// ---------------------------------------------------------------------------
// Lyric layout
// ---------------------------------------------------------------------------

const FONT_GLOW = "italic 400 88px Georgia, 'Iowan Old Style', 'Times New Roman', serif"
const FONT_BOLD = "900 92px 'Segoe UI Black', 'Segoe UI', 'Arial Black', system-ui, sans-serif"
const FONT_MIN = "500 66px 'Segoe UI', system-ui, -apple-system, sans-serif"
const FONT_NEXT = "italic 400 44px Georgia, 'Times New Roman', serif"

function fontFor(look: EditLook): string {
  return look === 'bold' ? FONT_BOLD : look === 'minimal' ? FONT_MIN : FONT_GLOW
}

function lineHeight(look: EditLook): number {
  return look === 'bold' ? 104 : look === 'minimal' ? 82 : 106
}

function caseFor(look: EditLook, w: string): string {
  return look === 'bold' ? w.toUpperCase() : look === 'minimal' ? w.toLowerCase() : w
}

/** Lays the active line out word by word (wrapped, centred) and times each word. */
function layoutLine(ctx: CanvasRenderingContext2D, S: EditState, I: EditInput, centerY: number): void {
  const line = I.lines[I.active]
  const key = `${I.active}|${I.look}|${line?.text ?? ''}`
  if (key === S.layoutKey) return
  // keep the outgoing line for its exit animation
  S.prevKey = S.layoutKey
  S.prevCount = S.wordCount
  for (let i = 0; i < S.wordCount; i++) {
    S.prevX[i] = S.wordX[i]
    S.prevY[i] = S.wordY[i]
  }
  S.prevWords = S.words
  S.layoutKey = key
  if (!line) {
    S.words = []
    S.wordCount = 0
    return
  }
  const raw = line.text.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS)
  const words = raw.map((w) => caseFor(I.look, w))
  ctx.font = fontFor(I.look)
  const space = ctx.measureText(' ').width
  const maxW = EDIT_W * 0.8
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
  const lh = lineHeight(I.look)
  const rows = rowStart.length
  const top = centerY - ((rows - 1) * lh) / 2
  for (let r = 0; r < rows; r++) {
    const a = rowStart[r]
    const b = r + 1 < rows ? rowStart[r + 1] : words.length
    let w = 0
    for (let i = a; i < b; i++) w += S.wordW[i] + (i > a ? space : 0)
    let x = EDIT_W / 2 - w / 2
    for (let i = a; i < b; i++) {
      S.wordX[i] = x + S.wordW[i] / 2
      S.wordY[i] = top + r * lh
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
  ensureStatics(ctx, S)
  ensureBackdrop(S, I.cover)
  const t = I.time
  const F = I.F
  const kick = F ? F.kickTick : 0
  const [ar, ag, ab] = I.accent
  if (F && F.impactHit && F.impactLevel >= 3) S.hit = 1
  S.hit = Math.max(0, S.hit - 0.06)

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#050507'
  ctx.fillRect(0, 0, EDIT_W, EDIT_H)

  // camera: micro zoom on the kick, a little shake on the big hits
  ctx.save()
  const zoom = 1 + kick * 0.012 + S.hit * 0.02
  const shakeX = S.hit > 0.2 ? Math.sin(t * 80) * 6 * S.hit : 0
  ctx.translate(EDIT_W / 2 + shakeX, EDIT_H / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-EDIT_W / 2, -EDIT_H / 2)

  // backdrop: the cover, blurred and slowly drifting
  if (S.backdrop) {
    const drift = 1.12 + Math.sin(t * 0.07) * 0.04
    const w = EDIT_W * drift
    const h = EDIT_H * drift
    ctx.globalAlpha = 0.9
    ctx.drawImage(S.backdrop, (EDIT_W - w) / 2 + Math.sin(t * 0.05) * 30, (EDIT_H - h) / 2, w, h)
    ctx.globalAlpha = 1
  }
  // accent halo behind the disc
  const discX = EDIT_W / 2
  const discY = EDIT_H * 0.36
  const R = EDIT_W * 0.33
  const haloKey = `${ar},${ag},${ab}`
  if (haloKey !== S.haloKey) {
    S.haloKey = haloKey
    const h = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    h.addColorStop(0, `rgba(${ar},${ag},${ab},0.55)`)
    h.addColorStop(0.45, `rgba(${ar},${ag},${ab},0.18)`)
    h.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
    S.halo = h
  }
  ctx.save()
  ctx.translate(discX, discY)
  const hr = R * (1.9 + kick * 0.08)
  ctx.scale(hr, hr)
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = S.halo!
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()

  drawDust(ctx, S, t, kick)
  drawDisc(ctx, S, I, discX, discY + Math.sin(t * 0.7) * 10, R, kick)
  drawLyrics(ctx, S, I, EDIT_H * 0.69)
  drawHeader(ctx, I)
  ctx.restore()

  // flash on the big hits
  if (S.hit > 0.01) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = `rgba(255,255,255,${S.hit * 0.18})`
    ctx.fillRect(0, 0, EDIT_W, EDIT_H)
    ctx.globalCompositeOperation = 'source-over'
  }
  // vignette + grain
  ctx.fillStyle = S.vignette!
  ctx.fillRect(0, 0, EDIT_W, EDIT_H)
  if (S.grainPattern) {
    ctx.save()
    ctx.globalAlpha = 0.07
    ctx.globalCompositeOperation = 'overlay'
    ctx.translate(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256))
    ctx.fillStyle = S.grainPattern
    ctx.fillRect(-256, -256, EDIT_W + 512, EDIT_H + 512)
    ctx.restore()
  }
}

function drawDust(ctx: CanvasRenderingContext2D, S: EditState, t: number, kick: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const d = S.dust
  for (let i = 0; i < DUST; i++) {
    const o = i * 4
    const depth = d[o + 2]
    const y = (((d[o + 1] - t * 0.012 * depth) % 1) + 1) % 1
    const x = d[o] + Math.sin(t * 0.3 + d[o + 3]) * 0.02
    const tw = Math.sin(t * 1.3 + d[o + 3] * 3) * 0.5 + 0.5
    ctx.globalAlpha = (0.08 + tw * 0.22 + kick * 0.1) * depth
    ctx.fillStyle = '#fff'
    const s = 2 + depth * 4
    ctx.beginPath()
    ctx.arc(x * EDIT_W, y * EDIT_H, s, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawDisc(
  ctx: CanvasRenderingContext2D,
  S: EditState,
  I: EditInput,
  x: number,
  y: number,
  R: number,
  kick: number
): void {
  const angle = I.time * 0.75 // ~43°/s, calm like the original
  ctx.save()
  ctx.translate(x, y)
  const pulse = 1 + kick * 0.015
  ctx.scale(pulse, pulse)

  // contact shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.75)'
  ctx.shadowBlur = 90
  ctx.shadowOffsetY = 46
  ctx.fillStyle = '#0a0a0d'
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // the print, spinning
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.clip()
  ctx.save()
  ctx.rotate(angle)
  const c = I.cover
  if (c && c.naturalWidth) {
    const side = Math.min(c.naturalWidth, c.naturalHeight)
    ctx.drawImage(c, (c.naturalWidth - side) / 2, (c.naturalHeight - side) / 2, side, side, -R, -R, R * 2, R * 2)
  } else {
    const [ar, ag, ab] = I.accent
    ctx.fillStyle = `rgb(${ar >> 1},${ag >> 1},${ab >> 1})`
    ctx.fillRect(-R, -R, R * 2, R * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = "italic 400 64px Georgia, 'Times New Roman', serif"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', 0, -R * 0.55)
  }
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
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.075, 0, Math.PI * 2)
  ctx.fillStyle = '#030305'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.stroke()
  // rim light
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, 0, R, Math.PI * 1.05, Math.PI * 1.6)
  ctx.stroke()
  ctx.restore()
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
  if (I.look === 'bold') {
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(word, 0, 0)
    ctx.fillStyle = current ? `rgb(${ar},${ag},${ab})` : '#ffffff'
    ctx.fillText(word, 0, 0)
  } else if (I.look === 'glow') {
    ctx.shadowColor = `rgba(${ar},${ag},${ab},0.9)`
    ctx.shadowBlur = 60
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillText(word, 0, 0)
    ctx.shadowColor = 'rgba(255,255,255,0.6)'
    ctx.shadowBlur = 18
    ctx.fillText(word, 0, 0)
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 12
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillText(word, 0, 0)
  }
  ctx.restore()
}

function drawLyrics(ctx: CanvasRenderingContext2D, S: EditState, I: EditInput, centerY: number): void {
  const t = I.time
  if (I.active !== S.lineIdx) {
    S.lineIdx = I.active
    S.changeAt = t
  }
  layoutLine(ctx, S, I, centerY)
  ctx.font = fontFor(I.look)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const since = Math.abs(t - S.changeAt)
  const split = S.hit

  // outgoing line drifts up and fades
  const out = 1 - clamp01(since / 0.35)
  if (out > 0 && S.prevCount > 0) {
    for (let i = 0; i < S.prevCount; i++) {
      drawWord(ctx, I, S.prevWords[i], S.prevX[i], S.prevY[i] - (1 - out) * 50, out * 0.8, 1, false, 0)
    }
  }

  if (S.wordCount === 0) {
    // instrumental: a soft breathing note
    const a = 0.35 + Math.sin(t * 2) * 0.15
    drawWord(ctx, I, '♪', EDIT_W / 2, centerY, a * (1 - out), 1, false, 0)
    return
  }

  const line = I.lines[I.active]
  for (let i = 0; i < S.wordCount; i++) {
    let a: number
    let pop = 1
    let dy = 0
    if (I.look === 'minimal') {
      a = easeOut(clamp01((t - line.time + 0.05) / 0.45))
      dy = (1 - a) * 18
    } else {
      const k = clamp01((t - S.wordT[i] + 0.06) / (I.look === 'bold' ? 0.16 : 0.32))
      if (I.look === 'bold') {
        // the whole line stays readable (and centred), words light up as sung
        a = 0.28 + easeOut(k) * 0.72
        pop = k > 0 ? 1 + (1 - easeOut(k)) * 0.35 : 1
      } else {
        if (k <= 0) continue
        a = easeOut(k)
        dy = (1 - a) * 26
      }
    }
    const nextT = i + 1 < S.wordCount ? S.wordT[i + 1] : Infinity
    const current = t >= S.wordT[i] && t < nextT
    drawWord(ctx, I, S.words[i], S.wordX[i], S.wordY[i] + dy, a, pop, current, split)
  }

  // the line to come, faint, under the glow look
  if (I.look === 'glow') {
    const nxt = I.lines[I.active + 1]
    if (nxt) {
      ctx.font = FONT_NEXT
      ctx.globalAlpha = 0.28 * clamp01(since / 0.5)
      ctx.fillStyle = '#ffffff'
      const lastY = S.wordY[S.wordCount - 1]
      ctx.fillText(clip(ctx, nxt.text, EDIT_W * 0.8), EDIT_W / 2, lastY + 110)
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

function drawHeader(ctx: CanvasRenderingContext2D, I: EditInput): void {
  // title pill below TikTok's top tabs
  const y = EDIT_H * 0.115
  ctx.font = "600 38px 'Segoe UI', system-ui, sans-serif"
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const title = clip(ctx, I.title, EDIT_W * 0.6)
  const tw = ctx.measureText(title).width
  ctx.font = "400 32px 'Segoe UI', system-ui, sans-serif"
  const artist = clip(ctx, I.artist, EDIT_W * 0.6)
  const aw = ctx.measureText(artist).width
  const w = Math.max(tw, aw) + 140
  const x = (EDIT_W - w) / 2
  ctx.fillStyle = 'rgba(0,0,0,0.38)'
  ctx.beginPath()
  ctx.roundRect(x, y - 62, w, 124, 62)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()
  // spinning note badge
  const [ar, ag, ab] = I.accent
  ctx.fillStyle = `rgb(${ar},${ag},${ab})`
  ctx.beginPath()
  ctx.arc(x + 62, y, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = "700 36px 'Segoe UI Symbol', 'Segoe UI', system-ui, sans-serif"
  ctx.textAlign = 'center'
  ctx.fillText('♪', x + 62, y + 2)
  ctx.textAlign = 'left'
  ctx.font = "600 38px 'Segoe UI', system-ui, sans-serif"
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fillText(title, x + 112, y - 20)
  ctx.font = "400 32px 'Segoe UI', system-ui, sans-serif"
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.fillText(artist, x + 112, y + 24)

  // progress line
  const p = I.duration > 0 ? clamp01(I.time / I.duration) : 0
  const px = EDIT_W * 0.2
  const pw = EDIT_W * 0.6
  const py = y + 100
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fillRect(px, py, pw, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(px, py, pw * p, 4)
  ctx.beginPath()
  ctx.arc(px + pw * p, py + 2, 8, 0, Math.PI * 2)
  ctx.fill()
}
