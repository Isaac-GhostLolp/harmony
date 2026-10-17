import { useCallback, useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { useSleepStore } from '@/store/sleepStore'
import { usePlayerStore } from '@/store/playerStore'
import { useBackCloses } from '@/components/mobile/back'
import { t } from '@/i18n'

const PRESETS = [15, 30, 45, 60, 90]

/** "23:41" left until the music stops */
function useRemaining(): string | null {
  const endsAt = useSleepStore((s) => s.endsAt)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [endsAt])
  if (!endsAt) return null
  const left = Math.max(0, Math.round((endsAt - now) / 1000))
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The sleep timer's button (a moon, with the time left while it runs) and
 * its panel: on the desktop a popover over the music bar, on the phone a
 * sheet over "Tocando agora".
 */
export function SleepTimerButton({ variant }: { variant: 'bar' | 'mobile' }): JSX.Element {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useBackCloses(open, close)
  const mode = useSleepStore((s) => s.mode)
  const remaining = useRemaining()
  const label = mode === 'song' ? t('fim da música') : remaining

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'bar'
            ? `flex items-center gap-1 ${mode ? 'text-[var(--accent)]' : 'text-muted hover:text-ink'}`
            : `flex h-9 items-center gap-1.5 rounded-full px-3 text-xs ${
                mode ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-raised)] text-muted'
              }`
        }
        aria-label={t('Timer para dormir')}
        title={t('Timer para dormir')}
      >
        <Moon size={variant === 'bar' ? 16 : 15} fill={mode ? 'currentColor' : 'none'} />
        {variant === 'bar' ? (
          label && <span className="text-[11px] tabular-nums">{label}</span>
        ) : (
          <span className="tabular-nums">{label ?? t('Timer')}</span>
        )}
      </button>
      {open &&
        (variant === 'bar' ? (
          <>
            <div className="fixed inset-0 z-[80]" onClick={close} />
            <div className="glass fade-rise absolute bottom-10 right-0 z-[81] w-72 rounded-2xl p-4 shadow-xl">
              <Panel onDone={close} />
            </div>
          </>
        ) : (
          <div className="fixed inset-0 z-[135] flex items-end bg-black/50" onClick={close}>
            <div
              className="fade-rise w-full rounded-t-3xl bg-[var(--bg-base)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--bg-raised)]" />
              <Panel onDone={close} />
            </div>
          </div>
        ))}
    </div>
  )
}

function Panel({ onDone }: { onDone: () => void }): JSX.Element {
  const { mode, startMinutes, startEndOfSong, addMinutes, cancel } = useSleepStore()
  const remaining = useRemaining()
  const hasSong = usePlayerStore((s) => s.currentIndex >= 0 && s.queue.length > 0)

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Moon size={15} /> {t('Timer para dormir')}
      </h3>
      <p className="mt-1 text-xs text-muted">
        {t('A música vai sumindo devagar, pausa e o Harmony fecha sozinho.')}
      </p>

      {mode ? (
        <div className="mt-4 text-center">
          <p className="text-3xl font-bold tabular-nums">{mode === 'song' ? '🎵' : remaining}</p>
          <p className="mt-1 text-xs text-muted">
            {mode === 'song' ? t('Para no fim desta música.') : t('até a música parar')}
          </p>
          <div className="mt-4 flex gap-2">
            {mode === 'time' && (
              <button
                onClick={() => addMinutes(10)}
                className="flex-1 rounded-full bg-[var(--bg-raised)] px-3 py-2.5 text-xs font-medium"
              >
                {t('+10 min')}
              </button>
            )}
            <button
              onClick={() => {
                cancel()
                onDone()
              }}
              className="flex-1 rounded-full bg-[var(--bg-raised)] px-3 py-2.5 text-xs font-medium text-muted"
            >
              {t('Cancelar timer')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => {
                startMinutes(m)
                onDone()
              }}
              className="rounded-xl bg-[var(--bg-raised)] px-2 py-3 text-sm font-medium transition-colors hover:bg-[var(--accent-soft)]"
            >
              {m < 60 ? t('{n} min', { n: m }) : m === 60 ? t('1 hora') : t('1h30')}
            </button>
          ))}
          <button
            onClick={() => {
              startEndOfSong()
              onDone()
            }}
            disabled={!hasSong}
            className="rounded-xl bg-[var(--bg-raised)] px-2 py-3 text-xs font-medium transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-40"
          >
            {t('Fim desta música')}
          </button>
        </div>
      )}
    </div>
  )
}
