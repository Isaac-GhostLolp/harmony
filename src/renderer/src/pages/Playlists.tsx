import { useEffect, useState } from 'react'
import { ListMusic, Plus, Copy, Trash2, Pencil, Image as ImageIcon } from 'lucide-react'
import type { Playlist, Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'
import { InputDialog, ConfirmDialog } from '@/components/InputDialog'
import { PlaylistEditor } from '@/components/PlaylistEditor'
import { FilterChips } from '@/components/FilterChips'

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; playlist: Playlist }
  | { kind: 'delete'; playlist: Playlist }
  | null

type PlaylistSort = 'custom' | 'recent' | 'oldest' | 'duration' | 'title'

const SORT_CHIPS: { id: PlaylistSort; label: string }[] = [
  { id: 'custom', label: 'Ordem personalizada' },
  { id: 'recent', label: 'Adicionadas por último' },
  { id: 'oldest', label: 'Mais antigas' },
  { id: 'duration', label: 'Duração' },
  { id: 'title', label: 'Título' }
]

/** Sorts playlist songs. 'custom' keeps the manual (drag) order from the DB. */
function sortPlaylistSongs(songs: Song[], sort: PlaylistSort): Song[] {
  switch (sort) {
    case 'recent':
      return [...songs].sort((a, b) => b.addedAt - a.addedAt)
    case 'oldest':
      return [...songs].sort((a, b) => a.addedAt - b.addedAt)
    case 'duration':
      return [...songs].sort((a, b) => b.duration - a.duration)
    case 'title':
      return [...songs].sort((a, b) => a.title.localeCompare(b.title))
    default:
      return songs
  }
}

