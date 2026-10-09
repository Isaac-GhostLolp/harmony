import type { ReactNode } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useCapsuleStore } from '@/store/capsuleStore'
import { useUiStore } from '@/store/uiStore'
import { useBarStore, type BarStyle } from '@/store/barStore'
import { api } from '@/services/api'
import { mediaUrl } from '@/utils/format'
import { CoverArt } from '@/components/CoverArt'
import { SeekBar } from '@/components/SeekBar'
import { VolumeControl } from '@/components/VolumeControl'
import { StickerZone } from '@/components/stickers/StickerZone'
import { AppIcon } from '@/components/icons/AppIcon'

/**
 * The music bar, in the style chosen in Settings (store/barStore):
 *  • classic  — the full-width bar;
 *  • floating — a pill floating over the content (the content makes room
 *    for it below, see html[data-bar-style] in globals.css);
 *  • compact  — one slim row: transport and progress side by side;
 *  • vinyl    — the cover becomes a record spinning on a turntable, peeking
 *    out of the bar, with the tonearm on it while the song plays;
 *  • cover    — the song's cover, blurred, as the bar's backdrop.
 * The progress bar has its own look (line, wave, real waveform).
 */
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
  const style = useBarStore((s) => s.style)
  const progress = useBarStore((s) => s.progress)

  const duration = song?.duration ?? 0
  const compact = style === 'compact'

  const toggleFavorite = async (): Promise<void> => {
    if (!song) return
    const fav = await api.favorites.toggle(song.id)
    setFavoriteFlag(song.id, fav as boolean)
  }

  const art =
    style === 'vinyl' ? (
      <BarVinyl cover={song?.coverPath ?? null} playing={isPlaying} />
    ) : (
      <CoverArt
        src={song?.coverPath ?? null}
        title={song?.title}
        size={compact ? 'sm' : 'md'}
        rounded={style === 'floating' ? 'full' : 'lg'}
      />
    )

  const nowPlaying = (
    <div className={`flex min-w-0 items-center gap-3 ${compact ? 'w-56' : 'w-64'} ${style === 'vinyl' ? 'pl-1' : ''}`}>
      {art}
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
          <AppIcon slot={song.favorite ? 'liked' : 'like'} size={16} />
        </button>
      )}
      {song && !compact && (
        <button
          onClick={() => useCapsuleStore.getState().openSeal(song)}
          className="text-muted transition-colors hover:text-[var(--accent)]"
          aria-label="Cápsula do tempo"
          title="Guardar uma lembrança nesta música"
        >
          <AppIcon slot="capsule" size={15} />
        </button>
      )}
    </div>
  )

  const shuffleBtn = (
    <button
      onClick={toggleShuffle}
      className={shuffle ? 'text-[var(--accent)]' : 'text-muted hover:text-ink'}
      aria-label="Aleatório"
    >
      <AppIcon slot="shuffle" size={16} active={shuffle} />
    </button>
  )
  const repeatBtn = (
    <button
      onClick={cycleRepeat}
      className={repeat !== 'off' ? 'text-[var(--accent)]' : 'text-muted hover:text-ink'}
      aria-label="Repetir"
    >
      <AppIcon slot={repeat === 'one' ? 'repeatOne' : 'repeat'} size={16} active={repeat !== 'off'} />
    </button>
  )
  const transport = (
    <>
      <button onClick={previous} className="text-muted hover:text-ink" aria-label="Anterior">
        <AppIcon slot="prev" size={compact ? 18 : 20} />
      </button>
      <button
        onClick={togglePlay}
        className={`grid place-items-center rounded-full transition-transform hover:scale-105 ${compact ? 'h-8 w-8' : 'h-10 w-10'}`}
        style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
        aria-label={isPlaying ? 'Pausar' : 'Tocar'}
      >
        {isPlaying ? (
          <AppIcon slot="pause" size={compact ? 15 : 18} />
        ) : (
          <AppIcon slot="play" size={compact ? 15 : 18} className="ml-0.5" />
        )}
      </button>
      <button onClick={next} className="text-muted hover:text-ink" aria-label="Próxima">
        <AppIcon slot="next" size={compact ? 18 : 20} />
      </button>
    </>
  )
  const seekBar = (
    <SeekBar
      currentTime={currentTime}
      duration={duration}
      onSeek={seek}
      look={progress}
      path={song?.path ?? null}
      className={compact ? 'min-w-0 flex-1' : 'max-w-xl'}
    />
  )

  const extras = (
    <div className={`flex items-center justify-end gap-3 ${compact ? '' : 'w-60'}`}>
      <button
        onClick={toggleLyrics}
        className={lyricsOpen ? 'text-[var(--accent)]' : 'text-muted hover:text-ink'}
        aria-label="Letras"
      >
        <AppIcon slot="lyrics" size={17} active={lyricsOpen} />
      </button>
      <button
        onClick={() => useUiStore.getState().setDjMode(true)}
        className="text-muted hover:text-ink"
        aria-label="DJ Mode"
        title="DJ Mode (tela imersiva)"
      >
        <AppIcon slot="dj" size={18} />
      </button>
      <button onClick={() => api.player.toggleMini()} className="text-muted hover:text-ink" aria-label="Mini player">
        <AppIcon slot="mini" size={17} />
      </button>
      <button onClick={toggleQueue} className="text-muted hover:text-ink" aria-label="Fila">
        <AppIcon slot="queue" size={18} />
      </button>
      <VolumeControl volume={volume} onChange={setVolume} />
    </div>
  )

  const body = compact ? (
    <>
      {nowPlaying}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex shrink-0 items-center gap-3.5">
          {shuffleBtn}
          {transport}
          {repeatBtn}
        </div>
        {seekBar}
      </div>
      {extras}
    </>
  ) : (
    <>
      {nowPlaying}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          {shuffleBtn}
          {transport}
          {repeatBtn}
        </div>
        {seekBar}
      </div>
      {extras}
    </>
  )

  return (
    <BarFrame style={style} cover={song?.coverPath ?? null}>
      {body}
      <StickerZone zone="player" label="Player" />
    </BarFrame>
  )
}

