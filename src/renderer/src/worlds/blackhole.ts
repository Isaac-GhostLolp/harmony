import type { World, WorldContext } from './types'
import { BW, BH, fbm, glowSprite, rng, sameView, toBoard, viewFor, type Layer, type View } from './kit'

/**
 * 🕳️ Black Hole — a living cosmos around a giant black hole. Inspired by
 * Interstellar: elegant, never gaudy.
 *
 * The shadow sits in the middle of a starfield that is truly lensed: the
 * stars and the Milky Way behind it are bent around the hole into an
 * Einstein ring. The accretion disc runs across it nearly edge-on, swirling,
 * hot white at the inner edge cooling to orange and deep red, brighter on the
 * side that comes toward us; its far side is bent by gravity into the halo
 * that arches over the top of the shadow (and thinly under it). A thin photon
 * ring hugs the horizon. Stars drifting behind the hole stretch into arcs as
 * they pass, cosmic dust spirals in, and a meteor crosses now and then.
 *
 * The music: the event horizon pulses on the kick, the disc spins faster
 * with the bass and burns brighter with the energy, the nebula takes the
 * song's colour, and big moments send a ripple out from the hole.
 */

// ---------------------------------------------------------------------------
// geometry (board coordinates)
// ---------------------------------------------------------------------------

const C = { x: 800, y: 440 } // the hole
const RS = 112 // shadow radius
const THETA_E = 176 // Einstein radius of the lens
const LENS_R = 560 // beyond this the lensing is negligible
const R_IN = RS * 1.3 // disc inner edge
const R_OUT = RS * 4.4 // disc outer edge
const SQUASH = 0.115 // the disc is seen almost edge-on
const TILT = -0.045
const TEX = 512 // disc texture size

// the disc's buffer: a strip around the disc, at reduced scale
const DB = { x: C.x - R_OUT - 20, y: C.y - R_OUT * SQUASH - 40, w: (R_OUT + 20) * 2, h: R_OUT * SQUASH * 2 + 80, s: 0.6 }
// the halo's buffer: a square around the shadow
const HR = RS * 1.75
const HB = { x: C.x - HR, y: C.y - HR, w: HR * 2, h: HR * 2, s: 0.7 }

// ---------------------------------------------------------------------------
// session caches (independent of screen size)
// ---------------------------------------------------------------------------

let BG: HTMLCanvasElement | null = null
let DISC: HTMLCanvasElement | null = null
let HALO_MASK: HTMLCanvasElement | null = null

