import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * 🌲 Nature — a living forest that breathes with the music and shifts with the
 * time of day (via ctx.dayPhase). Sun rays filter through swaying trees, leaves
 * drift down on the wind, fireflies drift and glow at dusk/night, and a soft
 * mist hugs the ground. Calm by design: motion is gentle, energy only nudges
 * the wind and firefly count. The palette warms at sunrise/sunset and cools at
 * night, so the same world feels different across the day.
 */

const leaves = new ParticlePool(90)
const fireflies = new ParticlePool(70)
let trees: { x: number; w: number; h: number; sway: number }[] = []

function initTrees(width: number): void {
  trees = []
  let x = -20
  let seed = 7
  while (x < width + 40) {
    const w = 30 + ((seed * 41) % 50)
    const h = 220 + ((seed * 71) % 240)
    trees.push({ x, w, h, sway: Math.random() * Math.PI * 2 })
    x += w * 0.75 + 10
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
  }
}

/** Palette by day phase: night → dawn → day → dusk → night. */
function palette(dayPhase: number): {
  skyTop: string
  skyBottom: string
  sun: string
  ground: string
  night: number
} {
  // dayPhase 0..1 (0 = midnight)
  const h = dayPhase * 24
  if (h < 5 || h >= 21)
    return { skyTop: '#0a1020', skyBottom: '#0c1a1a', sun: '#3a5f7f', ground: '#08120c', night: 1 }
  if (h < 8)
    return { skyTop: '#243b52', skyBottom: '#c98a5e', sun: '#ffd9a0', ground: '#12281a', night: 0.4 }
  if (h < 17)
    return { skyTop: '#1e4d6b', skyBottom: '#5fa06f', sun: '#fff4d0', ground: '#173d24', night: 0 }
  if (h < 20)
    return { skyTop: '#3a3b6b', skyBottom: '#e08a4e', sun: '#ffc07a', ground: '#122a1a', night: 0.3 }
  return { skyTop: '#141a30', skyBottom: '#2a3a3a', sun: '#6a7f9f', ground: '#0a160e', night: 0.7 }
}

