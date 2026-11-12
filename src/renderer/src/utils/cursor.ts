import { create } from 'zustand'
import { useUiStore } from '@/store/uiStore'
import { getAutoPick, onAutoPick } from '@/worlds/auto'

/**
 * Custom cursor (desktop only): the mouse pointer inside the Harmony's
 * window, drawn in the theme's colour — a few packs, or the listener's own
 * image. Three shapes per pack: the arrow, the "click here" one (buttons,
 * links) and the text one.
 *
 * The images are drawn here (SVG → PNG at 1× and 2×, so they're sharp on
 * HiDPI screens) and handed to CSS as variables; globals.css applies them
 * under `html.has-cursor`. The live cursor (components/CursorLayer) draws
 * the same images itself, so they can pulse with the beat — and the
 * animated packs (vinyl, equalizer, note) move only there.
 *
 * Trails and click effects work with any cursor, the system's too.
 * "Seguir o Mundo" lets the living World choose the pack and the trail.
 *
 * The choice lives in localStorage (applied before the first paint, no flash
 * of the system arrow) and is mirrored to the app settings.
 */

export type CursorPack =
  | 'system'
  | 'theme'
  | 'pick'
  | 'pixel'
  | 'neon'
  | 'baton'
  | 'mic'
  | 'headphones'
  | 'heart'
  | 'vinyl'
  | 'eq'
  | 'note'
  | 'custom'
export type CursorSize = 24 | 32 | 40
export type Trail = 'none' | 'notes' | 'sparkles' | 'comet' | 'wave' | 'confetti' | 'emoji'
export type ClickEffect = 'none' | 'wave' | 'notes'

export interface CursorConfig {
  pack: CursorPack
  size: CursorSize
  /** the listener's image (a small PNG data URL), for 'custom' */
  custom: string | null
  /** an animated GIF the listener chose (shown moving by the live cursor) */
  customAnim: string | null
  /** where a custom image points: its top-left corner or its centre */
  customHotspot: 'corner' | 'center'
  /** the live cursor: drawn by the page, it can pulse and animate */
  live: boolean
  beat: boolean
  grow: boolean
  trail: Trail
  /** the emoji of the 'emoji' trail */
  trailEmoji: string
  click: ClickEffect
  /** the living World chooses the pack and the trail */
  followWorld: boolean
}

/** the packs, in the picker's order; `animated` ones move with the live cursor */
export const CURSOR_PACKS: { id: CursorPack; label: string; animated?: boolean }[] = [
  { id: 'system', label: 'Do sistema' },
  { id: 'theme', label: 'Seta do tema' },
  { id: 'pick', label: 'Palheta' },
  { id: 'pixel', label: 'Pixel' },
  { id: 'neon', label: 'Neon' },
  { id: 'baton', label: 'Batuta' },
  { id: 'mic', label: 'Microfone' },
  { id: 'headphones', label: 'Fone' },
  { id: 'heart', label: 'Coração' },
  { id: 'vinyl', label: 'Vinil', animated: true },
  { id: 'eq', label: 'Equalizador', animated: true },
  { id: 'note', label: 'Nota', animated: true },
  { id: 'custom', label: 'Meu cursor' }
]

export const isAnimated = (pack: CursorPack): boolean => Boolean(CURSOR_PACKS.find((p) => p.id === pack)?.animated)

const KEY = 'harmony.cursor'

const DEFAULTS: CursorConfig = {
  pack: 'system',
  size: 32,
  custom: null,
  customAnim: null,
  customHotspot: 'corner',
  live: false,
  beat: true,
  grow: true,
  trail: 'none',
  trailEmoji: '💜',
  click: 'none',
  followWorld: false
}

function load(): CursorConfig {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CursorConfig>) }
  } catch {
    return DEFAULTS
  }
}

export interface CursorImage {
  x1: string
  x2: string
  /** the hotspot, in CSS pixels */
  hx: number
  hy: number
}

