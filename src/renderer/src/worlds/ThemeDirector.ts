import { getDirector } from '@/services/stageDirector'
import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'
import { mediaUrl } from '@/utils/format'
import { readAccent } from '@/utils/color'
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
  private accentVar = ''
  private accent: [number, number, number] = [124, 108, 244]
  private last = 0
  private mountTime = 0
  private coverImg: HTMLImageElement | null = null
  private coverUrl: string | null = null
  private ro: ResizeObserver | null = null
  // chorus / drop reaction shared by every world
  private surgeEnabled = false
  private surge = 0
  private shock = 0
  private reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  /** Turns the drop/chorus bloom and camera punch on or off. */
  setSurgeEnabled(on: boolean): void {
    this.surgeEnabled = on
    if (!on && this.canvas) this.canvas.style.transform = ''
  }

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
      if (this.canvas) this.canvas.style.transform = ''
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
    const F = director.update(playing, progress, song?.id ?? null)
    const engine = getEngine()
    const bins = this.world?.spectrumBins ?? 32
    const spectrum = engine.getSpectrum(bins)

    // accent from CSS var (already tracks the cover)
    const accentVar = readAccent()
    if (accentVar !== this.accentVar) {
      this.accentVar = accentVar
      this.accent = parseAccent(accentVar)
    }
    const accent = this.accent

    // the chorus envelope: drops slam it up, the climax holds it, the rest lets go
    const target =
      F.state === 'drop' ? 1 : F.state === 'climax' ? 0.65 : F.state === 'build' ? 0.2 + F.tension * 0.25 : 0
    const rate = target > this.surge ? 6 : 0.8
    this.surge += (target - this.surge) * Math.min(1, dt * rate)
    if (F.impactLevel >= 4 || (F.stateJustChanged && F.state === 'drop')) this.shock = 1

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
      section: F.state,
      surge: this.surge,
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
    this.drawSurge(context)
  }

  /**
   * The same chorus reaction on top of any world: a bloom in the cover's
   * colour that swells with the surge, a shockwave ring on big drops and a
   * small camera punch (a compositor-only CSS scale, so it costs nothing).
   */
  private drawSurge(c: WorldContext): void {
    const canvas = this.canvas!
    this.shock = Math.max(0, this.shock - c.dt * 1.6)
    if (!this.surgeEnabled || !c.playing) {
      if (canvas.style.transform) canvas.style.transform = ''
      return
    }
    const { ctx, width, height } = c
    const [r, g, b] = c.accent
    const s = this.surge
    if (s > 0.02) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const R = Math.max(width, height) * (0.55 + 0.15 * c.kick)
      const bloom = ctx.createRadialGradient(width / 2, height * 0.55, 0, width / 2, height * 0.55, R)
      bloom.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.34 * s * (0.6 + 0.4 * c.kick)})`)
      bloom.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = bloom
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
    }
    if (this.shock > 0) {
      const k = 1 - this.shock
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      // sized to the screen so the ring reads the same in a small window or fullscreen
      const unit = Math.max(width, height) / 1000
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.4 * this.shock})`
      ctx.lineWidth = unit * (3 + 14 * this.shock)
      ctx.beginPath()
      ctx.arc(width / 2, height * 0.55, Math.max(width, height) * (0.08 + 0.75 * k), 0, Math.PI * 2)
      ctx.stroke()
      // a quick white flash right on the hit
      if (this.shock > 0.85) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(this.shock - 0.85) * 0.6})`
        ctx.fillRect(0, 0, width, height)
      }
      ctx.restore()
    }
    const zoom = this.reduceMotion ? 1 : 1 + 0.025 * s + 0.012 * c.kick * s + 0.02 * this.shock * this.shock
    const tf = zoom > 1.0005 ? `scale(${zoom.toFixed(4)})` : ''
    if (canvas.style.transform !== tf) canvas.style.transform = tf
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
