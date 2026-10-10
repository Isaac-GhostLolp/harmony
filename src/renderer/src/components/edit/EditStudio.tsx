import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { usePlayerStore } from '@/store/playerStore'
import { getEngine } from '@/services/audioEngine'
import { getDirector } from '@/services/stageDirector'
import { api } from '@/services/api'
import { readAccent } from '@/utils/color'
import { mediaUrl } from '@/utils/format'
import { activeLineIndex, type LrcLine } from '@/utils/lrc'
import {
  createEditState,
  drawEdit,
  DEFAULT_EDIT_OPTIONS,
  EDIT_W,
  FORMAT_H,
  type EditBg,
  type EditCenter,
  type EditFormat,
  type EditInput,
  type EditLook,
  type EditOptions,
  type EditTextSize
} from './editRenderer'
import { exportEdit, ExportCancelled } from './editExport'
import { t, tk } from '@/i18n'

/**
 * Edit mode: a lyric edit ready to post (TikTok / Reels / Shorts, or the
 * feed in 4:5 and 1:1). The preview is drawn by the same renderer as the
 * video; exporting renders the clip offline from the current lyric line for
 * the chosen length (see editExport.ts), so it never stutters.
 */

type Quality = '720' | '1080'

interface Prefs extends EditOptions {
  length: number
  quality: Quality
  /** 'theme', 'cover' or a #rrggbb swatch */
  color: string
}

const FORMATS: { id: EditFormat; label: string; hint: string }[] = [
  { id: '9:16', label: '9:16', hint: tk('TikTok, Reels, Shorts') },
  { id: '4:5', label: '4:5', hint: tk('Feed do Instagram') },
  { id: '1:1', label: '1:1', hint: tk('Quadrado') }
]
const LOOKS: { id: EditLook; label: string }[] = [
  { id: 'glow', label: tk('Glow') },
  { id: 'bold', label: tk('Bold') },
  { id: 'karaoke', label: tk('Karaokê') },
  { id: 'minimal', label: tk('Minimal') }
]
const SIZES: { id: EditTextSize; label: string }[] = [
  { id: 'sm', label: tk('P') },
  { id: 'md', label: tk('M') },
  { id: 'lg', label: tk('G') }
]
const CENTERS: { id: EditCenter; label: string }[] = [
  { id: 'cd', label: 'CD' },
  { id: 'vinyl', label: tk('Vinil') },
  { id: 'cover', label: tk('Capa') },
  { id: 'none', label: tk('Nenhum') }
]
const BGS: { id: EditBg; label: string }[] = [
  { id: 'cover', label: tk('Capa') },
  { id: 'gradient', label: tk('Gradiente') },
  { id: 'dark', label: tk('Escuro') }
]
const SWATCHES = ['#ff4d8d', '#a855f7', '#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#f5f5f5']
const EFFECTS: { id: 'beat' | 'dust' | 'grain' | 'header' | 'watermark'; label: string }[] = [
  { id: 'beat', label: tk('Batida') },
  { id: 'dust', label: tk('Poeira') },
  { id: 'grain', label: tk('Granulado') },
  { id: 'header', label: tk('Título') },
  { id: 'watermark', label: tk('Marca Harmony') }
]
const LENGTHS = [15, 30, 60]
const PREVIEW_SCALE = 0.5
const PREFS_KEY = 'harmony.edit.prefs'

function oneOf<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

function loadPrefs(): Prefs {
  const d: Prefs = { ...DEFAULT_EDIT_OPTIONS, length: 15, quality: '1080', color: 'theme' }
  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {}
    // earlier versions stored these two on their own
    if (raw.look === undefined) raw.look = localStorage.getItem('harmony.edit.look')
    if (raw.length === undefined) raw.length = Number(localStorage.getItem('harmony.edit.length'))
  } catch {
    /* defaults */
  }
  const bool = (v: unknown, f: boolean): boolean => (typeof v === 'boolean' ? v : f)
  return {
    format: oneOf(raw.format, FORMATS.map((f) => f.id), d.format),
    look: oneOf(raw.look, LOOKS.map((l) => l.id), d.look),
    bg: oneOf(raw.bg, BGS.map((b) => b.id), d.bg),
    center: oneOf(raw.center, CENTERS.map((c) => c.id), d.center),
    textSize: oneOf(raw.textSize, SIZES.map((s) => s.id), d.textSize),
    grain: bool(raw.grain, d.grain),
    dust: bool(raw.dust, d.dust),
    beat: bool(raw.beat, d.beat),
    header: bool(raw.header, d.header),
    watermark: bool(raw.watermark, d.watermark),
    length: oneOf(raw.length, LENGTHS, d.length),
    quality: oneOf(raw.quality, ['720', '1080'] as Quality[], d.quality),
    color:
      raw.color === 'theme' || raw.color === 'cover' || (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color))
        ? (raw.color as string)
        : d.color
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
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

