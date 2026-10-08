import type { WorldContext } from './types'
import { canvasDpr } from '@/utils/perf'

/**
 * Shared tools for the detailed worlds: a scene is designed on a fixed board
 * (1600×900) and scaled to cover the screen; everything that doesn't move is
 * painted once into offscreen layers; glows are cached sprites.
 */

export const BW = 1600
export const BH = 900

export type Layer = HTMLCanvasElement

export interface View {
  w: number
  h: number
  dpr: number
  /** board → screen scale and offset (cover fit) */
  s: number
  ox: number
  oy: number
}

/** The cover-fit view for this frame's canvas size. */
export function viewFor(c: WorldContext): View {
  const dpr = canvasDpr()
  const s = Math.max(c.width / BW, c.height / BH)
  return { w: c.width, h: c.height, dpr, s, ox: (c.width - BW * s) / 2, oy: (c.height - BH * s) / 2 }
}

export function sameView(a: View | null | undefined, b: View): boolean {
  return !!a && a.w === b.w && a.h === b.h && a.dpr === b.dpr
}

/** A screen-sized offscreen layer, painted in board coordinates. */
export function makeLayer(v: View, paint: (g: CanvasRenderingContext2D) => void): Layer {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(v.w * v.dpr))
  c.height = Math.max(1, Math.round(v.h * v.dpr))
  const g = c.getContext('2d')!
  g.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy)
  paint(g)
  return c
}

/** A deterministic random stream, so a scene looks the same every time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Soft round glow sprite in one colour ("r,g,b"). */
export function glowSprite(rgb: string, size = 128): Layer {
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

/** Applies the board transform to the frame's context (call inside save/restore). */
export function toBoard(ctx: CanvasRenderingContext2D, v: View): void {
  ctx.translate(v.ox, v.oy)
  ctx.scale(v.s, v.s)
}

/** Linear blend of two "r,g,b" triplets. */
export function mixRgb(a: [number, number, number], b: [number, number, number], k: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`
}

/** Smooth 3D value noise and its fractal sum (0..1), for procedural textures. */
export function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const l = (a: number, b: number, t: number): number => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  )
}

export function fbm(x: number, y: number, z: number, oct: number): number {
  let a = 0.5
  let f = 1
  let s = 0
  let n = 0
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f)
    n += a
    a *= 0.5
    f *= 2.03
  }
  return s / n
}
