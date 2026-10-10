import { useState } from 'react'
import { BookOpen, Disc3, LayoutGrid, List } from 'lucide-react'
import type { Song } from '@/types'
import { SongList } from '@/components/SongList'
import { CoverGrid } from './CoverGrid'
import { RecordCrate } from './RecordCrate'
import { BookShelf } from './BookShelf'
import { t, tk } from '@/i18n'

export type ViewMode = 'list' | 'grid' | 'records' | 'books'

const MODES: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: 'list', label: tk('Lista'), icon: List },
  { id: 'grid', label: tk('Capas'), icon: LayoutGrid },
  { id: 'records', label: tk('Discos'), icon: Disc3 },
  { id: 'books', label: tk('Estante'), icon: BookOpen }
]

/** The chosen view, remembered per page (library, favorites…). */
export function useViewMode(page: string): [ViewMode, (m: ViewMode) => void] {
  const key = `harmony.view.${page}`
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(key)
      return MODES.some((m) => m.id === v) ? (v as ViewMode) : 'list'
    } catch {
      return 'list'
    }
  })
  const set = (m: ViewMode): void => {
    setMode(m)
    try {
      localStorage.setItem(key, m)
    } catch {
      /* only this session then */
    }
  }
  return [mode, set]
}

export function ViewSwitcher({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-[var(--bg-raised)] p-1" role="radiogroup" aria-label={t('Modo de visualização')}>
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          role="radio"
          aria-checked={mode === id}
          title={t(label)}
          className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors ${
            mode === id ? 'bg-[var(--accent)] text-white' : 'text-muted hover:text-ink'
          }`}
        >
          <Icon size={14} />
          {mode === id && <span>{t(label)}</span>}
        </button>
      ))}
    </div>
  )
}

/** The songs, shown the way the user picked. */
export function SongViews({
  mode,
  songs,
  onChanged
}: {
  mode: ViewMode
  songs: Song[]
  onChanged?: () => void
}): JSX.Element {
  if (mode === 'grid') return <CoverGrid songs={songs} />
  if (mode === 'records') return <RecordCrate songs={songs} />
  if (mode === 'books') return <BookShelf songs={songs} />
  return <SongList songs={songs} onChanged={onChanged} />
}