export interface CursorImages {
  arrow: CursorImage
  pointer: CursorImage
  text: CursorImage | null
}

/** what's actually in use: the listener's choice, or the World's when it leads */
export interface Effective {
  pack: CursorPack
  trail: Trail
  trailEmoji: string
}

interface CursorState extends CursorConfig {
  set: (patch: Partial<CursorConfig>) => void
  /** the drawn images, once ready (null with the system cursor) */
  images: CursorImages | null
  effective: Effective
}

const configOf = (s: CursorConfig): CursorConfig => ({
  pack: s.pack,
  size: s.size,
  custom: s.custom,
  customAnim: s.customAnim,
  customHotspot: s.customHotspot,
  live: s.live,
  beat: s.beat,
  grow: s.grow,
  trail: s.trail,
  trailEmoji: s.trailEmoji,
  click: s.click,
  followWorld: s.followWorld
})

export const useCursorStore = create<CursorState>((set, get) => {
  const initial = load()
  return {
    ...initial,
    images: null,
    effective: { pack: initial.pack, trail: initial.trail, trailEmoji: initial.trailEmoji },
    set: (patch) => {
      set(patch)
      const cfg = configOf(get())
      try {
        localStorage.setItem(KEY, JSON.stringify(cfg))
      } catch {
        /* kept for this session */
      }
      window.harmony?.settings.set('cursor', cfg)
      void applyCursor()
    }
  }
})

// ── the World's cursor ────────────────────────────────────────────────

/** each living World's cursor: a pack (or the listener's own) and a trail */
const WORLD_STYLE: Record<string, Partial<Effective>> = {
  ocean: { trail: 'emoji', trailEmoji: '🫧' },
  rain: { trail: 'emoji', trailEmoji: '💧' },
  winter: { trail: 'emoji', trailEmoji: '❄️' },
  christmas: { trail: 'emoji', trailEmoji: '❄️' },
  halloween: { trail: 'emoji', trailEmoji: '🎃' },
  newyear: { trail: 'confetti' },
  nature: { trail: 'emoji', trailEmoji: '🍃' },
  'japanese-garden': { trail: 'emoji', trailEmoji: '🌸' },
  'coffee-shop': { trail: 'emoji', trailEmoji: '☕' },
  volcano: { trail: 'emoji', trailEmoji: '🔥' },
  desert: { trail: 'sparkles' },
  'space-station': { trail: 'emoji', trailEmoji: '⭐' },
  blackhole: { pack: 'neon', trail: 'comet' },
  biolum: { pack: 'neon', trail: 'sparkles' },
  synthwave: { pack: 'neon', trail: 'comet' },
  'cyber-city': { pack: 'neon', trail: 'wave' },
  arcade: { pack: 'pixel', trail: 'confetti' },
  coderain: { pack: 'pixel', trail: 'emoji', trailEmoji: '1' }
}

function currentWorld(): string | null {
  const w = useUiStore.getState().world
  if (w === 'auto') return getAutoPick()?.worldId ?? null
  return w
}

function effectiveOf(cfg: CursorConfig): Effective {
  const mine: Effective = { pack: cfg.pack, trail: cfg.trail, trailEmoji: cfg.trailEmoji }
  if (!cfg.followWorld) return mine
  const world = currentWorld()
  const style = world ? WORLD_STYLE[world] : undefined
  if (!style) return mine
  return {
    // the World's pack only replaces the system arrow or a theme pack, never the listener's own image
    pack: style.pack && cfg.pack !== 'custom' ? style.pack : mine.pack === 'system' ? 'theme' : mine.pack,
    trail: style.trail ?? mine.trail,
    trailEmoji: style.trailEmoji ?? mine.trailEmoji
  }
}

// ── drawing ───────────────────────────────────────────────────────────

const OUTLINE = '#ffffff'
const SHADOW = `<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#000" flood-opacity="0.45"/></filter>`

