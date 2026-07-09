import { useEffect, useRef } from 'react'
import { Loader2, RotateCw } from 'lucide-react'

/**
 * A spinner whose rotation is driven by requestAnimationFrame + performance.now()
 * — real wall-clock time — instead of a CSS animation. On some setups (e.g.
 * high-refresh displays) the Chromium compositor's animation clock ran fast,
 * making CSS `animate-spin` whirl absurdly quickly. Driving the transform from
 * JS pins it to real seconds, so it always takes exactly `secondsPerTurn`.
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
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    let raf = 0
    const degPerMs = 360 / (secondsPerTurn * 1000)
    const tick = (): void => {
      const el = ref.current
      if (el) {
        const deg = (performance.now() * degPerMs) % 360
        el.style.transform = `rotate(${deg}deg)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [secondsPerTurn])

  const Icon = icon === 'rotate' ? RotateCw : Loader2
  return <Icon ref={ref} size={size} className={className} />
}
