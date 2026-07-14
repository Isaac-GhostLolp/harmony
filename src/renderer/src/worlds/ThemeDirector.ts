import { getDirector } from '@/services/stageDirector'
import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'
import { mediaUrl } from '@/utils/format'
import type { World, WorldContext } from './types'

/**
 * ThemeDirector — the engine behind immersive Worlds.
 *
 * It owns a single full-viewport canvas, drives one requestAnimationFrame loop,
 * builds the live WorldContext each frame (music from the StageDirector, art
 * from the player, day phase from the clock) and delegates all drawing to the
 * active World. Worlds are swapped without tearing down the canvas, and the
 * loop pauses itself when no world is active (classic themes stay weightless).
 *
 * This is deliberately decoupled from React: the app mounts one host component
 * that hands us a canvas; everything else is plain modules, so new worlds are
 * just files implementing the World contract.
 */
class ThemeDirector {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private world: World | null = null
  private raf = 0
  private last = 0
  private mountTime = 0
  private coverImg: HTMLImageElement | null = null
  private coverUrl: string | null = null
  private ro: ResizeObserver | null = null

  /** Attach the shared canvas (called once by the host component). */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: true })
    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    // If a world was already selected (e.g. React re-mounted this component in
    // StrictMode or on hot-reload), re-mount it and resume the loop on the new
    // canvas instead of leaving a stopped loop and a blank canvas.
    if (this.world) {
      this.mountTime = performance.now() / 1000
      this.last = this.mountTime
      if (this.world.mount) this.world.mount(this.buildContext(0))
      this.start()
    }
  }

  detach(): void {
    // Stop the loop and release the canvas, but KEEP `this.world` so a later
    // attach() can resume it. Clearing the world here is what caused the
    // setWorld() guard to skip re-starting the loop after a re-mount.
    this.stop()
    this.ro?.disconnect()
    this.ro = null
    this.canvas = null
    this.ctx = null
  }

  private resize(): void {
    const c = this.canvas
    const ctx = this.ctx
    if (!c || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const r = c.getBoundingClientRect()
    c.width = Math.max(1, Math.round(r.width * dpr))
    c.height = Math.max(1, Math.round(r.height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Switch to a new world (or null to clear). Lazy: only the active world runs. */
  setWorld(world: World | null): void {
    if (this.world?.id === world?.id) return
    // tear down previous
    if (this.world?.unmount) this.world.unmount()
    this.world = world
    if (!world) {
      this.stop()
      if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      return
    }
    this.mountTime = performance.now() / 1000
    this.last = this.mountTime
    if (world.mount) world.mount(this.buildContext(0))
    this.start()
  }

  private start(): void {
    if (this.raf) return
    this.last = performance.now() / 1000
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop)
      this.tick()
    }
    this.raf = requestAnimationFrame(loop)
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /** Keeps the loaded cover image in sync with what's playing. */
  private syncCover(): void {
    const song = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex] ?? null
    const url = mediaUrl(song?.coverPath ?? null) ?? null
    if (url !== this.coverUrl) {
      this.coverUrl = url
      if (!url) {
        this.coverImg = null
      } else {
        const img = new Image()
        img.onload = () => {
          this.coverImg = img
        }
        img.src = url
      }
    }
  }

  private buildContext(dt: number): WorldContext {
    const ctx = this.ctx!
    const c = this.canvas!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = c.width / dpr
    const height = c.height / dpr

    const ps = usePlayerStore.getState()
    const playing = ps.isPlaying
    const song = ps.queue[ps.currentIndex] ?? null
    const progress = song && song.duration ? Math.min(1, ps.currentTime / song.duration) : 0

    const director = getDirector()
    const F = director.update(playing, progress)
    const engine = getEngine()
    const bins = this.world?.spectrumBins ?? 32
    const spectrum = engine.getSpectrum(bins)

    // accent from CSS var (already tracks the cover)
    const accentVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim()
    const accent = parseAccent(accentVar)

    // day phase from local clock
    const now = new Date()
    const dayPhase = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400

    return {
      ctx,
      width,
      height,
      time: performance.now() / 1000 - this.mountTime,
      dt,
      playing,
      progress,
      kick: F.kick,
      kickTick: F.kickTick,
      bass: clamp01(F.energy / 100 + F.kick * 0.5),
      vocals: F.vocals,
      hihats: F.hihats,
      energy: clamp01(F.energy / 100),
      impactHit: F.impactHit,
      impact: F.impact,
      breath: F.breath,
      sway: F.sway,
      spectrum,
      accent,
      cover: this.coverImg,
      dayPhase
    }
  }

  private tick(): void {
    if (!this.world || !this.ctx || !this.canvas) return
    const now = performance.now() / 1000
    const dt = Math.min(0.05, Math.max(0, now - this.last)) // clamp to avoid jumps
    this.last = now
    this.syncCover()
    const context = this.buildContext(dt)
    this.world.frame(context)
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function parseAccent(v: string): [number, number, number] {
  // supports "rgb(r g b)", "rgb(r, g, b)" and "#rrggbb"
  const m = v.match(/(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  const h = v.match(/^#?([0-9a-f]{6})$/i)
  if (h) {
    const n = parseInt(h[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return [124, 108, 244] // default violet
}

export const themeDirector = new ThemeDirector()
