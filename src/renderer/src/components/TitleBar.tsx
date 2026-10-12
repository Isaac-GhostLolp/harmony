import { useEffect, useLayoutEffect, useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useTitleBarStore, type TitleButtons } from '@/store/titleBarStore'
import { t } from '@/i18n'

/**
 * The Harmony's own title bar, drawn when the main window has no system
 * frame. The whole bar drags the window (the system still snaps it to the
 * screen edges and maximizes it on a double click); the buttons don't.
 * Hidden in full screen. Marks <html data-titlebar> so the layout and the
 * full-window overlays start below it.
 */
export function TitleBar(): JSX.Element | null {
  const custom = window.harmony?.window?.frame === 'custom'
  return custom ? <Bar /> : null
}

interface WinState {
  maximized: boolean
  fullScreen: boolean
  focused: boolean
}

function Bar(): JSX.Element | null {
  const { buttons, center } = useTitleBarStore()
  const [win, setWin] = useState<WinState>({ maximized: false, fullScreen: false, focused: true })
  useEffect(() => {
    void window.harmony.window.getState().then(setWin)
    return window.harmony.window.onState(setWin)
  }, [])

  useLayoutEffect(() => {
    const html = document.documentElement
    if (win.fullScreen) html.removeAttribute('data-titlebar')
    else html.setAttribute('data-titlebar', '')
    return () => html.removeAttribute('data-titlebar')
  }, [win.fullScreen])

  if (win.fullScreen) return null
  const left = buttons === 'dots'
  return (
    <div
      className={`titlebar tb-drag fixed inset-x-0 top-0 z-[350] flex items-center ${win.focused ? '' : 'tb-blur'}`}
      data-buttons={buttons}
    >
      <div className="flex w-40 shrink-0 items-center">{left && <Buttons kind={buttons} maximized={win.maximized} />}</div>
      <div className="flex min-w-0 flex-1 justify-center">
        {center === 'song' ? <NowPlaying /> : center === 'name' ? <span className="tb-title">Harmony</span> : null}
      </div>
      <div className="flex w-40 shrink-0 items-center justify-end">
        {!left && <Buttons kind={buttons} maximized={win.maximized} />}
      </div>
    </div>
  )
}

function NowPlaying(): JSX.Element {
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const playing = usePlayerStore((s) => s.isPlaying)
  if (!song) return <span className="tb-title">Harmony</span>
  return (
    <span className="tb-title flex min-w-0 items-center gap-2">
      <span className={`tb-eq ${playing ? 'is-playing' : ''}`} aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="truncate">
        {song.title}
        {song.artist && <span className="tb-artist"> — {song.artist}</span>}
      </span>
    </span>
  )
}

function Buttons({ kind, maximized }: { kind: TitleButtons; maximized: boolean }): JSX.Element {
  const w = window.harmony.window
  const items = [
    { id: 'min', label: t('Minimizar'), run: w.minimize, icon: <MinIcon /> },
    {
      id: 'max',
      label: maximized ? t('Restaurar') : t('Maximizar'),
      run: w.toggleMaximize,
      icon: maximized ? <RestoreIcon /> : <MaxIcon />
    },
    { id: 'close', label: t('Fechar'), run: w.close, icon: <CloseIcon /> }
  ]
  // the dots read close · minimize · maximize, as on macOS
  const order = kind === 'dots' ? [items[2], items[0], items[1]] : items
  return (
    <div className={`tb-buttons tb-nodrag tb-${kind}`}>
      {order.map((b) => (
        <button key={b.id} className={`tb-btn tb-${b.id}`} onClick={b.run} title={b.label} aria-label={b.label}>
          {b.icon}
        </button>
      ))}
    </div>
  )
}

const glyph = { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1.1 }
const MinIcon = (): JSX.Element => (
  <svg {...glyph}>
    <path d="M1 5.5h8" />
  </svg>
)
const MaxIcon = (): JSX.Element => (
  <svg {...glyph}>
    <rect x="1.5" y="1.5" width="7" height="7" rx="1" />
  </svg>
)
const RestoreIcon = (): JSX.Element => (
  <svg {...glyph}>
    <rect x="1" y="3" width="6" height="6" rx="1" />
    <path d="M3 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H7" />
  </svg>
)
const CloseIcon = (): JSX.Element => (
  <svg {...glyph}>
    <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
  </svg>
)
