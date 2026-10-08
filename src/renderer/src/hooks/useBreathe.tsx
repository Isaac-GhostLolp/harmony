import { useEffect, useRef } from 'react'
import { useUltraFast } from '@/utils/perf'

/**
 * Drives a gentle "breathing" scale/opacity from real wall-clock time via
 * requestAnimationFrame, applying it directly to a ref'd element. This avoids
 * CSS keyframe animations, whose clock can run absurdly fast on some setups
 * (e.g. high-refresh displays on Windows) — the same issue we fixed for the
 * spinning disc and floating lyrics. Here it keeps the DJ Mode cover and the
 * milestone emojis breathing at a correct, steady pace everywhere.
 */
export function useBreathe<T extends HTMLElement>(
  periodSec = 5.5,
  scaleAmount = 0.015,
  enabled = true
): React.RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!enabled) return // no frame loop while the element isn't shown
    let raf = 0
    const tick = (): void => {
      const el = ref.current
      if (el) {
        const t = performance.now() / 1000
        const phase = Math.sin((t / periodSec) * Math.PI * 2)
        const scale = 1 + (phase * 0.5 + 0.5) * scaleAmount
        const opacity = 0.85 + (phase * 0.5 + 0.5) * 0.15
        el.style.transform = `scale(${scale})`
        el.style.opacity = String(opacity)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [periodSec, scaleAmount, enabled])
  return ref
}

/**
 * A span that breathes via JS timing (see useBreathe). Handy inside lists where
 * each item needs its own animation ref. Falls back to a static, dimmed look
 * when `active` is false.
 */
export function BreathingEmoji({
  emoji,
  active,
  className = ''
}: {
  emoji: string
  active: boolean
  className?: string
}): JSX.Element {
  const ref = useBreathe<HTMLSpanElement>(5.5, 0.015, !useUltraFast())
  return (
    <span ref={active ? ref : undefined} className={`${className} ${active ? '' : 'opacity-60 grayscale'}`}>
      {emoji}
    </span>
  )
}
