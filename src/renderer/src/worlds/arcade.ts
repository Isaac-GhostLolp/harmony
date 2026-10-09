import type { World, WorldContext } from './types'
import { canvasDpr } from '@/utils/perf'

/**
 * 🕹️ Arcade — the whole screen is an old arcade cabinet in attract mode.
 *
 * Real pixel art on a 320×180 screen, scaled up with hard pixels and seen
 * through a CRT: scanlines, a soft phosphor bloom, darker curved corners. A
 * formation of invaders marches on, its steps landing on the beat (more
 * energy, faster march), drops a row at the edge and keeps coming; the little
 * ship below plays by itself, hunting them one by one, and the aliens burst into
 * pixels while the score ticks up. A big hit sends the saucer across the top.
 * Along the bottom, a pixel city whose skyline is the song's spectrum. The
 * scoreboard sits on top and "INSERT COIN" blinks, of course.
 *
 * Day hours give it an arcade-sunset sky; at night, deep space and stars.
 */

const PW = 320
const PH = 180
/** the ground line: kept clear of the app's player bar, which covers the bottom */
const GROUND = PH - 24
/** the screen is cropped at the sides on narrower windows: the HUD stays inside */
const SAFE = 22

// ---------------------------------------------------------------------------
// sprites (X = pixel)
// ---------------------------------------------------------------------------

const SQUID = [
  ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '..X..X..', '.X.XX.X.', 'X.X..X.X'],
  ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X.XX.X.', 'X......X', '.X....X.']
]
const CRAB = [
  ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
  ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.']
]
const OCTO = [
  ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXX..XX..XXX', 'XXXXXXXXXXXX', '...XX..XX...', '..XX.XX.XX..', 'XX........XX'],
  ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXX..XX..XXX', 'XXXXXXXXXXXX', '..XXX..XXX..', '.XX..XX..XX.', '..XX....XX..']
]
const SHIP = ['......X......', '.....XXX.....', '.....XXX.....', '.XXXXXXXXXXX.', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX']
const UFO = ['.....XXXXXX.....', '...XXXXXXXXXX...', '..XXXXXXXXXXXX..', '.XX.XX.XX.XX.XX.', 'XXXXXXXXXXXXXXXX', '..XXX..XX..XXX..', '...X........X...']
const BOOM = ['X...X.X...X', '.X..X.X..X.', '..X.....X..', 'XX.......XX', '..X.....X..', '.X..X.X..X.', 'X...X.X...X']

/** 3×5 pixel font */
const FONT: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', C: '111100100100111', D: '110101101101110', E: '111100110100111', G: '111100101101111',
  H: '101101111101101', I: '111010010010111', L: '100100100100111', M: '101111111101101', N: '110101101101101',
  O: '111101101101111', P: '111101111100100', R: '110101110101101', S: '111100111001111', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', Y: '101101010010010', X: '101101010101101',
  '-': '000000111000000', '<': '001010100010001', '>': '100010001010100', ' ': '000000000000000'
}

