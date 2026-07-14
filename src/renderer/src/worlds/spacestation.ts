import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * 🛰️ Space Station — the view from a panoramic window: a great planet turning
 * below, a field of stars, a slow-drifting satellite, distant nebulae, and the
 * occasional meteor streak. Station HUD ticks glow softly. The planet's city
 * lights twinkle with the music; meteors come more often with energy.
 */

const meteors = new ParticlePool(6)
let nextMeteor = 4
let starX = new Float32Array(0)
let starY = new Float32Array(0)
let starB = new Float32Array(0)

function initStars(width: number, height: number): void {
  const n = 260
  starX = new Float32Array(n)
  starY = new Float32Array(n)
  starB = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    starX[i] = Math.random() * width
    starY[i] = Math.random() * height
    starB[i] = 0.3 + Math.random() * 0.7
  }
}

export const spaceStationWorld: World = {
  id: 'space-station',
  name: 'Space Station',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    initStars(c.width, c.height)
    nextMeteor = 3 + Math.random() * 4
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    if (starX.length === 0) initStars(width, height)

    // --- deep space ---
    ctx.fillStyle = '#02040a'
    ctx.fillRect(0, 0, width, height)

    // --- nebulae (soft accent-tinted clouds) ---
    const [ar, ag, ab] = c.accent
    const clouds: [number, number, number][] = [
      [width * 0.2, height * 0.3, width * 0.4],
      [width * 0.85, height * 0.6, width * 0.45]
    ]
    for (const [x, y, r] of clouds) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(${ar},${ag},${ab},0.10)`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)
    }

    // --- stars ---
    for (let i = 0; i < starX.length; i++) {
      const tw = 0.6 + 0.4 * Math.sin(time * 2 + i)
      ctx.globalAlpha = starB[i] * tw
      ctx.fillStyle = '#eaf2ff'
      ctx.fillRect(starX[i], starY[i], 1.6, 1.6)
    }
    ctx.globalAlpha = 1

    // --- the planet, slowly turning, lower-right ---
    const px = width * 0.72
    const py = height * 0.92
    const pr = Math.min(width, height) * 0.5
    // body
    const planet = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr)
    planet.addColorStop(0, '#3a6ea5')
    planet.addColorStop(0.6, '#1e3a5f')
    planet.addColorStop(1, '#0a1628')
    ctx.fillStyle = planet
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
    // atmosphere rim
    ctx.strokeStyle = `rgba(120, 190, 255, ${0.4 + c.breath * 0.2})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.stroke()
    // city lights on the night side (twinkle with the beat)
    ctx.save()
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.clip()
    for (let i = 0; i < 60; i++) {
      const a = (i * 2.4 + time * 0.05)
      const rr = pr * (0.5 + ((i * 13) % 50) / 100)
      const lx = px + Math.cos(a) * rr
      const ly = py + Math.sin(a) * rr
      if (ly < py - pr * 0.2) continue // only lower hemisphere visible
      ctx.globalAlpha = (0.3 + 0.5 * Math.sin(time * 3 + i)) * (0.5 + c.kick * 0.5)
      ctx.fillStyle = '#ffe9a0'
      ctx.fillRect(lx, ly, 1.6, 1.6)
    }
    ctx.restore()
    ctx.globalAlpha = 1

    // --- drifting satellite ---
    const satX = ((time * 0.02) % 1.2 - 0.1) * width
    const satY = height * 0.25 + Math.sin(time * 0.1) * 20
    ctx.save()
    ctx.translate(satX, satY)
    ctx.rotate(Math.sin(time * 0.1) * 0.2)
    ctx.fillStyle = '#8a97a8'
    ctx.fillRect(-4, -4, 8, 8) // body
    ctx.fillStyle = '#2a6ec0'
    ctx.fillRect(-20, -3, 12, 6) // solar panel L
    ctx.fillRect(8, -3, 12, 6) // solar panel R
    ctx.restore()

    // --- meteors ---
    nextMeteor -= dt
    if (nextMeteor <= 0) {
      nextMeteor = 3 + Math.random() * 5 - c.energy * 1.5
      meteors.spawn((p) => {
        p.x = Math.random() * width
        p.y = -20
        p.vx = -150 - Math.random() * 100
        p.vy = 150 + Math.random() * 100
        p.maxLife = 2
        p.size = 1 + Math.random() * 1.5
        p.data = 0
      })
    }
    meteors.each((p) => {
      ctx.strokeStyle = `rgba(255,240,220,${1 - p.life / p.maxLife})`
      ctx.lineWidth = p.size
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx / 8, p.y - p.vy / 8)
      ctx.stroke()
    })
    meteors.update(dt)

    // --- station HUD frame (subtle corner ticks) ---
    ctx.strokeStyle = `rgba(120, 200, 255, ${0.25 + c.energy * 0.15})`
    ctx.lineWidth = 1.5
    const m = 24
    const L = 30
    // four corners
    const corners: [number, number, number, number][] = [
      [m, m, 1, 1],
      [width - m, m, -1, 1],
      [m, height - m, 1, -1],
      [width - m, height - m, -1, -1]
    ]
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath()
      ctx.moveTo(x, y + sy * L)
      ctx.lineTo(x, y)
      ctx.lineTo(x + sx * L, y)
      ctx.stroke()
    }
  },

  unmount(): void {
    starX = new Float32Array(0)
    starY = new Float32Array(0)
    starB = new Float32Array(0)
  }
}
