/**
 * The DJ — one animated performer every Show Pack can drop into its world.
 *
 * Drawn in a local unit space (desk top centre = 0,0; y grows downwards;
 * scale 1 ≈ a 9px head) so each pack only picks a spot, a size and a look:
 *
 *   human    — backlit silhouette with headphones and a rim light
 *   helmet   — robot/astronaut helmet with a glowing visor
 *   hologram — additive, flickering wireframe (no solid fill)
 *
 * The body is driven by the same DirectorFrame as everything else: the head
 * nods on kicks, the hands work through routines picked by the narrative
 * state (cueing on the headphones, riding faders, twisting filters in the
 * build, scratching on the drop) and a fist goes up on every impact — both
 * hands on the big ones. Zero per-frame allocations: all motion lives in
 * DJState and arm IK writes into module-level scratch values.
 */
import type { DirectorFrame } from '@/services/stageDirector'

export type DJLook = 'human' | 'helmet' | 'hologram'

export interface DJStyle {
  look: DJLook
  /** Desk half-width in local units (hands reach comfortably up to ~60). */
  deskHalf: number
  /** Draw the platters + mixer on the desk top. */
  decks: boolean
  /** Draw a booth front panel below the desk (packs with their own booth skip it). */
  booth: boolean
  /** Visor colour for the helmet look. */
  visorHue?: number
  visorSat?: number
}

const ROUTINE_CUE = 0 // one hand holds a headphone cup, the other nudges a platter
const ROUTINE_MIX = 1 // riding a channel fader, hand resting on a platter
const ROUTINE_KNOB = 2 // both hands twisting filter knobs (build tension)
const ROUTINE_SCRATCH = 3 // scratching on the left deck, chopping the crossfader

export interface DJState {
  // smoothed hand positions (local units)
  lx: number
  ly: number
  rx: number
  ry: number
  // raised-hand envelopes (>1 = holding, decays to 0)
  upL: number
  upR: number
  nextUpRight: boolean
  bob: number
  spin: number
  routine: number
  routineIdx: number
  routineTimer: number
}

export function createDJState(): DJState {
  return {
    lx: -30,
    ly: -4,
    rx: 30,
    ry: -4,
    upL: 0,
    upR: 0,
    nextUpRight: true,
    bob: 0,
    spin: 0,
    routine: ROUTINE_CUE,
    routineIdx: 0,
    routineTimer: 0
  }
}

// body proportions (local units)
const SHOULDER_X = 14
const SHOULDER_Y = -42
const HEAD_Y = -60
const HEAD_R = 8.5
const ARM = 24 // upper arm == forearm
const BOOTH_H = 34

// IK scratch output (no per-frame allocation)
let elbowX = 0
let elbowY = 0
let handX = 0
let handY = 0

/** Two-bone IK with equal segments; elbow always bends away from the body. */
function solveArm(sx: number, sy: number, tx: number, ty: number, side: number): void {
  let dx = tx - sx
  let dy = ty - sy
  let d = Math.hypot(dx, dy)
  const reach = ARM * 2 * 0.999
  if (d > reach) {
    dx *= reach / d
    dy *= reach / d
    d = reach
  }
  if (d < 1) {
    dx = side
    dy = 0
    d = 1
  }
  handX = sx + dx
  handY = sy + dy
  const h = Math.sqrt(Math.max(0, ARM * ARM - (d / 2) * (d / 2)))
  let px = -dy / d
  let py = dx / d
  // pick the perpendicular pointing outwards (and downwards when ambiguous)
  if (px * side < 0 || (Math.abs(px) < 0.15 && py < 0)) {
    px = -px
    py = -py
  }
  elbowX = sx + dx / 2 + px * h
  elbowY = sy + dy / 2 + py * h
}

function pickRoutine(dj: DJState, F: DirectorFrame): void {
  const hot = F.state === 'drop' || F.state === 'climax' || F.state === 'finale'
  dj.routineTimer += 1 / 60
  const dwell = hot ? 4 : 7
  if (F.stateJustChanged || dj.routineTimer > dwell) {
    dj.routineTimer = 0
    dj.routineIdx = F.stateJustChanged ? 0 : dj.routineIdx + 1
  }
  const alt = dj.routineIdx % 2 === 1
  if (hot) dj.routine = alt ? ROUTINE_MIX : ROUTINE_SCRATCH
  else if (F.state === 'build') dj.routine = alt ? ROUTINE_MIX : ROUTINE_KNOB
  else dj.routine = alt ? ROUTINE_MIX : ROUTINE_CUE
}

