import { useCallback, useState } from 'react'
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
  if (!song) return null
  const cover = mediaUrl(song.coverPath)

  const toggleFavorite = async (): Promise<void> => {
    const fav = await api.favorites.toggle(song.id)
    setFavoriteFlag(song.id, fav as boolean)
  }

  return (
    <div className="m-now fixed inset-0 z-[130] flex flex-col overflow-hidden">
      {cover && <div aria-hidden className="m-now-bg" style={{ backgroundImage: `url(${cover})` }} />}

      <div className="relative flex items-center justify-between px-3 pt-3">
        <button onClick={onClose} className="grid h-11 w-11 place-items-center" aria-label={t('Fechar')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{t('Tocando agora')}</p>
        <button
          onClick={() => {
            onClose()
            useUiStore.getState().toggleQueue()
          }}
          className="grid h-11 w-11 place-items-center"
          aria-label={t('Fila')}
        >
          <AppIcon slot="queue" size={21} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-8 py-4">
        <div className="aspect-square w-full max-w-[min(100%,52vh)] overflow-hidden rounded-3xl shadow-2xl">
          <CoverArt src={song.coverPath} title={song.title} size="full" rounded="2xl" />
        </div>
      </div>

      <div className="relative px-7 pb-[max(28px,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{song.title}</p>
            <p className="truncate text-sm text-muted">{song.artist ?? ''}</p>
          </div>
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
      </div>
    </div>
  )
}
