import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, X } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { getEngine } from '@/services/audioEngine'
import { MicInput } from '@/services/mic'
import { useSmoothTime } from '@/hooks/useSmoothTime'
import { activeLineIndex, type LrcLine } from '@/utils/lrc'
import { detectPitch, noteName, pitchClassDistance } from '@/utils/pitch'
import { t, tk } from '@/i18n'

/**
 * Karaokê — sing over the song.
 *
 *  • the voice can be cut out of the mix (centre-channel cancellation, see
 *    audioEngine.ts), with an intensity; mono tracks are detected, since
 *    they have no sides to keep and would lose everything but the bass
 *  • lyrics are painted word by word with a bouncing ball, using the LRC's
 *    word timestamps when present and an estimate from word lengths otherwise;
 *    the listener can nudge a song's lyrics by ±0.1 s (saved per song).
 *    A countdown announces each verse after a pause
 *  • with the microphone on, every 100 ms of a verse compares the note being
 *    sung with the note of the original voice (octave doesn't matter), and
 *    the song ends with a grade
 */

interface Prefs {
  cut: boolean
  amount: number
}
const PREFS_KEY = 'harmony.karaoke'

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
    return {
      cut: typeof p.cut === 'boolean' ? p.cut : true,
      amount: typeof p.amount === 'number' ? Math.min(1, Math.max(0.3, p.amount)) : 0.9
    }
  } catch {
    return { cut: true, amount: 0.9 }
  }
}

// ---------------------------------------------------------------------------
// Word timing
// ---------------------------------------------------------------------------

interface TimedWord {
  text: string
  start: number
  end: number
}

/** When each word of a line is sung, and when the line is over. */
export function timeWords(lines: LrcLine[], index: number): { words: TimedWord[]; end: number } {
  const line = lines[index]
  const next = lines[index + 1]?.time ?? line.time + 6
  const gap = Math.max(0.5, next - line.time)
  if (line.words?.length) {
    const words = line.words.map((w, k) => ({
      text: w.text,
      start: w.time,
      end: line.words![k + 1]?.time ?? Math.min(next, w.time + 1.2)
    }))
    return { words, end: words[words.length - 1].end }
  }
  // no word timestamps: spread the line over a singing time that grows with
  // its length, weighting each word by its size
  const parts = line.text.split(/\s+/).filter(Boolean)
  const chars = parts.reduce((a, w) => a + w.length, 0)
  const sing = Math.min(gap * 0.9, Math.max(1.2, chars * 0.085 + 0.4))
  const weights = parts.map((w) => w.length + 1.5)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let at = line.time
  const words = parts.map((text, k) => {
    const d = (sing * weights[k]) / total
    const w = { text, start: at, end: at + d }
    at += d
    return w
  })
  return { words, end: line.time + sing }
}

/** Lines moved by `d` seconds (the manual nudge when the voice isn't used). */
function shiftLines(lines: LrcLine[], d: number): LrcLine[] {
  if (!d) return lines
  return lines.map((l) => ({
    ...l,
    time: l.time + d,
    words: l.words?.map((w) => ({ ...w, time: w.time + d }))
  }))
}

// v2: nudges saved while an automatic voice sync was being tried were relative
// to its own shift, so they are dropped rather than applied to the plain LRC
const OFFSETS_KEY = 'harmony.karaoke.offsets.v2'

