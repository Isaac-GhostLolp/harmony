/**
 * Appearance — every theme in Harmony, classic or made by the user, is one
 * `Look`: a handful of human choices (colours, how glassy the panels are,
 * how round the corners, the font…). A Look compiles into the CSS tokens the
 * whole UI is built on (--bg-base, --bg-surface, --accent, …, see
 * globals.css), written into one <style> tag. Components never change: they
 * keep reading the tokens.
 *
 * The classic themes are Looks too (they reproduce the old hand-written
 * tokens exactly), so "start from Synthwave and make the corners square" is
 * just editing a Look. A Look also names a `flavor`: the classic whose extra
 * touches (the Synthwave neon titles, Pixel's crisp edges) come along.
 *
 * The last applied Look is cached in localStorage so it is painted before the
 * first frame (no flash of the default theme on boot).
 */
import type { ThemeName } from '@/types'

export type FontId = 'system' | 'nunito' | 'outfit' | 'lora' | 'mono' | 'pixel'
export type ShadowStyle = 'soft' | 'glow' | 'hard' | 'none'

export interface Look {
  /** the classic whose extra CSS touches apply (data-theme) */
  flavor: ThemeName
  /** window background, and an optional second colour for a gradient */
  bg: string
  bg2: string | null
  /** panels: a tint laid over the background… */
  tint: string
  tintAlpha: number // 0..40 (%)
  /** …backed by the background colour itself: 0 = glass, 100 = solid */
  opacity: number // 0..100
  blur: number // 0..40 px (only where something moves behind the panel)
  text: string
  accent: string
  /** the accent follows the colours of the cover that's playing */
  followCover: boolean
  border: string
  borderAlpha: number // 0..40 (%)
  /** corner rounding, % of the default (0 = square, 200 = very round) */
  radius: number // 0..200
  shadow: ShadowStyle
  shadowStrength: number // 0..100
  /** the soft coloured glow behind the app */
  glow: number // 0..100
  font: FontId
}

export const FONTS: { id: FontId; label: string; family: string }[] = [
  { id: 'system', label: 'Padrão', family: "'Segoe UI', 'Inter', system-ui, sans-serif" },
  { id: 'nunito', label: 'Arredondada', family: "'Nunito Variable', 'Segoe UI', system-ui, sans-serif" },
  { id: 'outfit', label: 'Moderna', family: "'Outfit Variable', 'Segoe UI', system-ui, sans-serif" },
  { id: 'lora', label: 'Clássica', family: "'Lora Variable', Georgia, serif" },
  { id: 'mono', label: 'Código', family: "'JetBrains Mono Variable', ui-monospace, monospace" },
  { id: 'pixel', label: 'Pixel', family: "'Pixelify Sans Variable', 'Courier New', monospace" }
]

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface Preset {
  id: string
  name: string
  group: 'classic' | 'new'
  look: Look
}

const base: Omit<Look, 'flavor' | 'bg' | 'text' | 'accent'> = {
  bg2: null,
  tint: '#ffffff',
  tintAlpha: 4,
  opacity: 0,
  blur: 18,
  followCover: true,
  border: '#ffffff',
  borderAlpha: 8,
  radius: 100,
  shadow: 'soft',
  shadowStrength: 50,
  glow: 100,
  font: 'system'
}

const look = (l: Partial<Look> & Pick<Look, 'flavor' | 'bg' | 'text' | 'accent'>): Look => ({ ...base, ...l })

