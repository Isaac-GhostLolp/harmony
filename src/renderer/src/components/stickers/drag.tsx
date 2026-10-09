import type React from 'react'
import { create } from 'zustand'
import { useStickerStore } from '@/store/stickerStore'
import { StickerArt, STICKER_PX, STICKER_REL } from './art'

/**
 * Dragging stickers: from the tray onto a zone, or from one place to another
 * (any zone). While dragging, the sticker rides a ghost that floats over
 * everything at the size it will have where it lands; the zone under the
 * pointer lights up. Dropped on the tray (or outside every zone), a placed
 * sticker is peeled off. A press that never moves is a click: on the tray it
 * sticks the sticker on the sidebar, on a placed sticker it just selects it.
 */

interface Drag {
  id: string
  r: number
  x: number
  y: number
  size: number
}

export const useDragStore = create<{ drag: Drag | null }>(() => ({ drag: null }))

type Target = { zone: string; layer: HTMLElement } | 'tray' | null

function targetAt(x: number, y: number): Target {
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  if (el.closest('[data-stk-tray]')) return 'tray'
  const host = el.closest('[data-stk-host]')
  const layer = host?.querySelector<HTMLElement>(':scope > .stk-zone')
  return layer ? { zone: layer.dataset.stkZone!, layer } : null
}

function sizeIn(t: Target, s: number, fallback: number): number {
  if (!t || t === 'tray') return fallback
  if (t.layer.dataset.stkRel) {
    const r = t.layer.getBoundingClientRect()
    return Math.min(r.width, r.height) * STICKER_REL * s
  }
  return STICKER_PX * s
}

export function beginDrag(
  e: React.PointerEvent<HTMLElement>,
  info: { id: string; key?: string; r: number; s: number }
): void {
  const st = useStickerStore.getState()
  if (info.key && !st.editing) return
  if (info.key) st.select(info.key)
  const source = e.currentTarget
  const startSize = info.key ? source.offsetWidth : STICKER_PX
  const sx = e.clientX
  const sy = e.clientY
  let started = false
  let lit: HTMLElement | null = null

  const light = (t: Target): void => {
    const next = t && t !== 'tray' ? t.layer : null
    if (next === lit) return
    lit?.removeAttribute('data-stk-over')
    next?.setAttribute('data-stk-over', '')
    lit = next
  }

  const onMove = (ev: PointerEvent): void => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return
      started = true
      if (info.key) source.classList.add('is-dragging')
      document.documentElement.classList.add('stk-dragging')
    }
    const t = targetAt(ev.clientX, ev.clientY)
    light(t)
    useDragStore.setState({
      drag: { id: info.id, r: info.r, x: ev.clientX, y: ev.clientY, size: sizeIn(t, info.s, startSize) }
    })
  }

  const finish = (ev: PointerEvent, cancelled: boolean): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    light(null)
    source.classList.remove('is-dragging')
    document.documentElement.classList.remove('stk-dragging')
    useDragStore.setState({ drag: null })
    const store = useStickerStore.getState()
    if (cancelled) return
    if (!started) {
      // a click on the tray: stick it somewhere on the sidebar
      if (!info.key) store.add(info.id, 'sidebar', 0.2 + Math.random() * 0.6, 0.55 + Math.random() * 0.35)
      return
    }
    const t = targetAt(ev.clientX, ev.clientY)
    if (!t || t === 'tray') {
      if (info.key) store.remove(info.key)
      return
    }
    const r = t.layer.getBoundingClientRect()
    const fx = (ev.clientX - r.left) / r.width
    const fy = (ev.clientY - r.top) / r.height
    if (info.key) store.move(info.key, t.zone, fx, fy)
    else store.add(info.id, t.zone, fx, fy)
  }
  const onUp = (ev: PointerEvent): void => finish(ev, false)
  const onCancel = (ev: PointerEvent): void => finish(ev, true)

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}

export function DragGhost(): JSX.Element | null {
  const drag = useDragStore((s) => s.drag)
  if (!drag) return null
  return (
    <div
      className="stk-ghost"
      style={{
        width: drag.size,
        left: drag.x,
        top: drag.y,
        transform: `translate(-50%, -50%) rotate(${drag.r}deg) scale(1.08)`
      }}
    >
      <StickerArt id={drag.id} />
    </div>
  )
}
