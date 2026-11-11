import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FOCUS_PLANS, useFocusStore } from '@/store/focusStore'
import { usePlayerStore } from '@/store/playerStore'
import { t, tn } from '@/i18n'
import { useBackCloses } from './back'

/** "12:34" until the current focus phase ends */
function useCountdown(endsAt: number | null): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [endsAt])
  if (!endsAt) return ''
  const left = Math.max(0, Math.round((endsAt - now) / 1000))
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

/** Tocando agora's "Foco" button and its sheet: choose a rhythm, or see the round running. */
export function FocusButton(): JSX.Element {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useBackCloses(open, close)
  const { plan, phase, endsAt, rounds, start, skip, stop } = useFocusStore()
  const left = useCountdown(endsAt)
  const hasMusic = usePlayerStore((s) => s.queue.length > 0)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs ${
          phase ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-raised)] text-muted'
        }`}
        aria-label={t('Modo Foco')}
      >
        <span aria-hidden>{phase === 'break' ? '☕' : '🎯'}</span>
        <span className="tabular-nums">{phase ? left : t('Foco')}</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[135] flex items-end bg-black/50" onClick={close}>
            <div
              className="fade-rise w-full rounded-t-3xl bg-[var(--bg-base)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--bg-raised)]" />
              <h3 className="text-sm font-semibold">🎯 {t('Modo Foco')}</h3>
              <p className="mt-1 text-xs text-muted">
                {t('Música enquanto você foca. Na pausa ela some devagar, e volta quando a pausa acaba.')}
              </p>

              {plan && phase ? (
                <div className="mt-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {phase === 'focus' ? t('Focando') : t('Pausa')}
                  </p>
                  <p className="text-4xl font-bold tabular-nums">{left}</p>
                  <p className="mt-1 text-xs text-muted">
                    {tn(rounds, '{n} rodada concluída', '{n} rodadas concluídas')} ·{' '}
                    {t('{focus} min de foco, {rest} de pausa', { focus: plan.focus, rest: plan.rest })}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button onClick={skip} className="flex-1 rounded-full bg-[var(--bg-raised)] px-3 py-2.5 text-xs font-medium">
                      {phase === 'focus' ? t('Pausar agora') : t('Voltar ao foco')}
                    </button>
                    <button
                      onClick={() => {
                        stop()
                        close()
                      }}
                      className="flex-1 rounded-full bg-[var(--bg-raised)] px-3 py-2.5 text-xs font-medium text-muted"
                    >
                      {t('Encerrar')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {FOCUS_PLANS.map((p) => (
                    <button
                      key={p.id}
                      disabled={!hasMusic}
                      onClick={() => {
                        start(p)
                        close()
                      }}
                      className="rounded-2xl bg-[var(--bg-raised)] px-3 py-4 text-center transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-40"
                    >
                      <span className="block text-lg font-bold">
                        {p.focus} + {p.rest}
                      </span>
                      <span className="text-[11px] text-muted">
                        {t('{focus} min de foco, {rest} de pausa', { focus: p.focus, rest: p.rest })}
                      </span>
                    </button>
                  ))}
                  {!hasMusic && (
                    <p className="col-span-2 text-center text-xs text-muted">{t('Escolha uma música para começar.')}</p>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

/**
 * The break: a calm screen over the app, a circle breathing slowly (in for
 * four seconds, out for four) and the time left. It can be closed (the
 * break keeps going) or ended early.
 */
export function FocusBreak(): JSX.Element | null {
  const phase = useFocusStore((s) => s.phase)
  const endsAt = useFocusStore((s) => s.endsAt)
  const skip = useFocusStore((s) => s.skip)
  const left = useCountdown(endsAt)
  const [hidden, setHidden] = useState<number | null>(null)
  const hide = useCallback(() => setHidden(endsAt), [endsAt])
  const showing = phase === 'break' && hidden !== endsAt
  useBackCloses(showing, hide)
  if (!showing) return null

  return createPortal(
    <div className="m-break fixed inset-0 z-[145] flex flex-col items-center justify-center gap-8 px-8 text-center">
      <div className="m-breath" aria-hidden />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{t('Pausa')}</p>
        <p className="mt-1 text-2xl font-bold">{t('Respire. Alongue-se. Beba água.')}</p>
        <p className="mt-2 text-5xl font-bold tabular-nums">{left}</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button onClick={skip} className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent,#fff)]">
          {t('Voltar ao foco agora')}
        </button>
        <button onClick={hide} className="rounded-full px-4 py-3 text-sm text-muted">
          {t('Fechar')}
        </button>
      </div>
    </div>,
    document.body
  )
}
