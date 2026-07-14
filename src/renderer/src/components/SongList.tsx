import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Play, Heart, MoreHorizontal, Check } from 'lucide-react'
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
  const [menuUp, setMenuUp] = useState(false)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ song: Song; fromDisk: boolean } | null>(null)

  // Multi-select (Spotify-style): a set of selected song ids. When non-empty,
  // an action bar appears and rows show checkboxes. Shift-click selects ranges.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastClicked, setLastClicked] = useState<number | null>(null)
  const [pendingBulkDelete, setPendingBulkDelete] = useState<{ fromDisk: boolean } | null>(null)
  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(false)

  const selectMode = selected.size > 0
  const allSelected = songs.length > 0 && selected.size === songs.length

  const toggleSelect = (id: number, index: number, shift: boolean): void => {
    if (shift && lastClicked !== null) {
      // Select the range from the anchor (first clicked) to this row. The
      // anchor stays put so you can grow/shrink the range with more shift-clicks.
      const lastIdx = songs.findIndex((s) => s.id === lastClicked)
      if (lastIdx !== -1) {
        const [a, b] = lastIdx < index ? [lastIdx, index] : [index, lastIdx]
        const range = new Set<number>()
        for (let i = a; i <= b; i++) range.add(songs[i].id)
        setSelected(range)
        return
      }
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setLastClicked(id)
  }

  const selectAll = (): void => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(songs.map((s) => s.id)))
  }

  const clearSelection = (): void => {
    setSelected(new Set())
    setLastClicked(null)
  }

  const selectedSongs = (): Song[] => songs.filter((s) => selected.has(s.id))

  // Keyboard shortcuts: Ctrl/Cmd+A selects all, Esc clears the selection.
  // Ignored while typing in an input so it doesn't hijack normal text editing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable
      if (typing) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelected(new Set(songs.map((s) => s.id)))
      } else if (e.key === 'Escape' && selected.size > 0) {
        setSelected(new Set())
        setLastClicked(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [songs, selected])

  const addSelectedToPlaylist = async (playlistId: number): Promise<void> => {
    for (const s of selectedSongs()) await api.playlists.addSong(playlistId, s.id)
    setAddToPlaylistOpen(false)
    clearSelection()
    onChanged?.()
  }

  const runBulkDelete = async (fromDisk: boolean): Promise<void> => {
    for (const s of selectedSongs()) {
      await api.library.deleteSong(s.id, fromDisk)
      usePlayerStore.getState().removeSongById(s.id)
    }
    setPendingBulkDelete(null)
    clearSelection()
    onChanged?.()
  }

  const handleDrop = (target: number): void => {
    if (!onReorder || dragIndex === null || dragIndex === target) return setDragIndex(null)
    const reordered = [...songs]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(target, 0, moved)
    onReorder(reordered.map((s) => s.id))
    setDragIndex(null)
  }

  const openMenu = async (id: number, e: React.MouseEvent): Promise<void> => {
    if (menuFor === id) return setMenuFor(null)
    // Open upward when the button is in the lower part of the viewport, so the
    // menu never spills off the bottom (and no scrolling is needed to see it).
    const btn = e.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setMenuUp(spaceBelow < 320) // menu is ~300px tall at most
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
      {/* Selection action bar — appears once something is selected */}
      {selectMode && (
        <div className="glass fade-rise sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-3 rounded-xl px-3 py-2">
          <button
            onClick={selectAll}
            className="rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--accent-soft)]"
          >
            {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
          </button>
          <span className="text-xs text-muted">{selected.size} selecionada(s)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => playQueue(selectedSongs(), 0)}
              className="rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--accent-soft)]"
            >
              Tocar
            </button>
            <button
              onClick={async () => {
                setPlaylists((await api.playlists.getAll()) as Playlist[])
                setAddToPlaylistOpen(true)
              }}
              className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Adicionar à playlist
            </button>
            <button
              onClick={() => {
                selectedSongs().forEach((s) => api.online.fetchCover(s.id, false))
                selectedSongs().forEach((s) => api.lyrics.resolve(s.id, false))
              }}
              className="rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--accent-soft)]"
            >
              Sincronizar
            </button>
            <button
              onClick={() => setPendingBulkDelete({ fromDisk: false })}
              className="rounded-full bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
            >
              Excluir
            </button>
            <button
              onClick={clearSelection}
              className="rounded-full px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {songs.map((song, i) => {
        const active = song.id === currentId
        const isSelected = selected.has(song.id)
        return (
          <motion.div
            key={song.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.015, 0.3) }}
            className={`group relative grid grid-cols-[40px_1fr_1fr_60px_80px] items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-raised)] ${
              isSelected ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]' : active ? 'bg-[var(--accent-soft)]' : ''
            }`}
            onDoubleClick={() => playQueue(songs, i)}
            onClick={(e) => {
              // Spotify-style selection:
              //  - Ctrl/Cmd click: toggle this row
              //  - Shift click: select range from the anchor
              //  - plain click while already selecting: move selection to this row
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                toggleSelect(song.id, i, false)
              } else if (e.shiftKey) {
                e.preventDefault()
                toggleSelect(song.id, i, true)
              } else if (selectMode) {
                e.preventDefault()
                setSelected(new Set([song.id]))
                setLastClicked(song.id)
              }
            }}
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
              {/* In selection mode, the slot is a checkbox. Otherwise it shows
                  the "⋯" menu, but a checkbox fades in on hover so you can start
                  a selection with a single click — just like Spotify. */}
              {selectMode || isSelected ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelect(song.id, i, e.shiftKey)
                  }}
                  className={`grid h-5 w-5 place-items-center rounded-md border transition-colors ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)]'
                      : 'border-white/40 hover:border-[var(--accent)]'
                  }`}
                  aria-label="Selecionar música"
                >
                  {isSelected && <Check size={13} className="text-white" />}
                </button>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelect(song.id, i, e.shiftKey)
                    }}
                    className="hidden h-5 w-5 place-items-center rounded-md border border-white/40 hover:border-[var(--accent)] group-hover:grid"
                    aria-label="Selecionar música"
                  />
                  <button
                    onClick={(e) => openMenu(song.id, e)}
                    className="opacity-0 group-hover:opacity-100"
                    aria-label="Mais opções"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </>
              )}
            </div>

            {menuFor === song.id && (
              <div
                className={`glass absolute right-2 z-30 flex w-56 flex-col rounded-xl p-1 text-xs ${
                  menuUp ? 'bottom-11' : 'top-11'
                }`}
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
    <ConfirmDialog
      open={pendingBulkDelete !== null}
      title="Excluir músicas selecionadas"
      message={`Remover ${selected.size} música(s) da biblioteca? (os arquivos permanecem no disco)`}
      confirmLabel="Remover"
      danger
      onConfirm={() => runBulkDelete(false)}
      onCancel={() => setPendingBulkDelete(null)}
    />
    {addToPlaylistOpen &&
      createPortal(
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm"
          onMouseDown={() => setAddToPlaylistOpen(false)}
        >
          <div
            className="glass max-h-[70vh] w-[min(92vw,360px)] overflow-y-auto rounded-2xl p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-sm font-semibold">Adicionar {selected.size} música(s)</h2>
            <p className="mb-3 text-xs text-muted">Escolha uma playlist:</p>
            {playlists.length === 0 ? (
              <p className="text-xs text-muted">Nenhuma playlist ainda. Crie uma primeiro.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => addSelectedToPlaylist(pl.id)}
                    className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--bg-raised)]"
                  >
                    {pl.emoji ? `${pl.emoji} ` : ''}
                    {pl.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
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
