import type { World, WorldContext } from './types'
import { BW, BH, glowSprite, makeLayer, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🍄 Bioluminescent Forest — night on a moon that isn't ours.
 *
 * A giant ringed planet fills part of the sky, and mountains float above the
 * mist with waterfalls pouring off their edges. In front, the forest: giant
 * trunks patterned with glowing marks that pulse in slow waves; glowing
 * mushrooms that brighten with the kick; tall spiral plants that curl up
 * tight on a big hit and slowly unfurl again; reeds with lit tips swaying.
 * On every beat a ring of light runs across the moss, like a footstep. Seeds
 * like little jellyfish drift through the air (more when someone sings), and
 * pollen floats everywhere.
 *
 * In the daytime hours it's the violet dusk before the glow, the planet bright.
 */

type RGB = [number, number, number]

interface Pal {
  key: string
  skyTop: string
  skyMid: string
  skyLow: string
  stars: number
  planet: [string, string]
  rocks: string
  rim: string
  mist: string
  trunk: string
  ground: string
  /** how strong the bioluminescence is (dimmer before dark) */
  glow: number
}

function palFor(dayPhase: number): Pal {
  const h = dayPhase * 24
  if (h >= 7 && h < 18)
    return {
      key: 'dusk',
      skyTop: '#16184a',
      skyMid: '#4b3a8e',
      skyLow: '#d07fb4',
      stars: 0.25,
      planet: ['#bfe4ff', '#5b7fc4'],
      rocks: '#34306a',
      rim: 'rgba(255,200,235,0.6)',
      mist: '220,190,255',
      trunk: '#0d0c22',
      ground: '#0b0a1c',
      glow: 0.65
    }
  return {
    key: 'night',
    skyTop: '#01020a',
    skyMid: '#06102a',
    skyLow: '#0f2244',
    stars: 1,
    planet: ['#6fb8c8', '#1c3a5c'],
    rocks: '#16264a',
    rim: 'rgba(140,230,255,0.6)',
    mist: '120,200,255',
    trunk: '#03050d',
    ground: '#02040b',
    glow: 1
  }
}

const CYAN: RGB = [80, 240, 255]
const TEAL: RGB = [60, 255, 190]
const MAGENTA: RGB = [255, 80, 220]
const VIOLET: RGB = [170, 110, 255]
const AMBER: RGB = [255, 150, 60]
const GLOWS = [CYAN, TEAL, MAGENTA, VIOLET, AMBER]

const GROUND = 720

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSky(g: CanvasRenderingContext2D, P: Pal): void {
  const sky = g.createLinearGradient(0, 0, 0, GROUND)
  sky.addColorStop(0, P.skyTop)
  sky.addColorStop(0.6, P.skyMid)
  sky.addColorStop(1, P.skyLow)
  g.fillStyle = sky
  g.fillRect(-300, -300, BW + 600, BH + 600)
  const r = rng(6)
  for (let i = 0; i < 320; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.2 + r() * 0.6) * P.stars})`
    const s = r() < 0.93 ? 1 : 2
    g.fillRect(r() * BW, r() * 500, s, s)
  }
  // the gas giant: banded, lit from the left, with a thin tilted ring
  const px = 1180
  const py = 230
  const pr = 210
  g.save()
  g.beginPath()
  g.arc(px, py, pr, 0, Math.PI * 2)
  g.clip()
  const body = g.createRadialGradient(px - pr * 0.5, py - pr * 0.3, pr * 0.1, px, py, pr * 1.05)
  body.addColorStop(0, P.planet[0])
  body.addColorStop(1, P.planet[1])
  g.fillStyle = body
  g.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  for (let b = 0; b < 14; b++) {
    const y = py - pr + (b / 14) * pr * 2 + r() * 8
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '20,40,80'},${0.05 + r() * 0.08})`
    g.fillRect(px - pr, y, pr * 2, 6 + r() * 16)
  }
  // the night side
  const night = g.createLinearGradient(px - pr, 0, px + pr, 0)
  night.addColorStop(0.35, 'rgba(0,0,10,0)')
  night.addColorStop(1, 'rgba(0,0,10,0.85)')
  g.fillStyle = night
  g.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  g.restore()
  g.save()
  g.translate(px, py)
  g.rotate(-0.25)
  g.strokeStyle = 'rgba(220,240,255,0.35)'
  g.lineWidth = 3
  g.beginPath()
  g.ellipse(0, 0, pr * 1.55, pr * 0.22, 0, Math.PI * 0.02, Math.PI * 0.98, true)
  g.stroke()
  g.restore()
  // two small moons
  for (const [mx, my, mr] of [
    [880, 120, 16],
    [950, 160, 8]
  ]) {
    g.fillStyle = '#d8e4f0'
    g.beginPath()
    g.arc(mx, my, mr, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(0,0,20,0.55)'
    g.beginPath()
    g.arc(mx + mr * 0.45, my, mr, 0, Math.PI * 2)
    g.fill()
  }
}

