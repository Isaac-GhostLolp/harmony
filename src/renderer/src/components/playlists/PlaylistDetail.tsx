import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Image as ImageIcon, Play, Shuffle, ScanLine, Share2, Sparkles } from 'lucide-react'
import type { Playlist, Song } from '@/types'
import { api } from '@/services/api'
import { EmptyState } from '@/components/EmptyState'
import { SongList } from '@/components/SongList'
import { InputDialog } from '@/components/InputDialog'
import { FilterChips } from '@/components/FilterChips'
import { StickerZone } from '@/components/stickers/StickerZone'
import { useFavoriteSync } from '@/utils/favorites'
import { usePlayerStore } from '@/store/playerStore'
import { openPlaylist, playPlaylist } from '@/utils/playlistSession'
import { PlaylistCover } from './PlaylistCover'
import { Suggestions } from './Suggestions'
import { XRay } from './XRay'
import { SharePlaylist } from './SharePlaylist'
import { SmartEditor } from './SmartEditor'
import { IS_ANDROID } from '@/platform'
import { t, tk, tn } from '@/i18n'

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

export function totalTime(songs: Song[]): string {
  const min = Math.round(songs.reduce((n, s) => n + (s.duration || 0), 0) / 60)
  return min >= 60 ? t('{h} h {m} min', { h: Math.floor(min / 60), m: min % 60 }) : t('{m} min', { m: min })
}

/** the song list split where sections start (a section begins at the song that holds its title) */
function sectionsOf(songs: Song[]): { title: string | null; songs: Song[]; offset: number }[] {
  const out: { title: string | null; songs: Song[]; offset: number }[] = []
  songs.forEach((s, i) => {
    if (i === 0 || s.section) out.push({ title: s.section ?? null, songs: [], offset: i })
    out[out.length - 1].songs.push(s)
  })
  return out
}

type Dialog = { kind: 'note' | 'section'; song: Song } | null

/**
 * One playlist's page: its header in the chosen style (banner with the photo
 * blurred behind, compact, or a turning disc), painted in its colour; its
 * songs (with sections and notes), what fits it, and its X-ray and sharing.
 */
