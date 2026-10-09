import { memo, useEffect, useMemo, useRef } from 'react'
import { useStickerStore, stickerAnim, type PlacedSticker } from '@/store/stickerStore'
import { StickerArt, STICKER_PX, STICKER_REL } from './art'
import { watchBeat } from './beat'
import { beginDrag } from './drag'

/**
 * The layer that holds the stickers of one zone. The zone's container marks
 * itself with `data-stk-host` and renders this as a direct child; the layer
 * covers it, never takes clicks (the app underneath works as usual), and
 * only while sticking (html.stk-editing) do the stickers themselves become
 * draggable.
 *
 * Fixed zones (sidebar, player) size stickers in pixels; `rel` zones (the
 * playlist covers, shown big and small) size them by the zone itself, so a
 * sticker covers the same part of the cover everywhere.
 */

const Sticker = memo(function Sticker({
  p,
  rel,
  selected
}: {
  p: PlacedSticker
  rel: boolean
  selected: boolean
}): JSX.Element {
  return (
    <div
      className={`stk${selected ? ' is-selected' : ''}`}
      data-stk-key={p.key}
      style={{
        left: `${p.x * 100}%`,
        top: `${p.y * 100}%`,
        width: rel ? `calc(${STICKER_REL * 100}cqmin * ${p.s})` : `${STICKER_PX * p.s}px`,
        transform: `translate(-50%, -50%) rotate(${p.r}deg)`
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        beginDrag(e, { id: p.id, key: p.key, r: p.r, s: p.s })
      }}
      // the sticker may sit on a button (a playlist card): keep the click here
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onWheel={(e) => {
        const st = useStickerStore.getState()
        if (!st.editing) return
        e.stopPropagation()
        st.select(p.key)
        const dir = e.deltaY < 0 ? 1 : -1
        if (e.shiftKey) st.tweak(p.key, { r: p.r + dir * 10 })
        else st.tweak(p.key, { s: p.s * (dir > 0 ? 1.08 : 1 / 1.08) })
      }}
    >
      <StickerArt id={p.id} />
    </div>
  )
})

export function StickerZone({ zone, label, rel = false }: { zone: string; label: string; rel?: boolean }): JSX.Element {
  const all = useStickerStore((s) => s.placed)
  const selected = useStickerStore((s) => s.selected)
  const mine = useMemo(() => all.filter((p) => p.zone === zone), [all, zone])
  const ref = useRef<HTMLDivElement>(null)
  const library = useStickerStore((s) => s.library)
  const dances = useMemo(() => mine.some((p) => stickerAnim(p.id) === 'beat'), [mine, library])

  useEffect(() => {
    if (!dances || !ref.current) return
    return watchBeat(ref.current)
  }, [dances])

  return (
    <div
      ref={ref}
      className={`stk-zone${rel ? ' stk-rel' : ''}`}
      data-stk-zone={zone}
      data-stk-label={label}
      data-stk-rel={rel ? '1' : undefined}
    >
      {mine.map((p) => (
        <Sticker key={p.key} p={p} rel={rel} selected={selected === p.key} />
      ))}
    </div>
  )
}
