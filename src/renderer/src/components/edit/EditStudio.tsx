import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { usePlayerStore } from '@/store/playerStore'
import { getEngine } from '@/services/audioEngine'
import { getDirector } from '@/services/stageDirector'
import { api } from '@/services/api'
import { readAccent } from '@/utils/color'
import { activeLineIndex, type LrcLine } from '@/utils/lrc'
import { createEditState, drawEdit, EDIT_H, EDIT_W, type EditInput, type EditLook } from './editRenderer'

/**
 * Edit mode: a vertical 9:16 lyric edit ready to post (TikTok / Reels /
 * Shorts). The preview canvas IS the video: exporting records that canvas
 * at full 1080x1920 together with the music, in real time, from the current
 * lyric line for the chosen length.
 */

const LOOKS: { id: EditLook; label: string }[] = [
  { id: 'glow', label: 'Glow' },
  { id: 'bold', label: 'Bold' },
  { id: 'minimal', label: 'Minimal' }
]
const LENGTHS = [15, 30, 60]
const PREVIEW_SCALE = 0.5
// H.264 + AAC MP4 first (what every app accepts), then WebM (TikTok, Reels and
// Shorts all take it), and a bare MP4 last since it may carry VP9.
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,opus',
  'video/mp4'
]

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of MIME_CANDIDATES) if (MediaRecorder.isTypeSupported(m)) return m
  return null
}

function loadPref<T extends string | number>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const raw = localStorage.getItem(key)
    const v = (typeof fallback === 'number' ? Number(raw) : raw) as T
    return allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

function savePref(key: string, v: string | number): void {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    /* ignore */
  }
}

