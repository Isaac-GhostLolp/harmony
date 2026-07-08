import { useEffect, useState } from 'react'
import { MicVocal } from 'lucide-react'
import type { Artist, Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'

export function Artists(): JSX.Element {
  const [artists, setArtists] = useState<Artist[]>([])
  const [selected, setSelected] = useState<Artist | null>(null)
  const [songs, setSongs] = useState<Song[]>([])

  useEffect(() => {
    api.artists.getAll().then((a) => setArtists(a as Artist[]))
  }, [])

  const open = async (artist: Artist): Promise<void> => {
    setSelected(artist)
    setSongs((await api.artists.getSongs(artist.id)) as Song[])
  }

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} className="mb-4 text-xs text-muted hover:text-ink">
          ← Artistas
        </button>
        <PageHeader title={selected.name} subtitle={`${songs.length} músicas`} />
        <SongList songs={songs} onChanged={() => open(selected)} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Artistas" subtitle={`${artists.length} artistas`} />
      {artists.length === 0 ? (
        <EmptyState title="Nenhum artista ainda" hint="Importe músicas para popular esta página." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {artists.map((artist) => (
            <button
              key={artist.id}
              onClick={() => open(artist)}
              className="glass flex items-center gap-3 rounded-2xl p-3 text-left transition-transform hover:-translate-y-0.5"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)]">
                <MicVocal size={17} className="text-[var(--accent)]" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{artist.name}</p>
                <p className="text-xs text-muted">{artist.songCount} músicas</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
