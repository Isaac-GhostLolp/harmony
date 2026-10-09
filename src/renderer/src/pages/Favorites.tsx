import { useCallback, useEffect, useState } from 'react'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { COVERS_CHANGED_EVENT } from '@/store/coverCreatorStore'
import { SongViews, ViewSwitcher, useViewMode } from '@/components/views/SongViews'

export function Favorites(): JSX.Element {
  const [songs, setSongs] = useState<Song[]>([])
  const [view, setView] = useViewMode('favorites')
  const load = useCallback(async () => {
    setSongs((await api.favorites.getAll()) as Song[])
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(COVERS_CHANGED_EVENT, load)
    return () => window.removeEventListener(COVERS_CHANGED_EVENT, load)
  }, [load])

  return (
    <div>
      <PageHeader
        title="Favoritos"
        subtitle={`${songs.length} músicas que você amou`}
        actions={songs.length > 0 ? <ViewSwitcher mode={view} onChange={setView} /> : undefined}
      />
      {songs.length === 0 ? (
        <EmptyState title="Nada por aqui ainda" hint="Toque no coração de qualquer música para guardá-la aqui." />
      ) : (
        <div key={view} className="fade-in">
          <SongViews mode={view} songs={songs} onChanged={load} />
        </div>
      )}
    </div>
  )
}
