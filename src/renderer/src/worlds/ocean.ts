import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🌊 Ocean — everything happens underwater, calm and weightless.
 *
 * The surface shimmers overhead and lets down slow, swaying rays of light;
 * the same light dances over the sand as caustics. A reef fades into the blue
 * behind; in front, branching corals, brain corals, sea fans and tube sponges,
 * a starfish, kelp and an anemone swaying in the current with two clownfish at
 * home in it. A silver school moves as one, a blue and a yellow tang wander
 * by, jellyfish pulse along, and now and then a sea turtle glides across.
 * Bubbles rise in threads from the seabed; marine snow drifts everywhere.
 *
 * The clock changes the light: turquoise by day, warm rays at dusk, and a deep
 * blue night where plankton and jellyfish glow.
 *
 * Calm first: the music only nudges the current and lets a few more bubbles go.
 */

const BED = 720 // where the seabed begins (board y)

type RGB = [number, number, number]

interface Pal {
  key: string
  top: RGB
  mid: RGB
  deep: RGB
  ray: string
  sand: RGB
  /** 0 day … 1 night */
  night: number
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 17) return { key: 'day', top: [64, 186, 214], mid: [18, 108, 156], deep: [4, 36, 66], ray: '205,242,255', sand: [196, 182, 140], night: 0 }
  if ((h >= 17 && h < 20) || (h >= 5 && h < 8))
    return { key: 'dusk', top: [96, 128, 160], mid: [22, 66, 110], deep: [4, 18, 40], ray: '255,214,176', sand: [150, 128, 110], night: 0.45 }
  return { key: 'night', top: [18, 46, 82], mid: [6, 22, 46], deep: [2, 8, 20], ray: '150,180,255', sand: [52, 60, 78], night: 1 }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`
/** A colour sunk into the water: blended toward the water at that depth. */
function sink(c: RGB, water: RGB, k: number): string {
  return `rgb(${Math.round(c[0] + (water[0] - c[0]) * k)},${Math.round(c[1] + (water[1] - c[1]) * k)},${Math.round(c[2] + (water[2] - c[2]) * k)})`
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

/** The water column and the reef far away, fading into blue. */
function paintWater(g: CanvasRenderingContext2D, P: Pal): void {
  const w = g.createLinearGradient(0, 0, 0, BH)
  w.addColorStop(0, rgb(P.top))
  w.addColorStop(0.45, rgb(P.mid))
  w.addColorStop(1, rgb(P.deep))
  g.fillStyle = w
  g.fillRect(-300, -300, BW + 600, BH + 600)
  const r = rng(13)
  // two rows of distant reef, the farther one almost gone
  for (const [depth, base, hMin, hMax] of [
    [0.82, BED - 10, 60, 170],
    [0.62, BED + 20, 80, 220]
  ] as const) {
    g.fillStyle = sink([20, 50, 60], P.mid, depth)
    g.beginPath()
    g.moveTo(-100, BH)
    let x = -100
    while (x < BW + 100) {
      const h = hMin + r() * (hMax - hMin)
      g.lineTo(x, base - h * 0.6)
      g.quadraticCurveTo(x + 30, base - h, x + 60 + r() * 50, base - h * (0.5 + r() * 0.4))
      x += 60 + r() * 80
    }
    g.lineTo(BW + 100, BH)
    g.closePath()
    g.fill()
    // far kelp silhouettes
    g.strokeStyle = sink([20, 70, 50], P.mid, depth)
    g.lineCap = 'round'
    for (let i = 0; i < 9; i++) {
      const kx = r() * BW
      const kh = 140 + r() * 220
      g.lineWidth = 4 + r() * 4
      g.beginPath()
      g.moveTo(kx, base)
      g.bezierCurveTo(kx + 20, base - kh * 0.3, kx - 20, base - kh * 0.7, kx + 10, base - kh)
      g.stroke()
    }
  }
}

/** The sand: gentle dunes with ripples, a starfish, shells. */
function sandPath(): Path2D {
  const p = new Path2D()
  p.moveTo(-200, BH + 200)
  p.lineTo(-200, BED + 30)
  p.bezierCurveTo(200, BED - 10, 420, BED + 40, 700, BED + 20)
  p.bezierCurveTo(980, BED, 1200, BED + 50, 1450, BED + 16)
  p.quadraticCurveTo(1600, BED, 1800, BED + 30)
  p.lineTo(1800, BH + 200)
  p.closePath()
  return p
}

function paintSand(g: CanvasRenderingContext2D, P: Pal): void {
  const path = sandPath()
  const sand = g.createLinearGradient(0, BED - 20, 0, BH)
  sand.addColorStop(0, sink(P.sand, P.mid, 0.45))
  sand.addColorStop(1, sink(P.sand, P.deep, 0.2))
  g.fillStyle = sand
  g.fill(path)
  g.save()
  g.clip(path)
  const r = rng(23)
  // ripples in the sand
  for (let i = 0; i < 46; i++) {
    const y = BED + 30 + r() * 180
    const x = r() * BW
    g.strokeStyle = `rgba(0,0,0,${0.06 + r() * 0.06})`
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(x - 60, y)
    g.quadraticCurveTo(x, y - 6, x + 60, y)
    g.stroke()
    g.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.04})`
    g.beginPath()
    g.moveTo(x - 60, y - 2)
    g.quadraticCurveTo(x, y - 8, x + 60, y - 2)
    g.stroke()
  }
  // grains
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'
    g.fillRect(r() * BW, BED + r() * 200, 1.4, 1.4)
  }
  g.restore()
}

