import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Heart,
  Music2,
  MicVocal,
  PictureInPicture2
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useUiStore } from '@/store/uiStore'
import { formatDuration, mediaUrl } from '@/utils/format'
import { api } from '@/services/api'

function fill(value: number, max: number): React.CSSProperties {
  return { '--fill': `${max > 0 ? (value / max) * 100 : 0}%` } as React.CSSProperties
}

export function PlayerBar(): JSX.Element {
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const volume = usePlayerStore((s) => s.volume)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat, setVolume, seek, setFavoriteFlag } =
    usePlayerStore()
  const toggleQueue = useUiStore((s) => s.toggleQueue)
  const toggleLyrics = useUiStore((s) => s.toggleLyrics)
  const lyricsOpen = useUiStore((s) => s.lyricsOpen)

  const duration = song?.duration ?? 0
  const cover = mediaUrl(song?.coverPath ?? null)

  const toggleFavorite = async (): Promise<void> => {
    if (!song) return
    const fav = await api.favorites.toggle(song.id)
    setFavoriteFlag(song.id, fav as boolean)
  }

  return (
    <footer className="glass z-10 m-3 mt-0 flex h-[88px] items-center gap-4 rounded-2xl px-4">
      {/* Now playing */}
      <div className="flex w-64 min-w-0 items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--bg-raised)]">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music2 size={20} className="text-muted" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{song?.title ?? 'Nada tocando'}</p>
          <p className="truncate text-xs text-muted">{song?.artist ?? 'Importe sua biblioteca'}</p>
        </div>
        {song && (
          <button
            onClick={toggleFavorite}
            className="ml-1 text-muted transition-colors hover:text-[var(--accent)]"
            aria-label="Favoritar"
          >
            <Heart
              size={16}
              fill={song.favorite ? 'var(--accent)' : 'none'}
              stroke={song.favorite ? 'var(--accent)' : 'currentColor'}
            />
          </button>
        )}
      </div>

      {/* Transport + progress */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className={shuffle ? 'text-[var(--accent)]' : 'text-muted hover:text-ink'}
            aria-label="Aleatório"
          >
            <Shuffle size={16} />
          </button>
          <button onClick={previous} className="text-muted hover:text-ink" aria-label="Anterior">
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            className="grid h-10 w-10 place-items-center rounded-full bg-ink text-base transition-transform hover:scale-105"
            style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
            aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={next} className="text-muted hover:text-ink" aria-label="Próxima">
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            onClick={cycleRepeat}
            className={repeat !== 'off' ? 'text-[var(--accent)]' : 'text-muted hover:text-ink'}
            aria-label="Repetir"
          >
            {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>

        <div className="flex w-full max-w-xl items-center gap-2 text-[11px] text-muted">
          <span className="w-9 text-right tabular-nums">{formatDuration(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.5}
            value={Math.min(currentTime, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1"
            style={fill(currentTime, duration)}
            aria-label="Progresso"
          />
          <span className="w-9 tabular-nums">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Volume + queue */}
      <div className="flex w-60 items-center justify-end gap-3">
        <button
          onClick={toggleLyrics}
          className={lyricsOpen ? 'text-[var(--accent)]' : 'text-muted hover:text-ink'}
          aria-label="Letras"
        >
          <MicVocal size={17} />
        </button>
        <button
          onClick={() => api.player.toggleMini()}
          className="text-muted hover:text-ink"
          aria-label="Mini player"
        >
          <PictureInPicture2 size={17} />
        </button>
        <button onClick={toggleQueue} className="text-muted hover:text-ink" aria-label="Fila">
          <ListMusic size={18} />
        </button>
        <button
          onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
          className="text-muted hover:text-ink"
          aria-label="Mudo"
        >
          {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24"
          style={fill(volume, 1)}
          aria-label="Volume"
        />
      </div>
    </footer>
  )
}
