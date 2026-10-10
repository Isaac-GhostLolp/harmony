// the scenes use `t` for their own clock, so translations are `tr`/`trn` here
import { locale, t as tr, tn as trn, tk } from '@/i18n'
/**
 * Retrospectiva renderer — draws one frame of the year-in-music video.
 *
 * The video is a sequence of scenes (intro, minutes, genres, artists, songs,
 * clock, outro). Everything is a pure function of the time since the start,
 * so the live preview and the offline export draw the exact same frames; the
 * only extra input is the beat (kick pulse / big hits) read from the
 * soundtrack, which makes numbers and covers breathe with the music.
 *
 * Everything is laid out on a 1080×1920 (9:16) board and scaled on draw.
 */

export const RECAP_W = 1080
export const RECAP_H = 1920

/** What `stats:recap` returns (see main/ipc/handlers.ts). */
export interface RecapData {
  period: number | 'all'
  years: number[]
  totalPlays: number
  seconds: number
  activeDays: number
  songsPlayed: number
  artistsPlayed: number
  newSongs: number
  topSongs: {
    id: number
    title: string
    path: string
    duration: number
    artist: string | null
    coverPath: string | null
    plays: number
  }[]
  topArtists: { id: number; name: string; plays: number; cover: string | null }[]
  topGenres: { genre: string; plays: number }[]
  /** plays per local hour, 0..23 */
  hours: number[]
  /** plays per month, 0 = January */
  months: number[]
  bestDay: { d: string; plays: number; seconds: number } | null
  bestStreak: number
}

export interface RecapAssets {
  name: string
  /** emoji avatar, used when there is no photo */
  avatar: string
  photo: HTMLImageElement | null
  songCovers: (HTMLImageElement | null)[]
  artistCovers: (HTMLImageElement | null)[]
  hue: number
}

export interface RecapFrame {
  /** seconds since the start of the video */
  time: number
  /** kick strength on this frame, 0..1 */
  kick: number
  /** a big hit (drop / impact) lands on this frame */
  hit: boolean
}

type SceneId = 'intro' | 'minutes' | 'genres' | 'artists' | 'songs' | 'clock' | 'outro'

export interface Scene {
  id: SceneId
  label: string
  start: number
  dur: number
}

const SCENE_LEN: Record<SceneId, number> = {
  intro: 3.6,
  minutes: 4.4,
  genres: 4.4,
  artists: 5,
  songs: 5,
  clock: 4.6,
  outro: 4.6
}
const SCENE_LABEL: Record<SceneId, string> = {
  intro: tk('Abertura'),
  minutes: tk('Minutos'),
  genres: tk('Gêneros'),
  artists: tk('Artistas'),
  songs: tk('Músicas'),
  clock: tk('Horários'),
  outro: tk('Resumo')
}

/** The scenes this recap has (no data, no scene) with their start times. */
export function scenesFor(d: RecapData): Scene[] {
  const ids: SceneId[] = ['intro', 'minutes']
  if (d.topGenres.length) ids.push('genres')
  if (d.topArtists.length) ids.push('artists')
  if (d.topSongs.length) ids.push('songs')
  ids.push('clock', 'outro')
  let t = 0
  return ids.map((id) => {
    const s = { id, label: tr(SCENE_LABEL[id]), start: t, dur: SCENE_LEN[id] }
    t += s.dur
    return s
  })
}

export function recapLength(scenes: Scene[]): number {
  const last = scenes[scenes.length - 1]
  return last ? last.start + last.dur : 0
}

export function periodLabel(p: number | 'all'): string {
  return p === 'all' ? tr('Todo o tempo') : String(p)
}

// ---------------------------------------------------------------------------
// State (particles, pulse) — kept between frames
// ---------------------------------------------------------------------------

const PARTICLES = 46
const NOTES = ['♪', '♫', '♬', '♩']

export interface RecapState {
  px: Float32Array
  py: Float32Array
  ps: Float32Array
  pp: Float32Array
  note: Int8Array
  pulse: number
  flash: number
  lastT: number
  /** offscreen layer a leaving scene is drawn on */
  layer: HTMLCanvasElement | null
}