function branchCoral(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, seed: number): void {
  const r = rng(seed)
  g.strokeStyle = color
  g.lineCap = 'round'
  const grow = (bx: number, by: number, ang: number, len: number, w: number, d: number): void => {
    const ex = bx + Math.cos(ang) * len
    const ey = by + Math.sin(ang) * len
    g.lineWidth = w
    g.beginPath()
    g.moveTo(bx, by)
    g.quadraticCurveTo(bx + Math.cos(ang + 0.4) * len * 0.5, by + Math.sin(ang + 0.4) * len * 0.5, ex, ey)
    g.stroke()
    if (d <= 0) {
      g.fillStyle = color
      g.beginPath()
      g.arc(ex, ey, w * 0.8, 0, Math.PI * 2)
      g.fill()
      return
    }
    grow(ex, ey, ang - 0.35 - r() * 0.3, len * 0.72, w * 0.72, d - 1)
    grow(ex, ey, ang + 0.35 + r() * 0.3, len * 0.72, w * 0.72, d - 1)
  }
  grow(x, y, -Math.PI / 2 - 0.4, size * 0.45, size * 0.12, 3)
  grow(x, y, -Math.PI / 2 + 0.3, size * 0.5, size * 0.12, 3)
}

function brainCoral(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, groove: string, seed: number): void {
  const r = rng(seed)
  g.fillStyle = base
  g.beginPath()
  g.ellipse(x, y, w, h, 0, Math.PI, 0)
  g.closePath()
  g.fill()
  g.save()
  g.beginPath()
  g.ellipse(x, y, w, h, 0, Math.PI, 0)
  g.closePath()
  g.clip()
  g.strokeStyle = groove
  g.lineWidth = 1.6
  for (let i = 0; i < 18; i++) {
    let px = x - w + r() * w * 2
    let py = y - r() * h
    g.beginPath()
    g.moveTo(px, py)
    for (let k = 0; k < 8; k++) {
      px += (r() - 0.5) * 22
      py += (r() - 0.5) * 12
      g.lineTo(px, py)
    }
    g.stroke()
  }
  const shine = g.createLinearGradient(0, y - h, 0, y)
  shine.addColorStop(0, 'rgba(255,255,255,0.18)')
  shine.addColorStop(1, 'rgba(0,0,0,0.25)')
  g.fillStyle = shine
  g.fillRect(x - w, y - h, w * 2, h)
  g.restore()
}

