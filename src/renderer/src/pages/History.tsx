import { useEffect, useState } from 'react'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'

export function History(): JSX.Element {
  const [songs, setSongs] = useState<Song[]>([])

  const load = async (): Promise<void> =>
    setSongs((await api.history.getRecent()) as Song[])

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <PageHeader title="Histórico" subtitle="Tocadas recentemente" />
      {songs.length === 0 ? (
        <EmptyState title="Histórico vazio" hint="As músicas que você ouvir aparecerão aqui." />
      ) : (
        <SongList songs={songs} onChanged={load} />
      )}
    </div>
  )
}
