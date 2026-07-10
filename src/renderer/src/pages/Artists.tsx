import { useEffect, useState } from 'react'
import type { Artist, Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'
import { CoverArt } from '@/components/CoverArt'
import { RefreshMetadataButton } from '@/components/RefreshMetadataButton'

export function Artists(): JSX.Element {
  const [artists, setArtists] = useState<Artist[]>([])
  const [selected, setSelected] = useState<Artist | null>(null)
  const [songs, setSongs] = useState<Song[]>([])

  const load = (): void => {
    api.artists.getAll().then((a) => setArtists(a as Artist[]))
  }
  useEffect(load, [])

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
        <div className="fade-rise mb-6 flex items-end gap-5">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full shadow-lg">
            <CoverArt src={selected.imagePath} title={selected.name} size="full" rounded="full" />
          </div>
          <div className="min-w-0 pb-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">Artista</p>
            <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">{selected.name}</h1>
            <p className="mt-1 text-xs text-muted">{songs.length} músicas</p>
          </div>
        </div>
        <SongList songs={songs} onChanged={() => open(selected)} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Artistas"
        subtitle={`${artists.length} artistas`}
        actions={<RefreshMetadataButton onDone={load} />}
      />
      {artists.length === 0 ? (
        <EmptyState title="Nenhum artista ainda" hint="Importe músicas para popular esta página." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {artists.map((artist) => (
            <button
              key={artist.id}
              onClick={() => open(artist)}
              className="lift press flex flex-col items-center gap-3 rounded-2xl p-4 text-center"
            >
              <div className="h-28 w-28 overflow-hidden rounded-full shadow-md">
                <CoverArt src={artist.imagePath} title={artist.name} size="full" rounded="full" />
              </div>
              <div className="w-full min-w-0">
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
