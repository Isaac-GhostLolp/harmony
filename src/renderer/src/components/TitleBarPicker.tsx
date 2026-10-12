import { useState } from 'react'
import { api } from '@/services/api'
import {
  useTitleBarStore,
  TITLE_BUTTONS,
  TITLE_CENTERS,
  type TitleButtons,
  type TitleMode
} from '@/store/titleBarStore'
import { t } from '@/i18n'

/**
 * Personalização → Barra da janela: the Harmony's own title bar or the
 * system's (takes a restart), the look of its buttons and what goes in the
 * middle.
 */
export function TitleBarPicker(): JSX.Element {
  const { mode, buttons, center, setMode, setButtons, setCenter } = useTitleBarStore()
  const [restarting, setRestarting] = useState(false)
  const w = window.harmony?.window
  const running: TitleMode = w?.frame === 'custom' ? 'harmony' : 'system'
  const mac = w?.platform === 'darwin'

  const restart = async (): Promise<void> => {
    setRestarting(true)
    // saved right away (not debounced): the new window reads it on start
    await api.settings.set('titleBar', { mode, buttons, center })
    api.app.relaunch()
  }

  return (
    <div>
      <h2 className="text-sm font-semibold">{t('Barra da janela')}</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        {t('A barra do topo da janela, com os botões de minimizar, maximizar e fechar.')}
      </p>

      {mac ? (
        <p className="text-xs text-muted">{t('No macOS, o Harmony usa a barra do próprio sistema.')}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'harmony', label: t('Do Harmony') },
                { id: 'system', label: t('Do sistema') }
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                  mode === m.id
                    ? 'bg-[var(--accent)] font-semibold text-[var(--on-accent,#fff)]'
                    : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode !== running && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs">
              <span className="flex-1">
                {t('A troca de barra vale depois de reiniciar o Harmony (a música que está tocando para).')}
              </span>
              <button
                onClick={() => void restart()}
                disabled={restarting}
                className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 font-semibold text-[var(--on-accent,#fff)] disabled:opacity-60"
              >
                {restarting ? t('Reiniciando…') : t('Reiniciar agora')}
              </button>
            </div>
          )}

          <div className={`mt-4 transition-opacity ${mode === 'system' ? 'pointer-events-none opacity-40' : ''}`}>
            <p className="mb-2 text-[11px] text-muted">{t('Botões')}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {TITLE_BUTTONS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setButtons(b.id)}
                  title={t(b.hint)}
                  className={`rounded-xl p-1.5 text-left transition-colors ${
                    buttons === b.id ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--bg-raised)]'
                  }`}
                >
                  <BarPreview kind={b.id} />
                  <p className="mt-1.5 px-1 text-[11px] font-medium">{t(b.name)}</p>
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              {t('No meio')}
              <div className="flex flex-wrap gap-1.5">
                {TITLE_CENTERS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCenter(c.id)}
                    className={`rounded-full px-3 py-1.5 transition-colors ${
                      center === c.id
                        ? 'bg-[var(--accent)] font-semibold text-[var(--on-accent,#fff)]'
                        : 'bg-[var(--bg-raised)] hover:text-ink'
                    }`}
                  >
                    {t(c.name)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** the top of a little window with that style of buttons */
function BarPreview({ kind }: { kind: TitleButtons }): JSX.Element {
  const dot = (bg: string): JSX.Element => <span className="h-[7px] w-[7px] rounded-full" style={{ background: bg }} />
  const line = 'var(--text-muted)'
  const glyphs = (
    <>
      <span className="h-px w-2" style={{ background: line }} />
      <span className="h-2 w-2 rounded-[2px] border" style={{ borderColor: line }} />
      <span className="relative h-2 w-2">
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45" style={{ background: line }} />
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 -rotate-45" style={{ background: line }} />
      </span>
    </>
  )
  let btns: JSX.Element
  switch (kind) {
    case 'dots':
      btns = (
        <span className="flex items-center gap-1">
          {dot('#ff5f57')}
          {dot('#febc2e')}
          {dot('#28c840')}
        </span>
      )
      break
    case 'pill':
      btns = (
        <span className="flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--accent-soft)] px-1.5 py-[3px]">
          {glyphs}
        </span>
      )
      break
    case 'minimal':
      btns = <span className="flex items-center gap-2.5 opacity-70">{glyphs}</span>
      break
    default:
      btns = (
        <span className="flex items-center gap-1.5">
          <span className="grid h-3.5 w-4 place-items-center rounded-[3px] bg-[var(--bg-raised)]">
            <span className="h-px w-2" style={{ background: line }} />
          </span>
          <span className="grid h-3.5 w-4 place-items-center rounded-[3px] bg-[var(--bg-raised)]">
            <span className="h-2 w-2 rounded-[2px] border" style={{ borderColor: line }} />
          </span>
          <span className="grid h-3.5 w-4 place-items-center rounded-[3px]" style={{ background: '#e5484d' }}>
            <span className="text-[8px] leading-none text-white">✕</span>
          </span>
        </span>
      )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--glass-border)] bg-[var(--bg-base)]">
      <div
        className={`flex h-5 items-center px-1.5 ${kind === 'dots' ? 'justify-start' : 'justify-end'}`}
        style={{ background: 'color-mix(in srgb, var(--bg-raised) 60%, transparent)' }}
      >
        {btns}
      </div>
      <div className="flex h-9 gap-1 p-1">
        <span className="w-5 rounded bg-[var(--bg-raised)]" />
        <span className="flex-1 rounded bg-[var(--bg-surface)]" />
      </div>
    </div>
  )
}
