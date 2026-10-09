import { ReactNode, useEffect, useRef, useState } from 'react'

/**
 * The page title bar. It stays pinned to the top of the page while the list
 * scrolls underneath (with whatever controls sit below it, e.g. the filter
 * chips), so "Importar", the genres and the sort options are always at hand.
 * Once the page is scrolled it turns into a compact frosted bar.
 *
 * It publishes its height as --sticky-h on the scrolling element, so other
 * sticky things inside the page (the selection bar) can stack under it.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** Controls that should stay pinned with the title (filter chips, tabs…). */
  children?: ReactNode
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let scroller: HTMLElement | null = el.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement
    }
    if (!scroller) return
    const sc = scroller
    const onScroll = (): void => setStuck(sc.scrollTop > 4)
    const ro = new ResizeObserver(() => sc.style.setProperty('--sticky-h', `${el.offsetHeight}px`))
    ro.observe(el)
    onScroll()
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      sc.removeEventListener('scroll', onScroll)
      sc.style.removeProperty('--sticky-h')
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={ref} className={`page-sticky ${stuck ? 'is-stuck' : ''}`}>
      <header className="fade-rise flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title truncate font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="page-subtitle truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children && <div className="page-sticky-extra">{children}</div>}
    </div>
  )
}
