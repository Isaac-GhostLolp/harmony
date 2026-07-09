import { useEffect, useState } from 'react'
import { ListMusic, Plus, Copy, Trash2, Pencil } from 'lucide-react'
import type { Playlist, Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'
import { InputDialog, ConfirmDialog } from '@/components/InputDialog'

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; playlist: Playlist }
  | { kind: 'delete'; playlist: Playlist }
  | null

export function Playlists(): JSX.Element {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selected, setSelected] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = async (): Promise<void> =>
    setPlaylists((await api.playlists.getAll()) as Playlist[])

  useEffect(() => {
    load()
  }, [])

  const open = async (p: Playlist): Promise<void> => {
    setSelected(p)
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
          <PageHeader title={selected.name} subtitle={`${songs.length} músicas`} />
          {songs.length === 0 ? (
            <EmptyState
              title="Playlist vazia"
              hint="Use o menu ⋯ de qualquer música na biblioteca para adicioná-la aqui."
            />
          ) : (
            <SongList
              songs={songs}
              onChanged={() => open(selected)}
              extraAction={{
                label: 'Remover da playlist',
                run: async (song) => {
                  await api.playlists.removeSong(selected.id, song.id)
                  open(selected)
                }
              }}
              onReorder={async (ids) => {
                await api.playlists.reorder(selected.id, ids)
                open(selected)
              }}
            />
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {playlists.map((p) => (
                <div key={p.id} className="glass group rounded-2xl p-4">
                  <button onClick={() => open(p)} className="flex w-full items-center gap-3 text-left">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)]">
                      <ListMusic size={17} className="text-[var(--accent)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted">{p.songCount} músicas</p>
                    </div>
                  </button>
                  <div className="mt-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
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