export function createRecapState(): RecapState {
  // a fixed seed so preview and export share the same sky
  let seed = 7
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const S: RecapState = {
    px: new Float32Array(PARTICLES),
    py: new Float32Array(PARTICLES),
    ps: new Float32Array(PARTICLES),
    pp: new Float32Array(PARTICLES),
    note: new Int8Array(PARTICLES),
    pulse: 0,
    flash: 0,
    lastT: -1,
    layer: null
  }
  for (let i = 0; i < PARTICLES; i++) {
    S.px[i] = rnd()
    S.py[i] = rnd()
    S.ps[i] = 0.4 + rnd() * 0.8
    S.pp[i] = rnd() * 6.28
    S.note[i] = rnd() < 0.4 ? Math.floor(rnd() * NOTES.length) : -1
  }
  return S
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SANS = "'Segoe UI', system-ui, -apple-system, 'Noto Sans', sans-serif"
const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function easeOut(x: number): number {
  return 1 - Math.pow(1 - clamp01(x), 3)
}

function easeBack(x: number): number {
  const c = 1.6
  const v = clamp01(x) - 1
  return 1 + (c + 1) * v * v * v + c * v * v
}

/** 0→1 as an element enters, `delay` seconds into its scene. */
function enter(t: number, delay: number, dur = 0.6): number {
  return easeOut((t - delay) / dur)
}

const fmt = (n: number): string => Math.round(n).toLocaleString(locale())

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${Math.round(h)}, ${s}%, ${l}%, ${a})`
}

function font(size: number, weight = 700): string {
  return `${weight} ${Math.round(size)}px ${SANS}`
}

/** Shrinks the font until the text fits, then ellipsizes. Returns the text drawn. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  size: number,
  weight = 700,
  minScale = 0.55
): string {
  let s = size
  ctx.font = font(s, weight)
  while (ctx.measureText(text).width > maxW && s > size * minScale) {
    s -= 4
    ctx.font = font(s, weight)
  }
  if (ctx.measureText(text).width <= maxW) return text
  let out = text
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  return out.trimEnd() + '…'
}

interface TextOpts {
  size: number
  weight?: number
  color?: string
  align?: CanvasTextAlign
  maxW?: number
  /** fill with the accent gradient */
  gradient?: number
  /** how far the font may shrink to fit before it is ellipsized (0..1) */
  minScale?: number
  spacing?: number
}

function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts): void {
  ctx.textAlign = o.align ?? 'center'
  ctx.textBaseline = 'alphabetic'
  const s = o.maxW ? fitText(ctx, str, o.maxW, o.size, o.weight, o.minScale) : str
  if (!o.maxW) ctx.font = font(o.size, o.weight)
  if (o.spacing) ctx.letterSpacing = `${o.spacing}px`
  if (o.gradient !== undefined) {
    const w = ctx.measureText(s).width
    const x0 = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' ? x - w : x
    const g = ctx.createLinearGradient(x0, y - o.size, x0 + w, y)
    g.addColorStop(0, hsl(o.gradient, 95, 72))
    g.addColorStop(0.5, hsl(o.gradient + 50, 95, 75))
    g.addColorStop(1, hsl(o.gradient - 40, 95, 70))
    ctx.fillStyle = g
  } else ctx.fillStyle = o.color ?? '#fff'
  ctx.fillText(s, x, y)
  if (o.spacing) ctx.letterSpacing = '0px'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Draws an image cropped to a square (object-fit: cover), or a lettered tile. */
function drawSquare(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  radius: number,
  hue: number,
  letter: string
): void {
  ctx.save()
  roundRect(ctx, x, y, size, size, radius)
  ctx.clip()
  if (img && img.naturalWidth) {
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      x,
      y,
      size,
      size
    )
  } else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size)
    g.addColorStop(0, hsl(hue, 80, 55))
    g.addColorStop(1, hsl(hue + 60, 80, 35))
    ctx.fillStyle = g
    ctx.fillRect(x, y, size, size)
    text(ctx, (letter.trim()[0] ?? '♪').toUpperCase(), x + size / 2, y + size * 0.66, {
      size: size * 0.45,
      weight: 800,
      color: 'rgba(255,255,255,0.9)'
    })
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function drawBackground(ctx: CanvasRenderingContext2D, S: RecapState, h: number, t: number, dt: number): void {
  ctx.fillStyle = hsl(h, 50, 7)
  ctx.fillRect(0, 0, RECAP_W, RECAP_H)
  ctx.globalCompositeOperation = 'lighter'
  const blob = (x: number, y: number, r: number, hh: number, a: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, hsl(hh, 90, 55, a))
    g.addColorStop(1, hsl(hh, 90, 55, 0))
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const p = 1 + S.pulse * 0.18
  blob(RECAP_W * (0.15 + Math.sin(t * 0.31) * 0.12), RECAP_H * (0.2 + Math.cos(t * 0.23) * 0.08), 900 * p, h, 0.42)
  blob(RECAP_W * (0.9 + Math.cos(t * 0.27) * 0.1), RECAP_H * (0.62 + Math.sin(t * 0.19) * 0.1), 850 * p, h + 50, 0.32)
  blob(RECAP_W * (0.3 + Math.sin(t * 0.17) * 0.15), RECAP_H * (1.0 + Math.sin(t * 0.29) * 0.05), 800, h - 45, 0.3)
  ctx.globalCompositeOperation = 'source-over'

  // notes and bubbles drifting up
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < PARTICLES; i++) {
    S.py[i] -= (0.025 + 0.03 * S.ps[i]) * dt * (1 + S.pulse * 2)
    if (S.py[i] < -0.08) {
      S.py[i] = 1.08
      S.px[i] = (S.px[i] + 0.37) % 1
    }
    const x = S.px[i] * RECAP_W + Math.sin(t * 0.7 + S.pp[i]) * 24
    const y = S.py[i] * RECAP_H
    const a = 0.1 + 0.16 * S.ps[i]
    if (S.note[i] >= 0) {
      ctx.globalAlpha = a + 0.08
      ctx.fillStyle = hsl(h + S.pp[i] * 10, 90, 82)
      ctx.font = `700 ${Math.round(26 + S.ps[i] * 30)}px 'Segoe UI Symbol', ${SANS}`
      ctx.fillText(NOTES[S.note[i]], x, y)
    } else {
      ctx.globalAlpha = a
      ctx.strokeStyle = hsl(h + 30, 90, 85)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 5 + S.ps[i] * 12, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  // soft vignette keeps text readable at the edges
  const v = ctx.createRadialGradient(RECAP_W / 2, RECAP_H / 2, RECAP_H * 0.3, RECAP_W / 2, RECAP_H / 2, RECAP_H * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, RECAP_W, RECAP_H)
}

function drawBrand(ctx: CanvasRenderingContext2D, a: number): void {
  ctx.globalAlpha = a * 0.75
  text(ctx, '♪ HARMONY', RECAP_W / 2, 120, { size: 30, weight: 800, color: '#fff', spacing: 10 })
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

interface Ctx {
  ctx: CanvasRenderingContext2D
  d: RecapData
  A: RecapAssets
  S: RecapState
  /** time inside the scene */
  t: number
  dur: number
  h: number
}

function sceneIntro({ ctx, d, A, S, t, h }: Ctx): void {
  const cx = RECAP_W / 2
  ctx.globalAlpha = enter(t, 0.1)
  text(ctx, tr('SUA RETROSPECTIVA'), cx, 560, { size: 40, weight: 700, color: 'rgba(255,255,255,0.8)', spacing: 12 })

  // avatar with a glowing ring
  const k = easeBack((t - 0.3) / 0.7)
  if (k > 0) {
    const r = 150 * k * (1 + S.pulse * 0.04)
    const cy = 800
    ctx.globalAlpha = 1
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(t * 0.6)
    const ring = ctx.createConicGradient(0, 0, 0)
    ring.addColorStop(0, hsl(h, 95, 65))
    ring.addColorStop(0.33, hsl(h + 60, 95, 65))
    ring.addColorStop(0.66, hsl(h - 40, 95, 65))
    ring.addColorStop(1, hsl(h, 95, 65))
    ctx.fillStyle = ring
    ctx.beginPath()
    ctx.arc(0, 0, r + 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    if (A.photo && A.photo.naturalWidth) {
      ctx.drawImage(A.photo, cx - r, cy - r, r * 2, r * 2)
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
      ctx.font = `${Math.round(r * 1.05)}px ${EMOJI}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(A.avatar, cx, cy + r * 0.06)
    }
    ctx.restore()
  }

  ctx.globalAlpha = enter(t, 0.7)
  text(ctx, A.name, cx, 1060, { size: 72, weight: 800, maxW: 900 })

  const y = easeBack((t - 1.1) / 0.8)
  if (y > 0) {
    ctx.globalAlpha = clamp01(y)
    ctx.save()
    ctx.translate(cx, 1300)
    const s = (0.6 + 0.4 * y) * (1 + S.pulse * 0.05)
    ctx.scale(s, s)
    const label = periodLabel(d.period)
    text(ctx, label, 0, 0, { size: d.period === 'all' ? 150 : 280, weight: 900, gradient: h, maxW: 960 })
    ctx.restore()
  }
  ctx.globalAlpha = enter(t, 1.7)
  text(ctx, d.period === 'all' ? tr('Toda a sua história em música') : tr('Seu ano em música'), cx, 1450, {
    size: 48,
    weight: 500,
    color: 'rgba(255,255,255,0.8)'
  })
  ctx.globalAlpha = 1
}

