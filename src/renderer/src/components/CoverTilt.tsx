import { useEffect } from 'react'
import { useFlairStore } from '@/store/flairStore'
import { useUltraFast } from '@/utils/perf'

/**
 * Covers that lean towards the mouse, in 3D (Personalização → Capas). One
 * listener for the whole app: the cover under the pointer tilts, and settles
 * back when the pointer leaves it. Small covers (list rows) stay still.
 */
const MAX_DEG = 10
const MIN_SIZE = 64

export function CoverTilt(): null {
  const on = useFlairStore((s) => s.coverTilt)
  const ultra = useUltraFast()

  useEffect(() => {
    if (!on || ultra) return
    let current: HTMLElement | null = null
    let frame = 0
    let pending: { el: HTMLElement; rx: number; ry: number } | null = null

    const settle = (el: HTMLElement): void => {
      el.style.transform = ''
      el.classList.remove('tilting')
    }
    const apply = (): void => {
      frame = 0
      if (!pending) return
      const { el, rx, ry } = pending
      el.classList.add('tilting')
      el.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`
    }
    const move = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') return
      const el = (e.target instanceof Element ? e.target.closest('.cover-art') : null) as HTMLElement | null
      if (el !== current) {
        if (current) settle(current)
        current = el
      }
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width < MIN_SIZE) {
        current = null
        return
      }
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      pending = { el, rx: -py * MAX_DEG * 2, ry: px * MAX_DEG * 2 }
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const out = (e: PointerEvent): void => {
      if (!e.relatedTarget && current) {
        settle(current)
        current = null
      }
    }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerout', out)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', out)
      if (current) settle(current)
    }
  }, [on, ultra])

  return null
}
