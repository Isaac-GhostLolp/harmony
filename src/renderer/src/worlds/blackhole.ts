import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * 🕳️ Black Hole — a living cosmos with a rotating accretion disc, gravitational
 * lensing that bends nearby stars, an event horizon that pulses on the kick,
 * drifting cosmic dust and the occasional meteor. Inspired by Interstellar:
 * elegant, never gaudy. All motion derives from the music via WorldContext.
 *
 * Performance: a fixed starfield (typed arrays), a pooled dust/meteor system,
 * and a single rAF driven by the ThemeDirector. No per-frame allocations.
 */

const STAR_COUNT = 520

// starfield stored in flat arrays (x, y in [-1,1] space, depth, base brightness)
let starX = new Float32Array(0)
let starY = new Float32Array(0)
let starZ = new Float32Array(0)
let starB = new Float32Array(0)
let orbitA = new Float32Array(0) // orbital angle for the closest stars

const dust = new ParticlePool(160)
const meteors = new ParticlePool(8)
let nextMeteor = 3

function initStars(): void {
  starX = new Float32Array(STAR_COUNT)
  starY = new Float32Array(STAR_COUNT)
  starZ = new Float32Array(STAR_COUNT)
  starB = new Float32Array(STAR_COUNT)
  orbitA = new Float32Array(STAR_COUNT)
  for (let i = 0; i < STAR_COUNT; i++) {
    // distribute in a disc-ish field, biased outward
    const ang = Math.random() * Math.PI * 2
    const rad = Math.pow(Math.random(), 0.5)
    starX[i] = Math.cos(ang) * rad
    starY[i] = Math.sin(ang) * rad * 0.7
    starZ[i] = 0.2 + Math.random() * 0.8
    starB[i] = 0.3 + Math.random() * 0.7
    orbitA[i] = ang
  }
}

function drawNebula(c: WorldContext, cx: number, cy: number): void {
  const { ctx, width, height } = c
  // two soft radial clouds tinted by the accent, very subtle
  const [r, g, b] = c.accent
  const clouds: [number, number, number, number][] = [
    [width * 0.25, height * 0.3, width * 0.5, 0.06],
    [width * 0.8, height * 0.7, width * 0.55, 0.05]
  ]
  for (const [x, y, rad, a] of clouds) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }
  void cx
  void cy
}

