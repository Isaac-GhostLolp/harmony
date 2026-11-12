import { ListMusic, Sparkles } from 'lucide-react'
import type { Playlist } from '@/types'
import { mediaUrl } from '@/utils/format'

/**
 * A playlist's cover: its photo (an animated GIF moves), or a 2×2 mosaic of
 * its songs' covers, or its emoji, or a plain icon — over its colour.
 */
/** a cover file that's gone: hidden, so the colour (and the emoji) show instead of a broken image */
const hide = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  e.currentTarget.style.visibility = 'hidden'
}

export function PlaylistCover({
  playlist,
  mosaic,
  iconSize = 30,
  emojiClass = 'text-5xl',
  className = '',
  spin = false
}: {
  playlist: Pick<Playlist, 'image' | 'emoji' | 'color' | 'rules'>
  mosaic?: string[]
  iconSize?: number
  emojiClass?: string
  className?: string
  /** the disc header: it turns while the playlist plays */
  spin?: boolean
}): JSX.Element {
  const tiles = (mosaic ?? []).map((p) => mediaUrl(p)).filter((u): u is string => Boolean(u))
  const bg = playlist.color
    ? `linear-gradient(135deg, ${playlist.color}, ${playlist.color}55)`
    : 'linear-gradient(135deg, var(--accent-soft), transparent)'
  return (
    <div className={`relative grid place-items-center overflow-hidden ${spin ? 'pl-disc-spin' : ''} ${className}`} style={{ background: bg }}>
      {playlist.image ? (
        <img src={playlist.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : tiles.length >= 2 ? (
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          {[0, 1, 2, 3].map((i) => (
            <img key={i} src={tiles[i % tiles.length]} alt="" className="h-full w-full object-cover" loading="lazy" onError={hide} />
          ))}
          {playlist.emoji && (
            <span className={`absolute inset-0 grid place-items-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] ${emojiClass}`}>{playlist.emoji}</span>
          )}
        </div>
      ) : tiles.length === 1 ? (
        <>
          <img src={tiles[0]} alt="" className="absolute inset-0 h-full w-full object-cover" onError={hide} />
          {playlist.emoji && <span className={`absolute inset-0 grid place-items-center drop-shadow ${emojiClass}`}>{playlist.emoji}</span>}
        </>
      ) : playlist.emoji ? (
        <span className={`drop-shadow ${emojiClass}`}>{playlist.emoji}</span>
      ) : playlist.rules ? (
        <Sparkles size={iconSize} className="text-white/75" />
      ) : (
        <ListMusic size={iconSize} className="text-white/70" />
      )}
    </div>
  )
}
