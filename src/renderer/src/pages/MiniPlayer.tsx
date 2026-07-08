import { useEffect, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, X, Music2 } from 'lucide-react'
import { api } from '@/services/api'

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
 */
export function MiniPlayer(): JSX.Element {
  const [state, setState] = useState<MiniState>({
    title: null,
    artist: null,
    cover: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0
  })

  useEffect(() => api.player.onState((s) => setState(s as MiniState)), [])

  const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0

  return (
    <div
      className="flex h-screen items-center gap-3 border border-[var(--glass-border)] bg-[var(--bg-base)] px-3"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--bg-raised)]">
        {state.cover ? (
          <img src={state.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music2 size={20} className="text-muted" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{state.title ?? 'Nada tocando'}</p>
        <p className="truncate text-xs text-muted">{state.artist ?? 'Harmony'}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-raised)]">
          <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button onClick={() => api.player.sendCommand('prev')} className="text-muted hover:text-ink" aria-label="Anterior">
          <SkipBack size={16} fill="currentColor" />
        </button>
        <button
          onClick={() => api.player.sendCommand('toggle')}
          className="grid h-9 w-9 place-items-center rounded-full"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
          aria-label={state.isPlaying ? 'Pausar' : 'Tocar'}
        >
          {state.isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={() => api.player.sendCommand('next')} className="text-muted hover:text-ink" aria-label="Próxima">
          <SkipForward size={16} fill="currentColor" />
        </button>
        <button onClick={() => api.player.toggleMini()} className="ml-1 text-muted hover:text-ink" aria-label="Fechar mini player">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
