import { useEffect, useState } from 'react'
import { Plus, Check, RefreshCw } from 'lucide-react'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { CoverArt } from '@/components/CoverArt'
import { usePlayerStore } from '@/store/playerStore'
import { t } from '@/i18n'

/**
 * "Completar a playlist": songs from the library that fit it (the same
 * artists, then the same genres), each one a tap away from joining.
 */
export function Suggestions({ playlistId, version, onAdded }: { playlistId: number; version: number; onAdded: () => void }): JSX.Element | null {
  const [list, setList] = useState<Song[]>([])
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState(true)

  const load = (): void => {
    void (api.playlists.suggest(playlistId) as Promise<Song[]>).then((s) => {
      setList(s)
      setAdded(new Set())
    })
  }
  useEffect(load, [playlistId, version])

  if (!list.length) return null
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button onClick={() => setOpen((o) => !o)} className="text-left">
          <h3 className="text-sm font-semibold">{t('✨ Completar a playlist')}</h3>
          <p className="text-xs text-muted">{t('Músicas da sua biblioteca que combinam com ela.')}</p>
        </button>
        {open && (
          <button onClick={load} className="flex items-center gap-1.5 rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-xs text-muted hover:text-ink">
            <RefreshCw size={12} /> {t('Outras')}
          </button>
        )}
      </div>
      {open && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {list.map((s) => {
            const done = added.has(s.id)
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-[var(--bg-raised)]">
                <button onClick={() => usePlayerStore.getState().playQueue([s], 0)} aria-label={t('Tocar {title}', { title: s.title })}>
                  <CoverArt src={s.coverPath} title={s.title} size="sm" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{s.title}</p>
                  <p className="truncate text-xs text-muted">{s.artist ?? '—'}</p>
                </div>
                <button
                  disabled={done}
                  onClick={async () => {
                    await api.playlists.addSong(playlistId, s.id)
                    setAdded((a) => new Set(a).add(s.id))
                    onAdded()
                  }}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${done ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-muted hover:text-ink'}`}
                  aria-label={done ? t('Adicionada') : t('Adicionar à playlist')}
                >
                  {done ? <Check size={14} /> : <Plus size={15} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
