import { useState } from 'react'
import { Play, Heart, MoreHorizontal } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Song, Playlist } from '@/types'
import { usePlayerStore } from '@/store/playerStore'
import { formatDuration } from '@/utils/format'
import { CoverArt } from '@/components/CoverArt'
import { api } from '@/services/api'
import { ConfirmDialog } from '@/components/InputDialog'

interface Props {
  songs: Song[]
  onChanged?: () => void
  /** Extra menu entry, e.g. "Remover da playlist" */
  extraAction?: { label: string; run: (song: Song) => void }
  /** When provided, rows become drag-and-drop sortable (used by playlists). */
  onReorder?: (songIds: number[]) => void
}

export function SongList({ songs, onChanged, extraAction, onReorder }: Props): JSX.Element {
  const playQueue = usePlayerStore((s) => s.playQueue)
  const addNext = usePlayerStore((s) => s.addNext)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const setFavoriteFlag = usePlayerStore((s) => s.setFavoriteFlag)
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id)

  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ song: Song; fromDisk: boolean } | null>(null)

  const handleDrop = (target: number): void => {
    if (!onReorder || dragIndex === null || dragIndex === target) return setDragIndex(null)
    const reordered = [...songs]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(target, 0, moved)
    onReorder(reordered.map((s) => s.id))
    setDragIndex(null)
  }

  const openMenu = async (id: number): Promise<void> => {
    if (menuFor === id) return setMenuFor(null)
    setPlaylists((await api.playlists.getAll()) as Playlist[])
    setMenuFor(id)
  }

  const researchOnline = async (song: Song): Promise<void> => {
    const [cover] = await Promise.all([
      api.online.fetchCover(song.id, true),
      api.lyrics.resolve(song.id, true)
    ])
    if (typeof cover === 'string') usePlayerStore.getState().updateSongCover(song.id, cover)
    onChanged?.()
  }

  const setCoverSource = async (song: Song, pref: 'embedded' | 'online'): Promise<void> => {
    if (!song.albumId) return
    const cover = await api.albums.setPreferredCover(song.albumId, pref)
    if (typeof cover === 'string') usePlayerStore.getState().updateSongCover(song.id, cover)
    onChanged?.()
  }

  const deleteSong = (song: Song, fromDisk: boolean): void => {
    setPendingDelete({ song, fromDisk })
  }

  const performDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    const { song, fromDisk } = pendingDelete
    setPendingDelete(null)
    const ok = await api.library.deleteSong(song.id, fromDisk)
    if (ok) {
      usePlayerStore.getState().removeSongById(song.id)
      onChanged?.()
    }
  }

  const toggleFav = async (song: Song): Promise<void> => {
    const fav = (await api.favorites.toggle(song.id)) as boolean
    setFavoriteFlag(song.id, fav)
    onChanged?.()
  }

  return (
    <>
    <div className="flex flex-col">
      {songs.map((song, i) => {
        const active = song.id === currentId
        return (
          <motion.div
            key={song.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.015, 0.3) }}
            className={`group relative grid grid-cols-[40px_1fr_1fr_60px_80px] items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-raised)] ${
              active ? 'bg-[var(--accent-soft)]' : ''
            }`}
            onDoubleClick={() => playQueue(songs, i)}
            draggable={Boolean(onReorder)}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => onReorder && e.preventDefault()}
            onDrop={() => handleDrop(i)}
          >
            <button
              onClick={() => playQueue(songs, i)}
              className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-md"
              aria-label={`Tocar ${song.title}`}
            >
              <CoverArt src={song.coverPath} title={song.title} size="sm" rounded="lg" />
              <Play
                size={14}
                className="absolute hidden group-hover:block"
                fill="white"
                stroke="white"
              />
            </button>

            <div className="min-w-0">
              <p className={`truncate font-medium ${active ? 'text-[var(--accent)]' : ''}`}>
                {song.title}
              </p>
              <p className="truncate text-xs text-muted">{song.artist ?? '—'}</p>
            </div>

            <p className="truncate text-xs text-muted">{song.album ?? '—'}</p>

            <button
              onClick={() => toggleFav(song)}
              className="justify-self-center text-muted opacity-0 transition-opacity hover:text-[var(--accent)] group-hover:opacity-100"
              style={{ opacity: song.favorite ? 1 : undefined }}
              aria-label="Favoritar"
            >
              <Heart
                size={15}
                fill={song.favorite ? 'var(--accent)' : 'none'}
                stroke={song.favorite ? 'var(--accent)' : 'currentColor'}
              />
            </button>

            <div className="flex items-center justify-end gap-2 text-xs text-muted">
              <span className="tabular-nums">{formatDuration(song.duration)}</span>
              <button
                onClick={() => openMenu(song.id)}
                className="opacity-0 group-hover:opacity-100"
                aria-label="Mais opções"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            {menuFor === song.id && (
              <div
                className="glass absolute right-2 top-11 z-30 flex w-56 flex-col rounded-xl p-1 text-xs"
                onMouseLeave={() => setMenuFor(null)}
              >
                <MenuItem label="Tocar em seguida" onClick={() => { addNext(song); setMenuFor(null) }} />
                <MenuItem label="Adicionar à fila" onClick={() => { addToQueue(song); setMenuFor(null) }} />
                {extraAction && (
                  <MenuItem
                    label={extraAction.label}
                    onClick={() => { extraAction.run(song); setMenuFor(null) }}
                  />
                )}
                <div className="my-1 h-px bg-[var(--glass-border)]" />
                <MenuItem
                  label="Sincronizar capa e letra online"
                  onClick={() => { researchOnline(song); setMenuFor(null) }}
                />
                {song.albumId && (
                  <>
                    <MenuItem
                      label="Capa: usar original (metadados)"
                      onClick={() => { setCoverSource(song, 'embedded'); setMenuFor(null) }}
                    />
                    <MenuItem
                      label="Capa: usar da internet"
                      onClick={() => { setCoverSource(song, 'online'); setMenuFor(null) }}
                    />
                  </>
                )}
                <div className="my-1 h-px bg-[var(--glass-border)]" />
                <MenuItem
                  label="Remover da biblioteca"
                  onClick={() => { deleteSong(song, false); setMenuFor(null) }}
                />
                <MenuItem
                  label="Excluir do dispositivo (lixeira)"
                  onClick={() => { deleteSong(song, true); setMenuFor(null) }}
                />
                {playlists.length > 0 && (
                  <>
                    <div className="my-1 h-px bg-[var(--glass-border)]" />
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted">
                      Adicionar à playlist
                    </p>
                    {playlists.map((p) => (
                      <MenuItem
                        key={p.id}
                        label={p.name}
                        onClick={async () => {
                          await api.playlists.addSong(p.id, song.id)
                          setMenuFor(null)
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
    <ConfirmDialog
      open={pendingDelete !== null}
      title={pendingDelete?.fromDisk ? 'Enviar para a lixeira' : 'Remover da biblioteca'}
      message={
        pendingDelete
          ? pendingDelete.fromDisk
            ? `Enviar "${pendingDelete.song.title}" para a lixeira e remover da biblioteca?`
            : `Remover "${pendingDelete.song.title}" da biblioteca? (o arquivo permanece no disco)`
          : ''
      }
      confirmLabel={pendingDelete?.fromDisk ? 'Enviar à lixeira' : 'Remover'}
      danger
      onConfirm={performDelete}
      onCancel={() => setPendingDelete(null)}
    />
    </>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--bg-raised)]"
    >
      {label}
    </button>
  )
}
