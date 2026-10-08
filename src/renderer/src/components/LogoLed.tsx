import { useEffect, useRef } from 'react'
import logo from '@/assets/logo.png'
import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'
import { readAccent } from '@/utils/color'
import { useUltraFast } from '@/utils/perf'

/**
 * The Harmony logo framed by a strip of LEDs that reacts to the music. The
 * strip follows the icon's own shape (a rounded square) and takes the colour
 * of the current cover, fading smoothly when the song changes.
 *
 * Playing: the strip is a level meter (lows at the bottom, highs at the top,
 * mirrored on both sides), it flashes on each kick, and a bright spark runs
 * around it. Paused: the LEDs settle into a slow, calm breathing glow. It
 * reads the engine's analyser into preallocated buffers, draws at ~30 fps,
 * and stops entirely while the window is hidden. In Ultra Fast Mode the
 * strip is off and the logo stands on its own.
 */

const LEDS = 32
const SIZE = 52 // css px of the canvas (the logo sits in the middle)
const HALF = 17.5 // half the side of the LED square
const CORNER = 8 // its corner radius (follows the icon's rounding)
const LOGO_PX = 25 // the logo image itself
const BRAND: RGB = [255, 132, 52] // the icon's orange, when there's no cover

type RGB = [number, number, number]

/** Evenly spaced points along a rounded square, starting at the bottom centre. */
function stripPoints(n: number): Float32Array {
  const L = HALF * 2 - CORNER * 2 // a straight edge
  const A = (Math.PI * CORNER) / 2 // a corner arc
  const P = 4 * L + 4 * A
  const arc = (cx: number, cy: number, a: number): [number, number] => [cx + Math.cos(a) * CORNER, cy + Math.sin(a) * CORNER]
  // walk: bottom (centre → left), bottom-left corner, left edge (up), top-left corner, top, …
  const segs: [number, (u: number) => [number, number]][] = [
    [L / 2, (u) => [-u, HALF]],
    [A, (u) => arc(-HALF + CORNER, HALF - CORNER, Math.PI / 2 + u / CORNER)],
    [L, (u) => [-HALF, HALF - CORNER - u]],
    [A, (u) => arc(-HALF + CORNER, -HALF + CORNER, Math.PI + u / CORNER)],
    [L, (u) => [-HALF + CORNER + u, -HALF]],
    [A, (u) => arc(HALF - CORNER, -HALF + CORNER, (Math.PI * 3) / 2 + u / CORNER)],
    [L, (u) => [HALF, -HALF + CORNER + u]],
    [A, (u) => arc(HALF - CORNER, HALF - CORNER, u / CORNER)],
    [L / 2, (u) => [HALF - CORNER - u, HALF]]
  ]
  const out = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    let s = (i / n) * P
    let p: [number, number] = [0, HALF]
    for (const [len, f] of segs) {
      if (s <= len) {
        p = f(s)
        break
      }
      s -= len
    }
    out[i * 2] = p[0]
    out[i * 2 + 1] = p[1]
  }
  return out
}

