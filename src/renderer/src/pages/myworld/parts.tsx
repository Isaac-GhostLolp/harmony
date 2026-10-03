import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/** Counts up to `target` with an ease-out over `ms` (rAF, no re-render storms: ~30 updates). */
export function useCountUp(target: number, ms = 1200): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    let last = -1
    const tick = (now: number): void => {
      const k = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      const next = Math.round(target * e)
      if (next !== last) {
        last = next
        setV(next)
      }
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

export function SectionTitle({ emoji, title, hint }: { emoji: string; title: string; hint?: string }): JSX.Element {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h3 className="text-base font-semibold tracking-tight text-ink">
        <span className="mr-1.5">{emoji}</span>
        {title}
      </h3>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

export interface ConfettiHandle {
  /** Bursts from a point given in viewport coordinates. */
  burst: (x: number, y: number, hue?: number) => void
}

interface Bit {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  vr: number
  w: number
  h: number
  hue: number
  life: number
}

/**
 * Full-window confetti layer. Idle until `burst` is called; the loop stops
 * again once the last piece has fallen.
 */
export const Confetti = forwardRef<ConfettiHandle>(function Confetti(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bits = useRef<Bit[]>([])
  const raf = useRef(0)

  const loop = (): void => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (c.width !== Math.round(window.innerWidth * dpr)) {
      c.width = Math.round(window.innerWidth * dpr)
      c.height = Math.round(window.innerHeight * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const B = bits.current
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i]
      b.life += 1 / 60
      b.vy += 0.35
      b.vx *= 0.985
      b.vy *= 0.985
      b.x += b.vx
      b.y += b.vy
      b.r += b.vr
      if (b.y > window.innerHeight + 30 || b.life > 4) {
        B.splice(i, 1)
        continue
      }
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.r)
      ctx.scale(1, Math.cos(b.life * 9 + b.hue))
      ctx.globalAlpha = Math.min(1, 4 - b.life)
      ctx.fillStyle = `hsl(${b.hue}, 90%, 62%)`
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.restore()
    }
    raf.current = B.length ? requestAnimationFrame(loop) : 0
    if (!B.length) ctx.clearRect(0, 0, c.width, c.height)
  }

  useImperativeHandle(ref, () => ({
    burst: (x, y, hue = Math.random() * 360) => {
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 4 + Math.random() * 9
        bits.current.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 6,
          r: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.4,
          w: 6 + Math.random() * 6,
          h: 3 + Math.random() * 4,
          hue: hue + (Math.random() - 0.5) * 160,
          life: 0
        })
      }
      if (!raf.current) raf.current = requestAnimationFrame(loop)
    }
  }))

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[150] h-full w-full" />
})