function sceneMinutes({ ctx, d, S, t, h }: Ctx): void {
  const cx = RECAP_W / 2
  const minutes = d.seconds / 60
  ctx.globalAlpha = enter(t, 0.05)
  text(ctx, tr('Você ouviu'), cx, 620, { size: 64, weight: 600, color: 'rgba(255,255,255,0.85)' })

  // the counter rolls up
  const roll = easeOut((t - 0.3) / 1.8)
  ctx.globalAlpha = enter(t, 0.25, 0.3)
  ctx.save()
  ctx.translate(cx, 900)
  const s = 1 + S.pulse * 0.06
  ctx.scale(s, s)
  text(ctx, fmt(minutes * roll), 0, 0, { size: 230, weight: 900, gradient: h, maxW: 980 })
  ctx.restore()
  ctx.globalAlpha = enter(t, 0.6)
  text(ctx, tr('minutos de música'), cx, 1010, { size: 58, weight: 700 })

  const stats: [string, string][] = [
    [fmt(d.totalPlays), tr('plays')],
    [fmt(d.activeDays), d.activeDays === 1 ? tr('dia ativo') : tr('dias ativos')],
    [fmt(d.songsPlayed), d.songsPlayed === 1 ? tr('música') : tr('músicas')]
  ]
  stats.forEach(([v, l], i) => {
    const k = enter(t, 1.3 + i * 0.18)
    if (k <= 0) return
    const x = 90 + i * 310
    const y = 1180 + (1 - k) * 60
    ctx.globalAlpha = k
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    roundRect(ctx, x, y, 280, 220, 36)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 2
    ctx.stroke()
    text(ctx, v, x + 140, y + 115, { size: 64, weight: 800, maxW: 250 })
    text(ctx, l, x + 140, y + 170, { size: 34, weight: 500, color: 'rgba(255,255,255,0.7)' })
  })

  const days = minutes / 1440
  const fact =
    days >= 1
      ? trn(days < 2 ? 1 : 2, 'Isso dá {d} dia inteiro de música!', 'Isso dá {d} dias inteiros de música!', {
          d: days.toLocaleString(locale(), { maximumFractionDigits: 1 })
        })
      : minutes >= 60
        ? tr('São {h} horas de trilha sonora.', { h: (minutes / 60).toLocaleString(locale(), { maximumFractionDigits: 1 }) })
        : tr('Todo grande ano começa com o primeiro play.')
  ctx.globalAlpha = enter(t, 2.1)
  text(ctx, fact, cx, 1580, { size: 44, weight: 600, color: hsl(h + 30, 90, 82), maxW: 920 })
  if (d.newSongs > 0) {
    ctx.globalAlpha = enter(t, 2.4)
    text(ctx, trn(d.newSongs, 'e descobriu {count} música nova', 'e descobriu {count} músicas novas', { count: fmt(d.newSongs) }), cx, 1650, {
      size: 40,
      weight: 500,
      color: 'rgba(255,255,255,0.7)',
      maxW: 920
    })
  }
  ctx.globalAlpha = 1
}

