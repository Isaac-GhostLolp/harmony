import type { World, WorldContext } from './types'
import { BH, BW, glowSprite, makeLayer, rng, type Layer, type View } from './kit'
import { canvasDpr } from '@/utils/perf'

/**
 * ☕ Coffee Shop — the coziest world. A corner of a little café on a rainy
 * evening: a big window onto a wet city (lit windows, out-of-focus street
 * lights, now and then a car gliding by), rain beading and trickling down the
 * glass, two pendant lamps pouring warm light with dust floating in it,
 * fairy lights, a shelf of books and plants, a soft neon "café", a cat asleep
 * on the sill and, on the table, a latte whose steam curls up.
 *
 * Calm first: nothing flashes, nothing hurries. The music only makes the
 * lights breathe and the steam sway. The sky follows the clock (grey rainy
 * afternoon, violet dusk, blue night).
 *
 * Everything that doesn't move is painted once into offscreen layers (redone
 * on resize or when the sky changes); each frame only animates the living
 * bits. The scene is designed on a 1600×900 board, scaled to cover the screen.
 */

// the window, on the board
const WIN = { x: 230, y: 110, w: 820, h: 450 }
const SILL_Y = WIN.y + WIN.h

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** A car seen through the rain, out of focus: a dark sedan facing right. */
function carSprite(): Layer {
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 150
  const g = c.getContext('2d')!
  g.filter = 'blur(3px)'
  g.fillStyle = '#0b0d13'
  g.beginPath()
  g.moveTo(28, 118)
  g.lineTo(30, 88)
  g.quadraticCurveTo(34, 74, 70, 70)
  g.lineTo(120, 66)
  g.quadraticCurveTo(150, 34, 200, 32)
  g.lineTo(250, 32)
  g.quadraticCurveTo(286, 34, 312, 64)
  g.lineTo(352, 72)
  g.quadraticCurveTo(372, 78, 372, 96)
  g.lineTo(370, 118)
  g.closePath()
  g.fill()
  // windows catching a little of the city light
  g.fillStyle = 'rgba(150,140,130,0.22)'
  g.beginPath()
  g.moveTo(134, 66)
  g.quadraticCurveTo(156, 42, 196, 40)
  g.lineTo(214, 40)
  g.lineTo(214, 66)
  g.closePath()
  g.moveTo(224, 40)
  g.lineTo(250, 40)
  g.quadraticCurveTo(278, 42, 298, 66)
  g.lineTo(224, 66)
  g.closePath()
  g.fill()
  // wheels
  g.fillStyle = '#040508'
  for (const wx of [100, 300]) {
    g.beginPath()
    g.arc(wx, 116, 24, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

/** An out-of-focus light: flat disc with a slightly brighter rim (lens bokeh). */
function bokehSprite(rgb: string, size = 96): Layer {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const r = size / 2
  const grd = g.createRadialGradient(r, r, 0, r, r, r)
  grd.addColorStop(0, `rgba(${rgb},0.55)`)
  grd.addColorStop(0.78, `rgba(${rgb},0.62)`)
  grd.addColorStop(0.9, `rgba(${rgb},0.75)`)
  grd.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grd
  g.beginPath()
  g.arc(r, r, r, 0, Math.PI * 2)
  g.fill()
  return c
}

function mix(a: [number, number, number], b: [number, number, number], k: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`
}

// ---------------------------------------------------------------------------
// sky by time of day
// ---------------------------------------------------------------------------

interface Sky {
  key: string
  top: [number, number, number]
  bottom: [number, number, number]
  far: string
  near: string
  /** share of building windows lit */
  lit: number
  /** how much the city lights glow (night = 1) */
  night: number
}

function skyFor(dayPhase: number): Sky {
  const h = dayPhase * 24
  if (h >= 8 && h < 17)
    return { key: 'day', top: [92, 104, 120], bottom: [150, 152, 150], far: '#5d6672', near: '#3b4048', lit: 0.05, night: 0.25 }
  if (h >= 17 && h < 20)
    return { key: 'dusk', top: [52, 44, 82], bottom: [196, 118, 88], far: '#3a3350', near: '#241f33', lit: 0.22, night: 0.65 }
  if (h >= 5 && h < 8)
    return { key: 'dawn', top: [46, 58, 92], bottom: [170, 128, 120], far: '#333a52', near: '#1f2436', lit: 0.16, night: 0.55 }
  return { key: 'night', top: [10, 16, 34], bottom: [30, 42, 66], far: '#18203a', near: '#0d1222', lit: 0.3, night: 1 }
}

// ---------------------------------------------------------------------------
// static layers
// ---------------------------------------------------------------------------

/** The city outside: sky, two rows of buildings with lit windows. */
function paintOutside(g: CanvasRenderingContext2D, sky: Sky): void {
  const { x, y, w, h } = WIN
  const grd = g.createLinearGradient(0, y, 0, y + h)
  grd.addColorStop(0, mix(sky.top, sky.top, 0))
  grd.addColorStop(1, mix(sky.bottom, sky.bottom, 0))
  g.fillStyle = grd
  g.fillRect(x, y, w, h)

  const r = rng(11)
  // the city is out of focus: we look at the room, not the street
  g.filter = 'blur(2.6px)'
  const row = (base: number, minH: number, maxH: number, color: string, winSize: number, litShare: number): void => {
    let bx = x - 20
    while (bx < x + w + 20) {
      const bw = 60 + r() * 110
      const bh = minH + r() * (maxH - minH)
      const top = base - bh
      g.fillStyle = color
      g.fillRect(bx, top, bw, bh + 200)
      // a few roofs get a little water tower or antenna
      if (r() < 0.25) g.fillRect(bx + bw * 0.3, top - 14, 10, 14)
      // windows
      for (let wy = top + 10; wy < base - 6; wy += winSize * 2.2) {
        for (let wx = bx + 8; wx < bx + bw - winSize - 4; wx += winSize * 2) {
          if (r() < litShare) {
            const warm = r() < 0.9
            g.fillStyle = warm ? `rgba(255, ${190 + r() * 40}, ${110 + r() * 50}, ${0.45 + r() * 0.4})` : `rgba(150, 210, 255, ${0.35 + r() * 0.3})`
            g.fillRect(wx, wy, winSize, winSize * 1.3)
          }
        }
      }
      bx += bw + 4 + r() * 10
    }
  }
  row(y + h * 0.72, 140, 300, sky.far, 6, sky.lit * 0.8)
  row(y + h + 40, 120, 260, sky.near, 9, sky.lit)
  g.filter = 'none'

  // wet street glow at the bottom of the view
  const street = g.createLinearGradient(0, y + h - 70, 0, y + h)
  street.addColorStop(0, 'rgba(255,170,90,0)')
  street.addColorStop(1, `rgba(255,170,90,${0.18 * sky.night + 0.05})`)
  g.fillStyle = street
  g.fillRect(x, y + h - 70, w, 70)
}

/** Raindrops resting on the glass, condensation, a faint reflection of the lamps. */
function paintGlass(g: CanvasRenderingContext2D): void {
  const { x, y, w, h } = WIN
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  // condensation fogging the lower glass
  const fog = g.createLinearGradient(0, y + h * 0.55, 0, y + h)
  fog.addColorStop(0, 'rgba(210,200,190,0)')
  fog.addColorStop(1, 'rgba(210,200,190,0.16)')
  g.fillStyle = fog
  g.fillRect(x, y, w, h)
  // beaded drops: a dark lens with a bright catch-light
  const r = rng(29)
  for (let i = 0; i < 420; i++) {
    const dx = x + r() * w
    const dy = y + r() * h
    const rad = 0.8 + Math.pow(r(), 3) * 4.5
    g.fillStyle = `rgba(20,24,34,${0.18 + r() * 0.15})`
    g.beginPath()
    g.ellipse(dx, dy, rad, rad * 1.15, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = `rgba(255,236,210,${0.25 + r() * 0.35})`
    g.beginPath()
    g.arc(dx - rad * 0.3, dy - rad * 0.35, Math.max(0.5, rad * 0.35), 0, Math.PI * 2)
    g.fill()
  }
  // the room faintly mirrored in the glass: the two lamps
  for (const lx of [x + w * 0.78, x + w * 0.2]) {
    const ref = g.createRadialGradient(lx, y + 120, 0, lx, y + 120, 70)
    ref.addColorStop(0, 'rgba(255,200,130,0.10)')
    ref.addColorStop(1, 'rgba(255,200,130,0)')
    g.fillStyle = ref
    g.fillRect(lx - 70, y + 50, 140, 140)
  }
  g.restore()
}

function wood(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, seed: number, vertical = false): void {
  g.fillStyle = base
  g.fillRect(x, y, w, h)
  const r = rng(seed)
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  for (let i = 0; i < (vertical ? w : h) / 3; i++) {
    g.strokeStyle = r() < 0.5 ? `rgba(0,0,0,${0.05 + r() * 0.08})` : `rgba(255,210,160,${0.02 + r() * 0.04})`
    g.lineWidth = 0.6 + r() * 1.4
    g.beginPath()
    if (vertical) {
      const lx = x + r() * w
      g.moveTo(lx, y)
      g.bezierCurveTo(lx + (r() - 0.5) * 8, y + h * 0.3, lx + (r() - 0.5) * 8, y + h * 0.7, lx + (r() - 0.5) * 6, y + h)
    } else {
      const ly = y + r() * h
      g.moveTo(x, ly)
      g.bezierCurveTo(x + w * 0.3, ly + (r() - 0.5) * 6, x + w * 0.7, ly + (r() - 0.5) * 6, x + w, ly + (r() - 0.5) * 4)
    }
    g.stroke()
  }
  g.restore()
}

function leaf(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, color: string): void {
  g.save()
  g.translate(x, y)
  g.rotate(ang)
  g.fillStyle = color
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0)
  g.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0)
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.lineWidth = 0.8
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(len * 0.9, 0)
  g.stroke()
  g.restore()
}

function plant(g: CanvasRenderingContext2D, x: number, y: number, size: number, potColor: string, seed: number, trailing = false): void {
  const r = rng(seed)
  // leaves
  const n = 16
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (r() - 0.5) * (trailing ? 2.6 : 1.9)
    const len = size * (0.45 + r() * 0.5)
    const shade = 34 + r() * 22
    leaf(g, x + (r() - 0.5) * size * 0.3, y - size * 0.05, len, ang, `hsl(${100 + r() * 30}, 32%, ${shade}%)`)
  }
  if (trailing) {
    // a vine falling over the edge
    for (let v = 0; v < 2; v++) {
      let vx = x + (v ? size * 0.35 : -size * 0.3)
      let vy = y + size * 0.1
      for (let k = 0; k < 7; k++) {
        vx += (r() - 0.5) * 8 + (v ? 3 : -3)
        vy += size * 0.16
        leaf(g, vx, vy, size * 0.22, (v ? 0.4 : Math.PI - 0.4) + (r() - 0.5) * 0.6, `hsl(${105 + r() * 25}, 30%, ${32 + r() * 18}%)`)
      }
    }
  }
  // pot
  g.fillStyle = potColor
  g.beginPath()
  g.moveTo(x - size * 0.32, y)
  g.lineTo(x + size * 0.32, y)
  g.lineTo(x + size * 0.25, y + size * 0.42)
  g.lineTo(x - size * 0.25, y + size * 0.42)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.08)'
  g.fillRect(x - size * 0.34, y - 3, size * 0.68, 6)
}

/** Wall, window frame, sill, shelf, table and everything resting on them. */
function paintInterior(g: CanvasRenderingContext2D): void {
  const { x, y, w, h } = WIN
  // ---- wall: warm plaster above, wood panelling below
  const wall = g.createLinearGradient(0, 0, 0, BH)
  wall.addColorStop(0, '#2b1c13')
  wall.addColorStop(0.55, '#3a2618')
  wall.addColorStop(1, '#22150c')
  g.fillStyle = wall
  g.fillRect(-400, -200, BW + 800, BH + 400)
  // plaster texture
  const r = rng(5)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,220,180,0.025)'
    g.fillRect(-400 + r() * (BW + 800), -200 + r() * 820, 1 + r() * 3, 1 + r() * 3)
  }
  wood(g, -400, 620, BW + 800, BH + 200, '#2a190e', 3, true)
  // panel lines
  g.fillStyle = 'rgba(0,0,0,0.25)'
  for (let px = -400; px < BW + 400; px += 140) g.fillRect(px, 620, 3, 300)
  g.fillStyle = '#3d2716'
  g.fillRect(-400, 612, BW + 800, 12) // rail

  // cut the window open
  g.save()
  g.globalCompositeOperation = 'destination-out'
  g.fillRect(x, y, w, h)
  g.restore()

  // ---- window frame (wood) with a transom and a centre mullion
  const fw = 16
  g.fillStyle = '#4a2f1c'
  g.fillRect(x - fw, y - fw, w + fw * 2, fw)
  g.fillRect(x - fw, y + h, w + fw * 2, fw)
  g.fillRect(x - fw, y - fw, fw, h + fw * 2)
  g.fillRect(x + w, y - fw, fw, h + fw * 2)
  g.fillRect(x, y + h * 0.26, w, 10) // transom
  g.fillRect(x + w / 2 - 5, y + h * 0.26, 10, h * 0.74) // mullion
  // frame highlight / shadow
  g.fillStyle = 'rgba(255,210,160,0.10)'
  g.fillRect(x - fw, y - fw, w + fw * 2, 3)
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(x, y, w, 6)

  // ---- sill
  wood(g, x - 40, SILL_Y + fw, w + 80, 22, '#5a3a22', 8)
  g.fillStyle = 'rgba(0,0,0,0.4)'
  g.fillRect(x - 40, SILL_Y + fw + 22, w + 80, 8)
  plant(g, x + 70, SILL_Y + fw - 34, 70, '#b46a45', 21)
  // a stack of two books on the sill
  g.fillStyle = '#6b3a3a'
  g.fillRect(x + w - 210, SILL_Y + fw - 18, 90, 18)
  g.fillStyle = '#35505a'
  g.fillRect(x + w - 202, SILL_Y + fw - 32, 76, 14)
  g.fillStyle = 'rgba(255,240,220,0.5)'
  g.fillRect(x + w - 200, SILL_Y + fw - 6, 86, 2)

  // ---- shelf on the right wall
  const sx = 1170
  for (const [sy, seed] of [
    [330, 41],
    [470, 43]
  ] as const) {
    wood(g, sx, sy, 380, 16, '#5a3a22', seed)
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.fillRect(sx, sy + 16, 380, 10)
    // brackets
    g.fillStyle = '#1a1009'
    g.fillRect(sx + 30, sy + 16, 6, 26)
    g.fillRect(sx + 344, sy + 16, 6, 26)
  }
  // books on the top shelf
  const rb = rng(77)
  let bx = sx + 14
  const spines = ['#7a3b2e', '#355a5e', '#8a6a3a', '#4a3a5e', '#5e6b3a', '#7d4f2c', '#2f4a6b', '#8b5a5a']
  while (bx < sx + 210) {
    const bw = 12 + rb() * 12
    const bh = 70 + rb() * 34
    g.fillStyle = spines[Math.floor(rb() * spines.length)]
    g.fillRect(bx, 330 - bh, bw, bh)
    g.fillStyle = 'rgba(255,230,190,0.18)'
    g.fillRect(bx + 2, 330 - bh + 10, bw - 4, 2)
    g.fillRect(bx + 2, 330 - 14, bw - 4, 2)
    bx += bw + 1.5
  }
  // a leaning book, then jars with coffee beans
  g.save()
  g.translate(bx + 6, 330)
  g.rotate(0.28)
  g.fillStyle = '#6b4a2a'
  g.fillRect(0, -86, 16, 86)
  g.restore()
  for (let j = 0; j < 3; j++) {
    const jx = sx + 250 + j * 42
    g.fillStyle = 'rgba(220,235,240,0.18)'
    g.fillRect(jx, 330 - 54, 32, 54)
    g.fillStyle = '#3b2314'
    g.fillRect(jx + 3, 330 - 40 + j * 6, 26, 37 - j * 6)
    g.fillStyle = '#2a2a2a'
    g.fillRect(jx - 1, 330 - 60, 34, 7)
    g.fillStyle = 'rgba(255,255,255,0.25)'
    g.fillRect(jx + 4, 330 - 50, 3, 40)
  }
  // lower shelf: mugs and a trailing plant
  for (let m = 0; m < 3; m++) {
    const mx = sx + 30 + m * 52
    g.fillStyle = ['#d9c9b0', '#a9563e', '#3e5a66'][m]
    g.fillRect(mx, 470 - 34, 34, 34)
    g.strokeStyle = g.fillStyle
    g.lineWidth = 5
    g.beginPath()
    g.arc(mx + 36, 470 - 17, 8, -Math.PI / 2, Math.PI / 2)
    g.stroke()
  }
  plant(g, sx + 290, 470 - 30, 60, '#d8cfc0', 52, true)

  // ---- neon sign board (the tube glow is drawn live)
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.fillRect(1205, 150, 310, 110)

  // ---- table in the foreground
  const ty = 760
  wood(g, -400, ty, BW + 800, BH - ty + 200, '#4a2e1b', 61)
  const edge = g.createLinearGradient(0, ty - 4, 0, ty + 30)
  edge.addColorStop(0, 'rgba(255,210,160,0.18)')
  edge.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = edge
  g.fillRect(-400, ty - 4, BW + 800, 34)

  // an open book with a pencil
  g.save()
  g.translate(520, 830)
  g.rotate(-0.06)
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(-150, -48, 310, 112)
  for (const side of [-1, 1]) {
    g.fillStyle = '#efe4cf'
    g.beginPath()
    g.moveTo(0, -56)
    g.quadraticCurveTo(side * 70, -66, side * 148, -58)
    g.lineTo(side * 148, 50)
    g.quadraticCurveTo(side * 70, 42, 0, 52)
    g.closePath()
    g.fill()
    g.fillStyle = 'rgba(80,60,40,0.35)'
    for (let l = 0; l < 9; l++) {
      const ly = -40 + l * 10
      g.fillRect(side > 0 ? 14 : -132, ly, 104 - (l === 8 ? 50 : (l * 13) % 30), 2)
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.18)'
  g.fillRect(-3, -56, 6, 108)
  g.rotate(0.5)
  g.fillStyle = '#d9a43b'
  g.fillRect(70, 40, 120, 7)
  g.fillStyle = '#e7c9a0'
  g.beginPath()
  g.moveTo(190, 40)
  g.lineTo(204, 43.5)
  g.lineTo(190, 47)
  g.fill()
  g.restore()

  // a small succulent
  plant(g, 1340, 800, 54, '#7f8f86', 91)

  // ---- the latte (cup body; foam and steam are live)
  const cx = 1010
  const cy = 790
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.beginPath()
  g.ellipse(cx + 10, cy + 72, 120, 26, 0, 0, Math.PI * 2)
  g.fill()
  // saucer
  g.fillStyle = '#e9e1d4'
  g.beginPath()
  g.ellipse(cx, cy + 62, 112, 26, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(0,0,0,0.12)'
  g.beginPath()
  g.ellipse(cx, cy + 60, 70, 15, 0, 0, Math.PI * 2)
  g.fill()
  // cup body with soft shading
  const body = g.createLinearGradient(cx - 70, 0, cx + 70, 0)
  body.addColorStop(0, '#cfc3b2')
  body.addColorStop(0.35, '#f4ede2')
  body.addColorStop(1, '#bfb2a0')
  g.fillStyle = body
  g.beginPath()
  g.moveTo(cx - 70, cy - 6)
  g.bezierCurveTo(cx - 68, cy + 40, cx - 46, cy + 62, cx, cy + 62)
  g.bezierCurveTo(cx + 46, cy + 62, cx + 68, cy + 40, cx + 70, cy - 6)
  g.closePath()
  g.fill()
  // handle
  g.strokeStyle = '#e2d8c8'
  g.lineWidth = 11
  g.beginPath()
  g.ellipse(cx + 78, cy + 20, 18, 22, 0, -Math.PI / 2.2, Math.PI / 2.2)
  g.stroke()
  // rim + coffee + latte art
  g.fillStyle = '#efe7da'
  g.beginPath()
  g.ellipse(cx, cy - 6, 70, 17, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#7a4a2a'
  g.beginPath()
  g.ellipse(cx, cy - 5, 62, 13, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#efdcc0'
  g.beginPath() // a little heart in the foam
  g.moveTo(cx, cy + 4)
  g.bezierCurveTo(cx - 34, cy - 4, cx - 22, cy - 18, cx, cy - 9)
  g.bezierCurveTo(cx + 22, cy - 18, cx + 34, cy - 4, cx, cy + 4)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.35)'
  g.beginPath()
  g.ellipse(cx - 40, cy + 20, 5, 22, 0.15, 0, Math.PI * 2)
  g.fill()
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface State {
  v: View
  sky: Sky
  outside: Layer
  glass: Layer
  interior: Layer
  grain: Layer
  warm: Layer
  amber: Layer
  bokehWarm: Layer
  bokehCool: Layer
  bokehRed: Layer
  carBody: Layer
  lights: { x: number; y: number; r: number; kind: 0 | 1; phase: number }[]
  drops: { x: number; y: number; r: number; v: number; pause: number; trail: number[] }[]
  motes: { x: number; y: number; vx: number; vy: number; ph: number }[]
  car: { t: number; dir: number; next: number }
  grainAt: number
  grainX: number
  grainY: number
}

let S: State | null = null

function build(c: WorldContext): State {
  const dpr = c.width > 0 ? canvasDpr() : 1
  const s = Math.max(c.width / BW, c.height / BH)
  const v: View = { w: c.width, h: c.height, dpr, s, ox: (c.width - BW * s) / 2, oy: (c.height - BH * s) / 2 }
  const sky = skyFor(c.dayPhase)
  const r = rng(99)
  const lights: State['lights'] = []
  for (let i = 0; i < 16; i++) {
    lights.push({
      x: WIN.x + 30 + r() * (WIN.w - 60),
      y: WIN.y + WIN.h * (0.35 + r() * 0.6),
      r: 14 + r() * 34,
      kind: r() < 0.88 ? 0 : 1,
      phase: r() * 6.28
    })
  }
  const drops: State['drops'] = []
  for (let i = 0; i < 12; i++) drops.push(newDrop(r, true))
  const motes: State['motes'] = []
  for (let i = 0; i < 46; i++) {
    motes.push({ x: r() * BW, y: 150 + r() * 650, vx: (r() - 0.5) * 6, vy: -2 - r() * 4, ph: r() * 6.28 })
  }
  // grain: a small noise tile, moved around a little each few frames
  const grain = document.createElement('canvas')
  grain.width = grain.height = 160
  const gg = grain.getContext('2d')!
  const img = gg.createImageData(160, 160)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n
    img.data[i + 3] = 255
  }
  gg.putImageData(img, 0, 0)

  return {
    v,
    sky,
    outside: makeLayer(v, (g) => paintOutside(g, sky)),
    glass: makeLayer(v, paintGlass),
    interior: makeLayer(v, paintInterior),
    grain,
    warm: glowSprite('255,190,120'),
    amber: glowSprite('255,150,70'),
    bokehWarm: bokehSprite('255,186,110'),
    bokehCool: bokehSprite('140,200,255'),
    bokehRed: bokehSprite('255,90,70'),
    carBody: carSprite(),
    lights,
    drops,
    motes,
    car: { t: -1, dir: 1, next: 6 + r() * 8 },
    grainAt: 0,
    grainX: 0,
    grainY: 0
  }
}

function newDrop(r: () => number, anywhere = false): State['drops'][number] {
  return {
    x: WIN.x + 10 + r() * (WIN.w - 20),
    y: WIN.y + (anywhere ? r() * WIN.h * 0.7 : r() * WIN.h * 0.25),
    r: 2.2 + r() * 2.6,
    v: 0,
    pause: r() * 4,
    trail: []
  }
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

const rand = Math.random

export const coffeeShopWorld: World = {
  id: 'coffee-shop',
  name: 'Coffee Shop',
  spectrumBins: 12,

  mount(c: WorldContext): void {
    S = build(c)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const dpr = canvasDpr()
    if (
      !S ||
      S.v.w !== width ||
      S.v.h !== height ||
      S.v.dpr !== dpr ||
      S.sky.key !== skyFor(c.dayPhase).key
    )
      S = build(c)
    const st = S
    const { s, ox, oy } = st.v
    // calm music response: a slow "breath" of the lights, a little lift with energy
    const glow = 0.86 + 0.08 * c.breath + 0.1 * c.energy + 0.04 * c.kick

    ctx.save()
    ctx.fillStyle = '#140c07'
    ctx.fillRect(0, 0, width, height)

    // ---- outside: city, street lights, the occasional car, falling rain
    ctx.drawImage(st.outside, 0, 0, width, height)
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(s, s)
    ctx.beginPath()
    ctx.rect(WIN.x, WIN.y, WIN.w, WIN.h)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    for (const l of st.lights) {
      const a = (0.24 + 0.08 * Math.sin(time * 0.35 + l.phase)) * (0.55 + 0.45 * st.sky.night) * (l.kind ? 0.6 : 1)
      ctx.globalAlpha = a
      const sp = l.kind ? st.bokehCool : st.bokehWarm
      ctx.drawImage(sp, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
    }
    // a car gliding past now and then (headlights one way, tail lights the other)
    const car = st.car
    if (car.t < 0) {
      car.next -= dt
      if (car.next <= 0) {
        car.t = 0
        car.dir = rand() < 0.5 ? 1 : -1
      }
    } else {
      // a car glides along the street at the bottom of the view: the body is a
      // dark blur like the rest of the city; it carries its headlights in
      // front and red tail lights behind
      car.t += dt / 11
      const span = WIN.w + 440
      const px = car.dir > 0 ? WIN.x - 220 + car.t * span : WIN.x + WIN.w + 220 - car.t * span
      // the street is below the window: only the roof, windows and lights show
      // above the bottom edge, the wheels stay hidden (otherwise it reads as a
      // toy car driving along the sill)
      const base = WIN.y + WIN.h + 34
      const len = 200
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 0.85
      ctx.save()
      ctx.translate(px, base)
      ctx.scale(car.dir, 1)
      ctx.drawImage(st.carBody, -len / 2, -75, len, 75)
      ctx.restore()
      ctx.globalCompositeOperation = 'lighter'
      const front = px + car.dir * len * 0.44
      const rear = px - car.dir * len * 0.44
      const ly = base - 34
      ctx.globalAlpha = 0.55
      ctx.drawImage(st.bokehWarm, front - 18, ly - 18, 36, 36)
      // the beam on the wet street ahead
      ctx.globalAlpha = 0.18
      ctx.drawImage(st.warm, front + car.dir * 40 - 80, ly - 10, 160, 40)
      ctx.globalAlpha = 0.5
      ctx.drawImage(st.bokehRed, rear - 12, ly - 12, 24, 24)
      if (car.t >= 1) {
        car.t = -1
        car.next = 10 + rand() * 14
      }
    }
    ctx.globalCompositeOperation = 'source-over'
    // rain falling outside, thin and slanted
    ctx.strokeStyle = 'rgba(200,215,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 70; i++) {
      const seed = i * 97.31
      const rx = WIN.x + ((seed * 13.7 + time * 60) % WIN.w)
      const ry = WIN.y + ((seed * 7.3 + time * (520 + (i % 5) * 40)) % (WIN.h + 40)) - 20
      ctx.moveTo(rx, ry)
      ctx.lineTo(rx - 5, ry + 18)
    }
    ctx.globalAlpha = 0.55
    ctx.stroke()
    ctx.globalAlpha = 1

    // ---- the glass: beads (static) and drops trickling down
    ctx.restore()
    ctx.drawImage(st.glass, 0, 0, width, height)
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(s, s)
    ctx.beginPath()
    ctx.rect(WIN.x, WIN.y, WIN.w, WIN.h)
    ctx.clip()
    for (const d of st.drops) {
      if (d.pause > 0) {
        d.pause -= dt
        d.v *= 0.9
      } else {
        // drops move in little runs: speed up, then stall on the glass
        d.v = Math.min(70, d.v + 60 * dt)
        if (rand() < dt * 0.5) d.pause = 0.3 + rand() * 1.6
      }
      d.y += d.v * dt
      if (d.v > 2) {
        d.trail.push(d.x, d.y)
        if (d.trail.length > 80) d.trail.splice(0, 2)
        d.x += (rand() - 0.5) * 0.6
      }
      if (d.y > WIN.y + WIN.h + 10) Object.assign(d, newDrop(rand))
      // the trail it leaves behind
      if (d.trail.length > 4) {
        ctx.strokeStyle = 'rgba(210,225,240,0.10)'
        ctx.lineWidth = d.r * 0.7
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(d.trail[0], d.trail[1])
        for (let k = 2; k < d.trail.length; k += 2) ctx.lineTo(d.trail[k], d.trail[k + 1])
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(25,30,42,0.45)'
      ctx.beginPath()
      ctx.ellipse(d.x, d.y, d.r, d.r * 1.25, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,236,210,0.7)'
      ctx.beginPath()
      ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.4, d.r * 0.35, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // ---- the room
    ctx.drawImage(st.interior, 0, 0, width, height)
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(s, s)

    // the cat asleep on the sill: a slow breath, the tail tip now and then
    drawCat(ctx, WIN.x + WIN.w - 330, SILL_Y + 16, time)

    // fairy lights along the top
    ctx.globalCompositeOperation = 'lighter'
    const strand = (y0: number, sag: number, x0: number, x1: number, n: number, phase: number): void => {
      ctx.strokeStyle = 'rgba(30,20,12,0.9)'
      ctx.lineWidth = 1.5
      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath()
      for (let k = 0; k <= 40; k++) {
        const u = k / 40
        const px = x0 + (x1 - x0) * u
        const py = y0 + Math.sin(u * Math.PI) * sag
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.stroke()
      ctx.globalCompositeOperation = 'lighter'
      for (let k = 1; k < n; k++) {
        const u = k / n
        const px = x0 + (x1 - x0) * u
        const py = y0 + Math.sin(u * Math.PI) * sag + 6
        const tw = 0.65 + 0.35 * Math.sin(time * (0.6 + (k % 3) * 0.17) + k * 1.7 + phase)
        ctx.globalAlpha = Math.min(1, tw * glow)
        ctx.drawImage(st.warm, px - 16, py - 16, 32, 32)
        ctx.globalAlpha = Math.min(1, 0.9 * tw)
        ctx.fillStyle = '#ffe2b0'
        ctx.beginPath()
        ctx.arc(px, py, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    strand(28, 46, -40, 820, 18, 0)
    strand(40, 38, 760, 1660, 18, 2)

    // neon "café"
    const flick = 0.92 + 0.05 * Math.sin(time * 2.1) + 0.03 * Math.sin(time * 7.3)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.5 * flick * glow
    ctx.drawImage(st.amber, 1180, 110, 360, 190)
    ctx.globalAlpha = 1
    ctx.font = "italic 600 78px 'Pacifico', 'Segoe Script', 'Brush Script MT', 'URW Chancery L', cursive"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255,140,90,0.9)'
    ctx.shadowBlur = 24
    ctx.fillStyle = `rgba(255,${190 + 20 * flick},${150 + 20 * flick},${0.9 * flick})`
    ctx.fillText('café', 1360, 202)
    ctx.shadowBlur = 0

    // the lamps warm the wall around them and pool light on the table
    ctx.globalCompositeOperation = 'lighter'
    for (const [lx, cord] of [
      [1000, 250],
      [420, 200]
    ] as const) {
      ctx.globalAlpha = 0.16 * glow
      ctx.drawImage(st.warm, lx - 300, cord - 220, 600, 520)
      ctx.globalAlpha = 0.3 * glow
      ctx.drawImage(st.warm, lx - 330, 740, 660, 150)
    }
    ctx.globalAlpha = 1

    // pendant lamps: cord, shade, a cone of warm light, a gentle sway
    for (const [lx, cord, phase] of [
      [1000, 250, 0],
      [420, 200, 1.7]
    ] as const) {
      const sway = Math.sin(time * 0.35 + phase) * 0.012
      ctx.save()
      ctx.translate(lx, 0)
      ctx.rotate(sway)
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#120a05'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, -10)
      ctx.lineTo(0, cord)
      ctx.stroke()
      // light cone down to the table
      ctx.globalCompositeOperation = 'lighter'
      const cone = ctx.createLinearGradient(0, cord, 0, cord + 560)
      cone.addColorStop(0, `rgba(255,190,120,${0.16 * glow})`)
      cone.addColorStop(1, 'rgba(255,190,120,0)')
      ctx.fillStyle = cone
      ctx.beginPath()
      ctx.moveTo(-40, cord + 20)
      ctx.lineTo(40, cord + 20)
      ctx.lineTo(260, cord + 560)
      ctx.lineTo(-260, cord + 560)
      ctx.closePath()
      ctx.fill()
      // bulb glow
      ctx.globalAlpha = 0.9 * glow
      ctx.drawImage(st.warm, -120, cord - 70, 240, 240)
      ctx.globalAlpha = 1
      // shade (brass dome)
      ctx.globalCompositeOperation = 'source-over'
      const shade = ctx.createLinearGradient(-60, 0, 60, 0)
      shade.addColorStop(0, '#5a3f1e')
      shade.addColorStop(0.45, '#b98a4a')
      shade.addColorStop(1, '#4a3418')
      ctx.fillStyle = shade
      ctx.beginPath()
      ctx.moveTo(-12, cord)
      ctx.lineTo(12, cord)
      ctx.quadraticCurveTo(58, cord + 6, 62, cord + 44)
      ctx.lineTo(-62, cord + 44)
      ctx.quadraticCurveTo(-58, cord + 6, -12, cord)
      ctx.fill()
      ctx.fillStyle = `rgba(255,230,180,${0.95 * Math.min(1, glow)})`
      ctx.beginPath()
      ctx.ellipse(0, cord + 44, 60, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // dust drifting in the lamplight
    ctx.globalCompositeOperation = 'lighter'
    for (const m of st.motes) {
      m.x += (m.vx + Math.sin(time * 0.3 + m.ph) * 3) * dt
      m.y += m.vy * dt
      if (m.y < 140) {
        m.y = 820
        m.x = rand() * BW
      }
      // only visible inside a cone
      let lit = 0
      for (const [lx, cord] of [
        [1000, 250],
        [420, 200]
      ] as const) {
        const depth = (m.y - cord) / 560
        if (depth <= 0 || depth > 1) continue
        const half = 40 + 220 * depth
        lit = Math.max(lit, 1 - Math.abs(m.x - lx) / half)
      }
      if (lit <= 0) continue
      ctx.globalAlpha = Math.min(1, lit * 1.4) * (0.35 + 0.25 * Math.sin(time * 1.3 + m.ph))
      ctx.fillStyle = '#fff1d8'
      ctx.fillRect(m.x, m.y, 2.2, 2.2)
    }
    ctx.globalAlpha = 1

    // steam from the latte: a few soft ribbons that curl and fade
    ctx.globalCompositeOperation = 'source-over'
    ctx.lineCap = 'round'
    const cx = 1010
    const cy = 780
    for (let k = 0; k < 4; k++) {
      const ph = k * 1.9
      ctx.beginPath()
      for (let j = 0; j <= 30; j++) {
        const u = j / 30
        const px = cx - 24 + k * 16 + Math.sin(u * 5 - time * (0.9 + k * 0.08) + ph) * (8 + u * 26) + c.sway * u * 18
        const py = cy - u * 230
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      const grd = ctx.createLinearGradient(0, cy, 0, cy - 230)
      grd.addColorStop(0, 'rgba(255,248,236,0)')
      grd.addColorStop(0.15, 'rgba(255,248,236,0.16)')
      grd.addColorStop(1, 'rgba(255,248,236,0)')
      ctx.strokeStyle = grd
      ctx.lineWidth = 9 - k
      ctx.stroke()
    }
    ctx.restore()

    // ---- finishing: warm vignette and a whisper of film grain
    const vign = ctx.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(12,6,2,0.62)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    st.grainAt -= dt
    if (st.grainAt <= 0) {
      st.grainAt = 0.08
      st.grainX = -Math.floor(rand() * 160)
      st.grainY = -Math.floor(rand() * 160)
    }
    ctx.globalAlpha = 0.045
    ctx.globalCompositeOperation = 'overlay'
    const pat = ctx.createPattern(st.grain, 'repeat')
    if (pat) {
      ctx.translate(st.grainX, st.grainY)
      ctx.fillStyle = pat
      ctx.fillRect(-st.grainX, -st.grainY, width, height)
    }
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}

/** A cat curled up asleep, rim-lit by the lamps. */
function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const breath = 1 + 0.025 * Math.sin(t * 1.15)
  const fur = '#2e2119'
  ctx.save()
  ctx.translate(x, y)
  // soft shadow on the sill
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(0, 0, 92, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  // body (a loaf), breathing
  ctx.save()
  ctx.scale(1, breath)
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.ellipse(8, -28, 76, 32, 0, Math.PI, 0)
  ctx.lineTo(84, -2)
  ctx.lineTo(-68, -2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  // tail curled round the front; the tip twitches now and then
  const twitch = Math.max(0, Math.sin(t * 0.23)) ** 12 * Math.sin(t * 9) * 0.25
  ctx.strokeStyle = fur
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(80, -8)
  ctx.quadraticCurveTo(46, 6, 0, 2)
  ctx.quadraticCurveTo(-30 + twitch * 20, -1, -44 + twitch * 30, -8 + twitch * 10)
  ctx.stroke()
  // head resting on the paws, ears up
  const hy = -26 * breath
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.ellipse(-62, hy, 30, 24, -0.15, 0, Math.PI * 2)
  ctx.fill()
  const ear = (bx: number, tipX: number, tipY: number, ex: number): void => {
    ctx.beginPath()
    ctx.moveTo(bx, hy - 14)
    ctx.lineTo(tipX, hy + tipY)
    ctx.lineTo(ex, hy - 18)
    ctx.closePath()
    ctx.fill()
  }
  ear(-86, -84, -46, -68)
  ear(-62, -50, -48, -42)
  // closed eye, a calm little curve
  ctx.strokeStyle = 'rgba(255,214,170,0.35)'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(-68, hy + 2, 5, 0.2, Math.PI - 0.2)
  ctx.stroke()
  // warm rim light from the lamp: back, head and ears
  ctx.strokeStyle = 'rgba(255,175,105,0.45)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.ellipse(8, -28 * breath, 74, 30 * breath, 0, Math.PI * 1.12, Math.PI * 1.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(-62, hy, 29, 23, -0.15, Math.PI * 1.1, Math.PI * 1.75)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-84, hy - 46)
  ctx.lineTo(-68, hy - 18)
  ctx.moveTo(-50, hy - 48)
  ctx.lineTo(-42, hy - 18)
  ctx.stroke()
  ctx.restore()
}
