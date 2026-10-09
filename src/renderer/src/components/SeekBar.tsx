import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { formatDuration } from '@/utils/format'
import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'
import { isUltraFast } from '@/utils/perf'
import { cachedPeaks, songPeaks, PEAKS } from '@/utils/peaks'
import type { ProgressStyle } from '@/store/barStore'

/**
 * Spotify-style seek bar. Hovering reveals a floating time bubble at the cursor
 * and a ghost fill up to that point; the thumb grows on hover; clicking or
 * dragging anywhere scrubs, and the song seeks once on release.
 *
 * Performance: the bar sits on a glass (backdrop-blurred) footer, and every
 * repaint there forces the blur to be recomputed. So nothing here changes
 * layout or paint while the mouse moves: fills scale and the thumb/bubble
 * translate on their own compositor layers, written straight to the DOM once
 * per animation frame. React only re-renders when the song time changes.
 *
 * Two more looks draw the track on a canvas (its own layer, so redrawing it
 * leaves the glass alone): 'wave', where the part already played is a wave
 * that sways with the music (flat and still while paused), and 'peaks', the
 * song's real loudness as bars (utils/peaks). In Ultra Fast Mode the wave
 * stands still.
 */
export function SeekBar({
  currentTime,
  duration,
  onSeek,
  look = 'line',
  path = null,
  showTimes = true,
  className = 'max-w-xl'
}: {
  currentTime: number
  duration: number
  onSeek: (t: number) => void
  look?: ProgressStyle
  /** the song's file, for its real wave ('peaks') */
  path?: string | null
  showTimes?: boolean
  className?: string
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const art = useRef<ArtState>({ amp: 0, phase: 0, peaks: null, grown: 1, colors: null, colorAt: 0 })
  const trackRef = useRef<HTMLDivElement | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const bubbleTextRef = useRef<HTMLSpanElement | null>(null)
  const [dragging, setDragging] = useState(false)

  // pointer state lives in refs: no re-render per mouse move
  const rect = useRef<{ left: number; width: number }>({ left: 0, width: 1 })
  const hoverPct = useRef<number | null>(null)
  const dragPct = useRef<number | null>(null)
  const frame = useRef(0)
  const lastLabel = useRef('')

  const playPct = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0
  const playPctRef = useRef(playPct)
  playPctRef.current = playPct

  const paint = (): void => {
    frame.current = 0
    const hp = hoverPct.current
    const shown = dragPct.current ?? playPctRef.current
    if (canvasRef.current) drawArt(canvasRef.current, look, art.current, shown, hp)
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${shown})`
    if (thumbRef.current) thumbRef.current.style.transform = `translateX(${shown * 100}%)`
    if (ghostRef.current) {
      ghostRef.current.style.opacity = hp === null ? '0' : '1'
      if (hp !== null) ghostRef.current.style.transform = `scaleX(${hp})`
    }
    if (bubbleRef.current) {
      bubbleRef.current.style.opacity = hp === null ? '0' : '1'
      if (hp !== null) {
        bubbleRef.current.style.transform = `translateX(${hp * 100}%)`
        const label = formatDuration(duration * hp)
        if (label !== lastLabel.current && bubbleTextRef.current) {
          lastLabel.current = label
          bubbleTextRef.current.textContent = label
        }
      }
    }
  }

  const schedule = (): void => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }

  // every render (song time / duration changed): sync the transforms before
  // the browser paints. A transform per timeupdate is free; the old width
  // transition repainted the blurred footer four times a second.
  useLayoutEffect(paint)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // canvas looks: keep the canvas at the track's size (sharp on HiDPI)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const fit = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(c.clientWidth * dpr))
      const h = Math.max(1, Math.round(c.clientHeight * dpr))
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      art.current.colors = null
      paint()
    }
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    fit()
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look])

  // 'peaks': fetch the song's shape, and grow the bars in when it arrives
  useEffect(() => {
    if (look !== 'peaks') return
    const st = art.current
    const known = path ? cachedPeaks(path) : null
    st.peaks = known ?? null
    st.grown = known ? 1 : 0
    paint()
    if (!path || known !== undefined) return
    let live = true
    let raf = 0
    void songPeaks(path).then((p) => {
      if (!live || !p) return
      st.peaks = p
      const t0 = performance.now()
      const grow = (now: number): void => {
        st.grown = Math.min(1, (now - t0) / 450)
        paint()
        if (st.grown < 1 && live) raf = requestAnimationFrame(grow)
      }
      raf = requestAnimationFrame(grow)
    })
    return () => {
      live = false
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, path])

  // 'wave': sway while playing (~30 fps), settle flat when paused, then stop
  useEffect(() => {
    if (look !== 'wave') return
    const st = art.current
    const an = getEngine().getAnalyserNode()
    const freq = new Uint8Array(an.frequencyBinCount)
    let raf = 0
    let last = 0
    let level = 0
    const tick = (now: number): void => {
      raf = 0
      if (now - last < 32) {
        raf = requestAnimationFrame(tick)
        return
      }
      const dt = Math.min(0.1, (now - last) / 1000 || 0.03)
      last = now
      const playing = usePlayerStore.getState().isPlaying && !isUltraFast()
      if (playing) {
        an.getByteFrequencyData(freq)
        let sum = 0
        const top = Math.min(freq.length, 48)
        for (let i = 1; i < top; i++) sum += freq[i]
        const v = sum / (top - 1) / 255
        level += (v - level) * Math.min(1, dt * 8)
      } else level *= 0.85
      const want = playing ? 0.45 + level * 1.1 : 0
      st.amp += (want - st.amp) * Math.min(1, dt * 5)
      st.phase += dt * (3.2 + level * 5)
      paint()
      if (playing || st.amp > 0.01) raf = requestAnimationFrame(tick)
      else st.amp = 0
    }
    const start = (): void => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    start()
    const unsub = usePlayerStore.subscribe((s, prev) => {
      if (s.isPlaying !== prev.isPlaying) start()
    })
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look])

  const measure = (): void => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    rect.current = { left: r.left, width: Math.max(1, r.width) }
  }

  const pctAt = (clientX: number): number =>
    Math.min(1, Math.max(0, (clientX - rect.current.left) / rect.current.width))

  const onEnter = (): void => {
    measure()
  }

  const onMove = (e: React.PointerEvent): void => {
    const p = pctAt(e.clientX)
    hoverPct.current = p
    if (dragging) dragPct.current = p
    schedule()
  }

  const onDown = (e: React.PointerEvent): void => {
    if (duration <= 0) return
    measure()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = pctAt(e.clientX)
    hoverPct.current = p
    dragPct.current = p
    setDragging(true)
    schedule()
  }

  const finish = (e: React.PointerEvent, commit: boolean): void => {
    if (!dragging) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    const p = dragPct.current
    dragPct.current = null
    setDragging(false)
    if (commit && p !== null) {
      playPctRef.current = p
      onSeek(duration * p)
    }
    schedule()
  }

  const onLeave = (): void => {
    if (dragging) return
    hoverPct.current = null
    schedule()
  }

  return (
    <div className={`flex w-full items-center gap-2 text-[11px] text-muted ${className}`}>
      {showTimes && <span className="w-9 text-right tabular-nums">{formatDuration(currentTime)}</span>}
      <div
        ref={trackRef}
        className="group relative flex-1 cursor-pointer py-2 [contain:layout_style]"
        onPointerEnter={onEnter}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
      >
        {look !== 'line' ? (
          <canvas
            ref={canvasRef}
            className={`block w-full will-change-transform ${look === 'peaks' ? 'h-[18px]' : 'h-3'}`}
            style={{ transform: 'translateZ(0)' }}
          />
        ) : (
        <div className="relative h-1 overflow-hidden rounded-full bg-[var(--bg-raised)]">
          {/* ghost fill to hover position */}
          <div
            ref={ghostRef}
            className="absolute inset-0 origin-left rounded-full bg-[var(--text-muted)]/30 opacity-0 will-change-transform"
            style={{ transform: 'scaleX(0)' }}
          />
          {/* actual fill */}
          <div
            ref={fillRef}
            className="absolute inset-0 origin-left rounded-full bg-[var(--accent)] will-change-transform"
          />
        </div>
        )}
        {/* thumb: a full-width rail translated by the progress, thumb at its left edge */}
        <div
          ref={thumbRef}
          className="pointer-events-none absolute inset-x-0 top-1/2 h-0 will-change-transform"
        >
          {look === 'line' && (
            <div className="absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow transition-transform duration-150 group-hover:scale-100" />
          )}
        </div>
        {/* hover time bubble, same rail trick */}
        <div
          ref={bubbleRef}
          className="pointer-events-none absolute inset-x-0 -top-6 z-10 h-0 opacity-0 will-change-transform"
          style={{ transform: 'translateX(0%)' }}
        >
          <span
            ref={bubbleTextRef}
            className="absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums shadow-lg"
          >
            0:00
          </span>
        </div>
      </div>
      {showTimes && <span className="w-9 tabular-nums">{formatDuration(duration)}</span>}
    </div>
  )
}

/* ---------- canvas looks ---------- */

interface ArtState {
  /** wave height (0 = flat) and its travel */
  amp: number
  phase: number
  peaks: Float32Array | null
  /** 0..1 while the bars grow in */
  grown: number
  colors: { accent: string; rest: string; ghost: string } | null
  colorAt: number
}

function colorsOf(c: HTMLCanvasElement, st: ArtState): NonNullable<ArtState['colors']> {
  const now = performance.now()
  // the theme or the cover's accent may change: look again every second
  if (!st.colors || now - st.colorAt > 1000) {
    const cs = getComputedStyle(c)
    const muted = cs.getPropertyValue('--text-muted').trim() || '#888'
    st.colors = {
      accent: cs.getPropertyValue('--accent').trim() || '#7c6cf4',
      rest: withAlpha(muted, 0.32),
      ghost: withAlpha(muted, 0.7)
    }
    st.colorAt = now
  }
  return st.colors
}

/** any CSS colour as rgba() with this alpha (the canvas parses it for us) */
const probe = document.createElement('canvas').getContext('2d')!
function withAlpha(color: string, alpha: number): string {
  probe.fillStyle = '#888'
  probe.fillStyle = color
  const v = String(probe.fillStyle)
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  const m = /rgba?\(([^,]+),([^,]+),([^,)]+)(?:,\s*([^)]+))?\)/.exec(v)
  return m ? `rgba(${m[1]},${m[2]},${m[3]}, ${alpha * (m[4] ? Number(m[4]) : 1)})` : color
}

function drawArt(c: HTMLCanvasElement, look: ProgressStyle, st: ArtState, played: number, hover: number | null): void {
  const g = c.getContext('2d')
  if (!g) return
  const W = c.width
  const H = c.height
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const col = colorsOf(c, st)
  g.clearRect(0, 0, W, H)
  const xp = played * W
  const xh = hover === null ? -1 : hover * W
  const mid = H / 2

  if (look === 'wave') {
    const lw = 2.6 * dpr
    const pad = lw / 2 + 0.5
    g.lineCap = 'round'
    g.lineWidth = lw
    // the rest of the song: a straight line (lighter up to the pointer)
    if (xp < W - pad) {
      g.strokeStyle = col.rest
      g.beginPath()
      g.moveTo(Math.max(pad, xp + 5 * dpr), mid)
      g.lineTo(W - pad, mid)
      g.stroke()
      if (xh > xp + 5 * dpr) {
        g.strokeStyle = col.ghost
        g.beginPath()
        g.moveTo(xp + 5 * dpr, mid)
        g.lineTo(Math.min(xh, W - pad), mid)
        g.stroke()
      }
    }
    // what already played: the wave
    if (xp > pad) {
      const A = Math.min(mid - lw, (H / 2 - lw) * st.amp)
      const len = 22 * dpr
      g.strokeStyle = col.accent
      g.beginPath()
      g.moveTo(pad, mid + A * Math.sin(-st.phase))
      for (let x = pad; x <= xp; x += 2 * dpr) g.lineTo(x, mid + A * Math.sin((x / len) * Math.PI * 2 - st.phase))
      g.stroke()
    }
    // the playhead: a short upright bar
    g.fillStyle = col.accent
    const bw = 3 * dpr
    const bh = H - 1 * dpr
    const bx = Math.min(W - bw, Math.max(0, xp - bw / 2))
    g.beginPath()
    g.roundRect(bx, (H - bh) / 2, bw, bh, bw / 2)
    g.fill()
    return
  }

  // 'peaks': the song's loudness as thin bars
  const bw = 2 * dpr
  const gap = 1.6 * dpr
  const n = Math.max(1, Math.floor((W + gap) / (bw + gap)))
  const p = st.peaks
  const minH = 2 * dpr
  for (let i = 0; i < n; i++) {
    const x = i * (bw + gap)
    let v = 0
    if (p) {
      // the loudest slice under this bar
      const a = Math.floor((i / n) * PEAKS)
      const b = Math.max(a + 1, Math.floor(((i + 1) / n) * PEAKS))
      for (let j = a; j < b; j++) if (p[j] > v) v = p[j]
    }
    const h = Math.max(minH, v * st.grown * H)
    g.fillStyle = x + bw / 2 <= xp ? col.accent : x <= xh ? col.ghost : col.rest
    g.beginPath()
    g.roundRect(x, (H - h) / 2, bw, h, bw / 2)
    g.fill()
  }
}
