import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Each tab remembers how far down it was scrolled. Leaving the library for
 * Albums and coming back used to land at the top of the list every time; now
 * the page comes back where it was left.
 *
 * The pages load their content asynchronously, so the saved position is
 * re-applied for a short while until the page is tall enough to hold it (or
 * until the user scrolls on their own).
 */
const saved = new Map<string, number>()

export function ScrollMemory({ target }: { target: React.RefObject<HTMLElement> }): null {
  const { pathname } = useLocation()
  const current = useRef(pathname)

  useLayoutEffect(() => {
    const el = target.current
    if (!el) return
    const onScroll = (): void => {
      saved.set(current.current, el.scrollTop)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [target])

  useLayoutEffect(() => {
    const el = target.current
    current.current = pathname
    if (!el) return
    const want = saved.get(pathname) ?? 0
    el.scrollTop = want
    if (want === 0) return
    // keep trying while the page fills in; give up after ~1.5 s or when the
    // user takes over (wheel, keys, dragging the scrollbar)
    let frame = 0
    const until = performance.now() + 1500
    const stop = (): void => {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const tick = (): void => {
      if (Math.abs(el.scrollTop - want) < 2 && el.scrollHeight - el.clientHeight >= want) return stop()
      el.scrollTop = want
      if (performance.now() < until) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const opts = { passive: true, once: true } as const
    el.addEventListener('wheel', stop, opts)
    el.addEventListener('pointerdown', stop, opts)
    window.addEventListener('keydown', stop, { once: true })
    return () => {
      stop()
      el.removeEventListener('wheel', stop)
      el.removeEventListener('pointerdown', stop)
      window.removeEventListener('keydown', stop)
    }
  }, [pathname, target])

  return null
}