function parseRgb(v: string): RGB | null {
  const m = v.match(/(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** The cover's colour, made bright enough to read as light. */
function ledColour(): RGB {
  // only an inline --accent comes from a cover; otherwise use the brand orange
  const inline = document.documentElement.style.getPropertyValue('--accent')
  const c = inline ? parseRgb(readAccent()) : null
  if (!c) return BRAND
  const max = Math.max(c[0], c[1], c[2], 1)
  const min = Math.min(c[0], c[1], c[2])
  const k = 255 / max // full brightness, same hue
  // pale covers: push the saturation a little so the LEDs aren't white
  const sat = max - min < 60 ? 0.35 : 0
  return c.map((x) => Math.max(0, Math.min(255, Math.round(x * k + (x * k - 128) * sat)))) as RGB
}

export function LogoLed(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const playingRef = useRef(isPlaying)
  playingRef.current = isPlaying
  const ultraFast = useUltraFast()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || ultraFast) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    const g = canvas.getContext('2d')!
    g.scale(dpr, dpr)

    const analyser = getEngine().getAnalyserNode()
    const freq = new Uint8Array(analyser.frequencyBinCount)
    const half = LEDS / 2
    const levels = new Float32Array(half + 1)
    const shown = new Float32Array(LEDS)
    const pts = stripPoints(LEDS)
    // log-spaced band edges for the half strip (bottom = lows, top = highs)
    const edges = new Int32Array(half + 2)
    const n = freq.length
    for (let b = 0; b <= half + 1; b++) edges[b] = Math.max(1, Math.floor(Math.pow(n * 0.7, b / (half + 1))))

    const col: RGB = [...ledColour()] as RGB
    let bassAvg = 0
    let flash = 0
    let spark = 0
    let raf = 0
    let last = 0
    let t = 0
    let running = true

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      if (now - last < 32) return // ~30 fps is plenty for a logo
      const dt = Math.min(0.1, (now - last) / 1000 || 0.03)
      last = now
      t += dt
      const playing = playingRef.current

      // fade toward the cover's colour
      const want = ledColour()
      for (let i = 0; i < 3; i++) col[i] += (want[i] - col[i]) * Math.min(1, dt * 2.5)

      let bass = 0
      if (playing) {
        analyser.getByteFrequencyData(freq)
        for (let b = 0; b <= half; b++) {
          let sum = 0
          let cnt = 0
          for (let i = edges[b]; i < edges[b + 1] && i < n; i++) {
            sum += freq[i]
            cnt++
          }
          // highs are naturally quieter: lift them a little; a touch of gamma for contrast
          const lift = 1 + (b / half) * 0.6
          levels[b] = cnt ? Math.pow(Math.min(1, (sum / cnt / 255) * lift), 1.6) : 0
        }
        bass = (levels[0] + levels[1] + levels[2]) / 3
        // a kick: the lows jump clearly above their recent average
        if (bass > bassAvg * 1.25 + 0.06 && flash < 0.4) flash = 1
        bassAvg += (bass - bassAvg) * Math.min(1, dt * 4)
        spark += dt * (0.25 + bass * 0.9)
      } else {
        bassAvg *= 0.9
        spark += dt * 0.08
      }
      flash = Math.max(0, flash - dt * 3.2)

      g.clearRect(0, 0, SIZE, SIZE)
      const cx = SIZE / 2
      const cy = SIZE / 2
      const breath = 0.5 + 0.5 * Math.sin(t * 1.4)
      const sparkAt = (spark % 1) * LEDS
      const R = Math.round(col[0])
      const G = Math.round(col[1])
      const B = Math.round(col[2])
      // additive light glows on dark themes; on the light theme it would wash out to white
      const lightTheme = document.documentElement.getAttribute('data-theme') === 'light'

      // a soft glow behind the logo on the beat (or breathing while paused)
      const k = playing ? flash * 0.45 : 0.1 + breath * 0.08
      if (k > 0.02) {
        g.save()
        g.shadowColor = `rgba(${R},${G},${B},${Math.min(1, k * 1.6)})`
        g.shadowBlur = 10
        g.fillStyle = `rgba(${R},${G},${B},${k * 0.5})`
        g.beginPath()
        g.roundRect(cx - HALF + 3, cy - HALF + 3, HALF * 2 - 6, HALF * 2 - 6, CORNER - 2)
        g.fill()
        g.restore()
      }
      // the strip itself, faintly
      g.strokeStyle = `rgba(${R},${G},${B},${lightTheme ? 0.25 : 0.14})`
      g.lineWidth = 1
      g.beginPath()
      g.roundRect(cx - HALF, cy - HALF, HALF * 2, HALF * 2, CORNER)
      g.stroke()

      g.globalCompositeOperation = lightTheme ? 'source-over' : 'lighter'
      for (let i = 0; i < LEDS; i++) {
        // i = 0 at the bottom centre, going round; mirror so both sides match
        const pos = i <= half ? i : LEDS - i
        let target: number
        if (playing) target = 0.12 + levels[half - pos] * 0.88 + flash * 0.35
        else target = 0.1 + breath * 0.22
        // the running spark
        let d = Math.abs(i - sparkAt)
        d = Math.min(d, LEDS - d)
        target += Math.max(0, 1 - d / 1.6) * (playing ? 0.45 : 0.3)
        // LEDs rise fast and fall slowly, like a real meter
        shown[i] += (target - shown[i]) * (target > shown[i] ? 0.6 : 0.18)
        const v = Math.min(1, shown[i])
        if (v < 0.03) continue
        const x = cx + pts[i * 2]
        const y = cy + pts[i * 2 + 1]
        const glow = g.createRadialGradient(x, y, 0, x, y, 4.5)
        glow.addColorStop(0, `rgba(${R},${G},${B},${v})`)
        glow.addColorStop(1, `rgba(${R},${G},${B},0)`)
        g.fillStyle = glow
        g.fillRect(x - 4.5, y - 4.5, 9, 9)
        // the hot core goes white as the LED fills up (darker on the light theme)
        const w = lightTheme ? -0.25 : v * v * 0.6
        const cr = Math.round(w > 0 ? R + (255 - R) * w : R * (1 + w))
        const cg = Math.round(w > 0 ? G + (255 - G) * w : G * (1 + w))
        const cb = Math.round(w > 0 ? B + (255 - B) * w : B * (1 + w))
        g.fillStyle = `rgba(${cr},${cg},${cb},${v})`
        g.fillRect(x - 0.9, y - 0.9, 1.8, 1.8)
      }
      g.globalCompositeOperation = 'source-over'
    }

    const start = (): void => {
      if (!running) {
        running = true
        last = 0
        raf = requestAnimationFrame(draw)
      }
    }
    const stop = (): void => {
      running = false
      cancelAnimationFrame(raf)
    }
    const onVis = (): void => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(draw)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      stop()
    }
  }, [ultraFast])

  return (
    <div className="shrink-0" style={{ position: 'relative', width: 32, height: 32 }}>
      {!ultraFast && (
        <canvas
          ref={canvasRef}
          aria-hidden
          style={{ position: 'absolute', pointerEvents: 'none', width: SIZE, height: SIZE, left: (32 - SIZE) / 2, top: (32 - SIZE) / 2 }}
        />
      )}
      <img
        src={logo}
        alt=""
        draggable={false}
        className="drop-shadow"
        style={{ position: 'absolute', objectFit: 'contain', width: LOGO_PX, height: LOGO_PX, left: (32 - LOGO_PX) / 2, top: (32 - LOGO_PX) / 2 }}
      />
    </div>
  )
}