const ARROW = 'M4 2.5 L4 24.5 L9.6 19.2 L13.3 27.6 L17 26 L13.4 17.8 L21 17.8 Z'
const PICK = 'M3.5 3.5 C14 2 26.5 6 27.5 13.5 C28.5 21 17.5 29 10.5 28 C5 27.2 2.5 15.5 3.5 3.5 Z'
/** an 8-bit arrow and an 8-bit hand, on a 16×16 grid, drawn at 2× */
const PIXEL = 'M1 1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-4v1h1v2h1v2h-2v-2h-1v-2h-1v1h-1v1h-1v1h-1z'
const PIXEL_HAND =
  'M4 1h2v5h1v-1h2v1h1v-1h2v1h1v1h1v6h-1v2h-7v-2h-1v-1h-1v-1h-1v-1h-1v-2h2v1h1v-7h0z'
const HEART =
  'M16 27.5 C9 22 3.5 17.5 3.5 11.6 C3.5 7.5 6.6 4.5 10.4 4.5 C12.8 4.5 14.8 5.8 16 7.8 C17.2 5.8 19.2 4.5 21.6 4.5 C25.4 4.5 28.5 7.5 28.5 11.6 C28.5 17.5 23 22 16 27.5 Z'

function svg(body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>${SHADOW}${defs}</defs>${body}</svg>`
}

/** the little "click" badge on the pointer shape: a play triangle in a circle */
function badge(accent: string): string {
  return `<g filter="url(#s)"><circle cx="24" cy="24" r="6.5" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.5"/><path d="M22.4 21.2 L27 24 L22.4 26.8 Z" fill="#fff"/></g>`
}

interface Shapes {
  arrow: string
  pointer: string
  text: string
  /** hotspot in the 32-px grid */
  hotspot: [number, number]
}

