import { useEffect, useRef, useState } from 'react'
import { Camera, Pencil } from 'lucide-react'
import type { Level, Personality } from './worldData'

/**
 * The page's cover: an aurora in the listener's own colour with music notes
 * and bubbles rising, their avatar, name, a line about themselves, their
 * musical personality and level.
 */

export const WORLD_HUES = [265, 330, 15, 40, 145, 185, 210]
const AVATARS = ['🎧', '🦊', '🐱', '🐼', '🦄', '👾', '🤖', '🐸', '🌟', '🔥', '🌈', '🍕']
const NOTES = ['♪', '♫', '♬', '♩']

const PHOTO_SIZE = 320

/**
 * Center-crops and scales a picked image down to a small square JPEG. The
 * photo is stored as a data URL in settings, so a raw multi-megabyte camera
 * picture would bloat the database and slow every settings read.
 */
function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      if (!side) return reject(new Error('empty image'))
      const out = Math.min(PHOTO_SIZE, side)
      const c = document.createElement('canvas')
      c.width = out
      c.height = out
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out)
      resolve(c.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}

function Aurora({ hue }: { hue: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const hueRef = useRef(hue)
  hueRef.current = hue

  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    let raf = 0
    let W = 0
    let H = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const ro = new ResizeObserver(() => {
      W = c.clientWidth
      H = c.clientHeight
      c.width = Math.round(W * dpr)
      c.height = Math.round(H * dpr)
    })
    ro.observe(c)
    const floaters = Array.from({ length: 26 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.4 + Math.random() * 0.8,
      sp: 0.02 + Math.random() * 0.05,
      ph: Math.random() * 6.28,
      note: Math.random() < 0.45 ? Math.floor(Math.random() * NOTES.length) : -1
    }))
    let hueNow = hueRef.current
    const t0 = performance.now()
    let last = t0
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame)
      // a calm background: 30 fps is plenty
      if (document.hidden || !W || now - last < 30) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = (now - t0) / 1000
      hueNow += (((hueRef.current - hueNow + 540) % 360) - 180) * 0.06
      const h = hueNow
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = `hsl(${h}, 45%, 9%)`
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      const blob = (x: number, y: number, r: number, hh: number, a: number): void => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `hsla(${hh}, 90%, 55%, ${a})`)
        g.addColorStop(1, `hsla(${hh}, 90%, 55%, 0)`)
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      blob(W * (0.2 + Math.sin(t * 0.21) * 0.08), H * (0.3 + Math.cos(t * 0.17) * 0.2), H * 1.3, h, 0.45)
      blob(W * (0.65 + Math.cos(t * 0.15) * 0.1), H * (0.8 + Math.sin(t * 0.23) * 0.15), H * 1.2, h + 45, 0.32)
      blob(W * (0.95 + Math.sin(t * 0.12) * 0.05), H * (0.1 + Math.sin(t * 0.3) * 0.1), H * 0.9, h - 50, 0.3)
      ctx.globalCompositeOperation = 'source-over'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const f of floaters) {
        f.y -= f.sp * dt * (0.6 + f.s)
        if (f.y < -0.15) {
          f.y = 1.15
          f.x = Math.random()
        }
        const x = f.x * W + Math.sin(t * 0.8 + f.ph) * 14
        const y = f.y * H
        const a = 0.12 + 0.18 * f.s
        if (f.note >= 0) {
          ctx.globalAlpha = a + 0.1
          ctx.fillStyle = `hsl(${h + f.ph * 10}, 90%, 80%)`
          ctx.font = `700 ${Math.round(12 + f.s * 16)}px 'Segoe UI Symbol', system-ui, sans-serif`
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(Math.sin(t + f.ph) * 0.3)
          ctx.fillText(NOTES[f.note], 0, 0)
          ctx.restore()
        } else {
          ctx.globalAlpha = a
          ctx.strokeStyle = `hsl(${h + 30}, 90%, 85%)`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(x, y, 3 + f.s * 7, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}

export function Hero({
  name,
  photo,
  avatar,
  bio,
  hue,
  greeting,
  personality,
  level,
  onEditName,
  onPhoto,
  onAvatar,
  onBio,
  onHue
}: {
  name: string
  photo: string | null
  avatar: string
  bio: string
  hue: number
  greeting: string
  personality: Personality
  level: Level
  onEditName: () => void
  onPhoto: (dataUrl: string | null) => void
  onAvatar: (emoji: string) => void
  onBio: (bio: string) => void
  onHue: (hue: number) => void
}): JSX.Element {
  const [picker, setPicker] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)

  // close the picker on a click outside it or on Escape
  useEffect(() => {
    if (!picker) return
    const onDown = (e: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPicker(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [picker])

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoError('Esse arquivo não é uma imagem.')
      return
    }
    setPhotoError(null)
    shrinkPhoto(file)
      .then((dataUrl) => {
        onPhoto(dataUrl)
        setPicker(false)
      })
      .catch(() => setPhotoError('Não consegui abrir essa imagem. Tente outra.'))
  }

  return (
    <div className="fade-rise relative z-20 mb-6 rounded-3xl ring-1 ring-white/10">
      {/* only the background is clipped, so the avatar picker can overflow the card */}
      <div className="absolute inset-0 overflow-hidden rounded-3xl">
        <Aurora hue={hue} />
      </div>
      <div className="relative flex flex-wrap items-center gap-6 p-7">
        {/* avatar with a glowing ring */}
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => {
              setPhotoError(null)
              setPicker((v) => !v)
            }}
            aria-haspopup="dialog"
            aria-expanded={picker}
            className="group relative grid h-28 w-28 place-items-center rounded-full p-[3px] transition-transform hover:scale-[1.04]"
            style={{ background: `conic-gradient(from 200deg, hsl(${hue} 95% 65%), hsl(${hue + 60} 95% 65%), hsl(${hue - 40} 95% 65%), hsl(${hue} 95% 65%))` }}
            title="Trocar avatar"
          >
            <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-black/40">
              {photo ? (
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-5xl">{avatar}</span>
              )}
            </span>
            <span className="absolute inset-[3px] hidden place-items-center rounded-full bg-black/45 group-hover:grid">
              <Camera size={20} className="text-white" />
            </span>
          </button>
          {picker && (
            <div
              role="dialog"
              aria-label="Escolha seu avatar"
              className="glass absolute left-0 top-[118px] z-50 w-64 rounded-2xl p-3 text-xs shadow-2xl"
            >
              <p className="mb-2 font-semibold">Escolha seu avatar</p>
              <div className="grid grid-cols-6 gap-1">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      onAvatar(a)
                      if (photo) onPhoto(null)
                      setPicker(false)
                    }}
                    className={`rounded-lg p-1 text-2xl transition-transform hover:scale-125 ${
                      !photo && avatar === a ? 'bg-white/15' : ''
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-2 w-full rounded-full bg-[var(--accent)] px-3 py-1.5 font-semibold text-white"
              >
                {photo ? 'Trocar foto' : 'Usar uma foto minha'}
              </button>
              {photo && (
                <button
                  onClick={() => {
                    onPhoto(null)
                    setPicker(false)
                  }}
                  className="mt-1.5 w-full rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/15"
                >
                  Remover foto
                </button>
              )}
              {photoError && <p className="mt-2 text-center text-red-300">{photoError}</p>}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/70">{greeting},</p>
          <button onClick={onEditName} className="group flex items-center gap-2 text-left">
            <h1 className="truncate text-4xl font-bold tracking-tight text-white drop-shadow">{name}</h1>
            <Pencil size={16} className="text-white/60 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <input
            value={bio}
            onChange={(e) => onBio(e.target.value)}
            maxLength={90}
            placeholder="Escreva uma frase que é a sua cara…"
            className="mt-1 w-full max-w-md bg-transparent text-sm text-white/85 placeholder:text-white/40 focus:outline-none"
          />
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white ring-1 ring-white/15">
            <span className="text-base">{personality.emoji}</span>
            <span className="font-semibold">{personality.title}</span>
            <span className="hidden text-white/60 md:inline">· {personality.line}</span>
          </div>
        </div>

        {/* level */}
        <div className="w-full rounded-2xl bg-black/30 p-4 text-white ring-1 ring-white/10 sm:w-60">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-widest text-white/60">Nível</span>
            <span className="text-[11px] text-white/60">{level.xp.toLocaleString('pt-BR')} XP</span>
          </div>
          <p className="text-4xl font-black leading-tight">{level.level}</p>
          <p className="text-sm font-semibold" style={{ color: `hsl(${hue} 95% 78%)` }}>
            {level.title}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full origin-left rounded-full transition-transform duration-700"
              style={{
                transform: `scaleX(${Math.max(0.03, level.progress)})`,
                background: `linear-gradient(90deg, hsl(${hue} 95% 60%), hsl(${hue + 50} 95% 68%))`
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-white/60">
            Faltam {level.toNext.toLocaleString('pt-BR')} XP para o nível {level.level + 1}
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="mr-1 text-[10px] uppercase tracking-wider text-white/50">Cor</span>
            {WORLD_HUES.map((h) => (
              <button
                key={h}
                onClick={() => onHue(h)}
                aria-label="Cor do seu mundo"
                className={`h-4 w-4 rounded-full transition-transform hover:scale-125 ${
                  h === hue ? 'ring-2 ring-white ring-offset-1 ring-offset-black/40' : ''
                }`}
                style={{ background: `hsl(${h} 90% 60%)` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
