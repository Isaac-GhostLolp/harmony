import { useEffect, useState } from 'react'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { useFavoriteSync } from '@/utils/favorites'
import { SongList } from '@/components/SongList'
import { t } from '@/i18n'

export function History(): JSX.Element {
  const [songs, setSongs] = useState<Song[]>([])
  useFavoriteSync(setSongs)

  const load = async (): Promise<void> =>
    setSongs((await api.history.getRecent()) as Song[])

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <PageHeader title={t('Histórico')} subtitle={t('Tocadas recentemente')} />
      {songs.length === 0 ? (
        <EmptyState title={t('Histórico vazio')} hint={t('As músicas que você ouvir aparecerão aqui.')} />
      ) : (
        <SongList songs={songs} onChanged={load} />
      )}
    </div>
  )
}
