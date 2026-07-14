import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * ☕ Coffee Shop — the coziest world. A warm interior seen at night: soft amber
 * bokeh lights, rain streaking the window, a cup of coffee whose steam curls
 * upward, and warm wood tones. Everything is calm and low-contrast — made for
 * studying. Steam sways with the music's breath; lights glow with the beat.
 */

const rain = new ParticlePool(180)
const steam = new ParticlePool(60)
let bokeh: { x: number; y: number; r: number; hue: number; phase: number }[] = []

function initBokeh(width: number, height: number): void {
  bokeh = []
  for (let i = 0; i < 14; i++) {
    bokeh.push({
      x: Math.random() * width,
      y: Math.random() * height * 0.7,
      r: 20 + Math.random() * 60,
      hue: 25 + Math.random() * 25, // warm amber/orange
      phase: Math.random() * Math.PI * 2
    })
  }
}

export const coffeeShopWorld: World = {
  id: 'coffee-shop',
  name: 'Coffee Shop',
  spectrumBins: 12,

  mount(c: WorldContext): void {
    initBokeh(c.width, c.height)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    if (bokeh.length === 0) initBokeh(width, height)

    // --- warm dark interior gradient ---
    const bg = ctx.createLinearGradient(0, 0, 0, height)
    bg.addColorStop(0, '#1a1008')
    bg.addColorStop(0.6, '#241505')
    bg.addColorStop(1, '#0f0a04')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    // --- soft bokeh lights (out-of-focus warm bulbs) ---
    for (const b of bokeh) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 0.8 + b.phase) + c.kick * 0.2
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
      g.addColorStop(0, `hsla(${b.hue}, 80%, 65%, ${0.22 * pulse})`)
      g.addColorStop(0.5, `hsla(${b.hue}, 80%, 55%, ${0.10 * pulse})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- rain on the window (foreground, blurred feel via low alpha) ---
    for (let i = 0; i < 5; i++) {
      rain.spawn((p) => {
        p.x = Math.random() * width
        p.y = -10
        p.vx = -30
        p.vy = 400 + Math.random() * 200
        p.maxLife = 2.5
        p.size = 1 + Math.random() * 1.5
        p.data = 0.08 + Math.random() * 0.12
      })
    }
    ctx.strokeStyle = 'rgba(200, 180, 140, 0.3)'
    ctx.lineWidth = 1.5
    rain.each((p) => {
      ctx.globalAlpha = p.data
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + p.vx * 0.02, p.y + p.vy * 0.02)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
    rain.update(dt)

    // --- the coffee cup (simple, centered low) ---
    const cupX = width * 0.5
    const cupY = height * 0.82
    const cupW = 70
    const cupH = 46
    ctx.fillStyle = '#e8ddd0'
    // cup body
    ctx.beginPath()
    ctx.moveTo(cupX - cupW / 2, cupY)
    ctx.lineTo(cupX - cupW / 2 + 6, cupY + cupH)
    ctx.lineTo(cupX + cupW / 2 - 6, cupY + cupH)
    ctx.lineTo(cupX + cupW / 2, cupY)
    ctx.closePath()
    ctx.fill()
    // coffee surface
    ctx.fillStyle = '#3a2012'
    ctx.beginPath()
    ctx.ellipse(cupX, cupY, cupW / 2, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    // handle
    ctx.strokeStyle = '#e8ddd0'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cupX + cupW / 2, cupY + cupH / 2, 14, -Math.PI / 2, Math.PI / 2)
    ctx.stroke()

    // --- steam curling up (sways with breath) ---
    if (steam.activeCount < 30 && Math.random() < 0.5) {
      steam.spawn((p) => {
        p.x = cupX + (Math.random() - 0.5) * cupW * 0.4
        p.y = cupY - 4
        p.vx = 0
        p.vy = -20 - Math.random() * 15
        p.maxLife = 3 + Math.random() * 2
        p.size = 6 + Math.random() * 8
        p.data = Math.random() * Math.PI * 2
      })
    }
    steam.each((p) => {
      p.data += dt
      p.x += Math.sin(p.data * 2 + c.breath * 2) * 12 * dt
      p.y += p.vy * dt
      const lifeT = 1 - p.life / p.maxLife
      ctx.globalAlpha = lifeT * 0.12
      ctx.fillStyle = '#fff5e8'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * (1 + (1 - lifeT)), 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1
    steam.update(dt)

    // --- cozy vignette ---
    const vign = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.25,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7
    )
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(10,6,2,0.6)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
  },

  unmount(): void {
    bokeh = []
  }
}
