import { useEffect, useState } from 'react'
import { frameBudgetMs } from '@/utils/perf'
import { usePlayerStore } from '@/store/playerStore'

/**
 * The store's currentTime updates ~4x/s (from `timeupdate`). This hook
 * interpolates between updates with requestAnimationFrame, producing the
 * 60fps clock that karaoke painting and the Edit mode animations need.
 * Only mount it inside views that are actually visible.
 */
export function useSmoothTime(): number {
  const [time, setTime] = useState(() => usePlayerStore.getState().currentTime)

  useEffect(() => {
    let raf = 0
    let anchor = usePlayerStore.getState().currentTime
    let anchorAt = performance.now()

    const unsub = usePlayerStore.subscribe((s) => {
      anchor = s.currentTime
      anchorAt = performance.now()
    })

    let lastMs = 0
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      // Ultra Fast Mode: 30 updates a second (each one re-renders the view)
      const budget = frameBudgetMs()
      if (budget && now - lastMs < budget) return
      lastMs = now
      const playing = usePlayerStore.getState().isPlaying
      setTime(playing ? anchor + (performance.now() - anchorAt) / 1000 : anchor)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [])

  return time
}
