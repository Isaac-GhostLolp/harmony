import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, History, Search, X } from 'lucide-react'
import { allReleases, APP_VERSION, type Release } from '@/whatsNew'
import { useEscape } from '@/components/views/useEscape'
import { t, locale } from '@/i18n'

/**
 * Settings → Novidades → "Todas as versões": every release of the Harmony as
 * a timeline, newest first. Each version folds open (the running one starts
 * open); big releases (x.y.0) get a bigger dot. The search finds when
 * something arrived ("karaokê", "playlist"…) and opens the versions that
 * mention it.
 */

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function dateLabel(d?: string): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PatchNotesArchive({ onClose }: { onClose: () => void }): JSX.Element {
  useEscape(onClose)
  const releases = useMemo(() => allReleases(), [])
  const [open, setOpen] = useState<Set<string>>(() => new Set(releases.slice(0, 1).map((r) => r.version)))
  const [query, setQuery] = useState('')

  const q = fold(query.trim())
  const shown: Release[] = useMemo(() => {
    if (!q) return releases
    return releases
      .map((r) => ({
        ...r,
        items: fold(`${r.version} ${t(r.title)}`).includes(q)
          ? r.items
          : r.items.filter((it) => fold(`${t(it.title)} ${t(it.text)}`).includes(q))
      }))
      .filter((r) => r.items.length > 0)
  }, [q, releases])

  const allOpen = shown.every((r) => open.has(r.version))
  const toggle = (v: string): void =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  const first = releases[releases.length - 1]

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4 backdrop-blur-md" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t('Todas as versões do Harmony')}
        className="glass fade-rise flex max-h-[86vh] w-[min(94vw,640px)] flex-col overflow-hidden rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pb-4 pt-6" style={{ background: 'linear-gradient(135deg, var(--accent-soft), transparent 70%)' }}>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-ink"
            aria-label={t('Fechar')}
          >
            <X size={16} />
          </button>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            <History size={13} /> {t('Todas as versões')}
          </p>
          <h2 className="mt-1 pr-8 text-xl font-bold tracking-tight text-ink">{t('A história do Harmony')}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {first?.date
              ? t('{n} versões desde {date} · você está na v{v}', { n: releases.length, date: dateLabel(first.date), v: APP_VERSION })
              : t('{n} versões · você está na v{v}', { n: releases.length, v: APP_VERSION })}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-full bg-[var(--bg-base)]/60 px-3 py-1.5 ring-1 ring-[var(--glass-border)] focus-within:ring-[var(--accent)]">
              <Search size={13} className="shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Quando chegou o karaokê? Busque aqui…')}
                className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-muted"
                aria-label={t('Buscar nas novidades')}
              />
            </label>
            {!q && (
              <button
                onClick={() => setOpen(allOpen ? new Set() : new Set(releases.map((r) => r.version)))}
                className="shrink-0 rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-[11px] font-medium text-muted hover:text-ink"
              >
                {allOpen ? t('Recolher todas') : t('Abrir todas')}
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin' }}>
          {shown.length === 0 && <p className="py-10 text-center text-sm text-muted">{t('Nada encontrado para “{q}”.', { q: query })}</p>}
          <ol className="relative">
            {/* the timeline's spine */}
            {shown.length > 1 && <span aria-hidden className="absolute bottom-3 left-[7px] top-3 w-px bg-[var(--glass-border)]" />}
            {shown.map((r) => {
              const isOpen = !!q || open.has(r.version)
              const major = /^\d+\.\d+\.0$/.test(r.version)
              const current = r.version === APP_VERSION
              return (
                <li key={r.version} className="relative pb-3 pl-7">
                  <span
                    aria-hidden
                    className={`absolute rounded-full ring-4 ring-[var(--bg-base)] ${
                      major ? 'left-0 top-[13px] h-[15px] w-[15px]' : 'left-[3px] top-[16px] h-[9px] w-[9px]'
                    }`}
                    style={{ background: current || major ? 'var(--accent)' : 'var(--text-muted)' }}
                  />
                  <button
                    onClick={() => !q && toggle(r.version)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
                    aria-expanded={isOpen}
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                        current ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-ink'
                      }`}
                    >
                      v{r.version}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${major ? 'font-semibold' : 'font-medium'} text-ink`}>
                      {t(r.title)}
                      {current && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">atual</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">{dateLabel(r.date)}</span>
                    {!q && <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                  </button>
                  {isOpen && (
                    <div className="mt-1 flex flex-col gap-2 pl-2">
                      {r.items.map((it, i) => (
                        <div key={i} className="fade-rise flex gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/5" style={{ animationDelay: `${i * 50}ms` }}>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-xl">{it.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-ink">{t(it.title)}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(it.text)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>,
    document.body
  )
}