const ACRONYMS = new Set(['mpb', 'edm', 'r&b', 'rnb', 'idm', 'ost', 'uk', 'us', 'lo-fi', 'dj'])

/** "indie rock" → "Indie Rock", "mpb" → "MPB". */
function cap(s: string): string {
  return s
    .split(/(\s+)/)
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.replace(/(^|[/-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    )
    .join('')
}

function sceneGenres({ ctx, d, t, h }: Ctx): void {
  const cx = RECAP_W / 2
  const g = d.topGenres
  const total = g.reduce((a, b) => a + b.plays, 0) || 1
  ctx.globalAlpha = enter(t, 0.05)
  text(ctx, tr('Seu som teve a cara de'), cx, 480, { size: 52, weight: 600, color: 'rgba(255,255,255,0.85)' })
  const k = easeBack((t - 0.35) / 0.7)
  if (k > 0) {
    ctx.globalAlpha = clamp01(k)
    ctx.save()
    ctx.translate(cx, 680)
    ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k)
    text(ctx, cap(g[0].genre), 0, 0, { size: 150, weight: 900, gradient: h, maxW: 960 })
    ctx.restore()
  }

  const top = g[0].plays || 1
  g.forEach((x, i) => {
    const k2 = enter(t, 1.0 + i * 0.2, 0.8)
    if (k2 <= 0) return
    const y = 860 + i * 165
    const w = 900 * (0.18 + 0.82 * (x.plays / top)) * k2
    ctx.globalAlpha = clamp01(k2 * 1.4)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    roundRect(ctx, 90, y, 900, 120, 60)
    ctx.fill()
    const grad = ctx.createLinearGradient(90, 0, 90 + w, 0)
    grad.addColorStop(0, hsl(h + i * 22, 90, 58, 0.95))
    grad.addColorStop(1, hsl(h + 40 + i * 22, 90, 66, 0.95))
    ctx.fillStyle = grad
    roundRect(ctx, 90, y, Math.max(120, w), 120, 60)
    ctx.fill()
    text(ctx, cap(x.genre), 140, y + 77, { size: 46, weight: 700, align: 'left', maxW: 620 })
    text(ctx, `${Math.round((x.plays / total) * 100)}%`, 950, y + 77, { size: 42, weight: 800, align: 'right' })
  })
  ctx.globalAlpha = 1
}

function sceneArtists({ ctx, d, A, S, t, h }: Ctx): void {
  const cx = RECAP_W / 2
  const list = d.topArtists
  ctx.globalAlpha = enter(t, 0.05)
  text(ctx, list.length > 1 ? tr('Seus artistas favoritos') : tr('Seu artista favorito'), cx, 330, {
    size: 56,
    weight: 700,
    color: 'rgba(255,255,255,0.9)'
  })

  // #1 in a big glowing circle
  const k = easeBack((t - 0.3) / 0.8)
  if (k > 0) {
    const r = 230 * k * (1 + S.pulse * 0.05)
    const cy = 690
    ctx.globalAlpha = clamp01(k)
    const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.5)
    glow.addColorStop(0, hsl(h, 95, 60, 0.55))
    glow.addColorStop(1, hsl(h, 95, 60, 0))
    ctx.fillStyle = glow
    ctx.fillRect(cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    drawSquare(ctx, A.artistCovers[0] ?? null, cx - r, cy - r, r * 2, 0, h, list[0].name)
    ctx.restore()
    ctx.strokeStyle = hsl(h + 30, 95, 75)
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    // the #1 badge
    ctx.fillStyle = hsl(h + 40, 95, 62)
    ctx.beginPath()
    ctx.arc(cx + r * 0.72, cy - r * 0.72, 56, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, '#1', cx + r * 0.72, cy - r * 0.72 + 20, { size: 54, weight: 900 })
  }
  ctx.globalAlpha = enter(t, 0.9)
  text(ctx, list[0].name, cx, 1020, { size: 80, weight: 900, maxW: 940 })
  text(ctx, `${fmt(list[0].plays)} plays`, cx, 1090, { size: 42, weight: 600, color: hsl(h + 30, 90, 80) })

  list.slice(1).forEach((a, i) => {
    const k2 = enter(t, 1.5 + i * 0.18)
    if (k2 <= 0) return
    const y = 1200 + i * 140 + (1 - k2) * 50
    ctx.globalAlpha = k2
    text(ctx, String(i + 2), 140, y + 66, { size: 52, weight: 900, color: hsl(h + 30, 90, 78) })
    ctx.save()
    ctx.beginPath()
    ctx.arc(250, y + 50, 50, 0, Math.PI * 2)
    ctx.clip()
    drawSquare(ctx, A.artistCovers[i + 1] ?? null, 200, y, 100, 0, h + (i + 1) * 30, a.name)
    ctx.restore()
    text(ctx, a.name, 330, y + 66, { size: 46, weight: 700, align: 'left', maxW: 470, minScale: 0.85 })
    text(ctx, fmt(a.plays), 960, y + 66, { size: 40, weight: 600, align: 'right', color: 'rgba(255,255,255,0.65)' })
  })
  ctx.globalAlpha = 1
}

function sceneSongs({ ctx, d, A, S, t, h }: Ctx): void {
  const cx = RECAP_W / 2
  const list = d.topSongs
  ctx.globalAlpha = enter(t, 0.05)
  text(ctx, d.period === 'all' ? tr('As músicas da sua história') : list.length > 1 ? tr('As músicas do seu ano') : tr('A música do seu ano'), cx, 330, {
    size: 56,
    weight: 700,
    color: 'rgba(255,255,255,0.9)'
  })

  const k = easeBack((t - 0.3) / 0.8)
  if (k > 0) {
    const size = 460 * k * (1 + S.pulse * 0.04)
    const cy = 690
    ctx.globalAlpha = clamp01(k)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.sin(t * 1.4) * 0.025 + (1 - k) * -0.25)
    ctx.shadowColor = hsl(h, 90, 40, 0.8)
    ctx.shadowBlur = 80
    ctx.fillStyle = '#000'
    roundRect(ctx, -size / 2, -size / 2, size, size, 36)
    ctx.fill()
    ctx.shadowBlur = 0
    drawSquare(ctx, A.songCovers[0] ?? null, -size / 2, -size / 2, size, 36, h, list[0].title)
    ctx.restore()
  }
  ctx.globalAlpha = enter(t, 0.9)
  text(ctx, list[0].title, cx, 1030, { size: 70, weight: 900, maxW: 940, minScale: 0.7 })
  text(ctx, list[0].artist ?? 'Artista desconhecido', cx, 1095, {
    size: 44,
    weight: 500,
    color: 'rgba(255,255,255,0.75)',
    maxW: 900
  })
  const pk = enter(t, 1.2)
  if (pk > 0) {
    ctx.globalAlpha = pk
    const label = `tocou ${fmt(list[0].plays)} ${list[0].plays === 1 ? 'vez' : 'vezes'}`
    ctx.font = font(38, 800)
    const w = ctx.measureText(label).width + 70
    ctx.fillStyle = hsl(h + 30, 90, 60, 0.9)
    roundRect(ctx, cx - w / 2, 1130, w, 72, 36)
    ctx.fill()
    text(ctx, label, cx, 1180, { size: 38, weight: 800 })
  }

  list.slice(1).forEach((s, i) => {
    const k2 = enter(t, 1.6 + i * 0.18)
    if (k2 <= 0) return
    const y = 1270 + i * 130 + (1 - k2) * 50
    ctx.globalAlpha = k2
    text(ctx, String(i + 2), 140, y + 62, { size: 50, weight: 900, color: hsl(h + 30, 90, 78) })
    drawSquare(ctx, A.songCovers[i + 1] ?? null, 200, y, 96, 18, h + (i + 1) * 30, s.title)
    text(ctx, s.title, 325, y + 46, { size: 42, weight: 700, align: 'left', maxW: 480, minScale: 0.85 })
    text(ctx, s.artist ?? '', 325, y + 88, {
      size: 32,
      weight: 500,
      align: 'left',
      maxW: 480,
      minScale: 0.9,
      color: 'rgba(255,255,255,0.6)'
    })
    text(ctx, fmt(s.plays), 960, y + 62, { size: 38, weight: 600, align: 'right', color: 'rgba(255,255,255,0.65)' })
  })
  ctx.globalAlpha = 1
}

