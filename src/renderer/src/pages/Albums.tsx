import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Disc3, Play } from 'lucide-react'
import type { Album, Song } from '@/types'
import { api } from '@/services/api'
import { usePlayerStore } from '@/store/playerStore'
import { mediaUrl } from '@/utils/format'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'

export function Albums(): JSX.Element {
  const [albums, setAlbums] = useState<Album[]>([])
  const [selected, setSelected] = useState<Album | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const playQueue = usePlayerStore((s) => s.playQueue)

  useEffect(() => {
    api.albums.getAll().then((a) => setAlbums(a as Album[]))
  }, [])

  const open = async (album: Album): Promise<void> => {
    setSelected(album)
    setSongs((await api.albums.getSongs(album.id)) as Song[])
  }

  if (selected) {
    const cover = mediaUrl(selected.coverPath)
    return (
      <div>
        <button onClick={() => setSelected(null)} className="mb-4 text-xs text-muted hover:text-ink">
          ← Álbuns
        </button>
        <div className="mb-6 flex items-end gap-5">
          <div className="glass grid h-40 w-40 shrink-0 place-items-center overflow-hidden rounded-2xl">
            {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Disc3 size={40} className="text-muted" />}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{selected.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {selected.artist ?? 'Artista desconhecido'} {selected.year ? `· ${selected.year}` : ''} · {selected.songCount} faixas
            </p>
            <button
              onClick={() => playQueue(songs, 0)}
              className="mt-3 flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white hover:scale-[1.03]"
            >
              <Play size={13} fill="white" /> Tocar
            </button>
          </div>
        </div>
        <SongList songs={songs} onChanged={() => open(selected)} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Álbuns" subtitle={`${albums.length} álbuns na biblioteca`} />
      {albums.length === 0 ? (
        <EmptyState title="Nenhum álbum ainda" hint="Importe músicas com metadados de álbum para vê-los aqui." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {albums.map((album, i) => {
            const cover = mediaUrl(album.coverPath)
            return (
              <motion.button
                key={album.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                onClick={() => open(album)}
                className="glass lift press group rounded-2xl p-3 text-left"
              >
                <div className="mb-2 grid aspect-square place-items-center overflow-hidden rounded-xl bg-[var(--bg-raised)]">
                  {cover ? (
                    <img src={cover} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  ) : (
                    <Disc3 size={28} className="text-muted" />
                  )}
                </div>
                <p className="truncate text-sm font-medium">{album.title}</p>
                <p className="truncate text-xs text-muted">{album.artist ?? '—'}</p>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}
