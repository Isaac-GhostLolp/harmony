/**
 * ============================================================================
 * Harmony World SDK — public contract
 * ============================================================================
 *
 * A "World" is an immersive, living theme background. Instead of hardcoding
 * each world into the app, a world is a self-contained module that receives a
 * canvas and a live `WorldContext` and draws whatever it wants. This is the
 * exact same shape a community developer would implement — so building the
 * engine here *is* building the SDK.
 *
 * The Theme Director owns the render loop, the canvas sizing, particle-pool
 * timing and lazy-loading; a World only implements `mount`, `frame` and
 * `unmount`. Keeping worlds to this tiny surface makes them cheap to write and
 * safe to swap.
 */

/** Live, per-frame music + environment data handed to a world every frame. */
export interface WorldContext {
  /** Canvas 2D context to draw into (already sized to the viewport in CSS px). */
  ctx: CanvasRenderingContext2D
  /** Logical width/height in CSS pixels (already DPR-corrected via setTransform). */
  width: number
  height: number
  /** Seconds since the world mounted (wall-clock; steady across displays). */
  time: number
  /** Seconds since last frame (already clamped, safe for integration). */
  dt: number

  // ---- Music (0..1 unless noted) — sourced from the StageDirector -----------
  playing: boolean
  /** Normalized track progress 0..1. */
  progress: number
  /** Low-end punch envelope — great for pulsing/impacts. */
  kick: number
  /** Small one-kick envelope for subtle motion. */
  kickTick: number
  /** Bass energy (0..1). */
  bass: number
  /** Vocal-band energy (0..1). */
  vocals: number
  /** Hi-hat / high-band energy (0..1). */
  hihats: number
  /** Overall heat 0..1 (normalized from the director's 0..100). */
  energy: number
  /** True for exactly one frame on a musically significant hit. */
  impactHit: boolean
  /** Envelope of the last big hit (0..1). */
  impact: number
  /** Slow breathing 0..1 — never a frozen frame. */
  breath: number
  /** Gentle side-to-side sway -1..1. */
  sway: number
  /** Frequency spectrum, `spectrumBins` values 0..1 (low → high). */
  spectrum: number[]

  // ---- Palette / art --------------------------------------------------------
  /** Accent color derived from the current cover, as `r,g,b` triplet 0..255. */
  accent: [number, number, number]
  /** Cover image element if available (already loaded), else null. */
  cover: HTMLImageElement | null

  // ---- Environment ----------------------------------------------------------
  /** 0..1 across the day (0 = midnight, 0.5 = noon) — for day/night worlds. */
  dayPhase: number
}

/** A World module. `id`/`name` describe it; the three methods run it. */
export interface World {
  id: string
  name: string
  /** Optional: number of spectrum bins the world wants (default 32). */
  spectrumBins?: number
  /** Called once when the world becomes active. Allocate pools here. */
  mount?(ctx: WorldContext): void
  /** Called every animation frame. Draw here. Keep it allocation-free. */
  frame(ctx: WorldContext): void
  /** Called once when the world is torn down. Release anything here. */
  unmount?(): void
}

/** Simple particle used by most worlds; pooled by helpers below. */
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  data: number // free scratch value (hue, phase, depth…)
  active: boolean
}

/**
 * A fixed-size particle pool. Avoids per-frame allocation (a key perf rule for
 * the heavier worlds). Worlds `spawn()` and iterate `each()`; dead particles
 * are recycled automatically.
 */
export class ParticlePool {
  private pool: Particle[]
  constructor(size: number) {
    this.pool = Array.from({ length: size }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      data: 0,
      active: false
    }))
  }
  spawn(init: (p: Particle) => void): Particle | null {
    for (const p of this.pool) {
      if (!p.active) {
        p.active = true
        p.life = 0
        init(p)
        return p
      }
    }
    return null
  }
  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue
      p.life += dt
      if (p.life >= p.maxLife) {
        p.active = false
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
  }
  each(fn: (p: Particle) => void): void {
    for (const p of this.pool) if (p.active) fn(p)
  }
  get activeCount(): number {
    let n = 0
    for (const p of this.pool) if (p.active) n++
    return n
  }
}