function seaFan(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, seed: number): void {
  const r = rng(seed)
  g.strokeStyle = color
  g.lineCap = 'round'
  // ribs fanning out, joined by a fine lattice
  const tips: [number, number][] = []
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.17 + (r() - 0.5) * 0.08
    const len = size * (0.75 + r() * 0.25)
    const ex = x + Math.cos(a) * len
    const ey = y + Math.sin(a) * len
    tips.push([ex, ey])
    g.lineWidth = 2.4
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 10, y + Math.sin(a) * len * 0.5, ex, ey)
    g.stroke()
  }
  g.lineWidth = 0.8
  g.globalAlpha = 0.7
  for (let k = 1; k < 8; k++) {
    const t = k / 8
    g.beginPath()
    tips.forEach(([tx, ty], i) => {
      const px = x + (tx - x) * t
      const py = y + (ty - y) * t
      i ? g.lineTo(px, py) : g.moveTo(px, py)
    })
    g.stroke()
  }
  g.globalAlpha = 1
}

function tubeSponge(g: CanvasRenderingContext2D, x: number, y: number, color: string, dark: string, seed: number): void {
  const r = rng(seed)
  for (let i = 0; i < 4; i++) {
    const tx = x + (i - 1.5) * 18 + (r() - 0.5) * 6
    const th = 50 + r() * 60
    const tw = 10 + r() * 4
    g.fillStyle = color
    g.beginPath()
    g.moveTo(tx - tw, y)
    g.lineTo(tx - tw * 0.85, y - th)
    g.lineTo(tx + tw * 0.85, y - th)
    g.lineTo(tx + tw, y)
    g.closePath()
    g.fill()
    g.fillStyle = dark
    g.beginPath()
    g.ellipse(tx, y - th, tw * 0.85, 4, 0, 0, Math.PI * 2)
    g.fill()
  }
}

function rock(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, P: Pal, seed: number): void {
  const r = rng(seed)
  const grd = g.createLinearGradient(0, y - h, 0, y)
  grd.addColorStop(0, sink([128, 132, 128], P.mid, 0.3))
  grd.addColorStop(1, sink([70, 74, 78], P.mid, 0.35))
  g.fillStyle = grd
  g.beginPath()
  g.moveTo(x - w, y)
  g.bezierCurveTo(x - w * 0.9, y - h * 0.9, x - w * 0.2, y - h * 1.1, x + w * 0.3, y - h)
  g.bezierCurveTo(x + w * 0.9, y - h * 0.8, x + w, y - h * 0.3, x + w, y)
  g.closePath()
  g.fill()
  // algae fuzz on top
  for (let i = 0; i < 40; i++) {
    const ax = x - w * 0.8 + r() * w * 1.6
    g.fillStyle = `rgba(${60 + r() * 40},${120 + r() * 50},${70},0.35)`
    g.fillRect(ax, y - h * (0.6 + r() * 0.45), 2, 4 + r() * 5)
  }
}

/** Rocks and corals standing on the sand. */
function paintReef(g: CanvasRenderingContext2D, P: Pal): void {
  const dim = (c: RGB): string => sink(c, P.mid, 0.12 + P.night * 0.45)
  rock(g, 420, BED + 60, 150, 120, P, 2)
  rock(g, 1430, BED + 70, 180, 140, P, 5)
  rock(g, 860, BED + 90, 70, 50, P, 7)
  brainCoral(g, 300, BED + 74, 70, 46, dim([196, 150, 96]), 'rgba(80,50,30,0.5)', 11)
  brainCoral(g, 1080, BED + 92, 54, 34, dim([170, 186, 110]), 'rgba(50,70,30,0.5)', 12)
  branchCoral(g, 560, BED + 70, 170, dim([236, 120, 110]), 21)
  branchCoral(g, 1620, BED + 60, 200, dim([250, 160, 90]), 22)
  branchCoral(g, 980, BED + 96, 120, dim([240, 140, 170]), 23)
  seaFan(g, 470, BED - 30, 150, dim([170, 90, 190]), 31)
  seaFan(g, 1360, BED - 40, 170, dim([200, 80, 120]), 32)
  tubeSponge(g, 700, BED + 80, dim([230, 170, 60]), 'rgba(60,30,10,0.7)', 41)
  tubeSponge(g, 1530, BED + 90, dim([120, 170, 220]), 'rgba(20,40,60,0.7)', 42)
  // a starfish on the sand
  g.fillStyle = dim([236, 120, 60])
  g.save()
  g.translate(760, BED + 140)
  g.rotate(0.3)
  g.scale(1.7, 1.7)
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const rr = i % 2 ? 9 : 26
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.6)
  }
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255,230,190,0.5)'
  for (let i = 0; i < 12; i++) g.fillRect(Math.cos(i) * 10 - 1, Math.sin(i * 1.7) * 5 - 1, 2, 2)
  g.restore()
  // the anemone's base (tentacles are live)
  g.fillStyle = dim([150, 60, 110])
  g.beginPath()
  g.ellipse(1240, BED + 112, 40, 14, 0, 0, Math.PI * 2)
  g.fill()
}

