import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * ❄️ Winter — a still, crystalline snowscape, at night by default.
 *
 * The aurora hangs in real curtains: vertical rays, green at the hem and
 * violet above, that ripple and brighten in patches and mirror in a frozen
 * lake. Snowy peaks are lit on one side and blue in shadow, with haze between
 * the ranges and a forest of snow-laden pines. On the shore a little log cabin
 * glows warm through its windows while smoke curls from the chimney. Snow
 * falls at three depths — fine and far, big and soft right in front — and the
 * snow on the ground glints.
 *
 * The clock changes the light: the full aurora at night, the blue hour with
 * the first faint aurora at dusk, a pastel winter afternoon by day.
 *
 * Calm first: the music only lets the aurora breathe and the snow fall a
 * little thicker.
 */

const LAKE = 612 // the lake's far edge (board y)
const LAKE_END = 712

type RGB = [number, number, number]

interface Pal {
  key: string
  top: RGB
  mid: RGB
  low: RGB
  snow: RGB
  shadow: RGB
  /** how strong the aurora is (0 by day) */
  aurora: number
  /** 0 day … 1 night */
  night: number
  body: { x: number; y: number; r: number; color: string; glow: string; moon: boolean }
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 16)
    return {
      key: 'day',
      top: [118, 162, 210],
      mid: [186, 204, 228],
      low: [246, 222, 216],
      snow: [240, 245, 252],
      shadow: [150, 172, 206],
      aurora: 0,
      night: 0,
      body: { x: 1260, y: 470, r: 38, color: '#fff3dc', glow: '255,226,190', moon: false }
    }
  if ((h >= 16 && h < 19) || (h >= 5 && h < 8))
    return {
      key: 'bluehour',
      top: [16, 26, 66],
      mid: [56, 66, 120],
      low: [190, 136, 150],
      snow: [176, 186, 226],
      shadow: [80, 94, 150],
      aurora: 0.4,
      night: 0.6,
      body: { x: 300, y: 150, r: 22, color: '#eef2ff', glow: '190,205,255', moon: true }
    }
  return {
    key: 'night',
    top: [3, 8, 22],
    mid: [8, 26, 48],
    low: [20, 48, 70],
    snow: [178, 204, 226],
    shadow: [56, 80, 112],
    aurora: 1,
    night: 1,
    body: { x: 300, y: 140, r: 26, color: '#f0f4ff', glow: '190,215,255', moon: true }
  }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const tint = (c: RGB, k: number): string => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSky(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, LAKE)
  sky.addColorStop(0, rgb(P.top))
  sky.addColorStop(0.6, rgb(P.mid))
  sky.addColorStop(1, rgb(P.low))
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, LAKE + 300)
  const r = rng(9)
  if (P.night > 0.5) {
    // a faint milky way, then stars
    g.save()
    g.translate(800, 260)
    g.rotate(-0.35)
    const mw = g.createLinearGradient(0, -90, 0, 90)
    mw.addColorStop(0, 'rgba(200,210,255,0)')
    mw.addColorStop(0.5, `rgba(200,210,255,${0.07 * P.night})`)
    mw.addColorStop(1, 'rgba(200,210,255,0)')
    g.fillStyle = mw
    g.fillRect(-1100, -90, 2200, 180)
    g.restore()
    for (let i = 0; i < 360; i++) {
      g.fillStyle = `rgba(235,242,255,${(0.15 + r() * 0.7) * P.night})`
      const s = r() < 0.08 ? 2 : 1.1
      g.fillRect(r() * BW, r() * LAKE * 0.85, s, s)
    }
  }
  const { x, y, r: R } = P.body
  const glow = g.createRadialGradient(x, y, 0, x, y, R * 6)
  glow.addColorStop(0, `rgba(${P.body.glow},0.45)`)
  glow.addColorStop(1, `rgba(${P.body.glow},0)`)
  g.fillStyle = glow
  g.fillRect(x - R * 6, y - R * 6, R * 12, R * 12)
  if (P.body.moon) {
    // a waxing crescent: the dark part is cut out (not painted over), so the
    // glow and the stars stay visible where the moon is dark
    const m = document.createElement('canvas')
    m.width = m.height = Math.ceil(R * 2 + 4)
    const mg = m.getContext('2d')!
    mg.fillStyle = P.body.color
    mg.beginPath()
    mg.arc(R + 2, R + 2, R, 0, Math.PI * 2)
    mg.fill()
    mg.globalCompositeOperation = 'destination-out'
    mg.beginPath()
    mg.arc(R + 2 - R * 0.42, R + 2 - R * 0.12, R * 0.92, 0, Math.PI * 2)
    mg.fill()
    g.drawImage(m, x - R - 2, y - R - 2)
  } else {
    g.fillStyle = P.body.color
    g.beginPath()
    g.arc(x, y, R, 0, Math.PI * 2)
    g.fill()
  }
}

