import { createElement, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useIconStore, type CustomPack } from '@/store/iconStore'
import { mediaUrl } from '@/utils/format'
import { slotDef, type IconSlot } from './slots'

/**
 * One icon of the sidebar or the player bar, drawn the way the chosen pack
 * draws it. Most packs restyle the line icons (duotone fill, neon glow, a
 * gradient stroke, a die-cut border, a hand-drawn wobble); Colorido puts the
 * sidebar's icons on tiles of their own colour; Emoji and Terminal use
 * characters; Pixel turns each line icon into real pixel art (rasterised
 * once on a 12×12 grid and drawn as crisp squares). A user's pack shows
 * their image for the slots they filled and the base pack for the rest.
 *
 * `active` is for toggles (shuffle, repeat, lyrics): line-based packs follow
 * the button's own colour, packs with colours of their own fade when off.
 */

interface Props {
  slot: IconSlot
  size?: number
  strokeWidth?: number
  active?: boolean
  /** draw with this pack instead of the chosen one (previews) */
  pack?: string
  className?: string
}

export function AppIcon({ slot, size = 18, strokeWidth = 2, active, pack, className = '' }: Props): JSX.Element {
  const chosen = useIconStore((s) => pack ?? s.pack)
  const mine = useIconStore((s) => (chosen.startsWith('mine:') ? s.mine.find((m) => `mine:${m.id}` === chosen) : undefined))
  const off = active === false
  if (mine) {
    const path = mine.icons[slot]
    if (path) return <CustomIcon pack={mine} path={path} size={size} off={off} className={className} />
    return <BuiltinIcon pack={mine.base} slot={slot} size={size} strokeWidth={strokeWidth} off={off} className={className} />
  }
  return <BuiltinIcon pack={chosen} slot={slot} size={size} strokeWidth={strokeWidth} off={off} className={className} />
}