function parseAccent(v: string): [number, number, number] {
  const m = v.match(/(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  const h = v.match(/^#?([0-9a-f]{6})$/i)
  if (h) {
    const n = parseInt(h[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return [124, 108, 244]
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Recording {
  rec: MediaRecorder
  video: MediaStream
  start: number
  end: number
  songId: number | null
  ext: string
  cancelled: boolean
  lastTime: number
}

type Status =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'recording'; progress: number }
  | { kind: 'saving' }
  | { kind: 'done'; path: string }
  | { kind: 'error'; message: string }

export function EditStudio({
  lines,
  cover,
  title,
  artist
}: {
  lines: LrcLine[]
  cover?: string
  title: string
  artist: string
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [look, setLook] = useState<EditLook>(() => loadPref('harmony.edit.look', 'glow', ['glow', 'bold', 'minimal']))
  const [length, setLength] = useState<number>(() => loadPref('harmony.edit.length', 15, LENGTHS))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [startAt, setStartAt] = useState(0)

  // everything the frame loop reads lives in refs (no re-render per frame)
  const live = useRef({ lines, look, title, artist })
  live.current = { lines, look, title, artist }
  const coverImg = useRef<HTMLImageElement | null>(null)
  const recording = useRef<Recording | null>(null)
  const scaleRef = useRef(PREVIEW_SCALE)

  // cover image (CORS-clean so the canvas can be recorded)
  useEffect(() => {
    coverImg.current = null
    if (!cover) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      coverImg.current = img
    }
    img.src = cover
  }, [cover])

  // frame loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const S = createEditState()
    const engine = getEngine()
    const director = getDirector()
    let raf = 0
    let accentStr = ''
    let accent: [number, number, number] = [124, 108, 244]
    let lastStartShown = -1
    let lastProgress = -1

    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const ps = usePlayerStore.getState()
      const song = ps.queue[ps.currentIndex] ?? null
      const duration = song?.duration ?? 0
      const time = engine.getCurrentTime()
      const F = director.update(ps.isPlaying, duration > 0 ? time / duration : 0, song?.id ?? null)
      const a = readAccent()
      if (a !== accentStr) {
        accentStr = a
        accent = parseAccent(a)
      }
      const L = live.current
      const active = activeLineIndex(L.lines, time)
      const input: EditInput = {
        time,
        duration,
        lines: L.lines,
        active,
        cover: coverImg.current,
        title: L.title,
        artist: L.artist,
        look: L.look,
        accent,
        F
      }
      const scale = scaleRef.current
      const w = Math.round(EDIT_W * scale)
      const h = Math.round(EDIT_H * scale)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      drawEdit(ctx, S, input, scale)

      const R = recording.current
      if (R) {
        const sameSong = (song?.id ?? null) === R.songId
        const done = (sameSong && time >= R.end - 0.02) || !sameSong || !ps.isPlaying
        if (done) {
          // paused or skipped well before the end: drop it. The track ending
          // (or crossfading out) right at the end of the clip still counts.
          if (!(sameSong && time >= R.end - 0.02) && R.lastTime < R.end - 1.5) R.cancelled = true
          if (R.rec.state !== 'inactive') R.rec.stop()
          recording.current = null
        } else {
          R.lastTime = time
          const p = Math.round(Math.max(0, Math.min(1, (time - R.start) / (R.end - R.start))) * 100) / 100
          if (p !== lastProgress) {
            lastProgress = p
            setStatus({ kind: 'recording', progress: p })
          }
        }
      } else {
        // where an export would start: the current line (rounded to keep renders rare)
        const s = Math.max(0, Math.floor(((L.lines[active]?.time ?? time) - 0.25) * 2) / 2)
        if (s !== lastStartShown) {
          lastStartShown = s
          setStartAt(s)
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // leaving Edit mode mid-export cancels it
  useEffect(
    () => () => {
      const R = recording.current
      if (R) {
        R.cancelled = true
        if (R.rec.state !== 'inactive') R.rec.stop()
        recording.current = null
      }
    },
    []
  )

  const busy = status.kind === 'preparing' || status.kind === 'recording' || status.kind === 'saving'

  const startExport = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (!canvas || busy) return
    const mime = pickMime()
    if (!mime) {
      setStatus({ kind: 'error', message: 'Este computador não consegue gravar vídeo.' })
      return
    }
    const ps = usePlayerStore.getState()
    const song = ps.queue[ps.currentIndex]
    if (!song) return
    const engine = getEngine()
    const start = startAt
    const end = Math.min(song.duration || start + length, start + length)
    setStatus({ kind: 'preparing' })

    // full resolution, frames even if the window loses focus
    scaleRef.current = 1
    api.edit.setBackgroundThrottling(false)
    ps.seek(start)
    if (!ps.isPlaying) ps.togglePlay()
    // wait for the seek to land and the audio to run
    const t0 = performance.now()
    while (performance.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 60))
      const t = engine.getCurrentTime()
      if (Math.abs(t - start) < 0.4 && usePlayerStore.getState().isPlaying) break
    }

    const video = canvas.captureStream(30)
    const stream = new MediaStream([...video.getVideoTracks(), ...engine.getRecordStream().getAudioTracks()])
    const chunks: Blob[] = []
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 })
    } catch {
      video.getTracks().forEach((tr) => tr.stop())
      scaleRef.current = PREVIEW_SCALE
      api.edit.setBackgroundThrottling(true)
      setStatus({ kind: 'error', message: 'Não foi possível iniciar a gravação.' })
      return
    }
    const R: Recording = {
      rec,
      video,
      start: engine.getCurrentTime(),
      end,
      songId: song.id,
      ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm',
      cancelled: false,
      lastTime: 0
    }
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = async () => {
      R.video.getTracks().forEach((tr) => tr.stop())
      scaleRef.current = PREVIEW_SCALE
      api.edit.setBackgroundThrottling(true)
      if (R.cancelled || chunks.length === 0) {
        setStatus({ kind: 'idle' })
        return
      }
      setStatus({ kind: 'saving' })
      try {
        const blob = new Blob(chunks, { type: mime.split(';')[0] })
        const path = await api.edit.save(await blob.arrayBuffer(), `${song.artist ?? 'Harmony'} - ${song.title} (edit)`, R.ext)
        setStatus(path ? { kind: 'done', path } : { kind: 'idle' })
      } catch {
        setStatus({ kind: 'error', message: 'Não foi possível salvar o vídeo.' })
      }
    }
    rec.start(1000)
    recording.current = R
    setStatus({ kind: 'recording', progress: 0 })
  }

  const cancelExport = (): void => {
    const R = recording.current
    if (!R) return
    R.cancelled = true
    if (R.rec.state !== 'inactive') R.rec.stop()
    recording.current = null
  }

  return (
    <div className="flex h-full min-h-0 items-stretch justify-center gap-8">
      <div className="relative flex min-h-0 items-center justify-center">
        <canvas
          ref={canvasRef}
          className="h-full max-h-full rounded-2xl shadow-[0_30px_90px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
          style={{ aspectRatio: `${EDIT_W} / ${EDIT_H}` }}
        />
        {status.kind === 'recording' && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
            <span className="h-2 w-2 rounded-full bg-red-500" /> REC
          </div>
        )}
      </div>

      <aside className="flex w-60 shrink-0 flex-col gap-5 py-2 text-sm">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Estilo da letra</p>
          <div className="flex flex-wrap gap-1.5">
            {LOOKS.map((l) => (
              <button
                key={l.id}
                disabled={busy}
                onClick={() => {
                  setLook(l.id)
                  savePref('harmony.edit.look', l.id)
                }}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                  look === l.id ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-muted hover:text-ink'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Duração</p>
          <div className="flex gap-1.5">
            {LENGTHS.map((n) => (
              <button
                key={n}
                disabled={busy}
                onClick={() => {
                  setLength(n)
                  savePref('harmony.edit.length', n)
                }}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                  length === n ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-muted hover:text-ink'
                }`}
              >
                {n}s
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Trecho: {fmt(startAt)} → {fmt(startAt + length)}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted/70">
            Começa na frase atual. Use a barra de tempo para escolher outro trecho.
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          {status.kind === 'recording' || status.kind === 'preparing' ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full origin-left bg-[var(--accent)]"
                  style={{ transform: `scaleX(${status.kind === 'recording' ? status.progress : 0})` }}
                />
              </div>
              <p className="text-xs text-muted">
                {status.kind === 'preparing' ? 'Preparando…' : 'Gravando o edit em tempo real…'}
              </p>
              <button
                onClick={cancelExport}
                className="flex items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/15"
              >
                <X size={14} /> Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={startExport}
              disabled={status.kind === 'saving'}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
            >
              {status.kind === 'saving' ? <Spinner size={15} /> : <Download size={15} />}
              {status.kind === 'saving' ? 'Salvando…' : 'Exportar edit'}
            </button>
          )}
          {status.kind === 'done' && (
            <button
              onClick={() => api.edit.reveal(status.path)}
              className="flex items-center justify-center gap-2 text-xs text-muted hover:text-ink"
            >
              <FolderOpen size={13} /> Edit salvo · mostrar na pasta
            </button>
          )}
          {status.kind === 'error' && <p className="text-xs text-red-400">{status.message}</p>}
          <p className="text-[11px] leading-snug text-muted/70">
            Vídeo vertical 1080×1920 com o áudio da música, pronto para TikTok, Reels e Shorts.
          </p>
        </div>
      </aside>
    </div>
  )
}
