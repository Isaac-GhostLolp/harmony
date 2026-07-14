import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * 🌊 Ocean — everything happens underwater. Sun rays lance down from a rippling
 * surface, bubbles rise, plankton drifts, and small fish school across the
 * scene. The whole view sways with a slow current that quickens with the
 * music's energy; bubbles burst upward on the kick. Calm, blue, weightless.
 */

const bubbles = new ParticlePool(160)
const plankton = new ParticlePool(120)
let fish: { x: number; y: number; dir: number; speed: number; size: number; phase: number }[] = []

function initFish(width: number, height: number): void {
  fish = []
  for (let i = 0; i < 10; i++) {
    fish.push({
      x: Math.random() * width,
      y: height * (0.3 + Math.random() * 0.6),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 20 + Math.random() * 40,
      size: 6 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2
    })
  }
}

export const oceanWorld: World = {
  id: 'ocean',
  name: 'Ocean',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    initFish(c.width, c.height)
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    if (fish.length === 0) initFish(width, height)

    // --- water gradient: bright near the surface, deep blue below ---
    const water = ctx.createLinearGradient(0, 0, 0, height)
    water.addColorStop(0, '#1a6a8a')
    water.addColorStop(0.4, '#0d4a6a')
    water.addColorStop(1, '#031825')
    ctx.fillStyle = water
    ctx.fillRect(0, 0, width, height)

    // --- god rays from the rippling surface ---
    const rays = 6
    for (let i = 0; i < rays; i++) {
      const baseX = (i / rays) * width + Math.sin(time * 0.2 + i) * 30
      ctx.save()
      ctx.translate(baseX, 0)
      ctx.rotate(0.15 + Math.sin(time * 0.1 + i) * 0.03)
      const rg = ctx.createLinearGradient(0, 0, 0, height)
      rg.addColorStop(0, `rgba(180, 230, 255, ${0.10 + c.energy * 0.05})`)
      rg.addColorStop(1, 'rgba(180, 230, 255, 0)')
      ctx.fillStyle = rg
      ctx.fillRect(-40, 0, 80, height * 0.9)
      ctx.restore()
    }

    // --- current sway offset applied to fish + plankton ---
    const current = Math.sin(time * 0.3) * (10 + c.energy * 20)

    // --- plankton (tiny drifting particles) ---
    if (plankton.activeCount < 90 && Math.random() < 0.5) {
      plankton.spawn((p) => {
        p.x = Math.random() * width
        p.y = Math.random() * height
        p.vx = 0
        p.vy = -3 - Math.random() * 4
        p.maxLife = 10
        p.size = 0.6 + Math.random() * 1.2
        p.data = 0.2 + Math.random() * 0.3
      })
    }
    plankton.each((p) => {
      p.x += (Math.sin(time * 0.5 + p.y * 0.01) * 6 + current * 0.3) * dt
      p.y += p.vy * dt
      ctx.globalAlpha = p.data * (1 - p.life / p.maxLife)
      ctx.fillStyle = '#aee5ff'
      ctx.fillRect(p.x, p.y, p.size, p.size)
    })
    ctx.globalAlpha = 1
    plankton.update(dt)

    // --- fish schooling ---
    for (const f of fish) {
      f.phase += dt * 4
      f.x += f.dir * f.speed * dt + current * 0.2 * dt
      f.y += Math.sin(f.phase) * 8 * dt
      if (f.x < -20) f.x = width + 20
      if (f.x > width + 20) f.x = -20
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.scale(f.dir, 1)
      // body
      ctx.fillStyle = `rgba(120, 190, 220, 0.8)`
      ctx.beginPath()
      ctx.ellipse(0, 0, f.size, f.size * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
      // tail (wags with phase)
      const wag = Math.sin(f.phase) * f.size * 0.3
      ctx.beginPath()
      ctx.moveTo(-f.size, 0)
      ctx.lineTo(-f.size * 1.6, -f.size * 0.4 + wag)
      ctx.lineTo(-f.size * 1.6, f.size * 0.4 + wag)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // --- coral silhouettes along the bottom ---
    ctx.fillStyle = '#02141c'
    let cx = 0
    let seed = 5
    while (cx < width) {
      const cw = 20 + ((seed * 31) % 40)
      const ch = 30 + ((seed * 53) % 70)
      ctx.beginPath()
      ctx.moveTo(cx, height)
      ctx.lineTo(cx + cw * 0.3, height - ch)
      ctx.lineTo(cx + cw * 0.6, height - ch * 0.6)
      ctx.lineTo(cx + cw, height - ch * 1.1)
      ctx.lineTo(cx + cw, height)
      ctx.closePath()
      ctx.fill()
      cx += cw
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
    }

    // --- bubbles rising (burst upward on the kick) ---
    const bubbleRate = 2 + Math.floor(c.kick * 12)
    for (let i = 0; i < bubbleRate; i++) {
      bubbles.spawn((p) => {
        p.x = Math.random() * width
        p.y = height + 10
        p.vx = 0
        p.vy = -40 - Math.random() * 60
        p.maxLife = 6
        p.size = 1.5 + Math.random() * 4
        p.data = 0.3 + Math.random() * 0.4
      })
    }
    bubbles.each((p) => {
      p.x += Math.sin(time * 2 + p.y * 0.02) * 10 * dt
      p.y += p.vy * dt
      ctx.globalAlpha = p.data
      ctx.strokeStyle = '#bfefff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.stroke()
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(p.x - p.size * 0.4, p.y - p.size * 0.4, p.size * 0.3, p.size * 0.3)
    })
    ctx.globalAlpha = 1
    bubbles.update(dt)

    // deep vignette
    const vign = ctx.createRadialGradient(
      width / 2,
      height * 0.3,
      0,
      width / 2,
      height * 0.3,
      Math.max(width, height)
    )
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(0,10,20,0.6)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)
  },

  unmount(): void {
    fish = []
  }
}
