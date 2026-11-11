import { useCallback, useRef, useState, type RefObject } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useUiStore } from '@/store/uiStore'
import { useBarStore } from '@/store/barStore'
import { api } from '@/services/api'
import { mediaUrl } from '@/utils/format'
import { CoverArt } from '@/components/CoverArt'
import { SeekBar } from '@/components/SeekBar'
import { AppIcon } from '@/components/icons/AppIcon'
import { t } from '@/i18n'
import { useBackCloses } from './back'
import { SleepTimerButton } from '@/components/SleepTimer'
import { FocusButton } from './FocusMode'
import { ShareSongButton } from './ShareSong'
import { AlarmButton } from './Everyday'

/**
 * The phone's player: a slim bar above the tabs (tap it to open), and the
 * full-screen "Tocando agora" with the big cover and every control.
 */
export function MobilePlayer(): JSX.Element | null {
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useBackCloses(open, close)
  if (!song) return null

  const duration = song.duration || 0
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const { togglePlay, next } = usePlayerStore.getState()

  return (
    <>
      <div className="m-mini glass" onClick={() => setOpen(true)} role="button" aria-label={t('Abrir o player')}>
        <div className="m-mini-progress" style={{ width: `${pct}%` }} />
        <CoverArt src={song.coverPath} title={song.title} size="sm" rounded="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{song.title}</p>
          <p className="truncate text-xs text-muted">{song.artist ?? ''}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            togglePlay()
          }}
          className="grid h-10 w-10 shrink-0 place-items-center"
          aria-label={isPlaying ? t('Pausar') : t('Tocar')}
        >
          <AppIcon slot={isPlaying ? 'pause' : 'play'} size={22} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            next()
          }}
          className="grid h-10 w-9 shrink-0 place-items-center text-muted"
          aria-label={t('Próxima')}
        >
          <AppIcon slot="next" size={20} />
        </button>
      </div>
      {open && <NowPlaying onClose={close} />}
    </>
  )
}

function NowPlaying({ onClose }: { onClose: () => void }): JSX.Element | null {
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const look = useBarStore((s) => s.progress)
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat, seek, setFavoriteFlag } = usePlayerStore.getState()
  const rootRef = useRef<HTMLDivElement>(null)
  const coverRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipes(rootRef, coverRef, { onNext: next, onPrevious: previous, onClose })
  if (!song) return null
  const cover = mediaUrl(song.coverPath)

  const toggleFavorite = async (): Promise<void> => {
    const fav = await api.favorites.toggle(song.id)
    setFavoriteFlag(song.id, fav as boolean)
  }

  return (
    <div ref={rootRef} className="m-now fixed inset-0 z-[130] flex flex-col overflow-hidden" style={{ touchAction: 'none' }} {...swipe}>
      {cover && <div aria-hidden className="m-now-bg" style={{ backgroundImage: `url(${cover})` }} />}

      <div className="relative flex items-center justify-between px-3 pt-3">
        <button onClick={onClose} className="grid h-11 w-[88px] place-items-center justify-start pl-2.5" aria-label={t('Fechar')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{t('Tocando agora')}</p>
        <div className="flex">
          <button
            // lyrics and queue open over Tocando agora: closing them comes back here
            onClick={() => {
              if (!useUiStore.getState().lyricsOpen) useUiStore.getState().toggleLyrics()
            }}
            className="grid h-11 w-11 place-items-center"
            aria-label={t('Letras')}
          >
            <AppIcon slot="lyrics" size={21} />
          </button>
          <button
            onClick={() => {
              if (!useUiStore.getState().queueOpen) useUiStore.getState().toggleQueue()
            }}
            className="grid h-11 w-11 place-items-center"
            aria-label={t('Fila')}
          >
            <AppIcon slot="queue" size={21} />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-8 py-4">
        <div
          ref={coverRef}
          data-swipe-cover
          className="aspect-square w-full max-w-[min(100%,52vh)] overflow-hidden rounded-3xl shadow-2xl"
          style={{ touchAction: 'none' }}
        >
          <CoverArt src={song.coverPath} title={song.title} size="full" rounded="2xl" />
        </div>
      </div>

      <div className="relative px-7 pb-[max(28px,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{song.title}</p>
            <p className="truncate text-sm text-muted">{song.artist ?? ''}</p>
          </div>
          <ShareSongButton song={song} />
          <button onClick={toggleFavorite} className="grid h-11 w-11 place-items-center" aria-label={t('Favoritar')}>
            <AppIcon slot={song.favorite ? 'liked' : 'like'} size={24} />
          </button>
        </div>

        <SeekBar currentTime={currentTime} duration={song.duration || 0} onSeek={seek} look={look} path={song.path} className="w-full" />

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={toggleShuffle}
            className={`grid h-11 w-11 place-items-center ${shuffle ? 'text-[var(--accent)]' : 'text-muted'}`}
            aria-label={t('Aleatório')}
          >
            <AppIcon slot="shuffle" size={21} active={shuffle} />
          </button>
          <button onClick={previous} className="grid h-12 w-12 place-items-center" aria-label={t('Anterior')}>
            <AppIcon slot="prev" size={28} />
          </button>
          <button
            onClick={togglePlay}
            className="grid h-[72px] w-[72px] place-items-center rounded-full"
            style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
            aria-label={isPlaying ? t('Pausar') : t('Tocar')}
          >
            <AppIcon slot={isPlaying ? 'pause' : 'play'} size={30} className={isPlaying ? '' : 'ml-1'} />
          </button>
          <button onClick={next} className="grid h-12 w-12 place-items-center" aria-label={t('Próxima')}>
            <AppIcon slot="next" size={28} />
          </button>
          <button
            onClick={cycleRepeat}
            className={`grid h-11 w-11 place-items-center ${repeat !== 'off' ? 'text-[var(--accent)]' : 'text-muted'}`}
            aria-label={t('Repetir')}
          >
            <AppIcon slot={repeat === 'one' ? 'repeatOne' : 'repeat'} size={21} active={repeat !== 'off'} />
          </button>
        </div>

        <div className="mt-5 flex justify-center gap-2">
          <FocusButton />
          <SleepTimerButton variant="mobile" />
          <AlarmButton />
        </div>
      </div>
    </div>
  )
}

