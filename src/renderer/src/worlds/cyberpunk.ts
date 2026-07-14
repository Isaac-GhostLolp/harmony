import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * 🌃 Cyberpunk — a living neon city at night. Layered futuristic buildings with
 * glowing windows recede into haze, holographic billboards flicker, thin rain
 * falls through the neon glow, CRT scanlines and the occasional glitch tear
 * across the scene. Neon pulses on the kick; glitches fire on musical impacts.
 * Inspired by Cyberpunk 2077 — moody, wet, electric.
 */

const rain = new ParticlePool(260)

// building layers for parallax depth; each has windows that flicker
interface Building {
  x: number
  w: number
  h: number
  layer: number
  hue: number
  windows: number
}
let buildings: Building[] = []
let glitch = 0
let nextGlitch = 4

// neon sign colors (cyberpunk palette): cyan, magenta, yellow, hot pink
const NEON = [
  [0, 240, 255],
  [255, 40, 200],
  [255, 220, 40],
  [255, 90, 120],
  [120, 80, 255]
]

function initCity(width: number, height: number): void {
  buildings = []
  for (let layer = 0; layer < 3; layer++) {
    let x = -30
    let seed = 3 + layer * 17
    const maxH = height * (0.35 + layer * 0.16)
    while (x < width + 40) {
      const w = 40 + ((seed * 37) % (50 + layer * 25))
      const h = maxH * (0.5 + ((seed * 53) % 100) / 100)
      buildings.push({
        x,
        w,
        h,
        layer,
        hue: NEON[(seed >> 3) % NEON.length] ? (seed >> 3) % NEON.length : 0,
        windows: 3 + ((seed * 13) % 5)
      })
      x += w + 4 + layer * 6
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
    }
  }
  // sort back-to-front
  buildings.sort((a, b) => a.layer - b.layer)
}