/** The caustic pattern: bright webs where light focuses, as on a pool floor. */
function causticTile(): Layer {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  const r = rng(77)
  const pts: [number, number][] = []
  for (let i = 0; i < 26; i++) pts.push([r() * N, r() * N])
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let d1 = 1e9
      let d2 = 1e9
      for (const [px, py] of pts) {
        // wrap around so the tile repeats seamlessly
        const dx = Math.min(Math.abs(x - px), N - Math.abs(x - px))
        const dy = Math.min(Math.abs(y - py), N - Math.abs(y - py))
        const d = dx * dx + dy * dy
        if (d < d1) {
          d2 = d1
          d1 = d
        } else if (d < d2) d2 = d
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1)
      const v = Math.max(0, 1 - edge / 9)
      const i = (y * N + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(v * v * 255)
    }
  }
  g.putImageData(img, 0, 0)
  // soften it: caustics are glowing ribbons, not drawn lines
  const soft = document.createElement('canvas')
  soft.width = soft.height = N
  const sg = soft.getContext('2d')!
  sg.filter = 'blur(2.5px)'
  for (const [dx, dy] of [
    [0, 0],
    [N, 0],
    [-N, 0],
    [0, N],
    [0, -N]
  ])
    sg.drawImage(c, dx, dy)
  return soft
}

// ---------------------------------------------------------------------------
// live bits
// ---------------------------------------------------------------------------

interface Fish {
  x: number
  y: number
  dir: number
  speed: number
  size: number
  kind: 'tang' | 'yellow'
  phase: number
}

interface Jelly {
  x: number
  y: number
  vx: number
  phase: number
  size: number
  hue: number
}

interface State {
  v: View
  P: Pal
  water: Layer
  sand: Layer
  reef: Layer
  caustic: Layer
  sandClip: Path2D
  glow: Layer
  biolum: Layer
  school: { ox: number; oy: number; ph: number; s: number }[]
  fish: Fish[]
  jellies: Jelly[]
  bubbles: { x: number; y: number; r: number; v: number; ph: number }[]
  snow: { x: number; y: number; s: number; ph: number }[]
  turtle: { t: number; next: number; dir: number; y: number }
  vents: number[]
  ventAcc: number
}

let S: State | null = null

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const r = rng(5)
  return {
    v,
    P,
    water: makeLayer(v, (g) => paintWater(g, P)),
    sand: makeLayer(v, (g) => paintSand(g, P)),
    reef: makeLayer(v, (g) => paintReef(g, P)),
    caustic: causticTile(),
    sandClip: sandPath(),
    glow: glowSprite(P.ray),
    biolum: glowSprite('110,240,255', 48),
    school: Array.from({ length: 30 }, () => ({ ox: (r() - 0.5) * 220, oy: (r() - 0.5) * 90, ph: r() * 6.28, s: 0.7 + r() * 0.5 })),
    fish: [
      { x: 200, y: 600, dir: 1, speed: 26, size: 1, kind: 'tang', phase: 0 },
      { x: 1300, y: 520, dir: -1, speed: 20, size: 0.9, kind: 'yellow', phase: 2 }
    ],
    jellies: [
      { x: 1180, y: 300, vx: -4, phase: 0, size: 1, hue: 300 },
      { x: 300, y: 420, vx: 3, phase: 2.3, size: 0.75, hue: 200 }
    ],
    bubbles: [],
    snow: Array.from({ length: 90 }, () => ({ x: r() * BW, y: r() * BH, s: 0.6 + r() * 1.6, ph: r() * 6.28 })),
    turtle: { t: -1, next: 14, dir: 1, y: 330 },
    vents: [380, 1470, 900],
    ventAcc: 0
  }
}

