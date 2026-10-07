import { useEffect, useMemo, useState } from 'react'
import { Lock, Play, Trash2 } from 'lucide-react'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { usePlayerStore } from '@/store/playerStore'
import { longDate, relativeTime, useCapsuleStore, type Capsule } from '@/store/capsuleStore'
import { CoverArt } from '@/components/CoverArt'
import { SectionTitle } from './parts'

/**
 * Cápsulas do tempo in Meu Mundo: the ones ready to open (play the song and
 * it opens), the sealed ones counting down — content hidden — and the
 * memories already opened.
 */
export function Capsules({ songs, hue }: { songs: Song[]; hue: number }): JSX.Element {
  const version = useCapsuleStore((s) => s.version)
  const [list, setList] = useState<Capsule[] | null>(null)
  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs])

  useEffect(() => {
    let alive = true
    api.capsules
      .list()
      .then((rows) => alive && setList(rows as Capsule[]))
      .catch(() => alive && setList([]))
    return () => {
      alive = false
    }
  }, [version])

  if (!list) return <div className="mb-6" />

  const now = Date.now() / 1000
  const ready = list.filter((c) => !c.openedAt && c.openAt <= now)
  const sealed = list.filter((c) => !c.openedAt && c.openAt > now)
  const opened = list.filter((c) => c.openedAt).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))

  const hint =
    list.length === 0
      ? undefined
      : [ready.length && `${ready.length} pronta${ready.length > 1 ? 's' : ''}`, sealed.length && `${sealed.length} lacrada${sealed.length > 1 ? 's' : ''}`, opened.length && `${opened.length} aberta${opened.length > 1 ? 's' : ''}`]
          .filter(Boolean)
          .join(' · ')

  return (
    <div id="capsules" className="mb-6 scroll-mt-4">
      <SectionTitle emoji="📮" title="Cápsulas do tempo" hint={hint} />
      {list.length === 0 ? (
        <div
          className="glass rounded-3xl p-6 text-center"
          style={{ background: `linear-gradient(160deg, hsl(${hue} 80% 55% / 0.12), transparent 70%)` }}
        >
          <p className="text-3xl">💌</p>
          <p className="mt-2 text-sm font-semibold">Guarde uma lembrança numa música</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            Escreva o que uma música significa para você hoje e escolha quando ela abre. Quando a data chegar, na
            próxima vez que ela tocar, seu eu do passado aparece. Use o botão 📮 no player ou o menu ⋯ de qualquer
            música.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ready.map((c) => (
            <ReadyCard key={c.id} c={c} song={c.songId !== null ? byId.get(c.songId) : undefined} hue={hue} />
          ))}
          {sealed.map((c) => (
            <SealedCard key={c.id} c={c} />
          ))}
          {opened.map((c) => (
            <OpenedCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReadyCard({ c, song, hue }: { c: Capsule; song: Song | undefined; hue: number }): JSX.Element {
  const playQueue = usePlayerStore((s) => s.playQueue)
  return (
    <div
      className="glass fade-rise relative overflow-hidden rounded-2xl p-4 ring-1 ring-[var(--accent)]"
      style={{ background: `linear-gradient(150deg, hsl(${hue} 90% 60% / 0.28), transparent 75%)` }}
    >
      <div className="flex items-center gap-3">
        <span className="capsule-envelope grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-2xl">
          {c.emoji ?? '💌'}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">Pronta para abrir!</p>
          <p className="truncate text-sm font-semibold">{c.title}</p>
          <p className="truncate text-xs text-muted">Selada {relativeTime(c.createdAt)}</p>
        </div>
      </div>
      <button
        onClick={() => (song ? playQueue([song], 0) : useCapsuleStore.getState().reveal([c]))}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
      >
        {song ? (
          <>
            <Play size={12} fill="currentColor" /> Tocar para abrir
          </>
        ) : (
          'Abrir agora'
        )}
      </button>
    </div>
  )
}

function SealedCard({ c }: { c: Capsule }): JSX.Element {
  return (
    <div className="glass group relative rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/5 text-2xl grayscale">
          {c.emoji ?? '💌'}
          <Lock size={12} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-black/60 p-0.5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.title}</p>
          <p className="truncate text-xs text-muted">{c.artist ?? 'Artista desconhecido'}</p>
        </div>
        <DeleteButton c={c} />
      </div>
      <p className="mt-3 text-xs text-muted" title={longDate(c.openAt)}>
        🔒 Abre {relativeTime(c.openAt)} · selada {relativeTime(c.createdAt)}
      </p>
    </div>
  )
}

function OpenedCard({ c }: { c: Capsule }): JSX.Element {
  return (
    <div className="glass group relative rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <CoverArt src={c.coverPath} title={c.title} size="sm" rounded="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {c.emoji ? `${c.emoji} ` : ''}
            {c.title}
          </p>
          <p className="truncate text-xs text-muted">{c.artist ?? 'Artista desconhecido'}</p>
        </div>
        <DeleteButton c={c} />
      </div>
      <p className="mt-3 line-clamp-4 whitespace-pre-wrap font-serif text-sm leading-relaxed">“{c.note}”</p>
      <p className="mt-2 text-[11px] text-muted">Escrita em {longDate(c.createdAt)}</p>
    </div>
  )
}

function DeleteButton({ c }: { c: Capsule }): JSX.Element {
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!confirm) return
    const t = window.setTimeout(() => setConfirm(false), 3000)
    return () => window.clearTimeout(t)
  }, [confirm])
  return confirm ? (
    <button
      onClick={() =>
        api.capsules
          .remove(c.id)
          .then(() => useCapsuleStore.getState().changed())
          .catch(() => setConfirm(false))
      }
      className="shrink-0 rounded-full bg-red-500/80 px-2.5 py-1 text-[11px] font-semibold text-white"
    >
      Apagar?
    </button>
  ) : (
    <button
      onClick={() => setConfirm(true)}
      aria-label="Apagar cápsula"
      className="shrink-0 rounded-full p-1.5 text-muted opacity-0 transition-opacity hover:bg-white/10 hover:text-ink focus:opacity-100 group-hover:opacity-100"
    >
      <Trash2 size={14} />
    </button>
  )
}
