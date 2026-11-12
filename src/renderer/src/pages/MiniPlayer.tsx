import { useEffect, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, X, Music2 } from 'lucide-react'
import { api } from '@/services/api'
import { readFlair, type MiniSkin } from '@/store/flairStore'
import { t } from '@/i18n'

interface MiniState {
  title: string | null
  artist: string | null
  cover: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
}

/**
 * Rendered in its own frameless always-on-top window (#/mini).
 * Holds NO audio engine — it mirrors state broadcast by the main window
 * and sends transport commands back through the main process.
 *
 * Three skins (Personalização → Mini player): the compact bar, a card with
 * a big cover, and a turntable whose record turns while the music plays.
 * Each asks the main process for its window size.
 */
const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function useSkin(): MiniSkin {
  const [skin, setSkin] = useState<MiniSkin>(() => readFlair().miniSkin)
  useEffect(() => {
    // the main window saved a new choice (localStorage is shared between the windows)
    const changed = (e: StorageEvent): void => {
      if (!e.key || e.key === 'harmony.flair') setSkin(readFlair().miniSkin)
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  useEffect(() => {
    api.player.miniSkin?.(skin)
  }, [skin])
  return skin
}

export function MiniPlayer(): JSX.Element {
  const [state, setState] = useState<MiniState>({
    title: null,
    artist: null,
    cover: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0
  })
  const skin = useSkin()

  useEffect(() => api.player.onState((s) => setState(s as MiniState)), [])

  const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0
  if (skin === 'card') return <CardSkin state={state} pct={pct} />
  if (skin === 'turntable') return <TurntableSkin state={state} pct={pct} />

  return (
    <div className="flex h-screen items-center gap-3 border border-[var(--glass-border)] bg-[var(--bg-base)] px-3" style={drag}>
      <Cover src={state.cover} className="h-16 w-16 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Titles state={state} />
        <Progress pct={pct} className="mt-1.5" />
      </div>
      <Controls state={state} size="sm" />
    </div>
  )
}

function Cover({ src, className }: { src: string | null; className: string }): JSX.Element {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden bg-[var(--bg-raised)] ${className}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Music2 size={20} className="text-muted" />}
    </div>
  )
}

function Titles({ state, center = false }: { state: MiniState; center?: boolean }): JSX.Element {
  return (
    <div className={`min-w-0 ${center ? 'text-center' : ''}`}>
      <p className="truncate text-sm font-medium">{state.title ?? t('Nada tocando')}</p>
      <p className="truncate text-xs text-muted">{state.artist ?? 'Harmony'}</p>
    </div>
  )
}

function Progress({ pct, className = '' }: { pct: number; className?: string }): JSX.Element {
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-[var(--bg-raised)] ${className}`}>
      <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  )
}

function Controls({ state, size, close = true }: { state: MiniState; size: 'sm' | 'lg'; close?: boolean }): JSX.Element {
  const big = size === 'lg'
  return (
    <div className={`flex items-center ${big ? 'gap-5' : 'gap-2'}`} style={noDrag}>
      <button onClick={() => api.player.sendCommand('prev')} className="text-muted hover:text-ink" aria-label={t('Anterior')}>
        <SkipBack size={big ? 20 : 16} fill="currentColor" />
      </button>
      <button
        onClick={() => api.player.sendCommand('toggle')}
        className={`grid place-items-center rounded-full ${big ? 'h-12 w-12' : 'h-9 w-9'}`}
        style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
        aria-label={state.isPlaying ? t('Pausar') : t('Tocar')}
      >
        {state.isPlaying ? (
          <Pause size={big ? 19 : 15} fill="currentColor" />
        ) : (
          <Play size={big ? 19 : 15} fill="currentColor" className="ml-0.5" />
        )}
      </button>
      <button onClick={() => api.player.sendCommand('next')} className="text-muted hover:text-ink" aria-label={t('Próxima')}>
        <SkipForward size={big ? 20 : 16} fill="currentColor" />
      </button>
      {close && (
        <button onClick={() => api.player.toggleMini()} className="ml-1 text-muted hover:text-ink" aria-label={t('Fechar mini player')}>
          <X size={15} />
        </button>
      )}
    </div>
  )
}

/** a card: the cover big on top, the song and the controls below */
function CardSkin({ state, pct }: { state: MiniState; pct: number }): JSX.Element {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-base)] p-4" style={drag}>
      {state.cover && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${state.cover})`, filter: 'blur(28px)' }}
        />
      )}
      <button
        onClick={() => api.player.toggleMini()}
        className="absolute right-2.5 top-2.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/30 text-white/80 hover:text-white"
        style={noDrag}
        aria-label={t('Fechar mini player')}
      >
        <X size={14} />
      </button>
      <Cover src={state.cover} className="relative mx-auto aspect-square w-[82%] rounded-2xl shadow-2xl" />
      <div className="relative mt-4">
        <Titles state={state} center />
        <Progress pct={pct} className="mt-3" />
      </div>
      <div className="relative mt-auto flex justify-center pb-1 pt-3">
        <Controls state={state} size="lg" close={false} />
      </div>
    </div>
  )
}

/** a turntable: the record (with the cover as its label) turns while the music plays */
function TurntableSkin({ state, pct }: { state: MiniState; pct: number }): JSX.Element {
  return (
    <div className="flex h-screen items-center gap-4 border border-[var(--glass-border)] bg-[var(--bg-base)] px-4" style={drag}>
      <div className="mini-deck relative h-[140px] w-[140px] shrink-0">
        <div className={`mini-record ${state.isPlaying ? 'is-playing' : ''}`}>
          <div className="mini-label">
            {state.cover ? <img src={state.cover} alt="" className="h-full w-full object-cover" /> : <Music2 size={16} className="text-white/70" />}
          </div>
        </div>
        <div className={`mini-arm ${state.isPlaying ? 'is-playing' : ''}`} aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Titles state={state} />
        <Progress pct={pct} />
        <Controls state={state} size="sm" />
      </div>
    </div>
  )
}