function clockLine(hours: number[]): { emoji: string; text: string; peak: number } {
  let peak = 0
  for (let i = 1; i < 24; i++) if (hours[i] > hours[peak]) peak = i
  if (peak < 5) return { emoji: '🌙', text: tr('Você é da turma da madrugada'), peak }
  if (peak < 12) return { emoji: '☀️', text: tr('Você é da turma da manhã'), peak }
  if (peak < 18) return { emoji: '🌤️', text: tr('Você é da turma da tarde'), peak }
  return { emoji: '🌆', text: tr('Você é da turma da noite'), peak }
}

function sceneClock({ ctx, d, S, t, h }: Ctx): void {
  const cx = RECAP_W / 2
  const cy = 790
  ctx.globalAlpha = enter(t, 0.05)
  text(ctx, tr('Quando você dá o play'), cx, 360, { size: 56, weight: 700, color: 'rgba(255,255,255,0.9)' })

  const max = Math.max(1, ...d.hours)
  const R0 = 175
  const grow = easeOut((t - 0.3) / 1.2)
  const line = clockLine(d.hours)
  ctx.lineCap = 'round'
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2
    const len = 24 + 230 * (d.hours[i] / max) * grow * (i === line.peak ? 1 + S.pulse * 0.12 : 1)
    ctx.globalAlpha = clamp01(grow * 1.5)
    ctx.strokeStyle = i === line.peak ? hsl(h + 40, 95, 72) : hsl(h + i * 4, 85, 62, 0.8)
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0)
    ctx.lineTo(cx + Math.cos(a) * (R0 + len), cy + Math.sin(a) * (R0 + len))
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  ctx.globalAlpha = clamp01(grow * 1.5)
  for (const [hr, label] of [
    [0, '0h'],
    [6, '6h'],
    [12, '12h'],
    [18, '18h']
  ] as const) {
    const a = (hr / 24) * Math.PI * 2 - Math.PI / 2
    text(ctx, label, cx + Math.cos(a) * (R0 - 32), cy + Math.sin(a) * (R0 - 32) + 11, {
      size: 30,
      weight: 600,
      color: 'rgba(255,255,255,0.5)'
    })
  }
  ctx.globalAlpha = enter(t, 0.9)
  text(ctx, `${line.peak}h`, cx, cy + 26, { size: 78, weight: 900, gradient: h })

  ctx.globalAlpha = enter(t, 1.2)
  ctx.font = `64px ${EMOJI}`
  ctx.textAlign = 'center'
  ctx.fillText(line.emoji, cx, 1270)
  text(ctx, line.text, cx, 1360, { size: 52, weight: 800, maxW: 960 })

  const facts: string[] = []
  if (d.bestStreak >= 2) facts.push(tr('🔥 {n} dias seguidos de música', { n: d.bestStreak }))
  if (d.bestDay && d.bestDay.plays >= 2) {
    const day = new Date(d.bestDay.d + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'long' })
    facts.push(tr('⭐ Seu maior dia: {day}, {plays} plays', { day, plays: fmt(d.bestDay.plays) }))
  }
  facts.forEach((f, i) => {
    ctx.globalAlpha = enter(t, 1.6 + i * 0.25)
    text(ctx, f, cx, 1460 + i * 70, { size: 40, weight: 600, color: 'rgba(255,255,255,0.8)', maxW: 960 })
  })

  // plays per month (only when looking at a single year)
  if (d.period !== 'all') {
    const mMax = Math.max(1, ...d.months)
    const mk = easeOut((t - 2) / 1)
    if (mk > 0) {
      ctx.globalAlpha = mk
      for (let m = 0; m < 12; m++) {
        const x = 150 + m * 70
        const bh = 6 + 110 * (d.months[m] / mMax) * mk
        ctx.fillStyle = hsl(h + m * 6, 85, 62, d.months[m] === mMax ? 1 : 0.6)
        roundRect(ctx, x, 1740 - bh, 46, bh, 12)
        ctx.fill()
        text(ctx, MONTHS[m], x + 23, 1785, { size: 28, weight: 600, color: 'rgba(255,255,255,0.55)' })
      }
    }
  }
  ctx.globalAlpha = 1
}

