import { useEffect, useRef, useState } from 'react'
import { Play, RotateCw, Shuffle } from 'lucide-react'
import type { Song } from '@/types'
import { usePlayerStore } from '@/store/playerStore'
import { CoverArt } from '@/components/CoverArt'
import { MOODS, mixFor, roulettePick, type Mood } from './worldData'
import { SectionTitle } from './parts'

/** "Como você está hoje?" — one tap turns a mood into a mix from your own library. */
export function MoodMix({
  songs,
  mood,
  onMood
}: {
  songs: Song[]
  mood: string | null
  onMood: (id: string) => void
}): JSX.Element {
  const playQueue = usePlayerStore((s) => s.playQueue)
  const current = MOODS.find((m) => m.id === mood) ?? null
  const [info, setInfo] = useState<string | null>(null)

  const play = (m: Mood): void => {
    onMood(m.id)
    if (songs.length === 0) {
      setInfo('Importe algumas músicas para montar seu mix.')
      return
    }
    const { songs: mix, matched } = mixFor(m, songs)
    playQueue(mix, 0)
    setInfo(
      matched >= 10
        ? `Tocando ${mix.length} músicas ${m.label.toLowerCase() === 'foco' ? 'para focar' : `para um dia ${m.label.toLowerCase()}`}.`
        : `Tocando ${mix.length} músicas: suas queridinhas para combinar com o clima.`
    )
  }

  return (
    <div
      className="glass fade-rise relative overflow-hidden rounded-3xl p-5"
      style={current ? { background: `linear-gradient(135deg, hsl(${current.hue} 80% 50% / 0.22), transparent 70%)` } : undefined}
    >
      <SectionTitle emoji="💭" title="Como você está hoje?" hint="um toque e o mix começa" />
      <div className="grid grid-cols-3 gap-2">
        {MOODS.map((m) => (
          <button
            key={m.id}
            onClick={() => play(m)}
            className={`press group flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-xs font-medium transition-colors ${
              mood === m.id ? 'bg-white/15 ring-1 ring-white/25' : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <span className="text-3xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-125">
              {m.emoji}
            </span>
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-3 min-h-[1.25rem] text-xs text-muted">
        {info ?? (current ? `Hoje você está ${current.emoji} ${current.label.toLowerCase()}. Toque de novo para outro mix.` : 'Escolha um humor e o Harmony monta um mix com as suas músicas.')}
      </p>
    </div>
  )
}

const SLICES = 8
const TWO_PI = Math.PI * 2

/** The music roulette: spin, watch it slow down, play what it lands on. */
export function Roulette({
  songs,
  hue,
  onWin
}: {
  songs: Song[]
  hue: number
  onWin: (x: number, y: number) => void
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [pick, setPick] = useState<Song[]>([])
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<Song | null>(null)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const state = useRef({ angle: 0, vel: 0, tick: 0, lastSlice: -1 })
  const raf = useRef(0)

  useEffect(() => {
    if (songs.length) setPick(roulettePick(songs))
  }, [songs])

  const draw = (): void => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = c.clientWidth
    if (c.width !== Math.round(size * dpr)) {
      c.width = Math.round(size * dpr)
      c.height = Math.round(size * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const cx = size / 2
    const cy = size / 2 + 6
    const R = size / 2 - 14
    const n = Math.max(1, pick.length || SLICES)
    const seg = TWO_PI / n
    const S = state.current
    // slices
    for (let i = 0; i < n; i++) {
      const a0 = S.angle + i * seg
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, R, a0, a0 + seg)
      ctx.closePath()
      ctx.fillStyle = `hsl(${hue + i * (300 / n)}, 80%, ${i % 2 ? 52 : 60}%)`
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 2
      ctx.stroke()
      // title along the radius
      const s = pick[i]
      if (s) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(a0 + seg / 2)
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif"
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        let t = s.title
        while (t.length > 2 && ctx.measureText(t).width > R * 0.62) t = t.slice(0, -1)
        ctx.fillText(t === s.title ? t : t + '…', R - 12, 0)
        ctx.restore()
      }
    }
    // rim lights
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TWO_PI
      const on = (Math.floor(performance.now() / 120) + i) % 2 === 0 || !spinning
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6), 3, 0, TWO_PI)
      ctx.fillStyle = on ? '#fff7cc' : 'rgba(255,255,255,0.25)'
      ctx.fill()
    }
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.beginPath()
    ctx.arc(cx, cy, R + 1, 0, TWO_PI)
    ctx.stroke()
    // hub
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.17, 0, TWO_PI)
    ctx.fillStyle = '#111'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = "700 20px 'Segoe UI Symbol', system-ui, sans-serif"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♫', cx, cy + 1)
    // pointer (wiggles each time it passes a peg)
    ctx.save()
    ctx.translate(cx, cy - R - 4)
    ctx.rotate(-S.tick * 0.5)
    ctx.beginPath()
    ctx.moveTo(-11, -12)
    ctx.lineTo(11, -12)
    ctx.lineTo(0, 12)
    ctx.closePath()
    ctx.fillStyle = '#fff'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 6
    ctx.fill()
    ctx.restore()
  }

  // redraw when the songs or colour change
  useEffect(() => {
    draw()
  })
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const sliceAtPointer = (): number => {
    const n = pick.length
    const seg = TWO_PI / n
    const rel = (((-Math.PI / 2 - state.current.angle) % TWO_PI) + TWO_PI) % TWO_PI
    return Math.floor(rel / seg) % n
  }

  const spin = (): void => {
    if (spinning || pick.length === 0) return
    setWinner(null)
    setSpinning(true)
    const S = state.current
    S.vel = 16 + Math.random() * 10
    let last = performance.now()
    const step = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      S.angle += S.vel * dt
      S.vel *= Math.exp(-1.15 * dt)
      if (S.vel < 1.2) S.vel -= 0.9 * dt // the last, slow clicks
      const sl = sliceAtPointer()
      if (sl !== S.lastSlice) {
        S.lastSlice = sl
        S.tick = 1
      }
      S.tick *= 0.8
      draw()
      if (S.vel > 0.02) raf.current = requestAnimationFrame(step)
      else {
        S.vel = 0
        S.tick = 0
        draw()
        setSpinning(false)
        const w = pick[sliceAtPointer()]
        setWinner(w)
        const r = canvasRef.current?.getBoundingClientRect()
        if (r) onWin(r.left + r.width / 2, r.top + r.height / 2)
      }
    }
    raf.current = requestAnimationFrame(step)
  }

  return (
    <div className="glass fade-rise rounded-3xl p-5">
      <SectionTitle emoji="🎡" title="Roleta musical" hint="deixa a sorte escolher" />
      {songs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Importe músicas para girar a roleta.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <canvas ref={canvasRef} className="aspect-square w-56 cursor-pointer" onClick={spin} />
          <div className="flex min-w-[180px] flex-1 flex-col gap-3">
            {winner ? (
              <div className="fade-rise flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                <CoverArt src={winner.coverPath} title={winner.title} size="md" rounded="xl" />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-muted">A roleta escolheu</p>
                  <p className="truncate font-semibold">{winner.title}</p>
                  <p className="truncate text-xs text-muted">{winner.artist ?? '—'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                {spinning ? 'Girando… 🤞' : 'Clique na roleta ou no botão e veja qual música o destino escolhe para você.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {winner ? (
                <button
                  onClick={() => playQueue([winner], 0)}
                  className="press flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
                >
                  <Play size={13} fill="white" /> Tocar
                </button>
              ) : (
                <button
                  onClick={spin}
                  disabled={spinning}
                  className="press flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <RotateCw size={13} /> Girar
                </button>
              )}
              {winner && (
                <button
                  onClick={spin}
                  className="press flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold"
                >
                  <RotateCw size={13} /> Girar de novo
                </button>
              )}
              <button
                onClick={() => {
                  setWinner(null)
                  setPick(roulettePick(songs))
                }}
                disabled={spinning}
                className="press flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                <Shuffle size={13} /> Trocar músicas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
