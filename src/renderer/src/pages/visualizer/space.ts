/**
 * 🚀 Space Odyssey — a show on the deck of a space station.
 *
 * Deep space with a nebula and a band of stars; a great ringed planet hangs
 * on one side, and on the other the station's wheel turns slowly, its spokes
 * and lit windows catching the light. The show happens on the station's
 * open deck: metal plates running to the edge, two light masts with moving
 * heads, and a round DJ pod with a glowing ring in the middle (the DJ wears
 * a helmet). The crowd are astronauts, visors catching the lights.
 *
 * The starfield drifts in calm moments and goes to warp on the drops,
 * streaking past; cosmic beams shoot up from the pod, the deck's light
 * strips pulse on the kick, comets cross the sky on impacts and the biggest
 * hits flash the whole sky like a jump to hyperspace.
 *
 * Zero per-frame allocations: pools live in SpaceState; everything static is
 * painted once into cached layers.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import { drawDJ, type DJStyle } from './dj'
import { drawParticles, spawnBurst, type SceneState } from './packs'
import { airLight, beam, crowd, createLayerCache, glowSprite, isHot, laser, layer, rng, type LayerCache } from './stagekit'

const STARS = 280
const SF = 3 // x, y (−0.5..0.5), z
const COMETS = 3
const CMF = 5 // x, y, vx, vy, life

const DJ_ASTRO: DJStyle = { look: 'helmet', deskHalf: 52, decks: true, booth: false, visorHue: 200, visorSat: 80 }

export interface SpaceState {
  cache: LayerCache
  white: HTMLCanvasElement | null
  blue: HTMLCanvasElement | null
  warm: HTMLCanvasElement | null
  stars: Float32Array
  warp: number
  wheel: number
  comets: Float32Array
  jump: number
  tilt: number
}

export function createSpaceState(): SpaceState {
  const stars = new Float32Array(STARS * SF)
  const r = rng(9)
  for (let i = 0; i < STARS; i++) {
    stars[i * SF] = r() - 0.5
    stars[i * SF + 1] = r() - 0.5
    stars[i * SF + 2] = 0.05 + r() * 0.95
  }
  return { cache: createLayerCache(), white: null, blue: null, warm: null, stars, warp: 0, wheel: 0, comets: new Float32Array(COMETS * CMF), jump: 0, tilt: 0.5 }
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

interface Geo {
  vx: number
  vy: number
  deckY: number // far edge of the deck
  podY: number
  podR: number
  planetX: number
  planetY: number
  planetR: number
  wheelX: number
  wheelY: number
  wheelR: number
  mastL: number
  mastR: number
  mastTop: number
}

function geo(W: number, H: number): Geo {
  const m = Math.min(W, H * 1.6)
  return {
    vx: W / 2,
    vy: H * 0.4,
    deckY: H * 0.66,
    podY: H * 0.755,
    podR: W * 0.13,
    planetX: W * 0.2,
    planetY: H * 0.3,
    planetR: m * 0.15,
    wheelX: W * 0.74,
    wheelY: H * 0.27,
    wheelR: m * 0.2,
    mastL: W * 0.13,
    mastR: W * 0.87,
    mastTop: H * 0.2
  }
}

// ---------------------------------------------------------------------------
// static painters
// ---------------------------------------------------------------------------

function paintSpace(g: CanvasRenderingContext2D, W: number, H: number): void {
  const G = geo(W, H)
  g.fillStyle = '#01020a'
  g.fillRect(0, 0, W, H)
  const r = rng(17)
  // the nebula
  g.save()
  g.filter = `blur(${Math.round(H * 0.05)}px)`
  const neb: [number, number, string][] = [
    [0.55, 0.22, '120,60,200'],
    [0.42, 0.35, '40,120,200'],
    [0.66, 0.4, '200,60,150'],
    [0.5, 0.18, '60,40,140']
  ]
  for (const [nx, ny, c] of neb)
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(${c},${0.06 + r() * 0.07})`
      g.beginPath()
      g.ellipse(W * (nx + (r() - 0.5) * 0.15), H * (ny + (r() - 0.5) * 0.12), W * (0.08 + r() * 0.12), H * (0.06 + r() * 0.08), r() * 3, 0, Math.PI * 2)
      g.fill()
    }
  // dark dust lanes
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.2})`
    g.beginPath()
    g.ellipse(W * (0.4 + r() * 0.3), H * (0.2 + r() * 0.2), W * (0.06 + r() * 0.08), H * 0.012, -0.3 + r() * 0.2, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  // a band of faint stars
  g.save()
  g.translate(W / 2, H * 0.3)
  g.rotate(-0.35)
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(220,230,255,${0.1 + r() * 0.35})`
    g.fillRect((r() - 0.5) * W * 1.6, (r() + r() + r() - 1.5) * H * 0.12, 1, 1)
  }
  g.restore()
  for (let i = 0; i < 300; i++) {
    const b = Math.pow(r(), 3)
    g.fillStyle = `rgba(${r() < 0.2 ? '255,226,200' : r() < 0.3 ? '200,214,255' : '240,244,255'},${0.2 + b * 0.8})`
    const s = b > 0.7 ? 1.8 : 1.1
    g.fillRect(r() * W, r() * G.deckY, s, s)
  }

}

/** The ringed planet (its own layer, so the warping stars pass behind it). */
function paintPlanet(g: CanvasRenderingContext2D, W: number, H: number): void {
  const G = geo(W, H)
  const r = rng(23)
  // back half of the rings, the globe, the front half
  const px = G.planetX
  const py = G.planetY
  const pr = G.planetR
  const ring = (front: boolean): void => {
    g.save()
    g.translate(px, py)
    g.rotate(-0.32)
    g.beginPath()
    if (front) g.rect(-pr * 3, 0, pr * 6, pr * 2)
    else g.rect(-pr * 3, -pr * 2, pr * 6, pr * 2)
    g.clip()
    for (let k = 0; k < 9; k++) {
      const rr = pr * (1.35 + k * 0.1)
      g.strokeStyle = `rgba(${200 - k * 6},${180 - k * 8},${150 - k * 6},${0.12 + ((k * 37) % 10) / 40})`
      g.lineWidth = pr * 0.06
      g.beginPath()
      g.ellipse(0, 0, rr, rr * 0.24, 0, 0, Math.PI * 2)
      g.stroke()
    }
    g.restore()
  }
  ring(false)
  g.save()
  g.beginPath()
  g.arc(px, py, pr, 0, Math.PI * 2)
  g.clip()
  const body = g.createLinearGradient(px - pr, py - pr, px + pr, py + pr)
  body.addColorStop(0, '#d9b98a')
  body.addColorStop(1, '#8a5e3c')
  g.fillStyle = body
  g.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  g.translate(px, py)
  g.rotate(-0.32)
  g.filter = `blur(${Math.max(1, Math.round(pr * 0.02))}px)`
  for (let b = 0; b < 16; b++) {
    const y = -pr + (b / 16) * pr * 2
    g.fillStyle = b % 2 ? `rgba(120,70,40,${0.15 + r() * 0.2})` : `rgba(250,220,180,${0.1 + r() * 0.15})`
    g.fillRect(-pr * 1.2, y, pr * 2.4, (pr * 2) / 16 + r() * pr * 0.05)
  }
  g.filter = 'none'
  g.restore()
  g.save()
  g.beginPath()
  g.arc(px, py, pr, 0, Math.PI * 2)
  g.clip()
  // night side
  const shade = g.createRadialGradient(px - pr * 0.5, py - pr * 0.4, pr * 0.2, px - pr * 0.2, py - pr * 0.1, pr * 1.5)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(0.6, 'rgba(0,0,10,0.35)')
  shade.addColorStop(1, 'rgba(0,0,10,0.92)')
  g.fillStyle = shade
  g.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  g.restore()
  // thin atmosphere on the lit limb
  g.strokeStyle = 'rgba(255,220,180,0.25)'
  g.lineWidth = 2
  g.beginPath()
  g.arc(px, py, pr, Math.PI * 0.9, Math.PI * 1.6)
  g.stroke()
  ring(true)
  // a small moon
  g.fillStyle = '#9a9aa8'
  g.beginPath()
  g.arc(px + pr * 2.2, py - pr * 0.9, pr * 0.12, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(0,0,10,0.6)'
  g.beginPath()
  g.arc(px + pr * 2.25, py - pr * 0.88, pr * 0.11, 0, Math.PI * 2)
  g.fill()
}

function paintDeck(g: CanvasRenderingContext2D, W: number, H: number): void {
  const G = geo(W, H)
  // the deck plate
  const deck = g.createLinearGradient(0, G.deckY, 0, H)
  deck.addColorStop(0, '#1a1e2a')
  deck.addColorStop(0.3, '#10131c')
  deck.addColorStop(1, '#06070c')
  g.fillStyle = deck
  g.beginPath()
  g.moveTo(-10, G.deckY + H * 0.02)
  g.lineTo(W * 0.2, G.deckY)
  g.lineTo(W * 0.8, G.deckY)
  g.lineTo(W + 10, G.deckY + H * 0.02)
  g.lineTo(W + 10, H + 10)
  g.lineTo(-10, H + 10)
  g.closePath()
  g.fill()
  // panel seams running toward the vanishing point, and cross seams
  g.strokeStyle = 'rgba(0,0,0,0.55)'
  g.lineWidth = 1
  g.beginPath()
  for (let k = -10; k <= 10; k++) {
    const x0 = G.vx + k * W * 0.03
    const t = (G.deckY - G.vy) / (H - G.vy)
    g.moveTo(G.vx + (x0 - G.vx) * t * 3.2, G.deckY)
    g.lineTo(G.vx + (x0 - G.vx) * 3.2, H)
  }
  for (let j = 1; j < 6; j++) {
    const y = G.deckY + (H - G.deckY) * Math.pow(j / 6, 1.6)
    g.moveTo(0, y)
    g.lineTo(W, y)
  }
  g.stroke()
  g.strokeStyle = 'rgba(160,190,230,0.06)'
  g.beginPath()
  for (let j = 1; j < 6; j++) {
    const y = G.deckY + (H - G.deckY) * Math.pow(j / 6, 1.6) + 1
    g.moveTo(0, y)
    g.lineTo(W, y)
  }
  g.stroke()
  // the deck's edge, with a low railing
  g.fillStyle = '#2a3040'
  g.fillRect(W * 0.2, G.deckY - 2, W * 0.6, 3)
  g.strokeStyle = 'rgba(150,180,220,0.35)'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(-10, G.deckY + H * 0.02 - H * 0.03)
  g.lineTo(W * 0.2, G.deckY - H * 0.03)
  g.lineTo(W * 0.8, G.deckY - H * 0.03)
  g.lineTo(W + 10, G.deckY + H * 0.02 - H * 0.03)
  g.stroke()
  for (let i = 0; i <= 16; i++) {
    const x = W * 0.2 + (i / 16) * W * 0.6
    g.beginPath()
    g.moveTo(x, G.deckY - H * 0.03)
    g.lineTo(x, G.deckY)
    g.stroke()
  }
  // the light masts
  for (const x of [G.mastL, G.mastR]) {
    const base = G.deckY + H * 0.06
    g.fillStyle = '#141824'
    g.fillRect(x - W * 0.006, G.mastTop, W * 0.012, base - G.mastTop)
    g.strokeStyle = '#232a3a'
    g.lineWidth = 1
    for (let y = G.mastTop + 8; y < base; y += 14) {
      g.beginPath()
      g.moveTo(x - W * 0.006, y)
      g.lineTo(x + W * 0.006, y + 7)
      g.stroke()
    }
    g.fillStyle = '#1c2230'
    g.fillRect(x - W * 0.035, G.mastTop - 3, W * 0.07, 6)
  }
  // the DJ pod
  g.fillStyle = '#0e1220'
  g.beginPath()
  g.ellipse(G.vx, G.podY + H * 0.025, G.podR, G.podR * 0.2, 0, 0, Math.PI)
  g.lineTo(G.vx - G.podR, G.podY)
  g.ellipse(G.vx, G.podY, G.podR, G.podR * 0.2, 0, Math.PI, 0, true)
  g.closePath()
  g.fill()
  const top = g.createLinearGradient(0, G.podY - G.podR * 0.2, 0, G.podY + G.podR * 0.2)
  top.addColorStop(0, '#2a3248')
  top.addColorStop(1, '#151a28')
  g.fillStyle = top
  g.beginPath()
  g.ellipse(G.vx, G.podY, G.podR, G.podR * 0.2, 0, 0, Math.PI * 2)
  g.fill()
}

// ---------------------------------------------------------------------------
// live parts
// ---------------------------------------------------------------------------

function drawWheel(ctx: CanvasRenderingContext2D, G: Geo, F: DirectorFrame, sp: SpaceState, E: number): void {
  const R = G.wheelR
  const tilt = 0.34
  ctx.save()
  ctx.translate(G.wheelX, G.wheelY)
  ctx.rotate(0.18)
  // spokes and hub
  ctx.strokeStyle = '#2a3142'
  ctx.lineWidth = R * 0.03
  for (let s = 0; s < 6; s++) {
    const a = sp.wheel + (s / 6) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R * tilt)
    ctx.stroke()
  }
  ctx.fillStyle = '#323a4e'
  ctx.beginPath()
  ctx.ellipse(0, 0, R * 0.12, R * 0.12 * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1b2030'
  ctx.fillRect(-R * 0.02, -R * 0.35, R * 0.04, R * 0.35)
  // the rim: a thick tube in two tones (lit top, shaded bottom)
  ctx.lineWidth = R * 0.07
  ctx.strokeStyle = '#3c4458'
  ctx.beginPath()
  ctx.ellipse(0, 0, R, R * tilt, 0, Math.PI, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#232838'
  ctx.beginPath()
  ctx.ellipse(0, 0, R, R * tilt, 0, 0, Math.PI)
  ctx.stroke()
  // modules and windows going round
  for (let i = 0; i < 36; i++) {
    const a = sp.wheel + (i / 36) * Math.PI * 2
    const x = Math.cos(a) * R
    const y = Math.sin(a) * R * tilt
    const front = Math.sin(a) > 0
    if (i % 6 === 0) {
      ctx.fillStyle = front ? '#2c3346' : '#3e475e'
      ctx.fillRect(x - R * 0.05, y - R * 0.04, R * 0.1, R * 0.08)
    }
    const on = Math.sin(F.t * 1.7 + i * 2.3) > 0.1 - F.hihats * 0.8
    ctx.fillStyle = on ? `rgba(255,220,160,${0.5 + E * 0.4})` : 'rgba(255,220,160,0.08)'
    ctx.fillRect(x - 1, y - 1, 2, 2)
  }
  ctx.restore()
  // a blinking beacon on the hub mast
  if (Math.sin(F.t * 2.6) > 0.7) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(sp.warm!, G.wheelX - 6, G.wheelY - R * 0.37 - 6, 12, 12)
    ctx.restore()
  }
}

function drawStars(ctx: CanvasRenderingContext2D, W: number, H: number, G: Geo, F: DirectorFrame, sp: SpaceState, E: number): void {
  const st = sp.stars
  const cx = G.vx
  const cy = G.vy * 0.9
  const speed = 0.0015 + F.energy / 9000 + sp.warp * 0.025
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let i = 0; i < STARS; i++) {
    const o = i * SF
    let z = st[o + 2] - speed
    if (z <= 0.03) {
      st[o] = Math.random() - 0.5
      st[o + 1] = Math.random() - 0.5
      z = 1
    }
    st[o + 2] = z
    const sx = cx + (st[o] * W) / z
    const sy = cy + (st[o + 1] * H) / z
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > G.deckY) continue
    const b = Math.min(1, (1 - z) * 1.3) * (0.5 + E * 0.5)
    const size = (1 - z) * 2.2 + 0.4
    if (sp.warp > 0.1) {
      // streaks pointing away from the centre
      const pz = z + speed * (4 + sp.warp * 14)
      const px = cx + (st[o] * W) / pz
      const py = cy + (st[o + 1] * H) / pz
      ctx.strokeStyle = `hsla(${(F.palette.a + 360) % 360}, 60%, ${80 + (1 - z) * 15}%, ${b})`
      ctx.lineWidth = size * 0.7
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(sx, sy)
      ctx.stroke()
    } else {
      ctx.fillStyle = `rgba(230,238,255,${b})`
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size)
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the pack
// ---------------------------------------------------------------------------

export function drawSpace(ctx: CanvasRenderingContext2D, W: number, H: number, F: DirectorFrame, S: SceneState, E: number): void {
  const sp = S.space
  const G = geo(W, H)
  const k = H / 600
  const t = F.t
  const hot = isHot(F)
  if (!sp.white) {
    sp.white = glowSprite('235,242,255')
    sp.blue = glowSprite('110,180,255')
    sp.warm = glowSprite('255,120,80')
  }
  // warp on the drops, drifting otherwise
  sp.warp += ((hot ? 0.6 + F.impact * 0.4 : F.state === 'build' ? F.tension * 0.3 : 0) - sp.warp) * 0.04
  sp.wheel += 0.0012 + F.energy / 40000
  sp.tilt += ((hot ? 0 : F.state === 'build' ? 1 : 0.5) - sp.tilt) * 0.03
  if (F.impactLevel >= 5 || (F.stateJustChanged && F.state === 'drop')) sp.jump = 1
  sp.jump = Math.max(0, sp.jump - 1 / 30)
  if (F.impactHit) {
    for (let i = 0; i < COMETS; i++) {
      const o = i * CMF
      if (sp.comets[o + 4] > 0) continue
      const fromLeft = Math.random() < 0.5
      sp.comets[o] = fromLeft ? -0.05 : 1.05
      sp.comets[o + 1] = 0.05 + Math.random() * 0.3
      sp.comets[o + 2] = (fromLeft ? 1 : -1) * (0.006 + Math.random() * 0.006)
      sp.comets[o + 3] = 0.002 + Math.random() * 0.003
      sp.comets[o + 4] = 1
      break
    }
  }

  // --- space ----------------------------------------------------------------
  ctx.drawImage(layer(sp.cache, 'space', W, H, (g) => paintSpace(g, W, H)), 0, 0, W, H)
  // the nebula glows in the show's colour
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const ng = ctx.createRadialGradient(W * 0.55, H * 0.28, 0, W * 0.55, H * 0.28, W * 0.35)
  ng.addColorStop(0, `hsla(${F.palette.a}, 70%, 55%, ${(0.08 + F.vocals * 0.06) * (0.5 + E * 0.5)})`)
  ng.addColorStop(1, 'hsla(0,0%,0%,0)')
  ctx.fillStyle = ng
  ctx.fillRect(W * 0.2, 0, W * 0.7, H * 0.65)
  ctx.restore()
  drawStars(ctx, W, H, G, F, sp, E)
  ctx.drawImage(layer(sp.cache, 'planet', W, H, (g) => paintPlanet(g, W, H)), 0, 0, W, H)
  drawWheel(ctx, G, F, sp, E)

  // comets
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < COMETS; i++) {
    const o = i * CMF
    if (sp.comets[o + 4] <= 0) continue
    sp.comets[o] += sp.comets[o + 2]
    sp.comets[o + 1] += sp.comets[o + 3]
    sp.comets[o + 4] -= 1 / 200
    const x = sp.comets[o] * W
    const y = sp.comets[o + 1] * H
    const tx = x - sp.comets[o + 2] * W * 22
    const ty = y - sp.comets[o + 3] * H * 22
    const lg = ctx.createLinearGradient(x, y, tx, ty)
    lg.addColorStop(0, `rgba(220,240,255,${sp.comets[o + 4]})`)
    lg.addColorStop(1, 'rgba(120,180,255,0)')
    ctx.strokeStyle = lg
    ctx.lineWidth = 2.2 * k
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.globalAlpha = sp.comets[o + 4]
    ctx.drawImage(sp.white!, x - 8 * k, y - 8 * k, 16 * k, 16 * k)
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // --- the deck ---------------------------------------------------------------
  ctx.drawImage(layer(sp.cache, 'deck', W, H, (g) => paintDeck(g, W, H)), 0, 0, W, H)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // light strips along the deck pulse on the kick, rolling toward us
  for (let j = 1; j < 6; j++) {
    const y = G.deckY + (H - G.deckY) * Math.pow(j / 6, 1.6) + 1
    const pulse = Math.max(0, Math.sin(t * 3 - j * 0.9)) * 0.3 + F.kickTick * 0.5
    ctx.fillStyle = `hsla(${F.palette.a}, 80%, 65%, ${pulse * (0.3 + E * 0.6)})`
    ctx.fillRect(0, y - 0.5, W, 1.5)
  }
  // deck uplights
  for (let i = 0; i < F.floors.length; i++) {
    const fl = F.floors[i]
    if (fl.intensity < 0.03) continue
    const x = W / 2 + fl.aim * W * 0.42
    ctx.globalAlpha = fl.intensity * 0.5
    ctx.drawImage(sp.blue!, x - W * 0.05, G.deckY - H * 0.02, W * 0.1, H * 0.08)
  }
  ctx.globalAlpha = 1
  // the pod's ring
  ctx.strokeStyle = `hsla(${F.palette.a}, 90%, 65%, ${(0.45 + F.kickTick * 0.5) * (0.4 + E * 0.6)})`
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.ellipse(G.vx, G.podY, G.podR * 0.98, G.podR * 0.2, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = `hsla(${F.palette.b}, 90%, 65%, ${(0.3 + F.vocals * 0.4) * (0.4 + E * 0.6)})`
  ctx.beginPath()
  ctx.ellipse(G.vx, G.podY + G.podR * 0.12, G.podR, G.podR * 0.2, 0, 0, Math.PI)
  ctx.stroke()
  ctx.restore()

  // the astronaut DJ
  drawDJ(ctx, S.djs[0], G.vx, G.podY - 4 * k, H / 560, F.palette.a, DJ_ASTRO, F, E)

  // --- light ------------------------------------------------------------------
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const n = F.beams.length
  for (let i = 0; i < n; i++) {
    const fb = F.beams[i]
    const left = i < n / 2
    const j = left ? i : i - n / 2
    const x = (left ? G.mastL : G.mastR) + (j - (n / 4 - 0.5)) * W * 0.014
    const downX = W / 2 + fb.aim * W * 0.75
    const upX = W / 2 + fb.aim * W * 1.1
    const tx = downX + (upX - downX) * sp.tilt
    const ty = H * 1.05 + (-H * 0.3 - H * 1.05) * sp.tilt
    beam(ctx, x, G.mastTop + 4, tx, ty, (F.palette.a + fb.hueOffset * 0.3) % 360, 80, 65 + F.flash * 20, fb.intensity * (0.45 + E * 0.5), hot ? 0.045 : 0.07)
  }
  for (let i = 0; i < F.spots.length; i++) {
    const s = F.spots[i]
    beam(ctx, i === 0 ? G.mastL : i === 1 ? G.mastR : G.vx, i === 2 ? 0 : G.mastTop, G.vx + s.aim * W * 0.05, G.podY - 30 * k, 210, 30, 85, s.intensity * 0.45, 0.05)
  }
  // cosmic beams up from the pod into space
  const len = Math.max(W, H) * 1.4
  for (let i = 0; i < F.lasers.length; i++) {
    const lz = F.lasers[i]
    laser(ctx, G.vx + (i - F.lasers.length / 2 + 0.5) * W * 0.012, G.podY - 2, -Math.PI / 2 + lz.angle, len, lz.hue, lz.intensity, 1.2)
  }
  // the air (and the deck) take the light
  const lit = airLight(F)
  if (lit > 0.05) {
    ctx.globalAlpha = Math.min(0.4, lit * 0.2)
    ctx.drawImage(sp.blue!, W * 0.1, G.deckY - H * 0.1, W * 0.8, H * 0.4)
    ctx.globalAlpha = 1
  }
  // the jump: a flash from the centre of the stars
  if (sp.jump > 0.02) {
    ctx.globalAlpha = sp.jump * 0.6
    ctx.drawImage(sp.white!, G.vx - W * 0.6, G.vy * 0.9 - W * 0.6, W * 1.2, W * 1.2)
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // the crowd of astronauts
  crowd(ctx, W, H, F, E, {
    fill: 'rgba(14,16,24,0.97)',
    top: H * 0.12,
    heads: 22,
    helmets: true,
    light: (x, y, i) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.6
      const s = 7 * k
      ctx.drawImage(i % 3 ? sp.blue! : sp.white!, x - s, y - s, s * 2, s * 2)
      ctx.restore()
    }
  })

  drawParticles(ctx, S)
  if (F.impactHit) spawnBurst(S, G.vx, G.podY - 60 * k, 16 + F.impact * 18, F.palette.b, 1.2)
}
