import { useEffect, useState } from 'react'
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

    const tick = (): void => {
      const playing = usePlayerStore.getState().isPlaying
      setTime(playing ? anchor + (performance.now() - anchorAt) / 1000 : anchor)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [])

  return time
}