/** A snowy peak, lit from the right, blue in shadow on the left. */
function peak(g: CanvasRenderingContext2D, x: number, top: number, w: number, base: number, P: Pal, k: number, seed: number): void {
  const r = rng(seed)
  // body (shadow side)
  g.fillStyle = tint(P.shadow, k)
  g.beginPath()
  g.moveTo(x - w, base)
  g.lineTo(x, top)
  g.lineTo(x + w, base)
  g.closePath()
  g.fill()
  // lit face
  g.fillStyle = tint(P.snow, k)
  g.beginPath()
  g.moveTo(x, top)
  let px = x
  let py = top
  for (let i = 0; i < 6; i++) {
    px += w / 7 + r() * 8
    py += (base - top) / 7
    g.lineTo(px - r() * 40, py)
  }
  g.lineTo(x + w, base)
  g.lineTo(x + w * 0.25, base)
  // ridges running down
  for (let i = 0; i < 5; i++) g.lineTo(x + w * (0.2 - i * 0.04) + (r() - 0.5) * 30, base - (base - top) * (0.15 + i * 0.16))
  g.closePath()
  g.fill()
  // a few rock streaks in the shadow side
  g.strokeStyle = tint(P.shadow, k * 0.7)
  g.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    const sx = x - r() * w * 0.6
    const sy = top + (base - top) * (0.25 + r() * 0.6)
    g.beginPath()
    g.moveTo(sx, sy)
    g.lineTo(sx - 18 - r() * 20, sy + 30 + r() * 30)
    g.stroke()
  }
}

/** A snow-laden pine: dark tiers capped with snow on their upper faces. */
function pine(g: CanvasRenderingContext2D, x: number, base: number, h: number, green: string, snow: string): void {
  g.fillStyle = 'rgba(0,0,0,0.6)'
  g.fillRect(x - h * 0.03, base - h * 0.14, h * 0.06, h * 0.14)
  const tiers = 5
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers
    const ty = base - h * 0.12 - t * h * 0.82
    const tw = h * (0.34 - t * 0.26)
    const th = h * 0.26
    g.fillStyle = green
    g.beginPath()
    g.moveTo(x - tw, ty)
    g.lineTo(x, ty - th)
    g.lineTo(x + tw, ty)
    g.closePath()
    g.fill()
    g.fillStyle = snow
    g.beginPath()
    g.moveTo(x - tw * 0.92, ty - 1)
    g.quadraticCurveTo(x - tw * 0.4, ty - th * 0.28, x, ty - th)
    g.quadraticCurveTo(x + tw * 0.5, ty - th * 0.45, x + tw * 0.9, ty - 2)
    g.quadraticCurveTo(x + tw * 0.3, ty - th * 0.2, x - tw * 0.92, ty - 1)
    g.fill()
  }
}