function sprite(rows: string[], color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = rows[0].length
  c.height = rows.length
  const g = c.getContext('2d')!
  g.fillStyle = color
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') g.fillRect(x, y, 1, 1)
  })
  return c
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string): void {
  g.fillStyle = color
  for (let i = 0; i < s.length; i++) {
    const f = FONT[s[i]] ?? FONT[' ']
    for (let k = 0; k < 15; k++) if (f[k] === '1') g.fillRect(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1)
  }
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const COLS = 9
const ROWS = 5
const CELL_X = 18
const CELL_Y = 13
const ROW_KIND = [0, 1, 1, 2, 2] // squid, crab, crab, octopus, octopus
const ROW_COLOR = ['#ff4fd8', '#4ff0ff', '#4ff0ff', '#ffe94f', '#ffe94f']
const ROW_POINTS = [30, 20, 20, 10, 10]

interface Shot {
  x: number
  y: number
  vy: number
  alien: boolean
}

interface Burst {
  x: number
  y: number
  t: number
  color: string
  pts: number
}

interface State {
  screen: HTMLCanvasElement
  sg: CanvasRenderingContext2D
  bloom: HTMLCanvasElement
  bg: CanvasRenderingContext2D
  scan: HTMLCanvasElement | null
  scanKey: string
  aliens: HTMLCanvasElement[][][] // kind → frame → [sprite]
  ship: HTMLCanvasElement
  ufo: HTMLCanvasElement
  boom: Map<string, HTMLCanvasElement>
  alive: boolean[]
  fx: number
  fy: number
  dir: number
  frame: number
  wave: number
  stepTimer: number
  beat: number
  lastKick: number
  kickAvg: number
  targetIdx: number
  cooldown: number
  shipX: number
  shots: Shot[]
  bursts: Burst[]
  ufoX: number | null
  ufoDir: number
  nextUfo: number
  score: number
  hi: number
  shownScore: number
  stars: { x: number; y: number; s: number; ph: number }[]
  city: number[]
  waveBanner: number
  shake: number
}

let S: State | null = null

function build(): State {
  const screen = document.createElement('canvas')
  screen.width = PW
  screen.height = PH
  const bloom = document.createElement('canvas')
  bloom.width = PW / 4
  bloom.height = PH / 4
  const kinds = [SQUID, CRAB, OCTO]
  const aliens = kinds.map((k, ki) => k.map((f) => [sprite(f, ROW_COLOR[ki === 0 ? 0 : ki === 1 ? 1 : 3])]))
  return {
    screen,
    sg: screen.getContext('2d')!,
    bloom,
    bg: bloom.getContext('2d')!,
    scan: null,
    scanKey: '',
    aliens,
    ship: sprite(SHIP, '#5dff6b'),
    ufo: sprite(UFO, '#ff3b3b'),
    boom: new Map(),
    alive: new Array(COLS * ROWS).fill(true),
    fx: 40,
    fy: 28,
    dir: 1,
    frame: 0,
    wave: 1,
    stepTimer: 0,
    beat: 0,
    lastKick: 0,
    kickAvg: 0,
    targetIdx: -1,
    cooldown: 0,
    shipX: PW / 2,
    shots: [],
    bursts: [],
    ufoX: null,
    ufoDir: 1,
    nextUfo: 12,
    score: 0,
    hi: 99990,
    shownScore: 0,
    stars: Array.from({ length: 70 }, () => ({ x: Math.random() * PW, y: Math.random() * PH, s: Math.random() < 0.8 ? 1 : 2, ph: Math.random() * 6.28 })),
    city: new Array(32).fill(0.3),
    waveBanner: 2.5,
    shake: 0
  }
}

function boomSprite(st: State, color: string): HTMLCanvasElement {
  let s = st.boom.get(color)
  if (!s) {
    s = sprite(BOOM, color)
    st.boom.set(color, s)
  }
  return s
}

/** Width of the living formation, to know when it reaches an edge. */
function formationSpan(st: State): [number, number] {
  let lo = COLS
  let hi = -1
  for (let i = 0; i < st.alive.length; i++) {
    if (!st.alive[i]) continue
    const c = i % COLS
    lo = Math.min(lo, c)
    hi = Math.max(hi, c)
  }
  return [lo, hi]
}

function step(st: State): void {
  const [lo, hi] = formationSpan(st)
  if (hi < 0) return
  const left = st.fx + lo * CELL_X
  const right = st.fx + hi * CELL_X + 12
  if ((st.dir > 0 && right + 4 > PW - SAFE) || (st.dir < 0 && left - 4 < SAFE)) {
    st.dir *= -1
    st.fy += 5
  } else st.fx += st.dir * 4
  st.frame ^= 1
}

function newWave(st: State): void {
  st.alive.fill(true)
  st.fx = 40
  st.fy = 28
  st.dir = 1
  st.wave++
  st.waveBanner = 2.5
  st.targetIdx = -1
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const arcadeWorld: World = {
  id: 'arcade',
  name: 'Arcade',
  spectrumBins: 32,

  mount(): void {
    S = build()
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    if (!S) S = build()
    const st = S
    const g = st.sg
    const day = c.dayPhase * 24 >= 7 && c.dayPhase * 24 < 18

    // ---- the march. The formation always walks — faster when the music has
    // more energy — and a beat brings the next step forward, so it lands on
    // the rhythm. (Waiting for the beat alone left it frozen on songs whose
    // kick never gets very strong.)
    const interval = c.playing ? 0.62 - 0.32 * Math.min(1, c.energy + c.surge * 0.5) : 0.7
    st.stepTimer += dt
    // a beat: the kick jumps clearly above its recent level
    const onset = c.kick > Math.max(0.25, st.kickAvg * 1.35 + 0.08) && st.lastKick <= c.kick
    st.kickAvg += (c.kick - st.kickAvg) * Math.min(1, dt * 3)
    st.lastKick = c.kick
    if (st.stepTimer >= interval || (onset && st.stepTimer > interval * 0.45)) {
      st.stepTimer = 0
      st.beat++
      step(st)
    }
    if (st.fy > 84) newWave(st)

    // ---- the ship hunts one alien at a time: the lowest one of a column,
    // preferring columns close by; it follows that alien as the formation
    // moves and fires as soon as it's lined up underneath
    let alive = 0
    for (const a of st.alive) if (a) alive++
    if (alive === 0) newWave(st)
    if (st.targetIdx < 0 || !st.alive[st.targetIdx]) {
      let best = -1
      let bestScore = Infinity
      for (let col = 0; col < COLS; col++) {
        let row = ROWS - 1
        while (row >= 0 && !st.alive[row * COLS + col]) row--
        if (row < 0) continue
        const x = st.fx + col * CELL_X + 6
        const score = Math.abs(x - st.shipX) + Math.random() * 60
        if (score < bestScore) {
          bestScore = score
          best = row * COLS + col
        }
      }
      st.targetIdx = best
    }
    const tx = st.targetIdx >= 0 ? st.fx + (st.targetIdx % COLS) * CELL_X + 6 : PW / 2
    st.shipX += Math.sign(tx - st.shipX) * Math.min(Math.abs(tx - st.shipX), 150 * dt * (1 + c.energy * 0.5))
    st.shipX = Math.max(SAFE, Math.min(PW - SAFE, st.shipX))
    st.cooldown -= dt
    const mine = st.shots.reduce((n, s) => n + (s.alien ? 0 : 1), 0)
    const lined = Math.abs(st.shipX - tx) < 3
    if (lined && mine < 3 && (st.cooldown <= 0 || (onset && st.cooldown < 0.2))) {
      st.shots.push({ x: Math.round(st.shipX), y: GROUND - 14, vy: -280, alien: false })
      st.cooldown = 0.6 - 0.22 * Math.min(1, c.energy)
    }
    const cols: number[] = []
    for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) if (st.alive[row * COLS + col]) {
      cols.push(col)
      break
    }

    // aliens drop zigzag bombs now and then (the ship always dodges, it's attract mode)
    if (Math.random() < dt * (0.8 + c.energy)) {
      const col = cols[Math.floor(Math.random() * cols.length)]
      if (col !== undefined) {
        let row = ROWS - 1
        while (row >= 0 && !st.alive[row * COLS + col]) row--
        if (row >= 0) st.shots.push({ x: st.fx + col * CELL_X + 6, y: st.fy + row * CELL_Y + 8, vy: 60, alien: true })
      }
    }

    // the saucer: on a big hit, or every so often
    st.nextUfo -= dt
    if (st.ufoX === null && (st.nextUfo <= 0 || c.impactHit)) {
      st.ufoDir = Math.random() < 0.5 ? 1 : -1
      st.ufoX = st.ufoDir > 0 ? -16 : PW
      st.nextUfo = 20 + Math.random() * 20
    }
    if (st.ufoX !== null) {
      st.ufoX += st.ufoDir * 45 * dt
      if (st.ufoX < -20 || st.ufoX > PW + 4) st.ufoX = null
    }

    // shots and hits
    for (let i = st.shots.length - 1; i >= 0; i--) {
      const s = st.shots[i]
      s.y += s.vy * dt
      if (s.y < 8 || s.y > GROUND - 2) {
        st.shots.splice(i, 1)
        continue
      }
      if (s.alien) continue
      if (st.ufoX !== null && s.y < 24 && s.y > 14 && s.x >= st.ufoX && s.x <= st.ufoX + 16) {
        st.bursts.push({ x: st.ufoX + 3, y: 16, t: 0, color: '#ff3b3b', pts: 300 })
        st.score += 300
        st.ufoX = null
        st.shots.splice(i, 1)
        continue
      }
      for (let k = 0; k < st.alive.length; k++) {
        if (!st.alive[k]) continue
        const ax = st.fx + (k % COLS) * CELL_X
        const ay = st.fy + Math.floor(k / COLS) * CELL_Y
        if (s.x >= ax && s.x <= ax + 12 && s.y >= ay && s.y <= ay + 8) {
          const row = Math.floor(k / COLS)
          st.alive[k] = false
          st.bursts.push({ x: ax, y: ay, t: 0, color: ROW_COLOR[row], pts: 0 })
          st.score += ROW_POINTS[row]
          st.shots.splice(i, 1)
          st.shake = 0.12
          break
        }
      }
    }
    if (st.score > st.hi) st.hi = st.score
    st.shownScore += (st.score - st.shownScore) * Math.min(1, dt * 8)

    // ---- draw the 320×180 screen
    // background: deep space at night, an arcade sunset by day
    const sky = g.createLinearGradient(0, 0, 0, PH)
    if (day) {
      sky.addColorStop(0, '#1b0838')
      sky.addColorStop(0.6, '#6a1b6e')
      sky.addColorStop(1, '#ff7a4f')
    } else {
      sky.addColorStop(0, '#04010d')
      sky.addColorStop(0.7, '#12052e')
      sky.addColorStop(1, '#2b0a4a')
    }
    g.fillStyle = sky
    g.fillRect(0, 0, PW, PH)
    // a big pixel planet
    g.fillStyle = day ? '#ffb86b' : '#3a1e78'
    g.beginPath()
    g.arc(262, 64, 26, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = day ? '#ff8a5b' : '#2a145a'
    g.fillRect(238, 58, 48, 3)
    g.fillRect(240, 68, 44, 2)
    g.strokeStyle = day ? 'rgba(255,230,180,0.6)' : 'rgba(150,120,255,0.55)'
    g.lineWidth = 1
    g.beginPath()
    g.ellipse(262, 64, 40, 6, -0.18, 0, Math.PI * 2) // its ring
    g.stroke()
    // stars, drifting down slowly
    for (const s of st.stars) {
      s.y += dt * (4 + s.s * 4) * (1 + c.energy)
      if (s.y > PH) {
        s.y = 0
        s.x = Math.random() * PW
      }
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + s.ph))
      g.fillStyle = `rgba(255,255,255,${tw * (day ? 0.35 : 1)})`
      g.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s)
    }

    // the city at the bottom is the spectrum
    const bins = c.spectrum.length
    for (let i = 0; i < st.city.length; i++) {
      const v = c.spectrum[Math.floor((i / st.city.length) * bins)] ?? 0
      st.city[i] += (v - st.city[i]) * Math.min(1, dt * (v > st.city[i] ? 14 : 4))
      const h = 6 + Math.round(st.city[i] * 34)
      const x = i * 10
      g.fillStyle = day ? '#3a0f4f' : '#1d0b3a'
      g.fillRect(x, GROUND - h, 9, h)
      // lit windows, in rows
      for (let wy = GROUND - h + 3; wy < GROUND - 2; wy += 4) {
        for (let wx = x + 2; wx < x + 8; wx += 3) {
          if ((wx * 7 + wy * 13 + i) % 5 < 2) continue
          g.fillStyle = (wy + i) % 3 === 0 ? '#ff4fd8' : '#4ff0ff'
          g.fillRect(wx, wy, 1, 2)
        }
      }
      // the top of each building catches the beat
      g.fillStyle = `rgba(255,233,79,${0.4 + c.kick * 0.6})`
      g.fillRect(x, GROUND - h, 9, 1)
    }
    g.fillStyle = '#5dff6b'
    g.fillRect(0, GROUND, PW, 1)
    g.fillStyle = '#0b0418'
    g.fillRect(0, GROUND + 1, PW, PH - GROUND)

    // the formation
    for (let k = 0; k < st.alive.length; k++) {
      if (!st.alive[k]) continue
      const row = Math.floor(k / COLS)
      const kind = ROW_KIND[row]
      const spr = st.aliens[kind][st.frame][0]
      const ax = Math.round(st.fx + (k % COLS) * CELL_X + (12 - spr.width) / 2)
      const ay = Math.round(st.fy + row * CELL_Y)
      g.drawImage(spr, ax, ay)
    }
    // saucer
    if (st.ufoX !== null) g.drawImage(st.ufo, Math.round(st.ufoX), 14)
    // shots
    for (const s of st.shots) {
      if (s.alien) {
        g.fillStyle = '#ffffff'
        const zig = Math.floor(s.y / 3) % 2
        g.fillRect(Math.round(s.x) + zig, Math.round(s.y), 1, 2)
        g.fillRect(Math.round(s.x) + 1 - zig, Math.round(s.y) + 2, 1, 2)
      } else {
        g.fillStyle = '#ffffff'
        g.fillRect(Math.round(s.x), Math.round(s.y), 1, 4)
      }
    }
    // the ship
    g.drawImage(st.ship, Math.round(st.shipX - 6), GROUND - 12)
    // explosions (and the saucer's bonus)
    for (let i = st.bursts.length - 1; i >= 0; i--) {
      const b = st.bursts[i]
      b.t += dt
      if (b.t > (b.pts ? 1.2 : 0.3)) {
        st.bursts.splice(i, 1)
        continue
      }
      if (b.t < 0.3) g.drawImage(boomSprite(st, b.color), Math.round(b.x), Math.round(b.y))
      if (b.pts) text(g, String(b.pts), Math.round(b.x), Math.round(b.y) - 8, '#ff3b3b')
    }

    // the scoreboard
    text(g, 'SCORE<1>', SAFE, 3, '#ffffff')
    text(g, String(Math.round(st.shownScore)).padStart(6, '0'), SAFE, 10, '#4ff0ff')
    text(g, 'HI-SCORE', 144, 3, '#ffffff')
    text(g, String(st.hi).padStart(6, '0'), 148, 10, '#ffe94f')
    text(g, 'CREDIT 00', PW - SAFE - 35, 3, '#ffffff')
    if (Math.floor(time * 1.6) % 2 === 0) text(g, 'INSERT COIN', PW - SAFE - 43, 10, '#ffe94f')
    if (st.waveBanner > 0) {
      st.waveBanner -= dt
      text(g, `WAVE ${st.wave}`, 144, 74, '#5dff6b')
    }

    // ---- put it on the tube
    const scale = Math.max(width / PW, height / PH)
    const ox = (width - PW * scale) / 2
    st.shake = Math.max(0, st.shake - dt)
    const sx = ox + (st.shake > 0 ? (Math.random() - 0.5) * scale * 0.8 : 0)
    const oy = (height - PH * scale) / 2
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(st.screen, sx, oy, PW * scale, PH * scale)
    // phosphor bloom: the screen shrunk and stretched back, added on top
    st.bg.globalCompositeOperation = 'copy'
    st.bg.drawImage(st.screen, 0, 0, st.bloom.width, st.bloom.height)
    ctx.imageSmoothingEnabled = true
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.32 + c.kick * 0.12 + c.surge * 0.15
    ctx.drawImage(st.bloom, sx, oy, PW * scale, PH * scale)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    // scanlines (one dark line per screen pixel row), painted once per size
    const dpr = canvasDpr()
    const key = `${width}x${height}@${dpr}`
    if (st.scanKey !== key) {
      st.scanKey = key
      const sc = document.createElement('canvas')
      sc.width = Math.round(width * dpr)
      sc.height = Math.round(height * dpr)
      const sg = sc.getContext('2d')!
      sg.scale(dpr, dpr)
      sg.fillStyle = 'rgba(0,0,0,0.28)'
      for (let y = oy; y < height; y += scale) sg.fillRect(0, Math.round(y + scale * 0.62), width, Math.max(1, scale * 0.38))
      // the tube's curved, darker corners
      const v = sg.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.42, width / 2, height / 2, Math.hypot(width, height) * 0.58)
      v.addColorStop(0, 'rgba(0,0,0,0)')
      v.addColorStop(1, 'rgba(0,0,0,0.75)')
      sg.fillStyle = v
      sg.fillRect(0, 0, width, height)
      st.scan = sc
    }
    ctx.drawImage(st.scan!, 0, 0, width, height)
    // a faint flicker, like an old tube
    ctx.fillStyle = `rgba(120,255,200,${0.012 + 0.01 * Math.sin(time * 60)})`
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },

  unmount(): void {
    S = null
  }
}
