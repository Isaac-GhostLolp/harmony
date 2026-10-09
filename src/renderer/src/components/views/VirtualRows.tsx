import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Rows of equal height, of which only the ones on screen are mounted — the
 * grid, crate and shelf views lay thousands of songs out with it, as the
 * list does. Rows are measured against the page's scrolling element (<main>).
 *
 * The layout depends on the width (how many covers fit in a row), so the
 * width is handed to the caller, who turns it into rows.
 */
export function useContainerWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

const OVERSCAN = 3

export function VirtualRows({
  count,
  rowHeight,
  renderRow,
  className = ''
}: {
  count: number
  rowHeight: number
  renderRow: (index: number) => React.ReactNode
  className?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 12) })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let scroller: HTMLElement | null = el.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    let frame = 0
    const update = (): void => {
      frame = 0
      const top = el.getBoundingClientRect().top
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0
      const viewH = scroller ? scroller.clientHeight : window.innerHeight
      const first = Math.floor((viewTop - top) / rowHeight)
      const last = Math.ceil((viewTop + viewH - top) / rowHeight)
      const start = Math.max(0, Math.min(count, first - OVERSCAN))
      const end = Math.max(start, Math.min(count, last + OVERSCAN))
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }))
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    const target: HTMLElement | Window = scroller ?? window
    target.addEventListener('scroll', schedule, { passive: true })
    const ro = new ResizeObserver(schedule)
    if (scroller) ro.observe(scroller)
    return () => {
      cancelAnimationFrame(frame)
      target.removeEventListener('scroll', schedule)
      ro.disconnect()
    }
  }, [count, rowHeight])

  const rows: React.ReactNode[] = []
  for (let i = range.start; i < Math.min(range.end, count); i++) rows.push(renderRow(i))
  return (
    <div ref={ref} className={className} style={{ height: count * rowHeight, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: range.start * rowHeight }}>{rows}</div>
    </div>
  )
}
