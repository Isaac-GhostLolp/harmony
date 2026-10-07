import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clapperboard, Download, FolderOpen, Music2, X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { getEngine } from '@/services/audioEngine'
import { api } from '@/services/api'
import { mediaUrl } from '@/utils/format'
import { ExportCancelled } from '../edit/editExport'
import { exportRecap } from './recapExport'
import {
  createRecapState,
  drawRecap,
  periodLabel,
  RECAP_H,
  RECAP_W,
  recapLength,
  scenesFor,
  type RecapAssets,
  type RecapData,
  type Scene
} from './recapRenderer'

/**
 * Retrospectiva — the listener's year in music as a 9:16 video to post.
 * The preview loops the same frames the export renders (with a stand-in
 * beat); the export adds the real soundtrack, the #1 song of the period.
 */

type Period = number | 'all'
type Quality = '720' | '1080'

type Status =
  | { kind: 'idle' }
  | { kind: 'rendering'; label: string; progress: number }
  | { kind: 'saving' }
  | { kind: 'done'; path: string }
  | { kind: 'error'; message: string }

const PREVIEW_SCALE = 0.5

function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    // CORS-clean so the canvas can be read back into video frames
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export function RecapStudio({
  name,
  photo,
  avatar,
  hue,
  onClose
}: {
  name: string
  photo: string | null
  avatar: string
  hue: number
  onClose: () => void
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [period, setPeriod] = useState<Period>(new Date().getFullYear())
  const [data, setData] = useState<RecapData | null>(null)
  const [years, setYears] = useState<number[]>([])
  const [assets, setAssets] = useState<RecapAssets | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [quality, setQuality] = useState<Quality>('1080')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [sceneIdx, setSceneIdx] = useState(0)

  const scenes: Scene[] = data ? scenesFor(data) : []
  const length = recapLength(scenes)
  const busy = status.kind === 'rendering' || status.kind === 'saving'

  // the frame loop reads these
  const live = useRef<{ data: RecapData | null; assets: RecapAssets | null; scenes: Scene[] }>({
    data: null,
    assets: null,
    scenes: []
  })
  live.current = { data, assets, scenes }
  const clock = useRef({ t0: performance.now() })
  const exporting = useRef(false)
  const cancelled = useRef(false)

  // the data for the chosen period; falls back to the latest year with plays
  useEffect(() => {
    let alive = true
    setLoadError(false)
    api.stats
      .recap(period)
      .then((raw) => {
        if (!alive) return
        const d = raw as RecapData
        setYears(d.years)
        if (typeof period === 'number' && d.totalPlays === 0 && d.years.length && !d.years.includes(period)) {
          setPeriod(d.years[0])
          return
        }
        setData(d)
        clock.current.t0 = performance.now()
      })
      .catch((err) => {
        console.error('[Recap] failed to load', err)
        if (alive) setLoadError(true)
      })
    return () => {
      alive = false
    }
  }, [period])

  // covers and the profile photo
  useEffect(() => {
    if (!data) return
    let alive = true
    Promise.all([
      loadImage(photo),
      Promise.all(data.topSongs.map((s) => loadImage(mediaUrl(s.coverPath)))),
      Promise.all(data.topArtists.map((a) => loadImage(mediaUrl(a.cover))))
    ]).then(([ph, songCovers, artistCovers]) => {
      if (alive) setAssets({ name, avatar, photo: ph, songCovers, artistCovers, hue })
    })
    return () => {
      alive = false
    }
  }, [data, photo, name, avatar, hue])

  // preview loop
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const S = createRecapState()
    const frame = { time: 0, kick: 0, hit: false }
    let raf = 0
    let shownScene = -1
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      const { data: d, assets: A, scenes: sc } = live.current
      if (!d || !A || !sc.length || exporting.current || document.hidden) return
      const len = recapLength(sc)
      const time = (((now - clock.current.t0) / 1000) % len + len) % len
      // a stand-in beat at 120 bpm (the export uses the song's real one)
      const phase = (time * 2) % 1
      frame.time = time
      frame.kick = phase < 0.07 ? 0.6 : 0
      frame.hit = false
      drawRecap(ctx, S, d, A, sc, frame, PREVIEW_SCALE)
      const idx = Math.max(0, sc.findIndex((s) => time < s.start + s.dur))
      if (idx !== shownScene) {
        shownScene = idx
        setSceneIdx(idx)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Escape closes when idle
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !exporting.current) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // closing mid-export cancels it
  useEffect(
    () => () => {
      cancelled.current = true
    },
    []
  )

  const jumpTo = (s: Scene): void => {
    clock.current.t0 = performance.now() - s.start * 1000
  }

  const startExport = async (): Promise<void> => {
    if (busy || !data || !assets) return
    cancelled.current = false
    exporting.current = true
    setStatus({ kind: 'rendering', label: 'Preparando a trilha…', progress: 0 })
    api.edit.setBackgroundThrottling(false)
    try {
      const top = data.topSongs[0]
      let audio: ArrayBuffer | null = null
      const url = top ? mediaUrl(top.path) : undefined
      if (url) {
        try {
          audio = await (await fetch(url)).arrayBuffer()
        } catch {
          audio = null // the file moved: the video goes out silent
        }
      }
      let shown = -1
      const result = await exportRecap({
        data,
        assets,
        scenes,
        audio,
        eq: getEngine().getEqSnapshot(),
        quality,
        isCancelled: () => cancelled.current,
        onProgress: (phase, p) => {
          const total = phase === 'audio' ? p * 0.15 : phase === 'video' ? 0.15 + p * 0.85 : 1
          const r = Math.round(total * 100) / 100
          if (r === shown) return
          shown = r
          setStatus({
            kind: 'rendering',
            label: phase === 'audio' ? 'Preparando a trilha…' : phase === 'video' ? 'Gerando o vídeo…' : 'Finalizando…',
            progress: r
          })
        }
      })
      setStatus({ kind: 'saving' })
      const path = await api.edit.save(result.data, `Retrospectiva ${periodLabel(data.period)} - ${name}`, result.ext)
      setStatus(path ? { kind: 'done', path } : { kind: 'idle' })
    } catch (e) {
      if (e instanceof ExportCancelled) setStatus({ kind: 'idle' })
      else {
        console.error('[Recap] export failed', e)
        setStatus({
          kind: 'error',
          message:
            e instanceof Error && e.message === 'no-encoder'
              ? 'Este computador não consegue gerar vídeo.'
              : 'Não foi possível gerar o vídeo.'
        })
      }
    } finally {
      exporting.current = false
      api.edit.setBackgroundThrottling(true)
    }
  }

  const empty = data && data.totalPlays === 0
  const periods: Period[] = [...years, 'all']

  // portalled to <body>: the page lives inside <main>, whose backdrop-filter
  // would trap a fixed overlay under the player bar
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center gap-6 bg-black/85 p-6 backdrop-blur-md">
      <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <div
          className="relative max-h-full max-w-full"
          style={{ aspectRatio: `${RECAP_W} / ${RECAP_H}`, height: '100%' }}
        >
          <canvas
            ref={canvasRef}
            width={RECAP_W * PREVIEW_SCALE}
            height={RECAP_H * PREVIEW_SCALE}
            className="h-full w-full rounded-2xl bg-black shadow-[0_30px_90px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
          />
          {(!data || !assets || empty || loadError) && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/70 p-8 text-center text-white">
              {loadError ? (
                <p className="text-sm">Não consegui carregar sua retrospectiva.</p>
              ) : empty ? (
                <div>
                  <p className="mb-1 text-3xl">🎧</p>
                  <p className="text-sm">Ainda não há músicas ouvidas neste período.</p>
                  <p className="mt-1 text-xs text-white/60">Dê alguns plays e volte aqui!</p>
                </div>
              ) : (
                <Spinner size={22} />
              )}
            </div>
          )}
          {status.kind === 'rendering' && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/60">
              <div className="flex flex-col items-center gap-2 text-white">
                <Spinner size={22} />
                <span className="text-2xl font-semibold tabular-nums">{Math.round(status.progress * 100)}%</span>
                <span className="text-xs text-white/70">{status.label}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-72 shrink-0 flex-col gap-5 py-1 text-sm text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Clapperboard size={18} /> Retrospectiva
            </h2>
            <p className="text-xs text-white/60">Seu ano em música, pronto para os stories.</p>
          </div>
          <button
            onClick={() => {
              cancelled.current = true
              onClose()
            }}
            className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2">
          <Section title="Período">
            {periods.map((p) => (
              <Chip key={String(p)} on={period === p} disabled={busy} onClick={() => setPeriod(p)}>
                {periodLabel(p)}
              </Chip>
            ))}
          </Section>

          {scenes.length > 0 && !empty && (
            <Section title="Cenas">
              {scenes.map((s, i) => (
                <Chip key={s.id} on={sceneIdx === i} disabled={busy} onClick={() => jumpTo(s)}>
                  {s.label}
                </Chip>
              ))}
            </Section>
          )}

          {data && data.topSongs[0] && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">Trilha sonora</p>
              <div className="flex items-center gap-2 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10">
                <Music2 size={16} className="shrink-0 text-white/60" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{data.topSongs[0].title}</p>
                  <p className="truncate text-xs text-white/60">
                    {data.topSongs[0].artist ?? 'Artista desconhecido'} · a parte mais forte
                  </p>
                </div>
              </div>
            </div>
          )}

          <Section title="Qualidade">
            {(['720', '1080'] as Quality[]).map((q) => (
              <Chip key={q} on={quality === q} disabled={busy} onClick={() => setQuality(q)}>
                {q}p
              </Chip>
            ))}
          </Section>
          <p className="text-xs text-white/50">
            Vídeo 9:16 de {Math.round(length)}s. A prévia usa uma batida de exemplo; o vídeo final pulsa no ritmo da
            sua música.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {status.kind === 'done' && (
            <button
              onClick={() => api.edit.reveal(status.path)}
              className="flex items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs hover:bg-white/15"
            >
              <FolderOpen size={14} /> Vídeo salvo! Mostrar na pasta
            </button>
          )}
          {status.kind === 'error' && <p className="text-center text-xs text-red-300">{status.message}</p>}
          {status.kind === 'rendering' ? (
            <button
              onClick={() => {
                cancelled.current = true
              }}
              className="rounded-full bg-white/10 px-4 py-2.5 font-semibold hover:bg-white/15"
            >
              Cancelar
            </button>
          ) : (
            <button
              onClick={startExport}
              disabled={busy || !data || !assets || !!empty}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              {status.kind === 'saving' ? <Spinner size={14} /> : <Download size={16} />}
              {status.kind === 'saving' ? 'Salvando…' : 'Exportar vídeo'}
            </button>
          )}
        </div>
      </aside>
    </div>,
    document.body
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({
  on,
  disabled,
  onClick,
  children
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
        on ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}
