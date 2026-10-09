import type { World, WorldContext } from './types'
import { canvasDpr } from '@/utils/perf'

/**
 * 🟩 Code Rain — falling green code, in three depths.
 *
 * Columns of glyphs pour down the screen: small and dim far away, big and
 * bright up close, each led by a white-hot head and leaving a trail that
 * fades; glyphs in the trails flicker into other glyphs. The glyphs are drawn
 * by the world itself (strokes on a little grid, mirrored like the film's),
 * so they look the same on every machine — no font needed.
 *
 * The music drives it: the energy sets the speed, every beat drops new
 * streams, the kick lights the heads, a big hit sends a wave of green light
 * across the screen and the chorus floods it. Now and then the rain decodes
 * a phrase in the middle of the screen, and a terminal in the corner types a
 * line about a white rabbit.
 *
 * It draws cheaply: the trails live in a buffer that fades a little every
 * frame, so each frame only draws the heads (and a few flickers).
 */

const LAYERS = [
  { size: 12, speed: 0.55, color: '#0f6b34', alpha: 0.55, density: 0.75 },
  { size: 17, speed: 0.8, color: '#19b85a', alpha: 0.8, density: 0.6 },
  { size: 24, speed: 1.1, color: '#3dff88', alpha: 1, density: 0.45 }
]
const GLYPHS = 56
const PHRASES = ['HARMONY', 'NAO HA COLHER', 'ACORDE', 'SIGA O COELHO BRANCO', 'LIBERTE SUA MENTE']
const TERMINAL = ['> acorde...', '> a musica te encontrou.', '> siga o coelho branco_']

// ---------------------------------------------------------------------------
// glyphs: made of strokes on a 4×6 grid, katakana-like, mirrored
// ---------------------------------------------------------------------------

type Stroke = [number, number, number, number]

function makeGlyphs(): Stroke[][] {
  let s = 1234567
  const r = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const out: Stroke[][] = []
  for (let i = 0; i < GLYPHS; i++) {
    const strokes: Stroke[] = []
    const n = 2 + Math.floor(r() * 3)
    for (let k = 0; k < n; k++) {
      const kind = Math.floor(r() * 6)
      const x = Math.floor(r() * 3)
      const y = Math.floor(r() * 5)
      if (kind === 0) strokes.push([0, y, 3, y]) // a bar across
      else if (kind === 1) strokes.push([x + 0.5, 0, x + 0.5, 5]) // a stem
      else if (kind === 2) strokes.push([3, y, 0.5, Math.min(5, y + 3)]) // a sweep down-left
      else if (kind === 3) strokes.push([x, y, x + 1.5, Math.min(5, y + 1.5)]) // a short tick
      else if (kind === 4) strokes.push([0, 0, 3, 0], [3, 0, 2, 5]) // a hook (top bar + drop)
      else strokes.push([1.5, y, 3, Math.min(5, y + 2)])
    }
    out.push(strokes)
  }
  return out
}

