import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { startCursor, useCursorStore, type Trail } from '@/utils/cursor'
import { useUltraFast } from '@/utils/perf'
import { watchBeat } from '@/components/stickers/beat'
import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'

/**
 * The cursor's page-drawn parts (utils/cursor.ts has the images):
 *
 *  • the live cursor — the page hides the system pointer and draws the
 *    chosen cursor itself, so it can pulse with the beat, grow over things
 *    you can click, and move (the vinyl turns, the equalizer's bars jump
 *    with the music, the note swings, a GIF plays);
 *  • the effects — a trail (notes, sparkles, a comet, a sound wave,
 *    confetti, an emoji) and a click effect (a sound wave, a burst of
 *    notes), with any cursor, the system's too.
 *
 * All off in Ultra Fast Mode and without a mouse.
 */

const CLICKABLE =
  'a[href], button:not(:disabled), [role="button"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], label, select, summary, .cursor-pointer, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"], .eq-slider'
const TYPING =
  'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="number"], input[type="password"], textarea, [contenteditable="true"]'

const hasMouse = (): boolean => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

export function CursorLayer(): JSX.Element {
  const live = useCursorStore((s) => s.live)
  const images = useCursorStore((s) => s.images)
  const trail = useCursorStore((s) => s.effective.trail)
  const click = useCursorStore((s) => s.click)
  const ultra = useUltraFast()
  const mouse = hasMouse()

  useEffect(() => startCursor(), [])

  const liveOn = Boolean(live && images && !ultra && mouse)
  const effectsOn = (trail !== 'none' || click !== 'none') && !ultra && mouse
  return (
    <>
      {liveOn && <LiveCursor />}
      {effectsOn && <CursorEffects />}
    </>
  )
}

// ── the live cursor ───────────────────────────────────────────────────

function LiveCursor(): JSX.Element | null {
  const images = useCursorStore((s) => s.images)
  const pack = useCursorStore((s) => s.effective.pack)
  const customAnim = useCursorStore((s) => s.customAnim)
  const beat = useCursorStore((s) => s.beat)
  const grow = useCursorStore((s) => s.grow)
  const size = useCursorStore((s) => s.size)
  const playing = usePlayerStore((s) => s.isPlaying)
  const dot = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const bars = useRef<HTMLDivElement>(null)

  const gif = pack === 'custom' && customAnim ? customAnim : null
  // animated packs keep their own picture over buttons (the ring shows it's clickable)
  const swaps = !gif && pack !== 'vinyl' && pack !== 'eq' && pack !== 'note'

  useEffect(() => {
    document.documentElement.classList.add('cursor-live')
    return () => document.documentElement.classList.remove('cursor-live')
  }, [])

  // follows the mouse; one frame per move at most
  useEffect(() => {
    const el = dot.current
    if (!el || !images) return
    let x = -100
    let y = -100
    let frame = 0
    let overButton = false
    el.style.opacity = '0'

    const place = (): void => {
      frame = 0
      el.style.transform = `translate3d(${x - images.arrow.hx}px, ${y - images.arrow.hy}px, 0)`
    }
    const move = (e: MouseEvent): void => {
      x = e.clientX
      y = e.clientY
      const target = e.target instanceof Element ? e.target : null
      // DJ Mode hides the pointer when idle; over a text field the I-beam takes over
      const hidden = Boolean(target?.closest('.dj-idle') || target?.closest(TYPING))
      el.style.opacity = hidden ? '0' : '1'
      const button = Boolean(target?.closest(CLICKABLE))
      if (button !== overButton) {
        overButton = button
        el.classList.toggle('on-button', button && grow)
        if (swaps && img.current) img.current.src = button ? images.pointer.x2 : images.arrow.x2
        el.style.setProperty('--grow', button && grow ? '1.15' : '1')
      }
      if (!frame) frame = requestAnimationFrame(place)
    }
    const leave = (e: MouseEvent): void => {
      // the mouse left the window (or went onto the title bar, where the system draws it)
      if (!e.relatedTarget) el.style.opacity = '0'
    }
    const down = (): void => el.style.setProperty('--grow', '0.88')
    const up = (): void => el.style.setProperty('--grow', overButton && grow ? '1.15' : '1')

    window.addEventListener('mousemove', move, { passive: true })
    document.addEventListener('mouseout', leave)
    window.addEventListener('mousedown', down)
    window.addEventListener('mouseup', up)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', move)
      document.removeEventListener('mouseout', leave)
      window.removeEventListener('mousedown', down)
      window.removeEventListener('mouseup', up)
    }
  }, [images, grow, swaps])

  // pulses with the kicks (the same detector as the stickers)
  useEffect(() => {
    if (!beat || !dot.current) return
    return watchBeat(dot.current)
  }, [beat])

  // the equalizer pack: three bars from the music's lows, mids and highs
  useEffect(() => {
    if (pack !== 'eq' || !bars.current) return
    const els = [...bars.current.children] as HTMLElement[]
    let raf = 0
    let freq: Uint8Array<ArrayBuffer> | null = null
    const bands = [
      [1, 6],
      [6, 40],
      [40, 140]
    ]
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      let levels: number[]
      if (usePlayerStore.getState().isPlaying) {
        const an = getEngine().getAnalyserNode()
        if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount)
        an.getByteFrequencyData(freq)
        levels = bands.map(([a, b]) => {
          let sum = 0
          for (let i = a; i < b; i++) sum += freq![i]
          return Math.min(1, sum / (b - a) / 200)
        })
      } else {
        levels = [0, 1, 2].map((i) => 0.25 + 0.15 * Math.sin(now / 500 + i))
      }
      els.forEach((b, i) => (b.style.transform = `scaleY(${0.2 + 0.8 * levels[i]})`))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pack])

  if (!images) return null
  const anim = pack === 'vinyl' ? 'cursor-anim-spin' : pack === 'note' ? 'cursor-anim-swing' : ''
  return createPortal(
    <div
      ref={dot}
      className={`cursor-live-dot ${playing ? 'is-playing' : ''}`}
      aria-hidden
      style={{ ['--hx' as string]: `${images.arrow.hx}px`, ['--hy' as string]: `${images.arrow.hy}px` }}
    >
      <div className="cursor-live-ring" />
      {pack === 'eq' ? (
        <div ref={bars} className="cursor-eq" style={{ width: size, height: size }}>
          <span />
          <span />
          <span />
        </div>
      ) : (
        <img
          ref={img}
          src={gif ?? images.arrow.x2}
          width={size}
          height={size}
          alt=""
          draggable={false}
          className={anim}
        />
      )}
    </div>,
    document.body
  )
}