export const blackHole: World = {
  id: 'blackhole',
  name: 'Black Hole',
  spectrumBins: 32,

  mount(): void {
    initStars()
    nextMeteor = 2 + Math.random() * 3
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const cx = width / 2
    const cy = height / 2
    const minDim = Math.min(width, height)

    // event horizon radius pulses on the kick; disc speed rises with bass
    const baseR = minDim * 0.11
    const horizonR = baseR * (1 + c.kick * 0.18 + c.breath * 0.04)
    const discSpin = time * (0.25 + c.bass * 0.9)

    // --- background ---
    ctx.fillStyle = '#05060b'
    ctx.fillRect(0, 0, width, height)
    drawNebula(c, cx, cy)

    // --- starfield with gravitational lensing near the hole ---
    const lensR = horizonR * 4.5
    for (let i = 0; i < STAR_COUNT; i++) {
      // closest stars slowly orbit the hole; far stars stay put (parallax)
      const orbitStrength = Math.max(0, 1 - starZ[i])
      orbitA[i] += dt * 0.05 * orbitStrength
      const ox = Math.cos(orbitA[i]) * orbitStrength * 0.04
      const oy = Math.sin(orbitA[i]) * orbitStrength * 0.04
      let sx = cx + (starX[i] + ox) * width * 0.62
      let sy = cy + (starY[i] + oy) * height * 0.62
      const dx = sx - cx
      const dy = sy - cy
      const dist = Math.hypot(dx, dy) || 1

      // lensing: stars within lensR get pushed around the horizon (light-bending)
      if (dist < lensR) {
        const pull = (1 - dist / lensR) ** 2
        const ang = Math.atan2(dy, dx) + pull * 0.9
        const newDist = dist + pull * horizonR * 1.4
        sx = cx + Math.cos(ang) * newDist
        sy = cy + Math.sin(ang) * newDist
      }

      // stars swallowed by the horizon fade out
      if (dist < horizonR * 1.05) continue

      const tw = 0.6 + 0.4 * Math.sin(time * 2 + i)
      const bright = starB[i] * tw * (0.5 + c.energy * 0.5)
      const size = starZ[i] * 1.6
      ctx.globalAlpha = bright
      ctx.fillStyle = '#dfe8ff'
      ctx.fillRect(sx, sy, size, size)
    }
    ctx.globalAlpha = 1

    // --- accretion disc (behind + in front for depth) ---
    const [ar, ag, ab] = c.accent
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-0.5) // tilt
    ctx.scale(1, 0.32) // perspective flattening
    const discOuter = horizonR * 3.2
    for (let ring = 0; ring < 3; ring++) {
      const rr = horizonR * (1.5 + ring * 0.85)
      const glow = ctx.createRadialGradient(0, 0, horizonR, 0, 0, discOuter)
      const heat = 0.5 + c.energy * 0.5
      glow.addColorStop(0, 'rgba(0,0,0,0)')
      glow.addColorStop(0.55, `rgba(255,${150 + ring * 20},${60},${0.10 * heat})`)
      glow.addColorStop(0.8, `rgba(${ar},${ag},${ab},${0.22 * heat})`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(0, 0, rr, 0, Math.PI * 2)
      ctx.fill()
    }
    // bright rotating streaks on the disc
    const streaks = 40
    for (let i = 0; i < streaks; i++) {
      const a = (i / streaks) * Math.PI * 2 + discSpin
      const rr = horizonR * (1.6 + (i % 5) * 0.28)
      const x = Math.cos(a) * rr
      const y = Math.sin(a) * rr
      const bright = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(a * 3 + time * 4))
      ctx.globalAlpha = bright * (0.6 + c.bass * 0.4)
      ctx.fillStyle = `rgb(255,${180 + ((i * 7) % 60)},120)`
      ctx.fillRect(x, y, 2.4, 2.4)
    }
    ctx.globalAlpha = 1
    ctx.restore()

    // --- event horizon (pure black sphere with a photon ring) ---
    const ring = ctx.createRadialGradient(cx, cy, horizonR * 0.9, cx, cy, horizonR * 1.25)
    ring.addColorStop(0, 'rgba(0,0,0,1)')
    ring.addColorStop(0.82, 'rgba(0,0,0,1)')
    ring.addColorStop(0.92, `rgba(255,200,140,${0.5 + c.kick * 0.4})`)
    ring.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = ring
    ctx.beginPath()
    ctx.arc(cx, cy, horizonR * 1.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(cx, cy, horizonR, 0, Math.PI * 2)
    ctx.fill()

    // --- cosmic dust (pooled), pulled gently toward the hole ---
    if (dust.activeCount < 120 && Math.random() < 0.6) {
      dust.spawn((p) => {
        const edge = Math.random() * Math.PI * 2
        const rad = minDim * (0.5 + Math.random() * 0.5)
        p.x = cx + Math.cos(edge) * rad
        p.y = cy + Math.sin(edge) * rad
        p.vx = 0
        p.vy = 0
        p.maxLife = 6 + Math.random() * 6
        p.size = 0.6 + Math.random() * 1.2
        p.data = 0.2 + Math.random() * 0.5
      })
    }
    dust.each((p) => {
      const dx = cx - p.x
      const dy = cy - p.y
      const d = Math.hypot(dx, dy) || 1
      const g = (minDim * 12) / (d * d) // inverse-square pull
      p.vx += (dx / d) * g * dt
      p.vy += (dy / d) * g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (d < horizonR) p.life = p.maxLife // consumed
      ctx.globalAlpha = p.data * (1 - p.life / p.maxLife)
      ctx.fillStyle = '#bcd0ff'
      ctx.fillRect(p.x, p.y, p.size, p.size)
    })
    dust.update(dt)
    ctx.globalAlpha = 1

    // --- occasional meteors ---
    nextMeteor -= dt
    if (nextMeteor <= 0) {
      nextMeteor = 4 + Math.random() * 7 - c.energy * 2
      meteors.spawn((p) => {
        const fromLeft = Math.random() < 0.5
        p.x = fromLeft ? -40 : width + 40
        p.y = Math.random() * height * 0.6
        const sp = 260 + Math.random() * 220
        p.vx = (fromLeft ? 1 : -1) * sp
        p.vy = sp * (0.2 + Math.random() * 0.3)
        p.maxLife = 2.2
        p.size = 1.5 + Math.random() * 1.5
        p.data = 0
      })
    }
    meteors.each((p) => {
      const tail = 14
      ctx.strokeStyle = `rgba(255,240,220,${1 - p.life / p.maxLife})`
      ctx.lineWidth = p.size
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - (p.vx / 60) * tail, p.y - (p.vy / 60) * tail)
      ctx.stroke()
    })
    meteors.update(dt)

    // --- impact flash: a subtle brightening ring on big hits ---
    if (c.impact > 0.01) {
      ctx.globalAlpha = c.impact * 0.25
      const flash = ctx.createRadialGradient(cx, cy, horizonR, cx, cy, minDim * 0.7)
      flash.addColorStop(0, `rgba(${ar},${ag},${ab},0.6)`)
      flash.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = flash
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 1
    }
  },

  unmount(): void {
    // release big arrays so the GC can reclaim them when leaving the world
    starX = new Float32Array(0)
    starY = new Float32Array(0)
    starZ = new Float32Array(0)
    starB = new Float32Array(0)
    orbitA = new Float32Array(0)
  }
}