/** The cover's most vivid colour (saturation-weighted average), brightened a little. */
function coverColor(img: HTMLImageElement): [number, number, number] | null {
  try {
    const c = document.createElement('canvas')
    c.width = 24
    c.height = 24
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, 24, 24)
    const d = g.getImageData(0, 0, 24, 24).data
    let r = 0
    let gr = 0
    let b = 0
    let wsum = 0
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2])
      const mn = Math.min(d[i], d[i + 1], d[i + 2])
      const sat = mx === 0 ? 0 : (mx - mn) / mx
      const w = sat * sat * (mx / 255) + 0.002
      r += d[i] * w
      gr += d[i + 1] * w
      b += d[i + 2] * w
      wsum += w
    }
    r /= wsum
    gr /= wsum
    b /= wsum
    const mx = Math.max(r, gr, b, 1)
    const k = Math.max(1, 200 / mx)
    return [Math.min(255, Math.round(r * k)), Math.min(255, Math.round(gr * k)), Math.min(255, Math.round(b * k))]
  } catch {
    return null
  }
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Status =
  | { kind: 'idle' }
  | { kind: 'rendering'; label: string; progress: number }
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
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [startAt, setStartAt] = useState(0)

  const update = (patch: Partial<Prefs>): void => {
    setPrefs((p) => {
      const next = { ...p, ...patch }
      savePrefs(next)
      return next
    })
  }

  // everything the frame loop reads lives in refs (no re-render per frame)
  const live = useRef({ lines, prefs, title, artist })
  live.current = { lines, prefs, title, artist }
  const coverImg = useRef<HTMLImageElement | null>(null)
  const coverRgb = useRef<[number, number, number] | null>(null)
  const cancelled = useRef(false)
  const exporting = useRef(false)
  // the accent the preview is using, so the export matches it exactly
  const accentRef = useRef<[number, number, number]>([124, 108, 244])

  // cover image (CORS-clean so the canvas can be read back into video frames)
  useEffect(() => {
    coverImg.current = null
    coverRgb.current = null
    if (!cover) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      coverImg.current = img
      coverRgb.current = coverColor(img)
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
    let themeAccent: [number, number, number] = [124, 108, 244]
    let swatchStr = ''
    let swatch: [number, number, number] = [124, 108, 244]
    let lastStartShown = -1

    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const ps = usePlayerStore.getState()
      const song = ps.queue[ps.currentIndex] ?? null
      const duration = song?.duration ?? 0
      const time = engine.getCurrentTime()
      const F = director.update(ps.isPlaying, duration > 0 ? time / duration : 0, song?.id ?? null)
      const L = live.current
      const P = L.prefs
      const active = activeLineIndex(L.lines, time)
      // the export has the machine to itself
      if (!exporting.current) {
        // where an export would start: the current line (rounded to keep renders rare)
        const s = Math.max(0, Math.floor(((L.lines[active]?.time ?? time) - 0.25) * 2) / 2)
        if (s !== lastStartShown) {
          lastStartShown = s
          setStartAt(s)
        }

        let accent: [number, number, number]
        if (P.color === 'cover' && coverRgb.current) accent = coverRgb.current
        else if (P.color.startsWith('#')) {
          if (P.color !== swatchStr) {
            swatchStr = P.color
            swatch = parseAccent(P.color)
          }
          accent = swatch
        } else {
          const a = readAccent()
          if (a !== accentStr) {
            accentStr = a
            themeAccent = parseAccent(a)
          }
          accent = themeAccent
        }
        accentRef.current = accent
        const input: EditInput = {
          time,
          duration,
          lines: L.lines,
          active,
          cover: coverImg.current,
          title: L.title,
          artist: L.artist,
          accent,
          F,
          opts: P
        }
        const scale = PREVIEW_SCALE
        const w = Math.round(EDIT_W * scale)
        const h = Math.round(FORMAT_H[P.format] * scale)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        drawEdit(ctx, S, input, scale)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // leaving Edit mode mid-export cancels it
  useEffect(
    () => () => {
      cancelled.current = true
    },
    []
  )

  const busy = status.kind === 'rendering' || status.kind === 'saving'

  const startExport = async (): Promise<void> => {
    if (busy) return
    const ps = usePlayerStore.getState()
    const song = ps.queue[ps.currentIndex]
    if (!song) return
    const { length, quality } = prefs
    const start = startAt
    const end = Math.min(song.duration || start + length, start + length)
    cancelled.current = false
    exporting.current = true
    setStatus({ kind: 'rendering', label: tk('Lendo a música…'), progress: 0 })
    // keep rendering at full speed if the window goes to the background
    api.edit.setBackgroundThrottling(false)
    try {
      const url = mediaUrl(song.path)
      if (!url) throw new Error('no-file')
      const audio = await (await fetch(url)).arrayBuffer()
      let shown = -1
      const result = await exportEdit({
        audio,
        eq: getEngine().getEqSnapshot(),
        start,
        end,
        duration: song.duration || end,
        lines: live.current.lines,
        cover: coverImg.current,
        title: live.current.title,
        artist: live.current.artist,
        accent: accentRef.current,
        opts: { ...live.current.prefs },
        quality,
        isCancelled: () => cancelled.current,
        onProgress: (phase, p) => {
          // audio reading is the first ~15%, frames the rest
          const total = phase === 'audio' ? p * 0.15 : phase === 'video' ? 0.15 + p * 0.85 : 1
          const r = Math.round(total * 100) / 100
          if (r === shown) return
          shown = r
          setStatus({
            kind: 'rendering',
            label: phase === 'audio' ? t('Lendo a música…') : phase === 'video' ? t('Gerando o vídeo…') : 'Finalizando…',
            progress: r
          })
        }
      })
      setStatus({ kind: 'saving' })
      const path = await api.edit.save(result.data, `${song.artist ?? 'Harmony'} - ${song.title} (edit)`, result.ext)
      setStatus(path ? { kind: 'done', path } : { kind: 'idle' })
    } catch (e) {
      if (e instanceof ExportCancelled) setStatus({ kind: 'idle' })
      else
        setStatus({
          kind: 'error',
          message:
            e instanceof Error && e.message === 'no-encoder'
              ? t('Este computador não consegue gerar vídeo.')
              : t('Não foi possível gerar o vídeo.')
        })
    } finally {
      exporting.current = false
      api.edit.setBackgroundThrottling(true)
    }
  }

  const cancelExport = (): void => {
    cancelled.current = true
  }

  const H = FORMAT_H[prefs.format]
  const outH = prefs.quality === '720' ? Math.round((H * 720) / EDIT_W) : H
  const outW = prefs.quality === '720' ? 720 : EDIT_W

  return (
    <div className="flex h-full min-h-0 items-stretch justify-center gap-6">
      <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${EDIT_W} / ${H}`, height: '100%' }}>
          <canvas
            ref={canvasRef}
            width={EDIT_W * PREVIEW_SCALE}
            height={H * PREVIEW_SCALE}
            className="h-full w-full rounded-2xl shadow-[0_30px_90px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
          />
          {status.kind === 'rendering' && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55">
              <div className="flex flex-col items-center gap-2 text-white">
                <Spinner size={22} />
                <span className="text-2xl font-semibold tabular-nums">{Math.round(status.progress * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-64 shrink-0 flex-col gap-4 py-1 text-sm">
        <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2">
          <Section title={t('Formato')}>
            {FORMATS.map((f) => (
              <Chip key={f.id} on={prefs.format === f.id} disabled={busy} title={t(f.hint ?? '')} onClick={() => update({ format: f.id })}>
                {t(f.label)}
              </Chip>
            ))}
          </Section>

          <Section title={t('Estilo da letra')}>
            {LOOKS.map((l) => (
              <Chip key={l.id} on={prefs.look === l.id} disabled={busy} onClick={() => update({ look: l.id })}>
                {t(l.label)}
              </Chip>
            ))}
          </Section>

          <Section title={t('Tamanho da letra')}>
            {SIZES.map((s) => (
              <Chip key={s.id} on={prefs.textSize === s.id} disabled={busy} onClick={() => update({ textSize: s.id })}>
                {t(s.label)}
              </Chip>
            ))}
          </Section>

          <Section title={t('Centro')}>
            {CENTERS.map((c) => (
              <Chip key={c.id} on={prefs.center === c.id} disabled={busy} onClick={() => update({ center: c.id })}>
                {t(c.label)}
              </Chip>
            ))}
          </Section>

          <Section title={t('Fundo')}>
            {BGS.map((b) => (
              <Chip key={b.id} on={prefs.bg === b.id} disabled={busy} onClick={() => update({ bg: b.id })}>
                {t(b.label)}
              </Chip>
            ))}
          </Section>

          <Section title={t('Cor')}>
            <Chip on={prefs.color === 'theme'} disabled={busy} onClick={() => update({ color: 'theme' })}>
              {t('Tema')}
            </Chip>
            <Chip on={prefs.color === 'cover'} disabled={busy} onClick={() => update({ color: 'cover' })}>
              {t('Da capa')}
            </Chip>
            <div className="flex w-full flex-wrap gap-1.5 pt-0.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  disabled={busy}
                  onClick={() => update({ color: c })}
                  aria-label={t('Cor {n}', { n: c })}
                  className={`h-6 w-6 rounded-full transition-transform hover:scale-110 disabled:opacity-50 ${
                    prefs.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#07070a]' : 'ring-1 ring-white/15'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Section>

          <Section title={t('Efeitos')}>
            {EFFECTS.map((e) => (
              <Chip key={e.id} on={prefs[e.id]} disabled={busy} onClick={() => update({ [e.id]: !prefs[e.id] })}>
                {t(e.label)}
              </Chip>
            ))}
          </Section>

          <Section title={t('Duração')}>
            {LENGTHS.map((n) => (
              <Chip key={n} on={prefs.length === n} disabled={busy} onClick={() => update({ length: n })}>
                {n}s
              </Chip>
            ))}
            <p className="w-full pt-1 text-xs text-muted">
              {t('Trecho:')} {fmt(startAt)} → {fmt(startAt + prefs.length)}
            </p>
            <p className="w-full text-[11px] leading-snug text-muted/70">
              {t('Começa na frase atual. Use a barra de tempo para escolher outro trecho.')}
            </p>
          </Section>

          <Section title={t('Qualidade')}>
            <Chip on={prefs.quality === '720'} disabled={busy} onClick={() => update({ quality: '720' })}>
              {t('720p · leve')}
            </Chip>
            <Chip on={prefs.quality === '1080'} disabled={busy} onClick={() => update({ quality: '1080' })}>
              1080p
            </Chip>
            <p className="w-full pt-1 text-[11px] leading-snug text-muted/70">
              {t('720p gera mais rápido em computadores mais simples. O vídeo sai liso nos dois.')}
            </p>
          </Section>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 pt-3">
          {status.kind === 'rendering' ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full origin-left bg-[var(--accent)]"
                  style={{ transform: `scaleX(${status.progress})` }}
                />
              </div>
              <p className="text-xs text-muted">{status.label}</p>
              <button
                onClick={cancelExport}
                className="flex items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/15"
              >
                <X size={14} /> {t('Cancelar')}
              </button>
            </>
          ) : (
            <button
              onClick={startExport}
              disabled={status.kind === 'saving'}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
            >
              {status.kind === 'saving' ? <Spinner size={15} /> : <Download size={15} />}
              {status.kind === 'saving' ? t('Salvando…') : t('Exportar edit')}
            </button>
          )}
          {status.kind === 'done' && (
            <button
              onClick={() => api.edit.reveal(status.path)}
              className="flex items-center justify-center gap-2 text-xs text-muted hover:text-ink"
            >
              <FolderOpen size={13} /> {t('Edit salvo · mostrar na pasta')}
            </button>
          )}
          {status.kind === 'error' && <p className="text-xs text-red-400">{status.message}</p>}
          <p className="text-[11px] leading-snug text-muted/70">
            {t('Vídeo {w}×{h} a 30 fps com o áudio da música.', { w: outW, h: outH })}
          </p>
        </div>
      </aside>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({
  on,
  disabled,
  title,
  onClick,
  children
}: {
  on: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
        on ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
