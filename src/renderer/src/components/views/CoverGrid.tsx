import { Play } from 'lucide-react'
import type { Song } from '@/types'
import { usePlayerStore } from '@/store/playerStore'
import { CoverArt } from '@/components/CoverArt'
import { VirtualRows, useContainerWidth } from './VirtualRows'

const MIN_W = 150
const GAP = 16
const TEXT_H = 50

/** Songs as a wall of covers. A click plays from that song on. */
export function CoverGrid({ songs }: { songs: Song[] }): JSX.Element {
  const [ref, width] = useContainerWidth()
  const playQueue = usePlayerStore((s) => s.playQueue)
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const cols = Math.max(2, Math.floor((width + GAP) / (MIN_W + GAP)))
  const cardW = width > 0 ? (width - GAP * (cols - 1)) / cols : MIN_W
  const rowH = Math.round(cardW + TEXT_H + GAP)
  const rows = Math.ceil(songs.length / cols)

  return (
    <div ref={ref}>
      {width > 0 && (
        <VirtualRows
          count={rows}
          rowHeight={rowH}
          renderRow={(r) => (
            <div key={r} className="flex" style={{ gap: GAP, height: rowH }}>
              {songs.slice(r * cols, r * cols + cols).map((song, k) => {
                const i = r * cols + k
                const active = song.id === currentId
                return (
                  <button
                    key={song.id}
                    onClick={() => playQueue(songs, i)}
                    className="group shrink-0 text-left"
                    style={{ width: cardW }}
                    title={`${song.title} — ${song.artist ?? ''}`}
                  >
                    <div
                      className={`relative overflow-hidden rounded-xl shadow-lg transition-transform duration-200 group-hover:-translate-y-1 ${
                        active ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-base)]' : ''
                      }`}
                      style={{ width: cardW, height: cardW }}
                    >
                      <CoverArt src={song.coverPath} title={song.title} size="full" rounded="xl" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      {active && isPlaying ? (
                        <span className="playing-bars absolute bottom-2 right-2" aria-label="Tocando">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        <span className="absolute bottom-2 right-2 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-[var(--accent)] text-white opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100">
                          <Play size={15} fill="currentColor" />
                        </span>
                      )}
                    </div>
                    <p className={`mt-2 truncate text-sm font-medium ${active ? 'text-[var(--accent)]' : ''}`}>{song.title}</p>
                    <p className="truncate text-xs text-muted">{song.artist ?? '—'}</p>
                  </button>
                )
              })}
            </div>
          )}
        />
      )}
    </div>
  )
}
