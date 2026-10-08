/**
 * Stage kit — small shared tools for the detailed Show Packs.
 *
 * Packs draw in CSS pixels (W × H) on a context the shell has already scaled
 * for the device and moved by the cinematic camera. Everything that doesn't
 * move is painted once into an offscreen layer (at device resolution) and
 * re-painted only when the size or a key (palette…) changes.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import { canvasDpr } from '@/utils/perf'

export interface LayerCache {
  w: number
  h: number
  dpr: number
  layers: Record<string, HTMLCanvasElement>
}

export function createLayerCache(): LayerCache {
  return { w: 0, h: 0, dpr: 0, layers: {} }
}

/** A cached W×H layer, painted in CSS px; rebuilt when the size changes or the key is new. */
export function layer(cache: LayerCache, key: string, W: number, H: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const dpr = canvasDpr()
  if (cache.w !== W || cache.h !== H || cache.dpr !== dpr) {
    cache.layers = {}
    cache.w = W
    cache.h = H
    cache.dpr = dpr
  }
  let c = cache.layers[key]
  if (!c) {
    c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(W * dpr))
    c.height = Math.max(1, Math.round(H * dpr))
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    paint(g)
    cache.layers[key] = c
  }
  return c
}

/** Drops cached layers whose key starts with a prefix (e.g. when a palette changes). */
export function dropLayers(cache: LayerCache, prefix: string): void {
  for (const k of Object.keys(cache.layers)) if (k.startsWith(prefix)) delete cache.layers[k]
}

/** A deterministic random stream, so a stage looks the same every time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** A soft round glow sprite in one colour ("r,g,b"). */
export function glowSprite(rgb: string, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, `rgba(${rgb},1)`)
  grd.addColorStop(0.25, `rgba(${rgb},0.55)`)
  grd.addColorStop(0.6, `rgba(${rgb},0.14)`)
  grd.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  return c
}

/**
 * A volumetric beam through haze: a soft wide cone plus a brighter core,
 * from (x, y) toward (tx, ty). Call with 'lighter' composite.
 */
export function beam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tx: number,
  ty: number,
  hue: number,
  sat: number,
  light: number,
  intensity: number,
  spread: number
): void {
  if (intensity < 0.02) return
  const L = Math.hypot(tx - x, ty - y)
  const ang = Math.atan2(ty - y, tx - x)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  const g = ctx.createLinearGradient(0, 0, L, 0)
  g.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${intensity * 0.55})`)
  g.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${light}%, ${intensity * 0.16})`)
  g.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = g
  const we = L * spread
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.moveTo(0, -2.5)
  ctx.lineTo(L, -we)
  ctx.lineTo(L, we)
  ctx.lineTo(0, 2.5)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.moveTo(0, -1.2)
  ctx.lineTo(L, -we * 0.22)
  ctx.lineTo(L, we * 0.22)
  ctx.lineTo(0, 1.2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** A laser line (glow + core). Call with 'lighter' composite. */
export function laser(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, hue: number, intensity: number, width = 1.1): void {
  if (intensity < 0.02) return
  const ex = x + Math.cos(a) * len
  const ey = y + Math.sin(a) * len
  ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${intensity * 0.14})`
  ctx.lineWidth = width * 4
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.strokeStyle = `hsla(${hue}, 100%, 72%, ${intensity * 0.85})`
  ctx.lineWidth = width
  ctx.stroke()
}

/** Is the show at its peak right now? */
export function isHot(F: DirectorFrame): boolean {
  return F.state === 'drop' || F.state === 'climax' || F.state === 'finale'
}

/** Average intensity of the moving heads plus the flash: how lit the air is. */
export function airLight(F: DirectorFrame): number {
  let lit = 0
  for (let i = 0; i < F.beams.length; i++) lit += F.beams[i].intensity
  return lit / Math.max(1, F.beams.length) + F.flash * 0.3
}

/**
 * A crowd silhouette along the bottom: bobbing heads, hands that go up with
 * the energy, and a small light per person drawn by the pack (`light`).
 */
export function crowd(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  F: DirectorFrame,
  E: number,
  opts: { fill: string; top: number; heads: number; light?: (x: number, y: number, i: number) => void; helmets?: boolean }
): void {
  const { heads, top } = opts
  const step = W / heads
  ctx.fillStyle = opts.fill
  ctx.beginPath()
  ctx.moveTo(-10, H + 10)
  for (let i = 0; i <= heads; i++) {
    const x = i * step + (((i * 7919) % 13) - 6)
    const bounce = Math.sin(F.t * 6 + i * 1.7) * (1.5 + F.kickTick * 4) * E
    const y = H - top + ((i * 104729) % 11) - bounce
    const r = step * 0.32
    ctx.lineTo(x - r * 1.6, y + r * 1.8)
    ctx.quadraticCurveTo(x - r * 1.3, y + r * 0.9, x - r * 0.75, y + r * 0.9)
    if (opts.helmets) ctx.arc(x, y, r * 1.08, Math.PI * 0.85, Math.PI * 0.15)
    else ctx.arc(x, y, r, Math.PI * 0.9, Math.PI * 0.1)
    ctx.quadraticCurveTo(x + r * 1.3, y + r * 0.9, x + r * 1.6, y + r * 1.8)
  }
  ctx.lineTo(W + 10, H + 10)
  ctx.closePath()
  ctx.fill()
  // visors catch the light (space crowd)
  if (opts.helmets) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i <= heads; i++) {
      const x = i * step + (((i * 7919) % 13) - 6)
      const bounce = Math.sin(F.t * 6 + i * 1.7) * (1.5 + F.kickTick * 4) * E
      const y = H - top + ((i * 104729) % 11) - bounce
      const r = step * 0.32
      // a curved highlight on the visor, not a full disc
      ctx.strokeStyle = `hsla(${F.palette.a}, 70%, 75%, ${0.18 + F.flash * 0.35 + E * 0.12})`
      ctx.lineWidth = Math.max(1, r * 0.12)
      ctx.beginPath()
      ctx.arc(x, y, r * 0.75, Math.PI * 1.15, Math.PI * 1.55)
      ctx.stroke()
    }
    ctx.restore()
  }
  // hands up
  if (E > 0.2) {
    ctx.strokeStyle = opts.fill
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(2, step * 0.14)
    for (let i = 0; i < heads; i += 2) {
      const up = Math.max(0, Math.sin(F.t * 4.5 + i * 2.2)) * (step * 0.9 + F.kick * step) * E
      if (up < step * 0.3) continue
      const x = i * step + step * 0.45
      const y = H - top + step * 0.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.sin(i + F.t) * 3, y - up)
      ctx.stroke()
      opts.light?.(x + Math.sin(i + F.t) * 3, y - up, i)
    }
    ctx.lineCap = 'butt'
  }
}