export const natureWorld: World = {
  id: 'nature',
  name: 'Nature',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    initTrees(c.width)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    if (trees.length === 0) initTrees(width)
    const pal = palette(c.dayPhase)

    // --- sky gradient ---
    const sky = ctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, pal.skyTop)
    sky.addColorStop(1, pal.skyBottom)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    // --- sun/moon glow high up, gently pulsing with breath ---
    const sunX = width * 0.72
    const sunY = height * 0.24
    const sunR = Math.min(width, height) * (0.14 + c.breath * 0.02)
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3)
    sunGrad.addColorStop(0, pal.sun)
    sunGrad.addColorStop(0.25, `${pal.sun}66`)
    sunGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 0.7
    ctx.fillStyle = sunGrad
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1

    // --- god rays from the sun (subtle, animated) ---
    ctx.save()
    ctx.translate(sunX, sunY)
    const rayCount = 7
    for (let i = 0; i < rayCount; i++) {
      const a = (i / rayCount) * Math.PI - Math.PI / 2 + Math.sin(time * 0.1 + i) * 0.05
      ctx.rotate(a)
      const rg = ctx.createLinearGradient(0, 0, 0, height)
      rg.addColorStop(0, `rgba(255,245,210,${0.05 * (1 - pal.night)})`)
      rg.addColorStop(1, 'rgba(255,245,210,0)')
      ctx.fillStyle = rg
      ctx.fillRect(-30, 0, 60, height)
      ctx.rotate(-a)
    }
    ctx.restore()

    // --- trees (silhouettes) swaying with the wind (energy nudges wind) ---
    const wind = 0.5 + c.energy * 0.8 + c.sway * 0.3
    const groundY = height * 0.82
    for (const tr of trees) {
      tr.sway += dt * 0.6
      const bend = Math.sin(tr.sway) * wind * 6
      ctx.fillStyle = pal.ground
      // trunk
      ctx.fillRect(tr.x + tr.w * 0.42, groundY - tr.h * 0.5, tr.w * 0.16, tr.h * 0.5)
      // canopy as a swaying triangle stack
      ctx.beginPath()
      for (let layer = 0; layer < 3; layer++) {
        const ly = groundY - tr.h * (0.4 + layer * 0.2)
        const lw = tr.w * (1 - layer * 0.18)
        ctx.moveTo(tr.x + tr.w / 2 - lw / 2 + bend * (layer + 1), ly)
        ctx.lineTo(tr.x + tr.w / 2 + lw / 2 + bend * (layer + 1), ly)
        ctx.lineTo(tr.x + tr.w / 2 + bend * (layer + 1), ly - tr.h * 0.28)
      }
      ctx.closePath()
      ctx.fill()
    }

    // --- ground ---
    const gg = ctx.createLinearGradient(0, groundY, 0, height)
    gg.addColorStop(0, pal.ground)
    gg.addColorStop(1, '#050a06')
    ctx.fillStyle = gg
    ctx.fillRect(0, groundY, width, height - groundY)

    // --- drifting leaves ---
    if (leaves.activeCount < 40 && Math.random() < 0.3) {
      leaves.spawn((p) => {
        p.x = Math.random() * width
        p.y = -10
        p.vx = -20 - wind * 10
        p.vy = 20 + Math.random() * 30
        p.maxLife = 12
        p.size = 3 + Math.random() * 3
        p.data = Math.random() * Math.PI * 2 // rotation phase
      })
    }
    leaves.each((p) => {
      p.data += dt * 2
      p.x += Math.sin(p.data) * 12 * dt // flutter
      const hue = pal.night > 0.5 ? 120 : 30 + (p.size % 3) * 12
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.data)
      ctx.globalAlpha = 0.6 * (1 - p.life / p.maxLife)
      ctx.fillStyle = `hsl(${hue}, 45%, ${40 - pal.night * 15}%)`
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    })
    ctx.globalAlpha = 1
    leaves.update(dt)

    // --- fireflies (mostly at dusk/night; more with energy) ---
    const wantFireflies = pal.night > 0.25
    if (wantFireflies && fireflies.activeCount < 20 + c.energy * 30 && Math.random() < 0.2) {
      fireflies.spawn((p) => {
        p.x = Math.random() * width
        p.y = height * (0.4 + Math.random() * 0.5)
        p.vx = (Math.random() - 0.5) * 20
        p.vy = (Math.random() - 0.5) * 20
        p.maxLife = 6 + Math.random() * 6
        p.size = 1.5 + Math.random() * 1.5
        p.data = Math.random() * Math.PI * 2
      })
    }
    fireflies.each((p) => {
      p.data += dt * 3
      p.x += Math.sin(p.data) * 8 * dt
      p.y += Math.cos(p.data * 0.7) * 6 * dt
      const glow = (0.5 + 0.5 * Math.sin(p.data * 2)) * (1 - p.life / p.maxLife)
      const [ar, ag, ab] = c.accent
      // warm yellow-green, tinted slightly by accent on the kick
      const r = 200 + c.kick * (ar - 200)
      const g = 240
      const b = 120 + c.kick * (ab - 120)
      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${glow})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size + glow * 1.5, 0, Math.PI * 2)
      ctx.fill()
      // soft halo
      ctx.globalAlpha = glow * 0.3
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    })
    fireflies.update(dt)

    // --- ground mist ---
    const mist = ctx.createLinearGradient(0, groundY - 40, 0, groundY + 40)
    mist.addColorStop(0, 'rgba(200,220,210,0)')
    mist.addColorStop(0.5, `rgba(200,220,210,${0.08 + Math.sin(time * 0.3) * 0.02})`)
    mist.addColorStop(1, 'rgba(200,220,210,0)')
    ctx.fillStyle = mist
    ctx.fillRect(0, groundY - 40, width, 80)
  },

  unmount(): void {
    trees = []
  }
}