// ── trails and click effects ──────────────────────────────────────────

const NOTES = ['♪', '♫', '♬', '♩']
const SPARKLES = ['✦', '✧', '·', '✦']
/** a trail mark every this many pixels of movement */
const TRAIL_STEP = 26
const TRAIL_MAX = 16
/** the comet / wave remember the last this-many milliseconds of movement */
const LINE_MS = 380

function particle(className: string, text: string, vars: Record<string, string>, life = 900): void {
  const s = document.createElement('span')
  s.className = className
  s.textContent = text
  for (const [k, v] of Object.entries(vars)) s.style.setProperty(k, v)
  let gone = false
  const remove = (): void => {
    if (gone) return
    gone = true
    s.remove()
  }
  s.addEventListener('animationend', remove)
  // in case the animation never ends (a hidden window pauses it)
  window.setTimeout(remove, life)
  document.body.appendChild(s)
}

function CursorEffects(): JSX.Element | null {
  const trail = useCursorStore((s) => s.effective.trail)
  const emoji = useCursorStore((s) => s.effective.trailEmoji)
  const click = useCursorStore((s) => s.click)
  const canvas = useRef<HTMLCanvasElement>(null)
  const lineTrail = trail === 'comet' || trail === 'wave'

  // marks along the way: notes, sparkles, confetti, an emoji
  useEffect(() => {
    if (trail === 'none' || lineTrail) return
    let travelled = 0
    let lastX = 0
    let lastY = 0
    const move = (e: MouseEvent): void => {
      const d = Math.hypot(e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
      travelled += Math.min(d, 80)
      if (travelled < TRAIL_STEP || document.querySelectorAll('.cursor-trail').length >= TRAIL_MAX) return
      travelled = 0
      spawnMark(trail, emoji, e.clientX, e.clientY)
    }
    window.addEventListener('mousemove', move, { passive: true })
    return () => {
      window.removeEventListener('mousemove', move)
      document.querySelectorAll('.cursor-trail').forEach((n) => n.remove())
    }
  }, [trail, emoji, lineTrail])

  // the comet and the sound wave: a line drawn behind the pointer
  useEffect(() => {
    if (!lineTrail) return
    const c = canvas.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const fit = (): void => {
      c.width = Math.round(innerWidth * dpr)
      c.height = Math.round(innerHeight * dpr)
    }
    fit()
    window.addEventListener('resize', fit)
    const points: { x: number; y: number; t: number }[] = []
    let raf = 0
    let wave: Uint8Array<ArrayBuffer> | null = null
    const accent = (): string => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6cf4'
    let colour = accent()

    const draw = (now: number): void => {
      raf = 0
      while (points.length && now - points[0].t > LINE_MS) points.shift()
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, innerWidth, innerHeight)
      if (points.length < 2) return
      let level = 0
      if (trail === 'wave' && usePlayerStore.getState().isPlaying) {
        const an = getEngine().getAnalyserNode()
        if (!wave || wave.length !== an.fftSize) wave = new Uint8Array(an.fftSize)
        an.getByteTimeDomainData(wave)
        let peak = 0
        for (let i = 0; i < wave.length; i += 8) peak = Math.max(peak, Math.abs(wave[i] - 128))
        level = peak / 128
      }
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.strokeStyle = colour
      g.shadowColor = colour
      g.shadowBlur = 8
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]
        const b = points[i]
        const life = 1 - (now - b.t) / LINE_MS
        g.globalAlpha = Math.max(0, life)
        if (trail === 'comet') {
          g.lineWidth = 1 + 6 * life
          g.beginPath()
          g.moveTo(a.x, a.y)
          g.lineTo(b.x, b.y)
          g.stroke()
        } else {
          // the sound wave: the line wobbles across the path, more with louder music
          const nx = -(b.y - a.y)
          const ny = b.x - a.x
          const len = Math.hypot(nx, ny) || 1
          const amp = (3 + 9 * level) * life * Math.sin(i * 0.9 + now / 90)
          g.lineWidth = 2
          g.beginPath()
          g.moveTo(a.x, a.y)
          g.lineTo(b.x + (nx / len) * amp, b.y + (ny / len) * amp)
          g.stroke()
        }
      }
      g.globalAlpha = 1
      if (points.length) raf = requestAnimationFrame(draw)
    }
    const move = (e: MouseEvent): void => {
      points.push({ x: e.clientX, y: e.clientY, t: performance.now() })
      if (points.length === 1) colour = accent()
      if (!raf) raf = requestAnimationFrame(draw)
    }
    window.addEventListener('mousemove', move, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('resize', fit)
      g.clearRect(0, 0, c.width, c.height)
    }
  }, [trail, lineTrail])

  // the click: a sound wave, or a burst of notes
  useEffect(() => {
    if (click === 'none') return
    const down = (e: MouseEvent): void => {
      if (e.button !== 0) return
      if (click === 'wave') {
        for (let i = 0; i < 2; i++)
          particle('cursor-click-ring', '', { '--x': `${e.clientX}px`, '--y': `${e.clientY}px`, 'animation-delay': `${i * 90}ms` }, 900)
      } else {
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5
          const dist = 26 + Math.random() * 14
          particle(
            'cursor-burst',
            NOTES[i % NOTES.length],
            {
              '--x': `${e.clientX - 5}px`,
              '--y': `${e.clientY - 7}px`,
              '--dx': `${Math.cos(angle) * dist}px`,
              '--dy': `${Math.sin(angle) * dist}px`
            },
            800
          )
        }
      }
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [click])

  if (!lineTrail) return null
  return createPortal(<canvas ref={canvas} className="cursor-line" aria-hidden />, document.body)
}

function spawnMark(trail: Trail, emoji: string, x: number, y: number): void {
  if (trail === 'confetti') {
    const hue = Math.floor(Math.random() * 360)
    particle('cursor-trail cursor-confetti', '', {
      '--x': `${x}px`,
      '--y': `${y}px`,
      '--dx': `${(Math.random() - 0.5) * 30}px`,
      '--rot': `${(Math.random() - 0.5) * 540}deg`,
      background: `hsl(${hue} 85% 62%)`
    })
    return
  }
  const text = trail === 'emoji' ? emoji : (trail === 'notes' ? NOTES : SPARKLES)[Math.floor(Math.random() * 4)]
  particle(`cursor-trail ${trail === 'emoji' ? 'cursor-emoji' : ''}`, text, {
    '--x': `${x - 4}px`,
    '--y': `${y - 6}px`,
    '--dx': `${(Math.random() - 0.5) * 18}px`,
    '--rot': `${(Math.random() - 0.5) * 60}deg`
  })
}
