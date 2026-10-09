import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, X } from 'lucide-react'
import type { Song } from '@/types'
import { usePlayerStore } from '@/store/playerStore'
import { CoverArt } from '@/components/CoverArt'
import { formatDuration, mediaUrl } from '@/utils/format'
import { VirtualRows, useContainerWidth } from './VirtualRows'
import { useEscape } from './useEscape'
import { CoverButton } from './CoverButton'
import { albumDuration, groupAlbums, hueOf, type AlbumGroup } from './albums'

const MIN_W = 156
const GAP = 34 // room for a record to slide out over the gap
const TEXT_H = 46

/**
 * The library as a record store: every album is a sleeve with its vinyl
 * tucked inside. Hovering pulls the record half out; the album that's
 * playing keeps its record out, spinning. A click puts it on the turntable.
 */
export function RecordCrate({ songs }: { songs: Song[] }): JSX.Element {
  const [ref, width] = useContainerWidth()
  const [open, setOpen] = useState<AlbumGroup | null>(null)
  const albums = groupAlbums(songs)
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const cols = Math.max(2, Math.floor((width + GAP) / (MIN_W + GAP)))
  const size = width > 0 ? (width - GAP * (cols - 1)) / cols : MIN_W
  const rowH = Math.round(size + TEXT_H + 22)

  return (
    <div ref={ref}>
      {width > 0 && (
        <VirtualRows
          count={Math.ceil(albums.length / cols)}
          rowHeight={rowH}
          renderRow={(r) => (
            <div key={r} className="crate-row relative flex" style={{ gap: GAP, height: rowH }}>
              {albums.slice(r * cols, r * cols + cols).map((a) => {
                const playing = a.songs.some((s) => s.id === currentId)
                return (
                  <button
                    key={a.key}
                    onClick={() => setOpen(a)}
                    className={`record group relative shrink-0 text-left ${playing ? 'is-playing' : ''} ${playing && isPlaying ? 'is-spinning' : ''}`}
                    style={{ width: size }}
                    title={`${a.title} — ${a.artist ?? ''}`}
                  >
                    <div className="relative" style={{ width: size, height: size }}>
                      <Vinyl group={a} className="record-disc absolute top-[4%] h-[92%] w-[92%]" />
                      <div className="record-sleeve absolute inset-0 overflow-hidden rounded-md shadow-xl">
                        <CoverArt src={a.coverPath} title={a.title} size="full" rounded="lg" className="!rounded-md" />
                        {/* worn cardboard edge and a little sheen */}
                        <div className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-br from-white/15 via-transparent to-black/25" />
                      </div>
                    </div>
                    <p className={`mt-2.5 truncate text-sm font-medium ${playing ? 'text-[var(--accent)]' : ''}`}>{a.title}</p>
                    <p className="truncate text-xs text-muted">
                      {a.artist ?? '—'} · {a.songs.length} {a.songs.length === 1 ? 'faixa' : 'faixas'}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        />
      )}
      <AnimatePresence>{open && <Turntable group={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  )
}

/** A vinyl record with the album cover on its label. */
export function Vinyl({ group, className = '' }: { group: AlbumGroup; className?: string }): JSX.Element {
  const cover = mediaUrl(group.coverPath)
  const hue = hueOf(group.title)
  return (
    <div className={`vinyl keep-round ${className}`} aria-hidden>
      <div className="vinyl-spin">
        <div
          className="vinyl-label"
          style={
            cover
              ? { backgroundImage: `url("${cover}")` }
              : { background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 65% 35%))` }
          }
        />
      </div>
      <div className="vinyl-shine" />
    </div>
  )
}

/** The record on a turntable, with its two sides listed. */
function Turntable({ group, onClose }: { group: AlbumGroup; onClose: () => void }): JSX.Element {
  useEscape(onClose)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const onThis = group.songs.some((s) => s.id === currentId)
  const spinning = onThis && isPlaying
  const half = Math.ceil(group.songs.length / 2)
  const sides: [string, Song[], number][] = [
    ['Lado A', group.songs.slice(0, half), 0],
    ['Lado B', group.songs.slice(half), half]
  ]

  const play = (): void => {
    if (onThis) togglePlay()
    else playQueue(group.songs, 0)
  }

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="glass relative flex max-h-[88vh] w-[min(920px,94vw)] flex-col gap-6 overflow-hidden rounded-3xl p-6 md:flex-row"
        style={{ background: 'var(--bg-base)' }}
        initial={{ y: 30, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-[var(--bg-raised)] text-muted hover:text-ink"
          aria-label="Fechar"
        >
          <X size={15} />
        </button>

        {/* the deck */}
        <div className={`deck shrink-0 ${spinning ? 'is-spinning' : ''} ${onThis ? 'is-on' : ''}`}>
          <div className="deck-platter keep-round">
            <motion.div
              className="h-full w-full"
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 120, damping: 18 }}
            >
              <Vinyl group={group} className="h-full w-full" />
            </motion.div>
          </div>
          <div className="deck-arm keep-round" aria-hidden>
            <span className="deck-arm-base" />
            <span className="deck-arm-rod" />
            <span className="deck-arm-head" />
          </div>
          <button onClick={play} className="deck-button keep-round" aria-label={spinning ? 'Pausar' : 'Tocar'}>
            {spinning ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <span className="deck-speed">33⅓</span>
          <span className="deck-led keep-round" />
        </div>

        {/* the sleeve's back */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 pr-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Disco</p>
            <CoverButton group={group} />
          </div>
          <h2 className="mt-1 truncate pr-10 text-2xl font-bold tracking-tight">{group.title}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {group.artist ?? 'Artista desconhecido'}
            {group.year ? ` · ${group.year}` : ''} · {group.songs.length} faixas · {formatDuration(albumDuration(group))}
          </p>
          <button
            onClick={play}
            className="press mt-4 flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white"
          >
            {spinning ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {spinning ? 'Pausar' : onThis ? 'Continuar' : 'Tocar o disco'}
          </button>
          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {sides.map(([label, list, offset]) =>
              list.length === 0 ? null : (
                <div key={label}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{label}</p>
                  {list.map((s, k) => {
                    const active = s.id === currentId
                    return (
                      <button
                        key={s.id}
                        onClick={() => playQueue(group.songs, offset + k)}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-raised)] ${
                          active ? 'bg-[var(--accent-soft)]' : ''
                        }`}
                      >
                        <span className="w-6 shrink-0 text-[11px] tabular-nums text-muted">
                          {label.slice(-1)}
                          {k + 1}
                        </span>
                        <span className={`min-w-0 flex-1 truncate ${active ? 'font-semibold text-[var(--accent)]' : ''}`}>{s.title}</span>
                        <span className="text-[11px] tabular-nums text-muted">{formatDuration(s.duration)}</span>
                      </button>
                    )
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