export function Playlists(): JSX.Element {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selected, setSelected] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editing, setEditing] = useState<Playlist | null>(null)
  const [sort, setSort] = useState<PlaylistSort>('custom')

  const load = async (): Promise<void> =>
    setPlaylists((await api.playlists.getAll()) as Playlist[])

  useEffect(() => {
    load()
  }, [])

  const open = async (p: Playlist): Promise<void> => {
    setSelected(p)
    setSort('custom')
    setSongs((await api.playlists.getSongs(p.id)) as Song[])
  }

  // Electron disables window.prompt/confirm in packaged builds, so all of these
  // go through in-app dialogs (that was the "click does nothing" bug).
  const doCreate = async (name: string): Promise<void> => {
    setDialog(null)
    await api.playlists.create(name)
    load()
  }
  const doRename = async (p: Playlist, name: string): Promise<void> => {
    setDialog(null)
    await api.playlists.rename(p.id, name)
    load()
  }
  const doDelete = async (p: Playlist): Promise<void> => {
    setDialog(null)
    await api.playlists.remove(p.id)
    if (selected?.id === p.id) setSelected(null)
    load()
  }
  const duplicate = async (p: Playlist): Promise<void> => {
    await api.playlists.duplicate(p.id)
    load()
  }

  return (
    <>
      {selected ? (
        <div>
          <button
            onClick={() => {
              setSelected(null)
              load()
            }}
            className="mb-4 text-xs text-muted hover:text-ink"
          >
            ← Playlists
          </button>
          <div
            className="fade-rise mb-6 flex items-end gap-5 rounded-2xl p-6"
            style={{
              background: selected.color
                ? `linear-gradient(135deg, ${selected.color}, transparent 70%)`
                : 'linear-gradient(135deg, var(--accent-soft), transparent 70%)'
            }}
          >
            <div className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-2xl bg-black/20 shadow-lg">
              {selected.image ? (
                <img src={selected.image} alt="" className="h-full w-full object-cover" />
              ) : selected.emoji ? (
                <span className="text-6xl">{selected.emoji}</span>
              ) : (
                <ListMusic size={40} className="text-white/70" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-white/60">Playlist</p>
              <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">{selected.name}</h1>
              {selected.description && (
                <p className="mt-1 line-clamp-2 text-sm text-white/70">{selected.description}</p>
              )}
              <p className="mt-2 text-xs text-white/60">{songs.length} músicas</p>
            </div>
            <button
              onClick={() => setEditing(selected)}
              className="press flex items-center gap-2 self-start rounded-full bg-black/30 px-4 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/50"
            >
              <ImageIcon size={13} /> Personalizar
            </button>
          </div>
          {songs.length === 0 ? (
            <EmptyState
              title="Playlist vazia"
              hint="Use o menu ⋯ de qualquer música na biblioteca para adicioná-la aqui."
            />
          ) : (
            <>
              <FilterChips chips={SORT_CHIPS} active={sort} onChange={setSort} />
              {sort === 'custom' && (
                <p className="mb-3 -mt-2 text-[11px] text-muted">
                  Arraste as músicas para montar sua ordem ideal.
                </p>
              )}
              <div key={sort} className="fade-in">
                <SongList
                  songs={sortPlaylistSongs(songs, sort)}
                  onChanged={() => open(selected)}
                  extraAction={{
                    label: 'Remover da playlist',
                    run: async (song) => {
                      await api.playlists.removeSong(selected.id, song.id)
                      open(selected)
                    }
                  }}
                  onReorder={
                    sort === 'custom'
                      ? async (ids) => {
                          await api.playlists.reorder(selected.id, ids)
                          open(selected)
                        }
                      : undefined
                  }
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          <PageHeader
            title="Playlists"
            subtitle={`${playlists.length} playlists`}
            actions={
              <button
                onClick={() => setDialog({ kind: 'create' })}
                className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:scale-[1.03]"
              >
                <Plus size={14} /> Nova playlist
              </button>
            }
          />
          {playlists.length === 0 ? (
            <EmptyState
              title="Nenhuma playlist"
              hint="Crie sua primeira playlist para organizar sua biblioteca."
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
              {playlists.map((p) => (
                <div
                  key={p.id}
                  className="glass lift group relative overflow-hidden rounded-2xl"
                  style={
                    p.color
                      ? { background: `linear-gradient(160deg, ${p.color}22, transparent 60%)` }
                      : undefined
                  }
                >
                  <button onClick={() => open(p)} className="flex w-full flex-col text-left">
                    {/* cover area */}
                    <div
                      className="relative grid aspect-[16/9] w-full place-items-center overflow-hidden"
                      style={{
                        background: p.color
                          ? `linear-gradient(135deg, ${p.color}, ${p.color}55)`
                          : 'linear-gradient(135deg, var(--accent-soft), transparent)'
                      }}
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : p.emoji ? (
                        <span className="text-5xl drop-shadow">{p.emoji}</span>
                      ) : (
                        <ListMusic size={30} className="text-white/70" />
                      )}
                    </div>
                    <div className="p-4">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        {p.emoji && !p.image && <span>{p.emoji}</span>}
                        {p.name}
                      </p>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.description}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted">{p.songCount} músicas</p>
                      )}
                    </div>
                  </button>
                  <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconBtn onClick={() => setEditing(p)} label="Personalizar">
                      <ImageIcon size={13} />
                    </IconBtn>
                    <IconBtn onClick={() => setDialog({ kind: 'rename', playlist: p })} label="Renomear">
                      <Pencil size={13} />
                    </IconBtn>
                    <IconBtn onClick={() => duplicate(p)} label="Duplicar">
                      <Copy size={13} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => setDialog({ kind: 'delete', playlist: p })}
                      label="Excluir"
                      danger
                    >
                      <Trash2 size={13} />
                    </IconBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <InputDialog
        open={dialog?.kind === 'create'}
        title="Nova playlist"
        label="Dê um nome para a sua playlist."
        confirmLabel="Criar"
        onConfirm={doCreate}
        onCancel={() => setDialog(null)}
      />
      <InputDialog
        open={dialog?.kind === 'rename'}
        title="Renomear playlist"
        initialValue={dialog?.kind === 'rename' ? dialog.playlist.name : ''}
        confirmLabel="Salvar"
        onConfirm={(name) => dialog?.kind === 'rename' && doRename(dialog.playlist, name)}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="Excluir playlist"
        message={dialog?.kind === 'delete' ? `Excluir "${dialog.playlist.name}"?` : ''}
        confirmLabel="Excluir"
        danger
        onConfirm={() => dialog?.kind === 'delete' && doDelete(dialog.playlist)}
        onCancel={() => setDialog(null)}
      />
      {editing && (
        <PlaylistEditor
          playlist={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            load()
            if (selected?.id === editing.id) {
              // refresh the open detail header too
              api.playlists.getAll().then((all) => {
                const updated = (all as Playlist[]).find((x) => x.id === editing.id)
                if (updated) setSelected(updated)
              })
            }
          }}
        />
      )}
    </>
  )
}

function IconBtn({
  children,
  onClick,
  label,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 place-items-center rounded-lg bg-[var(--bg-raised)] text-muted transition-colors ${
        danger ? 'hover:text-red-400' : 'hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