function sceneOutro({ ctx, d, A, S, t, h }: Ctx): void {
  const cx = RECAP_W / 2
  const k = easeBack((t - 0.1) / 0.8)
  if (k <= 0) return
  ctx.globalAlpha = clamp01(k)
  ctx.save()
  ctx.translate(cx, 960)
  const s = 0.85 + 0.15 * k
  ctx.scale(s, s)
  ctx.translate(-cx, -960)

  // the card
  ctx.fillStyle = 'rgba(10,10,20,0.55)'
  roundRect(ctx, 80, 300, 920, 1260, 64)
  ctx.fill()
  const border = ctx.createLinearGradient(80, 300, 1000, 1560)
  border.addColorStop(0, hsl(h, 95, 65, 0.9))
  border.addColorStop(1, hsl(h + 60, 95, 65, 0.9))
  ctx.strokeStyle = border
  ctx.lineWidth = 4
  ctx.stroke()

  text(ctx, A.name, cx, 420, { size: 56, weight: 800, maxW: 820 })
  text(ctx, tr('Retrospectiva {period}', { period: periodLabel(d.period) }), cx, 485, {
    size: 40,
    weight: 700,
    gradient: h,
    maxW: 820
  })

  // cover strip of the top songs
  const covers = d.topSongs.slice(0, 5)
  const cw = 150
  const gap = 18
  const x0 = cx - (covers.length * cw + (covers.length - 1) * gap) / 2
  covers.forEach((s2, i) => {
    const kk = enter(t, 0.5 + i * 0.1)
    ctx.globalAlpha = clamp01(k) * kk
    drawSquare(ctx, A.songCovers[i] ?? null, x0 + i * (cw + gap), 550 + (1 - kk) * 40, cw, 22, h + i * 30, s2.title)
  })
  ctx.globalAlpha = clamp01(k)

  const cells: [string, string][] = [
    [tr('Minutos'), fmt(d.seconds / 60)],
    [tr('Plays'), fmt(d.totalPlays)],
    [tr('Top artista'), d.topArtists[0]?.name ?? '—'],
    [tr('Top gênero'), d.topGenres[0] ? cap(d.topGenres[0].genre) : '—']
  ]
  cells.forEach(([label, value], i) => {
    const kk = enter(t, 0.9 + i * 0.12)
    ctx.globalAlpha = clamp01(k) * kk
    const x = 130 + (i % 2) * 420
    const y = 770 + Math.floor(i / 2) * 230
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    roundRect(ctx, x, y, 400, 200, 32)
    ctx.fill()
    text(ctx, label.toUpperCase(), x + 40, y + 62, {
      size: 26,
      weight: 700,
      align: 'left',
      color: 'rgba(255,255,255,0.55)',
      spacing: 3
    })
    text(ctx, value, x + 40, y + 140, { size: 56, weight: 900, align: 'left', maxW: 330 })
  })

  const top = d.topSongs[0]
  if (top) {
    ctx.globalAlpha = clamp01(k) * enter(t, 1.5)
    text(ctx, d.period === 'all' ? tr('MÚSICA DA SUA VIDA') : tr('MÚSICA DO ANO'), cx, 1300, { size: 26, weight: 700, color: 'rgba(255,255,255,0.55)', spacing: 3 })
    text(ctx, top.title, cx, 1375, { size: 58, weight: 900, maxW: 820, minScale: 0.7 })
    text(ctx, top.artist ?? '', cx, 1430, { size: 36, weight: 500, color: 'rgba(255,255,255,0.7)', maxW: 820 })
  }
  ctx.restore()

  ctx.globalAlpha = enter(t, 1.9)
  ctx.save()
  ctx.translate(cx, 1700)
  const p = 1 + S.pulse * 0.05
  ctx.scale(p, p)
  text(ctx, tr('Feito com ♪ Harmony'), 0, 0, { size: 46, weight: 800 })
  ctx.restore()
  text(ctx, tr('#MinhaRetrospectiva'), cx, 1770, { size: 36, weight: 600, color: hsl(h + 30, 90, 80) })
  ctx.globalAlpha = 1
}

