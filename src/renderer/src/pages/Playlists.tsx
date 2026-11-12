import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Copy, Trash2, Pencil, MoreHorizontal, Image as ImageIcon, Pin, PinOff, Sparkles, Upload, ChevronDown } from 'lucide-react'
import type { Playlist } from '@/types'
import type { AutoKind } from '../../../core/playlistsPlus'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { InputDialog, ConfirmDialog } from '@/components/InputDialog'
import { PlaylistEditor } from '@/components/PlaylistEditor'
import { StickerZone } from '@/components/stickers/StickerZone'
import { PlaylistCover } from '@/components/playlists/PlaylistCover'
import { PlaylistDetail } from '@/components/playlists/PlaylistDetail'
import { AutoDetail, AutoRow } from '@/components/playlists/AutoPlaylists'
import { SmartEditor } from '@/components/playlists/SmartEditor'
import { readPlaylistFile } from '@/utils/playlistFiles'
import { PLAYLISTS_CHANGED_EVENT } from '@/store/coverCreatorStore'
import { useStickerStore } from '@/store/stickerStore'
import { t, tk, tn } from '@/i18n'
import { IS_ANDROID } from '@/platform'
import { useBackCloses } from '@/components/mobile/back'

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; playlist: Playlist }
  | { kind: 'delete'; playlist: Playlist }
  | null

const FOLDERS_KEY = 'harmony.playlistFoldersClosed'

