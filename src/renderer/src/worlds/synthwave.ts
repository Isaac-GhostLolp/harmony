import type { World, WorldContext } from './types'

/**
 * 🌆 Synthwave — full '80s retro-future: a neon sun with scanline bands sinking
 * behind wireframe mountains, an endless perspective grid scrolling toward the
 * viewer, and a starry magenta sky. The grid scroll speed and sun glow ride the
 * music; the horizon flares on impacts. Pure vaporwave nostalgia.
 */

let gridOffset = 0

export const synthwaveWorld: World = {
  id: 'synthwave',
  name: 'Synthwave',
  spectrumBins: 24,

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const horizon = height * 0.55

    // --- sky gradient (deep purple to magenta) ---
    const sky = ctx.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, '#1a0033')
    sky.addColorStop(0.6, '#3d0a4e')
    sky.addColorStop(1, '#7a1f6a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, horizon)

    // --- stars ---
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137.5) % width
      const sy = (i * 79.3) % horizon
      const tw = 0.4 + 0.6 * Math.sin(time * 2 + i)
      ctx.globalAlpha = tw * 0.6
      ctx.fillStyle = '#ffd9f5'
      ctx.fillRect(sx, sy, 1.5, 1.5)
    }
    ctx.globalAlpha = 1

    // --- neon sun with horizontal scanline gaps ---
    const sunX = width / 2
    const sunY = horizon - 20
    const sunR = Math.min(width, height) * 0.18
    const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR)
    sunGrad.addColorStop(0, '#ffd93d')
    sunGrad.addColorStop(0.5, '#ff6ec7')
    sunGrad.addColorStop(1, '#a12ba0')
    ctx.save()
    ctx.beginPath()
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = sunGrad
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2)
    // scanline gaps (thicker toward the bottom)
    ctx.fillStyle = '#1a0033'
    for (let i = 0; i < 12; i++) {
      const gy = sunY - sunR * 0.2 + i * 7
      const gh = 1 + i * 0.4
      ctx.fillRect(sunX - sunR, gy, sunR * 2, gh)
    }
    ctx.restore()
    // sun glow, pulsing with energy
    ctx.globalAlpha = 0.3 + c.energy * 0.3
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 2.5)
    glow.addColorStop(0, 'rgba(255,110,199,0.5)')
    glow.addColorStop(1, 'rgba(255,110,199,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, horizon)
    ctx.globalAlpha = 1

    // --- wireframe mountains on the horizon ---
    ctx.strokeStyle = '#ff2d95'
    ctx.lineWidth = 2
    ctx.beginPath()
    let mx = 0
    let seed = 9
    ctx.moveTo(0, horizon)
    while (mx < width) {
      const peak = 30 + ((seed * 47) % 90)
      ctx.lineTo(mx + 40, horizon - peak)
      ctx.lineTo(mx + 80, horizon)
      mx += 80
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
    }
    ctx.stroke()

    // --- ground ---
    ctx.fillStyle = '#0a0015'
    ctx.fillRect(0, horizon, width, height - horizon)

    // --- perspective grid scrolling toward viewer ---
    gridOffset += dt * (60 + c.bass * 120)
    if (gridOffset > 40) gridOffset -= 40
    ctx.strokeStyle = 'rgba(255, 45, 149, 0.6)'
    ctx.lineWidth = 1
    // horizontal lines (get closer together toward horizon)
    for (let i = 0; i < 20; i++) {
      const t = (i * 40 + gridOffset) / 800
      const y = horizon + t * t * (height - horizon)
      if (y > height) continue
      ctx.globalAlpha = Math.min(1, t * 2)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // vertical lines converging to center
    const vanishX = width / 2
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath()
      ctx.moveTo(vanishX + i * 30, horizon)
      ctx.lineTo(vanishX + i * 200, height)
      ctx.stroke()
    }

    // --- impact flare on the horizon ---
    if (c.impact > 0.01) {
      ctx.globalAlpha = c.impact * 0.4
      const flare = ctx.createLinearGradient(0, horizon - 30, 0, horizon + 30)
      flare.addColorStop(0, 'rgba(255,110,199,0)')
      flare.addColorStop(0.5, 'rgba(255,220,60,0.8)')
      flare.addColorStop(1, 'rgba(255,110,199,0)')
      ctx.fillStyle = flare
      ctx.fillRect(0, horizon - 30, width, 60)
      ctx.globalAlpha = 1
    }
  }
}
