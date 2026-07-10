import { useEffect, useRef, useState } from 'react'
import { Maximize, Minimize, Music2, ChevronDown } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { api } from '@/services/api'
import { mediaUrl } from '@/utils/format'
import { getDirector } from '@/services/stageDirector'
import { PageHeader } from '@/components/PageHeader'
import {
  SHOW_PACKS,
  getPack,
  createSceneState,
  type PackId,
  type SceneState
} from './visualizer/packs'

/**
 * Visualizer — a virtual stage that turns any song into a spectacle.
 *
 * Thin shell: it owns the canvas + the render loop, and delegates ALL music
 * interpretation to the StageDirector and ALL drawing to the selected Show
 * Pack. Packs share the same director frame (states, impact events, light
 * groups, palette) but each has its own world. Zero React re-renders in the
 * loop; zero per-frame allocations (pools live in SceneState).
 *
 * Secret: typing "arthur" (or "punk") anywhere here jumps to the Pyramid
 * pack and unlocks the Alive eras. Para o Arthur 🤖
 */

export function Visualizer(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [packId, setPackId] = useState<PackId>('festival')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [chipHot, setChipHot] = useState(false)

  const packRef = useRef<PackId>('festival')
  packRef.current = packId
  const sceneRef = useRef<SceneState>(createSceneState())

  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)

  // restore last chosen pack
  useEffect(() => {
    api.settings.get().then((raw) => {
      const s = raw as Record<string, unknown>
      if (typeof s.showPack === 'string' && SHOW_PACKS.some((p) => p.id === s.showPack)) {
        setPackId(s.showPack as PackId)
      }
    })
  }, [])

  const selectPack = (id: PackId): void => {
    setPackId(id)
    setPickerOpen(false)
    sceneRef.current = createSceneState() // fresh pools for the new world
    api.settings.set('showPack', id)
  }

  useEffect(() => {
    if (!song) return
    setChipHot(true)
    const t = window.setTimeout(() => setChipHot(false), 4500)
    return () => window.clearTimeout(t)
  }, [song?.id])

  // secret: jump to Pyramid + unlock
  useEffect(() => {
    let buffer = ''
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.length !== 1) return
      buffer = (buffer + e.key.toLowerCase()).slice(-12)
      if (buffer.includes('arthur') || buffer.includes('punk')) {
        buffer = ''
        api.settings.set('punkUnlocked', true)
        selectPack('pyramid')
        setToast('Pyramid desbloqueado — one more time, Arthur! 🤖')
        window.setTimeout(() => setToast(null), 5000)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onChange = (): void => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void containerRef.current?.requestFullscreen()
  }

  // ---------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const director = getDirector()
    let raf = 0

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      const W = rect.width
      const H = rect.height
      if (W < 10 || H < 10) return

      const ps = usePlayerStore.getState()
      const cur = ps.queue[ps.currentIndex]
      const progress = cur && cur.duration > 0 ? ps.currentTime / cur.duration : 0
      const F = director.update(ps.isPlaying, progress)
      const E = F.emotion // dramatic intensity is the master scale

      ctx.clearRect(0, 0, W, H)
      ctx.save()

      // cinematic camera: gentle translate + micro zoom around center
      const cx = W / 2
      const cy = H / 2
      ctx.translate(cx, cy)
      ctx.scale(1 + F.zoom, 1 + F.zoom)
      ctx.translate(-cx + F.camX, -cy + F.camY)

      // base black; each pack paints its own world on top
      ctx.fillStyle = '#03030a'
      ctx.fillRect(-12, -12, W + 24, H + 24)

      getPack(packRef.current).draw(ctx, W, H, F, sceneRef.current, E)

      // discreet narrative readout
      if (E > 0.02) {
        ctx.font = '600 9px system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillStyle = `rgba(255,255,255,${0.1 + F.tension * 0.15})`
        ctx.fillText(F.state.toUpperCase(), W - 14, H - 12)
        ctx.textAlign = 'left'
      }

      // afterglow flash + pre-impact dim (both decay in the director)
      if (F.flash > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${(F.flash * 0.16 * E).toFixed(3)})`
        ctx.fillRect(-12, -12, W + 24, H + 24)
      }
      if (F.dim > 0.02) {
        ctx.fillStyle = `rgba(0,0,0,${(F.dim * 0.5).toFixed(3)})`
        ctx.fillRect(-12, -12, W + 24, H + 24)
      }
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  const cover = mediaUrl(song?.coverPath ?? null)
  const current = getPack(packId)

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative z-50">
      <PageHeader
        title="Visualizer"
        subtitle="Um palco virtual que transforma qualquer música em espetáculo"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative z-50">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-[var(--accent-soft)]"
              >
                <span>{current.emoji}</span>
                {current.name}
                <ChevronDown size={13} className={pickerOpen ? 'rotate-180' : ''} />
              </button>
              {pickerOpen && (
                <div className="glass absolute right-0 top-11 z-50 w-60 rounded-2xl p-1.5">
                  {SHOW_PACKS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPack(p.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        p.id === packId
                          ? 'bg-[var(--accent-soft)] text-ink'
                          : 'text-muted hover:bg-[var(--bg-raised)] hover:text-ink'
                      }`}
                    >
                      <span className="text-lg">{p.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{p.name}</p>
                        <p className="truncate text-[10px] text-muted">{p.blurb}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink"
              title="Tela cheia"
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>
        }
      />
      </div>
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/5 bg-black"
      >
        <canvas ref={canvasRef} className="h-full w-full" />

        {song && (
          <div
            className={`absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-white/10 bg-black/60 py-1.5 pl-1.5 pr-4 backdrop-blur-md transition-opacity duration-700 ${
              chipHot ? 'opacity-100' : 'opacity-30 hover:opacity-100'
            }`}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full">
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <Music2 size={14} className="text-muted" />
              )}
            </div>
            <div className="min-w-0">
              <p className="max-w-[220px] truncate text-xs font-medium text-white/90">
                {song.title}
              </p>
              <p className="max-w-[220px] truncate text-[10px] text-white/50">
                {song.artist ?? '—'}
              </p>
            </div>
          </div>
        )}

        {toast && (
          <div className="glass absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-5 py-2 text-xs">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
