import { useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useUiStore } from '@/store/uiStore'
import { CoverArt } from '@/components/CoverArt'
import { SeekBar } from '@/components/SeekBar'
import { useBreathe } from '@/hooks/useBreathe'

/**
 * DJ Mode — a fully immersive, near-empty stage meant to be left running on a
 * second screen. It hides the app chrome and shows just the artwork, the track,
 * and minimal controls that fade away when the mouse is idle. The album cover
 * drives a soft blurred backdrop in the current accent color.
 */
export function DjMode(): JSX.Element | null {
  const djMode = useUiStore((s) => s.djMode)
  const setDjMode = useUiStore((s) => s.setDjMode)

  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const { togglePlay, next, previous, seek } = usePlayerStore()

  const [idle, setIdle] = useState(false)
  const idleTimer = useRef<number | undefined>(undefined)
  const breatheRef = useBreathe<HTMLDivElement>()

  // Hide controls after 3s of no mouse movement; reveal on move.
  useEffect(() => {
    if (!djMode) return
    const wake = (): void => {
      setIdle(false)
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => setIdle(true), 3000)
    }
    wake()
    window.addEventListener('mousemove', wake)
    return () => {
      window.removeEventListener('mousemove', wake)
      window.clearTimeout(idleTimer.current)
    }
  }, [djMode])

  // Esc leaves DJ Mode.
  useEffect(() => {
    if (!djMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'F11') {
        e.preventDefault()
        setDjMode(false)
      }
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [djMode, setDjMode, togglePlay])

  if (!djMode) return null

  const cover = song?.coverPath ?? null
  const duration = song?.duration ?? 0

  return (
    <div className={`dj-root fixed inset-0 z-[120] overflow-hidden bg-black ${idle ? 'dj-idle' : ''}`}>
      {/* blurred cover backdrop tinted by accent */}
      <div className="absolute inset-0">
        {cover ? (
          <img
            src={`harmony://${cover}`}
            alt=""
            className="h-full w-full scale-110 object-cover opacity-30 blur-3xl"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                'radial-gradient(circle at 50% 40%, var(--accent-soft), transparent 70%)'
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
      </div>

      {/* Hint to leave — fades with idle. F11 or Esc exits. */}
      <div className="dj-controls absolute right-6 top-6 flex items-center gap-2 text-xs text-white/50">
        <kbd className="rounded bg-white/10 px-2 py-1 font-mono">F11</kbd>
        <span>ou</span>
        <kbd className="rounded bg-white/10 px-2 py-1 font-mono">Esc</kbd>
        <span>para sair</span>
      </div>

      {/* center stage */}
      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-8">
        <div ref={breatheRef}>
          <CoverArt
            src={cover}
            title={song?.title}
            size="xl"
            rounded="2xl"
            className="shadow-2xl ring-1 ring-white/10"
          />
        </div>

        <div className="max-w-2xl text-center">
          <h1 className="truncate text-4xl font-bold tracking-tight text-white">
            {song?.title ?? 'Nada tocando'}
          </h1>
          <p className="mt-2 text-lg text-white/60">{song?.artist ?? '—'}</p>
        </div>

        {/* minimal controls */}
        <div className="dj-controls flex w-full max-w-lg flex-col items-center gap-5">
          <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} />
          <div className="flex items-center gap-8">
            <button
              onClick={previous}
              className="text-white/70 transition-colors hover:text-white"
              aria-label="Anterior"
            >
              <SkipBack size={26} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              className="grid h-16 w-16 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
              aria-label={isPlaying ? 'Pausar' : 'Tocar'}
            >
              {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
            </button>
            <button
              onClick={next}
              className="text-white/70 transition-colors hover:text-white"
              aria-label="Próxima"
            >
              <SkipForward size={26} fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