export const PRESETS: Preset[] = [
  // the classics, exactly as they always looked
  { id: 'dark', name: 'Dark', group: 'classic', look: look({ flavor: 'dark', bg: '#0b0b10', text: '#f4f4f6', accent: '#7c6cf4' }) },
  { id: 'darkpro', name: 'Dark Pro', group: 'classic', look: look({ flavor: 'darkpro', bg: '#050506', text: '#fafafa', accent: '#e4e4e7', tintAlpha: 3, borderAlpha: 6, shadowStrength: 100 }) },
  { id: 'light', name: 'Light', group: 'classic', look: look({ flavor: 'light', bg: '#f3f2f7', text: '#17171c', accent: '#5b48e0', tint: '#000000', border: '#000000', borderAlpha: 7 }) },
  { id: 'amoled', name: 'AMOLED', group: 'classic', look: look({ flavor: 'amoled', bg: '#000000', text: '#ffffff', accent: '#3ddc97', tintAlpha: 5, borderAlpha: 10, shadowStrength: 100 }) },
  { id: 'glass', name: 'Glass', group: 'classic', look: look({ flavor: 'glass', bg: '#0e1017', bg2: '#151a2c', text: '#f4f6ff', accent: '#8ab4ff', tintAlpha: 7, blur: 22, borderAlpha: 16, shadowStrength: 65 }) },
  { id: 'synthwave', name: 'Synthwave', group: 'classic', look: look({ flavor: 'synthwave', bg: '#1a0b2e', bg2: '#2a1240', text: '#fdf0ff', accent: '#ff2d95', tint: '#ff2d95', tintAlpha: 6, border: '#5ee7ff', borderAlpha: 22, shadow: 'glow', shadowStrength: 60 }) },
  { id: 'nature', name: 'Nature', group: 'classic', look: look({ flavor: 'nature', bg: '#10201a', text: '#eef7ee', accent: '#6fcf7f', tint: '#7ac878', tintAlpha: 5, border: '#6fcf7f', borderAlpha: 16, radius: 125, shadowStrength: 70 }) },
  { id: 'cyberpunk', name: 'Cyberpunk', group: 'classic', look: look({ flavor: 'cyberpunk', bg: '#0d0221', text: '#eafffd', accent: '#ff2a6d', tint: '#ff2aff', tintAlpha: 6, border: '#00fff9', borderAlpha: 20, shadow: 'glow', shadowStrength: 45 }) },
  { id: 'ghostguard', name: 'GhostGuard', group: 'classic', look: look({ flavor: 'ghostguard', bg: '#0a0e14', text: '#e6fffb', accent: '#2dd4bf', tint: '#5eead4', tintAlpha: 5, border: '#2dd4bf', borderAlpha: 16, shadowStrength: 85 }) },
  { id: 'pixel', name: 'Pixel Art', group: 'classic', look: look({ flavor: 'pixel', bg: '#1a1c2c', text: '#f4f4f4', accent: '#ffcd75', tintAlpha: 6, borderAlpha: 14, radius: 0, shadow: 'hard', shadowStrength: 50, font: 'pixel' }) },

  // new looks for 0.18
  { id: 'aurora', name: 'Aurora', group: 'new', look: look({ flavor: 'dark', bg: '#071419', bg2: '#1a0f2e', text: '#ecfbff', accent: '#5eead4', tint: '#7dd3fc', tintAlpha: 5, opacity: 10, border: '#a5f3fc', borderAlpha: 12, radius: 130, glow: 100, font: 'outfit' }) },
  { id: 'sakura', name: 'Sakura', group: 'new', look: look({ flavor: 'light', bg: '#fff4f7', bg2: '#fde2ea', text: '#3a1f2b', accent: '#e8578a', tint: '#ffffff', tintAlpha: 55, opacity: 20, blur: 20, border: '#e8578a', borderAlpha: 14, radius: 150, shadowStrength: 35, font: 'nunito' }) },
  { id: 'ocean', name: 'Oceano', group: 'new', look: look({ flavor: 'dark', bg: '#03121f', bg2: '#062a3d', text: '#e6f6ff', accent: '#38bdf8', tint: '#38bdf8', tintAlpha: 5, opacity: 25, border: '#7dd3fc', borderAlpha: 12, radius: 120, shadowStrength: 70 }) },
  { id: 'cafe', name: 'Café', group: 'new', look: look({ flavor: 'dark', bg: '#1b1410', bg2: '#2a1d15', text: '#f5ebe0', accent: '#d4a373', tint: '#e6ccb2', tintAlpha: 5, opacity: 30, border: '#e6ccb2', borderAlpha: 10, radius: 110, shadowStrength: 60, glow: 60, font: 'lora' }) },
  { id: 'snow', name: 'Neve', group: 'new', look: look({ flavor: 'light', bg: '#f7f9fc', text: '#14213d', accent: '#3a86ff', tint: '#ffffff', tintAlpha: 70, opacity: 40, border: '#14213d', borderAlpha: 8, radius: 160, shadowStrength: 30, glow: 50, font: 'nunito' }) },
  { id: 'wine', name: 'Vinho', group: 'new', look: look({ flavor: 'dark', bg: '#16070c', bg2: '#2b0d18', text: '#fbeef2', accent: '#e11d48', tint: '#fb7185', tintAlpha: 5, opacity: 20, border: '#fb7185', borderAlpha: 12, radius: 90, shadowStrength: 80, font: 'lora' }) },
  { id: 'mint', name: 'Menta', group: 'new', look: look({ flavor: 'light', bg: '#effaf5', bg2: '#dcf5ea', text: '#10302a', accent: '#10b981', tint: '#ffffff', tintAlpha: 60, opacity: 25, border: '#10b981', borderAlpha: 14, radius: 140, shadowStrength: 30, font: 'outfit' }) },
  { id: 'sunset', name: 'Pôr do sol', group: 'new', look: look({ flavor: 'dark', bg: '#1f0b24', bg2: '#3d1414', text: '#fff1e6', accent: '#ff8a3d', tint: '#ffb26b', tintAlpha: 6, opacity: 10, blur: 24, border: '#ffb26b', borderAlpha: 16, radius: 130, shadow: 'glow', shadowStrength: 40, font: 'outfit' }) },
  { id: 'terminal', name: 'Terminal', group: 'new', look: look({ flavor: 'darkpro', bg: '#020a04', text: '#c8ffd4', accent: '#22ff66', tint: '#22ff66', tintAlpha: 4, opacity: 50, border: '#22ff66', borderAlpha: 22, radius: 25, shadow: 'glow', shadowStrength: 30, glow: 40, font: 'mono' }) },
  { id: 'paper', name: 'Papel', group: 'new', look: look({ flavor: 'light', bg: '#f4efe6', text: '#2b2620', accent: '#b45309', tint: '#fffdf8', tintAlpha: 75, opacity: 60, border: '#2b2620', borderAlpha: 12, radius: 60, shadow: 'hard', shadowStrength: 25, glow: 0, font: 'lora' }) }
]

