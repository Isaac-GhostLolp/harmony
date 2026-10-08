import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🌲 Nature — a living forest that breathes with the music and follows the
 * time of day.
 *
 * A path runs between the trees toward a sunlit clearing. Three rows of
 * trunks fade into the mist, and two great mossy trunks frame the view under a
 * canopy that sways a little. Shafts of light fall through the gaps with
 * pollen drifting in them; a deer grazes in the clearing and now and then
 * lifts its head. On the forest floor: leaf litter, mossy stones, mushrooms,
 * small flowers, and in front, ferns and grass moving in the wind. Leaves
 * tumble down; butterflies by day, fireflies at dusk and night.
 *
 * The clock changes the light: golden mornings and evenings, green-gold
 * daylight, and a blue moonlit night full of fireflies.
 *
 * Calm first: the music only makes the light breathe and nudges the wind.
 */

const FLOOR = 560 // where the forest floor meets the distance (board y)
const SUN = { x: 1180, y: -140 } // where the light comes from

type RGB = [number, number, number]

interface Pal {
  key: string
  sky: RGB
  fog: RGB
  light: string
  floor: RGB
  leaf: RGB
  /** 0 day … 1 night */
  night: number
  /** golden hour warmth */
  gold: number
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 9 && h < 16.5)
    return { key: 'day', sky: [196, 228, 236], fog: [200, 226, 204], light: '255,246,206', floor: [92, 112, 56], leaf: [70, 120, 54], night: 0, gold: 0 }
  if ((h >= 16.5 && h < 19.5) || (h >= 5.5 && h < 9))
    return { key: 'golden', sky: [250, 206, 156], fog: [238, 200, 158], light: '255,206,140', floor: [96, 92, 52], leaf: [96, 112, 48], night: 0.3, gold: 1 }
  return { key: 'night', sky: [22, 32, 54], fog: [44, 62, 86], light: '170,196,255', floor: [22, 34, 30], leaf: [24, 44, 38], night: 1, gold: 0 }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`
function mix(a: RGB, b: RGB, k: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function trunk(g: CanvasRenderingContext2D, x: number, w: number, top: number, base: number, color: string, seed: number, detail: boolean): void {
  const r = rng(seed)
  g.fillStyle = color
  g.beginPath()
  g.moveTo(x - w * 0.5, top)
  g.lineTo(x + w * 0.5, top)
  g.quadraticCurveTo(x + w * 0.52, base - 40, x + w * 0.9, base)
  g.lineTo(x - w * 0.9, base)
  g.quadraticCurveTo(x - w * 0.52, base - 40, x - w * 0.5, top)
  g.fill()
  if (!detail) return
  // bark: vertical furrows, a lit edge, moss on the shaded side
  g.save()
  g.clip()
  for (let i = 0; i < w / 4; i++) {
    const bx = x - w * 0.5 + r() * w
    g.strokeStyle = r() < 0.6 ? 'rgba(0,0,0,0.22)' : 'rgba(255,230,190,0.07)'
    g.lineWidth = 1 + r() * 2.5
    g.beginPath()
    g.moveTo(bx, top)
    for (let y = top; y < base; y += 40) g.lineTo(bx + (r() - 0.5) * 6, y)
    g.stroke()
  }
  const lit = g.createLinearGradient(x - w, 0, x + w, 0)
  lit.addColorStop(0, 'rgba(0,0,0,0.35)')
  lit.addColorStop(0.6, 'rgba(0,0,0,0)')
  lit.addColorStop(1, 'rgba(255,220,160,0.18)')
  g.fillStyle = lit
  g.fillRect(x - w, top, w * 2, base - top)
  // moss: many small, soft, elongated tufts on the shaded side, thicker
  // toward the base where the ground keeps the bark damp
  for (let i = 0; i < 520; i++) {
    const u = Math.pow(r(), 0.6) // more of them low on the trunk
    const my = base - u * (base - top) * 0.75
    const mx = x - w * 0.5 + Math.pow(r(), 1.8) * w * 0.45
    g.fillStyle = `rgba(${60 + r() * 30},${92 + r() * 34},${40 + r() * 10},${0.12 + r() * 0.16})`
    g.beginPath()
    g.ellipse(mx, my, 2 + r() * 4, 4 + r() * 10, (r() - 0.5) * 0.4, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

/** Sky glimpse, the misty rows of trunks, the clearing glowing ahead. */
function paintBack(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, FLOOR)
  sky.addColorStop(0, rgb(P.sky))
  sky.addColorStop(1, rgb(P.fog))
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, FLOOR + 300)
  // the clearing: brighter, where the path leads
  const clear = g.createRadialGradient(820, FLOOR - 40, 0, 820, FLOOR - 40, 420)
  clear.addColorStop(0, `rgba(${P.light},${0.55 * (1 - P.night * 0.6)})`)
  clear.addColorStop(1, `rgba(${P.light},0)`)
  g.fillStyle = clear
  g.fillRect(400, FLOOR - 460, 840, 840)
  // distant meadow
  g.fillStyle = mix(P.floor, P.fog, 0.55)
  g.fillRect(-300, FLOOR - 6, BW + 600, 40)
  // three rows of trunks, the farther the paler
  const r = rng(11)
  for (const [k, count, wMin, wMax] of [
    [0.82, 26, 10, 18],
    [0.62, 18, 18, 30],
    [0.38, 12, 30, 48]
  ] as const) {
    const col = mix([46, 38, 30], P.fog, k)
    for (let i = 0; i < count; i++) {
      let x = r() * (BW + 200) - 100
      if (Math.abs(x - 820) < 160 - k * 60) x += (x < 820 ? -1 : 1) * 200 // keep the clearing open
      const w = wMin + r() * (wMax - wMin)
      trunk(g, x, w, -100, FLOOR + 10 + (1 - k) * 30, col, 100 + i, false)
    }
    // their crowns blend into a band of foliage up high
    g.fillStyle = mix(P.leaf, P.fog, k)
    for (let i = 0; i < 40; i++) {
      g.beginPath()
      g.ellipse(r() * BW, -20 + r() * (120 - k * 60), 60 + r() * 80, 30 + r() * 40, 0, 0, Math.PI * 2)
      g.fill()
    }
    // and mist settles in front of each row
    const mist = g.createLinearGradient(0, FLOOR - 160, 0, FLOOR + 30)
    mist.addColorStop(0, rgb(P.fog, 0))
    mist.addColorStop(1, rgb(P.fog, 0.35))
    g.fillStyle = mist
    g.fillRect(-300, FLOOR - 160, BW + 600, 200)
  }
}

/** The forest floor: path, litter, stones, mushrooms, flowers. */
function paintFloor(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(21)
  const floor = g.createLinearGradient(0, FLOOR, 0, BH)
  floor.addColorStop(0, mix(P.floor, P.fog, 0.35))
  floor.addColorStop(1, mix(P.floor, [10, 14, 10], 0.45))
  g.fillStyle = floor
  g.fillRect(-300, FLOOR + 10, BW + 600, BH - FLOOR + 300)
  // the path, narrowing into the clearing
  const path = g.createLinearGradient(0, FLOOR, 0, BH)
  path.addColorStop(0, mix([170, 146, 104], P.fog, 0.45))
  path.addColorStop(1, mix([120, 96, 66], [20, 16, 12], 0.3))
  g.fillStyle = path
  g.beginPath()
  g.moveTo(800, FLOOR + 10)
  g.lineTo(842, FLOOR + 10)
  g.bezierCurveTo(900, 680, 1060, 760, 1060, BH + 20)
  g.lineTo(560, BH + 20)
  g.bezierCurveTo(620, 760, 760, 660, 800, FLOOR + 10)
  g.closePath()
  g.fill()
  // leaf litter
  for (let i = 0; i < 1400; i++) {
    const y = FLOOR + 14 + Math.pow(r(), 0.7) * (BH - FLOOR)
    const depth = (y - FLOOR) / (BH - FLOOR)
    const x = r() * BW
    const s = 1 + depth * 4
    const hue = r()
    g.fillStyle =
      hue < 0.35
        ? `rgba(${140 + r() * 40},${90 + r() * 30},${40},${0.35 + depth * 0.3})`
        : hue < 0.7
          ? `rgba(${70 + r() * 30},${100 + r() * 40},${40},${0.3 + depth * 0.3})`
          : `rgba(0,0,0,${0.12 + depth * 0.15})`
    g.beginPath()
    g.ellipse(x, y, s * 1.6, s * 0.7, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // mossy stones
  for (const [x, y, w, h] of [
    [420, 760, 70, 38],
    [480, 790, 34, 18],
    [1180, 740, 56, 30],
    [1250, 770, 30, 16],
    [700, 640, 26, 12]
  ] as const) {
    const stone = g.createLinearGradient(0, y - h, 0, y)
    stone.addColorStop(0, mix([150, 150, 140], P.fog, 0.2))
    stone.addColorStop(1, mix([60, 62, 58], [0, 0, 0], 0.3))
    g.fillStyle = stone
    g.beginPath()
    g.ellipse(x, y, w, h, 0, Math.PI, 0)
    g.quadraticCurveTo(x + w, y + h * 0.3, x, y + h * 0.3)
    g.quadraticCurveTo(x - w, y + h * 0.3, x - w, y)
    g.fill()
    g.fillStyle = 'rgba(110,150,60,0.55)'
    g.beginPath()
    g.ellipse(x - w * 0.15, y - h * 0.8, w * 0.55, h * 0.3, 0, 0, Math.PI * 2)
    g.fill()
  }
  // mushrooms by the stones
  for (const [x, y, s, red] of [
    [370, 778, 1, true],
    [392, 784, 0.7, true],
    [1222, 756, 0.8, false],
    [1240, 762, 0.55, false]
  ] as const) {
    g.fillStyle = '#efe6d2'
    g.fillRect(x - 3 * s, y - 16 * s, 6 * s, 16 * s)
    g.fillStyle = red ? mix([196, 52, 40], P.fog, P.night * 0.4) : mix([186, 140, 90], P.fog, P.night * 0.4)
    g.beginPath()
    g.ellipse(x, y - 16 * s, 13 * s, 9 * s, 0, Math.PI, 0)
    g.fill()
    if (red) {
      g.fillStyle = '#fff6ea'
      for (const [dx, dy] of [
        [-5, -20],
        [3, -22],
        [7, -17]
      ])
        g.beginPath(), g.arc(x + dx * s, y + dy * s, 1.6 * s, 0, Math.PI * 2), g.fill()
    }
  }
  // small flowers in the grass
  for (let i = 0; i < 90; i++) {
    const y = FLOOR + 60 + r() * (BH - FLOOR - 60)
    const x = r() * BW
    if (x > 560 && x < 1060 && y > 700) continue // not on the path
    const s = 1.5 + ((y - FLOOR) / (BH - FLOOR)) * 3
    const col = [
      [255, 255, 255],
      [250, 220, 90],
      [190, 160, 250],
      [250, 170, 200]
    ][Math.floor(r() * 4)] as RGB
    g.fillStyle = mix(col, P.fog, 0.15 + P.night * 0.5)
    for (let q = 0; q < 5; q++) {
      const a = (q / 5) * Math.PI * 2
      g.beginPath()
      g.arc(x + Math.cos(a) * s, y + Math.sin(a) * s * 0.6, s * 0.7, 0, Math.PI * 2)
      g.fill()
    }
  }
}

/** Two great trunks framing the view, and the canopy across the top. */
function paintFrame(g: CanvasRenderingContext2D, P: Pal): void {
  const bark = mix([58, 44, 34], [0, 0, 0], P.night * 0.5)
  trunk(g, 110, 190, -200, BH + 30, bark, 1, true)
  trunk(g, 1500, 220, -200, BH + 30, bark, 2, true)
  // roots spreading into the ground
  g.fillStyle = bark
  for (const [x, dir] of [
    [110, 1],
    [1500, -1]
  ] as const) {
    for (let k = 0; k < 3; k++) {
      g.beginPath()
      g.moveTo(x + dir * 40, BH - 140 + k * 30)
      g.quadraticCurveTo(x + dir * (140 + k * 40), BH - 90 + k * 20, x + dir * (230 + k * 60), BH + 20)
      g.lineTo(x + dir * (180 + k * 50), BH + 20)
      g.quadraticCurveTo(x + dir * (100 + k * 30), BH - 80 + k * 20, x + dir * 20, BH - 120 + k * 30)
      g.fill()
    }
  }
  // canopy: layered leaf masses with sky peeking through
  const r = rng(61)
  for (let layer = 0; layer < 3; layer++) {
    const tone = mix(P.leaf, [0, 0, 0], 0.15 + layer * 0.18 + P.night * 0.3)
    for (let i = 0; i < 70; i++) {
      const x = -200 + r() * (BW + 400)
      const y = -120 + r() * (150 + layer * 40) + (Math.abs(x - 820) < 300 ? -40 : 0)
      g.fillStyle = tone
      g.beginPath()
      g.ellipse(x, y, 50 + r() * 90, 30 + r() * 50, r(), 0, Math.PI * 2)
      g.fill()
      // a few lit leaves on the edge facing the sun
      if (layer === 2 && r() < 0.6) {
        g.fillStyle = `rgba(${P.light},${0.12 * (1 - P.night * 0.7)})`
        g.beginPath()
        g.ellipse(x + 20, y + 10, 30, 14, r(), 0, Math.PI * 2)
        g.fill()
      }
    }
  }
}

/** One fern frond (pointing up), drawn once and rotated live. */
function frondSprite(color: string): Layer {
  const c = document.createElement('canvas')
  c.width = 120
  c.height = 300
  const g = c.getContext('2d')!
  g.strokeStyle = color
  g.fillStyle = color
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(60, 300)
  g.quadraticCurveTo(64, 150, 52, 6)
  g.stroke()
  for (let i = 0; i < 18; i++) {
    const t = i / 18
    const y = 290 - t * 280
    const x = 60 + (52 - 60) * t * t
    const len = 46 * (1 - t * 0.85)
    for (const side of [-1, 1]) {
      g.save()
      g.translate(x, y)
      g.rotate(side * (1.15 - t * 0.4) - 0.1)
      g.beginPath()
      g.ellipse(0, -len / 2, 6 * (1 - t * 0.5), len / 2, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
  }
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface State {
  v: View
  P: Pal
  back: Layer
  floor: Layer
  frame: Layer
  frond: Layer
  frondDark: Layer
  glow: Layer
  firefly: Layer
  blades: { x: number; h: number; ph: number; shade: number }[]
  leaves: { x: number; y: number; rot: number; spin: number; flip: number; s: number; hue: number }[]
  motes: { x: number; y: number; ph: number }[]
  flies: { x: number; y: number; ph: number }[]
  butterflies: { x: number; y: number; ph: number; color: string; vx: number }[]
  deer: { lookUp: number; next: number }
}

let S: State | null = null

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const r = rng(3)
  const fern = mix([70, 130, 60], [0, 0, 0], P.night * 0.55)
  const fernDark = mix([40, 90, 40], [0, 0, 0], P.night * 0.6)
  return {
    v,
    P,
    back: makeLayer(v, (g) => paintBack(g, P)),
    floor: makeLayer(v, (g) => paintFloor(g, P)),
    frame: makeLayer(v, (g) => paintFrame(g, P)),
    frond: frondSprite(fern),
    frondDark: frondSprite(fernDark),
    glow: glowSprite(P.light),
    firefly: glowSprite('214,255,140', 64),
    blades: Array.from({ length: 240 }, () => ({ x: r() * BW, h: 26 + r() * 46, ph: r() * 6.28, shade: r() })),
    leaves: [],
    motes: Array.from({ length: 60 }, () => ({ x: 500 + r() * 1000, y: r() * 800, ph: r() * 6.28 })),
    flies: Array.from({ length: 34 }, () => ({ x: r() * BW, y: 420 + r() * 440, ph: r() * 6.28 })),
    butterflies: [
      { x: 500, y: 640, ph: 0, color: '#f2a03a', vx: 14 },
      { x: 1100, y: 600, ph: 2, color: '#8ab4ff', vx: -10 },
      { x: 800, y: 700, ph: 4, color: '#fff5e0', vx: 8 }
    ],
    deer: { lookUp: 0, next: 8 }
  }
}

function drawDeer(ctx: CanvasRenderingContext2D, x: number, y: number, lift: number, t: number, P: Pal): void {
  const col = mix([120, 82, 52], P.fog, 0.5 + P.night * 0.3)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(0.62, 0.62)
  ctx.fillStyle = col
  ctx.strokeStyle = col
  ctx.lineCap = 'round'
  // legs
  ctx.lineWidth = 5
  for (const lx of [-30, -20, 22, 32]) {
    ctx.beginPath()
    ctx.moveTo(lx, -10)
    ctx.lineTo(lx + (lx > 0 ? 2 : -2), 34)
    ctx.stroke()
  }
  // body
  ctx.beginPath()
  ctx.ellipse(0, -16, 44, 20, 0, 0, Math.PI * 2)
  ctx.fill()
  // tail, flicking now and then
  const flick = Math.max(0, Math.sin(t * 0.7)) ** 20 * Math.sin(t * 20) * 0.5
  ctx.save()
  ctx.translate(-42, -24)
  ctx.rotate(-0.6 + flick)
  ctx.beginPath()
  ctx.ellipse(-4, 0, 8, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // neck and head: down grazing, or lifted to look around
  const ang = -0.95 + lift * 1.75 // radians from grazing to alert
  ctx.save()
  ctx.translate(34, -26)
  ctx.rotate(ang)
  ctx.lineWidth = 13
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(34, 0)
  ctx.stroke()
  ctx.translate(40, 0)
  ctx.rotate(0.7 - lift * 0.4)
  ctx.beginPath()
  ctx.ellipse(6, 0, 15, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  // ears
  ctx.beginPath()
  ctx.ellipse(-4, -9, 3, 8, -0.5, 0, Math.PI * 2)
  ctx.ellipse(2, -10, 3, 8, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const natureWorld: World = {
  id: 'nature',
  name: 'Nature',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    S = build(c)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const v = viewFor(c)
    if (!S || !sameView(S.v, v) || S.P.key !== palFor(c.dayPhase).key) S = build(c)
    const st = S
    const P = st.P
    const breathe = 0.85 + 0.1 * c.breath + 0.08 * c.energy
    const wind = 0.55 + 0.25 * Math.sin(time * 0.17) + c.energy * 0.35 + c.sway * 0.2

    ctx.save()
    ctx.drawImage(st.back, 0, 0, width, height)
    ctx.drawImage(st.floor, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // the deer in the clearing (not at night)
    if (P.night < 0.8) {
      const d = st.deer
      d.next -= dt
      let target = 0
      if (d.next < 0) {
        target = 1
        if (d.next < -5) d.next = 10 + Math.random() * 12
      }
      d.lookUp += (target - d.lookUp) * Math.min(1, dt * 1.5)
      drawDeer(ctx, 900, FLOOR + 4, d.lookUp, time, P)
    }
    // shafts of light through the canopy
    ctx.globalCompositeOperation = 'lighter'
    const lightK = (1 - P.night * 0.55) * breathe
    for (let i = 0; i < 7; i++) {
      const gx = 360 + i * 150 + Math.sin(time * 0.08 + i) * 20
      const w0 = 26 + ((i * 29) % 40)
      const a = (0.11 + 0.05 * Math.sin(time * 0.3 + i * 1.9)) * lightK
      // from the gap in the canopy, angled away from the sun
      const dx = (gx - SUN.x) * 0.55
      const len = 900
      const shaft = ctx.createLinearGradient(gx, 60, gx + dx, 60 + len)
      shaft.addColorStop(0, `rgba(${P.light},${a})`)
      shaft.addColorStop(0.7, `rgba(${P.light},${a * 0.4})`)
      shaft.addColorStop(1, `rgba(${P.light},0)`)
      ctx.fillStyle = shaft
      ctx.beginPath()
      ctx.moveTo(gx - w0 * 0.5, 60)
      ctx.lineTo(gx + w0 * 0.5, 60)
      ctx.lineTo(gx + dx + w0 * 2, 60 + len)
      ctx.lineTo(gx + dx - w0 * 1.2, 60 + len)
      ctx.closePath()
      ctx.fill()
    }
    // pollen and dust drifting in the light
    for (const m of st.motes) {
      m.x += (Math.sin(time * 0.3 + m.ph) * 6 + wind * 4) * dt
      m.y += (Math.cos(time * 0.2 + m.ph) * 4 - 1) * dt
      if (m.x > BW - 200) m.x = 400
      if (m.y < 60) m.y = 800
      const tw = 0.5 + 0.5 * Math.sin(time * 1.4 + m.ph * 3)
      ctx.globalAlpha = tw * 0.55 * lightK
      ctx.fillStyle = `rgba(${P.light},1)`
      ctx.fillRect(m.x, m.y, 2, 2)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    // low mist drifting along the floor
    ctx.globalAlpha = 0.18 + 0.05 * Math.sin(time * 0.15)
    ctx.drawImage(st.glow, -200 + ((time * 8) % 400), FLOOR - 70, 1200, 140)
    ctx.drawImage(st.glow, 700 - ((time * 6) % 400), FLOOR - 50, 1200, 120)
    ctx.globalAlpha = 1
    ctx.restore()

    // the great trunks and the canopy, which sways a little
    const sway = Math.sin(time * 0.5) * 3 * wind
    ctx.drawImage(st.frame, sway * st.v.s, Math.abs(sway) * 0.3 * st.v.s, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // ferns in front, swaying
    for (const [x, base, scale, count, seed, dark] of [
      [250, BH + 30, 1, 7, 1, false],
      [420, BH + 40, 0.75, 6, 2, true],
      [1290, BH + 30, 0.95, 7, 3, false],
      [1440, BH + 40, 0.7, 5, 4, true]
    ] as const) {
      for (let k = 0; k < count; k++) {
        const spread = (k / (count - 1) - 0.5) * 1.9
        const sw = Math.sin(time * 0.9 + k * 0.7 + seed) * 0.05 * (1 + wind)
        ctx.save()
        ctx.translate(x, base)
        ctx.rotate(spread + sw + wind * 0.04)
        ctx.scale(scale * (0.8 + (k % 3) * 0.12), scale)
        ctx.drawImage(dark ? st.frondDark : st.frond, -60, -300)
        ctx.restore()
      }
    }
    // grass blades along the front
    ctx.lineCap = 'round'
    for (const b of st.blades) {
      const bend = Math.sin(time * 1.1 + b.ph + b.x * 0.004) * 6 * wind + wind * 4
      const g = Math.round(90 + b.shade * 60 - P.night * 50)
      ctx.strokeStyle = `rgb(${Math.round(g * 0.55)},${g},${Math.round(g * 0.4)})`
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(b.x, BH + 6)
      ctx.quadraticCurveTo(b.x + bend * 0.4, BH - b.h * 0.5, b.x + bend, BH - b.h)
      ctx.stroke()
    }

    // leaves tumbling down
    if (st.leaves.length < 26 && Math.random() < dt * (0.9 + wind)) {
      st.leaves.push({ x: Math.random() * BW, y: -20, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 2, flip: Math.random() * 6, s: 6 + Math.random() * 5, hue: Math.random() })
    }
    st.leaves = st.leaves.filter((l) => {
      l.flip += dt * 2
      l.rot += l.spin * dt
      l.x += (wind * 26 + Math.sin(l.flip) * 22) * dt
      l.y += (24 + Math.cos(l.flip) * 8) * dt
      if (l.y > BH + 20 || l.x > BW + 30) return false
      ctx.save()
      ctx.translate(l.x, l.y)
      ctx.rotate(l.rot)
      ctx.scale(1, Math.max(0.2, Math.abs(Math.cos(l.flip))))
      ctx.fillStyle = P.night > 0.7 ? '#3e4a34' : l.hue < 0.4 ? '#c98a32' : l.hue < 0.75 ? '#a9b443' : '#d25e2c'
      ctx.beginPath()
      ctx.moveTo(0, -l.s)
      ctx.quadraticCurveTo(l.s * 0.8, 0, 0, l.s)
      ctx.quadraticCurveTo(-l.s * 0.8, 0, 0, -l.s)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(0, -l.s)
      ctx.lineTo(0, l.s)
      ctx.stroke()
      ctx.restore()
      return true
    })

    // butterflies by day
    if (P.night < 0.5) {
      for (const b of st.butterflies) {
        b.ph += dt
        b.x += (b.vx + Math.sin(b.ph * 0.7) * 20) * dt
        b.y += Math.sin(b.ph * 1.3) * 18 * dt
        if (b.x > BW - 220) b.vx = -Math.abs(b.vx)
        if (b.x < 300) b.vx = Math.abs(b.vx)
        const flap = Math.abs(Math.sin(b.ph * 14))
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.fillStyle = b.color
        for (const side of [-1, 1]) {
          ctx.save()
          ctx.scale(side * (0.25 + flap * 0.75), 1)
          ctx.beginPath()
          ctx.ellipse(6, -4, 7, 5, -0.4, 0, Math.PI * 2)
          ctx.ellipse(5, 4, 5, 4, 0.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
        ctx.fillStyle = '#2a2018'
        ctx.fillRect(-1, -6, 2, 12)
        ctx.restore()
      }
    }
    // fireflies at dusk and night
    if (P.night > 0.2) {
      ctx.globalCompositeOperation = 'lighter'
      const n = Math.round(st.flies.length * Math.min(1, P.night + c.energy * 0.3))
      for (let i = 0; i < n; i++) {
        const f = st.flies[i]
        f.x += Math.sin(time * 0.35 + f.ph) * 10 * dt
        f.y += Math.cos(time * 0.27 + f.ph * 1.7) * 7 * dt
        const on = Math.max(0, Math.sin(time * 0.8 + f.ph * 3)) ** 2
        ctx.globalAlpha = on * 0.9
        ctx.drawImage(st.firefly, f.x - 14, f.y - 14, 28, 28)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()

    const vign = ctx.createRadialGradient(width / 2, height * 0.5, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.8)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, `rgba(6,10,6,${0.45 + P.night * 0.15})`)
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
