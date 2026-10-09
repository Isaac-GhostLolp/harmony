import { findSticker } from './catalog'
import { useStickerStore } from '@/store/stickerStore'
import { mediaUrl } from '@/utils/format'

export const STICKER_PX = 54
/** a rel zone's sticker, as a share of the zone's shorter side */
export const STICKER_REL = 0.42

/**
 * One sticker's art on the 100×100 board. The user's own stickers ('u:…')
 * are their image placed in the same board, so they get the same die-cut
 * border (it follows the image's transparency; a photo gets a rounded white
 * frame) and the same size as the built-in ones. An <image> inside an SVG
 * never runs scripts, so an SVG file is safe here; GIFs keep animating.
 */
export function StickerArt({ id, className = '' }: { id: string; className?: string }): JSX.Element | null {
  const custom = useStickerStore((s) => (id.startsWith('u:') ? s.library.find((c) => c.id === id) : undefined))
  if (custom) {
    return (
      <svg viewBox="0 0 100 100" className={`stk-art stk-a-${custom.anim} ${className}`} aria-hidden>
        <g filter={custom.outline ? 'url(#stk-cut)' : 'url(#stk-shadow)'}>
          <image
            href={mediaUrl(custom.path)}
            x="9"
            y="9"
            width="82"
            height="82"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    )
  }
  const def = findSticker(id)
  if (!def) return null
  return (
    <svg viewBox="0 0 100 100" className={`stk-art stk-a-${def.anim} ${className}`} aria-hidden>
      <g filter="url(#stk-cut)">{def.art}</g>
    </svg>
  )
}