function paintLand(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(31)
  // far range in haze
  for (const [x, top, w, k, seed] of [
    [260, 300, 360, 0.62, 1],
    [720, 250, 420, 0.6, 2],
    [1180, 290, 380, 0.62, 3],
    [1560, 330, 300, 0.6, 4]
  ] as const)
    peak(g, x, top, w, LAKE, P, k, seed)
  const haze = g.createLinearGradient(0, 380, 0, LAKE)
  haze.addColorStop(0, rgb(P.low, 0))
  haze.addColorStop(1, rgb(P.low, 0.5))
  g.fillStyle = haze
  g.fillRect(-300, 380, BW + 600, LAKE - 380)
  // nearer range
  for (const [x, top, w, k, seed] of [
    [-40, 420, 300, 0.78, 5],
    [520, 440, 300, 0.8, 6],
    [1420, 430, 320, 0.78, 7]
  ] as const)
    peak(g, x, top, w, LAKE, P, k, seed)
  // far forest on the lake's shore
  const forest = tint(P.shadow, 0.42)
  const forestSnow = tint(P.snow, 0.62)
  for (let i = 0; i < 70; i++) pine(g, -40 + r() * 1700, LAKE + 4, 40 + r() * 40, forest, forestSnow)

  // the frozen lake (its reflections are live)
  const lake = g.createLinearGradient(0, LAKE, 0, LAKE_END)
  lake.addColorStop(0, tint(P.low, 0.75))
  lake.addColorStop(1, tint(P.shadow, 0.55))
  g.fillStyle = lake
  g.fillRect(-300, LAKE, BW + 600, LAKE_END - LAKE)
  // cracks and frosted streaks on the ice
  g.strokeStyle = 'rgba(255,255,255,0.10)'
  g.lineWidth = 1
  for (let i = 0; i < 30; i++) {
    const cx = r() * BW
    const cy = LAKE + 8 + r() * (LAKE_END - LAKE - 16)
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + 40 + r() * 80, cy + (r() - 0.5) * 6)
    g.stroke()
  }
}