function CustomIcon({
  pack,
  path,
  size,
  off,
  className
}: {
  pack: CustomPack
  path: string
  size: number
  off: boolean
  className: string
}): JSX.Element {
  const url = mediaUrl(path)!
  const maskId = `ip-mask-${useId().replace(/:/g, '')}`
  if (pack.tint) {
    // painted with the button's colour: the image only gives the shape (an
    // SVG mask needs no CORS, unlike a CSS mask on the media scheme)
    return (
      <svg aria-hidden width={size} height={size} viewBox="0 0 100 100" className={`ip-icon shrink-0 ${className}`}>
        <defs>
          <mask id={maskId} style={{ maskType: 'alpha' }}>
            <image href={url} width="100" height="100" preserveAspectRatio="xMidYMid meet" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
    )
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className={`ip-icon shrink-0 object-contain ${off ? 'ip-off' : ''} ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

function BuiltinIcon({
  pack,
  slot,
  size,
  strokeWidth,
  off,
  className
}: {
  pack: string
  slot: IconSlot
  size: number
  strokeWidth: number
  off: boolean
  className: string
}): JSX.Element {
  const def = slotDef(slot)
  const own = def.color !== 'inherit' ? def.color : undefined
  const liked = slot === 'liked'
  const line = (style: CSSProperties = {}, sw = strokeWidth, cls = ''): JSX.Element =>
    createElement(def.icon, {
      size,
      strokeWidth: sw,
      'aria-hidden': true,
      className: `ip-icon shrink-0 ${cls} ${className}`,
      style: {
        ...(def.filled ? { fill: 'currentColor' } : {}),
        ...(liked ? { color: 'var(--accent)' } : {}),
        ...style
      }
    })

  switch (pack) {
    case 'duotone':
      return line(def.filled ? {} : { fill: 'color-mix(in srgb, var(--accent) 45%, transparent)' })
    case 'neon':
      return line({}, 1.6, 'ip-neon')
    case 'gradient':
      return line({ stroke: 'url(#ip-grad)', ...(def.filled ? { fill: 'url(#ip-grad)' } : {}) }, strokeWidth + 0.2)
    case 'sketch':
      return line({ filter: 'url(#ip-sketch)' }, strokeWidth + 0.3, 'ip-sketch')
    case 'sticker':
      return line(
        { color: liked ? 'var(--accent)' : own, filter: 'url(#ip-cut)' },
        2.4,
        off ? 'ip-off' : ''
      )
    case 'color':
      if (def.group === 'sidebar') {
        const inner = Math.round(size * 0.72)
        return (
          <span
            aria-hidden
            className={`ip-icon ip-tile grid shrink-0 place-items-center ${className}`}
            style={{ width: size + 3, height: size + 3, background: own }}
          >
            {createElement(def.icon, { size: inner, strokeWidth: 2.2, color: '#fff' })}
          </span>
        )
      }
      return line({ color: liked ? 'var(--accent)' : own }, strokeWidth, off ? 'ip-off' : '')
    case 'emoji':
      return (
        <span
          aria-hidden
          className={`ip-icon ip-emoji inline-grid shrink-0 place-items-center ${off ? 'ip-off' : ''} ${className}`}
          style={{ width: size, height: size, fontSize: size * 0.92 }}
        >
          {def.emoji}
        </span>
      )
    case 'terminal':
      return (
        <span
          aria-hidden
          className={`ip-icon ip-term inline-grid shrink-0 place-items-center ${className}`}
          style={{ width: Math.max(size, def.term.length * size * 0.42), height: size, fontSize: size * (def.term.length > 2 ? 0.58 : 0.7) }}
        >
          {def.term}
        </span>
      )
    case 'pixel':
      return <PixelIcon slot={slot} size={size} className={`${liked ? 'text-[var(--accent)]' : ''} ${className}`} />
    default:
      return line()
  }
}

/* ---------- Pixel: line icons rasterised on a small grid ---------- */

const GRID = 12
const pixelCache = new Map<IconSlot, Promise<string>>()

/** the cells (as an SVG path) that the icon's markup covers on the grid */
function pixelPath(slot: IconSlot, markup: () => string): Promise<string> {
  let p = pixelCache.get(slot)
  if (p) return p
  p = new Promise<string>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = GRID
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, GRID, GRID)
      const a = g.getImageData(0, 0, GRID, GRID).data
      let d = ''
      for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++) if (a[(y * GRID + x) * 4 + 3] > 82) d += `M${x} ${y}h1v1h-1z`
      resolve(d)
    }
    img.onerror = () => resolve('')
    let svg = markup()
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
  pixelCache.set(slot, p)
  return p
}

function PixelIcon({ slot, size, className }: { slot: IconSlot; size: number; className: string }): JSX.Element {
  const [d, setD] = useState('')
  const source = useRef<HTMLSpanElement>(null)
  const def = slotDef(slot)
  useEffect(() => {
    let live = true
    void pixelPath(slot, () => source.current?.innerHTML ?? '').then((v) => live && setD(v))
    return () => {
      live = false
    }
  }, [slot])
  return (
    <>
      {/* the line icon it is made from, drawn black and thick, never shown */}
      {!d && (
        <span ref={source} hidden>
          {createElement(def.icon, { size: 96, strokeWidth: 1.9, color: '#000', fill: def.filled ? '#000' : 'none' })}
        </span>
      )}
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox={`0 0 ${GRID} ${GRID}`}
        shapeRendering="crispEdges"
        className={`ip-icon shrink-0 ${className}`}
      >
        <path d={d} fill="currentColor" />
      </svg>
    </>
  )
}

/* ---------- shared SVG defs (gradient, die cut, sketch) ---------- */

export function IconDefs(): JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="ip-grad" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0" style={{ stopColor: 'var(--accent)' }} />
          <stop offset=".55" stopColor="#ff5fa2" />
          <stop offset="1" stopColor="#ffc857" />
        </linearGradient>
        {/* the sticker look at icon scale: a round white border and a small shadow */}
        <filter id="ip-cut" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.15" />
          <feComponentTransfer result="grown">
            <feFuncA type="linear" slope="16" intercept="-0.6" />
          </feComponentTransfer>
          <feFlood floodColor="#fff" />
          <feComposite in2="grown" operator="in" result="border" />
          <feGaussianBlur in="grown" stdDeviation=".7" />
          <feOffset dy=".9" result="blurred" />
          <feFlood floodColor="#000" floodOpacity=".4" />
          <feComposite in2="blurred" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="border" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* hand drawn: the lines pushed around by a slow noise */}
        <filter id="ip-sketch" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency=".13" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="a" />
          {/* a second, fainter pass of the pencil, slightly off */}
          <feTurbulence type="fractalNoise" baseFrequency=".17" numOctaves="1" seed="31" result="noise2" />
          <feDisplacementMap in="SourceGraphic" in2="noise2" scale="3.6" xChannelSelector="G" yChannelSelector="R" result="b" />
          <feComponentTransfer in="b" result="faint">
            <feFuncA type="linear" slope=".45" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="faint" />
            <feMergeNode in="a" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}