export const DEFAULT_PRESET = 'dark'

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** relative luminance, 0 (black) .. 1 (white) */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const isLightLook = (l: Look): boolean => luminance(l.bg) > 0.4

const rgba = (c: RGB, a: number): string =>
  `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${Math.max(0, Math.min(1, a)).toFixed(3)})`

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

/** The CSS custom properties for a Look. */
export function lookTokens(l: Look): Record<string, string> {
  const light = isLightLook(l)
  const bg = hexToRgb(l.bg)
  const text = hexToRgb(l.text)
  const tint = hexToRgb(l.tint)
  const accent = hexToRgb(l.accent)

  // panel = the tint (alpha a1) over a backing of the background colour
  // (alpha a2), flattened into one rgba so it works anywhere a colour does
  const a1 = l.tintAlpha / 100
  const a2 = l.opacity / 100
  const a = a1 + a2 * (1 - a1)
  const surface: RGB = a > 0 ? (tint.map((t, i) => (t * a1 + bg[i] * a2 * (1 - a1)) / a) as RGB) : tint
  // chips and buttons sit on the panels: a bit more of the tint (on light
  // looks: frosted white, as the classic Light always had)
  const raised = light ? rgba([255, 255, 255], 0.55 + 0.3 * (1 - a2)) : rgba(tint, Math.min(1, a1 * 2 + a2 * 0.06))

  const s = l.shadowStrength / 100
  const shadow =
    l.shadow === 'none' || s === 0
      ? 'none'
      : l.shadow === 'glow'
        ? `0 0 ${Math.round(16 + 16 * s)}px ${rgba(accent, 0.15 + 0.35 * s)}`
        : l.shadow === 'hard'
          ? `${Math.round(2 + 4 * s)}px ${Math.round(2 + 4 * s)}px 0 ${rgba(light ? [40, 30, 20] : [0, 0, 0], 0.25 + 0.4 * s)}`
          : light
            ? `0 8px 24px ${rgba([20, 20, 40], 0.2 * s)}`
            : `0 8px 32px ${rgba([0, 0, 0], 0.7 * s)}`

  const font = FONTS.find((f) => f.id === l.font) ?? FONTS[0]
  return {
    '--bg-base': l.bg,
    '--bg-image': l.bg2 ? `linear-gradient(160deg, ${l.bg} 0%, ${l.bg2} 100%)` : 'none',
    '--bg-surface': rgba(surface, a),
    '--bg-raised': raised,
    '--text-primary': l.text,
    '--text-muted': rgbToHex(mix(text, bg, light ? 0.38 : 0.42)),
    '--accent': l.accent,
    '--accent-soft': rgba(accent, light ? 0.14 : 0.18),
    '--glass-border': rgba(hexToRgb(l.border), l.borderAlpha / 100),
    '--shadow': shadow,
    '--panel-blur': `${l.blur}px`,
    '--rk': String(l.radius / 100),
    '--glow': String(l.glow / 100),
    '--font-ui': font.family
  }
}

const STYLE_ID = 'harmony-look'
const CACHE_KEY = 'harmony.look'

let stamp = 0
/** Changes every time a Look is applied (canvases re-read the accent). */
export const lookStamp = (): number => stamp

