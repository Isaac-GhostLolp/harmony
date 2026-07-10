import { useEffect, useRef } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { useEqStore, EQ_PRESETS } from '@/store/eqStore'
import { EQ_BANDS, getEngine } from '@/services/audioEngine'
import { PageHeader } from '@/components/PageHeader'

const LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']
const MIN_DB = -12
const MAX_DB = 12

/**
 * A full, pleasant Equalizer page: a live response-curve graph (the EQ shape,
 * plus the real-time spectrum behind it), large vertical sliders with instant
 * feedback, modern presets, quick reset, and a ghost line showing the default
 * (Flat) for comparison.
 */
export function Equalizer(): JSX.Element {
  const { enabled, preset, gains, setEnabled, setPreset, setGain } = useEqStore()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gainsRef = useRef(gains)
  gainsRef.current = gains
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  // Live curve + spectrum
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const engine = getEngine()
    let raf = 0

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, r.width * dpr)
      canvas.height = Math.max(1, r.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const accent = (): string =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6cf4'

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      const r = canvas.getBoundingClientRect()
      const W = r.width
      const H = r.height
      if (W < 10) return
      ctx.clearRect(0, 0, W, H)
      const g = gainsRef.current
      const n = g.length
      const pad = 10
      const innerH = H - pad * 2
      const yFor = (db: number): number => pad + innerH * (1 - (db - MIN_DB) / (MAX_DB - MIN_DB))
      const xFor = (i: number): number => (W / (n - 1)) * i

      // live spectrum behind the curve
      const spec = engine.getSpectrum(n)
      ctx.fillStyle = `${accent()}22`
      for (let i = 0; i < n; i++) {
        const bh = (enabledRef.current ? spec[i] : spec[i] * 0.6) * innerH
        const bw = W / n - 3
        ctx.fillRect(xFor(i) - bw / 2, H - pad - bh, bw, bh)
      }

      // zero line
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, yFor(0))
      ctx.lineTo(W, yFor(0))
      ctx.stroke()

      // ghost Flat reference
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, yFor(0))
      ctx.lineTo(W, yFor(0))
      ctx.stroke()
      ctx.setLineDash([])

      // EQ response curve (smooth through the band points)
      ctx.strokeStyle = enabledRef.current ? accent() : 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x = xFor(i)
        const y = yFor(g[i])
        if (i === 0) ctx.moveTo(x, y)
        else {
          const px = xFor(i - 1)
          const py = yFor(g[i - 1])
          const cx = (px + x) / 2
          ctx.bezierCurveTo(cx, py, cx, y, x, y)
        }
      }
      ctx.stroke()

      // fill under the curve
      ctx.lineTo(W, yFor(0))
      ctx.lineTo(0, yFor(0))
      ctx.closePath()
      ctx.fillStyle = enabledRef.current ? `${accent()}18` : 'rgba(255,255,255,0.04)'
      ctx.fill()

      // band points
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = enabledRef.current ? accent() : 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.arc(xFor(i), yFor(g[i]), 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const isModified = gains.some((g) => g !== 0)
  const presetNames = [...Object.keys(EQ_PRESETS), 'Personalizado']

  return (
    <div>
      <PageHeader
        title="Equalizador"
        subtitle={`10 bandas · ${EQ_BANDS[0]} Hz – 16 kHz`}
        actions={
          <button
            onClick={() => setEnabled(!enabled)}
            role="switch"
            aria-checked={enabled}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              enabled ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-muted'
            }`}
          >
            <span
              className={`relative h-4 w-7 rounded-full transition-colors ${
                enabled ? 'bg-white/30' : 'bg-white/10'
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                  enabled ? 'left-[14px]' : 'left-0.5'
                }`}
              />
            </span>
            {enabled ? 'Ativado' : 'Desativado'}
          </button>
        }
      />

      {/* Response graph */}
      <div className="glass relative mb-5 overflow-hidden rounded-2xl p-2">
        <canvas ref={canvasRef} className="h-48 w-full" />
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 text-[10px] text-muted">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-white/40" />
          padrão (Flat)
        </div>
      </div>

      {/* Presets */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {presetNames.map((name) => (
          <button
            key={name}
            disabled={!enabled || name === 'Personalizado'}
            onClick={() => setPreset(name)}
            className={`press rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-40 ${
              preset === name
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
            }`}
          >
            {name === 'Flat' && <Sparkles size={12} className="mr-1 inline" />}
            {name}
          </button>
        ))}
        <button
          onClick={() => setPreset('Flat')}
          disabled={!enabled || !isModified}
          className="press ml-auto flex items-center gap-1.5 rounded-full bg-[var(--bg-raised)] px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
          title="Zerar todas as bandas"
        >
          <RotateCcw size={13} /> Resetar
        </button>
      </div>

      {/* Sliders */}
      <div
        className={`glass rounded-2xl p-6 transition-opacity ${enabled ? '' : 'opacity-50'}`}
      >
        <div className="flex items-stretch justify-between gap-2">
          {gains.map((g, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <span
                className={`text-xs font-semibold tabular-nums transition-colors ${
                  g !== 0 ? 'text-[var(--accent)]' : 'text-muted'
                }`}
              >
                {g > 0 ? `+${g}` : g}
              </span>
              <div className="relative flex h-56 w-8 items-center justify-center">
                <input
                  type="range"
                  min={MIN_DB}
                  max={MAX_DB}
                  step={1}
                  value={g}
                  disabled={!enabled}
                  onChange={(e) => setGain(i, Number(e.target.value))}
                  className="eq-slider absolute"
                  style={
                    {
                      // A horizontal range rotated upright. The parent is a
                      // fixed narrow cell; the slider is absolutely positioned
                      // and rotated in place, so its 224px width doesn't push
                      // the neighbouring bands out (which caused the sideways
                      // overflow).
                      width: '224px',
                      transform: 'rotate(-90deg)',
                      '--fill': `${((g - MIN_DB) / (MAX_DB - MIN_DB)) * 100}%`
                    } as React.CSSProperties
                  }
                  aria-label={`${LABELS[i]} Hz`}
                />
              </div>
              <span className="text-[11px] font-medium text-muted">{LABELS[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
