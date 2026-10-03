import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { formatDuration } from '@/utils/format'

/**
 * Spotify-style seek bar. Hovering reveals a floating time bubble at the cursor
 * and a ghost fill up to that point; the thumb grows on hover; clicking or
 * dragging anywhere scrubs, and the song seeks once on release.
 *
 * Performance: the bar sits on a glass (backdrop-blurred) footer, and every
 * repaint there forces the blur to be recomputed. So nothing here changes
 * layout or paint while the mouse moves: fills scale and the thumb/bubble
 * translate on their own compositor layers, written straight to the DOM once
 * per animation frame. React only re-renders when the song time changes.
 */
export function SeekBar({
  currentTime,
  duration,
  onSeek
}: {
  currentTime: number
  duration: number
  onSeek: (t: number) => void
}): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const bubbleTextRef = useRef<HTMLSpanElement | null>(null)
  const [dragging, setDragging] = useState(false)

  // pointer state lives in refs: no re-render per mouse move
  const rect = useRef<{ left: number; width: number }>({ left: 0, width: 1 })
  const hoverPct = useRef<number | null>(null)
  const dragPct = useRef<number | null>(null)
  const frame = useRef(0)
  const lastLabel = useRef('')

  const playPct = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0
  const playPctRef = useRef(playPct)
  playPctRef.current = playPct

  const paint = (): void => {
    frame.current = 0
    const hp = hoverPct.current
    const shown = dragPct.current ?? playPctRef.current
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${shown})`
    if (thumbRef.current) thumbRef.current.style.transform = `translateX(${shown * 100}%)`
    if (ghostRef.current) {
      ghostRef.current.style.opacity = hp === null ? '0' : '1'
      if (hp !== null) ghostRef.current.style.transform = `scaleX(${hp})`
    }
    if (bubbleRef.current) {
      bubbleRef.current.style.opacity = hp === null ? '0' : '1'
      if (hp !== null) {
        bubbleRef.current.style.transform = `translateX(${hp * 100}%)`
        const label = formatDuration(duration * hp)
        if (label !== lastLabel.current && bubbleTextRef.current) {
          lastLabel.current = label
          bubbleTextRef.current.textContent = label
        }
      }
    }
  }

  const schedule = (): void => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }

  // every render (song time / duration changed): sync the transforms before
  // the browser paints. A transform per timeupdate is free; the old width
  // transition repainted the blurred footer four times a second.
  useLayoutEffect(paint)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const measure = (): void => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    rect.current = { left: r.left, width: Math.max(1, r.width) }
  }

  const pctAt = (clientX: number): number =>
    Math.min(1, Math.max(0, (clientX - rect.current.left) / rect.current.width))

  const onEnter = (): void => {
    measure()
  }

  const onMove = (e: React.PointerEvent): void => {
    const p = pctAt(e.clientX)
    hoverPct.current = p
    if (dragging) dragPct.current = p
    schedule()
  }

  const onDown = (e: React.PointerEvent): void => {
    if (duration <= 0) return
    measure()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = pctAt(e.clientX)
    hoverPct.current = p
    dragPct.current = p
    setDragging(true)
    schedule()
  }

  const finish = (e: React.PointerEvent, commit: boolean): void => {
    if (!dragging) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    const p = dragPct.current
    dragPct.current = null
    setDragging(false)
    if (commit && p !== null) {
      playPctRef.current = p
      onSeek(duration * p)
    }
    schedule()
  }

  const onLeave = (): void => {
    if (dragging) return
    hoverPct.current = null
    schedule()
  }

  return (
    <div className="flex w-full max-w-xl items-center gap-2 text-[11px] text-muted">
      <span className="w-9 text-right tabular-nums">{formatDuration(currentTime)}</span>
      <div
        ref={trackRef}
        className="group relative flex-1 cursor-pointer py-2 [contain:layout_style]"
        onPointerEnter={onEnter}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
      >
        {/* track */}
        <div className="relative h-1 overflow-hidden rounded-full bg-[var(--bg-raised)]">
          {/* ghost fill to hover position */}
          <div
            ref={ghostRef}
            className="absolute inset-0 origin-left rounded-full bg-[var(--text-muted)]/30 opacity-0 will-change-transform"
            style={{ transform: 'scaleX(0)' }}
          />
          {/* actual fill */}
          <div
            ref={fillRef}
            className="absolute inset-0 origin-left rounded-full bg-[var(--accent)] will-change-transform"
          />
        </div>
        {/* thumb: a full-width rail translated by the progress, thumb at its left edge */}
        <div
          ref={thumbRef}
          className="pointer-events-none absolute inset-x-0 top-1/2 h-0 will-change-transform"
        >
          <div className="absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow transition-transform duration-150 group-hover:scale-100" />
        </div>
        {/* hover time bubble, same rail trick */}
        <div
          ref={bubbleRef}
          className="pointer-events-none absolute inset-x-0 -top-6 z-10 h-0 opacity-0 will-change-transform"
          style={{ transform: 'translateX(0%)' }}
        >
          <span
            ref={bubbleTextRef}
            className="absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums shadow-lg"
          >
            0:00
          </span>
        </div>
      </div>
      <span className="w-9 tabular-nums">{formatDuration(duration)}</span>
    </div>
  )
}