const DRAW: Record<SceneId, (c: Ctx) => void> = {
  intro: sceneIntro,
  minutes: sceneMinutes,
  genres: sceneGenres,
  artists: sceneArtists,
  songs: sceneSongs,
  clock: sceneClock,
  outro: sceneOutro
}

const EXIT = 0.4

/** Draws the frame at `F.time` on a canvas `scale` times the 1080×1920 board. */
export function drawRecap(
  ctx: CanvasRenderingContext2D,
  S: RecapState,
  d: RecapData,
  A: RecapAssets,
  scenes: Scene[],
  F: RecapFrame,
  scale: number
): void {
  const time = F.time
  const dt = S.lastT < 0 || time < S.lastT ? 1 / 30 : Math.min(0.1, time - S.lastT)
  S.lastT = time
  S.pulse = Math.max(S.pulse * Math.exp(-dt * 7), F.kick)
  S.flash = F.hit ? 1 : S.flash * Math.exp(-dt * 5)

  let i = scenes.findIndex((s) => time < s.start + s.dur)
  if (i < 0) i = scenes.length - 1
  const sc = scenes[i]
  const t = time - sc.start
  // the colour drifts a little from scene to scene
  const h = A.hue + i * 18 + Math.min(1, t / sc.dur) * 18

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  drawBackground(ctx, S, h, time, dt)
  drawBrand(ctx, sc.id === 'outro' ? 0 : 1)

  // scenes fade and lift away as the next one comes
  const last = i === scenes.length - 1
  const out = last ? 0 : easeOut((t - (sc.dur - EXIT)) / EXIT)
  const scene: Ctx = { ctx, d, A, S, t, dur: sc.dur, h }
  if (out > 0) {
    // draw the leaving scene on its own layer so it can fade as a whole
    const W = ctx.canvas.width
    const H = ctx.canvas.height
    if (!S.layer || S.layer.width !== W || S.layer.height !== H) {
      S.layer = document.createElement('canvas')
      S.layer.width = W
      S.layer.height = H
    }
    const lctx = S.layer.getContext('2d')!
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.clearRect(0, 0, W, H)
    lctx.setTransform(scale, 0, 0, scale, 0, 0)
    DRAW[sc.id]({ ...scene, ctx: lctx })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1 - out
    ctx.drawImage(S.layer, 0, -out * 80 * scale)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
  } else DRAW[sc.id](scene)
  ctx.globalAlpha = 1

  // a soft flash on big hits and scene changes
  const enterFlash = Math.max(0, 1 - t / 0.35) * (i > 0 ? 0.35 : 0)
  const flash = Math.max(S.flash * 0.18, enterFlash)
  if (flash > 0.01) {
    ctx.fillStyle = hsl(h + 20, 100, 85, flash)
    ctx.fillRect(0, 0, RECAP_W, RECAP_H)
  }

  // progress ticks at the top, like a story
  const segW = (RECAP_W - 80 - (scenes.length - 1) * 10) / scenes.length
  scenes.forEach((s, k) => {
    const x = 40 + k * (segW + 10)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    roundRect(ctx, x, 40, segW, 8, 4)
    ctx.fill()
    const p = clamp01((time - s.start) / s.dur)
    if (p > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      roundRect(ctx, x, 40, Math.max(8, segW * p), 8, 4)
      ctx.fill()
    }
  })
}