/** Paint a Look on the app. */
export function applyLook(l: Look, cache = true): void {
  const root = document.documentElement
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = STYLE_ID
    document.head.appendChild(tag)
  }
  const vars = Object.entries(lookTokens(l))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  // :root[data-theme] outranks the classic [data-theme='…'] blocks in
  // globals.css; the cover's accent (set inline) still wins over both
  tag.textContent = `:root[data-theme] {\n${vars}\n}`
  root.setAttribute('data-theme', l.flavor)
  root.setAttribute('data-tone', isLightLook(l) ? 'light' : 'dark')
  root.toggleAttribute('data-square', l.radius === 0)
  root.toggleAttribute('data-fixed-accent', !l.followCover)
  // a pale accent (yellow, mint…) gets dark text on its buttons: white text
  // only reads (3:1 contrast) on an accent darker than ~0.35 luminance
  root.setAttribute('data-look-accent', luminance(l.accent) > 0.35 ? 'light' : 'dark')
  stamp++
  if (cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(l))
    } catch {
      /* the settings file still has it */
    }
  }
}

/** Fill gaps in a Look that came from disk or a shared file. */
export function sanitizeLook(raw: unknown, fallback: Look = findPreset(DEFAULT_PRESET)!.look): Look {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...fallback }
  const hex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
  const num = (v: unknown, lo: number, hi: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined
  const flavors: ThemeName[] = ['dark', 'light', 'amoled', 'cyberpunk', 'ghostguard', 'pixel', 'synthwave', 'nature', 'glass', 'darkpro']
  if (flavors.includes(r.flavor as ThemeName)) out.flavor = r.flavor as ThemeName
  for (const k of ['bg', 'tint', 'text', 'accent', 'border'] as const) if (hex(r[k])) out[k] = r[k] as string
  out.bg2 = hex(r.bg2) ? r.bg2 : r.bg2 === null ? null : out.bg2
  out.tintAlpha = num(r.tintAlpha, 0, 100) ?? out.tintAlpha
  out.opacity = num(r.opacity, 0, 100) ?? out.opacity
  out.blur = num(r.blur, 0, 40) ?? out.blur
  out.borderAlpha = num(r.borderAlpha, 0, 100) ?? out.borderAlpha
  out.radius = num(r.radius, 0, 200) ?? out.radius
  out.shadowStrength = num(r.shadowStrength, 0, 100) ?? out.shadowStrength
  out.glow = num(r.glow, 0, 100) ?? out.glow
  if (typeof r.followCover === 'boolean') out.followCover = r.followCover
  if (['soft', 'glow', 'hard', 'none'].includes(r.shadow as string)) out.shadow = r.shadow as ShadowStyle
  if (FONTS.some((f) => f.id === r.font)) out.font = r.font as FontId
  return out
}

// paint the cached Look right away, before React mounts
try {
  const cached = localStorage.getItem(CACHE_KEY)
  if (cached) applyLook(sanitizeLook(JSON.parse(cached)), false)
} catch {
  /* the default theme from globals.css stays until settings load */
}

// ---------------------------------------------------------------------------
// "Surprise me"
// ---------------------------------------------------------------------------

function hsl(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255])
}

/** A random but harmonious Look: one hue family, a contrasting accent. */
export function randomLook(): Look {
  const r = Math.random
  const h = Math.floor(r() * 360)
  const light = r() < 0.3
  // accent: complementary, triadic or analogous to the background hue
  const accentHue = (h + [180, 120, 240, 35, -35][Math.floor(r() * 5)] + 360) % 360
  const fonts: FontId[] = ['system', 'nunito', 'outfit', 'lora', 'mono']
  return {
    flavor: light ? 'light' : 'dark',
    bg: light ? hsl(h, 45, 95) : hsl(h, 40, 6),
    bg2: r() < 0.6 ? (light ? hsl((h + 30) % 360, 50, 89) : hsl((h + 40) % 360, 45, 13)) : null,
    tint: light ? '#ffffff' : hsl(h, 60, 70),
    tintAlpha: light ? 55 + Math.floor(r() * 25) : 4 + Math.floor(r() * 4),
    opacity: Math.floor(r() * 40),
    blur: 12 + Math.floor(r() * 16),
    text: light ? hsl(h, 35, 14) : hsl(h, 30, 95),
    accent: light ? hsl(accentHue, 70, 48) : hsl(accentHue, 85, 62),
    followCover: r() < 0.5,
    border: light ? hsl(h, 35, 20) : hsl(h, 60, 80),
    borderAlpha: 6 + Math.floor(r() * 12),
    radius: [40, 80, 100, 130, 160][Math.floor(r() * 5)],
    shadow: (['soft', 'soft', 'glow', 'hard'] as ShadowStyle[])[Math.floor(r() * 4)],
    shadowStrength: 30 + Math.floor(r() * 50),
    glow: Math.floor(40 + r() * 60),
    font: fonts[Math.floor(r() * fonts.length)]
  }
}
