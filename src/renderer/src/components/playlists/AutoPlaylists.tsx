import { useEffect, useState } from 'react'
import { Play, Save } from 'lucide-react'
import type { Song } from '@/types'
import type { AutoKind } from '../../../../core/playlistsPlus'
import { api } from '@/services/api'
import { SongList } from '@/components/SongList'
import { EmptyState } from '@/components/EmptyState'
import { CoverArt } from '@/components/CoverArt'
import { usePlayerStore } from '@/store/playerStore'
import { onFavoriteChange, withFavorite } from '@/utils/favorites'
import { totalTime } from './PlaylistDetail'
import { t, tk, tn } from '@/i18n'

/** "Feitas para você": playlists the Harmony makes from what you listen to */
export const AUTO: { kind: AutoKind; emoji: string; name: string; hint: string; from: string; to: string }[] = [
  { kind: 'daily', emoji: '🎲', name: tk('Mix do dia'), hint: tk('O que você tem ouvido, misturado. Muda todo dia.'), from: '#7c6cf4', to: '#ff5c9a' },
  { kind: 'loop', emoji: '🔁', name: tk('Em loop'), hint: tk('As que você mais tocou nos últimos 30 dias.'), from: '#ff8a3d', to: '#ff3d6e' },
  { kind: 'forgotten', emoji: '🕰️', name: tk('Esquecidas'), hint: tk('Músicas que você amava e não ouve há mais de 2 meses.'), from: '#3d9bff', to: '#2ad1c9' },
  { kind: 'discoveries', emoji: '🆕', name: tk('Descobertas recentes'), hint: tk('O que chegou na sua biblioteca no último mês.'), from: '#3ddc97', to: '#c3f73a' }
]

export function AutoRow({ onOpen }: { onOpen: (kind: AutoKind) => void }): JSX.Element {
  const [covers, setCovers] = useState<Record<string, Song[]>>({})
  useEffect(() => {
    let live = true
    void Promise.all(AUTO.map(async (a) => [a.kind, (await api.playlists.auto(a.kind)) as Song[]] as const)).then((r) => {
      if (live) setCovers(Object.fromEntries(r))
    })
    return () => {
      live = false
    }
  }, [])
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold">{t('✨ Feitas para você')}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
        {AUTO.map((a) => {
          const songs = covers[a.kind]
          return (
            <button
              key={a.kind}
              onClick={() => onOpen(a.kind)}
              className="lift relative flex h-28 flex-col justify-end overflow-hidden rounded-2xl p-3 text-left text-white"
              style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
            >
              <div className="absolute right-2 top-2 flex -space-x-3 opacity-90">
                {(songs ?? []).slice(0, 3).map((s) => (
                  <div key={s.id} className="overflow-hidden rounded-lg ring-2 ring-black/20">
                    <CoverArt src={s.coverPath} title={s.title} size="sm" />
                  </div>
                ))}
              </div>
              <span className="text-2xl drop-shadow">{a.emoji}</span>
              <span className="text-sm font-bold drop-shadow">{t(a.name)}</span>
              <span className="text-[11px] text-white/80">{songs ? tn(songs.length, '{n} música', '{n} músicas') : '…'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function AutoDetail({ kind, onBack, onSaved }: { kind: AutoKind; onBack: () => void; onSaved: (id: number) => void }): JSX.Element {
  const meta = AUTO.find((a) => a.kind === kind)!
  const [songs, setSongs] = useState<Song[] | null>(null)
  useEffect(() => onFavoriteChange((c) => setSongs((s) => (s ? withFavorite(s, c) : s))), [])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    void (api.playlists.auto(kind) as Promise<Song[]>).then(setSongs)
  }, [kind])

  const save = async (): Promise<void> => {
    if (!songs?.length) return
    setSaving(true)
    const name = `${t(meta.name)} · ${new Date().toLocaleDateString()}`
    const id = Number(await api.playlists.create(name))
    for (const s of songs) await api.playlists.addSong(id, s.id)
    await api.playlists.updateMeta(id, { emoji: meta.emoji, color: meta.from })
    setSaving(false)
    onSaved(id)
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-xs text-muted hover:text-ink">
        {t('← Playlists')}
      </button>
      <div className="fade-rise mb-6 flex flex-wrap items-end gap-5 rounded-3xl p-7 text-white" style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}>
        <span className="text-6xl drop-shadow">{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-white/70">{t('Feita para você')}</p>
          <h1 className="text-3xl font-bold">{t(meta.name)}</h1>
          <p className="mt-1 text-sm text-white/80">{t(meta.hint)}</p>
          {songs && (
            <p className="mt-1 text-xs text-white/70">
              {tn(songs.length, '{n} música', '{n} músicas')} · {totalTime(songs)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            disabled={!songs?.length}
            onClick={() => songs && usePlayerStore.getState().playQueue(songs, 0)}
            className="press flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            <Play size={15} fill="currentColor" /> {t('Tocar')}
          </button>
          <button
            disabled={!songs?.length || saving}
            onClick={() => void save()}
            className="press flex items-center gap-2 rounded-full bg-black/30 px-4 py-2.5 text-xs font-semibold backdrop-blur hover:bg-black/45 disabled:opacity-50"
          >
            <Save size={14} /> {t('Salvar como playlist')}
          </button>
        </div>
      </div>
      {songs === null ? null : songs.length === 0 ? (
        <EmptyState title={t('Nada por aqui ainda')} hint={t('Ouça mais um pouco: esta playlist se monta com o seu histórico.')} />
      ) : (
        <SongList songs={songs} />
      )}
    </div>
  )
}
