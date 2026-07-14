import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * ❄️ Winter — a still, elegant snowscape at night. Snowflakes drift down on a
 * gentle wind, an aurora ribbons across the sky (waving with the music), and a
 * cold haze sits over distant hills. Snow falls a touch heavier with energy;
 * the aurora brightens on the beat. Quiet and crystalline.
 */

const snow = new ParticlePool(300)

export const winterWorld: World = {
  id: 'winter',
  name: 'Winter',
  spectrumBins: 16,

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c

    // --- night sky ---
    const sky = ctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#04101f')
    sky.addColorStop(0.6, '#0a2438')
    sky.addColorStop(1, '#12384a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    // --- stars ---
    for (let i = 0; i < 60; i++) {
      const sx = (i * 137.5) % width
      const sy = (i * 53.7) % (height * 0.5)
      ctx.globalAlpha = 0.3 + 0.5 * Math.sin(time + i)
      ctx.fillStyle = '#dff2ff'
      ctx.fillRect(sx, sy, 1.5, 1.5)
    }
    ctx.globalAlpha = 1

    // --- aurora borealis (layered sine ribbons) ---
    const auroraColors = ['#3affb0', '#40e0ff', '#b060ff']
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath()
      const baseY = height * (0.18 + layer * 0.08)
      const amp = 40 + layer * 20
      for (let x = 0; x <= width; x += 12) {
        const y =
          baseY +
          Math.sin(x * 0.006 + time * 0.5 + layer) * amp +
          Math.sin(x * 0.013 - time * 0.3) * (amp * 0.4)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.lineTo(width, 0)
      ctx.lineTo(0, 0)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, baseY - amp, 0, baseY + amp * 2)
      const bright = 0.10 + c.kick * 0.10 + c.breath * 0.04
      grad.addColorStop(0, `${auroraColors[layer]}00`)
      grad.addColorStop(0.5, hexA(auroraColors[layer], bright))
      grad.addColorStop(1, `${auroraColors[layer]}00`)
      ctx.fillStyle = grad
      ctx.fill()
    }

    // --- distant snowy hills ---
    ctx.fillStyle = '#1a3a4a'
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let x = 0; x <= width; x += 40) {
      ctx.lineTo(x, height * 0.7 + Math.sin(x * 0.01) * 20)
    }
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#24506a'
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let x = 0; x <= width; x += 50) {
      ctx.lineTo(x, height * 0.82 + Math.cos(x * 0.008) * 16)
    }
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fill()

    // --- snowflakes ---
    const rate = 3 + Math.floor(c.energy * 6)
    for (let i = 0; i < rate; i++) {
      snow.spawn((p) => {
        p.x = Math.random() * width
        p.y = -5
        p.vx = -10
        p.vy = 30 + Math.random() * 50
        p.maxLife = 12
        p.size = 1 + Math.random() * 3
        p.data = Math.random() * Math.PI * 2
      })
    }
    snow.each((p) => {
      p.data += dt * 2
      p.x += Math.sin(p.data) * 15 * dt
      ctx.globalAlpha = 0.5 + p.size * 0.15
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1
    snow.update(dt)
  }
}

/** Append an alpha (0..1) to a #rrggbb hex as rgba(). */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${a})`
}