function smoothstep(v: number): number {
  const x = Math.min(1, Math.max(0, v))
  return x * x * (3 - 2 * x)
}

/**
 * Advances the DJ one frame and draws it with the desk top centred at (x, y).
 * `hue` is the pack's accent (rim light, desk LEDs, hologram colour).
 */
export function drawDJ(
  ctx: CanvasRenderingContext2D,
  dj: DJState,
  x: number,
  y: number,
  scale: number,
  hue: number,
  style: DJStyle,
  F: DirectorFrame,
  E: number
): void {
  const D = style.deskHalf
  const t = F.t
  const holo = style.look === 'hologram'

  // --- motion -------------------------------------------------------------
  pickRoutine(dj, F)
  dj.bob += (F.kickTick - dj.bob) * 0.35
  dj.spin += 0.035 + F.kickTick * 0.05
  if (F.impactHit) {
    if (F.impactLevel >= 4) {
      dj.upL = 1.5
      dj.upR = 1.5
    } else if (dj.nextUpRight) {
      dj.upR = 1.4
    } else {
      dj.upL = 1.4
    }
    dj.nextUpRight = !dj.nextUpRight
  }
  dj.upL = Math.max(0, dj.upL - 0.018)
  dj.upR = Math.max(0, dj.upR - 0.018)

  const bodyY = dj.bob * 1.6
  const headY = HEAD_Y + bodyY + dj.bob * 2.2
  const cueing = dj.routine === ROUTINE_CUE
  const tilt = F.sway * 0.06 + (cueing ? -0.16 : 0) + dj.bob * 0.05

  const platX = D * 0.6
  const platR = D * 0.26
  const platRy = platR * 0.32
  let scratchA = -Math.PI / 2
  let tlx = -platX
  let tly = -4
  let trx = platX
  let try_ = -4
  switch (dj.routine) {
    case ROUTINE_CUE: {
      tlx = -HEAD_R - 2
      tly = headY + 1
      const a = t * 0.9
      trx = platX + Math.cos(a) * platR * 0.7
      try_ = -4 + Math.sin(a) * platRy * 0.7
      break
    }
    case ROUTINE_MIX: {
      const a = t * 0.6
      tlx = -platX + Math.cos(a) * platR * 0.6
      tly = -4 + Math.sin(a) * platRy * 0.6
      trx = D * 0.08
      try_ = -6 + Math.sin(t * 0.8) * 2.5
      break
    }
    case ROUTINE_KNOB: {
      const sp = 2 + F.tension * 6
      tlx = -D * 0.08 + Math.cos(t * sp) * 1.2
      tly = -9 + Math.sin(t * sp) * 1
      trx = D * 0.08 + Math.cos(t * sp + 1.5) * 1.2
      try_ = -9 + Math.sin(t * sp + 1.5) * 1
      break
    }
    case ROUTINE_SCRATCH: {
      scratchA = -Math.PI / 2 + Math.sin(t * (7 + F.snare * 6)) * (0.5 + F.snare * 0.4)
      tlx = -platX + Math.cos(scratchA) * platR * 0.85
      tly = -4 + Math.sin(scratchA) * platRy * 0.85
      trx = (Math.sin(t * 16) > 0 ? 1 : -1) * D * 0.06
      try_ = -2
      break
    }
  }
  // fists in the air on impacts, pumping with the kick
  const wl = smoothstep(dj.upL)
  const wr = smoothstep(dj.upR)
  const pump = F.kickTick * 7
  tlx += (-22 - tlx) * wl
  tly += (-90 + pump - tly) * wl
  trx += (22 - trx) * wr
  try_ += (-90 + pump - try_) * wr
  const follow = dj.routine === ROUTINE_SCRATCH ? 0.45 : 0.18
  dj.lx += (tlx - dj.lx) * follow
  dj.ly += (tly - dj.ly) * follow
  dj.rx += (trx - dj.rx) * follow
  dj.ry += (try_ - dj.ry) * follow

  // --- colours ------------------------------------------------------------
  let alpha = 1
  if (holo) {
    const flick = Math.sin(t * 31) * Math.sin(t * 7.3)
    alpha = Math.min(1, 0.45 + E * 0.4 + F.vocals * 0.25 + flick * 0.12)
  }
  const rim = holo
    ? `hsla(${hue}, 100%, 70%, ${alpha})`
    : `hsla(${hue}, 90%, 62%, ${Math.min(1, 0.25 + E * 0.45 + F.flash * 0.3)})`
  const body = holo ? `hsla(${hue}, 100%, 60%, ${0.08 * alpha})` : '#050508'

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  if (holo) {
    ctx.globalCompositeOperation = 'lighter'
    if (F.impact > 0.4) ctx.translate(Math.sin(t * 60) * 2.5 * F.impact, 0)
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // --- torso + head (behind the desk) -------------------------------------
  ctx.save()
  ctx.translate(0, bodyY)
  ctx.rotate(F.sway * 0.025)
  ctx.beginPath()
  ctx.moveTo(-11, 2 - bodyY)
  ctx.lineTo(-15, -36)
  ctx.quadraticCurveTo(-16, -46, -7, -47)
  ctx.lineTo(7, -47)
  ctx.quadraticCurveTo(16, -46, 15, -36)
  ctx.lineTo(11, 2 - bodyY)
  ctx.closePath()
  ctx.rect(-3.5, -52, 7, 6) // neck
  ctx.strokeStyle = rim
  ctx.lineWidth = holo ? 1.4 : 2.4
  ctx.stroke()
  ctx.fillStyle = body
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(0, headY + 9)
  ctx.rotate(tilt)
  ctx.translate(0, -9)
  const helmet = style.look === 'helmet'
  const hr = helmet ? HEAD_R + 1 : HEAD_R
  ctx.beginPath()
  ctx.arc(0, 0, hr, 0, Math.PI * 2)
  ctx.strokeStyle = rim
  ctx.lineWidth = holo ? 1.4 : 2.4
  ctx.stroke()
  ctx.fillStyle = body
  ctx.fill()
  if (helmet) {
    const vh = style.visorHue ?? hue
    const vs = style.visorSat ?? 90
    ctx.fillStyle = `hsla(${vh}, ${vs}%, ${60 + F.kick * 20}%, ${0.55 + F.kick * 0.45})`
    ctx.fillRect(-hr * 0.8, -2.5, hr * 1.6, 4)
    ctx.fillStyle = `hsla(${vh}, ${vs}%, 70%, ${(0.12 + F.kick * 0.25) * (0.4 + E)})`
    ctx.fillRect(-hr * 1.1, -4.5, hr * 2.2, 8)
  } else {
    // headphones: band + cups, one cup lifted while cueing
    ctx.strokeStyle = holo ? rim : '#121218'
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.arc(0, -1, hr + 2, Math.PI + 0.35, Math.PI * 2 - 0.35)
    ctx.stroke()
    for (let s = -1; s <= 1; s += 2) {
      const cx = s * (hr + 1.2) + (cueing && s < 0 ? -1.5 : 0)
      ctx.fillStyle = holo ? body : '#141420'
      ctx.fillRect(cx - 2.4, -4, 4.8, 8.5)
      ctx.strokeStyle = rim
      ctx.lineWidth = 1
      ctx.strokeRect(cx - 2.4, -4, 4.8, 8.5)
      ctx.fillStyle = `hsla(${hue}, 100%, 65%, ${0.4 + F.kick * 0.6})`
      ctx.fillRect(cx - 0.8, -0.5, 1.6, 1.6)
    }
  }
  ctx.restore()

  // --- booth front + desk --------------------------------------------------
  if (style.booth) {
    ctx.beginPath()
    ctx.moveTo(-D - 4, 0)
    ctx.lineTo(D + 4, 0)
    ctx.lineTo(D - 4, BOOTH_H)
    ctx.lineTo(-D + 4, BOOTH_H)
    ctx.closePath()
    ctx.fillStyle = holo ? body : '#09090f'
    ctx.fill()
    ctx.strokeStyle = rim
    ctx.lineWidth = 1.5
    ctx.stroke()
    const segs = 12
    const sw = ((D - 8) * 2) / segs
    for (let i = 0; i < segs; i++) {
      const v = (F.bars[Math.floor((i / segs) * F.bars.length)] ?? 0) * (0.4 + E * 0.6)
      ctx.fillStyle = `hsla(${hue + i * 4}, 90%, 60%, ${0.12 + v * 0.8})`
      ctx.fillRect(-D + 8 + i * sw + 1, BOOTH_H * 0.45, sw - 2, 3)
    }
  }
  if (style.decks) {
    ctx.fillStyle = holo ? body : '#101018'
    ctx.fillRect(-D, -3, D * 2, 4)
    ctx.strokeStyle = rim
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-D, -3)
    ctx.lineTo(D, -3)
    ctx.stroke()
    for (let s = -1; s <= 1; s += 2) {
      const px = s * platX
      ctx.beginPath()
      ctx.ellipse(px, -4, platR, platRy, 0, 0, Math.PI * 2)
      ctx.fillStyle = holo ? body : '#0b0b12'
      ctx.fill()
      ctx.strokeStyle = `hsla(${hue}, 90%, 62%, ${0.35 + F.kickTick * 0.5})`
      ctx.stroke()
      const a = s < 0 && dj.routine === ROUTINE_SCRATCH ? scratchA * 3 : dj.spin * (s < 0 ? 1 : 1.03)
      ctx.fillStyle = `hsla(${hue}, 100%, 75%, ${0.6 + E * 0.4})`
      ctx.fillRect(px + Math.cos(a) * platR * 0.75 - 1, -4 + Math.sin(a) * platRy * 0.75 - 1, 2, 2)
    }
    // mixer with two tiny level meters
    const mw = D * 0.17
    ctx.fillStyle = holo ? body : '#0d0d16'
    ctx.fillRect(-mw, -8, mw * 2, 6)
    for (let i = 0; i < 4; i++) {
      const onL = F.kick > i * 0.22
      const onR = F.snare + F.hihats * 0.5 > i * 0.22
      const lh = i === 3 ? 0 : 120 - i * 40
      ctx.fillStyle = `hsla(${lh}, 100%, 55%, ${onL ? 0.9 : 0.12})`
      ctx.fillRect(-mw * 0.5 - 0.8, -3.5 - i * 1.2, 1.6, 0.9)
      ctx.fillStyle = `hsla(${lh}, 100%, 55%, ${onR ? 0.9 : 0.12})`
      ctx.fillRect(mw * 0.5 - 0.8, -3.5 - i * 1.2, 1.6, 0.9)
    }
  }

  // --- arms (over the desk) ------------------------------------------------
  const sy = SHOULDER_Y + bodyY
  for (let pass = 0; pass < 2; pass++) {
    if (holo && pass === 0) continue
    ctx.strokeStyle = pass === 0 ? rim : holo ? rim : '#050508'
    ctx.lineWidth = pass === 0 ? 8.6 : holo ? 1.6 : 6.2
    ctx.beginPath()
    solveArm(-SHOULDER_X, sy, dj.lx, dj.ly, -1)
    ctx.moveTo(-SHOULDER_X, sy)
    ctx.lineTo(elbowX, elbowY)
    ctx.lineTo(handX, handY)
    const lhx = handX
    const lhy = handY
    solveArm(SHOULDER_X, sy, dj.rx, dj.ry, 1)
    ctx.moveTo(SHOULDER_X, sy)
    ctx.lineTo(elbowX, elbowY)
    ctx.lineTo(handX, handY)
    ctx.stroke()
    ctx.fillStyle = pass === 0 ? rim : holo ? rim : '#0a0a10'
    const hr2 = pass === 0 ? 4.6 : 3.4
    ctx.beginPath()
    ctx.arc(lhx, lhy, hr2, 0, Math.PI * 2)
    ctx.moveTo(handX + hr2, handY)
    ctx.arc(handX, handY, hr2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