function shapes(pack: CursorPack, accent: string): Shapes {
  const text = svg(
    `<g filter="url(#s)" fill="none" stroke-linecap="round"><path d="M11 5h10M11 27h10M16 5v22" stroke="${OUTLINE}" stroke-width="4.5"/><path d="M11 5h10M11 27h10M16 5v22" stroke="${accent}" stroke-width="2"/></g>`
  )
  const withBadge = (body: string, hotspot: [number, number], defs = ''): Shapes => ({
    arrow: svg(body, defs),
    pointer: svg(body + badge(accent), defs),
    text,
    hotspot
  })
  switch (pack) {
    case 'pick':
      return withBadge(
        `<path d="${PICK}" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.8" filter="url(#s)"/><path d="M8 9 C12 8 16 9 18 11" stroke="#ffffff" stroke-opacity=".45" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
        [3.5, 3.5]
      )
    case 'pixel': {
      const arrow = `<g transform="scale(2)" shape-rendering="crispEdges"><path d="${PIXEL}" fill="${accent}" stroke="#ffffff" stroke-width="0.6"/></g>`
      const hand = `<g transform="scale(2)" shape-rendering="crispEdges"><path d="${PIXEL_HAND}" fill="${accent}" stroke="#ffffff" stroke-width="0.6"/></g>`
      return { arrow: svg(arrow), pointer: svg(hand), text, hotspot: [2, 2] }
    }
    case 'neon': {
      const glow = `<filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      return withBadge(
        `<path d="${ARROW}" fill="#0b0b10" fill-opacity=".55" stroke="${accent}" stroke-width="2" stroke-linejoin="round" filter="url(#g)"/>`,
        [4, 2.5],
        glow
      )
    }
    case 'baton':
      // a conductor's baton: the tip points up-left
      return withBadge(
        `<g filter="url(#s)"><path d="M3 3 L20.5 20.5" stroke="${OUTLINE}" stroke-width="4.2" stroke-linecap="round"/><path d="M3 3 L20.5 20.5" stroke="${accent}" stroke-width="2" stroke-linecap="round"/><rect x="18" y="18" width="7" height="7" rx="2.5" transform="rotate(45 21.5 21.5)" fill="#3a2a1f" stroke="${OUTLINE}" stroke-width="1.4"/></g>`,
        [3, 3]
      )
    case 'mic':
      return withBadge(
        `<g filter="url(#s)" transform="rotate(-35 16 16)"><rect x="11" y="1.5" width="10" height="15" rx="5" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.6"/><path d="M12 6h8M12 9.5h8M12 13h8" stroke="#fff" stroke-opacity=".5" stroke-width="1"/><path d="M8 13 a8 8 0 0 0 16 0" fill="none" stroke="${OUTLINE}" stroke-width="1.8"/><path d="M16 21v7" stroke="${OUTLINE}" stroke-width="2.2" stroke-linecap="round"/></g>`,
        [6, 4]
      )
    case 'headphones':
      return withBadge(
        `<g filter="url(#s)"><path d="M5 18 V14 a11 11 0 0 1 22 0 V18" fill="none" stroke="${OUTLINE}" stroke-width="4"/><path d="M5 18 V14 a11 11 0 0 1 22 0 V18" fill="none" stroke="${accent}" stroke-width="2"/><rect x="2.5" y="16" width="7" height="11" rx="3" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.5"/><rect x="22.5" y="16" width="7" height="11" rx="3" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.5"/></g>`,
        [16, 4]
      )
    case 'heart':
      return withBadge(
        `<path d="${HEART}" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.8" filter="url(#s)"/><path d="M8.5 9.5 C9.5 8 11 7.5 12.5 7.8" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
        [16, 16]
      )
    case 'vinyl':
      return withBadge(
        `<g filter="url(#s)"><circle cx="16" cy="16" r="13" fill="#111116" stroke="${OUTLINE}" stroke-width="1.5"/><circle cx="16" cy="16" r="10" fill="none" stroke="#2c2c36" stroke-width="0.9"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#2c2c36" stroke-width="0.9"/><path d="M16 4 A12 12 0 0 1 26.4 10" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.3"/><circle cx="16" cy="16" r="4.5" fill="${accent}"/><circle cx="16" cy="16" r="1.2" fill="#111116"/></g>`,
        [16, 16]
      )
    case 'eq':
      return withBadge(
        `<g filter="url(#s)" stroke="${OUTLINE}" stroke-width="1.4"><rect x="4" y="12" width="6" height="16" rx="2" fill="${accent}"/><rect x="13" y="5" width="6" height="23" rx="2" fill="${accent}"/><rect x="22" y="15" width="6" height="13" rx="2" fill="${accent}"/></g>`,
        [4, 4]
      )
    case 'note':
      return withBadge(
        `<g filter="url(#s)"><path d="M13 23 a4.5 4.5 0 1 1-2-3.7 V4 l12 3.5 v5 l-10-2.8 Z" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/></g>`,
        [11, 4]
      )
    default:
      return withBadge(
        `<path d="${ARROW}" fill="${accent}" stroke="${OUTLINE}" stroke-width="1.8" stroke-linejoin="round" filter="url(#s)"/>`,
        [4, 2.5]
      )
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** an image (SVG or the listener's) as PNGs `size` px wide, at 1× and 2× */
async function rasterize(src: string, size: number): Promise<{ x1: string; x2: string }> {
  const img = await loadImage(src)
  const draw = (scale: number): string => {
    const c = document.createElement('canvas')
    c.width = c.height = Math.round(size * scale)
    const g = c.getContext('2d')!
    // the listener's image keeps its proportions, centred
    const r = Math.min(c.width / (img.naturalWidth || c.width), c.height / (img.naturalHeight || c.height))
    const w = (img.naturalWidth || c.width) * r
    const h = (img.naturalHeight || c.height) * r
    g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h)
    return c.toDataURL('image/png')
  }
  return { x1: draw(1), x2: draw(2) }
}

const svgUrl = (s: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`

function accentColour(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6cf4'
}

async function drawImages(cfg: CursorConfig, pack: CursorPack): Promise<CursorImages | null> {
  if (pack === 'system') return null
  const size = cfg.size
  if (pack === 'custom') {
    if (!cfg.custom) return null
    const img = await rasterize(cfg.custom, size)
    const h = cfg.customHotspot === 'center' ? size / 2 : 1
    const pointerScale = 1.15
    const pointer = await rasterize(cfg.custom, Math.round(size * pointerScale))
    const ph = cfg.customHotspot === 'center' ? Math.round(size * pointerScale) / 2 : 1
    return { arrow: { ...img, hx: h, hy: h }, pointer: { ...pointer, hx: ph, hy: ph }, text: null }
  }
  const s = shapes(pack, accentColour())
  const k = size / 32
  const [arrow, pointer, text] = await Promise.all([
    rasterize(svgUrl(s.arrow), size),
    rasterize(svgUrl(s.pointer), size),
    rasterize(svgUrl(s.text), size)
  ])
  const hx = Math.round(s.hotspot[0] * k)
  const hy = Math.round(s.hotspot[1] * k)
  return {
    arrow: { ...arrow, hx, hy },
    pointer: { ...pointer, hx, hy },
    text: { ...text, hx: Math.round(16 * k), hy: Math.round(16 * k) }
  }
}

/** a pack's arrow, for the picker's buttons */
export function packPreview(pack: CursorPack): string | null {
  if (pack === 'system' || pack === 'custom') return null
  return svgUrl(shapes(pack, accentColour()).arrow)
}

const css = (i: CursorImage, fallback: string): string =>
  `-webkit-image-set(url("${i.x1}") 1x, url("${i.x2}") 2x) ${i.hx} ${i.hy}, ${fallback}`

let drawing = 0

/** draws the chosen cursor and hands it to the page's CSS */
export async function applyCursor(): Promise<void> {
  const ticket = ++drawing
  const cfg = configOf(useCursorStore.getState())
  const effective = effectiveOf(cfg)
  const images = await drawImages(cfg, effective.pack).catch(() => null)
  if (ticket !== drawing) return // a newer choice is being drawn
  const root = document.documentElement
  root.classList.toggle('has-cursor', Boolean(images))
  if (images) {
    root.style.setProperty('--cur-arrow', css(images.arrow, 'auto'))
    root.style.setProperty('--cur-pointer', css(images.pointer, 'pointer'))
    root.style.setProperty('--cur-text', images.text ? css(images.text, 'text') : 'text')
  } else {
    for (const v of ['--cur-arrow', '--cur-pointer', '--cur-text']) root.style.removeProperty(v)
  }
  useCursorStore.setState({ images, effective })
}

let watching = false

/** applies the saved cursor; redraws it when the theme's colour or the World changes */
export function startCursor(): void {
  if (watching) return
  watching = true
  void applyCursor()
  let last = accentColour()
  let timer = 0
  new MutationObserver(() => {
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      const now = accentColour()
      if (now !== last) {
        last = now
        const { effective } = useCursorStore.getState()
        if (effective.pack !== 'system' && effective.pack !== 'custom') void applyCursor()
      }
    }, 120)
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
  const worldChanged = (): void => {
    if (useCursorStore.getState().followWorld) void applyCursor()
  }
  useUiStore.subscribe((s, prev) => {
    if (s.world !== prev.world) worldChanged()
  })
  onAutoPick(worldChanged)
}

/** a picked file as a small PNG (the cursor never needs more than 80 px); a GIF also keeps its animation */
export async function fileToCursorImage(file: File): Promise<{ still: string; anim: string | null }> {
  const url = URL.createObjectURL(file)
  try {
    const { x2 } = await rasterize(url, 40)
    let anim: string | null = null
    if (file.type === 'image/gif' && file.size <= 600 * 1024) {
      anim = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = reject
        r.readAsDataURL(file)
      })
    }
    return { still: x2, anim }
  } finally {
    URL.revokeObjectURL(url)
  }
}
