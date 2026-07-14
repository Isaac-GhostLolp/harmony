import { useRef, useLayoutEffect, useEffect, useState } from 'react'

export interface FilterChip<T extends string> {
  id: T
  label: string
}

/**
 * Spotify-style filter chips with a sliding highlight that animates between
 * the active pills. The highlight position is measured from the DOM so it
 * tracks any label width; switching filters glides instead of snapping.
 */
export function FilterChips<T extends string>({
  chips,
  active,
  onChange
}: {
  chips: FilterChip<T>[]
  active: T
  onChange: (id: T) => void
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const btnRefs = useRef<Map<T, HTMLButtonElement>>(new Map())
  const [highlight, setHighlight] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const btn = btnRefs.current.get(active)
    const container = containerRef.current
    if (btn && container) {
      const cRect = container.getBoundingClientRect()
      const bRect = btn.getBoundingClientRect()
      setHighlight({ left: bRect.left - cRect.left + container.scrollLeft, width: bRect.width })
    }
  }, [active, chips])

  // Translate a vertical wheel into horizontal scroll — and crucially, stop the
  // page from scrolling underneath. React's onWheel is passive (preventDefault
  // is ignored), so we attach a non-passive native listener instead.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth) return // nothing to scroll sideways
      if (e.deltaY === 0) return
      e.preventDefault() // block the page from scrolling
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative mb-5 flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none' }}
    >
      {highlight && (
        <div
          className="absolute top-0 h-8 rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{
            left: highlight.left,
            width: highlight.width,
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
          }}
        />
      )}
      {chips.map((chip) => (
        <button
          key={chip.id}
          ref={(el) => {
            if (el) btnRefs.current.set(chip.id, el)
          }}
          onClick={() => onChange(chip.id)}
          className={`relative z-10 h-8 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition-colors duration-200 ${
            active === chip.id
              ? 'text-white'
              : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
