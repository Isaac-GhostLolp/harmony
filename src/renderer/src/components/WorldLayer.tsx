import { useEffect, useRef } from 'react'
import { useUiStore } from '@/store/uiStore'
import { themeDirector } from '@/worlds/ThemeDirector'
import { findWorld } from '@/worlds/registry'
import { setCustomImage } from '@/worlds/custom'

/**
 * Full-viewport layer behind the whole UI. It renders the active World on a
 * canvas via the ThemeDirector, and — for user-imported media — either feeds a
 * custom image into the custom world, or shows a real <video> element (which is
 * far cheaper than decoding video onto the canvas every frame).
 */
export function WorldLayer(): JSX.Element | null {
  const world = useUiStore((s) => s.world)
  const customMedia = useUiStore((s) => s.customMedia)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const isVideo = world === 'custom' && customMedia?.type === 'video'

  // Keep the <html> world-active class in sync with the active world.
  useEffect(() => {
    document.documentElement.classList.toggle('world-active', Boolean(world))
  }, [world])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    themeDirector.attach(canvas)
    return () => themeDirector.detach()
  }, [])

  // Feed a custom image into the custom world (ignored for video).
  useEffect(() => {
    if (world === 'custom' && customMedia?.type === 'image') {
      setCustomImage(customMedia.url)
    } else {
      setCustomImage(null)
    }
  }, [world, customMedia])

  useEffect(() => {
    let cancelled = false
    // When showing video, the canvas world stays off.
    if (!world || isVideo) {
      themeDirector.setWorld(null)
      return
    }
    const meta = findWorld(world)
    if (!meta) {
      themeDirector.setWorld(null)
      return
    }
    meta.load().then((w) => {
      if (!cancelled) themeDirector.setWorld(w)
    })
    return () => {
      cancelled = true
    }
  }, [world, isVideo])

  return (
    <>
      {isVideo && customMedia && (
        <video
          key={customMedia.url}
          className="pointer-events-none fixed inset-0 h-full w-full object-cover"
          style={{ zIndex: 0 }}
          src={customMedia.url}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 h-full w-full transition-opacity duration-700"
        style={{ opacity: world && !isVideo ? 1 : 0, zIndex: 0 }}
        aria-hidden
      />
    </>
  )
}
