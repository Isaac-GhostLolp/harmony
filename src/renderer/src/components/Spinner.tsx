import { useEffect, useRef } from 'react'
import { Loader2, RotateCw } from 'lucide-react'
import { useFlairStore } from '@/store/flairStore'

/**
 * A spinner whose motion is driven by requestAnimationFrame + performance.now()
 * — real wall-clock time — instead of a CSS animation. On some setups (e.g.
 * high-refresh displays) the Chromium compositor's animation clock ran fast,
 * making CSS `animate-spin` whirl absurdly quickly. Driving the transform from
 * JS pins it to real seconds, so it always takes exactly `secondsPerTurn`.
 *
 * Its look follows Personalização → Detalhes: the classic ring, a vinyl, a
 * little equalizer or a pulsing note. `icon="rotate"` (a "refresh" action)
 * always stays the classic arrow.
 */
export function Spinner({
  size = 16,
  secondsPerTurn = 1,
  icon = 'loader',
  className
}: {
  size?: number
  secondsPerTurn?: number
  icon?: 'loader' | 'rotate'
  className?: string
}): JSX.Element {
  const style = useFlairStore((s) => s.spinner)
  const look = icon === 'rotate' ? 'classic' : style
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const el = ref.current
      if (el) {
        const now = performance.now()
        if (look === 'classic' || look === 'vinyl') {
          const turn = look === 'vinyl' ? secondsPerTurn * 1.6 : secondsPerTurn
          el.style.transform = `rotate(${((now * 360) / (turn * 1000)) % 360}deg)`
        } else if (look === 'wave') {
          el.querySelectorAll('rect').forEach((bar, i) => {
            const h = 0.3 + 0.7 * Math.abs(Math.sin(now / 260 + i * 0.9))
            bar.setAttribute('height', String(16 * h))
            bar.setAttribute('y', String(12 - 8 * h))
          })
        } else {
          const k = 0.82 + 0.18 * Math.abs(Math.sin(now / 320))
          el.style.transform = `scale(${k})`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [secondsPerTurn, look])

  if (look === 'vinyl') {
    return (
      <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
        <circle cx="12" cy="12" r="11" fill="#111116" />
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="#2a2a33" strokeWidth="0.8" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="#2a2a33" strokeWidth="0.8" />
        <path d="M12 1.5 A10.5 10.5 0 0 1 21 7" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="4" fill="var(--accent)" />
        <circle cx="12" cy="12" r="1" fill="#111116" />
      </svg>
    )
  }
  if (look === 'wave') {
    return (
      <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
        {[3, 8, 13, 18].map((x) => (
          <rect key={x} x={x} y="4" width="3" height="16" rx="1.5" fill="var(--accent)" />
        ))}
      </svg>
    )
  }
  if (look === 'logo') {
    return (
      <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
        <path d="M9 18.5a3 3 0 1 1-2-2.83V5.5l11-2v11a3 3 0 1 1-2-2.83V7.2l-7 1.27V18.5Z" fill="var(--accent)" />
      </svg>
    )
  }
  const Icon = icon === 'rotate' ? RotateCw : Loader2
  return <Icon ref={ref} size={size} className={className} />
}