function loadClosed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function Playlists(): JSX.Element {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [mosaics, setMosaics] = useState<Record<number, string[]>>({})
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [auto, setAuto] = useState<AutoKind | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editing, setEditing] = useState<Playlist | null>(null)
  const [smartNew, setSmartNew] = useState(false)
  const [size, setSize] = useState<CardSize>(loadCardSize)
  const [actionsFor, setActionsFor] = useState<Playlist | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [closed, setClosed] = useState<Set<string>>(loadClosed)
  const [notice, setNotice] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const closeActions = useCallback(() => setActionsFor(null), [])
  useBackCloses(actionsFor !== null, closeActions)
  // inside a playlist, the phone's back button returns to the list
  const leave = useCallback(() => {
    setSelectedId(null)
    setAuto(null)
  }, [])
  useBackCloses(selectedId !== null || auto !== null, leave)

  const chooseSize = (next: CardSize): void => {
    setSize(next)
    try {
      localStorage.setItem(CARD_SIZE_KEY, next)
    } catch {
      /* still applies now */
    }
  }

  const load = useCallback(async (): Promise<void> => {
    const [all, m] = await Promise.all([api.playlists.getAll(), api.playlists.mosaics()])
    setPlaylists(all as Playlist[])
    setMosaics(m as Record<number, string[]>)
  }, [])

  useEffect(() => {
    void load()
    const again = (): void => void load()
    window.addEventListener(PLAYLISTS_CHANGED_EVENT, again)
    return () => window.removeEventListener(PLAYLISTS_CHANGED_EVENT, again)
  }, [load])

  const say = (text: string): void => {
    setNotice(text)
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 4500)
  }

  // Electron disables window.prompt/confirm in packaged builds, so all of these
  // go through in-app dialogs (that was the "click does nothing" bug).
  const doCreate = async (name: string): Promise<void> => {
    setDialog(null)
    await api.playlists.create(name)
    void load()
  }
  const doRename = async (p: Playlist, name: string): Promise<void> => {
    setDialog(null)
    await api.playlists.rename(p.id, name)
    void load()
  }
  const doDelete = async (p: Playlist): Promise<void> => {
    setDialog(null)
    await api.playlists.remove(p.id)
    useStickerStore.getState().clearZone(`playlist:${p.id}`)
    if (selectedId === p.id) setSelectedId(null)
    void load()
  }
  const duplicate = async (p: Playlist): Promise<void> => {
    await api.playlists.duplicate(p.id)
    void load()
  }
  const togglePin = async (p: Playlist): Promise<void> => {
    await api.playlists.updateMeta(p.id, { pinned: !p.pinned })
    void load()
  }

  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    const data = await readPlaylistFile(file).catch(() => null)
    if (importRef.current) importRef.current.value = ''
    if (!data) {
      say(t('Esse arquivo não é uma playlist que o Harmony entende (.m3u ou do Harmony).'))
      return
    }
    const r = (await api.playlists.importOne(data)) as { id: number; matched: number; missing: number }
    await load()
    say(
      r.missing
        ? t('“{name}” importada: {a} músicas encontradas, {b} não estão na sua biblioteca.', { name: data.name, a: r.matched, b: r.missing })
        : t('“{name}” importada com {a} músicas.', { name: data.name, a: r.matched })
    )
  }

  const folders = useMemo(
    () => [...new Set(playlists.map((p) => p.folder).filter((f): f is string => Boolean(f)))].sort((a, b) => a.localeCompare(b)),
    [playlists]
  )
  const tags = useMemo(() => [...new Set(playlists.map((p) => p.tag).filter((x): x is string => Boolean(x)))], [playlists])
  const shown = tagFilter ? playlists.filter((p) => p.tag === tagFilter) : playlists
  const pinned = shown.filter((p) => p.pinned)
  const groups = folders
    .map((f) => ({ folder: f, list: shown.filter((p) => !p.pinned && p.folder === f) }))
    .filter((g) => g.list.length > 0)
  const loose = shown.filter((p) => !p.pinned && !p.folder)

  const toggleFolder = (f: string): void =>
    setClosed((c) => {
      const next = new Set(c)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      try {
        localStorage.setItem(FOLDERS_KEY, JSON.stringify([...next]))
      } catch {
        /* only a convenience */
      }
      return next
    })

  const selected = selectedId !== null ? playlists.find((p) => p.id === selectedId) ?? null : null

  const card = (p: Playlist): JSX.Element => (
    <div
      key={p.id}
      className="glass lift group relative overflow-hidden rounded-2xl"
      style={p.color ? { background: `linear-gradient(160deg, ${p.color}22, transparent 60%)` } : undefined}
    >
      <button onClick={() => setSelectedId(p.id)} className={`flex w-full text-left ${size === 'small' ? 'flex-row items-center' : 'flex-col'}`}>
        <div data-stk-host className={`relative shrink-0 overflow-hidden ${size === 'small' ? 'm-2 h-14 w-14' : 'aspect-[16/9] w-full'}`}>
          <PlaylistCover
            playlist={p}
            mosaic={mosaics[p.id]}
            className={`h-full w-full transition-transform duration-500 group-hover:scale-[1.03] ${size === 'small' ? 'rounded-xl' : ''}`}
            iconSize={size === 'small' ? 20 : 30}
            emojiClass={size === 'small' ? 'text-2xl' : size === 'medium' ? 'text-4xl' : 'text-5xl'}
          />
          <StickerZone zone={`playlist:${p.id}`} label={t('Capa')} rel />
        </div>
        <div className={`min-w-0 ${size === 'small' ? `flex-1 py-2 ${IS_ANDROID ? 'pr-14' : 'pr-40'}` : size === 'medium' ? 'p-3' : 'p-4'}`}>
          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
            {p.tag && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.tag }} />}
            {p.rules && <Sparkles size={12} className="shrink-0 text-[var(--accent)]" />}
            {p.emoji && !p.image && <span>{p.emoji}</span>}
            <span className="truncate">{p.name}</span>
            {p.pinned ? <Pin size={11} className="shrink-0 text-muted" /> : null}
          </p>
          {p.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.description}</p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">
              {p.rules ? t('Inteligente · se atualiza sozinha') : tn(p.songCount, '{n} música', '{n} músicas')}
            </p>
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
          className={`pl-actions z-40 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 ${
            size === 'small' ? 'absolute right-2 top-1/2 -translate-y-1/2' : 'absolute right-2 top-2'
          }`}
        >
          <IconBtn onClick={() => setEditing(p)} label={t('Personalizar')}>
            <ImageIcon size={13} />
          </IconBtn>
          <IconBtn onClick={() => void togglePin(p)} label={p.pinned ? t('Desafixar') : t('Fixar no topo')}>
            {p.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </IconBtn>
          <IconBtn onClick={() => setDialog({ kind: 'rename', playlist: p })} label={t('Renomear')}>
            <Pencil size={13} />
          </IconBtn>
          <IconBtn onClick={() => void duplicate(p)} label={t('Duplicar')}>
            <Copy size={13} />
          </IconBtn>
          <IconBtn onClick={() => setDialog({ kind: 'delete', playlist: p })} label={t('Excluir')} danger>
            <Trash2 size={13} />
          </IconBtn>
        </div>
      )}
    </div>
  )

  const grid = (list: Playlist[]): JSX.Element => <div className={`pl-grid pl-${size} grid gap-3 ${GRID[size]}`}>{list.map(card)}</div>

  return (
    <>
      {auto ? (
        <AutoDetail
          kind={auto}
          onBack={() => setAuto(null)}
          onSaved={async (id) => {
            await load()
            setAuto(null)
            setSelectedId(id)
          }}
        />
      ) : selected ? (
        <PlaylistDetail
          key={selected.id}
          playlist={selected}
          mosaic={mosaics[selected.id] ?? []}
          onBack={() => {
            setSelectedId(null)
            void load()
          }}
          onEdit={() => setEditing(selected)}
          onChanged={() => void load()}
        />
      ) : (
        <div>
          <PageHeader
            title={t('Playlists')}
            subtitle={tn(playlists.length, '{n} playlist', '{n} playlists')}
            actions={
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => importRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--bg-raised)] px-3.5 py-2 text-xs font-medium text-muted hover:text-ink"
                  title={t('Importar .m3u ou arquivo do Harmony')}
                >
                  <Upload size={13} /> {t('Importar')}
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".m3u,.m3u8,.json,audio/x-mpegurl,application/json"
                  className="hidden"
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
                <button
                  onClick={() => setSmartNew(true)}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--accent)] hover:scale-[1.03]"
                >
                  <Sparkles size={13} /> {t('Inteligente')}
                </button>
                <button
                  onClick={() => setDialog({ kind: 'create' })}
                  className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:scale-[1.03]"
                >
                  <Plus size={14} /> {t('Nova playlist')}
                </button>
              </div>
            }
          />
          {notice && <p className="fade-rise mb-4 rounded-xl bg-[var(--accent-soft)] px-4 py-2.5 text-xs">{notice}</p>}

          <AutoRow onOpen={setAuto} />

          {tags.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTagFilter(null)}
                className={`rounded-full px-3 py-1.5 text-xs ${tagFilter === null ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-muted'}`}
              >
                {t('Todas')}
              </button>
              {tags.map((c) => (
                <button
                  key={c}
                  onClick={() => setTagFilter(tagFilter === c ? null : c)}
                  className={`h-7 w-7 rounded-full ${tagFilter === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--bg-base)]' : 'opacity-80'}`}
                  style={{ background: c }}
                  aria-label={t('Filtrar pela etiqueta')}
                />
              ))}
            </div>
          )}

          {playlists.length === 0 ? (
            <EmptyState title={t('Nenhuma playlist')} hint={t('Crie sua primeira playlist para organizar sua biblioteca.')} />
          ) : (
            <div className="flex flex-col gap-6">
              {pinned.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                    <Pin size={13} /> {t('Fixadas')}
                  </h2>
                  {grid(pinned)}
                </section>
              )}
              {groups.map((g) => (
                <section key={g.folder}>
                  <button onClick={() => toggleFolder(g.folder)} className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ChevronDown size={15} className={`transition-transform ${closed.has(g.folder) ? '-rotate-90' : ''}`} />
                    📁 {g.folder}
                    <span className="text-xs font-normal text-muted">{g.list.length}</span>
                  </button>
                  {!closed.has(g.folder) && grid(g.list)}
                </section>
              ))}
              {loose.length > 0 && (
                <section>
                  {(pinned.length > 0 || groups.length > 0) && <h2 className="mb-3 text-sm font-semibold">{t('Outras playlists')}</h2>}
                  {grid(loose)}
                </section>
              )}
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
                  {
                    icon: actionsFor.pinned ? <PinOff size={18} /> : <Pin size={18} />,
                    label: actionsFor.pinned ? t('Desafixar') : t('Fixar no topo'),
                    run: () => void togglePin(actionsFor)
                  },
                  { icon: <Pencil size={18} />, label: t('Renomear'), run: () => setDialog({ kind: 'rename', playlist: actionsFor }) },
                  { icon: <Copy size={18} />, label: t('Duplicar'), run: () => void duplicate(actionsFor) },
                  { icon: <Trash2 size={18} />, label: t('Excluir'), run: () => setDialog({ kind: 'delete', playlist: actionsFor }), danger: true }
                ] as { icon: JSX.Element; label: string; run: () => void; danger?: boolean }[]
              ).map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    closeActions()
                    a.run()
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm active:bg-[var(--bg-raised)] ${a.danger ? 'text-red-400' : ''}`}
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
      {editing && <PlaylistEditor playlist={editing} folders={folders} onClose={() => setEditing(null)} onSaved={() => void load()} />}
      {smartNew && (
        <SmartEditor
          playlist={null}
          onClose={() => setSmartNew(false)}
          onSaved={async (id) => {
            await load()
            setSelectedId(id)
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
