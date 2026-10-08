import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🌧️ Rain — the whole screen is a window high up in a rainy city at night.
 * Made for lo-fi.
 *
 * The glass is what's in focus: hundreds of beads catching the light, and
 * drops that run down in little zigzags, leaving a clear trail that slowly
 * mists over again; the corners are fogged. Behind it, out of focus, the city:
 * three rows of buildings with lit windows, pink and cyan neon signs, red
 * beacons blinking on the tallest roofs, and an avenue far below with
 * headlights one way and tail lights the other. Low clouds glow orange from
 * the city; now and then lightning lights them from inside. A slim window
 * frame and the faint reflection of a warm lamp in the glass.
 *
 * The clock changes the light (a grey rainy afternoon, a blue dusk, the night),
 * and the music thickens the rain a little and can bring a soft lightning.
 */

const MULLION = 1060 // the window's vertical bar
const SILL = 864

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: RGB
  skyLow: RGB
  cloud: string
  far: RGB
  near: RGB
  lit: number
  night: number
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 8 && h < 16.5) return { key: 'day', skyTop: [96, 104, 114], skyLow: [150, 154, 158], cloud: '170,174,180', far: [112, 118, 128], near: [74, 80, 90], lit: 0.08, night: 0 }
  if ((h >= 16.5 && h < 19.5) || (h >= 5.5 && h < 8))
    return { key: 'dusk', skyTop: [34, 40, 76], skyLow: [96, 92, 128], cloud: '120,110,150', far: [52, 56, 90], near: [30, 32, 58], lit: 0.2, night: 0.6 }
  return { key: 'night', skyTop: [10, 12, 24], skyLow: [44, 32, 40], cloud: '120,72,56', far: [26, 28, 44], near: [12, 13, 24], lit: 0.28, night: 1 }
}

const rgb = (c: RGB, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

interface CityInfo {
  beacons: { x: number; y: number; ph: number }[]
  neons: { x: number; y: number; w: number; h: number; color: string; ph: number }[]
}

/** Sky and three rows of buildings, painted out of focus (they're behind the glass). */
function paintCity(g: CanvasRenderingContext2D, P: Pal, info: CityInfo): void {
  const sky = g.createLinearGradient(0, 0, 0, 640)
  sky.addColorStop(0, rgb(P.skyTop))
  sky.addColorStop(1, rgb(P.skyLow))
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, BH + 600)
  const r = rng(5)
  const rows: [number, number, number, RGB, number, number][] = [
    // base y, min h, max h, colour, window size, blur
    [600, 160, 340, P.far, 5, 7],
    [700, 200, 420, P.near.map((v, i) => (v + P.far[i]) / 2) as RGB, 7, 6],
    [820, 240, 520, P.near, 10, 5]
  ]
  rows.forEach(([base, hMin, hMax, col, ws, blur], ri) => {
    g.filter = `blur(${blur}px)`
    let x = -60
    while (x < BW + 60) {
      const w = 70 + r() * 130
      const h = hMin + r() * (hMax - hMin)
      const top = base - h
      g.fillStyle = rgb(col)
      g.fillRect(x, top, w, h + 300)
      // a few towers get a spire with a red beacon
      if (r() < 0.22) {
        g.fillRect(x + w / 2 - 3, top - 50, 6, 50)
        info.beacons.push({ x: x + w / 2, y: top - 52, ph: r() * 6.28 })
      }
      // windows
      for (let wy = top + 12; wy < base - 8; wy += ws * 2.4) {
        for (let wx = x + 8; wx < x + w - ws - 6; wx += ws * 2) {
          if (r() > P.lit) continue
          const tone = r()
          g.fillStyle =
            tone < 0.7
              ? `rgba(255,${196 + r() * 40},${120 + r() * 60},${0.5 + r() * 0.45})`
              : tone < 0.9
                ? `rgba(170,215,255,${0.4 + r() * 0.4})`
                : `rgba(255,140,190,${0.4 + r() * 0.3})`
          g.fillRect(wx, wy, ws, ws * 1.3)
        }
      }
      // neon signs on the nearer rows
      if (ri > 0 && r() < 0.2) {
        const neon = r() < 0.5 ? '255,70,170' : '60,230,255'
        info.neons.push({ x: x + w * 0.2, y: top + 40 + r() * 80, w: w * 0.6, h: 18 + r() * 14, color: neon, ph: r() * 6.28 })
      }
      x += w + 6 + r() * 14
    }
  })
  g.filter = 'none'
  // the avenue far below: a dark band with wet reflections
  const street = g.createLinearGradient(0, 800, 0, BH)
  street.addColorStop(0, rgb(P.near))
  street.addColorStop(1, 'rgba(6,6,12,1)')
  g.fillStyle = street
  g.fillRect(-300, 806, BW + 600, BH + 300)
}