interface Falls {
  x: number
  top: number
  len: number
}

/** Mountains floating over the mist, with waterfalls pouring off them. */
function paintFloating(g: CanvasRenderingContext2D, P: Pal, falls: Falls[]): void {
  const r = rng(14)
  const rocks: [number, number, number, number][] = [
    [180, 300, 170, 150],
    [470, 210, 120, 120],
    [760, 330, 210, 170],
    [1030, 260, 90, 90],
    [1420, 360, 160, 140]
  ]
  for (const [x, y, w, h] of rocks) {
    // the top (rounded, with a little jungle), the underside (a long jagged root)
    g.fillStyle = P.rocks
    g.beginPath()
    g.moveTo(x - w / 2, y)
    g.bezierCurveTo(x - w * 0.45, y - h * 0.3, x - w * 0.2, y - h * 0.38, x, y - h * 0.34)
    g.bezierCurveTo(x + w * 0.25, y - h * 0.4, x + w * 0.45, y - h * 0.22, x + w / 2, y)
    g.lineTo(x + w * 0.3, y + h * 0.3)
    g.lineTo(x + w * 0.12, y + h * 0.45)
    g.lineTo(x, y + h)
    g.lineTo(x - w * 0.14, y + h * 0.5)
    g.lineTo(x - w * 0.34, y + h * 0.28)
    g.closePath()
    g.fill()
    // tufts of trees on top
    for (let k = 0; k < 9; k++) {
      const tx = x - w * 0.42 + r() * w * 0.84
      const ty = y - h * 0.3 - Math.sin(((tx - x) / w + 0.5) * Math.PI) * h * 0.06
      g.beginPath()
      g.ellipse(tx, ty, 8 + r() * 12, 6 + r() * 8, 0, 0, Math.PI * 2)
      g.fill()
    }
    // hanging vines
    g.strokeStyle = P.rocks
    g.lineWidth = 1.5
    for (let k = 0; k < 7; k++) {
      const vx = x - w * 0.35 + r() * w * 0.7
      g.beginPath()
      g.moveTo(vx, y + 4)
      g.quadraticCurveTo(vx + 6, y + 30, vx - 2, y + 30 + r() * 60)
      g.stroke()
    }
    // rim light on the planet side
    g.strokeStyle = P.rim
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(x + w * 0.05, y - h * 0.35)
    g.bezierCurveTo(x + w * 0.25, y - h * 0.4, x + w * 0.45, y - h * 0.22, x + w / 2, y)
    g.stroke()
    // a soft haze under each island, so its shape reads against the sky
    const haze = g.createRadialGradient(x, y + h * 0.35, 4, x, y + h * 0.35, w * 0.8)
    haze.addColorStop(0, `rgba(${P.mist},0.16)`)
    haze.addColorStop(1, `rgba(${P.mist},0)`)
    g.fillStyle = haze
    g.fillRect(x - w, y - h * 0.4, w * 2, h * 1.6)
    if (r() < 0.8) falls.push({ x: x - w * 0.2 + r() * w * 0.4, top: y + 6, len: 180 + r() * 160 })
  }
  // the mist the mountains float over
  const mist = g.createLinearGradient(0, 480, 0, GROUND)
  mist.addColorStop(0, `rgba(${P.mist},0)`)
  mist.addColorStop(1, `rgba(${P.mist},0.22)`)
  g.fillStyle = mist
  g.fillRect(-300, 480, BW + 600, GROUND - 480 + 40)
}

interface Mark {
  x: number
  y: number
  s: number
  c: number
  ph: number
}

