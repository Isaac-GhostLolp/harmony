import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, X } from 'lucide-react'
import { api } from '@/services/api'
import { useUiStore } from '@/store/uiStore'
import { APP_VERSION, compareVersions, RELEASES, releasesSince, type Release, type WhatsNewAction } from '@/whatsNew'
import { t } from '@/i18n'

/** Dispatch on window to show the current release's notes again (Settings). */
export const WHATS_NEW_EVENT = 'harmony:whats-new'

/**
 * Shows what changed, once, the first time the app runs after an update.
 * A fresh install is not an update, so it starts quietly instead.
 * `ready` holds it back until the opening animation is gone.
 */
export function WhatsNew({ ready }: { ready: boolean }): JSX.Element | null {
  const [releases, setReleases] = useState<Release[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const checked = useRef(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!ready || checked.current) return
    checked.current = true
    ;(async () => {
      const s = (await api.settings.get()) as Record<string, unknown>
      const last = typeof s.lastSeenVersion === 'string' ? s.lastSeenVersion : null
      let show: Release[] = []
      if (last) show = releasesSince(last)
      else {
        // no record yet: an update from before this feature (there is a
        // library) gets the latest notes; a brand-new install gets none
        const songs = (await api.library.getSongs()) as unknown[]
        if (songs.length > 0) show = releasesSince(null).slice(0, 1)
      }
      if (last !== APP_VERSION) await api.settings.set('lastSeenVersion', APP_VERSION)
      if (show.length) setReleases(show)
    })().catch((err) => console.error('[WhatsNew]', err))
  }, [ready])

  useEffect(() => {
    const open = (): void => {
      setDone(new Set())
      setReleases(RELEASES.filter((r) => compareVersions(r.version, APP_VERSION) <= 0).slice(0, 1))
    }
    window.addEventListener(WHATS_NEW_EVENT, open)
    return () => window.removeEventListener(WHATS_NEW_EVENT, open)
  }, [])

  const close = (): void => setReleases([])

  useEffect(() => {
    if (!releases.length) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [releases.length])

  if (!releases.length) return null

  const run = (a: WhatsNewAction, key: string): void => {
    if (a.kind === 'route') {
      close()
      navigate(a.to)
    } else if (a.kind === 'karaoke') {
      close()
      const ui = useUiStore.getState()
      ui.setLyricsMode('karaoke')
      if (!ui.lyricsOpen) ui.toggleLyrics()
    } else {
      useUiStore.getState().setWorld(a.world)
      setDone((d) => new Set(d).add(key))
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4 backdrop-blur-md" onMouseDown={close}>
      <div
        role="dialog"
        aria-label={t('Novidades do Harmony')}
        className="glass fade-rise flex max-h-[86vh] w-[min(94vw,560px)] flex-col overflow-hidden rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="relative px-6 pb-5 pt-6"
          style={{ background: 'linear-gradient(135deg, var(--accent-soft), transparent 70%)' }}
        >
          <button
            onClick={close}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-ink"
            aria-label={t('Fechar')}
          >
            <X size={16} />
          </button>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            <Sparkles size={13} /> {t('Novidades da v{v}', { v: releases[0].version })}
          </p>
          <h2 className="mt-1 pr-8 text-xl font-bold tracking-tight text-ink">{t(releases[0].title)}</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          {releases.map((r, ri) => (
            <div key={r.version}>
              {ri > 0 && (
                <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  v{r.version} · {t(r.title)}
                </p>
              )}
              <div className="flex flex-col gap-2.5">
                {r.items.map((it, i) => {
                  const key = `${r.version}-${i}`
                  return (
                    <div
                      key={key}
                      className="fade-rise flex gap-3.5 rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/5"
                      style={{ animationDelay: `${120 + i * 90}ms` }}
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-2xl">
                        {it.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{t(it.title)}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(it.text)}</p>
                        {it.action && (
                          <button
                            onClick={() => run(it.action!, key)}
                            disabled={done.has(key)}
                            className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white disabled:bg-transparent disabled:px-0 disabled:hover:text-[var(--accent)]"
                          >
                            {done.has(key) ? (
                              <>
                                <Check size={12} /> {t('Ativado')}
                              </>
                            ) : (
                              `${t(it.action.label)} →`
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end px-6 py-4">
          <button onClick={close} className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white">
            {t('Bora! 🎶')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