/** The sky behind the hole, painted at board resolution and lensed once. */
function background(): HTMLCanvasElement {
  if (BG) return BG
  const c = document.createElement('canvas')
  c.width = BW
  c.height = BH
  const g = c.getContext('2d')!
  g.fillStyle = '#04050a'
  g.fillRect(0, 0, BW, BH)
  const r = rng(91)
  // the milky way, diagonal through the hole
  g.save()
  g.translate(C.x, C.y)
  g.rotate(-0.42)
  g.filter = 'blur(26px)'
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(${150 + r() * 60},${150 + r() * 50},${190 + r() * 50},${0.035 + r() * 0.05})`
    g.beginPath()
    g.ellipse((r() - 0.5) * 2200, (r() - 0.5) * 130, 120 + r() * 220, 26 + r() * 46, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.filter = 'blur(8px)'
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(0,0,0,${0.18 + r() * 0.22})`
    g.beginPath()
    g.ellipse((r() - 0.5) * 2000, (r() - 0.5) * 50, 50 + r() * 150, 5 + r() * 10, (r() - 0.5) * 0.3, 0, Math.PI * 2)
    g.fill()
  }
  g.filter = 'none'
  for (let i = 0; i < 1400; i++) {
    const x = (r() - 0.5) * 2200
    const y = (r() + r() + r() - 1.5) * 110
    g.fillStyle = `rgba(232,236,255,${0.12 + r() * 0.4})`
    g.fillRect(x, y, 1, 1)
  }
  g.restore()
  // a faint neutral nebula (the song's colour is added live)
  g.save()
  g.filter = 'blur(50px)'
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(${90 + r() * 60},${70 + r() * 40},${140 + r() * 60},${0.05 + r() * 0.05})`
    g.beginPath()
    g.ellipse(r() * BW, r() * BH, 160 + r() * 220, 100 + r() * 160, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  // stars
  for (let i = 0; i < 1100; i++) {
    const x = r() * BW
    const y = r() * BH
    const b = Math.pow(r(), 3)
    const tint = r()
    g.fillStyle = `rgba(${tint < 0.2 ? '255,224,196' : tint < 0.35 ? '196,214,255' : '240,244,255'},${0.2 + b * 0.8})`
    const s = b > 0.75 ? 2 : b > 0.35 ? 1.4 : 1
    g.fillRect(x, y, s, s)
  }

  // lensing: every pixel near the hole shows the sky from where its light came
  const src = g.getImageData(0, 0, BW, BH)
  const out = g.createImageData(BW, BH)
  const sd = src.data
  const od = out.data
  od.set(sd)
  const e2 = THETA_E * THETA_E
  const x0 = Math.max(0, Math.floor(C.x - LENS_R))
  const x1 = Math.min(BW, Math.ceil(C.x + LENS_R))
  const y0 = Math.max(0, Math.floor(C.y - LENS_R))
  const y1 = Math.min(BH, Math.ceil(C.y + LENS_R))
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - C.x
      const dy = y + 0.5 - C.y
      const d2 = dx * dx + dy * dy
      if (d2 > LENS_R * LENS_R) continue
      const o = (y * BW + x) * 4
      if (d2 < RS * RS) {
        od[o] = od[o + 1] = od[o + 2] = 0
        continue
      }
      // fade the effect out toward LENS_R so there is no seam
      const fade = Math.min(1, (LENS_R * LENS_R - d2) / (LENS_R * LENS_R * 0.35))
      const k = (e2 / d2) * fade
      let sx = Math.round(x - dx * k)
      let sy = Math.round(y - dy * k)
      if (sx < 0) sx = -sx
      if (sy < 0) sy = -sy
      if (sx >= BW) sx = BW * 2 - sx - 1
      if (sy >= BH) sy = BH * 2 - sy - 1
      const so = (sy * BW + sx) * 4
      od[o] = sd[so]
      od[o + 1] = sd[so + 1]
      od[o + 2] = sd[so + 2]
    }
  g.putImageData(out, 0, 0)
  BG = c
  return c
}

/** The disc seen from above: hot inner edge to cool red rim, streaked. */
function discTexture(): HTMLCanvasElement {
  if (DISC) return DISC
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const g = c.getContext('2d')!
  const img = g.createImageData(TEX, TEX)
  const d = img.data
  const h = TEX / 2
  const rin = (R_IN / R_OUT) * h
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const dx = x + 0.5 - h
      const dy = y + 0.5 - h
      const r = Math.hypot(dx, dy)
      if (r < rin * 0.92 || r > h) continue
      const t = (r - rin) / (h - rin) // 0 inner … 1 outer
      const a = Math.atan2(dy, dx)
      // streaks: varying fast across the radius, slowly around
      const n = fbm(Math.cos(a) * 1.4 + 5, Math.sin(a) * 1.4, r * 0.09, 4)
      const n2 = fbm(Math.cos(a) * 3 + 9, Math.sin(a) * 3, r * 0.03, 3)
      const streak = 0.45 + 0.9 * (n - 0.5) + 0.5 * (n2 - 0.5)
      const edgeIn = Math.min(1, Math.max(0, (r - rin * 0.92) / (rin * 0.12)))
      const prof = edgeIn * Math.pow(1 - Math.max(0, t), 1.6)
      const b = Math.max(0, prof * (0.55 + streak * 0.75))
      // temperature: white-yellow → orange → deep red
      const tt = Math.max(0, t)
      const R = 255
      const G = 236 - tt * 170
      const B = 196 - tt * 180
      const o = (y * TEX + x) * 4
      d[o] = R
      d[o + 1] = Math.max(40, G)
      d[o + 2] = Math.max(10, B)
      d[o + 3] = Math.min(255, b * 420)
    }
  g.putImageData(img, 0, 0)
  DISC = c
  return c
}

/** Where the halo shows: thick over the top, thin underneath, faint at the sides. */
function haloMask(): HTMLCanvasElement {
  if (HALO_MASK) return HALO_MASK
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  const d = img.data
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = ((x + 0.5) / S - 0.5) * 2 * HR
      const dy = ((y + 0.5) / S - 0.5) * 2 * HR
      const r = Math.hypot(dx, dy)
      const up = -dy / (r || 1) // 1 at the top, −1 at the bottom
      const outer = up > 0 ? RS * (1.08 + 0.5 * Math.pow(up, 1.5)) : RS * (1.06 + 0.16 * Math.pow(-up, 2))
      if (r < RS * 0.99 || r > outer) continue
      const t = (r - RS) / (outer - RS)
      const a = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.9 + 0.05))), 0.7) * (up > 0 ? 0.6 + up * 0.4 : 0.5 - up * 0.2)
      d[(y * S + x) * 4 + 3] = Math.max(0, Math.min(255, a * 255))
    }
  g.putImageData(img, 0, 0)
  HALO_MASK = c
  return c
}

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

interface Drifter {
  x: number // source position, relative to the hole
  y: number
  vx: number
  b: number
}

interface Dust {
  a: number
  r: number
  life: number
  b: number
}

interface State {
  v: View
  disc: HTMLCanvasElement
  halo: HTMLCanvasElement
  spin: number
  accent: Layer
  accentKey: string
  white: Layer
  warm: Layer
  drifters: Drifter[]
  dust: Dust[]
  meteor: { x: number; y: number; vx: number; vy: number; t: number }
  nextMeteor: number
  ripples: number[]
}

let S: State | null = null

const accentKeyOf = (a: [number, number, number]): string => a.map((x) => Math.round(x / 24)).join(',')

function build(c: WorldContext): State {
  const v = viewFor(c)
  background()
  discTexture()
  haloMask()
  const disc = document.createElement('canvas')
  disc.width = Math.round(DB.w * DB.s)
  disc.height = Math.round(DB.h * DB.s)
  const halo = document.createElement('canvas')
  halo.width = halo.height = Math.round(HB.w * HB.s)
  const r = rng(4)
  return {
    v,
    disc,
    halo,
    spin: 0,
    accent: glowSprite(c.accent.map((x) => Math.round(x)).join(',')),
    accentKey: accentKeyOf(c.accent),
    white: glowSprite('236,242,255', 64),
    warm: glowSprite('255,190,120', 64),
    drifters: Array.from({ length: 34 }, () => ({ x: (r() - 0.5) * 1400, y: (r() - 0.5) * 520, vx: (r() < 0.5 ? -1 : 1) * (5 + r() * 9), b: 0.4 + r() * 0.6 })),
    dust: Array.from({ length: 120 }, () => ({ a: r() * Math.PI * 2, r: R_IN + r() * (R_OUT * 1.4 - R_IN), life: r(), b: 0.2 + r() * 0.5 })),
    meteor: { x: 0, y: 0, vx: 0, vy: 0, t: -1 },
    nextMeteor: 6 + r() * 6,
    ripples: []
  }
}

/** Paints the swirling disc into its strip buffer, with the approaching side brighter. */
function paintDisc(st: State, energy: number): void {
  const g = st.disc.getContext('2d')!
  const tex = discTexture()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.clearRect(0, 0, st.disc.width, st.disc.height)
  g.setTransform(DB.s, 0, 0, DB.s, -DB.x * DB.s, -DB.y * DB.s)
  g.translate(C.x, C.y)
  g.rotate(TILT)
  g.scale(1, SQUASH)
  g.rotate(st.spin)
  g.globalAlpha = Math.min(1, 0.8 + energy * 0.3)
  g.drawImage(tex, -R_OUT, -R_OUT, R_OUT * 2, R_OUT * 2)
  g.globalAlpha = 1
  // doppler beaming: the left side comes toward us and shines; the right dims
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  const w = st.disc.width
  const beam = g.createLinearGradient(0, 0, w, 0)
  beam.addColorStop(0, 'rgba(255,250,235,0.35)')
  beam.addColorStop(0.35, 'rgba(255,240,220,0.12)')
  beam.addColorStop(0.5, 'rgba(0,0,0,0)')
  beam.addColorStop(0.7, 'rgba(20,4,0,0.3)')
  beam.addColorStop(1, 'rgba(20,4,0,0.55)')
  g.fillStyle = beam
  g.fillRect(0, 0, w, st.disc.height)
  g.globalCompositeOperation = 'source-over'
}

/** Paints the lensed far side of the disc: the halo over (and under) the shadow. */
function paintHalo(st: State): void {
  const g = st.halo.getContext('2d')!
  const S2 = st.halo.width
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.clearRect(0, 0, S2, S2)
  g.translate(S2 / 2, S2 / 2)
  g.rotate(-st.spin * 0.9)
  const k = S2 / (HR * 2)
  // scaled so the disc's hot inner edge lands right on the shadow's rim
  const rr = RS * (R_OUT / R_IN) * 0.97 * k
  g.drawImage(discTexture(), -rr, -rr, rr * 2, rr * 2)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(haloMask(), 0, 0, S2, S2)
  // the same doppler beaming as the disc
  g.globalCompositeOperation = 'source-atop'
  const beam = g.createLinearGradient(0, 0, S2, 0)
  beam.addColorStop(0, 'rgba(255,250,235,0.25)')
  beam.addColorStop(0.5, 'rgba(0,0,0,0)')
  beam.addColorStop(1, 'rgba(20,4,0,0.45)')
  g.fillStyle = beam
  g.fillRect(0, 0, S2, S2)
  g.globalCompositeOperation = 'source-over'
}

// ---------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------

export const blackHole: World = {
  id: 'blackhole',
  name: 'Black Hole',
  spectrumBins: 32,

  mount(c: WorldContext): void {
    S = build(c)
  },

  unmount(): void {
    S = null
  },

  frame(c: WorldContext): void {
    const { ctx, width, height, time, dt } = c
    const v = viewFor(c)
    if (!S || !sameView(S.v, v)) S = build(c)
    const st = S
    const ak = accentKeyOf(c.accent)
    if (ak !== st.accentKey) {
      st.accentKey = ak
      st.accent = glowSprite(c.accent.map((x) => Math.round(x)).join(','))
    }

    st.spin += dt * (0.12 + c.bass * 0.3)
    paintDisc(st, c.energy)
    paintHalo(st)

    ctx.save()
    toBoard(ctx, st.v)
    ctx.imageSmoothingEnabled = true

    // the lensed sky
    ctx.drawImage(background(), 0, 0, BW, BH)

    // the nebula takes the song's colour
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.09
    ctx.drawImage(st.accent, 80, 40, 700, 520)
    ctx.globalAlpha = 0.07
    ctx.drawImage(st.accent, 980, 360, 680, 540)

    // stars drifting behind the hole, bent into arcs as they pass
    const e2 = THETA_E * THETA_E
    for (const s of st.drifters) {
      s.x += s.vx * dt
      if (s.x > 760) s.x = -760
      if (s.x < -760) s.x = 760
      const beta = Math.hypot(s.x, s.y) || 0.01
      const ux = s.x / beta
      const uy = s.y / beta
      const root = Math.sqrt(beta * beta + 4 * e2)
      for (const sign of [1, -1]) {
        const ri = (beta + sign * root) / 2 // image radius (negative → opposite side)
        const ar = Math.abs(ri)
        if (ar < RS * 1.02) continue
        const mu = Math.min(14, 1 / Math.abs(1 - Math.pow(THETA_E / ar, 4)))
        const ix = C.x + ux * ri
        const iy = C.y + uy * ri
        const a = Math.min(1, s.b * Math.sqrt(mu) * 0.5)
        if (a < 0.04) continue
        if (mu > 1.6) {
          // stretched along the ring
          const ang = Math.atan2(iy - C.y, ix - C.x)
          const span = Math.min(0.9, (mu * 2.2) / ar)
          ctx.globalAlpha = a
          ctx.strokeStyle = 'rgba(230,238,255,1)'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(C.x, C.y, ar, ang - span / 2, ang + span / 2)
          ctx.stroke()
        } else {
          ctx.globalAlpha = a
          ctx.drawImage(st.white, ix - 4, iy - 4, 8, 8)
        }
      }
    }

    // the far half of the disc, behind the shadow
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 1
    ctx.save()
    ctx.beginPath()
    ctx.rect(DB.x, DB.y, DB.w, C.y - 2 - DB.y)
    ctx.clip()
    ctx.drawImage(st.disc, DB.x, DB.y, DB.w, DB.h)
    ctx.restore()
    // a soft glow around it all
    ctx.globalAlpha = 0.16 + c.energy * 0.1
    ctx.drawImage(st.warm, C.x - R_OUT * 1.1, C.y - 120, R_OUT * 2.2, 240)

    // the shadow: pure black, breathing on the kick
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const rs = RS * (1 + c.kick * 0.035 + c.breath * 0.01)
    const sh = ctx.createRadialGradient(C.x, C.y, rs * 0.94, C.x, C.y, rs * 1.03)
    sh.addColorStop(0, 'rgba(0,0,0,1)')
    sh.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = sh
    ctx.beginPath()
    ctx.arc(C.x, C.y, rs * 1.03, 0, Math.PI * 2)
    ctx.fill()

    // the halo: the far side of the disc, bent over the top
    ctx.globalCompositeOperation = 'lighter'
    const hs = rs / RS
    ctx.globalAlpha = 0.72 + c.energy * 0.15
    ctx.drawImage(st.halo, C.x - HR * hs, C.y - HR * hs, HR * 2 * hs, HR * 2 * hs)
    // the photon ring
    ctx.globalAlpha = 0.55 + c.kick * 0.4
    ctx.strokeStyle = 'rgba(255,226,180,1)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(C.x, C.y, rs * 1.01, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.2 + c.kick * 0.2
    ctx.lineWidth = 6
    ctx.stroke()

    // the near side of the disc, in front of the shadow
    ctx.save()
    ctx.beginPath()
    ctx.rect(DB.x, C.y - 2, DB.w, DB.h)
    ctx.clip()
    ctx.globalAlpha = 1
    ctx.drawImage(st.disc, DB.x, DB.y, DB.w, DB.h)
    ctx.restore()

    // dust spiralling in along the disc
    ctx.fillStyle = 'rgba(255,214,170,1)'
    for (const d of st.dust) {
      const w = 0.08 * Math.pow(R_OUT / d.r, 1.5) * (1 + c.bass * 0.6)
      d.a += w * dt
      d.r -= dt * (6 + 600 / d.r)
      if (d.r < R_IN * 0.95) {
        d.r = R_OUT * (0.9 + Math.random() * 0.5)
        d.a = Math.random() * Math.PI * 2
      }
      const ca = Math.cos(d.a)
      const sa = Math.sin(d.a)
      const lx = ca * d.r
      const ly = sa * d.r * SQUASH
      const x = C.x + lx * Math.cos(TILT) - ly * Math.sin(TILT)
      const y = C.y + lx * Math.sin(TILT) + ly * Math.cos(TILT)
      // hidden behind the shadow
      if (sa < 0 && Math.abs(x - C.x) < rs) continue
      ctx.globalAlpha = d.b * Math.min(1, (R_OUT * 1.4 - d.r) / 100)
      ctx.fillRect(x - 1, y - 1, 2, 2)
    }

    // a meteor now and then
    st.nextMeteor -= dt * (1 + c.energy)
    if (st.nextMeteor <= 0 && st.meteor.t < 0) {
      const left = Math.random() < 0.5
      const sp = 300 + Math.random() * 200
      st.meteor = { x: left ? -40 : BW + 40, y: 60 + Math.random() * 280, vx: (left ? 1 : -1) * sp, vy: sp * (0.15 + Math.random() * 0.2), t: 0 }
      st.nextMeteor = 8 + Math.random() * 10
    }
    if (st.meteor.t >= 0) {
      const m = st.meteor
      m.t += dt
      m.x += m.vx * dt
      m.y += m.vy * dt
      if (m.t > 4 || m.x < -100 || m.x > BW + 100) m.t = -1
      else {
        const tail = 0.16
        const lg = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail)
        lg.addColorStop(0, 'rgba(255,244,228,0.9)')
        lg.addColorStop(1, 'rgba(255,200,160,0)')
        ctx.globalAlpha = 1
        ctx.strokeStyle = lg
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail)
        ctx.stroke()
      }
    }

    // big moments send a ripple through space
    if (c.impactHit && st.ripples.length < 3) st.ripples.push(0)
    for (let i = st.ripples.length - 1; i >= 0; i--) {
      const t = (st.ripples[i] += dt)
      if (t > 3) {
        st.ripples.splice(i, 1)
        continue
      }
      const rr = RS * 1.2 + t * 320
      const a = (1 - t / 3) * 0.22
      ctx.globalAlpha = a
      ctx.strokeStyle = `rgba(${c.accent.map((x) => Math.round(x)).join(',')},1)`
      ctx.lineWidth = 10 * (1 - t / 3) + 1
      ctx.beginPath()
      ctx.ellipse(C.x, C.y, rr, rr * 0.92, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()

    // a gentle vignette
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,4,0.55)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, width, height)
  }
}