/** Beads resting on the glass and fog in the corners. */
function paintGlass(g: CanvasRenderingContext2D, P: Pal): void {
  const r = rng(29)
  for (let i = 0; i < 1700; i++) {
    const x = r() * BW
    const y = r() * SILL
    const rad = 1 + Math.pow(r(), 2.6) * 8
    // a bead is a tiny lens: darker rim, the city's glow inside, a bright catch-light
    g.fillStyle = `rgba(10,12,22,${0.22 + r() * 0.12})`
    g.beginPath()
    g.ellipse(x, y, rad, rad * 1.12, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = `rgba(${P.night > 0.5 ? '255,190,140' : '220,226,236'},${0.12 + r() * 0.18})`
    g.beginPath()
    g.ellipse(x, y + rad * 0.25, rad * 0.65, rad * 0.55, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`
    g.beginPath()
    g.arc(x - rad * 0.32, y - rad * 0.4, Math.max(0.5, rad * 0.28), 0, Math.PI * 2)
    g.fill()
  }
  // fogged corners and bottom edge
  for (const [cx, cy, rr] of [
    [0, SILL, 520],
    [BW, SILL, 480],
    [0, 0, 280],
    [BW, 0, 260]
  ] as const) {
    const fog = g.createRadialGradient(cx, cy, 0, cx, cy, rr)
    fog.addColorStop(0, 'rgba(200,205,215,0.20)')
    fog.addColorStop(1, 'rgba(200,205,215,0)')
    g.fillStyle = fog
    g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
  }
  // the room faintly mirrored: a warm lamp, low on the left
  const lamp = g.createRadialGradient(260, 610, 0, 260, 610, 140)
  lamp.addColorStop(0, 'rgba(255,196,130,0.16)')
  lamp.addColorStop(1, 'rgba(255,196,130,0)')
  g.fillStyle = lamp
  g.fillRect(120, 470, 280, 280)
  g.fillStyle = 'rgba(255,210,160,0.08)'
  g.beginPath()
  g.moveTo(230, 560)
  g.lineTo(290, 560)
  g.lineTo(310, 600)
  g.lineTo(210, 600)
  g.closePath()
  g.fill()
}

function paintFrame(g: CanvasRenderingContext2D): void {
  const wood = (x: number, y: number, w: number, h: number): void => {
    const grd = g.createLinearGradient(x, y, x + w, y + h)
    grd.addColorStop(0, '#1a1410')
    grd.addColorStop(1, '#0d0a08')
    g.fillStyle = grd
    g.fillRect(x, y, w, h)
  }
  wood(MULLION - 12, -100, 24, SILL + 120)
  g.fillStyle = 'rgba(255,200,150,0.07)'
  g.fillRect(MULLION - 12, -100, 3, SILL + 120)
  wood(-200, SILL, BW + 400, BH - SILL + 200)
  g.fillStyle = 'rgba(255,200,150,0.10)'
  g.fillRect(-200, SILL, BW + 400, 3)
  // a small plant on the sill, in silhouette
  g.fillStyle = '#0a0806'
  g.fillRect(150, SILL - 46, 60, 46)
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.28
    g.save()
    g.translate(180, SILL - 46)
    g.rotate(a + Math.PI / 2)
    g.beginPath()
    g.ellipse(0, -40, 9, 40, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Drop {
  x: number
  y: number
  r: number
  v: number
  pause: number
  /** next sideways jog */
  jog: number
}

interface State {
  v: View
  P: Pal
  city: Layer
  glass: Layer
  frame: Layer
  info: CityInfo
  /** clear paths the running drops leave; they mist over again slowly */
  trails: HTMLCanvasElement
  /** the beads minus the trails, recomposed each frame */
  glassComp: HTMLCanvasElement
  red: Layer
  white: Layer
  warm: Layer
  cloud: Layer
  drops: Drop[]
  cars: { x: number; lane: number; speed: number }[]
  flash: number
  bolt: { x: number; t: number }
  nextBolt: number
}

let S: State | null = null

const TRAIL_SCALE = 0.25 // the trail buffer is a quarter of the board

function cloudSprite(rgbStr: string): Layer {
  const c = document.createElement('canvas')
  c.width = 900
  c.height = 260
  const g = c.getContext('2d')!
  g.filter = 'blur(18px)'
  const r = rng(3)
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(${rgbStr},${0.18 + r() * 0.2})`
    g.beginPath()
    g.ellipse(80 + r() * 740, 110 + (r() - 0.5) * 80, 90 + r() * 120, 30 + r() * 40, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

function newDrop(r: () => number, anywhere = false): Drop {
  return { x: r() * BW, y: anywhere ? r() * SILL * 0.8 : r() * SILL * 0.3, r: 4 + r() * 4.5, v: 0, pause: r() * 3, jog: 0 }
}

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const info: CityInfo = { beacons: [], neons: [] }
  const city = makeLayer(v, (g) => paintCity(g, P, info))
  const trails = document.createElement('canvas')
  trails.width = Math.round(BW * TRAIL_SCALE)
  trails.height = Math.round(BH * TRAIL_SCALE)
  const r = rng(9)
  const glass = makeLayer(v, (g) => paintGlass(g, P))
  const glassComp = document.createElement('canvas')
  glassComp.width = glass.width
  glassComp.height = glass.height
  return {
    v,
    P,
    city,
    glass,
    glassComp,
    frame: makeLayer(v, paintFrame),
    info,
    trails,
    red: glowSprite('255,60,40', 64),
    white: glowSprite('255,240,220', 64),
    warm: glowSprite('255,190,120'),
    cloud: cloudSprite(P.cloud),
    drops: Array.from({ length: 22 }, () => newDrop(r, true)),
    cars: Array.from({ length: 16 }, (_, i) => ({ x: r() * BW, lane: i % 2, speed: 40 + r() * 50 })),
    flash: 0,
    bolt: { x: 0, t: -1 },
    nextBolt: 8 + r() * 10
  }
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const rainWorld: World = {
  id: 'rain',
  name: 'Rain',
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

    // lightning: rare, soft, inside the clouds (a big moment of the song may call one)
    st.nextBolt -= dt
    if ((st.nextBolt <= 0 || (c.impactHit && Math.random() < 0.25)) && st.bolt.t < 0) {
      st.bolt = { x: 200 + Math.random() * 1200, t: 0 }
      st.nextBolt = 14 + Math.random() * 18
    }
    if (st.bolt.t >= 0) {
      st.bolt.t += dt
      // a double flicker, then it fades
      const t = st.bolt.t
      st.flash = t < 0.08 ? 1 : t < 0.16 ? 0.3 : t < 0.26 ? 0.8 : Math.max(0, 0.8 - (t - 0.26) * 2.2)
      if (t > 0.7) st.bolt.t = -1
    } else st.flash = 0

    ctx.save()
    ctx.drawImage(st.city, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // low clouds drifting, glowing from the city (and from the lightning)
    for (let i = 0; i < 3; i++) {
      const cx = ((time * (5 + i * 2) + i * 700) % (BW + 900)) - 800
      ctx.globalAlpha = 0.55 + st.flash * 0.4
      ctx.drawImage(st.cloud, cx, -60 + i * 70, 900, 260)
    }
    if (st.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = st.flash * 0.55
      ctx.drawImage(st.white, st.bolt.x - 380, -200, 760, 520)
      ctx.globalAlpha = st.flash * 0.08
      ctx.fillStyle = '#cfd8ff'
      ctx.fillRect(-300, -300, BW + 600, BH + 600)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = 1

    ctx.globalCompositeOperation = 'lighter'
    // red beacons on the towers, blinking slowly
    for (const b of st.info.beacons) {
      const on = Math.max(0, Math.sin(time * 1.6 + b.ph)) ** 6
      ctx.globalAlpha = on * 0.9
      ctx.drawImage(st.red, b.x - 14, b.y - 14, 28, 28)
    }
    // neon signs, softly humming
    for (const n of st.info.neons) {
      const hum = 0.82 + 0.1 * Math.sin(time * 2.3 + n.ph) + 0.05 * Math.sin(time * 9 + n.ph)
      ctx.globalAlpha = 0.5 * hum * (0.4 + 0.6 * P.night)
      ctx.fillStyle = `rgba(${n.color},1)`
      ctx.filter = 'blur(2px)'
      ctx.fillRect(n.x, n.y, n.w, n.h)
      ctx.filter = 'none'
      ctx.globalAlpha = 0.3 * hum * (0.4 + 0.6 * P.night)
      ctx.drawImage(n.color.startsWith('255') ? st.red : st.white, n.x - 30, n.y - 40, n.w + 60, n.h + 80)
    }
    // traffic on the avenue: headlights one way, tail lights the other
    for (const car of st.cars) {
      car.x += (car.lane ? -1 : 1) * car.speed * dt
      if (car.x > BW + 60) car.x = -60
      if (car.x < -60) car.x = BW + 60
      const y = car.lane ? 846 : 862
      const sp = car.lane ? st.red : st.white
      ctx.globalAlpha = car.lane ? 0.7 : 0.6
      ctx.drawImage(sp, car.x - 16, y - 10, 32, 20)
      ctx.drawImage(sp, car.x + 10, y - 10, 32, 20)
      // the wet road reflects it as a streak
      ctx.globalAlpha *= 0.35
      ctx.drawImage(sp, car.x - 4, y + 4, 34, 40)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // rain falling outside: fine slanted streaks, thicker with the music
    const count = Math.round(130 + c.energy * 90)
    ctx.strokeStyle = `rgba(190,205,230,${0.16 + P.night * 0.06})`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < count; i++) {
      const seed = i * 71.17
      const x = ((seed * 9.31 + time * 140) % (BW + 200)) - 100
      const y = ((seed * 5.77 + time * (780 + (i % 7) * 60)) % (BH + 80)) - 40
      ctx.moveTo(x, y)
      ctx.lineTo(x - 7, y + 26)
    }
    ctx.stroke()
    ctx.restore()

    // ---- the glass
    // first the trails: where a drop ran, the beads are wiped away for a while
    const tg = st.trails.getContext('2d')!
    tg.globalCompositeOperation = 'destination-out'
    tg.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.12)})`
    tg.fillRect(0, 0, st.trails.width, st.trails.height)
    tg.globalCompositeOperation = 'source-over'
    // the static beads, with the trails wiped out of them
    const cg = st.glassComp.getContext('2d')!
    cg.globalCompositeOperation = 'copy'
    cg.drawImage(st.glass, 0, 0)
    cg.globalCompositeOperation = 'destination-out'
    cg.setTransform(st.v.dpr * st.v.s, 0, 0, st.v.dpr * st.v.s, st.v.dpr * st.v.ox, st.v.dpr * st.v.oy)
    cg.drawImage(st.trails, 0, 0, BW, BH)
    cg.setTransform(1, 0, 0, 1, 0, 0)
    cg.globalCompositeOperation = 'source-over'
    ctx.drawImage(st.glassComp, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // running drops: they stall, then run in little zigzags
    tg.save()
    tg.scale(TRAIL_SCALE, TRAIL_SCALE)
    tg.strokeStyle = 'rgba(0,0,0,0.9)' // only its alpha matters: it wipes beads away
    tg.lineCap = 'round'
    for (const d of st.drops) {
      if (d.pause > 0) {
        d.pause -= dt
        d.v *= 0.85
      } else {
        d.v = Math.min(160, d.v + (90 + d.r * 20) * dt)
        if (Math.random() < dt * 0.6) d.pause = 0.2 + Math.random() * 1.4
        if (Math.random() < dt * 2) d.jog = (Math.random() - 0.5) * 2.2
      }
      const px = d.x
      const py = d.y
      d.y += d.v * dt
      d.x += d.jog * d.v * dt * 0.08
      if (d.v > 4) {
        tg.lineWidth = d.r * 1.3
        tg.beginPath()
        tg.moveTo(px, py)
        tg.lineTo(d.x, d.y)
        tg.stroke()
      }
      if (d.y > SILL + 10) Object.assign(d, newDrop(Math.random))
      // the drop itself: a lens with the city glowing inside it
      ctx.fillStyle = 'rgba(12,14,26,0.55)'
      ctx.beginPath()
      ctx.ellipse(d.x, d.y, d.r, d.r * 1.25, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = P.night > 0.5 ? 'rgba(255,190,140,0.35)' : 'rgba(220,226,236,0.35)'
      ctx.beginPath()
      ctx.ellipse(d.x, d.y + d.r * 0.3, d.r * 0.7, d.r * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.beginPath()
      ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.45, d.r * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    tg.restore()
    // the lamp's reflection breathing with the music
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.12 + 0.05 * c.breath
    ctx.drawImage(st.warm, 120, 470, 280, 280)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.frame, 0, 0, width, height)

    const vign = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.78)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
