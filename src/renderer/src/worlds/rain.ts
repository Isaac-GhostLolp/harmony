import type { World, WorldContext } from './types'
import { ParticlePool } from './types'

/**
 * 🌧️ Rain — a cozy window looking onto a blurred, rainy city at night. Drops
 * streak down the glass, distant window-lights glow and flicker, an occasional
 * lightning flash lights the scene, and the whole mood breathes with the music
 * (heavier rain on higher energy, a soft flash on big impacts). Made for lo-fi.
 *
 * Two particle systems: falling rain (fast, thin) and glass trails (drops that
 * cling and slide down the "window"). Both pooled; one rAF via ThemeDirector.
 */

const rain = new ParticlePool(320)
const trails = new ParticlePool(90)

// city light windows (static-ish, twinkle), generated on mount
let lights: { x: number; y: number; hue: number; phase: number; size: number }[] = []
let flash = 0
let nextFlash = 6

function initLights(w: number, h: number): void {
  lights = []
  const rows = 7
  const cols = 26
  const cityTop = h * 0.35
  const cityBottom = h * 0.72
  for (let i = 0; i < rows * cols; i++) {
    if (Math.random() > 0.55) continue // only some windows are lit
    const cx = (i % cols) / cols
    const cy = (Math.floor(i / cols) / rows)
    lights.push({
      x: cx * w + (Math.random() - 0.5) * 12,
      y: cityTop + cy * (cityBottom - cityTop) + (Math.random() - 0.5) * 8,
      hue: 30 + Math.random() * 30, // warm amber city glow
      phase: Math.random() * Math.PI * 2,
      size: 2 + Math.random() * 3
    })
  }
}

export const rainWorld: World = {
  id: 'rain',
  name: 'Rain',
  spectrumBins: 16,

  mount(c: WorldContext): void {
    initLights(c.width, c.height)
    flash = 0
    nextFlash = 4 + Math.random() * 6
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c

    // regenerate city if the canvas size changed a lot
    if (lights.length === 0) initLights(width, height)

    // --- sky / background gradient (deep night blue) ---
    const sky = ctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#0a0f1a')
    sky.addColorStop(0.5, '#10131f')
    sky.addColorStop(1, '#070810')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    // --- blurred city silhouette ---
    ctx.fillStyle = 'rgba(8, 10, 18, 0.9)'
    const cityBase = height * 0.72
    let bx = 0
    let seed = 1
    while (bx < width) {
      const bw = 40 + ((seed * 53) % 60)
      const bh = 60 + ((seed * 97) % 180)
      ctx.fillRect(bx, cityBase - bh, bw, bh + 4)
      bx += bw + 6
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
    }

    // --- city lights (twinkle, brighten on flash) ---
    for (const L of lights) {
      const tw = 0.5 + 0.5 * Math.sin(time * 1.5 + L.phase)
      const a = (0.25 + tw * 0.5) * (1 + flash * 2)
      ctx.fillStyle = `hsla(${L.hue}, 80%, 62%, ${Math.min(1, a)})`
      ctx.fillRect(L.x, L.y, L.size, L.size * 1.4)
    }

    // --- lightning flash ---
    nextFlash -= dt
    if (nextFlash <= 0) {
      flash = 1
      nextFlash = 7 + Math.random() * 10 - c.energy * 3
    }
    if (c.impactHit && Math.random() < 0.3) flash = Math.max(flash, 0.7)
    flash = Math.max(0, flash - dt * 2.5)
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(180, 200, 255, ${flash * 0.18})`
      ctx.fillRect(0, 0, width, height)
    }

    // --- falling rain (density rises with energy) ---
    const spawnRate = 6 + Math.floor(c.energy * 10)
    for (let i = 0; i < spawnRate; i++) {
      rain.spawn((p) => {
        p.x = Math.random() * (width + 200) - 100
        p.y = -10
        p.vx = -120 // slight wind slant
        p.vy = 700 + Math.random() * 400
        p.maxLife = 2
        p.size = 0.8 + Math.random() * 0.8
        p.data = 0.2 + Math.random() * 0.4
      })
    }
    ctx.strokeStyle = 'rgba(150, 180, 220, 0.35)'
    ctx.lineWidth = 1
    rain.each((p) => {
      ctx.globalAlpha = p.data
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + p.vx * 0.02, p.y + p.vy * 0.02)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
    rain.update(dt)

    // --- glass drops that cling and slide (the "window" foreground) ---
    if (trails.activeCount < 60 && Math.random() < 0.4) {
      trails.spawn((p) => {
        p.x = Math.random() * width
        p.y = Math.random() * height * 0.5
        p.vx = 0
        p.vy = 0
        p.maxLife = 4 + Math.random() * 4
        p.size = 1.5 + Math.random() * 3
        p.data = 0
      })
    }
    trails.each((p) => {
      // drops build up then slide down with gravity, wobbling slightly
      p.data += dt
      if (p.data > 0.8 + p.size * 0.1) {
        p.vy += 60 * dt
        p.x += Math.sin(p.y * 0.05) * 8 * dt
      }
      p.y += p.vy * dt
      const alpha = 0.10 + p.size * 0.03
      ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, p.size * 0.6, p.size, 0, 0, Math.PI * 2)
      ctx.fill()
      // highlight
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`
      ctx.fillRect(p.x - p.size * 0.2, p.y - p.size * 0.4, p.size * 0.25, p.size * 0.5)
    })
    trails.update(dt)

    // --- cozy vignette + warm reflection glow from below ---
    const vign = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75
    )
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, width, height)

    const [ar, ag, ab] = c.accent
    const warm = ctx.createLinearGradient(0, height, 0, height * 0.7)
    warm.addColorStop(0, `rgba(${ar},${ag},${ab},${0.06 + c.breath * 0.03})`)
    warm.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = warm
    ctx.fillRect(0, height * 0.7, width, height * 0.3)
  },

  unmount(): void {
    lights = []
  }
}
