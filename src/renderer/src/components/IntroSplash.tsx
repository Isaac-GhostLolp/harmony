import { useEffect, useRef } from 'react'
import { readAccent } from '@/utils/color'
import { useProfileStore, DEFAULT_NAME } from '@/store/profileStore'
import { t } from '@/i18n'

/**
 * Opening animation, drawn on one canvas over the app while it loads:
 *
 *   heartbeat — a dot of light pulses twice in the dark, stars fade in
 *   wave      — the dot stretches into a living sound wave
 *   ring      — the wave curls into a ring that becomes a radial equalizer,
 *               dancing to a 120 BPM beat; every beat throws a shockwave and
 *               a burst of music notes that fall and bounce off the floor
 *   logo      — the ring rises, "Harmony" drops in letter by letter (squash
 *               and stretch on landing), a shine sweeps it, then a greeting
 *   exit      — an iris opens from the centre and reveals the app
 *
 * Any click or key skips straight to the exit. JS-driven (rAF) like the rest
 * of the app; time advances by at most 1/30 s per frame, so if the app's own
 * start-up stalls a frame the show slows down instead of skipping ahead.
 */

export const INTRO_PREF_KEY = 'harmony.intro'
export const INTRO_REPLAY_EVENT = 'harmony:intro'

export function introEnabled(): boolean {
  try {
    if (localStorage.getItem(INTRO_PREF_KEY) === 'off') return false
  } catch {
    /* default on */
  }
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const BG = '#0b0b10' // the window's own background colour
const T_WAVE = 0.55
const T_RING = 1.3
const T_LOGO = 2.15
const T_EXIT = 3.75
const T_END = 4.55
const BPM_START = 1.55
const BEAT = 0.5
const BARS = 72
const WAVE_PTS = 180
const NOTES = ['♪', '♫', '♬', '♩']
const WORD = 'Harmony'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  life: number
  size: number
  glyph: number // -1 = spark
  hue: number
  bounces: number
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3)
const easeInOut = (x: number): number => {
  const t = clamp01(x)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
/** Overshooting spring settle, 0 → 1. */
const spring = (x: number): number => {
  const t = clamp01(x)
  return 1 - Math.exp(-6 * t) * Math.cos(t * 11)
}

function accentHue(): number {
  const v = readAccent()
  let r = 124
  let g = 108
  let b = 244
  const m = v.match(/(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/)
  const h = v.match(/^#?([0-9a-f]{6})$/i)
  if (m) [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else if (h) {
    const n = parseInt(h[1], 16)
    ;[r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mx === mn) return 260
  const d = mx - mn
  const hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (hue * 60 + 360) % 360
}

function greeting(): string {
  const hour = new Date().getHours()
  const part = hour < 5 ? t('Boa madrugada') : hour < 12 ? t('Bom dia') : hour < 18 ? t('Boa tarde') : t('Boa noite')
  const name = useProfileStore.getState().name?.trim()
  return name && name !== DEFAULT_NAME ? t('{part}, {name}!', { part, name }) : `${part}!`
}

/** A soft round glow, drawn once and scaled with drawImage (cheaper than shadowBlur). */
function makeGlow(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  return c
}

export function IntroSplash({ onDone }: { onDone: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const skipRef = useRef(false)

  const skipHint = t('clique para pular')
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const glow = makeGlow()
    // tinted glows: the white sprite multiplied by a hue, cached per hue bucket
    const tinted = new Map<number, HTMLCanvasElement>()
    const glowOf = (hue: number): HTMLCanvasElement => {
      const key = Math.round(((hue % 360) + 360) % 360 / 10) * 10
      let c = tinted.get(key)
      if (!c) {
        c = document.createElement('canvas')
        c.width = 128
        c.height = 128
        const g = c.getContext('2d')!
        g.drawImage(glow, 0, 0)
        g.globalCompositeOperation = 'source-in'
        g.fillStyle = `hsl(${key}, 95%, 66%)`
        g.fillRect(0, 0, 128, 128)
        tinted.set(key, c)
      }
      return c
    }

    let W = 0
    let H = 0
    let dpr = 1
    const resize = (): void => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.4 + Math.random() * 1.4,
      p: Math.random() * Math.PI * 2
    }))
    const parts: Particle[] = []
    const waves: { t0: number; hue: number; big: boolean }[] = []
    const barLevel = new Float32Array(BARS)
    const barSeed = Float32Array.from({ length: BARS }, () => Math.random())
    const letterW: number[] = []
    let wordW = 0
    let measuredFor = 0

    let hue0 = accentHue()
    let hello = ''
    let t = 0
    let last = performance.now()
    let nextBeat = BPM_START
    let beatAt = -10
    let pendingBurst = 0
    let raf = 0
    let finished = false

    const burst = (x: number, y: number, n: number, power: number): void => {
      for (let i = 0; i < n && parts.length < 220; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = power * (0.35 + Math.random() * 0.65)
        parts.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - power * 0.35,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 8,
          life: 0,
          size: 14 + Math.random() * 18,
          glyph: Math.random() < 0.55 ? Math.floor(Math.random() * NOTES.length) : -1,
          hue: hue0 + (Math.random() - 0.5) * 120,
          bounces: 0
        })
      }
    }

    const skip = (): void => {
      skipRef.current = true
    }
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)

    const frame = (now: number): void => {
      if (finished) return
      raf = requestAnimationFrame(frame)
      const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000))
      last = now
      t += dt
      if (skipRef.current && t < T_EXIT) t = T_EXIT
      if (t >= T_END) {
        finished = true
        doneRef.current()
        return
      }
      if (t > T_LOGO && !hello) hello = greeting()
      // the theme loads a moment after start-up: follow it until the logo lands
      if (t < T_LOGO) hue0 = hue0 + (((accentHue() - hue0 + 540) % 360) - 180) * 0.1

      const cx = W / 2
      const cy = H / 2
      const unit = Math.min(W, H)
      const exitK = easeInOut((t - T_EXIT) / (T_END - T_EXIT))
      // the ring rises and shrinks to make room for the wordmark
      const lift = easeInOut((t - T_LOGO + 0.15) / 0.6)
      const ringR = unit * 0.16 * (1 - lift * 0.28)
      const ringY = cy - lift * unit * 0.13

      // ---- beat clock ----
      if (t >= nextBeat && t < T_EXIT + 0.3) {
        beatAt = nextBeat
        const big = Math.round((nextBeat - BPM_START) / BEAT) % 4 === 0
        waves.push({ t0: nextBeat, hue: hue0 + (big ? 0 : 40), big })
        if (nextBeat < T_EXIT) pendingBurst = big ? 22 : 12
        nextBeat += BEAT
      }
      const env = Math.exp(-(t - beatAt) * 7)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)

      // camera: everything rushes towards the viewer on exit
      ctx.save()
      const zoom = 1 + exitK * 0.6 + env * 0.012
      ctx.translate(cx, cy)
      ctx.scale(zoom, zoom)
      ctx.translate(-cx, -cy)
      const fade = 1 - exitK

      // ---- background: nebula + stars ----
      const neb = clamp01(t / 1.2) * fade
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.22 * neb
      const nr = unit * (0.9 + env * 0.05)
      ctx.drawImage(glowOf(hue0 + Math.sin(t * 0.8) * 30), cx - nr * 1.2 + Math.sin(t * 0.5) * 40, cy - nr, nr * 2.4, nr * 2)
      ctx.globalAlpha = 0.12 * neb
      ctx.drawImage(glowOf(hue0 + 70), cx - nr * 0.2, cy - nr * 0.2, nr * 1.4, nr * 1.4)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#fff'
      const starA = clamp01((t - 0.2) / 1) * fade
      for (const s of stars) {
        ctx.globalAlpha = starA * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2.2 + s.p))) * (0.5 + env * 0.5)
        const px = cx + (s.x - 0.5) * W * (1 + t * 0.02)
        const py = cy + (s.y - 0.5) * H * (1 + t * 0.02)
        ctx.fillRect(px, py, s.s, s.s)
      }
      ctx.globalAlpha = 1

      // ---- shockwaves ----
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]
        const k = (t - w.t0) / 1.1
        if (k > 1) {
          waves.splice(i, 1)
          continue
        }
        ctx.strokeStyle = `hsla(${w.hue}, 95%, 70%, ${(1 - k) * (w.big ? 0.55 : 0.3) * fade})`
        ctx.lineWidth = (w.big ? 5 : 2.5) * (1 - k) + 0.5
        ctx.beginPath()
        ctx.arc(cx, ringY, unit * (0.16 + easeOut(k) * (w.big ? 0.6 : 0.4)), 0, Math.PI * 2)
        ctx.stroke()
      }

      // ---- heartbeat dot ----
      if (t < T_WAVE + 0.3) {
        const beat = Math.max(Math.exp(-Math.pow((t - 0.15) * 9, 2)), Math.exp(-Math.pow((t - 0.42) * 9, 2)))
        const appear = easeOut(t / 0.15)
        const r = (6 + beat * 10) * appear * (1 - clamp01((t - T_WAVE) / 0.3))
        ctx.globalCompositeOperation = 'lighter'
        const gr = r * 7
        ctx.drawImage(glowOf(hue0), cx - gr, cy - gr, gr * 2, gr * 2)
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      }

      // ---- wave → ring ----
      if (t >= T_WAVE) {
        const grow = easeOut((t - T_WAVE) / 0.6)
        const morph = easeInOut((t - T_RING) / 0.7)
        const R = ringR
        const ry = ringY
        const len = W * 0.72 * grow
        const amp = unit * 0.07 * grow * (1 - morph * 0.85) * (0.6 + env * 0.6)
        ctx.globalCompositeOperation = 'lighter'
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath()
          for (let k = 0; k <= WAVE_PTS; k++) {
            const u = k / WAVE_PTS
            const taper = Math.sin(u * Math.PI)
            const wv =
              (Math.sin(u * 22 - t * 9) * 0.6 + Math.sin(u * 51 + t * 13) * 0.3 + Math.sin(u * 7 - t * 4) * 0.5) * taper
            const lx = cx + (u - 0.5) * len
            const ly = cy + wv * amp
            const a = -Math.PI / 2 + u * Math.PI * 2 + t * 0.6
            const rr = R * (1 + wv * 0.06 * (0.4 + env))
            const x = lx + (cx + Math.cos(a) * rr - lx) * morph
            const y = ly + (ry + Math.sin(a) * rr - ly) * morph
            if (k === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          if (pass === 0) {
            ctx.strokeStyle = `hsla(${hue0}, 95%, 62%, ${0.35 * fade})`
            ctx.lineWidth = 9
          } else {
            const lg = ctx.createLinearGradient(cx - len / 2, 0, cx + len / 2, 0)
            lg.addColorStop(0, `hsla(${hue0 - 50}, 95%, 70%, ${fade})`)
            lg.addColorStop(0.5, `hsla(${hue0}, 100%, 85%, ${fade})`)
            lg.addColorStop(1, `hsla(${hue0 + 60}, 95%, 70%, ${fade})`)
            ctx.strokeStyle = morph > 0.5 ? `hsla(${hue0 + 10}, 100%, 82%, ${fade})` : lg
            ctx.lineWidth = 2.5
          }
          ctx.stroke()
        }

        // radial equalizer, dancing to the beat
        const bars = easeOut((t - T_RING - 0.45) / 0.5)
        if (bars > 0) {
          for (let i = 0; i < BARS; i++) {
            const a = -Math.PI / 2 + (i / BARS) * Math.PI * 2 - t * 0.35
            const target =
              (0.25 + 0.75 * Math.abs(Math.sin(i * 0.37 + t * 5 + barSeed[i] * 6))) * (0.35 + env * 0.9) * bars
            barLevel[i] += (target - barLevel[i]) * (target > barLevel[i] ? 0.6 : 0.18)
            const l = 4 + barLevel[i] * R * 0.55
            const x0 = cx + Math.cos(a) * (R + 7)
            const y0 = ry + Math.sin(a) * (R + 7)
            ctx.strokeStyle = `hsla(${hue0 + (i / BARS) * 140 - 70 + t * 40}, 95%, 66%, ${0.85 * fade})`
            ctx.lineWidth = Math.max(2, (R * Math.PI * 2) / BARS - 3)
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(x0, y0)
            ctx.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l)
            ctx.stroke()
          }
          ctx.lineCap = 'butt'
          // the note in the middle pops in
          const pop = spring((t - T_RING - 0.6) / 0.7) * (1 + env * 0.12)
          if (pop > 0.01) {
            const gr = R * 0.9 * pop
            ctx.drawImage(glowOf(hue0), cx - gr, ry - gr, gr * 2, gr * 2)
            ctx.globalCompositeOperation = 'source-over'
            ctx.globalAlpha = fade
            ctx.fillStyle = '#fff'
            ctx.font = `700 ${Math.round(R * 0.85 * pop)}px 'Segoe UI Symbol', 'Segoe UI', system-ui, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.save()
            ctx.translate(cx, ry + R * 0.04)
            ctx.rotate(Math.sin(t * 3) * 0.12 * (0.4 + env))
            ctx.fillText('♫', 0, 0)
            ctx.restore()
            ctx.globalAlpha = 1
          }
        }
        ctx.globalCompositeOperation = 'source-over'

        // beat bursts
        if (pendingBurst) {
          burst(cx, ry, pendingBurst, unit * 0.9)
          pendingBurst = 0
        }
      }

      // ---- wordmark: letters drop in and bounce ----
      if (t >= T_LOGO) {
        const size = Math.round(Math.max(44, Math.min(96, unit * 0.11)))
        const font = `800 ${size}px 'Segoe UI', system-ui, -apple-system, sans-serif`
        ctx.font = font
        if (measuredFor !== size) {
          measuredFor = size
          letterW.length = 0
          wordW = 0
          for (const ch of WORD) {
            const w = ctx.measureText(ch).width
            letterW.push(w)
            wordW += w
          }
        }
        const baseY = ringY + ringR * 1.62 + size * 0.85 // clear of the bars
        let x = cx - wordW / 2
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        for (let i = 0; i < WORD.length; i++) {
          const k = (t - T_LOGO - i * 0.07) / 0.75
          const w = letterW[i]
          if (k > 0) {
            const s = spring(k)
            const y = baseY - (1 - s) * H * 0.55
            // squash on landing, stretch while falling
            const v = 1 - s
            const sy = 1 + Math.max(-0.22, Math.min(0.3, v * 1.6)) + env * 0.04
            const sx = 1 / sy
            const hue = hue0 + (i / WORD.length) * 90 - 30
            ctx.save()
            ctx.translate(x + w / 2, y)
            ctx.rotate((1 - easeOut(k)) * (i % 2 ? 0.5 : -0.5))
            ctx.scale(sx, sy)
            ctx.globalAlpha = clamp01(k * 3) * fade
            ctx.fillStyle = `hsl(${hue}, 95%, 70%)`
            ctx.fillText(WORD[i], -w / 2 + 2, 3)
            ctx.fillStyle = `hsl(${hue}, 90%, 90%)`
            ctx.fillText(WORD[i], -w / 2, 0)
            ctx.restore()
          }
          x += w
        }
        // shine sweeping across the word
        const sweep = (t - T_LOGO - 0.95) / 0.6
        if (sweep > 0 && sweep < 1) {
          // the word drawn again in a moving white band, added on top
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          const sxp = cx - wordW / 2 - 60 + (wordW + 120) * sweep
          const sg = ctx.createLinearGradient(sxp - 50, 0, sxp + 50, 0)
          sg.addColorStop(0, 'rgba(255,255,255,0)')
          sg.addColorStop(0.5, `rgba(255,255,255,${0.75 * fade})`)
          sg.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = sg
          ctx.textAlign = 'left'
          ctx.fillText(WORD, cx - wordW / 2, baseY)
          ctx.restore()
        }
        // greeting
        if (hello) {
          const k = easeOut((t - T_LOGO - 0.9) / 0.5)
          ctx.globalAlpha = k * fade * 0.85
          ctx.fillStyle = '#ffffff'
          ctx.font = `500 ${Math.round(size * 0.28)}px 'Segoe UI', system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(hello, cx, baseY + size * 0.62 + (1 - k) * 12)
          ctx.globalAlpha = 1
        }
      }

      // ---- particles: notes and sparks with gravity, bouncing on the floor ----
      const floor = H - 24
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.life += dt
        p.vy += 1100 * dt
        p.vx *= 0.995
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
        if (p.y > floor && p.vy > 0) {
          p.y = floor
          p.vy *= -0.55
          p.vx *= 0.8
          p.vr *= -0.7
          p.bounces++
        }
        const alpha = clamp01(1 - (p.life - 1.6) / 0.6) * fade
        if (alpha <= 0 || p.bounces > 3) {
          parts.splice(i, 1)
          continue
        }
        if (p.glyph >= 0) {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot * 0.3)
          ctx.globalAlpha = alpha
          ctx.fillStyle = `hsl(${p.hue}, 95%, 72%)`
          ctx.font = `700 ${Math.round(p.size)}px 'Segoe UI Symbol', 'Segoe UI', system-ui, sans-serif`
          ctx.fillText(NOTES[p.glyph], 0, 0)
          ctx.restore()
        } else {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = alpha
          const gs = p.size * 0.9
          ctx.drawImage(glowOf(p.hue), p.x - gs / 2, p.y - gs / 2, gs, gs)
          ctx.globalCompositeOperation = 'source-over'
        }
      }
      ctx.globalAlpha = 1
      ctx.restore()

      // ---- hint ----
      const hint = clamp01((t - 0.9) / 0.5) * (1 - clamp01((t - T_EXIT) / 0.2))
      if (hint > 0) {
        ctx.globalAlpha = hint * 0.35
        ctx.fillStyle = '#ffffff'
        ctx.font = "500 12px 'Segoe UI', system-ui, sans-serif"
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(skipHint, cx, H - 22)
        ctx.globalAlpha = 1
      }

      // ---- exit: an iris opens from the centre onto the app ----
      if (t > T_EXIT) {
        const k = easeInOut((t - T_EXIT) / (T_END - T_EXIT))
        const maxR = Math.hypot(W, H) * 0.55
        const r = k * maxR
        const edge = Math.max(30, maxR * 0.12)
        ctx.globalCompositeOperation = 'destination-out'
        const g = ctx.createRadialGradient(cx, cy, Math.max(0, r - edge), cx, cy, r + 1)
        g.addColorStop(0, 'rgba(0,0,0,1)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      finished = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="fixed inset-0 z-[300] h-full w-full" />
}
