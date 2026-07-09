import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, MicVocal, Loader2, Music2, RotateCw } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useUiStore, type LyricsMode } from '@/store/uiStore'
import { api } from '@/services/api'
import { mediaUrl } from '@/utils/format'
import { parseLrc, activeLineIndex, lineProgress, type LrcLine } from '@/utils/lrc'
import { useSmoothTime } from '@/hooks/useSmoothTime'
import type { LyricsResult } from '@/types'

const MODES: { id: LyricsMode; label: string }[] = [
  { id: 'synced', label: 'Sincronizada' },
  { id: 'karaoke', label: 'Karaokê' },
  { id: 'edit', label: 'Edit' }
]

export function LyricsOverlay(): JSX.Element {
  const open = useUiStore((s) => s.lyricsOpen)
  const toggle = useUiStore((s) => s.toggleLyrics)
  const mode = useUiStore((s) => s.lyricsMode)
  const setMode = useUiStore((s) => s.setLyricsMode)
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LyricsResult | null>(null)

  const fetchLyrics = (force: boolean): (() => void) => {
    if (!song || !open) return () => {}
    let cancelled = false
    setLoading(true)
    api.lyrics.resolve(song.id, force).then((raw) => {
      if (cancelled) return
      setResult(raw as LyricsResult | null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => fetchLyrics(false), [song?.id, open])

  const lines = useMemo(
    () => (result?.synced ? parseLrc(result.synced) : null),
    [result?.synced]
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="glass absolute inset-3 bottom-[112px] z-30 flex flex-col rounded-2xl p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{song?.title ?? 'Letras'}</h2>
              <p className="truncate text-xs text-muted">
                {song?.artist ?? ''}
                {result && <span className="ml-2 opacity-70">· fonte: {result.source}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLyrics(true)}
                disabled={loading}
                className="text-muted transition-colors hover:text-ink disabled:opacity-40"
                title="Buscar letra novamente online"
                aria-label="Buscar letra novamente"
              >
                <RotateCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <div className="flex rounded-full bg-[var(--bg-raised)] p-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      mode === m.id ? 'bg-[var(--accent)] text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button onClick={toggle} className="text-muted hover:text-ink" aria-label="Fechar letras">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {loading && (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
                <Loader2 size={16} className="animate-spin" /> Procurando letra…
              </div>
            )}

            {!loading && !result && <NoLyrics />}

            {!loading && result && !lines && result.plain && (
              <PlainLyrics text={result.plain} needsSync={mode !== 'synced'} />
            )}

            {!loading && lines && mode === 'synced' && <SyncedView lines={lines} />}
            {!loading && lines && mode === 'karaoke' && <KaraokeView lines={lines} />}
            {!loading && lines && mode === 'edit' && (
              <EditView lines={lines} cover={mediaUrl(song?.coverPath ?? null)} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function NoLyrics(): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <MicVocal size={28} className="text-muted" />
      <p className="text-sm text-muted">
        Nenhuma letra encontrada — nem local, nem nos provedores online.
        <br />
        Você também pode colocar um arquivo <code className="text-ink">.lrc</code> ao lado da música.
      </p>
    </div>
  )
}

function PlainLyrics({ text, needsSync }: { text: string; needsSync: boolean }): JSX.Element {
  return (
    <div className="h-full overflow-y-auto pr-2">
      {needsSync && (
        <p className="mb-4 rounded-xl bg-[var(--bg-raised)] px-4 py-2 text-xs text-muted">
          Esta letra não tem marcações de tempo, então Karaokê e Edit não podem sincronizar.
          Exibindo em modo estático.
        </p>
      )}
      <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-muted">{text}</pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mode 1: classic synced list (click-to-seek, auto-scroll)
// ---------------------------------------------------------------------------

function SyncedView({ lines }: { lines: LrcLine[] }): JSX.Element {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const seek = usePlayerStore((s) => s.seek)
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const active = activeLineIndex(lines, currentTime)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  return (
    <div className="h-full overflow-y-auto pr-2">
      {lines.map((line, i) => (
        <button
          key={`${line.time}-${i}`}
          ref={i === active ? activeRef : undefined}
          onClick={() => seek(line.time)}
          className={`block w-full py-1.5 text-left text-lg transition-all ${
            i === active ? 'font-semibold text-[var(--accent)]' : 'text-muted hover:text-ink'
          }`}
        >
          {line.text}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mode 2: karaoke — the active line is painted as it's sung
// ---------------------------------------------------------------------------

function KaraokeView({ lines }: { lines: LrcLine[] }): JSX.Element {
  const time = useSmoothTime()
  const seek = usePlayerStore((s) => s.seek)
  const active = activeLineIndex(lines, time)
  const progress = active >= 0 ? lineProgress(lines, active, time) : 0

  const prev = lines[active - 1]
  const line = lines[active]
  const next = lines[active + 1]
  const after = lines[active + 2]

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <Ghost line={prev} onSeek={seek} />
      {line ? (
        <p
          className="max-w-3xl text-3xl font-bold leading-snug"
          style={{
            backgroundImage: `linear-gradient(90deg, var(--accent) ${progress * 100}%, var(--text-muted) ${progress * 100}%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent'
          }}
        >
          {line.text}
        </p>
      ) : (
        <p className="text-2xl text-muted">…</p>
      )}
      <Ghost line={next} onSeek={seek} />
      <Ghost line={after} onSeek={seek} dimmer />
    </div>
  )
}

function Ghost({
  line,
  onSeek,
  dimmer
}: {
  line?: LrcLine
  onSeek: (t: number) => void
  dimmer?: boolean
}): JSX.Element | null {
  if (!line) return null
  return (
    <button
      onClick={() => onSeek(line.time)}
      className={`max-w-2xl text-lg text-muted transition-colors hover:text-ink ${
        dimmer ? 'opacity-40' : 'opacity-70'
      }`}
    >
      {line.text}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Mode 3: Edit — calm TikTok-edit ambience.
// Reference: black room, glowing serif phrase on the left drifting in slow
// waves, a translucent CD on the right spinning gently, everything washed
// by a soft glow in the album's accent color.
// ---------------------------------------------------------------------------

/** Transition (exit+enter) lasts ~0.6s, so we look ahead by that amount:
 *  the phrase finishes materializing right when the singer starts it. */
function EditView({ lines, cover }: { lines: LrcLine[]; cover?: string }): JSX.Element {
  const time = useSmoothTime()
  // Follow the song's real time — no fixed lookahead (that made some songs
  // feel ahead and others behind depending on their tempo).
  const active = activeLineIndex(lines, time)
  const line = lines[active]

  return (
    <div className="relative h-full overflow-hidden">
      {/* Ambient washes: accent behind the disc, faint white behind the text */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(38% 55% at 72% 50%, var(--accent-soft), transparent 70%),' +
            'radial-gradient(30% 42% at 24% 52%, rgb(255 255 255 / 0.05), transparent 70%)'
        }}
      />

      <div className="relative flex h-full items-center justify-center gap-20 px-12">
        {/* Drifting phrase (left, like the reference) */}
        <div className="lyric-wave flex w-[26rem] flex-col items-end gap-3 text-right">
          <AnimatePresence mode="wait">
            <motion.p
              key={active}
              initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, filter: 'blur(6px)', transition: { duration: 0.22 } }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="font-lyrics text-lyrics-glow text-4xl leading-snug"
            >
              {line?.text ?? '♪'}
            </motion.p>
          </AnimatePresence>
          <p className="font-lyrics max-w-sm text-base italic text-white/25 transition-opacity duration-700">
            {lines[active + 1]?.text ?? ''}
          </p>
        </div>

        {/* Translucent CD — rotation is driven by playback time (≈6 rpm),
            so it's identical on every platform and can't run away. */}
        <div className="gentle-float relative shrink-0">
          <div
            className="relative grid h-72 w-72 place-items-center overflow-hidden rounded-full"
            style={{
              transform: `rotate(${(time * 36) % 360}deg)`,
              boxShadow:
                '0 24px 80px rgb(0 0 0 / 0.65), 0 0 0 1px rgb(255 255 255 / 0.10), inset 0 0 60px rgb(0 0 0 / 0.45)'
            }}
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-90"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-[#111]">
                <Music2 size={32} className="text-muted" />
              </div>
            )}
            {/* Light sheen sweeping the disc surface */}
            <div className="cd-sheen absolute inset-0 rounded-full" />
            {/* Fine radial grooves */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'repeating-radial-gradient(circle, transparent 0 5px, rgb(0 0 0 / 0.07) 5px 6px)'
              }}
            />
            {/* Spindle: transparent hub + hole */}
            <div className="absolute grid h-24 w-24 place-items-center rounded-full border border-white/25 bg-black/35 backdrop-blur-sm">
              <div className="h-8 w-8 rounded-full border border-white/30 bg-black/80" />
            </div>
          </div>
          {/* Accent halo */}
          <div
            aria-hidden
            className="absolute -inset-8 -z-10 rounded-full blur-3xl"
            style={{ background: 'var(--accent-soft)' }}
          />
        </div>
      </div>
    </div>
  )
}