/** The snowy foreground, the cabin and the near pines. */
function paintForeground(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(51)
  // snow banks rolling into the foreground
  const bank = (y0: number, amp: number, seed: number, k: number): void => {
    const rr = rng(seed)
    const grd = g.createLinearGradient(0, y0 - amp, 0, BH)
    grd.addColorStop(0, tint(P.snow, k))
    grd.addColorStop(1, tint(P.shadow, k))
    g.fillStyle = grd
    g.beginPath()
    g.moveTo(-200, BH + 100)
    g.lineTo(-200, y0)
    for (let x = -200; x <= BW + 200; x += 120) g.quadraticCurveTo(x + 60, y0 - amp * rr(), x + 120, y0 + (rr() - 0.5) * amp * 0.5)
    g.lineTo(BW + 200, BH + 100)
    g.closePath()
    g.fill()
  }
  bank(LAKE_END, 18, 3, 0.86)

  // the cabin on the shore (windows lit live)
  const cx = 1180
  const cy = LAKE_END + 6
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.beginPath()
  g.ellipse(cx, cy + 4, 150, 14, 0, 0, Math.PI * 2)
  g.fill()
  // log walls
  for (let i = 0; i < 9; i++) {
    g.fillStyle = i % 2 ? '#4a2e1c' : '#563621'
    g.fillRect(cx - 110, cy - 14 - i * 12, 220, 12)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(cx - 110, cy - 3 - i * 12, 220, 1.5)
  }
  // log ends at the corners
  g.fillStyle = '#6b4a30'
  for (let i = 0; i < 9; i++) {
    g.beginPath()
    g.arc(cx - 112, cy - 8 - i * 12, 6, 0, Math.PI * 2)
    g.arc(cx + 112, cy - 8 - i * 12, 6, 0, Math.PI * 2)
    g.fill()
  }
  // door and windows
  g.fillStyle = '#2c1a10'
  g.fillRect(cx - 18, cy - 70, 36, 70)
  g.fillStyle = '#1a0f08'
  for (const wx of [cx - 76, cx + 44]) g.fillRect(wx, cy - 78, 32, 30)
  // chimney (stone)
  g.fillStyle = '#5d5a58'
  g.fillRect(cx + 54, cy - 188, 26, 70)
  g.fillStyle = tint(P.snow, 1)
  g.fillRect(cx + 51, cy - 192, 32, 7)
  // roof with a thick layer of snow
  g.fillStyle = '#3a2416'
  g.beginPath()
  g.moveTo(cx - 140, cy - 112)
  g.lineTo(cx, cy - 176)
  g.lineTo(cx + 140, cy - 112)
  g.closePath()
  g.fill()
  g.fillStyle = tint(P.snow, 1)
  g.beginPath()
  g.moveTo(cx - 150, cy - 104)
  g.quadraticCurveTo(cx - 70, cy - 150, cx, cy - 186)
  g.quadraticCurveTo(cx + 70, cy - 150, cx + 150, cy - 104)
  g.quadraticCurveTo(cx + 140, cy - 96, cx + 120, cy - 106)
  g.quadraticCurveTo(cx + 60, cy - 140, cx, cy - 166)
  g.quadraticCurveTo(cx - 60, cy - 140, cx - 120, cy - 106)
  g.quadraticCurveTo(cx - 140, cy - 96, cx - 150, cy - 104)
  g.fill()
  // icicles
  g.fillStyle = 'rgba(220,240,255,0.8)'
  for (let i = 0; i < 18; i++) {
    const ix = cx - 128 + i * 15 + r() * 4
    const iy = cy - 104
    g.beginPath()
    g.moveTo(ix - 2.5, iy)
    g.lineTo(ix + 2.5, iy)
    g.lineTo(ix, iy + 6 + r() * 12)
    g.fill()
  }
  // a woodpile beside it
  for (let i = 0; i < 3; i++)
    for (let k = 0; k < 4 - i; k++) {
      g.fillStyle = '#5a3a24'
      g.beginPath()
      g.arc(cx - 160 + k * 14 + i * 7, cy - 6 - i * 12, 7, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#8a6440'
      g.beginPath()
      g.arc(cx - 160 + k * 14 + i * 7, cy - 6 - i * 12, 4, 0, Math.PI * 2)
      g.fill()
    }

  // the front snow bank, then the big pines that frame the view
  bank(800, 40, 8, 0.98)
  const green = '#16261f'
  const pineSnow = tint(P.snow, 1)
  pine(g, 70, 860, 420, green, pineSnow)
  pine(g, 200, 840, 300, green, pineSnow)
  pine(g, 1520, 870, 460, green, pineSnow)
  pine(g, 1400, 850, 300, green, pineSnow)
  // soft footprints toward the cabin
  g.fillStyle = 'rgba(60,80,120,0.12)'
  for (let i = 0; i < 12; i++) {
    const t = i / 12
    const fx = 760 + t * 360 + (i % 2 ? 10 : -10)
    const fy = 880 - t * 150
    g.beginPath()
    g.ellipse(fx, fy, 7 - t * 3, 3.5 - t * 1.5, 0.3, 0, Math.PI * 2)
    g.fill()
  }
}

/** A vertical aurora ray: bright green hem fading up through cyan to violet. */
function raySprite(): Layer {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 256
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 256, 0, 0)
  grd.addColorStop(0, 'rgba(110,255,170,0)')
  grd.addColorStop(0.04, 'rgba(120,255,180,1)')
  grd.addColorStop(0.3, 'rgba(70,240,190,0.6)')
  grd.addColorStop(0.65, 'rgba(90,170,255,0.3)')
  grd.addColorStop(1, 'rgba(180,90,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 8, 256)
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Flake {
  x: number
  y: number
  z: number // 0 far … 2 near
  ph: number
}

interface State {
  v: View
  P: Pal
  sky: Layer
  land: Layer
  fg: Layer
  ray: Layer
  /** the aurora, drawn small (it is all soft) and scaled up: 1 draw, not hundreds */
  aurora: HTMLCanvasElement
  warm: Layer
  soft: Layer
  flakes: Flake[]
  smoke: { x: number; y: number; r: number; a: number; t: number }[]
  smokeAcc: number
  glints: { x: number; y: number; ph: number }[]
}

let S: State | null = null

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const r = rng(77)
  const flakes: Flake[] = []
  for (let i = 0; i < 230; i++) flakes.push({ x: r() * BW, y: r() * BH, z: i < 150 ? 0 : i < 214 ? 1 : 2, ph: r() * 6.28 })
  const glints: State['glints'] = []
  for (let i = 0; i < 70; i++) glints.push({ x: r() * BW, y: 760 + r() * 140, ph: r() * 6.28 })
  return {
    v,
    P,
    sky: makeLayer(v, (g) => paintSky(g, P)),
    land: makeLayer(v, (g) => paintLand(g, P)),
    fg: makeLayer(v, (g) => paintForeground(g, P)),
    ray: raySprite(),
    aurora: Object.assign(document.createElement('canvas'), { width: AW, height: AH }),
    warm: glowSprite('255,180,100'),
    soft: glowSprite('255,255,255', 64),
    flakes,
    smoke: [],
    smokeAcc: 0,
    glints
  }
}

/** The aurora buffer covers the sky down to the lake, at a quarter of the board. */
const AW = 400
const AH = 160
const AURORA_BOTTOM = LAKE + 28

/** The aurora: two curtains of rays, rippling, brightening in patches. */
function drawAurora(st: State, time: number, k: number): void {
  const g = st.aurora.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, AW, AH)
  g.setTransform(AW / BW, 0, 0, AH / AURORA_BOTTOM, 0, 0)
  g.globalCompositeOperation = 'lighter'
  const step = 10
  for (let curtain = 0; curtain < 2; curtain++) {
    const off = curtain * 2.7
    for (let x = -60; x < BW + 60; x += step) {
      const hem = 250 + curtain * 70 + Math.sin(x * 0.0035 + time * 0.12 + off) * 70 + Math.sin(x * 0.011 - time * 0.19 + off) * 22
      const h = 170 + Math.sin(x * 0.006 + time * 0.27 + off * 2) * 70
      const patch = (0.5 + 0.5 * Math.sin(x * 0.018 + time * 0.5 + off)) * (0.45 + 0.55 * Math.sin(x * 0.0042 - time * 0.21 + off) ** 2)
      const a = patch * k * (curtain ? 0.55 : 0.75)
      if (a < 0.02) continue
      g.globalAlpha = Math.min(1, a)
      g.drawImage(st.ray, x, hem - h, step + 1, h)
    }
  }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const winterWorld: World = {
  id: 'winter',
  name: 'Winter',
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
    const wind = 10 + Math.sin(time * 0.13) * 14 + Math.sin(time * 0.041) * 8

    ctx.save()
    ctx.drawImage(st.sky, 0, 0, width, height)
    const auroraK = P.aurora * (0.8 + 0.12 * c.breath + 0.1 * c.energy + 0.06 * c.kick)
    if (auroraK > 0.01) {
      drawAurora(st, time, auroraK)
      ctx.save()
      toBoard(ctx, st.v)
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(st.aurora, 0, 0, BW, AURORA_BOTTOM)
      ctx.restore()
    }
    ctx.drawImage(st.land, 0, 0, width, height)
    if (auroraK > 0.01) {
      ctx.save()
      toBoard(ctx, st.v)
      ctx.beginPath()
      ctx.rect(-300, LAKE, BW + 600, LAKE_END - LAKE)
      ctx.clip()
      // the ice mirrors it: flipped about the lake's edge, squashed and dimmer
      ctx.translate(0, LAKE)
      ctx.scale(1, -0.3)
      ctx.translate(0, -LAKE)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.45
      ctx.drawImage(st.aurora, 0, 0, BW, AURORA_BOTTOM)
      ctx.restore()
    }

    ctx.save()
    toBoard(ctx, st.v)
    // far snow, behind the cabin and the near trees
    for (const f of st.flakes) {
      if (f.z !== 0) continue
      f.y += (16 + Math.sin(f.ph) * 4) * dt * (1 + c.energy * 0.3)
      f.x += (wind * 0.5 + Math.sin(time * 0.7 + f.ph) * 6) * dt
      if (f.y > LAKE_END + 20) {
        f.y = -10
        f.x = Math.random() * BW
      }
      if (f.x > BW + 10) f.x = -10
      ctx.fillStyle = `rgba(240,246,255,${0.55})`
      ctx.fillRect(f.x, f.y, 1.6, 1.6)
    }
    ctx.restore()

    ctx.drawImage(st.fg, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // the cabin's windows, warm and gently flickering (a fire inside)
    const cx = 1180
    const cy = LAKE_END + 6
    const fire = 0.85 + 0.08 * Math.sin(time * 5.3) + 0.05 * Math.sin(time * 8.9 + 1)
    const warmth = (0.45 + 0.55 * P.night) * fire
    ctx.fillStyle = `rgba(255,${190 + 20 * fire},${110 + 20 * fire},${0.95})`
    for (const wx of [cx - 76, cx + 44]) {
      ctx.fillRect(wx, cy - 78, 32, 30)
      ctx.fillStyle = 'rgba(60,30,10,0.9)'
      ctx.fillRect(wx + 14.5, cy - 78, 3, 30)
      ctx.fillRect(wx, cy - 64.5, 32, 3)
      ctx.fillStyle = `rgba(255,${190 + 20 * fire},${110 + 20 * fire},${0.95})`
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.55 * warmth
    for (const wx of [cx - 60, cx + 60]) ctx.drawImage(st.warm, wx - 70, cy - 120, 140, 140)
    // light falling on the snow in front of the windows
    ctx.globalAlpha = 0.3 * warmth
    ctx.drawImage(st.warm, cx - 190, cy - 20, 380, 90)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    // chimney smoke, curling away with the wind
    st.smokeAcc += dt * 2.2
    while (st.smokeAcc > 1) {
      st.smokeAcc -= 1
      st.smoke.push({ x: cx + 67, y: cy - 192, r: 6, a: 0.28, t: 0 })
    }
    st.smoke = st.smoke.filter((p) => {
      p.t += dt
      p.y -= (18 - p.t * 1.5) * dt
      p.x += (wind * 0.6 * Math.min(1, p.t / 3) + Math.sin(p.t * 1.3) * 4) * dt
      p.r += 5 * dt
      const a = p.a * Math.max(0, 1 - p.t / 9)
      if (a <= 0.003) return false
      ctx.globalAlpha = a
      ctx.drawImage(st.soft, p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4)
      return true
    })
    ctx.globalAlpha = 1

    // glints in the snow: tiny stars that come and go
    ctx.globalCompositeOperation = 'lighter'
    for (const gl of st.glints) {
      const tw = Math.max(0, Math.sin(time * 1.1 + gl.ph * 3)) ** 8
      if (tw < 0.05) continue
      ctx.globalAlpha = tw * 0.9
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(gl.x - 0.8, gl.y - 3, 1.6, 6)
      ctx.fillRect(gl.x - 3, gl.y - 0.8, 6, 1.6)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    // nearer snow: mid flakes, then big soft ones right in front
    for (const f of st.flakes) {
      if (f.z === 0) continue
      const near = f.z === 2
      f.y += (near ? 46 : 28) * dt * (1 + c.energy * 0.3)
      f.x += (wind * (near ? 1.4 : 1) + Math.sin(time * 0.9 + f.ph) * (near ? 18 : 10)) * dt
      if (f.y > BH + 30) {
        f.y = -30
        f.x = Math.random() * BW
      }
      if (f.x > BW + 30) f.x = -30
      if (near) {
        ctx.globalAlpha = 0.5
        ctx.drawImage(st.soft, f.x - 14, f.y - 14, 28, 28)
      } else {
        ctx.globalAlpha = 0.85
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(f.x, f.y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    ctx.restore()

    const vign = ctx.createRadialGradient(width / 2, height * 0.45, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.8)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(2,6,16,0.5)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
