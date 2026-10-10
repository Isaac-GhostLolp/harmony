import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Lock, X } from 'lucide-react'
import { CoverArt } from '@/components/CoverArt'
import { api } from '@/services/api'
import { usePlayerStore } from '@/store/playerStore'
import {
  longDate,
  monthsFromNow,
  relativeTime,
  SEAL_OPTIONS,
  useCapsuleStore,
  type Capsule
} from '@/store/capsuleStore'
import { t } from '@/i18n'

/**
 * Cápsula do tempo — a note sealed on a song for the listener's future self.
 *
 * Mounted once at the app root: the "seal" dialog (opened from the player bar
 * or a song's menu), the reveal card, and a watcher that checks for capsules
 * whose day has come whenever a song has been playing for a few seconds.
 */

const EMOJIS = ['💌', '🎓', '❤️', '🌅', '🎉', '😢', '✈️', '🏠', '🌧️', '⭐']
const MAX = 500
/** Seconds a song must play before its capsule opens (skipping past doesn't burn it). */
const REVEAL_AFTER = 3

export function CapsuleLayer(): JSX.Element {
  useCapsuleWatcher()
  return (
    <>
      <SealDialog />
      <RevealCard />
    </>
  )
}

function useCapsuleWatcher(): void {
  const songId = usePlayerStore((s) => s.queue[s.currentIndex]?.id ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const checked = useRef<number | null>(null)

  useEffect(() => {
    if (songId === null || !isPlaying || checked.current === songId) return
    const t = window.setTimeout(() => {
      checked.current = songId
      api.capsules
        .due(songId)
        .then((rows) => {
          const due = rows as Capsule[]
          if (due.length) useCapsuleStore.getState().reveal(due)
        })
        .catch(() => {
          /* no capsules this time */
        })
    }, REVEAL_AFTER * 1000)
    return () => window.clearTimeout(t)
  }, [songId, isPlaying])

}

// ---------------------------------------------------------------------------
// Seal
// ---------------------------------------------------------------------------

function SealDialog(): JSX.Element | null {
  const song = useCapsuleStore((s) => s.sealing)
  const close = useCapsuleStore((s) => s.closeSeal)
  const [note, setNote] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [months, setMonths] = useState(12)
  const [sealed, setSealed] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!song) return
    setNote('')
    setEmoji(EMOJIS[0])
    setMonths(12)
    setSealed(null)
    setError(false)
  }, [song])

  useEffect(() => {
    if (!song) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [song, close])

  if (!song) return null

  const openAt = monthsFromNow(months)
  const seal = async (): Promise<void> => {
    if (!note.trim() || saving) return
    setSaving(true)
    setError(false)
    try {
      const created = await api.capsules.create(song.id, note.trim(), emoji, openAt)
      if (!created) throw new Error('not created')
      useCapsuleStore.getState().changed()
      setSealed(openAt)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-label={t('Cápsula do tempo')}
        className="glass fade-rise w-[min(92vw,440px)] rounded-3xl p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{t('📮 Cápsula do tempo')}</h2>
            <p className="text-xs text-muted">{t('Uma lembrança para o seu eu do futuro, presa a esta música.')}</p>
          </div>
          <button onClick={close} className="rounded-full p-1 text-muted hover:bg-white/10 hover:text-ink" aria-label={t('Fechar')}>
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/5 p-2.5">
          <CoverArt src={song.coverPath} title={song.title} size="sm" rounded="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{song.title}</p>
            <p className="truncate text-xs text-muted">{song.artist ?? 'Artista desconhecido'}</p>
          </div>
        </div>

        {sealed !== null ? (
          <div className="py-6 text-center">
            <div className="seal-pop mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-[var(--accent-soft)] text-3xl ring-2 ring-[var(--accent)]">
              {emoji}
            </div>
            <p className="font-semibold">{t('Cápsula selada!')}</p>
            <p className="mt-1 text-xs text-muted">
              {t('Ela abre em {date}, na primeira vez que esta música tocar depois disso.', { date: longDate(sealed) })}
            </p>
            <button
              onClick={close}
              className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white"
            >
              {t('Até lá! 👋')}
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX))}
              autoFocus
              rows={4}
              placeholder={t('O que esta música significa para você hoje? Onde você está, com quem, o que está sentindo…')}
              className="w-full resize-none rounded-2xl bg-black/25 p-3 text-sm leading-relaxed placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <p className="mb-3 mt-1 text-right text-[10px] text-muted">
              {note.length}/{MAX}
            </p>

            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('Selo')}</p>
            <div className="mb-4 flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  aria-label={t('Selo {emoji}', { emoji: e })}
                  className={`rounded-lg p-1 text-xl transition-transform hover:scale-125 ${emoji === e ? 'bg-white/15' : ''}`}
                >
                  {e}
                </button>
              ))}
            </div>

            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('Abrir daqui a')}</p>
            <div className="mb-1 flex flex-wrap gap-1.5">
              {SEAL_OPTIONS.map((o) => (
                <button
                  key={o.months}
                  onClick={() => setMonths(o.months)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    months === o.months ? 'bg-[var(--accent)] text-white' : 'bg-white/10 hover:bg-white/15'
                  }`}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
            <p className="mb-4 text-[11px] text-muted">{t('Abre a partir de')} {longDate(openAt)}.</p>

            {error && <p className="mb-2 text-center text-xs text-red-300">{t('Não consegui selar a cápsula. Tente de novo.')}</p>}
            <button
              onClick={seal}
              disabled={!note.trim() || saving}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Lock size={14} /> {t('Selar cápsula')}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------

function RevealCard(): JSX.Element | null {
  const capsule = useCapsuleStore((s) => s.revealing[0] ?? null)
  const left = useCapsuleStore((s) => s.revealing.length - 1)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    setOpened(false)
    if (!capsule) return
    // it counts as opened the moment it is shown
    api.capsules
      .markOpened(capsule.id)
      .then(() => useCapsuleStore.getState().changed())
      .catch(() => {})
    // the envelope opens by itself after a beat
    const t = window.setTimeout(() => setOpened(true), 900)
    return () => window.clearTimeout(t)
  }, [capsule?.id])

  if (!capsule) return null

  const done = (): void => useCapsuleStore.getState().nextReveal()
  const writeAgain = (): void => {
    done()
    if (capsule.songId !== null)
      useCapsuleStore.getState().openSeal({
        id: capsule.songId,
        title: capsule.title,
        artist: capsule.artist,
        coverPath: capsule.coverPath
      })
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4 backdrop-blur-md">
      <div className="fade-rise w-[min(92vw,460px)] text-center">
        {/* the envelope */}
        <button
          onClick={() => setOpened(true)}
          aria-label={t('Abrir cápsula')}
          className={`capsule-envelope mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-[var(--accent-soft)] text-5xl ring-2 ring-[var(--accent)] ${
            opened ? 'is-open' : ''
          }`}
        >
          {capsule.emoji ?? '💌'}
        </button>
        <p className="text-xs uppercase tracking-[0.25em] text-white/60">{t('Uma cápsula do tempo abriu')}</p>
        <p className="mt-1 text-sm text-white/80">
          {t('Você escreveu isto em')} {longDate(capsule.createdAt)} ({relativeTime(capsule.createdAt)})
        </p>

        <div
          className={`capsule-letter glass mt-5 rounded-3xl p-6 text-left transition-all duration-700 ${
            opened ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
          }`}
        >
          <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-ink">“{capsule.note}”</p>
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
            <CoverArt src={capsule.coverPath} title={capsule.title} size="sm" rounded="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{capsule.title}</p>
              <p className="truncate text-xs text-muted">{capsule.artist ?? 'Artista desconhecido'}</p>
            </div>
          </div>
        </div>

        <div
          className={`mt-5 flex justify-center gap-2 transition-opacity duration-700 ${opened ? 'opacity-100' : 'opacity-0'}`}
        >
          {capsule.songId !== null && (
            <button onClick={writeAgain} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
              {t('Escrever uma nova')}
            </button>
          )}
          <button
            onClick={done}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white"
          >
            {left > 0 ? t('Próxima ({n})', { n: left }) : t('Guardar no coração 💛')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