/**
 * Tocando agora's gestures: the cover slides sideways to change songs (left:
 * next, right: previous), and the whole screen pulls down to close. A slide
 * that doesn't go far enough springs back. The seek bar and the buttons keep
 * their own touches.
 */
function useSwipes(
  rootRef: RefObject<HTMLDivElement>,
  coverRef: RefObject<HTMLDivElement>,
  on: { onNext: () => void; onPrevious: () => void; onClose: () => void }
): React.HTMLAttributes<HTMLDivElement> {
  const g = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; onCover: boolean; id: number } | null>(null)
  const SIDE = 70 // px to change song
  const DOWN = 120 // px to close

  const set = (el: HTMLElement | null, transform: string, animate: boolean): void => {
    if (!el) return
    el.style.transition = animate ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
    el.style.transform = transform
  }

  return {
    onPointerDown: (e) => {
      const target = e.target as HTMLElement
      if (target.closest('button, .seek-track, input')) return
      g.current = { x: e.clientX, y: e.clientY, axis: null, onCover: Boolean(target.closest('[data-swipe-cover]')), id: e.pointerId }
    },
    onPointerMove: (e) => {
      const s = g.current
      if (!s || s.id !== e.pointerId) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (!s.axis) {
        if (Math.hypot(dx, dy) < 10) return
        s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        if (s.axis === 'x' && !s.onCover) {
          g.current = null
          return
        }
      }
      if (s.axis === 'x') set(coverRef.current, `translateX(${dx}px) rotate(${dx / 40}deg)`, false)
      else if (dy > 0) set(rootRef.current, `translateY(${dy}px)`, false)
    },
    onPointerUp: (e) => {
      const s = g.current
      g.current = null
      if (!s || !s.axis) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (s.axis === 'x') {
        if (Math.abs(dx) > SIDE) {
          // the cover leaves to that side, then the new song's comes in from the other
          const out = dx < 0 ? -1 : 1
          set(coverRef.current, `translateX(${out * 120}%)`, true)
          window.setTimeout(() => {
            if (out < 0) on.onNext()
            else on.onPrevious()
            set(coverRef.current, `translateX(${-out * 60}%)`, false)
            requestAnimationFrame(() => set(coverRef.current, 'none', true))
          }, 180)
        } else set(coverRef.current, 'none', true)
      } else if (dy > DOWN) {
        set(rootRef.current, 'translateY(100%)', true)
        window.setTimeout(on.onClose, 200)
      } else set(rootRef.current, 'none', true)
    },
    onPointerCancel: () => {
      g.current = null
      set(coverRef.current, 'none', true)
      set(rootRef.current, 'none', true)
    }
  }
}
