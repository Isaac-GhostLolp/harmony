import { Music2 } from 'lucide-react'
import { mediaUrl } from '@/utils/format'

/**
 * Cover art with a graceful fallback. When there's no image, instead of a flat
 * generic icon we render a soft two-tone gradient derived deterministically
 * from the title (so each song/album keeps its own colors) plus its initial.
 * Small, warm, and consistent — a placeholder that still feels cared for.
 */

function hashHue(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) & 0xffffff
  return h % 360
}

export function CoverArt({
  src,
  title,
  size = 'md',
  rounded = 'lg',
  className = ''
}: {
  src: string | null
  title?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  rounded?: 'lg' | 'xl' | '2xl' | 'full'
  className?: string
}): JSX.Element {
  const url = mediaUrl(src ?? null)
  const label = (title ?? '').trim()
  const initial = label ? label[0].toUpperCase() : ''
  const hue = label ? hashHue(label) : 250

  const sizes: Record<string, string> = {
    sm: 'h-9 w-9 text-sm',
    md: 'h-14 w-14 text-lg',
    lg: 'h-40 w-40 text-5xl',
    xl: 'h-52 w-52 text-6xl',
    full: 'h-full w-full text-4xl'
  }
  const rounds: Record<string, string> = {
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full'
  }
  const box = `relative grid shrink-0 place-items-center overflow-hidden ${sizes[size]} ${rounds[rounded]} ${className}`

  if (url) {
    return (
      <div className={box}>
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    )
  }

  return (
    <div
      className={box}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 50% 26%))`
      }}
    >
      {initial ? (
        <span className="font-semibold text-white/90 drop-shadow">{initial}</span>
      ) : (
        <Music2 className="text-white/70" />
      )}
      {/* subtle sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-white/5" />
    </div>
  )
}
