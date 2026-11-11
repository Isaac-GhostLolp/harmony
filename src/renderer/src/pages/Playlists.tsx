import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListMusic, Plus, Copy, Trash2, Pencil, MoreHorizontal, ArrowLeft, Image as ImageIcon } from 'lucide-react'
import type { Playlist, Song } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'
import { InputDialog, ConfirmDialog } from '@/components/InputDialog'
import { PlaylistEditor } from '@/components/PlaylistEditor'
import { FilterChips } from '@/components/FilterChips'
import { StickerZone } from '@/components/stickers/StickerZone'
import { useFavoriteSync } from '@/utils/favorites'
import { useStickerStore } from '@/store/stickerStore'
import { t, tk, tn } from '@/i18n'
import { IS_ANDROID } from '@/platform'
import { useBackCloses } from '@/components/mobile/back'

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; playlist: Playlist }
  | { kind: 'delete'; playlist: Playlist }
  | null

type PlaylistSort = 'custom' | 'recent' | 'oldest' | 'duration' | 'title'

const SORT_CHIPS: { id: PlaylistSort; label: string }[] = [
  { id: 'custom', label: tk('Ordem personalizada') },
  { id: 'recent', label: tk('Adicionadas por último') },
  { id: 'oldest', label: tk('Mais antigas') },
  { id: 'duration', label: tk('Duração') },
  { id: 'title', label: tk('Título') }
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
  useFavoriteSync(setSongs)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editing, setEditing] = useState<Playlist | null>(null)
  const [sort, setSort] = useState<PlaylistSort>('custom')
  const [size, setSize] = useState<CardSize>(loadCardSize)
  const [actionsFor, setActionsFor] = useState<Playlist | null>(null)
  const closeActions = useCallback(() => setActionsFor(null), [])
  useBackCloses(actionsFor !== null, closeActions)
  // inside a playlist, the phone's back button returns to the list
  const leavePlaylist = useCallback(() => setSelected(null), [])
  useBackCloses(selected !== null, leavePlaylist)
  const chooseSize = (next: CardSize): void => {
    setSize(next)
    try {
      localStorage.setItem(CARD_SIZE_KEY, next)
    } catch {
      /* still applies now */
    }
  }

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
    useStickerStore.getState().clearZone(`playlist:${p.id}`)
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
            className={
              IS_ANDROID
                ? 'mb-3 -ml-1 flex items-center gap-1.5 rounded-full py-2 pl-1 pr-3 text-sm font-semibold active:bg-[var(--bg-raised)]'
                : 'mb-4 text-xs text-muted hover:text-ink'
            }
          >
            {IS_ANDROID ? (
              <>
                <ArrowLeft size={22} /> {t('Playlists')}
              </>
            ) : (
              t('← Playlists')
            )}
          </button>
          <div
            className={`fade-rise mb-6 flex gap-5 rounded-2xl ${IS_ANDROID ? 'flex-col items-center p-5 text-center' : 'items-end p-6'}`}
            style={{
              background: selected.color
                ? `linear-gradient(135deg, ${selected.color}, transparent 70%)`
                : 'linear-gradient(135deg, var(--accent-soft), transparent 70%)'
            }}
          >
            <div
              data-stk-host
              className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-black/20 shadow-lg ${
                IS_ANDROID ? HERO[size] : 'h-32 w-32'
              }`}
            >
              {selected.image ? (
                <img src={selected.image} alt="" className="h-full w-full object-cover" />
              ) : selected.emoji ? (
                <span className="text-6xl">{selected.emoji}</span>
              ) : (
                <ListMusic size={40} className="text-white/70" />
              )}
              <StickerZone zone={`playlist:${selected.id}`} label={t('Capa')} rel />
            </div>
            <div className={`min-w-0 ${IS_ANDROID ? 'w-full' : 'flex-1'}`}>
              <p className="text-[11px] uppercase tracking-wide text-white/60">{t('Playlist')}</p>
              <h1
                className={`mt-1 font-semibold tracking-tight ${
                  IS_ANDROID ? 'line-clamp-2 break-words text-2xl leading-tight' : 'truncate text-3xl'
                }`}
              >
                {selected.name}
              </h1>
              {selected.description && (
                <p className="mt-1 line-clamp-2 text-sm text-white/70">{selected.description}</p>
              )}
              <p className="mt-2 text-xs text-white/60">{tn(songs.length, '{n} música', '{n} músicas')}</p>
            </div>
            <button
              onClick={() => setEditing(selected)}
              className={`press flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/50 ${
                IS_ANDROID ? 'py-2.5' : 'self-start'
              }`}
            >
              <ImageIcon size={13} /> {t('Personalizar')}
            </button>
          </div>
          {songs.length === 0 ? (
            <EmptyState
              title={t('Playlist vazia')}
              hint={t('Use o menu ⋯ de qualquer música na biblioteca para adicioná-la aqui.')}
            />
          ) : (
            <>
              <FilterChips chips={SORT_CHIPS.map((c) => ({ ...c, label: t(c.label) }))} active={sort} onChange={setSort} />
              {sort === 'custom' && !IS_ANDROID && (
                <p className="mb-3 -mt-2 text-[11px] text-muted">
                  {t('Arraste as músicas para montar sua ordem ideal.')}
                </p>
              )}
              <div key={sort} className="fade-in">
                <SongList
                  songs={sortPlaylistSongs(songs, sort)}
                  onChanged={() => open(selected)}
                  extraAction={{
                    label: t('Remover da playlist'),
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
            title={t('Playlists')}
            subtitle={`${playlists.length} playlists`}
            actions={
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-[var(--bg-raised)] p-1" role="group" aria-label={t('Tamanho das capas')}>
                  {CARD_SIZES.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => chooseSize(c.id)}
                      title={t(c.label)}
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        size === c.id ? 'bg-[var(--accent)] font-semibold text-[var(--on-accent,#fff)]' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {t(c.short)}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setDialog({ kind: 'create' })}
                  className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:scale-[1.03]"
                >
                  <Plus size={14} /> {t('Nova playlist')}
                </button>
              </div>
            }
          />
          {playlists.length === 0 ? (
            <EmptyState
              title={t('Nenhuma playlist')}
              hint={t('Crie sua primeira playlist para organizar sua biblioteca.')}
            />
          ) : (
            <div className={`pl-grid pl-${size} grid gap-3 ${GRID[size]}`}>
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
                  <button onClick={() => open(p)} className={`flex w-full text-left ${size === 'small' ? 'flex-row items-center' : 'flex-col'}`}>
                    {/* cover area */}
                    <div
                      data-stk-host
                      className={`relative grid shrink-0 place-items-center overflow-hidden ${
                        size === 'small' ? 'm-2 h-14 w-14 rounded-xl' : 'aspect-[16/9] w-full'
                      }`}
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
                        <span className={`${size === 'small' ? 'text-2xl' : size === 'medium' ? 'text-4xl' : 'text-5xl'} drop-shadow`}>{p.emoji}</span>
                      ) : (
                        <ListMusic size={size === 'small' ? 20 : 30} className="text-white/70" />
                      )}
                      <StickerZone zone={`playlist:${p.id}`} label={t('Capa')} rel />
                    </div>
                    <div className={`min-w-0 ${size === 'small' ? `flex-1 py-2 ${IS_ANDROID ? 'pr-14' : 'pr-36'}` : size === 'medium' ? 'p-3' : 'p-4'}`}>
                      <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
                        {p.emoji && !p.image && <span>{p.emoji}</span>}
                        {p.name}
                      </p>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.description}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted">{tn(p.songCount, '{n} música', '{n} músicas')}</p>
                      )}
                    </div>
                  </button>
                  {IS_ANDROID ? (
                    // the phone: one big button, the actions spelled out in a sheet
                    <div className={`absolute z-40 ${size === 'small' ? 'right-2 top-1/2 -translate-y-1/2' : 'right-2 top-2'}`}>
                      <IconBtn onClick={() => setActionsFor(p)} label={t('Opções da playlist')}>
                        <MoreHorizontal size={16} />
                      </IconBtn>
                    </div>
                  ) : (
                    <div
                      className={`pl-actions z-40 flex gap-1.5 transition-opacity ${
                        size === 'small' ? 'absolute right-2 top-1/2 -translate-y-1/2' : 'absolute right-2 top-2'
                      } ${IS_ANDROID ? '' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      <IconBtn onClick={() => setEditing(p)} label={t('Personalizar')}>
                        <ImageIcon size={13} />
                      </IconBtn>
                      <IconBtn onClick={() => setDialog({ kind: 'rename', playlist: p })} label={t('Renomear')}>
                        <Pencil size={13} />
                      </IconBtn>
                      <IconBtn onClick={() => duplicate(p)} label={t('Duplicar')}>
                        <Copy size={13} />
                      </IconBtn>
                      <IconBtn
                        onClick={() => setDialog({ kind: 'delete', playlist: p })}
                        label={t('Excluir')}
                        danger
                      >
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* at the top of the page tree: inside <main> the tab bar covered its last option (Excluir) */}
      {actionsFor &&
        createPortal(
            <div className="fixed inset-0 z-[120] flex items-end bg-black/50" onClick={closeActions}>
              <div
                className="fade-rise w-full rounded-t-3xl bg-[var(--bg-base)] px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--bg-raised)]" />
                <p className="mb-2 truncate px-2 text-sm font-semibold">{actionsFor.name}</p>
                {(
                  [
                    { icon: <ImageIcon size={18} />, label: t('Personalizar'), run: () => setEditing(actionsFor) },
                    { icon: <Pencil size={18} />, label: t('Renomear'), run: () => setDialog({ kind: 'rename', playlist: actionsFor }) },
                    { icon: <Copy size={18} />, label: t('Duplicar'), run: () => duplicate(actionsFor) },
                    { icon: <Trash2 size={18} />, label: t('Excluir'), run: () => setDialog({ kind: 'delete', playlist: actionsFor }), danger: true }
                  ] as { icon: JSX.Element; label: string; run: () => void; danger?: boolean }[]
                ).map((a) => (
                  <button
                    key={a.label}
                    onClick={() => {
                      closeActions()
                      a.run()
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm active:bg-[var(--bg-raised)] ${
                      a.danger ? 'text-red-400' : ''
                    }`}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            </div>,
          document.body
        )}

      <InputDialog
        open={dialog?.kind === 'create'}
        title={t('Nova playlist')}
        label={t('Dê um nome para a sua playlist.')}
        confirmLabel={t('Criar')}
        onConfirm={doCreate}
        onCancel={() => setDialog(null)}
      />
      <InputDialog
        open={dialog?.kind === 'rename'}
        title={t('Renomear playlist')}
        initialValue={dialog?.kind === 'rename' ? dialog.playlist.name : ''}
        confirmLabel={t('Salvar')}
        onConfirm={(name) => dialog?.kind === 'rename' && doRename(dialog.playlist, name)}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={t('Excluir playlist')}
        message={dialog?.kind === 'delete' ? t('Excluir “{name}”?', { name: dialog.playlist.name }) : ''}
        confirmLabel={t('Excluir')}
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

type CardSize = 'large' | 'medium' | 'small'
const CARD_SIZE_KEY = 'harmony.playlistCards'
const CARD_SIZES: { id: CardSize; short: string; label: string }[] = [
  { id: 'large', short: tk('G'), label: tk('Capas grandes') },
  { id: 'medium', short: tk('M'), label: tk('Capas médias') },
  { id: 'small', short: tk('P'), label: tk('Capas pequenas (lista)') }
]
/** the cover inside a playlist on the phone, by the same size choice */
const HERO: Record<CardSize, string> = { large: 'h-48 w-48', medium: 'h-36 w-36', small: 'h-24 w-24' }
const GRID: Record<CardSize, string> = {
  large: 'grid-cols-[repeat(auto-fill,minmax(240px,1fr))]',
  medium: 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]',
  small: 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]'
}
/** the phone starts with medium covers; the desktop keeps the big ones */
function loadCardSize(): CardSize {
  try {
    const v = localStorage.getItem(CARD_SIZE_KEY)
    if (v === 'large' || v === 'medium' || v === 'small') return v
  } catch {
    /* default below */
  }
  return IS_ANDROID ? 'medium' : 'large'
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
      className={`pl-btn grid h-7 w-7 place-items-center rounded-lg bg-[var(--bg-raised)] text-muted backdrop-blur transition-colors ${
        danger ? 'hover:text-red-400' : 'hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
