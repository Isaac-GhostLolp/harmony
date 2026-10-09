import { useMemo, useState } from 'react'
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

const SHELF_H = 212 // a shelf: the tallest book plus the plank
const BOOK_MAX_H = 184
const GAP = 3

/** Spine width: thicker books for albums with more tracks. */
const spineWidth = (g: AlbumGroup): number => 26 + Math.min(g.songs.length, 18) * 2.4
/** Heights vary a little, like a real shelf (stable per album). */
const spineHeight = (g: AlbumGroup): number => BOOK_MAX_H - (hueOf(g.key) % 5) * 9

/**
 * The library as a bookshelf: every album is a book standing on a plank,
 * its spine cut from the cover art, thicker the more tracks it has. The
 * album that's playing wears a ribbon bookmark. A click opens the book:
 * the cover on one page, the tracks as its table of contents on the other.
 */
export function BookShelf({ songs }: { songs: Song[] }): JSX.Element {
  const [ref, width] = useContainerWidth()
  const [open, setOpen] = useState<AlbumGroup | null>(null)
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id)

  const albums = useMemo(() => groupAlbums(songs), [songs])
  // pack books onto shelves by their spine widths
  const shelves = useMemo(() => {
    const out: AlbumGroup[][] = []
    const room = Math.max(200, width - 24)
    let row: AlbumGroup[] = []
    let used = 0
    for (const a of albums) {
      const w = spineWidth(a) + GAP
      if (row.length && used + w > room) {
        out.push(row)
        row = []
        used = 0
      }
      row.push(a)
      used += w
    }
    if (row.length) out.push(row)
    return out
  }, [albums, width])

  return (
    <div ref={ref}>
      {width > 0 && (
        <VirtualRows
          count={shelves.length}
          rowHeight={SHELF_H}
          renderRow={(r) => (
            <div key={r} className="shelf" style={{ height: SHELF_H }}>
              <div className="shelf-books" style={{ gap: GAP }}>
                {shelves[r].map((a) => (
                  <Spine key={a.key} group={a} playing={a.songs.some((s) => s.id === currentId)} onOpen={() => setOpen(a)} />
                ))}
              </div>
              <div className="shelf-plank" />
            </div>
          )}
        />
      )}
      <AnimatePresence>{open && <OpenBook group={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  )
}

function Spine({ group, playing, onOpen }: { group: AlbumGroup; playing: boolean; onOpen: () => void }): JSX.Element {
  const cover = mediaUrl(group.coverPath)
  const hue = hueOf(group.title)
  const w = spineWidth(group)
  return (
    <button
      onClick={onOpen}
      className={`book ${playing ? 'is-playing' : ''}`}
      style={{ width: w, height: spineHeight(group) }}
      title={`${group.title} — ${group.artist ?? ''}`}
    >
      <span
        className="book-cover"
        style={
          cover
            ? { backgroundImage: `url("${cover}")` }
            : { background: `linear-gradient(180deg, hsl(${hue} 55% 42%), hsl(${(hue + 30) % 360} 50% 24%))` }
        }
      />
      <span className="book-shade" />
      <span className="book-band top" />
      <span className="book-band bottom" />
      <span className="book-title" style={{ fontSize: w < 36 ? 10 : 11.5 }}>
        {group.title}
      </span>
      {w >= 40 && <span className="book-author">{group.artist ?? ''}</span>}
      {playing && <span className="book-ribbon" />}
    </button>
  )
}

function OpenBook({ group, onClose }: { group: AlbumGroup; onClose: () => void }): JSX.Element {
  useEscape(onClose)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const onThis = group.songs.some((s) => s.id === currentId)

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <div className="open-book" onMouseDown={(e) => e.stopPropagation()}>
        {/* left page: the frontispiece */}
        <motion.div
          className="page page-left"
          initial={{ rotateY: 90 }}
          animate={{ rotateY: 0 }}
          exit={{ rotateY: 90 }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="w-[62%] overflow-hidden rounded-sm shadow-[0_6px_20px_rgb(0_0_0/0.35)]">
            <CoverArt src={group.coverPath} title={group.title} size="full" rounded="lg" className="!aspect-square !h-auto !rounded-sm" />
          </div>
          <h2 className="page-title mt-5">{group.title}</h2>
          <p className="page-sub">{group.artist ?? 'Autor desconhecido'}</p>
          <CoverButton group={group} className="mt-3 !text-[#6b5a44] hover:!text-[#2b2620]" />
          <p className="page-meta">
            {group.year ? `${group.year} · ` : ''}
            {group.songs.length} {group.songs.length === 1 ? 'capítulo' : 'capítulos'} · {formatDuration(albumDuration(group))}
          </p>
          <span className="page-number">i</span>
        </motion.div>

        {/* right page: the table of contents */}
        <motion.div
          className="page page-right"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <button onClick={onClose} className="page-close" aria-label="Fechar o livro">
            <X size={15} />
          </button>
          <p className="page-heading">Sumário</p>
          <div className="toc">
            {group.songs.map((s, i) => {
              const active = s.id === currentId
              return (
                <button key={s.id} onClick={() => playQueue(group.songs, i)} className={`toc-row ${active ? 'is-active' : ''}`}>
                  <span className="toc-num">{i + 1}.</span>
                  <span className="toc-title">{s.title}</span>
                  <span className="toc-dots" />
                  <span className="toc-time">{formatDuration(s.duration)}</span>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => (onThis ? togglePlay() : playQueue(group.songs, 0))}
            className="page-play"
          >
            {onThis && isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {onThis && isPlaying ? 'Pausar a leitura' : onThis ? 'Continuar a leitura' : 'Começar a ler'}
          </button>
          <span className="page-number">ii</span>
        </motion.div>
      </div>
    </motion.div>,
    document.body
  )
}