export function PlaylistDetail({
  playlist,
  mosaic,
  onBack,
  onEdit,
  onChanged
}: {
  playlist: Playlist
  mosaic: string[]
  onBack: () => void
  onEdit: () => void
  /** the playlist itself changed (its rules) */
  onChanged: () => void
}): JSX.Element {
  const [songs, setSongs] = useState<Song[]>([])
  useFavoriteSync(setSongs)
  const [sort, setSort] = useState<PlaylistSort>('custom')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [xray, setXray] = useState(false)
  const [share, setShare] = useState(false)
  const [rules, setRules] = useState(false)
  const smart = Boolean(playlist.rules)
  const header = playlist.header ?? 'banner'
  const playingHere = usePlayerStore((s) => s.isPlaying && songs.some((x) => x.id === s.queue[s.currentIndex]?.id))

  const load = useCallback(async (): Promise<void> => {
    const list = (await api.playlists.getSongs(playlist.id)) as Song[]
    setSongs(list)
    openPlaylist(playlist, list)
  }, [playlist])

  useEffect(() => {
    setSort('custom')
    void load()
  }, [load])

  useEffect(() => () => openPlaylist(null, []), [])

  const sorted = sortPlaylistSongs(songs, sort)
  const chunks = useMemo(() => (sort === 'custom' && !smart ? sectionsOf(songs) : [{ title: null, songs: sorted, offset: 0 }]), [songs, sorted, sort, smart])

  const tint = playlist.color
    ? ({ '--accent': playlist.color, '--accent-soft': `${playlist.color}33` } as React.CSSProperties)
    : undefined
  const backdrop = playlist.image ?? null

  const actions = (
    <div className={`flex flex-wrap items-center gap-2 ${IS_ANDROID ? 'justify-center' : ''}`}>
      <button
        onClick={() => playPlaylist(playlist, songs)}
        disabled={!songs.length}
        className="press flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--on-accent,#fff)] shadow-lg disabled:opacity-50"
      >
        <Play size={15} fill="currentColor" /> {t('Tocar')}
      </button>
      <button
        onClick={() => playPlaylist(playlist, songs, true)}
        disabled={!songs.length}
        className="press grid h-10 w-10 place-items-center rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50 disabled:opacity-50"
        aria-label={t('Aleatório')}
        title={t('Aleatório')}
      >
        <Shuffle size={16} />
      </button>
      {[
        { icon: <ImageIcon size={14} />, label: t('Personalizar'), run: onEdit },
        ...(smart ? [{ icon: <Sparkles size={14} />, label: t('Regras'), run: () => setRules(true) }] : []),
        { icon: <ScanLine size={14} />, label: t('Raio-X'), run: () => setXray(true) },
        { icon: <Share2 size={14} />, label: t('Compartilhar'), run: () => setShare(true) }
      ].map((a) => (
        <button
          key={a.label}
          onClick={a.run}
          className="press flex items-center gap-1.5 rounded-full bg-black/30 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/50"
        >
          {a.icon} {a.label}
        </button>
      ))}
    </div>
  )

  const titleBlock = (big: boolean): JSX.Element => (
    <div className={`min-w-0 ${IS_ANDROID ? 'w-full' : 'flex-1'}`}>
      <p className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/60 ${IS_ANDROID && big ? 'justify-center' : ''}`}>
        {smart && <Sparkles size={11} />}
        {smart ? t('Playlist inteligente') : t('Playlist')}
        {playlist.folder && <span className="normal-case tracking-normal">· 📁 {playlist.folder}</span>}
      </p>
      <h1
        className={`mt-1 font-bold tracking-tight ${big ? (IS_ANDROID ? 'line-clamp-2 break-words text-3xl leading-tight' : 'truncate text-4xl') : 'truncate text-xl'}`}
      >
        {playlist.name}
      </h1>
      {playlist.description && big && <p className="mt-1 line-clamp-2 text-sm text-white/75">{playlist.description}</p>}
      <p className="mt-1.5 text-xs text-white/60">
        {tn(songs.length, '{n} música', '{n} músicas')} · {totalTime(songs)}
      </p>
    </div>
  )

  return (
    <div style={tint} className="relative">
      {/* the photo, blurred, behind the top of the page */}
      {header === 'banner' && backdrop && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-6 h-80 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${backdrop})`, filter: 'blur(48px) saturate(1.2)', maskImage: 'linear-gradient(black, transparent)' }}
        />
      )}
      <button
        onClick={onBack}
        className={
          IS_ANDROID
            ? 'relative mb-3 -ml-1 flex items-center gap-1.5 rounded-full py-2 pl-1 pr-3 text-sm font-semibold active:bg-[var(--bg-raised)]'
            : 'relative mb-4 text-xs text-muted hover:text-ink'
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

      {header === 'compact' ? (
        <div
          className="fade-rise relative mb-5 flex flex-wrap items-center gap-4 rounded-2xl p-4"
          style={{ background: 'linear-gradient(90deg, var(--accent-soft), transparent 80%)' }}
        >
          <div data-stk-host className="relative">
            <PlaylistCover playlist={playlist} mosaic={mosaic} className="h-16 w-16 rounded-xl shadow" emojiClass="text-3xl" iconSize={22} />
            <StickerZone zone={`playlist:${playlist.id}`} label={t('Capa')} rel />
          </div>
          {titleBlock(false)}
          {actions}
        </div>
      ) : (
        <div
          className={`fade-rise relative mb-6 flex gap-6 rounded-3xl ${IS_ANDROID ? 'flex-col items-center p-5 text-center' : 'items-end p-7'}`}
          style={{ background: 'linear-gradient(135deg, var(--accent), transparent 75%)' }}
        >
          <div data-stk-host className="relative shrink-0">
            {header === 'disc' ? (
              <div className={`pl-disc ${playingHere ? 'is-playing' : ''} ${IS_ANDROID ? 'h-48 w-48' : 'h-44 w-44'}`}>
                <PlaylistCover playlist={playlist} mosaic={mosaic} className="h-full w-full rounded-full" emojiClass="text-6xl" iconSize={40} />
              </div>
            ) : (
              <PlaylistCover
                playlist={playlist}
                mosaic={mosaic}
                className={`${IS_ANDROID ? 'h-48 w-48' : 'h-44 w-44'} rounded-2xl shadow-2xl`}
                emojiClass="text-6xl"
                iconSize={40}
              />
            )}
            <StickerZone zone={`playlist:${playlist.id}`} label={t('Capa')} rel />
          </div>
          <div className={`flex min-w-0 flex-1 flex-col gap-4 ${IS_ANDROID ? 'w-full items-center' : ''}`}>
            {titleBlock(true)}
            {actions}
          </div>
        </div>
      )}

      {songs.length === 0 ? (
        <EmptyState
          title={smart ? t('Nenhuma música bate com as regras') : t('Playlist vazia')}
          hint={smart ? t('Toque em Regras para mudar o que entra nela.') : t('Use o menu ⋯ de qualquer música na biblioteca para adicioná-la aqui.')}
        />
      ) : (
        <>
          <FilterChips chips={SORT_CHIPS.map((c) => ({ ...c, label: t(c.label) }))} active={sort} onChange={setSort} />
          {sort === 'custom' && !smart && !IS_ANDROID && (
            <p className="mb-3 -mt-2 text-[11px] text-muted">
              {t('Arraste as músicas para montar sua ordem ideal. No ⋯ de cada música dá para escrever uma nota ou começar uma seção.')}
            </p>
          )}
          <div key={sort} className="fade-in">
            {chunks.map((c) => (
              <div key={`${c.offset}-${c.title ?? ''}`}>
                {c.title && (
                  <div className="mb-1 mt-5 flex items-center gap-3 px-3">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">{c.title}</span>
                    <span className="h-px flex-1 bg-[var(--accent-soft)]" />
                    <span className="text-[11px] text-muted">{totalTime(c.songs)}</span>
                  </div>
                )}
                <SongList
                  songs={c.songs}
                  queue={chunks.length > 1 ? { songs: sorted, offset: c.offset } : undefined}
                  onChanged={() => void load()}
                  extraAction={
                    smart
                      ? undefined
                      : {
                          label: t('Remover da playlist'),
                          run: async (song) => {
                            await api.playlists.removeSong(playlist.id, song.id)
                            void load()
                          }
                        }
                  }
                  extraActions={
                    smart
                      ? undefined
                      : [
                          { label: t('📝 Nota nesta música…'), run: (song) => setDialog({ kind: 'note', song }) },
                          { label: t('🔖 Começar uma seção aqui…'), run: (song) => setDialog({ kind: 'section', song }) }
                        ]
                  }
                  onReorder={
                    sort === 'custom' && !smart
                      ? async (ids) => {
                          // this section's new order, inside the whole playlist's
                          const all = songs.map((s) => s.id)
                          all.splice(c.offset, c.songs.length, ...ids)
                          await api.playlists.reorder(playlist.id, all)
                          void load()
                        }
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}

      {!smart && <Suggestions playlistId={playlist.id} version={playlist.id} onAdded={() => void load()} />}

      <InputDialog
        open={dialog !== null}
        title={dialog?.kind === 'note' ? t('Nota na música') : t('Seção')}
        label={
          dialog?.kind === 'note'
            ? t('Por que ela está aqui? Um momento, uma lembrança… (deixe vazio para tirar)')
            : t('Uma seção começa nesta música, como "Aquecimento" ou "Pico". (deixe vazio para tirar)')
        }
        placeholder={dialog?.kind === 'note' ? t('Tocou no casamento da Ana') : t('Aquecimento')}
        initialValue={(dialog?.kind === 'note' ? dialog.song.note : dialog?.song.section) ?? ''}
        confirmLabel={t('Salvar')}
        allowEmpty
        onConfirm={async (value) => {
          const d = dialog
          setDialog(null)
          if (!d) return
          if (d.kind === 'note') await api.playlists.setNote(playlist.id, d.song.id, value || null)
          else await api.playlists.setSection(playlist.id, d.song.id, value || null)
          void load()
        }}
        onCancel={() => setDialog(null)}
      />
      {xray && <XRay playlist={playlist} onClose={() => setXray(false)} />}
      {share && <SharePlaylist playlist={playlist} songs={sorted} mosaic={mosaic} onClose={() => setShare(false)} />}
      {rules && (
        <SmartEditor
          playlist={playlist}
          onClose={() => setRules(false)}
          onSaved={() => {
            onChanged()
            void load()
          }}
        />
      )}
    </div>
  )
}
