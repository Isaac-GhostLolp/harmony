import { Palette } from 'lucide-react'
import { useCoverCreator } from '@/store/coverCreatorStore'
import type { AlbumGroup } from './albums'
import { t } from '@/i18n'

/** "Create a cover" for an album, from the turntable or the open book. */
export function CoverButton({ group, className = '' }: { group: AlbumGroup; className?: string }): JSX.Element {
  const open = useCoverCreator((s) => s.open)
  const first = group.songs[0]
  return (
    <button
      onClick={() => open({ songId: first.id, title: group.title, artist: group.artist ?? '', coverPath: group.coverPath })}
      className={`flex items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-[var(--accent)] ${className}`}
    >
      <Palette size={12} /> {group.coverPath ? t('Trocar capa') : t('Criar capa')}
    </button>
  )
}