export const cyberpunkWorld: World = {
  id: 'cyber-city',
  name: 'Cyberpunk',
  spectrumBins: 24,

  mount(c: WorldContext): void {
    initCity(c.width, c.height)
    glitch = 0
    nextGlitch = 3 + Math.random() * 4
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    if (buildings.length === 0) initCity(width, height)

    // --- sky: deep purple-blue haze ---
    const sky = ctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#0a0416')
    sky.addColorStop(0.6, '#1a0a2e')
    sky.addColorStop(1, '#2a0a3a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    // distant neon glow on the horizon, pulsing subtly with the music
    const horizon = height * 0.72
    const glow = ctx.createLinearGradient(0, horizon - 120, 0, horizon)
    glow.addColorStop(0, 'rgba(0,0,0,0)')
    glow.addColorStop(1, `rgba(255,40,200,${0.10 + c.energy * 0.10})`)
    ctx.fillStyle = glow
    ctx.fillRect(0, horizon - 120, width, 120)

    // --- buildings (back to front) with glowing windows ---
    for (const b of buildings) {
      const depth = 1 - b.layer * 0.25
      const baseY = horizon + b.layer * 14
      // building body
      ctx.fillStyle = `rgba(${10 + b.layer * 6}, ${8 + b.layer * 4}, ${20 + b.layer * 8}, ${0.85})`
      ctx.fillRect(b.x, baseY - b.h, b.w, b.h)
      // neon edge (top) — pulses with kick
      const [nr, ng, nb] = NEON[b.hue]
      ctx.globalAlpha = (0.4 + c.kick * 0.5) * depth
      ctx.fillStyle = `rgb(${nr},${ng},${nb})`
      ctx.fillRect(b.x, baseY - b.h, b.w, 2)
      ctx.globalAlpha = 1
      // windows: small lit cells that flicker
      const cols = b.windows
      const rows = Math.floor(b.h / 16)
      const cw = b.w / cols
      for (let wy = 0; wy < rows; wy++) {
        for (let wx = 0; wx < cols; wx++) {
          const seed = (b.x + wx * 7 + wy * 13) | 0
          const lit = Math.sin(time * 0.5 + seed) > 0.2
          if (!lit) continue
          const flick = 0.4 + 0.4 * Math.sin(time * 3 + seed * 2)
          ctx.fillStyle = `rgba(${nr},${ng},${nb},${flick * depth})`
          ctx.fillRect(b.x + wx * cw + cw * 0.2, baseY - b.h + wy * 16 + 3, cw * 0.5, 7)
        }
      }
    }

    // --- holographic billboards: floating translucent panels ---
    const billboards = 3
    for (let i = 0; i < billboards; i++) {
      const bx = ((i * 0.37 + time * 0.02) % 1) * width
      const by = height * (0.18 + i * 0.13)
      const bw = 90 + i * 30
      const bh = 50 + i * 12
      const [nr, ng, nb] = NEON[(i + 1) % NEON.length]
      const flicker = Math.random() > 0.04 ? 1 : 0.3 // occasional flicker
      ctx.globalAlpha = (0.10 + c.vocals * 0.10) * flicker
      ctx.fillStyle = `rgb(${nr},${ng},${nb})`
      ctx.fillRect(bx, by, bw, bh)
      ctx.globalAlpha = 0.5 * flicker
      ctx.strokeStyle = `rgb(${nr},${ng},${nb})`
      ctx.lineWidth = 1
      ctx.strokeRect(bx, by, bw, bh)
      // scan bars inside the hologram
      ctx.globalAlpha = 0.15 * flicker
      for (let y = by; y < by + bh; y += 4) ctx.fillRect(bx, y, bw, 1)
      ctx.globalAlpha = 1
    }

    // --- rain through the neon ---
    for (let i = 0; i < 8; i++) {
      rain.spawn((p) => {
        p.x = Math.random() * (width + 100) - 50
        p.y = -10
        p.vx = -80
        p.vy = 800 + Math.random() * 300
        p.maxLife = 1.6
        p.size = 0.8
        p.data = 0.15 + Math.random() * 0.3
      })
    }
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.4)'
    ctx.lineWidth = 1
    rain.each((p) => {
      ctx.globalAlpha = p.data
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + p.vx * 0.018, p.y + p.vy * 0.018)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
    rain.update(dt)

    // --- wet reflection glow at the bottom (accent tinted) ---
    const [ar, ag, ab] = c.accent
    const refl = ctx.createLinearGradient(0, height, 0, height * 0.8)
    refl.addColorStop(0, `rgba(${ar},${ag},${ab},${0.12 + c.bass * 0.1})`)
    refl.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = refl
    ctx.fillRect(0, height * 0.8, width, height * 0.2)

    // --- glitch tears on impacts / timer ---
    nextGlitch -= dt
    if (nextGlitch <= 0 || (c.impactHit && Math.random() < 0.4)) {
      glitch = 1
      nextGlitch = 3 + Math.random() * 5
    }
    glitch = Math.max(0, glitch - dt * 4)
    if (glitch > 0.01) {
      const slices = 6
      for (let i = 0; i < slices; i++) {
        const sy = Math.random() * height
        const sh = 4 + Math.random() * 20
        const shift = (Math.random() - 0.5) * 40 * glitch
        const img = ctx.getImageData(0, sy, width, sh)
        ctx.putImageData(img, shift, sy)
      }
      // chromatic flash
      ctx.globalAlpha = glitch * 0.15
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,240,255,1)' : 'rgba(255,40,200,1)'
      ctx.fillRect(0, Math.random() * height, width, 2)
      ctx.globalAlpha = 1
    }

    // --- CRT scanlines over everything (subtle) ---
    ctx.globalAlpha = 0.06
    ctx.fillStyle = '#000'
    for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1)
    ctx.globalAlpha = 1
  },

  unmount(): void {
    buildings = []
  }
}