/** False for "♪"-style lines that only mark an instrumental part. */
function isSung(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

function loadOffset(songId: number | undefined): number {
  if (songId === undefined) return 0
  try {
    const all = JSON.parse(localStorage.getItem(OFFSETS_KEY) ?? '{}') as Record<string, number>
    return typeof all[songId] === 'number' ? all[songId] : 0
  } catch {
    return 0
  }
}

function saveOffset(songId: number, v: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(OFFSETS_KEY) ?? '{}') as Record<string, number>
    if (v) all[songId] = v
    else delete all[songId]
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface Score {
  /** 100 ms ticks of a verse where the original voice had a clear note */
  melody: number
  /** …of which the user was singing */
  voiced: number
  /** …and on the same note (±1 semitone, any octave) */
  inTune: number
}

const EMPTY: Score = { melody: 0, voiced: 0, inTune: 0 }

function gradeOf(s: Score): { grade: string; tune: number; presence: number; total: number } {
  const tune = s.melody ? s.inTune / s.melody : 0
  const presence = s.melody ? s.voiced / s.melody : 0
  const total = 0.7 * tune + 0.3 * presence
  const grade = total >= 0.8 ? 'S' : total >= 0.65 ? 'A' : total >= 0.5 ? 'B' : total >= 0.35 ? 'C' : 'D'
  return { grade, tune, presence, total }
}

const GRADE_LINE: Record<string, string> = {
  S: tk('Lenda do palco! 🌟'),
  A: tk('Mandou muito bem! 🎉'),
  B: tk('Boa! Tá afinando 🎶'),
  C: tk('Valeu a coragem! 💪'),
  D: tk('O importante é se divertir 😄')
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function KaraokeView({ lines }: { lines: LrcLine[] }): JSX.Element {
  const time = useSmoothTime()
  const seek = usePlayerStore((s) => s.seek)
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [mono, setMono] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [live, setLive] = useState<{ you: number; song: number; level: number }>({ you: 0, song: 0, level: 0 })
  const [score, setScore] = useState<Score>(EMPTY)
  const [result, setResult] = useState<{ title: string; grade: string; tune: number; presence: number } | null>(null)

  const update = (patch: Partial<Prefs>): void => {
    setPrefs((p) => {
      const next = { ...p, ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  // the vocal cut follows the switch; leaving karaoke always restores the song
  useEffect(() => {
    getEngine().setKaraoke(true, prefs.cut && !mono ? prefs.amount : 0)
  }, [prefs.cut, prefs.amount, mono])
  useEffect(() => () => getEngine().setKaraoke(false), [])

  // mono check: a few seconds of playback per song, comparing sides to centre
  useEffect(() => {
    setMono(false)
    if (!song) return
    let mid = 0
    let side = 0
    let n = 0
    const t = window.setInterval(() => {
      if (!usePlayerStore.getState().isPlaying) return
      const l = getEngine().getStereoLevels()
      if (l.mid < 0.003) return // silence (intro) tells nothing
      mid += l.mid
      side += l.side
      if (++n >= 12) {
        window.clearInterval(t)
        setMono(side / mid < 0.04)
      }
    }, 250)
    return () => window.clearInterval(t)
  }, [song?.id])

  // the listener's nudge for this song, applied to the whole LRC
  const [manual, setManual] = useState(() => loadOffset(song?.id))
  useEffect(() => setManual(loadOffset(song?.id)), [song?.id])
  const view = useMemo(() => shiftLines(lines, manual), [lines, manual])
  const nudge = (d: number): void => {
    if (!song) return
    setManual((v) => {
      const next = Math.round((v + d) * 10) / 10
      saveOffset(song.id, next)
      return next
    })
  }

  // the timed words of the current line (for painting and for scoring)
  const active = activeLineIndex(view, time)
  const timed = active >= 0 ? timeWords(view, active) : null
  const live$ = useRef({ active, timed, time })
  live$.current = { active, timed, time }

  // microphone + scoring
  const scoreRef = useRef<Score>({ ...EMPTY })
  const songRef = useRef<{ id: number | null; title: string }>({ id: null, title: '' })
  useEffect(() => {
    if (!micOn) return
    let mic: MicInput | null = null
    let alive = true
    let timer = 0
    let buf: Float32Array<ArrayBuffer> | null = null
    MicInput.open()
      .then((m) => {
        if (!alive) return m.close()
        mic = m
        setMicError(null)
        timer = window.setInterval(() => {
          if (!mic || !usePlayerStore.getState().isPlaying) return
          const you = mic.read()
          const an = getEngine().getVocalAnalyser()
          let songHz = 0
          if (an) {
            if (!buf || buf.length !== an.fftSize) buf = new Float32Array(an.fftSize)
            an.getFloatTimeDomainData(buf)
            songHz = detectPitch(buf, getEngine().getSampleRate(), { minHz: 90, maxHz: 900, clarity: 0.75, gate: 0.008 })
          }
          setLive({ you: you.pitch, song: songHz, level: you.level })
          // only verses count, and only where the original voice has a note
          const { timed: tw, time: now } = live$.current
          const inVerse = tw && now >= (tw.words[0]?.start ?? Infinity) && now <= tw.end + 0.3
          if (!inVerse || !songHz) return
          const s = scoreRef.current
          s.melody++
          if (you.pitch) {
            s.voiced++
            if (pitchClassDistance(you.pitch, songHz) <= 1) s.inTune++
          }
          if (s.melody % 5 === 0) setScore({ ...s })
        }, 100)
      })
      .catch(() => {
        if (!alive) return
        setMicError(t('Não consegui acessar o microfone.'))
        setMicOn(false)
      })
    return () => {
      alive = false
      window.clearInterval(timer)
      mic?.close()
    }
  }, [micOn])

  // a song that ends with enough singing gets its grade
  useEffect(() => {
    const prev = songRef.current
    const s = scoreRef.current
    if (prev.id !== null && prev.id !== song?.id && micOn && s.melody >= 60) {
      const g = gradeOf(s)
      setResult({ title: prev.title, grade: g.grade, tune: g.tune, presence: g.presence })
    }
    songRef.current = { id: song?.id ?? null, title: song?.title ?? '' }
    scoreRef.current = { ...EMPTY }
    setScore({ ...EMPTY })
  }, [song?.id])

  // ---- layout: the bouncing ball follows the word being sung ---------------
  const lineRef = useRef<HTMLDivElement | null>(null)
  const ballRef = useRef<HTMLSpanElement | null>(null)
  useLayoutEffect(() => {
    const box = lineRef.current
    const ball = ballRef.current
    if (!box || !ball || !timed) {
      if (ball) ball.style.opacity = '0'
      return
    }
    const spans = box.querySelectorAll<HTMLSpanElement>('[data-w]')
    const ws = timed.words
    const k = ws.findIndex((w) => time < w.end)
    if (k < 0 || time > timed.end + 0.4 || time < ws[0].start - 0.6) {
      ball.style.opacity = '0'
      return
    }
    const el = spans[k]
    if (!el) return
    // before a word starts the ball hops in from the previous one
    const p = Math.max(0, Math.min(1, (time - ws[k].start) / Math.max(0.05, ws[k].end - ws[k].start)))
    const prevEl = spans[k - 1]
    const cx = (e: HTMLElement): number => e.offsetLeft + e.offsetWidth / 2
    const x0 = prevEl ? cx(prevEl) : cx(el)
    const x = time < ws[k].start ? x0 : x0 + (cx(el) - x0) * Math.min(1, p * 2.2)
    const y = el.offsetTop - 22 - Math.sin(Math.min(1, p) * Math.PI) * 16
    ball.style.opacity = '1'
    ball.style.transform = `translate(${x - 7}px, ${y}px)`
  })

  const prev = view[active - 1]
  const line = view[active]
  const next = view[active + 1]
  const after = view[active + 2]

  // countdown into a verse after a pause (or into the first one)
  const until = next ? next.time - time : Infinity
  const restFrom = timed ? timed.end : -Infinity
  const countdown = until > 0 && until <= 3 && next.time - restFrom >= 4 ? Math.ceil(until) : 0

  const g = gradeOf(score)

  return (
    <div className="relative flex h-full flex-col">
      {/* controls */}
      <div className="mx-auto mb-2 flex flex-wrap items-center justify-center gap-2 text-xs">
        <button
          onClick={() => update({ cut: !prefs.cut })}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
            prefs.cut ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
          }`}
          title={t('Tira a voz original da música')}
        >
          🎤 {prefs.cut ? t('Sem a voz original') : t('Com a voz original')}
        </button>
        {prefs.cut && !mono && (
          <label className="flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-muted">
            {t('Intensidade')}
            <input
              type="range"
              min={30}
              max={100}
              value={Math.round(prefs.amount * 100)}
              onChange={(e) => update({ amount: Number(e.target.value) / 100 })}
              className="w-24 accent-[var(--accent)]"
            />
          </label>
        )}
        <button
          onClick={() => {
            setMicError(null)
            setMicOn((v) => !v)
          }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
            micOn ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
          }`}
          title={t('Cante no microfone e ganhe uma nota')}
        >
          {micOn ? <Mic size={13} /> : <MicOff size={13} />} {micOn ? t('Pontuando') : t('Cantar valendo nota')}
        </button>
        {micOn && (
          <span className="flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-3 py-1.5 tabular-nums text-muted">
            <span className="relative h-2 w-10 overflow-hidden rounded-full bg-white/10">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-100"
                style={{ width: `${Math.min(100, live.level * 600)}%` }}
              />
            </span>
            {t('Você:')} <b className="text-ink">{live.you ? noteName(live.you) : '—'}</b>
            {t('· Música:')} <b className="text-ink">{live.song ? noteName(live.song) : '—'}</b>
            {live.you > 0 && live.song > 0 && (
              <span className={pitchClassDistance(live.you, live.song) <= 1 ? 'text-emerald-400' : 'text-amber-300'}>
                {pitchClassDistance(live.you, live.song) <= 1 ? '✓' : '~'}
              </span>
            )}
            {score.melody >= 20 && <span className="ml-1 font-semibold text-ink">{Math.round(g.tune * 100)}%</span>}
          </span>
        )}
      </div>
      <div className="mx-auto mb-2 flex items-center gap-1 rounded-full bg-[var(--bg-raised)] px-1 py-0.5 text-[11px] text-muted">
        <span className="px-2">{t('Ajuste da letra')}</span>
        <button onClick={() => nudge(-0.1)} className="rounded-full px-2 py-0.5 hover:bg-white/10 hover:text-ink" aria-label={t('Letra mais cedo')} title={t('Letra mais cedo (−0,1s)')}>
          −
        </button>
        <span className="w-10 text-center tabular-nums" title={t('Seu ajuste nesta música')}>
          {manual > 0 ? '+' : ''}
          {manual.toFixed(1).replace('.', ',')}s
        </span>
        <button onClick={() => nudge(0.1)} className="rounded-full px-2 py-0.5 hover:bg-white/10 hover:text-ink" aria-label={t('Letra mais tarde')} title={t('Letra mais tarde (+0,1s)')}>
          +
        </button>
      </div>
      {(mono || micError) && (
        <p className="mb-1 text-center text-[11px] text-amber-300">
          {micError ?? t('Esta faixa é mono: a voz não pode ser separada, então ela toca normalmente.')}
        </p>
      )}

      {/* lyrics */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
        <Ghost line={prev} onSeek={seek} />
        <div className="relative flex min-h-[4.5rem] items-center justify-center">
          {countdown > 0 && (
            <div className="absolute -top-8 left-1/2 flex -translate-x-1/2 gap-2" aria-hidden>
              {[3, 2, 1].map((d) => (
                <span
                  key={d}
                  className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                    countdown >= d ? 'scale-100 bg-[var(--accent)]' : 'scale-50 bg-white/10'
                  }`}
                />
              ))}
            </div>
          )}
          {line && timed && timed.words.length > 0 && isSung(line.text) ? (
            <div ref={lineRef} className="relative max-w-3xl text-3xl font-bold leading-snug">
              <span
                ref={ballRef}
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 h-3.5 w-3.5 rounded-full bg-[var(--accent)] opacity-0 shadow-[0_0_14px_var(--accent)]"
              />
              {timed.words.map((w, k) => {
                const p = Math.max(0, Math.min(1, (time - w.start) / Math.max(0.05, w.end - w.start)))
                return (
                  <span key={k} data-w>
                    <span
                      style={{
                        backgroundImage: `linear-gradient(90deg, var(--accent) ${p * 100}%, var(--text-muted) ${p * 100}%)`,
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent'
                      }}
                    >
                      {w.text}
                    </span>{' '}
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="text-2xl text-muted">{next ? '♪ ♪ ♪' : '…'}</p>
          )}
        </div>
        <Ghost line={next} onSeek={seek} />
        <Ghost line={after} onSeek={seek} dimmer />
      </div>

      {!isPlaying && micOn && (
        <p className="pb-1 text-center text-[11px] text-muted">{t('Dê play para começar a pontuar.')}</p>
      )}

      {result && (
        <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/60 backdrop-blur-sm">
          <div className="glass fade-rise relative w-[min(90%,340px)] rounded-3xl p-6 text-center">
            <button
              onClick={() => setResult(null)}
              className="absolute right-3 top-3 rounded-full p-1 text-muted hover:bg-white/10 hover:text-ink"
              aria-label={t('Fechar')}
            >
              <X size={15} />
            </button>
            <p className="text-xs uppercase tracking-widest text-muted">{t('Sua nota em')}</p>
            <p className="truncate text-sm font-semibold">{result.title}</p>
            <p className="seal-pop my-3 text-7xl font-black text-[var(--accent)]">{result.grade}</p>
            <p className="font-semibold">{t(GRADE_LINE[result.grade])}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-lg font-bold tabular-nums">{Math.round(result.tune * 100)}%</p>
                <p className="text-muted">{t('afinação')}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-lg font-bold tabular-nums">{Math.round(result.presence * 100)}%</p>
                <p className="text-muted">{t('cantando junto')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Ghost({
  line,
  onSeek,
  dimmer
}: {
  line?: { time: number; text: string }
  onSeek: (t: number) => void
  dimmer?: boolean
}): JSX.Element | null {
  if (!line) return null
  return (
    <button
      onClick={() => onSeek(line.time)}
      className={`max-w-2xl text-lg text-muted transition-colors hover:text-ink ${dimmer ? 'opacity-40' : 'opacity-70'}`}
    >
      {line.text}
    </button>
  )
}