/** Giant trunks and the near canopy, with glowing marks recorded for later. */
function paintTrees(g: CanvasRenderingContext2D, P: Pal, marks: Mark[]): void {
  const r = rng(33)
  const trunks: [number, number, number][] = [
    [90, 140, 0.15],
    [420, 70, -0.06],
    [1290, 110, 0.08],
    [1530, 160, -0.12]
  ]
  for (const [x, w, lean] of trunks) {
    g.fillStyle = P.trunk
    g.beginPath()
    // a trunk widening into buttress roots at the ground
    g.moveTo(x - w * 1.3, GROUND + 30)
    g.quadraticCurveTo(x - w * 0.6, GROUND - 20, x - w / 2, GROUND - 120)
    g.lineTo(x - w / 2 + lean * 900, -100)
    g.lineTo(x + w / 2 + lean * 900, -100)
    g.lineTo(x + w / 2, GROUND - 120)
    g.quadraticCurveTo(x + w * 0.6, GROUND - 20, x + w * 1.3, GROUND + 30)
    g.closePath()
    g.fill()
    // glowing marks running up the bark in lines and spirals
    const lines = 3 + Math.floor(r() * 3)
    for (let l = 0; l < lines; l++) {
      const off = (r() - 0.5) * w * 0.7
      const c = Math.floor(r() * 4)
      for (let k = 0; k < 26; k++) {
        const y = GROUND - 40 - k * 26 - r() * 8
        const t = (GROUND - y) / (GROUND + 100)
        const cx = x + lean * 900 * t + off + Math.sin(k * 0.6 + l) * w * 0.12
        marks.push({ x: cx, y, s: 2 + r() * 3, c, ph: k * 0.35 + l })
      }
    }
  }
  // the canopy hanging into the top of the frame, with long vines
  g.fillStyle = P.trunk
  for (let i = 0; i < 26; i++) {
    const x = r() * BW
    g.beginPath()
    g.ellipse(x, -30 + r() * 40, 90 + r() * 120, 50 + r() * 50, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = P.trunk
  for (let i = 0; i < 40; i++) {
    const x = r() * BW
    const len = 80 + r() * 220
    g.lineWidth = 1 + r() * 2
    g.beginPath()
    g.moveTo(x, 0)
    g.bezierCurveTo(x + 10, len * 0.3, x - 12, len * 0.7, x + (r() - 0.5) * 20, len)
    g.stroke()
    if (r() < 0.5) marks.push({ x: x + (r() - 0.5) * 10, y: len, s: 3, c: Math.floor(r() * 4), ph: r() * 6 })
  }
}

function paintGround(g: CanvasRenderingContext2D, P: Pal): void {
  g.fillStyle = P.ground
  g.beginPath()
  g.moveTo(-300, GROUND + 20)
  for (let x = -300; x <= BW + 300; x += 40) g.lineTo(x, GROUND + Math.sin(x * 0.007) * 10 + Math.sin(x * 0.021) * 5)
  g.lineTo(BW + 300, BH + 300)
  g.lineTo(-300, BH + 300)
  g.fill()
  // ferns along the ground, in silhouette
  const r = rng(8)
  for (let i = 0; i < 40; i++) {
    const x = r() * BW
    const y = GROUND + 8 + r() * 20
    const h = 30 + r() * 50
    for (let k = -3; k <= 3; k++) {
      g.save()
      g.translate(x, y)
      g.rotate(k * 0.32)
      g.beginPath()
      g.ellipse(0, -h / 2, 5, h / 2, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
  }
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Shroom {
  x: number
  y: number
  r: number
  c: number
  ph: number
}

interface Spiral {
  x: number
  y: number
  h: number
  ph: number
  curl: number
}

interface Seed {
  x: number
  y: number
  vx: number
  ph: number
  s: number
}

interface State {
  v: View
  P: Pal
  sky: Layer
  floating: Layer
  trees: Layer
  ground: Layer
  falls: Falls[]
  marks: Mark[]
  sprites: Layer[]
  mist: Layer
  shrooms: Shroom[]
  spirals: Spiral[]
  reeds: { x: number; y: number; h: number; ph: number; c: number }[]
  seeds: Seed[]
  motes: { x: number; y: number; ph: number }[]
  waves: { x: number; t: number; c: number }[]
  lastKick: number
  kickAvg: number
  curl: number
}

let S: State | null = null

function build(c: WorldContext): State {
  const v = viewFor(c)
  const P = palFor(c.dayPhase)
  const falls: Falls[] = []
  const marks: Mark[] = []
  const r = rng(51)
  const shrooms: Shroom[] = []
  // mushroom clusters around the trunks' feet and in the open
  for (const cx of [150, 360, 560, 980, 1210, 1450]) {
    const n = 4 + Math.floor(r() * 4)
    const c0 = Math.floor(r() * 4)
    for (let k = 0; k < n; k++)
      shrooms.push({ x: cx + (r() - 0.5) * 110, y: GROUND + 6 + r() * 26, r: 7 + r() * 16, c: r() < 0.7 ? c0 : Math.floor(r() * 4), ph: r() * 6.28 })
  }
  shrooms.sort((a, b) => a.y - b.y)
  return {
    v,
    P,
    sky: makeLayer(v, (g) => paintSky(g, P)),
    floating: makeLayer(v, (g) => paintFloating(g, P, falls)),
    trees: makeLayer(v, (g) => paintTrees(g, P, marks)),
    ground: makeLayer(v, (g) => paintGround(g, P)),
    falls,
    marks,
    sprites: GLOWS.map((col) => glowSprite(col.join(','), 64)),
    mist: glowSprite(P.mist, 128),
    shrooms,
    spirals: [260, 700, 840, 1100, 1380].map((x) => ({ x: x + (r() - 0.5) * 40, y: GROUND + 14, h: 150 + r() * 110, ph: r() * 6.28, curl: 0 })),
    reeds: Array.from({ length: 34 }, () => ({ x: r() * BW, y: GROUND + 10 + r() * 30, h: 60 + r() * 120, ph: r() * 6.28, c: Math.floor(r() * 4) })),
    seeds: Array.from({ length: 10 }, () => ({ x: r() * BW, y: 220 + r() * 420, vx: (r() - 0.5) * 10, ph: r() * 6.28, s: 0.7 + r() * 0.6 })),
    motes: Array.from({ length: 90 }, () => ({ x: r() * BW, y: 200 + r() * 600, ph: r() * 6.28 })),
    waves: [],
    lastKick: 0,
    kickAvg: 0,
    curl: 0
  }
}

const col = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/**
 * A spiral plant: a cluster of three tall fronds, each a tapered stalk ending
 * in a big coiled membrane (like a giant fiddlehead) with a glowing edge.
 * `curl` 0 = open, 1 = rolled up tight and pulled down.
 */
function drawSpiral(ctx: CanvasRenderingContext2D, s: Spiral, time: number, glow: number, curl: number, sprite: Layer): void {
  for (let f = 0; f < 3; f++) {
    const lean = (f - 1) * 0.16
    const hk = [0.78, 1, 0.66][f]
    const sway = Math.sin(time * 0.8 + s.ph + f) * 0.04
    const h = s.h * hk * (1 - curl * 0.5)
    ctx.save()
    ctx.translate(s.x + (f - 1) * 14, s.y)
    ctx.rotate(lean + sway)
    // the tapered stalk
    ctx.fillStyle = '#1c0d08'
    ctx.beginPath()
    ctx.moveTo(-5, 0)
    ctx.quadraticCurveTo(5, -h * 0.5, -1.5, -h)
    ctx.lineTo(1.5, -h)
    ctx.quadraticCurveTo(11, -h * 0.5, 5, 0)
    ctx.closePath()
    ctx.fill()
    // the coil: a spiral band, wide at the outside, narrowing to the centre
    ctx.translate(0, -h)
    const turns = 1.6 + curl * 1.4
    const R = 34 * hk * (1 - curl * 0.55)
    const dir = f === 1 ? 1 : -1
    const pts: [number, number, number][] = []
    for (let k = 0; k <= 70; k++) {
      const t = k / 70
      const a = Math.PI + dir * t * turns * Math.PI * 2
      const rr = R * (1 - t * 0.9)
      pts.push([Math.cos(a) * rr + R * dir, Math.sin(a) * rr - R * 0.2, (1 - t) * 10 * hk + 1.5])
    }
    // membrane, warm at the heart
    const grad = ctx.createRadialGradient(R * dir, -R * 0.2, 2, R * dir, -R * 0.2, R * 1.2)
    grad.addColorStop(0, col([255, 210, 120], 0.95))
    grad.addColorStop(0.6, col(AMBER, 0.9))
    grad.addColorStop(1, col([200, 50, 30], 0.9))
    ctx.strokeStyle = grad
    ctx.lineCap = 'round'
    // the band narrows toward the centre: drawn in 7 runs of equal width
    // (one stroke per run, not per point — this plant is drawn 15 times a frame)
    const RUN = 10
    for (let k0 = 0; k0 < pts.length - 1; k0 += RUN) {
      const k1 = Math.min(pts.length - 1, k0 + RUN)
      ctx.lineWidth = pts[Math.floor((k0 + k1) / 2)][2]
      ctx.beginPath()
      ctx.moveTo(pts[k0][0], pts[k0][1])
      for (let k = k0 + 1; k <= k1; k++) ctx.lineTo(pts[k][0], pts[k][1])
      ctx.stroke()
    }
    // the glow around the coil
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.3 * glow
    ctx.drawImage(sprite, R * dir - R * 1.6, -R * 1.8, R * 3.2, R * 3.2)
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const biolumWorld: World = {
  id: 'biolum',
  name: 'Floresta Bioluminescente',
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
    const G = P.glow * (0.8 + c.energy * 0.25 + c.surge * 0.3)

    // beats send rings of light across the moss
    const onset = c.kick > Math.max(0.25, st.kickAvg * 1.35 + 0.08) && st.lastKick <= c.kick
    st.kickAvg += (c.kick - st.kickAvg) * Math.min(1, dt * 3)
    st.lastKick = c.kick
    if (onset && st.waves.length < 6) st.waves.push({ x: 200 + Math.random() * 1200, t: 0, c: Math.floor(Math.random() * 4) })
    // a big hit makes the spiral plants roll up; they unfurl slowly
    if (c.impactHit) st.curl = 1
    st.curl = Math.max(0, st.curl - dt * 0.35)

    ctx.save()
    ctx.drawImage(st.sky, 0, 0, width, height)
    ctx.drawImage(st.floating, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // waterfalls off the floating mountains, falling into the mist
    for (const f of st.falls) {
      const grd = ctx.createLinearGradient(0, f.top, 0, f.top + f.len)
      grd.addColorStop(0, `rgba(${P.mist},0.55)`)
      grd.addColorStop(1, `rgba(${P.mist},0)`)
      ctx.fillStyle = grd
      for (let k = 0; k < 3; k++) {
        const o = ((time * 60 + k * 40) % 40) / 40
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(o * Math.PI)
        ctx.fillRect(f.x - 3 + k * 2, f.top, 2.5, f.len)
      }
      ctx.globalAlpha = 0.3
      ctx.drawImage(st.mist, f.x - 40, f.top + f.len - 50, 80, 60)
    }
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.trees, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    ctx.globalCompositeOperation = 'lighter'
    // the marks on the trunks pulse in waves running up the bark
    for (const m of st.marks) {
      const wave = 0.5 + 0.5 * Math.sin(time * 1.6 - m.ph)
      const a = (0.25 + 0.6 * wave * wave) * G
      if (a < 0.05) continue
      ctx.globalAlpha = Math.min(1, a)
      const s = m.s * 5
      ctx.drawImage(st.sprites[m.c], m.x - s / 2, m.y - s / 2, s, s)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    ctx.drawImage(st.ground, 0, 0, width, height)

    ctx.save()
    toBoard(ctx, st.v)
    // rings of light across the moss, seen at a low angle
    ctx.globalCompositeOperation = 'lighter'
    for (let i = st.waves.length - 1; i >= 0; i--) {
      const w = st.waves[i]
      w.t += dt
      if (w.t > 2.2) {
        st.waves.splice(i, 1)
        continue
      }
      const rad = 30 + w.t * 260
      const a = (1 - w.t / 2.2) * 0.6 * G
      ctx.strokeStyle = col(GLOWS[w.c], a * 0.8)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(w.x, GROUND + 26, rad, rad * 0.12, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = col(GLOWS[w.c], a * 0.2)
      ctx.lineWidth = 12
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'

    // reeds with glowing tips
    ctx.lineCap = 'round'
    for (const rd of st.reeds) {
      const sway = Math.sin(time * 1.1 + rd.ph) * 10 + c.sway * 6
      const tx = rd.x + sway
      const ty = rd.y - rd.h
      ctx.strokeStyle = '#06060e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(rd.x, rd.y)
      ctx.quadraticCurveTo(rd.x + sway * 0.2, rd.y - rd.h * 0.5, tx, ty)
      ctx.stroke()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = Math.min(1, (0.45 + 0.35 * Math.sin(time * 2 + rd.ph) + c.hihats * 0.4) * G)
      ctx.drawImage(st.sprites[rd.c], tx - 9, ty - 9, 18, 18)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }

    // the spiral plants
    for (const sp of st.spirals) {
      sp.curl += (st.curl - sp.curl) * Math.min(1, dt * (st.curl > sp.curl ? 12 : 2))
      drawSpiral(ctx, sp, time, G, sp.curl, st.sprites[4])
    }

    // glowing mushrooms: caps brighten with the kick
    for (const m of st.shrooms) {
      const pulse = (0.55 + 0.25 * Math.sin(time * 1.3 + m.ph) + c.kick * 0.5) * G
      const C = GLOWS[m.c]
      // the stem
      ctx.fillStyle = col([200, 220, 230], 0.25 + 0.2 * pulse)
      ctx.fillRect(m.x - m.r * 0.15, m.y - m.r * 1.2, m.r * 0.3, m.r * 1.2)
      // the cap
      const cap = ctx.createRadialGradient(m.x, m.y - m.r * 1.4, 1, m.x, m.y - m.r * 1.2, m.r)
      cap.addColorStop(0, col([255, 255, 255], Math.min(1, 0.6 * pulse)))
      cap.addColorStop(0.4, col(C, Math.min(1, 0.85 * pulse)))
      cap.addColorStop(1, col(C, 0.25 * pulse))
      ctx.fillStyle = cap
      ctx.beginPath()
      ctx.ellipse(m.x, m.y - m.r * 1.2, m.r, m.r * 0.6, 0, Math.PI, 0)
      ctx.fill()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = Math.min(1, 0.45 * pulse)
      ctx.drawImage(st.sprites[m.c], m.x - m.r * 3, m.y - m.r * 3.6, m.r * 6, m.r * 5)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }

    // seeds drifting like jellyfish; more come out when someone sings
    const want = 6 + Math.round(c.vocals * 8 + c.surge * 6)
    if (st.seeds.length < want && Math.random() < dt * 2) st.seeds.push({ x: Math.random() * BW, y: GROUND + 20, vx: (Math.random() - 0.5) * 10, ph: Math.random() * 6.28, s: 0.6 + Math.random() * 0.6 })
    ctx.globalCompositeOperation = 'lighter'
    for (let i = st.seeds.length - 1; i >= 0; i--) {
      const sd = st.seeds[i]
      const beat = Math.pow(Math.max(0, Math.sin(time * 2 + sd.ph)), 3)
      sd.y -= (6 + beat * 18) * dt
      sd.x += (sd.vx + Math.sin(time * 0.5 + sd.ph) * 6) * dt
      if (sd.y < 120 || st.seeds.length > want + 4) {
        if (sd.y < 120 || Math.random() < dt) {
          st.seeds.splice(i, 1)
          continue
        }
      }
      const s = 16 * sd.s
      ctx.globalAlpha = Math.min(1, 0.55 * G)
      ctx.drawImage(st.sprites[0], sd.x - s * 1.6, sd.y - s * 1.6, s * 3.2, s * 3.2)
      // the bell, squeezing as it swims
      ctx.fillStyle = col([220, 255, 255], Math.min(1, 0.75 * G))
      ctx.beginPath()
      ctx.ellipse(sd.x, sd.y, s * (0.6 - beat * 0.15), s * (0.45 + beat * 0.12), 0, Math.PI, 0)
      ctx.fill()
      // tendrils
      ctx.strokeStyle = col([160, 240, 255], Math.min(1, 0.45 * G))
      ctx.lineWidth = 1
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath()
        ctx.moveTo(sd.x + k * s * 0.2, sd.y)
        ctx.quadraticCurveTo(sd.x + k * s * 0.25 + Math.sin(time * 3 + k) * 3, sd.y + s * 0.8, sd.x + k * s * 0.15, sd.y + s * 1.6)
        ctx.stroke()
      }
    }
    // pollen everywhere
    for (const m of st.motes) {
      m.y -= dt * 5
      m.x += Math.sin(time * 0.7 + m.ph) * dt * 8
      if (m.y < 160) m.y = GROUND + 30
      ctx.globalAlpha = Math.min(1, (0.3 + 0.4 * Math.sin(time * 2.4 + m.ph)) * G)
      ctx.drawImage(st.sprites[m.ph > 3 ? 1 : 0], m.x - 3, m.y - 3, 6, 6)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()

    const vign = ctx.createRadialGradient(width / 2, height * 0.5, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.8)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(0,0,8,0.55)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
