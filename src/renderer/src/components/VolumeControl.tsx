import { useRef, useState, useEffect } from 'react'
import { AppIcon } from '@/components/icons/AppIcon'
import { t } from '@/i18n'

/**
 * Spotify-style volume control: scrolling the wheel over it nudges the volume
 * (up = louder), a small percentage bubble fades in while adjusting, and the
 * mute button remembers the previous level. The wheel handler is non-passive
 * and scoped to this element, so it never scrolls the page.
 *
 * Like the seek bar it lives on the blurred glass footer, so the fill and thumb
 * move with transforms on their own layers: changing the volume never
 * repaints (and re-blurs) the footer.
 */
export function VolumeControl({
  volume,
  onChange
}: {
  volume: number
  onChange: (v: number) => void
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const lastNonZero = useRef(volume > 0 ? volume : 0.8)
  const [showPct, setShowPct] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)

  if (volume > 0) lastNonZero.current = volume

  const flashPct = (): void => {
    setShowPct(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowPct(false), 1200)
  }

  // Non-passive wheel listener so we can preventDefault (stop page scroll).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const step = e.deltaY < 0 ? 0.05 : -0.05
      const next = Math.min(1, Math.max(0, Math.round((volume + step) * 100) / 100))
      onChange(next)
      flashPct()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [volume, onChange])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  const slot = volume === 0 ? 'mute' : volume < 0.5 ? 'volumeLow' : 'volume'

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2">
      {/* percentage bubble */}
      <div
        className={`pointer-events-none absolute -top-7 right-0 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums shadow-lg transition-opacity duration-300 ${
          showPct ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {Math.round(volume * 100)}%
      </div>
      <button
        onClick={() => {
          onChange(volume === 0 ? lastNonZero.current : 0)
          flashPct()
        }}
        className="text-muted transition-colors hover:text-ink"
        aria-label={t('Mudo')}
      >
        <AppIcon slot={slot} size={18} />
      </button>
      <div className="group relative flex h-6 w-24 items-center">
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-[var(--bg-raised)]">
          <div
            className="absolute inset-0 origin-left rounded-full bg-[var(--text-primary)] transition-transform duration-100 will-change-transform group-hover:bg-[var(--accent)]"
            style={{ transform: `scaleX(${volume})` }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-0 transition-transform duration-100 will-change-transform"
          style={{ transform: `translateX(${volume * 100}%)` }}
        >
          <div className="absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow transition-transform duration-150 group-hover:scale-100" />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            onChange(Number(e.target.value))
            flashPct()
          }}
          className="absolute left-0 top-1/2 h-6 w-full -translate-y-1/2 cursor-pointer opacity-0"
          aria-label={t('Volume')}
        />
      </div>
    </div>
  )
}