function drawSchoolFish(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, s: number, wag: number, night: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.scale(s, s)
  ctx.fillStyle = night > 0.7 ? 'rgba(150,175,200,0.7)' : 'rgba(196,222,236,0.85)'
  ctx.beginPath()
  ctx.ellipse(0, 0, 11, 3.6, 0, 0, Math.PI * 2)
  ctx.moveTo(-9, 0)
  ctx.lineTo(-16, -4 + wag)
  ctx.lineTo(-16, 4 + wag)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(-6, -1.2, 12, 1)
  ctx.restore()
}

function drawReefFish(ctx: CanvasRenderingContext2D, f: Fish, wag: number): void {
  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.scale(f.dir * f.size, f.size)
  if (f.kind === 'tang') {
    // blue tang: royal blue with a dark swoosh and a yellow tail
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.moveTo(-26, 0)
    ctx.lineTo(-40, -12 + wag)
    ctx.lineTo(-36, wag)
    ctx.lineTo(-40, 12 + wag)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#2f6fd6'
    ctx.beginPath()
    ctx.ellipse(0, 0, 30, 15, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#13235a'
    ctx.beginPath()
    ctx.moveTo(16, -6)
    ctx.quadraticCurveTo(-4, -16, -24, -2)
    ctx.quadraticCurveTo(-6, -8, 10, 2)
    ctx.closePath()
    ctx.fill()
  } else {
    // yellow tang: tall, round, bright
    ctx.fillStyle = '#f7d046'
    ctx.beginPath()
    ctx.moveTo(-22, 0)
    ctx.lineTo(-34, -10 + wag)
    ctx.lineTo(-34, 10 + wag)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(0, 0, 24, 19, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillRect(18, -3, 6, 2)
  }
  ctx.fillStyle = '#0a0a0a'
  ctx.beginPath()
  ctx.arc(f.kind === 'tang' ? 20 : 14, -4, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawClownfish(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, wag: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir * 0.8, 0.8)
  ctx.fillStyle = '#f07a28'
  ctx.beginPath()
  ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2)
  ctx.moveTo(-15, 0)
  ctx.lineTo(-25, -7 + wag)
  ctx.lineTo(-25, 7 + wag)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff'
  for (const bx of [8, -3, -14]) ctx.fillRect(bx - 2, -7, 4, 14)
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(12, -2, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawTurtle(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, t: number, P: Pal): void {
  const dimK = 0.2 + P.night * 0.45
  const shell = sink([120, 96, 58], P.mid, dimK)
  const skin = sink([150, 140, 96], P.mid, dimK)
  const paddle = Math.sin(t * 0.9)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir * 1.3, 1.3)
  // flippers: the front pair sweep slowly, the back pair steer
  ctx.fillStyle = skin
  for (const [fx, fy, len, ang] of [
    [26, 10, 52, 0.6 + paddle * 0.45],
    [26, -10, 46, -0.6 - paddle * 0.4],
    [-30, 10, 22, 2.4 + paddle * 0.2],
    [-30, -10, 20, -2.4 - paddle * 0.2]
  ] as const) {
    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.ellipse(len * 0.5, 0, len * 0.5, len * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // head
  ctx.beginPath()
  ctx.ellipse(52, 0, 15, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(58, -4, 1.8, 0, Math.PI * 2)
  ctx.fill()
  // shell with plates
  ctx.fillStyle = shell
  ctx.beginPath()
  ctx.ellipse(0, 0, 44, 30, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30,20,10,0.45)'
  ctx.lineWidth = 1.5
  for (const [px, py] of [
    [-14, -10],
    [8, -12],
    [-16, 10],
    [8, 12],
    [26, 0],
    [-30, 0],
    [-3, 0]
  ])
    ctx.beginPath(), ctx.ellipse(px, py, 11, 9, 0, 0, Math.PI * 2), ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.ellipse(-4, -12, 30, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawJelly(ctx: CanvasRenderingContext2D, j: Jelly, t: number, P: Pal, glow: Layer): void {
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + j.phase)
  const w = 34 * j.size * (1 - pulse * 0.14)
  const h = 26 * j.size * (1 + pulse * 0.12)
  ctx.save()
  ctx.translate(j.x, j.y)
  if (P.night > 0.4) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 * P.night
    ctx.drawImage(glow, -w * 2, -h * 2, w * 4, h * 4)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }
  // tentacles trailing behind as it swims up
  ctx.strokeStyle = `hsla(${j.hue}, 70%, 80%, 0.35)`
  ctx.lineWidth = 1.3
  for (let k = 0; k < 7; k++) {
    const sx = (k / 6 - 0.5) * w * 1.4
    ctx.beginPath()
    ctx.moveTo(sx, 2)
    for (let q = 1; q <= 10; q++) ctx.lineTo(sx + Math.sin(t * 1.2 + k + q * 0.6) * 5 * (q / 10), 2 + q * 9 * j.size)
    ctx.stroke()
  }
  // the bell
  const bell = ctx.createRadialGradient(0, -h * 0.4, 2, 0, 0, w)
  bell.addColorStop(0, `hsla(${j.hue}, 70%, 92%, 0.65)`)
  bell.addColorStop(1, `hsla(${j.hue}, 60%, 70%, 0.18)`)
  ctx.fillStyle = bell
  ctx.beginPath()
  ctx.ellipse(0, 0, w, h, 0, Math.PI, 0)
  ctx.quadraticCurveTo(w * 0.5, h * 0.18, 0, h * 0.1)
  ctx.quadraticCurveTo(-w * 0.5, h * 0.18, -w, 0)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const oceanWorld: World = {
  id: 'ocean',
  name: 'Ocean',
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
    // the current: a slow back-and-forth, a touch stronger with the music
    const current = Math.sin(time * 0.25) * (0.6 + c.energy * 0.5) + c.sway * 0.3

    ctx.save()
    ctx.drawImage(st.water, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // ---- the surface overhead, shimmering
    ctx.globalCompositeOperation = 'lighter'
    const surf = ctx.createLinearGradient(0, 0, 0, 90)
    surf.addColorStop(0, `rgba(${P.ray},${0.32 * (1 - P.night * 0.6)})`)
    surf.addColorStop(1, `rgba(${P.ray},0)`)
    ctx.fillStyle = surf
    ctx.fillRect(-300, -300, BW + 600, 390)
    ctx.lineWidth = 2
    for (let layer = 0; layer < 3; layer++) {
      ctx.strokeStyle = `rgba(${P.ray},${(0.18 - layer * 0.04) * (1 - P.night * 0.5)})`
      ctx.beginPath()
      for (let x = -40; x <= BW + 40; x += 10) {
        const y = 14 + layer * 16 + Math.sin(x * 0.018 + time * (0.9 + layer * 0.2)) * 5 + Math.sin(x * 0.047 - time * 1.3) * 3
        x === -40 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    // ---- rays of light swaying down from it
    for (let i = 0; i < 8; i++) {
      const x0 = -100 + i * 230 + Math.sin(time * 0.17 + i * 1.3) * 40
      const w0 = 30 + ((i * 37) % 60)
      const len = 620 + ((i * 53) % 180)
      const a = (0.5 + 0.5 * Math.sin(time * 0.35 + i * 2.1)) * (0.13 - P.night * 0.07)
      const ray = ctx.createLinearGradient(0, 0, 0, len)
      ray.addColorStop(0, `rgba(${P.ray},${a})`)
      ray.addColorStop(1, `rgba(${P.ray},0)`)
      ctx.fillStyle = ray
      const tilt = 0.24 + Math.sin(time * 0.1 + i) * 0.03
      ctx.beginPath()
      ctx.moveTo(x0, 0)
      ctx.lineTo(x0 + w0, 0)
      ctx.lineTo(x0 + w0 * 2.4 + len * tilt, len)
      ctx.lineTo(x0 - w0 * 0.4 + len * tilt, len)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()

    // ---- the seabed, with light dancing on the sand
    ctx.drawImage(st.sand, 0, 0, width, height)
    ctx.save()
    toBoard(ctx, st.v)
    ctx.clip(st.sandClip)
    ctx.globalCompositeOperation = 'lighter'
    const pat = ctx.createPattern(st.caustic, 'repeat')
    if (pat) {
      const ca = (0.075 + 0.03 * Math.sin(time * 0.5)) * (1 - P.night * 0.75)
      for (const [sx, sy, sc, a] of [
        [time * 9, time * 4, 2.1, ca],
        [-time * 6, time * 7, 2.8, ca * 0.8]
      ] as const) {
        pat.setTransform(new DOMMatrix().translateSelf(sx, BED + sy).scaleSelf(sc, sc * 0.45))
        ctx.globalAlpha = a
        ctx.fillStyle = pat
        ctx.fillRect(-300, BED - 40, BW + 600, BH - BED + 300)
      }
    }
    ctx.restore()
    ctx.drawImage(st.reef, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)

    // ---- kelp swaying in the current
    ctx.lineCap = 'round'
    for (const [kx, kh, ph, hue] of [
      [60, 560, 0, 110],
      [130, 440, 1.2, 100],
      [1500, 520, 2.1, 115],
      [1560, 380, 0.7, 95],
      [610, 300, 1.7, 105]
    ] as const) {
      const base = BED + 90
      const pts: [number, number][] = []
      for (let k = 0; k <= 14; k++) {
        const u = k / 14
        const sway = (Math.sin(time * 0.55 + ph + u * 2.2) * 26 + current * 30) * u * u
        pts.push([kx + sway, base - u * kh])
      }
      const col = sink([40, 120, 60], P.mid, 0.25 + P.night * 0.45)
      ctx.strokeStyle = col
      ctx.lineWidth = 6
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
      // blades along the stem
      ctx.fillStyle = sink([60, 150 - (hue - 100), 70], P.mid, 0.25 + P.night * 0.45)
      for (let k = 2; k < pts.length; k++) {
        const [x, y] = pts[k]
        const side = k % 2 ? 1 : -1
        const flap = Math.sin(time * 0.9 + k + ph) * 0.2
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(side * (0.9 + flap) - Math.PI / 2 + current * 0.2)
        ctx.beginPath()
        ctx.ellipse(18, 0, 20, 6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    // ---- the anemone and its two clownfish
    const ax = 1240
    const ay = BED + 108
    for (let k = 0; k < 26; k++) {
      const a = -Math.PI + (k / 25) * Math.PI
      const len = 44 + (k % 3) * 8
      const sway = Math.sin(time * 0.8 + k * 0.5) * 0.2 + current * 0.15
      ctx.strokeStyle = sink([220, 120, 170], P.mid, 0.15 + P.night * 0.4)
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(ax + Math.cos(a) * 26, ay)
      ctx.quadraticCurveTo(ax + Math.cos(a + sway) * len * 0.7, ay - 22, ax + Math.cos(a + sway * 1.6) * len, ay + Math.sin(a) * len * 0.9)
      ctx.stroke()
      ctx.fillStyle = sink([255, 200, 230], P.mid, 0.1 + P.night * 0.35)
      ctx.beginPath()
      ctx.arc(ax + Math.cos(a + sway * 1.6) * len, ay + Math.sin(a) * len * 0.9, 3.4, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let k = 0; k < 2; k++) {
      const a = time * (0.5 + k * 0.15) + k * 3
      const cxp = ax + Math.cos(a) * (50 + k * 20)
      const cyp = ay - 60 + Math.sin(a * 1.3) * 18
      drawClownfish(ctx, cxp, cyp, -Math.sin(a) >= 0 ? 1 : -1, Math.sin(time * 9 + k) * 3)
    }

    // ---- a silver school moving as one
    const lt = time * 0.06
    const lx = BW / 2 + Math.sin(lt) * 620
    const ly = 380 + Math.sin(lt * 2.3) * 90
    const ldx = Math.cos(lt) * 620 * 0.06
    const ldy = Math.cos(lt * 2.3) * 90 * 0.138
    const heading = Math.atan2(ldy, ldx)
    for (const f of st.school) {
      const fx = lx + f.ox * Math.cos(heading) - f.oy * Math.sin(heading) + Math.sin(time * 0.7 + f.ph) * 8
      const fy = ly + f.ox * Math.sin(heading) + f.oy * Math.cos(heading) + Math.cos(time * 0.9 + f.ph) * 5
      drawSchoolFish(ctx, fx, fy, heading, f.s, Math.sin(time * 10 + f.ph) * 2, P.night)
    }

    // ---- reef fish wandering
    for (const f of st.fish) {
      f.phase += dt
      f.x += f.dir * f.speed * dt + current * 6 * dt
      f.y += Math.sin(f.phase * 0.6) * 6 * dt
      if (f.x > BW + 80) f.dir = -1
      if (f.x < -80) f.dir = 1
      drawReefFish(ctx, f, Math.sin(time * 6 + f.phase) * 4)
    }

    // ---- a turtle gliding across now and then
    const tu = st.turtle
    if (tu.t < 0) {
      tu.next -= dt
      if (tu.next <= 0) {
        tu.t = 0
        tu.dir = Math.random() < 0.5 ? 1 : -1
        tu.y = 240 + Math.random() * 220
      }
    } else {
      tu.t += dt / 40
      const tx = tu.dir > 0 ? -160 + tu.t * (BW + 320) : BW + 160 - tu.t * (BW + 320)
      drawTurtle(ctx, tx, tu.y + Math.sin(tu.t * 9) * 14, tu.dir, time, P)
      if (tu.t >= 1) {
        tu.t = -1
        tu.next = 45 + Math.random() * 45
      }
    }

    // ---- jellyfish drifting
    for (const j of st.jellies) {
      const pulse = Math.max(0, Math.sin(time * 1.4 + j.phase))
      j.y -= (4 + pulse * 10) * dt
      j.x += (j.vx + current * 4) * dt
      if (j.y < -120) {
        j.y = BH + 60
        j.x = 200 + Math.random() * 1200
      }
      drawJelly(ctx, j, time, P, st.biolum)
    }

    // ---- bubbles rising in threads from the seabed
    st.ventAcc += dt * (2.2 + c.kick * 3)
    while (st.ventAcc > 1) {
      st.ventAcc -= 1
      const vx = st.vents[Math.floor(Math.random() * st.vents.length)]
      st.bubbles.push({ x: vx + (Math.random() - 0.5) * 10, y: BED + 70, r: 1.5 + Math.random() * 3, v: 40 + Math.random() * 30, ph: Math.random() * 6 })
    }
    ctx.lineWidth = 1
    st.bubbles = st.bubbles.filter((b) => {
      b.y -= b.v * dt
      b.r += dt * 0.25
      b.x += (Math.sin(time * 3 + b.ph) * 12 + current * 14) * dt
      if (b.y < -10) return false
      ctx.strokeStyle = 'rgba(210,245,255,0.55)'
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillRect(b.x - b.r * 0.45, b.y - b.r * 0.45, b.r * 0.4, b.r * 0.4)
      return true
    })

    // ---- marine snow, and plankton that glows at night
    for (const p of st.snow) {
      p.y += (3 + p.s * 2) * dt
      p.x += (Math.sin(time * 0.4 + p.ph) * 4 + current * 10) * dt
      if (p.y > BH + 4) {
        p.y = -4
        p.x = Math.random() * BW
      }
      if (p.x < -10) p.x = BW + 10
      if (p.x > BW + 10) p.x = -10
      if (P.night > 0.6 && p.ph > 4.2) {
        const blink = Math.max(0, Math.sin(time * 0.8 + p.ph * 5))
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = blink * 0.8
        ctx.drawImage(st.biolum, p.x - 8, p.y - 8, 16, 16)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        continue
      }
      ctx.fillStyle = `rgba(220,240,255,${0.18 + p.s * 0.1})`
      ctx.fillRect(p.x, p.y, p.s, p.s)
    }
    ctx.restore()

    // depth: the far corners sink into the blue
    const vign = ctx.createRadialGradient(width / 2, height * 0.25, Math.min(width, height) * 0.2, width / 2, height * 0.4, Math.max(width, height) * 0.85)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, rgb(P.deep, 0.55))
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
