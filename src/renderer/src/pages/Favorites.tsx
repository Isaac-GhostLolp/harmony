import { useCallback, useEffect, useState } from 'react'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'

export function Favorites(): JSX.Element {
  const [songs, setSongs] = useState<Song[]>([])
  const load = useCallback(async () => {
    setSongs((await api.favorites.getAll()) as Song[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHeader title="Favoritos" subtitle={`${songs.length} músicas que você amou`} />
      {songs.length === 0 ? (
        <EmptyState title="Nada por aqui ainda" hint="Toque no coração de qualquer música para guardá-la aqui." />
      ) : (
        <SongList songs={songs} onChanged={load} />
      )}
    </div>
  )
}
