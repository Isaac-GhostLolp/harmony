import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * 🌋 Volcano — a dark volcanic night lit by glowing lava. Embers rise and fade,
 * ash drifts down, and cracked ground pulses with molten light. The lava glow
 * swells on the kick and erupts a burst of embers on impacts. Hot, moody, alive.
 */

const embers = new ParticlePool(180)
const ash = new ParticlePool(120)

export const volcanoWorld: World = {
  id: 'volcano',
  name: 'Volcano',
  spectrumBins: 16,

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c

    // --- dark smoky sky with a red underglow ---
    const sky = ctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#100608')
    sky.addColorStop(0.6, '#1e0a08')
    sky.addColorStop(1, '#3a1005')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    // --- lava glow on the horizon, pulsing with the kick ---
    const glowY = height * 0.7
    const glow = ctx.createLinearGradient(0, glowY, 0, height)
    const heat = 0.4 + c.kick * 0.4 + c.breath * 0.1
    glow.addColorStop(0, 'rgba(255, 80, 0, 0)')
    glow.addColorStop(0.6, `rgba(255, 90, 10, ${0.3 * heat})`)
    glow.addColorStop(1, `rgba(255, 180, 40, ${0.6 * heat})`)
    ctx.fillStyle = glow
    ctx.fillRect(0, glowY, width, height - glowY)

    // --- volcanic mountain silhouettes ---
    ctx.fillStyle = '#0a0403'
    ctx.beginPath()
    ctx.moveTo(0, height)
    ctx.lineTo(0, height * 0.75)
    ctx.lineTo(width * 0.3, height * 0.45)
    ctx.lineTo(width * 0.42, height * 0.55)
    ctx.lineTo(width * 0.6, height * 0.35) // main peak
    ctx.lineTo(width * 0.78, height * 0.58)
    ctx.lineTo(width, height * 0.7)
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fill()

    // --- glowing lava cracks on the main peak ---
    ctx.strokeStyle = `rgba(255, 140, 30, ${0.6 + c.kick * 0.4})`
    ctx.lineWidth = 2
    const peakX = width * 0.6
    const peakY = height * 0.35
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(peakX, peakY)
      let lx = peakX
      let ly = peakY
      const dir = (i - 1.5) * 0.4
      for (let s = 0; s < 6; s++) {
        lx += dir * 18 + Math.sin(s + i) * 8
        ly += 22
        ctx.lineTo(lx, ly)
      }
      ctx.stroke()
    }
    // molten crater glow
    ctx.globalAlpha = 0.5 + c.kick * 0.5
    const crater = ctx.createRadialGradient(peakX, peakY, 0, peakX, peakY, 40)
    crater.addColorStop(0, '#ffd24a')
    crater.addColorStop(0.5, '#ff6a1a')
    crater.addColorStop(1, 'rgba(255,80,0,0)')
    ctx.fillStyle = crater
    ctx.beginPath()
    ctx.arc(peakX, peakY, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // --- embers rising (burst on impact) ---
    const emberRate = 2 + Math.floor(c.energy * 4) + (c.impactHit ? 20 : 0)
    for (let i = 0; i < emberRate; i++) {
      embers.spawn((p) => {
        p.x = peakX + (Math.random() - 0.5) * 60
        p.y = peakY + (Math.random() - 0.5) * 20
        p.vx = (Math.random() - 0.5) * 40
        p.vy = -40 - Math.random() * 80
        p.maxLife = 2.5 + Math.random() * 2
        p.size = 1 + Math.random() * 2.5
        p.data = Math.random()
      })
    }
    embers.each((p) => {
      p.vy += 12 * dt // slight gravity
      p.x += p.vx * dt + Math.sin(time * 3 + p.data * 10) * 6 * dt
      p.y += p.vy * dt
      const lifeT = 1 - p.life / p.maxLife
      ctx.globalAlpha = lifeT
      // color cools from yellow to red as it fades
      const g = 80 + lifeT * 140
      ctx.fillStyle = `rgb(255, ${g | 0}, 20)`
      ctx.fillRect(p.x, p.y, p.size, p.size)
    })
    ctx.globalAlpha = 1
    embers.update(dt)

    // --- ash drifting down ---
    if (ash.activeCount < 80 && Math.random() < 0.5) {
      ash.spawn((p) => {
        p.x = Math.random() * width
        p.y = -5
        p.vx = -8
        p.vy = 15 + Math.random() * 25
        p.maxLife = 12
        p.size = 0.8 + Math.random() * 1.6
        p.data = 0.15 + Math.random() * 0.25
      })
    }
    ash.each((p) => {
      p.x += Math.sin(time * 0.5 + p.y * 0.02) * 8 * dt
      p.y += p.vy * dt
      ctx.globalAlpha = p.data
      ctx.fillStyle = '#5a5048'
      ctx.fillRect(p.x, p.y, p.size, p.size)
    })
    ctx.globalAlpha = 1
    ash.update(dt)

    // --- heat shimmer / smoke haze at the top ---
    const haze = ctx.createLinearGradient(0, 0, 0, height * 0.4)
    haze.addColorStop(0, `rgba(40, 20, 15, ${0.3 + Math.sin(time * 0.4) * 0.05})`)
    haze.addColorStop(1, 'rgba(40, 20, 15, 0)')
    ctx.fillStyle = haze
    ctx.fillRect(0, 0, width, height * 0.4)
  }
}