/** All glyphs, in one colour and size, side by side (an atlas). */
function atlas(glyphs: Stroke[][], size: number, color: string, dpr: number, glow = false): HTMLCanvasElement {
  const cw = Math.ceil(size * 0.7)
  const ch = Math.ceil(size)
  const c = document.createElement('canvas')
  c.width = Math.ceil(cw * glyphs.length * dpr)
  c.height = Math.ceil(ch * dpr)
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  g.strokeStyle = color
  g.lineCap = 'square'
  g.lineWidth = Math.max(1, size * 0.09)
  if (glow) {
    g.shadowColor = color
    g.shadowBlur = size * 0.4
  }
  const sx = (cw * 0.62) / 3
  const sy = (ch * 0.72) / 5
  glyphs.forEach((strokes, i) => {
    g.save()
    // mirrored, like the film's
    g.translate(i * cw + cw * 0.81, ch * 0.14)
    g.scale(-1, 1)
    g.beginPath()
    for (const [x0, y0, x1, y1] of strokes) {
      g.moveTo(x0 * sx, y0 * sy)
      g.lineTo(x1 * sx, y1 * sy)
    }
    g.stroke()
    g.restore()
  })
  return c
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

interface Stream {
  layer: number
  col: number
  y: number // in cells
  speed: number // cells per second
  last: number // last cell written into the trail
  wait: number // seconds before it starts (inactive while > 0)
}

interface State {
  key: string
  w: number
  h: number
  dpr: number
  trail: HTMLCanvasElement
  tg: CanvasRenderingContext2D
  green: HTMLCanvasElement[]
  heads: HTMLCanvasElement[]
  streams: Stream[]
  cols: number[]
  lastKick: number
  kickAvg: number
  waves: { t: number }[]
  phrase: { text: string; t: number; row: number } | null
  nextPhrase: number
  term: { line: number; chars: number; t: number } | null
  nextTerm: number
  glow: HTMLCanvasElement
  purge: number
}

let S: State | null = null
let GLYPH_STROKES: Stroke[][] | null = null

function glowSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(160,255,200,0.9)')
  grd.addColorStop(0.4, 'rgba(60,255,130,0.25)')
  grd.addColorStop(1, 'rgba(0,255,100,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return c
}

function build(w: number, h: number): State {
  const dpr = canvasDpr()
  GLYPH_STROKES ??= makeGlyphs()
  const trail = document.createElement('canvas')
  trail.width = Math.round(w * dpr)
  trail.height = Math.round(h * dpr)
  const tg = trail.getContext('2d')!
  tg.fillStyle = '#000'
  tg.fillRect(0, 0, trail.width, trail.height)
  const streams: Stream[] = []
  const cols: number[] = []
  LAYERS.forEach((L, li) => {
    const cw = Math.ceil(L.size * 0.7)
    const n = Math.floor(w / cw)
    cols.push(n)
    for (let c = 0; c < n; c++) {
      if (Math.random() > L.density) continue
      streams.push({ layer: li, col: c, y: -Math.random() * (h / L.size), speed: 8 + Math.random() * 12, last: -1, wait: Math.random() * 3 })
    }
  })
  return {
    key: `${w}x${h}@${dpr}`,
    w,
    h,
    dpr,
    trail,
    tg,
    green: LAYERS.map((L) => atlas(GLYPH_STROKES!, L.size, L.color, dpr)),
    heads: LAYERS.map((L) => atlas(GLYPH_STROKES!, L.size, '#e6fff0', dpr, true)),
    streams,
    cols,
    lastKick: 0,
    kickAvg: 0,
    waves: [],
    phrase: null,
    nextPhrase: 14,
    term: null,
    nextTerm: 6,
    glow: glowSprite(),
    purge: 0
  }
}

function drawGlyph(g: CanvasRenderingContext2D, atlasC: HTMLCanvasElement, size: number, idx: number, x: number, y: number, dpr: number): void {
  const cw = Math.ceil(size * 0.7)
  const ch = Math.ceil(size)
  g.drawImage(atlasC, idx * cw * dpr, 0, cw * dpr, ch * dpr, x, y, cw, ch)
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const codeRainWorld: World = {
  id: 'coderain',
  name: 'Chuva de Código',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    S = build(c.width, c.height)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time } = c
    const dt = Math.min(c.dt, 0.05)
    if (!S || S.key !== `${width}x${height}@${canvasDpr()}`) S = build(width, height)
    const st = S
    const tg = st.tg
    const dpr = st.dpr

    const onset = c.kick > Math.max(0.25, st.kickAvg * 1.35 + 0.08) && st.lastKick <= c.kick
    st.kickAvg += (c.kick - st.kickAvg) * Math.min(1, dt * 3)
    st.lastKick = c.kick
    const pace = (c.playing ? 0.7 + c.energy * 0.8 : 0.45) + c.surge * 0.7

    // every beat drops a few new streams from the top
    if (onset) {
      const idle = st.streams.filter((s) => s.wait > 0)
      for (let k = 0; k < 5 && idle.length; k++) idle.splice(Math.floor(Math.random() * idle.length), 1)[0].wait = 0
    }
    if (c.impactHit) st.waves.push({ t: 0 })

    // ---- the trails fade a little (in screen pixels, in the buffer)
    tg.setTransform(1, 0, 0, 1, 0, 0)
    tg.globalAlpha = 1
    tg.globalCompositeOperation = 'source-over'
    tg.fillStyle = `rgba(0,0,0,${Math.min(1, dt * (2.2 - c.surge * 0.8))})`
    tg.fillRect(0, 0, st.trail.width, st.trail.height)
    // a gentle fade alone stalls in 8-bit colour (around 14/255 it stops
    // changing) and leaves a grey haze; a stronger multiply every so often
    // takes the leftovers down to black
    st.purge -= dt
    if (st.purge <= 0) {
      st.purge = 0.15
      tg.globalCompositeOperation = 'multiply'
      tg.fillStyle = 'rgb(222,222,222)'
      tg.fillRect(0, 0, st.trail.width, st.trail.height)
      tg.globalCompositeOperation = 'source-over'
    }
    tg.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ---- advance the streams and write their glyphs into the trail
    for (const s of st.streams) {
      const L = LAYERS[s.layer]
      if (s.wait > 0) {
        s.wait -= dt * pace * (c.playing ? 1 : 0.5)
        continue
      }
      s.y += s.speed * L.speed * pace * dt
      const cell = Math.floor(s.y)
      if (cell !== s.last && cell >= 0) {
        // the glyph the head just left becomes trail
        tg.globalAlpha = L.alpha
        drawGlyph(tg, st.green[s.layer], L.size, Math.floor(Math.random() * GLYPHS), s.col * Math.ceil(L.size * 0.7), cell * L.size, dpr)
        s.last = cell
      }
      // a trail glyph now and then flickers into another one
      if (Math.random() < dt * 3) {
        const back = cell - 1 - Math.floor(Math.random() * 12)
        if (back >= 0) {
          tg.globalAlpha = L.alpha * 0.7
          const x = s.col * Math.ceil(L.size * 0.7)
          tg.globalCompositeOperation = 'source-over'
          tg.fillStyle = '#000'
          tg.fillRect(x, back * L.size, Math.ceil(L.size * 0.7), L.size)
          drawGlyph(tg, st.green[s.layer], L.size, Math.floor(Math.random() * GLYPHS), x, back * L.size, dpr)
        }
      }
      if (s.y * L.size > height + L.size * 20) {
        s.y = -Math.random() * 10
        s.last = -1
        s.speed = 8 + Math.random() * 12
        s.wait = Math.random() * 2.5
      }
    }
    tg.globalAlpha = 1

    // ---- a phrase decoding in the middle of the rain
    st.nextPhrase -= dt
    if (!st.phrase && (st.nextPhrase <= 0 || (c.impactHit && st.nextPhrase < 8))) {
      st.phrase = { text: PHRASES[Math.floor(Math.random() * PHRASES.length)], t: 0, row: 0 }
      st.nextPhrase = 26 + Math.random() * 20
    }
    if (st.phrase) {
      const p = st.phrase
      p.t += dt
      const size = LAYERS[2].size
      const cw = Math.ceil(size * 0.7)
      const startCol = Math.floor((st.cols[2] - p.text.length) / 2)
      const row = Math.floor(height / size / 2) - 2
      // letters lock in one by one, then hold, then the rain takes them back
      const shown = Math.min(p.text.length, Math.floor(p.t * 14))
      if (p.t < 3.2) {
        tg.font = `bold ${Math.round(size * 0.86)}px 'JetBrains Mono Variable', ui-monospace, monospace`
        tg.textBaseline = 'top'
        tg.fillStyle = '#000'
        for (let i = 0; i < p.text.length; i++) {
          const x = (startCol + i) * cw
          tg.fillRect(x, row * size, cw, size)
          if (i < shown) {
            tg.fillStyle = p.text[i] === ' ' ? '#000' : '#b8ffd2'
            tg.fillText(p.text[i], x + cw * 0.1, row * size + size * 0.08)
            tg.fillStyle = '#000'
          } else drawGlyph(tg, st.green[2], size, Math.floor(Math.random() * GLYPHS), x, row * size, dpr)
        }
      } else if (p.t > 5) st.phrase = null
    }

    // ---- draw: the trail buffer, then the heads on top
    ctx.save()
    ctx.drawImage(st.trail, 0, 0, width, height)
    ctx.globalCompositeOperation = 'lighter'
    const headGlow = 0.35 + c.kick * 0.5 + c.surge * 0.3
    for (const s of st.streams) {
      if (s.wait > 0) continue
      const L = LAYERS[s.layer]
      const cell = Math.floor(s.y)
      if (cell < 0) continue
      const x = s.col * Math.ceil(L.size * 0.7)
      const y = cell * L.size
      if (y > height) continue
      ctx.globalAlpha = L.alpha
      drawGlyph(ctx, st.heads[s.layer], L.size, (cell * 7 + s.col) % GLYPHS, x, y, dpr)
      if (s.layer === 2) {
        ctx.globalAlpha = headGlow * 0.6
        ctx.drawImage(st.glow, x - L.size, y - L.size * 0.6, L.size * 2.4, L.size * 2.2)
      }
    }
    // a big hit: a wave of light rolling down the screen
    for (let i = st.waves.length - 1; i >= 0; i--) {
      const wv = st.waves[i]
      wv.t += dt
      if (wv.t > 1.4) {
        st.waves.splice(i, 1)
        continue
      }
      const y = (wv.t / 1.4) * (height + 300) - 150
      const grd = ctx.createLinearGradient(0, y - 150, 0, y + 150)
      grd.addColorStop(0, 'rgba(0,255,120,0)')
      grd.addColorStop(0.5, `rgba(60,255,150,${0.22 * (1 - wv.t / 1.4)})`)
      grd.addColorStop(1, 'rgba(0,255,120,0)')
      ctx.globalAlpha = 1
      ctx.fillStyle = grd
      ctx.fillRect(0, y - 150, width, 300)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    // ---- the terminal in the corner
    st.nextTerm -= dt
    if (!st.term && st.nextTerm <= 0) st.term = { line: 0, chars: 0, t: 0 }
    if (st.term) {
      const tm = st.term
      tm.t += dt
      const text = TERMINAL[tm.line]
      tm.chars = Math.min(text.length, Math.floor(tm.t * 11))
      ctx.font = `15px 'JetBrains Mono Variable', ui-monospace, monospace`
      ctx.textBaseline = 'top'
      const x = Math.max(24, width * 0.04)
      const y = Math.max(24, height * 0.05)
      // a black plate behind the text, so the rain doesn't run through it
      const shown = text.slice(0, tm.chars) + (Math.floor(time * 2) % 2 ? '█' : ' ')
      ctx.fillStyle = 'rgba(0,0,0,0.85)'
      ctx.fillRect(x - 8, y - 6, ctx.measureText(shown).width + 16, 28)
      ctx.fillStyle = '#9dffbf'
      ctx.shadowColor = '#3dff88'
      ctx.shadowBlur = 8
      ctx.fillText(shown, x, y)
      ctx.shadowBlur = 0
      if (tm.chars >= text.length && tm.t > text.length / 11 + 2.2) {
        tm.line++
        tm.t = 0
        tm.chars = 0
        if (tm.line >= TERMINAL.length) {
          st.term = null
          st.nextTerm = 40 + Math.random() * 30
        }
      }
    }

    // a dark vignette and a faint green tint
    const vign = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75)
    vign.addColorStop(0, 'rgba(0,20,8,0)')
    vign.addColorStop(1, 'rgba(0,0,0,0.6)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
