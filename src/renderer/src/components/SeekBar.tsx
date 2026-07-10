import { useRef, useState, useCallback } from 'react'
import { formatDuration } from '@/utils/format'

/**
 * Spotify-style seek bar. Hovering reveals a floating time bubble at the cursor
 * and a ghost fill up to that point; the thumb grows on hover; clicking or
 * dragging anywhere scrubs. All motion is CSS-smooth and pointer-driven, so it
 * stays fluid without re-rendering on every mouse move (hover time is local).
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
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState(0)
  const [dragging, setDragging] = useState(false)

  const pct = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const hoverPct = hoverX !== null && trackRef.current
    ? Math.min(1, Math.max(0, hoverX / trackRef.current.clientWidth))
    : 0

  const timeAtX = useCallback(
    (clientX: number): { x: number; t: number } => {
      const el = trackRef.current!
      const rect = el.getBoundingClientRect()
      const x = Math.min(rect.width, Math.max(0, clientX - rect.left))
      return { x, t: duration * (x / rect.width) }
    },
    [duration]
  )

  const onMove = (e: React.PointerEvent): void => {
    if (!trackRef.current) return
    const { x, t } = timeAtX(e.clientX)
    setHoverX(x)
    setHoverTime(t)
    if (dragging) onSeek(t)
  }

  const onDown = (e: React.PointerEvent): void => {
    if (!trackRef.current) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    const { t } = timeAtX(e.clientX)
    onSeek(t)
  }

  const onUp = (e: React.PointerEvent): void => {
    if (dragging) {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
      setDragging(false)
    }
  }

  const shown = dragging ? hoverPct : pct

  return (
    <div className="flex w-full max-w-xl items-center gap-2 text-[11px] text-muted">
      <span className="w-9 text-right tabular-nums">{formatDuration(currentTime)}</span>
      <div
        ref={trackRef}
        className="group relative flex-1 cursor-pointer py-2"
        onPointerMove={onMove}
        onPointerLeave={() => !dragging && setHoverX(null)}
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        {/* track */}
        <div className="relative h-1 overflow-visible rounded-full bg-[var(--bg-raised)]">
          {/* ghost fill to hover position */}
          {hoverX !== null && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--text-muted)]/30"
              style={{ width: `${hoverPct * 100}%` }}
            />
          )}
          {/* actual fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-100 group-hover:bg-[var(--accent)]"
            style={{ width: `${shown * 100}%` }}
          />
          {/* thumb */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow transition-transform duration-150 group-hover:scale-100"
            style={{ left: `${shown * 100}%` }}
          />
        </div>
        {/* hover time bubble */}
        {hoverX !== null && (
          <div
            className="pointer-events-none absolute -top-6 z-10 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums shadow-lg"
            style={{ left: `${hoverX}px` }}
          >
            {formatDuration(hoverTime)}
          </div>
        )}
      </div>
      <span className="w-9 tabular-nums">{formatDuration(duration)}</span>
    </div>
  )
}