/** The bar's box for each style. */
function BarFrame({ style, cover, children }: { style: BarStyle; cover: string | null; children: ReactNode }): JSX.Element {
  if (style === 'floating') {
    return (
      <div className="bar-float pointer-events-none fixed bottom-[18px] right-3 z-30 flex justify-center px-4">
        <footer
          data-stk-host
          className="glass glass-panel pointer-events-auto flex h-[76px] w-full max-w-[980px] items-center gap-4 rounded-full pl-3 pr-6 shadow-2xl"
          style={{ background: 'color-mix(in srgb, var(--bg-base) 82%, transparent)' }}
        >
          {children}
        </footer>
      </div>
    )
  }
  const url = style === 'cover' ? mediaUrl(cover) : undefined
  return (
    <footer
      data-stk-host
      className={`glass glass-panel z-10 m-3 mt-0 flex items-center gap-4 rounded-2xl px-4 ${
        style === 'compact' ? 'h-[60px]' : 'h-[88px]'
      }`}
    >
      {style === 'cover' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
          {url && (
            <img
              key={url}
              src={url}
              alt=""
              className="fade-in absolute inset-0 h-full w-full scale-150 object-cover opacity-60"
              style={{ filter: 'blur(26px) saturate(1.4)' }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--bg-base) 50%, transparent), color-mix(in srgb, var(--bg-base) 62%, transparent) 50%, color-mix(in srgb, var(--bg-base) 66%, transparent))'
            }}
          />
        </div>
      )}
      {children}
    </footer>
  )
}

/** The cover as the label of a record spinning on a small turntable. */
function BarVinyl({ cover, playing }: { cover: string | null; playing: boolean }): JSX.Element {
  const url = mediaUrl(cover)
  return (
    <div className={`bar-vinyl relative h-[76px] w-[76px] shrink-0 -translate-y-3 ${playing ? 'is-playing' : ''}`} aria-hidden>
      <div className="vinyl keep-round absolute inset-0">
        <div className="vinyl-spin">
          <div
            className="vinyl-label"
            style={url ? { backgroundImage: `url("${url}")` } : { background: 'linear-gradient(135deg, var(--accent), #222)' }}
          />
        </div>
        <div className="vinyl-shine" />
      </div>
      {/* the tonearm: resting beside the record, on it while the song plays */}
      <svg className="bar-tonearm absolute -right-3 -top-1 h-[58px] w-[30px] overflow-visible" viewBox="0 0 30 58">
        <circle cx="22" cy="7" r="6" fill="#3a3a42" stroke="#55555f" strokeWidth="1.5" />
        <circle cx="22" cy="7" r="2" fill="#9a9aa6" />
        <path d="M22 7 L23 34 L13 50" stroke="#c9c9d2" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="7" y="47" width="10" height="7" rx="1.5" transform="rotate(35 12 50)" fill="#2b2b31" stroke="#55555f" strokeWidth="1" />
      </svg>
    </div>
  )
}
