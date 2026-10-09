import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🎆 Réveillon — New Year's Eve on Copacabana beach.
 *
 * Fireworks go up from barges out at sea and bloom over the water: peonies,
 * chrysanthemums with trails, golden willows that rain down slowly, rings,
 * palms, crackling strobes and the odd heart. They're tied to the music: the
 * energy sets how busy the sky is, beats launch rockets, a big hit fires a
 * salvo and the chorus brings a finale. Every burst leaves a trail of light
 * that fades, and the sea mirrors it all.
 *
 * Around it, the place: the hills of Leme on the left, the lit buildings of
 * Avenida Atlântica curving away on the right, waves breaking on the sand,
 * white flowers and candles left for Iemanjá at the shore, a crowd dressed in
 * white with arms up on the beat, and the wavy black-and-white boardwalk.
 *
 * In the daytime hours it's the sunset before the party (a few early rockets).
 */

const HORIZON = 500
const SHORE = 640
const WALK = 836 // the boardwalk

interface Pal {
  key: string
  skyTop: string
  skyMid: string
  skyLow: string
  sea: string
  seaFar: string
  sand: string
  hills: string
  build: string
  lit: number
  night: number
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 7 && h < 18)
    return { key: 'dusk', skyTop: '#1d2a6b', skyMid: '#b2557a', skyLow: '#ffb067', sea: '#2a2f5c', seaFar: '#c46c6a', sand: '#6b5450', hills: '#2b2346', build: '#3a3150', lit: 0.12, night: 0.35 }
  return { key: 'night', skyTop: '#02040f', skyMid: '#0a1430', skyLow: '#1c2550', sea: '#040a1c', seaFar: '#0e1a3a', sand: '#1c1a24', hills: '#070a16', build: '#0b0e1c', lit: 0.3, night: 1 }
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintBack(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, HORIZON)
  sky.addColorStop(0, P.skyTop)
  sky.addColorStop(0.65, P.skyMid)
  sky.addColorStop(1, P.skyLow)
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, HORIZON + 300)
  const r = rng(3)
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.2 + r() * 0.5) * P.night})`
    g.fillRect(r() * BW, r() * 300, 1, 1)
  }
  // the sea, darker close by
  const sea = g.createLinearGradient(0, HORIZON, 0, SHORE)
  sea.addColorStop(0, P.seaFar)
  sea.addColorStop(1, P.sea)
  g.fillStyle = sea
  g.fillRect(-300, HORIZON, BW + 600, SHORE - HORIZON + 20)
  // the hills of Leme (and the Sugarloaf beyond) on the left
  g.fillStyle = P.hills
  g.beginPath()
  g.moveTo(-200, HORIZON + 4)
  g.lineTo(-200, 360)
  g.bezierCurveTo(-40, 330, 60, 300, 140, 352)
  g.bezierCurveTo(200, 390, 250, 420, 330, 446)
  g.bezierCurveTo(380, 462, 420, 480, 470, HORIZON + 4)
  g.fill()
  g.fillStyle = P.key === 'night' ? '#0a0e20' : '#3a3058'
  g.beginPath()
  g.moveTo(150, HORIZON)
  g.bezierCurveTo(170, 420, 196, 392, 222, 396) // a little sugarloaf far behind
  g.bezierCurveTo(250, 400, 262, 450, 280, HORIZON)
  g.fill()
  // lights on the hill
  for (let i = 0; i < 40; i++) {
    const x = -100 + r() * 520
    const y = 380 + r() * 110
    g.fillStyle = `rgba(255,${200 + r() * 40},140,${0.4 * P.lit + r() * 0.3})`
    g.fillRect(x, y, 2, 2)
  }
  // Avenida Atlântica: buildings curving away along the beach on the right,
  // with gaps between them and uneven roofs; most windows dark at this hour
  let x = 1010
  while (x < BW + 120) {
    const t = Math.min(1, (x - 1010) / 620) // 0 far → 1 near
    const w = 22 + t * 64 + r() * 18
    const base = HORIZON + 8 + t * 130
    const h = 40 + t * 200 + r() * (24 + t * 90)
    const shade = 0.75 + r() * 0.5
    g.fillStyle = P.build
    g.globalAlpha = Math.min(1, shade)
    g.fillRect(x, base - h, w, h + 40)
    g.globalAlpha = 1
    // a lighter edge facing the sea
    g.fillStyle = 'rgba(120,130,170,0.12)'
    g.fillRect(x, base - h, 2, h)
    if (r() < 0.3) g.fillRect(x + w * 0.3, base - h - 8 - t * 10, w * 0.3, 8 + t * 10) // rooftop box
    const ws = 2 + t * 3.5
    for (let wy = base - h + 6; wy < base - 4; wy += ws * 2.2) {
      for (let wx = x + 3; wx < x + w - ws; wx += ws * 2) {
        if (r() > P.lit) continue
        g.fillStyle = r() < 0.85 ? `rgba(255,${200 + r() * 40},${130 + r() * 60},${0.35 + r() * 0.4})` : 'rgba(170,210,255,0.45)'
        g.fillRect(wx, wy, ws, ws * 1.2)
      }
    }
    x += w + 4 + r() * 14
  }
}

function paintFront(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(19)
  // the sand
  const sand = g.createLinearGradient(0, SHORE, 0, WALK)
  sand.addColorStop(0, P.sand)
  sand.addColorStop(1, P.key === 'night' ? '#121018' : '#4a3a3a')
  g.fillStyle = sand
  g.beginPath()
  g.moveTo(-200, SHORE + 8)
  for (let x = -200; x <= BW + 200; x += 40) g.lineTo(x, SHORE + Math.sin(x * 0.004) * 6)
  g.lineTo(BW + 200, BH + 200)
  g.lineTo(-200, BH + 200)
  g.fill()
  // the crowd in white, seen from behind, facing the sea: packed shoulders
  // and heads, backlit by the fireworks (a pale rim along the top)
  const people: { x: number; y: number; s: number }[] = []
  for (const row of [
    { y: 706, n: 110, s: 0.5 },
    { y: 738, n: 90, s: 0.65 },
    { y: 772, n: 70, s: 0.82 },
    { y: 812, n: 52, s: 1 }
  ]) {
    for (let i = 0; i < row.n; i++) people.push({ x: r() * (BW + 120) - 60, y: row.y + (r() - 0.5) * 18, s: row.s * (0.85 + r() * 0.3) })
  }
  people.sort((a, b) => a.y - b.y)
  const night = P.key === 'night'
  for (const p of people) {
    const { x, y, s } = p
    const tone = night ? 92 + r() * 40 : 170 + r() * 40
    g.fillStyle = `rgb(${tone},${tone + 2},${tone + 14})`
    g.beginPath()
    g.moveTo(x - 15 * s, y + 30 * s)
    g.lineTo(x - 14 * s, y - 14 * s)
    g.quadraticCurveTo(x - 13 * s, y - 24 * s, x - 5 * s, y - 25 * s)
    g.lineTo(x + 5 * s, y - 25 * s)
    g.quadraticCurveTo(x + 13 * s, y - 24 * s, x + 14 * s, y - 14 * s)
    g.lineTo(x + 15 * s, y + 30 * s)
    g.closePath()
    g.fill()
    // rim light on the shoulders
    g.strokeStyle = night ? 'rgba(220,226,255,0.35)' : 'rgba(255,236,220,0.5)'
    g.lineWidth = 1.5 * s
    g.beginPath()
    g.moveTo(x - 14 * s, y - 14 * s)
    g.quadraticCurveTo(x - 13 * s, y - 24 * s, x - 5 * s, y - 25 * s)
    g.moveTo(x + 5 * s, y - 25 * s)
    g.quadraticCurveTo(x + 13 * s, y - 24 * s, x + 14 * s, y - 14 * s)
    g.stroke()
    // neck and head (hair from behind)
    g.fillStyle = night ? '#0d0b10' : '#2e211e'
    g.fillRect(x - 3 * s, y - 29 * s, 6 * s, 6 * s)
    g.beginPath()
    g.ellipse(x, y - 35 * s, 7.5 * s, 8.5 * s, 0, 0, Math.PI * 2)
    g.fill()
    if (r() < 0.25) {
      // long hair or a flower crown now and then
      g.fillRect(x - 7 * s, y - 35 * s, 14 * s, 12 * s)
    }
  }

  // the boardwalk: Burle Marx's black-and-white waves
  g.fillStyle = '#e8e6e0'
  g.fillRect(-200, WALK, BW + 400, BH - WALK + 200)
  g.fillStyle = '#16161a'
  for (let band = 0; band < 6; band++) {
    const y0 = WALK + 4 + band * 16
    g.beginPath()
    g.moveTo(-200, y0)
    for (let x = -200; x <= BW + 200; x += 10) g.lineTo(x, y0 + Math.sin((x / 90) * Math.PI) * 6)
    for (let x = BW + 200; x >= -200; x -= 10) g.lineTo(x, y0 + 8 + Math.sin((x / 90) * Math.PI) * 6)
    g.closePath()
    g.fill()
  }
  // the curb
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(-200, WALK, BW + 400, 4)
}

// ---------------------------------------------------------------------------
// fireworks
// ---------------------------------------------------------------------------

const COLORS = ['255,214,120', '255,255,255', '255,80,80', '90,255,140', '90,170,255', '255,90,220', '255,150,60', '170,120,255']
const FILLS = COLORS.map((c) => `rgb(${c})`)
const GOLD = 0
const MAX = 2400

/** The particles live in flat arrays (no per-frame allocation). */
interface Sparks {
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  life: Float32Array
  max: Float32Array
  col: Uint8Array
  kind: Uint8Array // 0 spark, 1 rocket, 2 willow, 3 strobe
  n: number
}

interface Rocket {
  i: number // particle slot
  burstAt: number
  type: number
  col: number
  col2: number
}

function sparks(): Sparks {
  return {
    x: new Float32Array(MAX),
    y: new Float32Array(MAX),
    vx: new Float32Array(MAX),
    vy: new Float32Array(MAX),
    life: new Float32Array(MAX),
    max: new Float32Array(MAX),
    col: new Uint8Array(MAX),
    kind: new Uint8Array(MAX),
    n: 0
  }
}

function add(P: Sparks, x: number, y: number, vx: number, vy: number, life: number, col: number, kind: number): number {
  // reuse a dead slot (scan from a moving cursor)
  for (let k = 0; k < MAX; k++) {
    const i = (P.n + k) % MAX
    if (P.life[i] > 0) continue
    P.x[i] = x
    P.y[i] = y
    P.vx[i] = vx
    P.vy[i] = vy
    P.life[i] = life
    P.max[i] = life
    P.col[i] = col
    P.kind[i] = kind
    P.n = (i + 1) % MAX
    return i
  }
  return -1
}

const BARGES = [330, 620, 900, 1180]

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface State {
  v: View
  P: Pal
  back: Layer
  front: Layer
  trail: HTMLCanvasElement
  tg: CanvasRenderingContext2D
  sp: Sparks
  rockets: Rocket[]
  flashes: { x: number; y: number; t: number; col: number }[]
  glows: Layer[]
  candle: Layer
  launchTimer: number
  finale: number
  lastKick: number
  kickAvg: number
  offerings: { x: number; y: number; ph: number; candle: boolean }[]
  arms: { x: number; y: number; s: number; ph: number }[]
}

let S: State | null = null
const TS = 0.5 // the trail buffer is half the board

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const trail = document.createElement('canvas')
  trail.width = BW * TS
  trail.height = HORIZON * TS
  const r = rng(77)
  return {
    v,
    P,
    back: makeLayer(v, (g) => paintBack(g, P)),
    front: makeLayer(v, (g) => paintFront(g, P)),
    trail,
    tg: trail.getContext('2d')!,
    sp: sparks(),
    rockets: [],
    flashes: [],
    glows: COLORS.map((col) => glowSprite(col, 96)),
    candle: glowSprite('255,190,110', 48),
    launchTimer: 0.5,
    finale: 0,
    lastKick: 0,
    kickAvg: 0,
    offerings: Array.from({ length: 16 }, () => ({ x: 100 + r() * 1400, y: SHORE - 22 + r() * 18, ph: r() * 6.28, candle: r() < 0.5 })),
    arms: Array.from({ length: 30 }, () => {
      const s = 0.6 + r() * 0.35
      return { x: r() * BW, y: 730 + (s - 0.6) * 220, s, ph: r() * 6.28 }
    })
  }
}

function launch(st: State, big = false): void {
  const x = BARGES[Math.floor(Math.random() * BARGES.length)] + (Math.random() - 0.5) * 60
  const i = add(st.sp, x, HORIZON - 4, (Math.random() - 0.5) * 30, -(330 + Math.random() * 130 + (big ? 60 : 0)), 3, GOLD, 1)
  if (i < 0) return
  const type = Math.random() < 0.06 ? 6 : Math.floor(Math.random() * 6)
  const col = Math.floor(Math.random() * COLORS.length)
  st.rockets.push({ i, burstAt: 120 + Math.random() * 200, type, col, col2: Math.floor(Math.random() * COLORS.length) })
}

/** Types: 0 peony, 1 chrysanthemum, 2 willow, 3 ring, 4 palm, 5 strobe, 6 heart. */
function burst(st: State, x: number, y: number, type: number, col: number, col2: number): void {
  const sp = st.sp
  const R = Math.random
  st.flashes.push({ x, y, t: 0, col })
  if (type === 0 || type === 1) {
    const n = type === 0 ? 90 : 120
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R() * 0.05
      const s = (type === 0 ? 110 : 150) * (0.85 + R() * 0.3)
      add(sp, x, y, Math.cos(a) * s, Math.sin(a) * s, 1.4 + R() * 0.6, k % 3 === 0 ? col2 : col, 0)
    }
  } else if (type === 2) {
    for (let k = 0; k < 110; k++) {
      const a = R() * Math.PI * 2
      const s = 70 + R() * 70
      add(sp, x, y, Math.cos(a) * s, Math.sin(a) * s - 20, 3 + R() * 1.2, GOLD, 2)
    }
  } else if (type === 3) {
    const tilt = R() * Math.PI
    for (let k = 0; k < 70; k++) {
      const a = (k / 70) * Math.PI * 2
      const s = 130
      const ox = Math.cos(a) * s
      const oy = Math.sin(a) * s * 0.45
      add(sp, x, y, ox * Math.cos(tilt) - oy * Math.sin(tilt), ox * Math.sin(tilt) + oy * Math.cos(tilt), 1.5, col, 0)
    }
  } else if (type === 4) {
    for (let arm = 0; arm < 9; arm++) {
      const a = (arm / 9) * Math.PI * 2
      for (let k = 0; k < 10; k++) {
        const s = 60 + k * 11
        add(sp, x, y, Math.cos(a) * s, Math.sin(a) * s - 10, 2 + R() * 0.4, k < 3 ? GOLD : col, 2)
      }
    }
  } else if (type === 5) {
    for (let k = 0; k < 80; k++) {
      const a = R() * Math.PI * 2
      const s = 40 + R() * 110
      add(sp, x, y, Math.cos(a) * s, Math.sin(a) * s, 1.6 + R() * 0.8, 1, 3)
    }
  } else {
    // a heart
    for (let k = 0; k < 80; k++) {
      const t = (k / 80) * Math.PI * 2
      const hx = 16 * Math.pow(Math.sin(t), 3)
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
      add(sp, x, y, hx * 7, hy * 7, 1.7, 2, 0)
    }
  }
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const newYearWorld: World = {
  id: 'newyear',
  name: 'Réveillon',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    S = build(c)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time } = c
    const dt = Math.min(c.dt, 0.05)
    const v = viewFor(c)
    if (!S || !sameView(S.v, v) || S.P.key !== palFor(c.dayPhase).key) S = build(c)
    const st = S
    const P = st.P
    const sp = st.sp

    // ---- what goes up: the music decides
    const onset = c.kick > Math.max(0.25, st.kickAvg * 1.35 + 0.08) && st.lastKick <= c.kick
    st.kickAvg += (c.kick - st.kickAvg) * Math.min(1, dt * 3)
    st.lastKick = c.kick
    const busy = (P.key === 'night' ? 1 : 0.4) * (0.35 + c.energy * 0.9 + c.surge * 0.8)
    st.launchTimer -= dt * busy
    if (st.launchTimer <= 0) {
      launch(st)
      st.launchTimer = 0.9 + Math.random() * 0.9
    }
    if (onset && Math.random() < 0.35 * busy) launch(st)
    if (c.impactHit) for (let k = 0; k < 4; k++) launch(st, true)
    // a finale when the chorus hits
    if (c.surge > 0.55 && st.finale <= 0) st.finale = 3
    if (st.finale > 0) {
      st.finale -= dt
      if (Math.random() < dt * 9) launch(st, true)
    }

    // ---- physics
    for (let r = st.rockets.length - 1; r >= 0; r--) {
      const rk = st.rockets[r]
      const i = rk.i
      // the rocket's own sparkling tail
      if (Math.random() < 0.8) add(sp, sp.x[i], sp.y[i] + 4, (Math.random() - 0.5) * 20, 20, 0.4, GOLD, 0)
      if (sp.y[i] <= rk.burstAt || sp.vy[i] > -60 || sp.life[i] <= 0) {
        burst(st, sp.x[i], sp.y[i], rk.type, rk.col, rk.col2)
        sp.life[i] = 0
        st.rockets.splice(r, 1)
      }
    }
    for (let i = 0; i < MAX; i++) {
      if (sp.life[i] <= 0) continue
      const k = sp.kind[i]
      const drag = k === 1 ? 0 : k === 2 ? 1.6 : 1.1
      sp.vx[i] *= 1 - drag * dt
      sp.vy[i] *= 1 - drag * dt
      sp.vy[i] += (k === 1 ? 90 : k === 2 ? 34 : 55) * dt
      sp.x[i] += sp.vx[i] * dt
      sp.y[i] += sp.vy[i] * dt
      sp.life[i] -= dt
      if (sp.y[i] > HORIZON + 4) sp.life[i] = 0
    }

    // ---- the light trails: last frames fade, new sparks are added
    const tg = st.tg
    tg.globalCompositeOperation = 'destination-out'
    tg.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 3.2)})`
    tg.fillRect(0, 0, st.trail.width, st.trail.height)
    tg.globalCompositeOperation = 'lighter'
    for (let i = 0; i < MAX; i++) {
      if (sp.life[i] <= 0) continue
      const f = sp.life[i] / sp.max[i]
      const k = sp.kind[i]
      let a = k === 2 ? Math.min(1, f * 1.6) : f
      if (k === 3) a = Math.random() < 0.35 ? 1 : 0.05 // crackle
      if (a < 0.03) continue
      tg.globalAlpha = a
      tg.fillStyle = FILLS[sp.col[i]]
      const s = k === 1 ? 2 : 1.4
      tg.fillRect(sp.x[i] * TS - s / 2, sp.y[i] * TS - s / 2, s, s)
    }
    tg.globalAlpha = 1
    tg.globalCompositeOperation = 'source-over'

    // ---- draw
    ctx.save()
    ctx.drawImage(st.back, 0, 0, width, height)
    ctx.save()
    toBoard(ctx, st.v)

    // flashes light the sky around each burst
    ctx.globalCompositeOperation = 'lighter'
    for (let f = st.flashes.length - 1; f >= 0; f--) {
      const fl = st.flashes[f]
      fl.t += dt
      if (fl.t > 0.9) {
        st.flashes.splice(f, 1)
        continue
      }
      const a = Math.max(0, 1 - fl.t / 0.9)
      ctx.globalAlpha = a * a * 0.3
      ctx.drawImage(st.glows[fl.col], fl.x - 220, fl.y - 220, 440, 440)
      // and its reflection on the water
      ctx.globalAlpha = a * 0.25
      ctx.drawImage(st.glows[fl.col], fl.x - 160, HORIZON + (HORIZON - fl.y) * 0.25 - 40, 320, 120)
    }
    ctx.globalAlpha = 1
    // the sky's trails
    ctx.drawImage(st.trail, 0, 0, BW, HORIZON)
    // the sea mirrors them, squashed and dimmer
    ctx.save()
    ctx.beginPath()
    ctx.rect(-300, HORIZON, BW + 600, SHORE - HORIZON)
    ctx.clip()
    ctx.translate(0, HORIZON)
    ctx.scale(1, -0.32)
    ctx.globalAlpha = 0.45
    const wob = Math.sin(time * 3) * 3
    ctx.drawImage(st.trail, wob, -HORIZON, BW, HORIZON)
    ctx.restore()
    ctx.globalCompositeOperation = 'source-over'

    // barges on the horizon, with their little lights
    for (const bx of BARGES) {
      ctx.fillStyle = '#05060c'
      ctx.fillRect(bx - 34, HORIZON - 6, 68, 8)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 4 + bx)
      ctx.drawImage(st.candle, bx - 40, HORIZON - 12, 16, 16)
      ctx.drawImage(st.candle, bx + 24, HORIZON - 12, 16, 16)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
    // the waves breaking on the sand
    for (let k = 0; k < 3; k++) {
      const ph = ((time * 0.22 + k / 3) % 1)
      const y = SHORE - 30 + ph * 34
      ctx.strokeStyle = `rgba(230,240,255,${0.45 * Math.sin(ph * Math.PI)})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let x = -100; x <= BW + 100; x += 24) {
        const yy = y + Math.sin(x * 0.012 + k * 2 + time * 0.6) * 4
        if (x === -100) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
    ctx.restore()

    ctx.drawImage(st.front, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // offerings for Iemanjá: white flowers and candles rocking at the shore
    for (const o of st.offerings) {
      const bob = Math.sin(time * 1.4 + o.ph) * 2
      ctx.fillStyle = 'rgba(245,245,255,0.9)'
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + o.ph
        ctx.beginPath()
        ctx.ellipse(o.x + Math.cos(a) * 4, o.y + bob + Math.sin(a) * 2, 3, 2, a, 0, Math.PI * 2)
        ctx.fill()
      }
      if (o.candle) {
        ctx.fillStyle = '#f4f0e0'
        ctx.fillRect(o.x + 10, o.y + bob - 8, 3, 8)
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 9 + o.ph)
        ctx.drawImage(st.candle, o.x + 3, o.y + bob - 18, 18, 18)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
    // arms up in the crowd, on the beat
    ctx.strokeStyle = P.key === 'night' ? 'rgb(120,122,138)' : 'rgb(200,190,200)'
    ctx.lineCap = 'round'
    const lift = 0.5 + c.kick * 0.5 + c.surge * 0.4
    for (const a of st.arms) {
      const s = a.s
      const wave = Math.sin(time * 4 + a.ph) * 0.3
      const ang = -Math.PI / 2 + wave
      const len = 26 * s * Math.min(1.2, lift)
      ctx.lineWidth = 4 * s
      ctx.beginPath()
      ctx.moveTo(a.x - 12 * s, a.y - 18 * s)
      ctx.lineTo(a.x - 12 * s + Math.cos(ang - 0.25) * len, a.y - 18 * s + Math.sin(ang - 0.25) * len)
      ctx.moveTo(a.x + 12 * s, a.y - 18 * s)
      ctx.lineTo(a.x + 12 * s + Math.cos(ang + 0.25) * len, a.y - 18 * s + Math.sin(ang + 0.25) * len)
      ctx.stroke()
    }
    ctx.restore()

    // the whole beach catches the colour of the brightest burst
    let flash = 0
    let fcol = 0
    for (const fl of st.flashes) {
      const a = Math.max(0, 1 - fl.t / 0.6)
      if (a > flash) {
        flash = a
        fcol = fl.col
      }
    }
    if (flash > 0.05) {
      ctx.globalCompositeOperation = 'soft-light'
      ctx.fillStyle = `rgba(${COLORS[fcol]},${flash * 0.35})`
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
    }
    const vign = ctx.createRadialGradient(width / 2, height * 0.4, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.8)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(0,0,8,0.5)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
