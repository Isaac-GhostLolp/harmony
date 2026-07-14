import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * ⛩️ Japanese Garden — a serene dusk garden. Cherry-blossom petals drift on the
 * breeze, stone lanterns glow warmly, a still pond reflects the sky with gentle
 * ripples, and a torii gate stands in silhouette. Petals fall faster with
 * energy; lanterns pulse softly with the beat. Deeply calm, zen.
 */

const petals = new ParticlePool(120)
let ripples: { x: number; y: number; r: number; life: number }[] = []
let nextRipple = 1.5

export const japaneseGardenWorld: World = {
  id: 'japanese-garden',
  name: 'Japanese Garden',
  spectrumBins: 12,

  mount(): void {
    ripples = []
    nextRipple = 1 + Math.random()
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const waterY = height * 0.62

    // --- dusk sky gradient (soft pink to lavender) ---
    const sky = ctx.createLinearGradient(0, 0, 0, waterY)
    sky.addColorStop(0, '#2a1a3a')
    sky.addColorStop(0.5, '#6a4a6a')
    sky.addColorStop(1, '#c88a8a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, waterY)

    // --- distant mountains ---
    ctx.fillStyle = 'rgba(60, 45, 70, 0.6)'
    ctx.beginPath()
    ctx.moveTo(0, waterY)
    ctx.lineTo(width * 0.2, waterY - 70)
    ctx.lineTo(width * 0.4, waterY - 30)
    ctx.lineTo(width * 0.65, waterY - 90)
    ctx.lineTo(width * 0.9, waterY - 40)
    ctx.lineTo(width, waterY - 60)
    ctx.lineTo(width, waterY)
    ctx.closePath()
    ctx.fill()

    // --- torii gate silhouette (right side) ---
    const tx = width * 0.78
    const tScale = height / 600
    ctx.fillStyle = '#3a1518'
    // pillars
    ctx.fillRect(tx - 60 * tScale, waterY - 160 * tScale, 12 * tScale, 160 * tScale)
    ctx.fillRect(tx + 48 * tScale, waterY - 160 * tScale, 12 * tScale, 160 * tScale)
    // top beams
    ctx.fillRect(tx - 80 * tScale, waterY - 165 * tScale, 150 * tScale, 14 * tScale)
    ctx.fillRect(tx - 72 * tScale, waterY - 140 * tScale, 134 * tScale, 10 * tScale)

    // --- water ---
    const water = ctx.createLinearGradient(0, waterY, 0, height)
    water.addColorStop(0, '#4a3a5a')
    water.addColorStop(1, '#1a2438')
    ctx.fillStyle = water
    ctx.fillRect(0, waterY, width, height - waterY)

    // sky reflection shimmer on water
    ctx.globalAlpha = 0.15
    ctx.fillStyle = '#c88a8a'
    for (let y = waterY; y < height; y += 4) {
      const off = Math.sin(y * 0.1 + time) * 6
      ctx.fillRect(off, y, width, 1)
    }
    ctx.globalAlpha = 1

    // --- pond ripples (spawn on a timer, more on impact) ---
    nextRipple -= dt
    if (nextRipple <= 0 || c.impactHit) {
      nextRipple = 1.2 + Math.random() * 1.5
      ripples.push({
        x: Math.random() * width,
        y: waterY + Math.random() * (height - waterY),
        r: 0,
        life: 0
      })
    }
    ctx.strokeStyle = 'rgba(220, 200, 220, 0.3)'
    ctx.lineWidth = 1
    ripples = ripples.filter((rp) => {
      rp.life += dt
      rp.r += 30 * dt
      const alpha = Math.max(0, 0.4 - rp.life * 0.15)
      if (alpha <= 0) return false
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.35, 0, 0, Math.PI * 2)
      ctx.stroke()
      return true
    })
    ctx.globalAlpha = 1

    // --- stone lanterns glowing (two, flanking) ---
    const lanterns = [
      [width * 0.15, waterY - 10],
      [width * 0.45, waterY - 6]
    ]
    for (const [lx, ly] of lanterns) {
      const pulse = 0.7 + 0.3 * Math.sin(time + lx) + c.kick * 0.2
      // stone body
      ctx.fillStyle = '#2a2420'
      ctx.fillRect(lx - 8, ly - 30, 16, 30)
      ctx.beginPath()
      ctx.moveTo(lx - 14, ly - 30)
      ctx.lineTo(lx + 14, ly - 30)
      ctx.lineTo(lx + 8, ly - 40)
      ctx.lineTo(lx - 8, ly - 40)
      ctx.closePath()
      ctx.fill()
      // warm light glow
      ctx.globalAlpha = pulse
      const g = ctx.createRadialGradient(lx, ly - 20, 0, lx, ly - 20, 40)
      g.addColorStop(0, 'rgba(255, 180, 80, 0.5)')
      g.addColorStop(1, 'rgba(255, 180, 80, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(lx, ly - 20, 40, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      // window light
      ctx.fillStyle = `rgba(255, 210, 130, ${pulse})`
      ctx.fillRect(lx - 4, ly - 26, 8, 10)
    }

    // --- cherry blossom petals drifting ---
    const rate = 1 + Math.floor(c.energy * 4)
    for (let i = 0; i < rate; i++) {
      if (Math.random() > 0.4) continue
      petals.spawn((p) => {
        p.x = Math.random() * width
        p.y = -10
        p.vx = -15 - Math.random() * 15
        p.vy = 20 + Math.random() * 25
        p.maxLife = 12
        p.size = 3 + Math.random() * 3
        p.data = Math.random() * Math.PI * 2
      })
    }
    petals.each((p) => {
      p.data += dt * 2
      p.x += Math.sin(p.data) * 18 * dt
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.data)
      ctx.globalAlpha = 0.8 * (1 - p.life / p.maxLife)
      ctx.fillStyle = '#ffc0d8'
      // simple petal: a small rounded shape
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })
    ctx.globalAlpha = 1
    petals.update(dt)
  },

  unmount(): void {
    ripples = []
  }
}
